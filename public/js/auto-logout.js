/**
 * AUTO-LOGOUT MANAGER
 *
 * Handles automatic logout in four scenarios:
 * 1. Tab close (sessionStorage cleared)
 * 2. Browser close (sendBeacon logout)
 * 3. Inactivity timeout (30 minutes default)
 * 4. Manual logout button (handled elsewhere)
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

  /**
   * Perform logout
   */
  function performLogout() {
    // Clear ALL session storage (including tab session flag)
    if (window.StorageUtils) {
      StorageUtils.session.clear();
    } else {
      // Fallback if StorageUtils not loaded
      try {
        sessionStorage.clear();
      } catch (e) {
        console.warn('[Auto-Logout] Could not clear sessionStorage:', e);
      }
    }

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
   * Mark tab session as active (set on every protected page load)
   */
  function activateTabSession() {
    if (window.StorageUtils) {
      StorageUtils.session.setItem(SESSION_KEY, 'true');
    } else {
      // Fallback if StorageUtils not loaded
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
    // This gets cleared automatically when tab closes
    activateTabSession();

    console.log('[Auto-Logout] Initialized with tab-close logout enabled');

    // 1. INACTIVITY TIMEOUT
    // Listen for user activity events
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(event => {
      document.addEventListener(event, resetInactivityTimer, { passive: true });
    });

    // Start the timer
    resetInactivityTimer();

    // 2. TAB/BROWSER CLOSE LOGOUT
    // Use pagehide instead of beforeunload - more reliable for detecting actual tab close
    // The 'persisted' property tells us if the page is being cached (navigation) or discarded (tab close)
    window.addEventListener('pagehide', (event) => {
      // If persisted = true, page is going into bfcache (back/forward cache) = navigation
      // If persisted = false, page is being discarded = tab/browser close
      if (!event.persisted) {
        console.log('[Auto-Logout] Tab closing (not cached) - sending logout beacon');
        performLogout(); // Clears sessionStorage and sends logout beacon
      } else {
        console.log('[Auto-Logout] Page cached for navigation - keeping session');
      }
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
