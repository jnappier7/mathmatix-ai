/**
 * More Tools Menu
 * Handles the overflow/dropdown menu for toolbar buttons.
 * Works as a bottom-sheet on mobile and a dropdown on desktop.
 */

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMoreTools);
    } else {
        initMoreTools();
    }

    function initMoreTools() {
        // Get elements
        const moreBtn = document.getElementById('more-tools-btn');
        const moreMenu = document.getElementById('more-tools-menu');
        const moreOverlay = document.getElementById('more-tools-overlay');
        const closeBtn = document.getElementById('close-more-tools');
        const toolItems = document.querySelectorAll('.more-tool-item');

        // Check if elements exist
        if (!moreBtn || !moreMenu || !moreOverlay) {
            console.log('More tools elements not found');
            return;
        }

        function isMobile() {
            return window.innerWidth <= 767;
        }

        /**
         * Open More Tools menu
         */
        function openMoreTools() {
            moreMenu.style.display = 'block';
            moreOverlay.classList.add('active');

            // Small delay for smooth animation
            setTimeout(() => {
                moreMenu.classList.add('active');
            }, 10);

            // Prevent body scroll on mobile only
            if (isMobile()) {
                document.body.style.overflow = 'hidden';
            }
        }

        /**
         * Close More Tools menu
         */
        function closeMoreTools() {
            moreMenu.classList.remove('active');
            moreOverlay.classList.remove('active');

            // Hide after animation completes
            var delay = isMobile() ? 300 : 150;
            setTimeout(() => {
                moreMenu.style.display = 'none';
            }, delay);

            // Re-enable body scroll
            document.body.style.overflow = '';
        }

        /**
         * Toggle More Tools menu (for desktop click behavior)
         */
        function toggleMoreTools() {
            if (moreMenu.classList.contains('active')) {
                closeMoreTools();
            } else {
                openMoreTools();
            }
        }

        /**
         * Trigger the actual tool button
         * @param {string} targetId - ID of the button to trigger
         */
        function triggerTool(targetId) {
            const targetBtn = document.getElementById(targetId);
            if (targetBtn) {
                // Close menu first
                closeMoreTools();

                // Small delay before triggering to allow menu to close
                var delay = isMobile() ? 300 : 150;
                setTimeout(() => {
                    targetBtn.click();
                }, delay);
            }
        }

        // More button click — toggle on desktop, open on mobile
        if (moreBtn) {
            moreBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                toggleMoreTools();
            });
        }

        // Close button click (visible on mobile bottom-sheet only)
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                closeMoreTools();
            });
        }

        // Overlay click
        moreOverlay.addEventListener('click', function() {
            closeMoreTools();
        });

        // Tool item clicks
        toolItems.forEach(function(item) {
            item.addEventListener('click', function() {
                const targetId = this.getAttribute('data-trigger');
                if (targetId) {
                    triggerTool(targetId);
                }
            });
        });

        // ESC key closes menu
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && moreMenu.classList.contains('active')) {
                closeMoreTools();
            }
        });

        // Handle swipe down to close on mobile
        let startY = 0;
        let currentY = 0;

        moreMenu.addEventListener('touchstart', function(e) {
            startY = e.touches[0].clientY;
        }, { passive: true });

        moreMenu.addEventListener('touchmove', function(e) {
            currentY = e.touches[0].clientY;
            const diff = currentY - startY;

            // If swiping down more than 50px
            if (diff > 50) {
                closeMoreTools();
            }
        }, { passive: true });
    }
})();
