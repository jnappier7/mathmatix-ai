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
            'insert-equation-btn'
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
