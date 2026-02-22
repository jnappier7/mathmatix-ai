/**
 * AUTO-LOGOUT MANAGER
 *
 * Handles automatic logout in two scenarios:
 * 1. Inactivity timeout (30 minutes default)
 * 2. Manual logout button (handled elsewhere)
 *
 * The idle timeout continues to count even when the tab is hidden/minimized.
 * When the tab becomes visible again, we check if the timeout has already
 * elapsed and immediately log out if so.
 */

(function() {
  'use strict';

  // Configuration
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
  const WARNING_BEFORE_LOGOUT = 2 * 60 * 1000; // Warn 2 minutes before logout
  const SESSION_KEY = 'mathmatix_tab_session_active';

  let inactivityTimer = null;
  let warningTimer = null;
  let warningShown = false;
  let lastActivityTime = Date.now(); // Track the actual wall-clock time of last activity

  /**
   * Perform logout - destroys server session via the CSRF-exempt endpoint
   */
  function performLogout() {
    // Clear ALL session storage (including tab session flag)
    if (window.StorageUtils) {
      StorageUtils.session.clear();
    } else {
      try {
        sessionStorage.clear();
      } catch (e) {
        console.warn('[Auto-Logout] Could not clear sessionStorage:', e);
      }
    }

    // Use the CSRF-exempt /api/session/end endpoint (sendBeacon can't send CSRF headers).
    // This endpoint destroys the express session on the server side.
    const payload = JSON.stringify({ reason: 'auto_logout', destroySession: true });
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon('/api/session/end', blob);
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
      lastActivityTime = Date.now();
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
    lastActivityTime = Date.now();

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
   * Mark tab session as active (set on every protected page load)
   */
  function activateTabSession() {
    if (window.StorageUtils) {
      StorageUtils.session.setItem(SESSION_KEY, 'true');
    } else {
      try {
        sessionStorage.setItem(SESSION_KEY, 'true');
      } catch (e) {
        console.warn('[Auto-Logout] Could not set sessionStorage:', e);
      }
    }
    console.log('[Auto-Logout] Tab session activated');
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

    // Activate tab session (set flag in sessionStorage)
    activateTabSession();

    console.log('[Auto-Logout] Initialized with inactivity timeout');

    // 1. INACTIVITY TIMEOUT
    // Listen for user activity events
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(event => {
      document.addEventListener(event, resetInactivityTimer, { passive: true });
    });

    // Start the timer
    resetInactivityTimer();

    // 2. VISIBILITY CHANGE - check elapsed idle time when tab becomes visible again.
    // Timers are NOT paused when the tab is hidden; they continue running.
    // However, browsers may throttle setTimeout in background tabs, so when the
    // tab becomes visible we check if the timeout has already elapsed.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // Tab just became visible - check how long user was actually idle
        const idleMs = Date.now() - lastActivityTime;

        if (idleMs >= INACTIVITY_TIMEOUT) {
          // Already past timeout - log out immediately
          console.log('[Auto-Logout] Tab returned after idle timeout elapsed');
          performLogout();
          window.location.href = '/login.html';
        } else if (idleMs >= INACTIVITY_TIMEOUT - WARNING_BEFORE_LOGOUT) {
          // In the warning window - show warning and restart timer for remaining time
          if (inactivityTimer) clearTimeout(inactivityTimer);
          if (warningTimer) clearTimeout(warningTimer);

          const remaining = INACTIVITY_TIMEOUT - idleMs;
          inactivityTimer = setTimeout(() => {
            console.log('[Auto-Logout] Session timed out due to inactivity');
            performLogout();
            alert('You have been logged out due to inactivity.');
            window.location.href = '/login.html';
          }, remaining);

          showInactivityWarning();
        }
        // If less than warning threshold, timers are still running correctly
      }
    });

    // 3. STORAGE EVENT (for cross-tab logout sync)
    // If user logs out in one tab, logout in all tabs
    window.addEventListener('storage', (event) => {
      if (event.key === 'logout-event') {
        console.log('[Auto-Logout] Logout detected in another tab');
        // Clear all session data
        if (window.StorageUtils) {
          StorageUtils.session.clear();
        } else {
          try {
            sessionStorage.clear();
          } catch (e) {
            console.warn('[Auto-Logout] Could not clear sessionStorage:', e);
          }
        }
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
    if (window.StorageUtils) {
      StorageUtils.local.setItem('logout-event', Date.now().toString());
      StorageUtils.local.removeItem('logout-event'); // Clean up
    } else {
      try {
        localStorage.setItem('logout-event', Date.now().toString());
        localStorage.removeItem('logout-event'); // Clean up
      } catch (e) {
        console.warn('[Auto-Logout] Could not access localStorage for cross-tab logout:', e);
      }
    }

    performLogout(); // This clears sessionStorage
    window.location.href = '/login.html';
  };

  // Expose session activation for login page
  window.activateTabSession = activateTabSession;

})();
