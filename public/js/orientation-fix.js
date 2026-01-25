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
