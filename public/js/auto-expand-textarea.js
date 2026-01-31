/**
 * Auto-expanding textarea for mobile chat input
 * Expands as user types, up to max-height
 */

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAutoExpand);
    } else {
        initAutoExpand();
    }

    function initAutoExpand() {
        const textarea = document.getElementById('user-input');

        if (!textarea) {
            console.log('Textarea not found for auto-expand');
            return;
        }

        /**
         * Auto-expand textarea based on content
         */
        function autoExpand() {
            // Reset height to auto to get the correct scrollHeight
            textarea.style.height = 'auto';

            // Get the scroll height (content height)
            const scrollHeight = textarea.scrollHeight;

            // Get computed styles to access CSS variables
            const computedStyle = window.getComputedStyle(textarea);
            const minHeight = parseInt(computedStyle.minHeight) || 44;
            const maxHeight = parseInt(computedStyle.maxHeight) || 120;

            // Set height to content height, respecting min/max bounds
            if (scrollHeight <= minHeight) {
                textarea.style.height = minHeight + 'px';
                textarea.style.overflowY = 'hidden';
            } else if (scrollHeight >= maxHeight) {
                textarea.style.height = maxHeight + 'px';
                textarea.style.overflowY = 'auto';
            } else {
                textarea.style.height = scrollHeight + 'px';
                textarea.style.overflowY = 'hidden';
            }
        }

        /**
         * Reset textarea to initial height
         */
        function resetHeight() {
            textarea.style.height = 'auto';
            const computedStyle = window.getComputedStyle(textarea);
            const minHeight = parseInt(computedStyle.minHeight) || 44;
            textarea.style.height = minHeight + 'px';
            textarea.style.overflowY = 'hidden';
        }

        // Auto-expand on input
        textarea.addEventListener('input', autoExpand);

        // Auto-expand on paste
        textarea.addEventListener('paste', function() {
            // Use setTimeout to allow paste content to be inserted first
            setTimeout(autoExpand, 0);
        });

        // Handle when user sends message (reset height)
        const sendButton = document.getElementById('send-button');
        if (sendButton) {
            sendButton.addEventListener('click', function() {
                // Reset after a short delay to allow message to be processed
                setTimeout(resetHeight, 100);
            });
        }

        // Handle Enter key (non-shift) sends message
        textarea.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                // Let the default handler send the message
                // Then reset height
                setTimeout(resetHeight, 100);
            }
        });

        // Reset on form reset or clear
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'value') {
                    if (textarea.value === '') {
                        resetHeight();
                    }
                }
            });
        });

        // Observe textarea value changes
        observer.observe(textarea, {
            attributes: true,
            attributeFilter: ['value']
        });

        // Also reset when textarea is cleared programmatically
        // Only apply custom value property to actual textarea elements
        if (textarea.tagName === 'TEXTAREA') {
            const originalValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
            Object.defineProperty(textarea, 'value', {
                get: function() {
                    return originalValue.get.call(this);
                },
                set: function(newValue) {
                    originalValue.set.call(this, newValue);
                    if (newValue === '') {
                        resetHeight();
                    } else {
                        setTimeout(autoExpand, 0);
                    }
                }
            });
        } else if (textarea.hasAttribute('contenteditable')) {
            // For contenteditable elements, use textContent
            Object.defineProperty(textarea, 'value', {
                get: function() {
                    return this.textContent || '';
                },
                set: function(newValue) {
                    this.textContent = newValue;
                    if (newValue === '') {
                        resetHeight();
                    } else {
                        setTimeout(autoExpand, 0);
                    }
                }
            });
        }

        // Initial height adjustment in case there's default content
        setTimeout(autoExpand, 0);

        // Handle window resize
        let resizeTimer;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(autoExpand, 250);
        });
    }
})();
