/**
 * AUTO-LOGOUT MANAGER
 *
 * Handles automatic logout in three scenarios:
 * 1. Tab/browser close
 * 2. Inactivity timeout (30 minutes default)
 * 3. Manual logout button (handled elsewhere)
 */

(function() {
  'use strict';

  // Configuration
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
  const WARNING_BEFORE_LOGOUT = 2 * 60 * 1000; // Warn 2 minutes before logout

  let inactivityTimer = null;
  let warningTimer = null;
  let warningShown = false;

  /**
   * Perform logout
   */
  function performLogout() {
    // Use sendBeacon for reliable logout even during page unload
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/logout', new URLSearchParams({ method: 'POST' }));
    } else {
      // Fallback for older browsers
      fetch('/logout', {
        method: 'POST',
        credentials: 'include',
        keepalive: true
      }).catch(err => console.error('Logout failed:', err));
    }
  }

  /**
   * Show inactivity warning
   */
  function showInactivityWarning() {
    if (warningShown) return;
    warningShown = true;

    const remainingTime = Math.ceil(WARNING_BEFORE_LOGOUT / 60000);
    const shouldStay = confirm(
      `⚠️ Inactivity Detected\n\n` +
      `You will be logged out in ${remainingTime} minutes due to inactivity.\n\n` +
      `Click OK to stay logged in, or Cancel to logout now.`
    );

    if (shouldStay) {
      // User wants to stay - reset timers
      resetInactivityTimer();
      warningShown = false;
    } else {
      // User chose to logout
      performLogout();
      window.location.href = '/login.html';
    }
  }

  /**
   * Reset inactivity timer
   */
  function resetInactivityTimer() {
    // Clear existing timers
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (warningTimer) clearTimeout(warningTimer);
    warningShown = false;

    // Set warning timer (fires before logout)
    warningTimer = setTimeout(() => {
      showInactivityWarning();
    }, INACTIVITY_TIMEOUT - WARNING_BEFORE_LOGOUT);

    // Set logout timer (fires after full timeout)
    inactivityTimer = setTimeout(() => {
      console.log('[Auto-Logout] Session timed out due to inactivity');
      performLogout();
      alert('You have been logged out due to inactivity.');
      window.location.href = '/login.html';
    }, INACTIVITY_TIMEOUT);
  }

  /**
   * Initialize auto-logout
   */
  function initialize() {
    // Skip if on login/signup pages (user not authenticated yet)
    const publicPages = ['/login.html', '/signup.html', '/index.html', '/privacy.html', '/terms.html'];
    const currentPage = window.location.pathname;

    if (publicPages.some(page => currentPage.endsWith(page))) {
      console.log('[Auto-Logout] Skipping - public page');
      return;
    }

    console.log('[Auto-Logout] Initialized');

    // 1. INACTIVITY TIMEOUT
    // Listen for user activity events
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(event => {
      document.addEventListener(event, resetInactivityTimer, { passive: true });
    });

    // Start the timer
    resetInactivityTimer();

    // 2. TAB/BROWSER CLOSE LOGOUT
    // Note: Modern browsers restrict this for security. Best effort approach.
    window.addEventListener('beforeunload', (event) => {
      // Use sendBeacon for most reliable delivery during page unload
      performLogout();

      // Don't show confirmation dialog (annoying for users)
      // Just logout silently in background
    });

    // Alternative: Use visibilitychange for tab switches
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Tab hidden - pause timers to avoid logout while tab is in background
        if (inactivityTimer) clearTimeout(inactivityTimer);
        if (warningTimer) clearTimeout(warningTimer);
      } else {
        // Tab visible again - resume timers
        resetInactivityTimer();
      }
    });

    // 3. STORAGE EVENT (for cross-tab logout sync)
    // If user logs out in one tab, logout in all tabs
    window.addEventListener('storage', (event) => {
      if (event.key === 'logout-event') {
        console.log('[Auto-Logout] Logout detected in another tab');
        window.location.href = '/login.html';
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // Expose logout function globally for manual logout buttons
  window.triggerLogout = function() {
    // Set storage event to logout all tabs
    localStorage.setItem('logout-event', Date.now().toString());
    localStorage.removeItem('logout-event'); // Clean up

    performLogout();
    window.location.href = '/login.html';
  };

})();
