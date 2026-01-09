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
    }
})();
