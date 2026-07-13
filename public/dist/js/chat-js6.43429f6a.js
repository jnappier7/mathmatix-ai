/* --- /js/debug-buttons.js --- */
// Debug script to check button functionality
console.log('🐛 Button Debug Script Loaded');

// Check if buttons exist when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🐛 DOM Content Loaded - Checking buttons...');

    // Check Resources button
    const resourcesBtn = document.getElementById('open-resources-modal-btn');
    console.log('📚 Resources Button:', resourcesBtn ? 'EXISTS ✅' : 'NOT FOUND ❌');
    if (resourcesBtn) {
        console.log('  - Display:', window.getComputedStyle(resourcesBtn).display);
        console.log('  - Visibility:', window.getComputedStyle(resourcesBtn).visibility);
        console.log('  - Pointer Events:', window.getComputedStyle(resourcesBtn).pointerEvents);
        console.log('  - Z-Index:', window.getComputedStyle(resourcesBtn).zIndex);

        // Add a test click handler
        resourcesBtn.addEventListener('click', () => {
            console.log('🎯 Resources button CLICKED!');
        }, { capture: true });
    }

    // Check modals
    const resourcesModal = document.getElementById('resources-modal');
    console.log('📚 Resources Modal:', resourcesModal ? 'EXISTS ✅' : 'NOT FOUND ❌');
});

// Also check immediately (in case DOMContentLoaded already fired)
setTimeout(() => {
    console.log('🐛 Delayed Check (1 second after load)...');

    const resourcesBtn = document.getElementById('open-resources-modal-btn');

    if (resourcesBtn) {
        console.log('📚 Resources button exists (handlers attached via addEventListener)');
        console.log('   Event listeners:', typeof getEventListeners !== 'undefined' ? getEventListeners(resourcesBtn) : 'Use DevTools to inspect');
    }
}, 1000);

;
/* --- /js/orientation-fix.js --- */
/**
 * Orientation Change Handler
 * Fixes layout issues when rotating device
 * Ensures mobile styles persist in landscape mode
 */

(function() {
    'use strict';

    // Force mobile layout for touch devices regardless of width
    function isTouchDevice() {
        return ('ontouchstart' in window) || 
               (navigator.maxTouchPoints > 0) || 
               (navigator.msMaxTouchPoints > 0);
    }

    // Apply mobile class to body for CSS targeting
    function updateMobileClass() {
        if (isTouchDevice()) {
            document.body.classList.add('is-touch-device');
            document.body.classList.add('is-mobile');
        } else {
            document.body.classList.remove('is-touch-device');
            // Only remove mobile if width is truly desktop
            if (window.innerWidth > 1024) {
                document.body.classList.remove('is-mobile');
            }
        }
    }

    // Handle orientation changes
    function handleOrientationChange() {
        console.log('[Orientation] Changed to:', screen.orientation?.type || window.orientation);
        
        // Small delay to allow browser to adjust
        setTimeout(() => {
            updateMobileClass();
            
            // Force layout recalculation
            document.body.style.display = 'none';
            document.body.offsetHeight; // Trigger reflow
            document.body.style.display = '';
            
            // Dispatch custom event for other components
            window.dispatchEvent(new CustomEvent('orientationchange-complete'));
        }, 100);
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateMobileClass);
    } else {
        updateMobileClass();
    }

    // Listen for orientation changes
    if (screen.orientation) {
        screen.orientation.addEventListener('change', handleOrientationChange);
    } else {
        // Fallback for older browsers
        window.addEventListener('orientationchange', handleOrientationChange);
    }

    // Also listen for resize (covers all cases)
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(handleOrientationChange, 150);
    });

    console.log('[Orientation] Handler initialized, Touch device:', isTouchDevice());
})();

;
/* --- /js/mobile-touch-fix.js --- */
// Mobile touch event fixes for buttons
// Ensures buttons work on both desktop (click) and mobile (touch)

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('🔧 Mobile Touch Fix initialized');

        // Add touch support to specific buttons that might have issues
        const criticalButtons = [
            'open-resources-modal-btn',
            'toggle-calculator-btn',
            'toggle-whiteboard-btn',
            'attach-button',
            'camera-button',
            'mic-button',
            'insert-equation-btn',
            'calculator-toolbar-btn'
        ];

        criticalButtons.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                enhanceButtonForMobile(button);
            }
        });

        // Also enhance any buttons with class 'btn'
        const allButtons = document.querySelectorAll('.btn, button');
        allButtons.forEach(button => {
            if (!button.hasAttribute('data-touch-enhanced')) {
                enhanceButtonForMobile(button);
            }
        });
    }

    function enhanceButtonForMobile(button) {
        // Mark as enhanced to avoid duplicate handlers
        button.setAttribute('data-touch-enhanced', 'true');

        // Prevent double-tap zoom
        button.style.touchAction = 'manipulation';

        // Add visual feedback for touch
        button.addEventListener('touchstart', function(e) {
            this.style.opacity = '0.7';
        }, { passive: true });

        button.addEventListener('touchend', function(e) {
            this.style.opacity = '1';
        }, { passive: true });

        button.addEventListener('touchcancel', function(e) {
            this.style.opacity = '1';
        }, { passive: true });

        // Log for debugging (can be removed in production)
        const buttonId = button.id || button.className;
        console.log(`✅ Enhanced button for mobile: ${buttonId}`);
    }

    // Additional fix: Prevent iOS from pausing/freezing on certain actions
    if (navigator.userAgent.match(/(iPad|iPhone|iPod)/i)) {
        document.addEventListener('touchstart', function() {}, { passive: true });
    }

    // Fix for frozen modals on mobile
    document.addEventListener('click', function(e) {
        // If clicking on a button or link, ensure it's not prevented
        if (e.target.closest('button') || e.target.closest('a')) {
            // Allow the event to proceed
            return true;
        }
    }, true); // Use capture phase

})();

;
/* --- /js/mobile-drawer.js --- */
/**
 * Mobile Drawer System
 * Handles opening/closing of left and right mobile drawers
 */

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDrawers);
    } else {
        initDrawers();
    }

    function initDrawers() {
        // Get drawer elements
        const leftDrawer = document.getElementById('left-drawer');
        const rightDrawer = document.getElementById('right-drawer');
        const overlay = document.getElementById('drawer-overlay');

        // Get toggle buttons
        const leftToggle = document.getElementById('left-drawer-toggle');
        const rightToggle = document.getElementById('right-drawer-toggle');

        // Get close buttons
        const leftClose = document.getElementById('close-left-drawer');
        const rightClose = document.getElementById('close-right-drawer');

        // Check if elements exist (they might not be on all pages)
        if (!leftDrawer || !rightDrawer || !overlay) {
            console.log('Drawer elements not found on this page');
            return;
        }

        /**
         * Open a drawer
         * @param {HTMLElement} drawer - The drawer element to open
         */
        function openDrawer(drawer) {
            // Close other drawer first
            if (drawer === leftDrawer && rightDrawer.classList.contains('open')) {
                closeDrawer(rightDrawer);
            } else if (drawer === rightDrawer && leftDrawer.classList.contains('open')) {
                closeDrawer(leftDrawer);
            }

            drawer.classList.add('open');
            overlay.classList.add('active');

            // Hide the toggle button when drawer is open
            if (drawer === leftDrawer && leftToggle) {
                leftToggle.style.opacity = '0';
                leftToggle.style.pointerEvents = 'none';
            } else if (drawer === rightDrawer && rightToggle) {
                rightToggle.style.opacity = '0';
                rightToggle.style.pointerEvents = 'none';
            }

            // Prevent body scroll when drawer is open
            document.body.style.overflow = 'hidden';
        }

        /**
         * Close a drawer
         * @param {HTMLElement} drawer - The drawer element to close
         */
        function closeDrawer(drawer) {
            drawer.classList.remove('open');
            overlay.classList.remove('active');

            // Show the toggle button again when drawer closes
            if (drawer === leftDrawer && leftToggle) {
                leftToggle.style.opacity = '';
                leftToggle.style.pointerEvents = '';
            } else if (drawer === rightDrawer && rightToggle) {
                rightToggle.style.opacity = '';
                rightToggle.style.pointerEvents = '';
            }

            // Re-enable body scroll
            document.body.style.overflow = '';
        }

        /**
         * Close all drawers
         */
        function closeAllDrawers() {
            closeDrawer(leftDrawer);
            closeDrawer(rightDrawer);
        }

        // Toggle button event listeners
        if (leftToggle) {
            leftToggle.addEventListener('click', function() {
                if (leftDrawer.classList.contains('open')) {
                    closeDrawer(leftDrawer);
                } else {
                    openDrawer(leftDrawer);
                }
            });
        }

        if (rightToggle) {
            rightToggle.addEventListener('click', function() {
                if (rightDrawer.classList.contains('open')) {
                    closeDrawer(rightDrawer);
                } else {
                    openDrawer(rightDrawer);
                }
            });
        }

        // Close button event listeners
        if (leftClose) {
            leftClose.addEventListener('click', function() {
                closeDrawer(leftDrawer);
            });
        }

        if (rightClose) {
            rightClose.addEventListener('click', function() {
                closeDrawer(rightDrawer);
            });
        }

        // Overlay click closes all drawers
        overlay.addEventListener('click', function() {
            closeAllDrawers();
        });

        // ESC key closes drawers
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeAllDrawers();
            }
        });

        // Handle window resize - close drawers when switching to desktop view
        let resizeTimer;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
                if (window.innerWidth > 767) {
                    closeAllDrawers();
                }
            }, 250);
        });

        // SWIPE GESTURES - Swipe right from left edge to open, swipe left to close
        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let touchEndY = 0;
        const minSwipeDistance = 50;
        const edgeThreshold = 30; // Pixels from edge to trigger open

        document.addEventListener('touchstart', function(e) {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        document.addEventListener('touchend', function(e) {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            handleSwipe();
        }, { passive: true });

        function handleSwipe() {
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;

            // Ignore if vertical swipe (scrolling)
            if (Math.abs(deltaY) > Math.abs(deltaX)) {
                return;
            }

            // Swipe right from left edge - open left drawer
            if (touchStartX < edgeThreshold && deltaX > minSwipeDistance) {
                if (!leftDrawer.classList.contains('open')) {
                    openDrawer(leftDrawer);
                }
            }

            // Swipe left from right edge - open right drawer
            if (touchStartX > window.innerWidth - edgeThreshold && deltaX < -minSwipeDistance) {
                if (!rightDrawer.classList.contains('open')) {
                    openDrawer(rightDrawer);
                }
            }

            // Swipe left when left drawer is open - close it
            if (leftDrawer.classList.contains('open') && deltaX < -minSwipeDistance) {
                closeDrawer(leftDrawer);
            }

            // Swipe right when right drawer is open - close it
            if (rightDrawer.classList.contains('open') && deltaX > minSwipeDistance) {
                closeDrawer(rightDrawer);
            }
        }
    }
})();

;
/* --- /js/mobile-more-tools.js --- */
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
