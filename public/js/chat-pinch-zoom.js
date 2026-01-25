/**
 * Pinch-to-Zoom Font Size Control for Chat Messages
 * Allows users to adjust chat font size with pinch gestures
 */

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPinchZoom);
    } else {
        initPinchZoom();
    }

    function initPinchZoom() {
        const chatContainer = document.getElementById('chat-messages-container');

        if (!chatContainer) {
            console.log('Chat container not found for pinch zoom');
            return;
        }

        // Font size settings
        const MIN_FONT_SIZE = 0.8;  // 80% of base
        const MAX_FONT_SIZE = 1.5;  // 150% of base
        const DEFAULT_FONT_SIZE = 1.0;
        const STORAGE_KEY = 'mathmatix-chat-font-scale';

        // Load saved font scale or use default
        let currentScale = parseFloat(localStorage.getItem(STORAGE_KEY)) || DEFAULT_FONT_SIZE;

        // Apply saved scale on load
        applyFontScale(currentScale);

        // Show hint on first visit (mobile only)
        if (window.innerWidth <= 767 && !localStorage.getItem('pinch-zoom-hint-shown')) {
            showFirstTimeHint();
            localStorage.setItem('pinch-zoom-hint-shown', 'true');
        }

        // Pinch gesture variables
        let initialDistance = 0;
        let initialScale = currentScale;
        let isPinching = false;

        /**
         * Calculate distance between two touch points
         */
        function getDistance(touch1, touch2) {
            const dx = touch2.clientX - touch1.clientX;
            const dy = touch2.clientY - touch1.clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }

        /**
         * Apply font scale to chat messages
         */
        function applyFontScale(scale) {
            // Clamp scale to min/max
            scale = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, scale));
            currentScale = scale;

            // Apply scale using CSS custom property
            // CSS will multiply base font size (17px) by this scale factor
            chatContainer.style.setProperty('--chat-font-scale', scale);

            // Save to localStorage
            localStorage.setItem(STORAGE_KEY, scale.toString());

            // Show feedback indicator
            showScaleIndicator(scale);
        }

        /**
         * Show first-time hint about pinch-to-zoom
         */
        function showFirstTimeHint() {
            const hint = document.createElement('div');
            hint.className = 'pinch-zoom-hint';
            hint.innerHTML = '💡 Pinch to zoom chat text<br><small>Double-tap to reset</small>';
            document.body.appendChild(hint);

            // Remove after animation
            setTimeout(() => {
                if (hint.parentNode) {
                    hint.parentNode.removeChild(hint);
                }
            }, 4500);
        }

        /**
         * Show visual feedback of current scale
         */
        function showScaleIndicator(scale) {
            // Remove existing indicator if present
            let indicator = document.getElementById('font-scale-indicator');

            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'font-scale-indicator';
                indicator.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(18, 179, 179, 0.95);
                    color: white;
                    padding: 20px 30px;
                    border-radius: 16px;
                    font-size: 1.5rem;
                    font-weight: 600;
                    z-index: 10000;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.2s ease;
                `;
                document.body.appendChild(indicator);
            }

            // Update text
            const percentage = Math.round(scale * 100);
            indicator.textContent = `${percentage}%`;

            // Show indicator
            indicator.style.opacity = '1';

            // Clear existing timeout
            if (indicator.hideTimeout) {
                clearTimeout(indicator.hideTimeout);
            }

            // Hide after delay
            indicator.hideTimeout = setTimeout(() => {
                indicator.style.opacity = '0';
            }, 1000);
        }

        /**
         * Handle touch start
         */
        function handleTouchStart(e) {
            if (e.touches.length === 2) {
                isPinching = true;
                initialDistance = getDistance(e.touches[0], e.touches[1]);
                initialScale = currentScale;

                // Prevent default pinch-zoom behavior
                e.preventDefault();
            }
        }

        /**
         * Handle touch move
         */
        function handleTouchMove(e) {
            if (isPinching && e.touches.length === 2) {
                e.preventDefault();

                const currentDistance = getDistance(e.touches[0], e.touches[1]);
                const distanceRatio = currentDistance / initialDistance;

                // Calculate new scale (more sensitive scaling)
                const newScale = initialScale * distanceRatio;

                // Apply new scale
                applyFontScale(newScale);
            }
        }

        /**
         * Handle touch end
         */
        function handleTouchEnd(e) {
            if (e.touches.length < 2) {
                isPinching = false;
            }
        }

        // Add touch event listeners
        chatContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
        chatContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
        chatContainer.addEventListener('touchend', handleTouchEnd, { passive: false });
        chatContainer.addEventListener('touchcancel', handleTouchEnd, { passive: false });

        // Add double-tap to reset
        let lastTap = 0;
        chatContainer.addEventListener('touchend', function(e) {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;

            if (tapLength < 300 && tapLength > 0) {
                // Double tap detected
                if (e.target.closest('.message')) {
                    // Reset to default size
                    applyFontScale(DEFAULT_FONT_SIZE);
                }
            }
            lastTap = currentTime;
        });

        // Desktop: Ctrl + Scroll Wheel support
        chatContainer.addEventListener('wheel', function(e) {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();

                // Calculate scale change
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                const newScale = currentScale + delta;

                applyFontScale(newScale);
            }
        }, { passive: false });

        console.log('Pinch-to-zoom initialized for chat messages');
    }
})();
