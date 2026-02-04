// public/js/impersonationBanner.js
// Impersonation banner component - shows when viewing as another user

(function() {
  'use strict';

  const POLL_INTERVAL = 30000; // Check status every 30 seconds
  const WARNING_THRESHOLD = 5; // Show warning when 5 minutes remaining

  let pollInterval = null;
  let bannerElement = null;
  let currentStatus = null;

  /**
   * Initialize the impersonation banner
   * Call this on page load for any authenticated page
   */
  async function init() {
    await checkImpersonationStatus();

    // Poll for status changes (timeout, external end, etc.)
    pollInterval = setInterval(checkImpersonationStatus, POLL_INTERVAL);

    // Clean up on page unload
    window.addEventListener('beforeunload', cleanup);
  }

  /**
   * Check current impersonation status from server
   */
  async function checkImpersonationStatus() {
    try {
      const response = await fetch('/api/impersonation/status');
      if (!response.ok) return;

      const status = await response.json();
      currentStatus = status;

      if (status.active) {
        showBanner(status);
      } else {
        hideBanner();
      }
    } catch (err) {
      console.error('Failed to check impersonation status:', err);
    }
  }

  /**
   * Show the impersonation banner
   */
  function showBanner(status) {
    // Add body class to push content down
    document.body.classList.add('impersonation-active');

    // Create or update banner
    if (!bannerElement) {
      bannerElement = createBannerElement();
      document.body.prepend(bannerElement);
    }

    updateBannerContent(status);
  }

  /**
   * Hide the impersonation banner
   */
  function hideBanner() {
    document.body.classList.remove('impersonation-active');

    if (bannerElement) {
      bannerElement.remove();
      bannerElement = null;
    }
  }

  /**
   * Create the banner DOM element
   */
  function createBannerElement() {
    const banner = document.createElement('div');
    banner.className = 'impersonation-banner';
    banner.id = 'impersonation-banner';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'polite');

    return banner;
  }

  /**
   * Update banner content with current status
   */
  function updateBannerContent(status) {
    const isWarning = status.remainingMinutes <= WARNING_THRESHOLD;
    const readOnlyClass = status.readOnly ? 'impersonation-banner--readonly' : '';

    bannerElement.className = `impersonation-banner ${readOnlyClass}`;
    bannerElement.innerHTML = `
      <span class="impersonation-banner__icon" aria-hidden="true">&#128065;</span>
      <div class="impersonation-banner__content">
        <div class="impersonation-banner__title">
          Viewing as
          <span class="impersonation-banner__user">${escapeHtml(status.targetName)}</span>
          <span class="impersonation-banner__badge">${status.targetRole}</span>
          ${status.readOnly ? '<span class="impersonation-banner__badge">Read-Only</span>' : ''}
        </div>
        <div class="impersonation-banner__subtitle">
          Changes are ${status.readOnly ? 'disabled' : 'limited'} while viewing as another user
        </div>
      </div>
      <div class="impersonation-banner__timer ${isWarning ? 'warning' : ''}">
        ${status.remainingMinutes} min remaining
      </div>
      <div class="impersonation-banner__actions">
        <button class="impersonation-banner__btn impersonation-banner__btn--exit" onclick="window.ImpersonationBanner.exit()">
          Exit View
        </button>
      </div>
    `;
  }

  /**
   * End the impersonation session and return to original account
   */
  async function exit() {
    try {
      const response = await csrfFetch('/api/impersonation/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to end impersonation');
      }

      const result = await response.json();

      if (result.success) {
        // Redirect based on original user's role
        const status = currentStatus;
        if (status && status.originalUser) {
          const role = status.originalUser.role;
          const redirectMap = {
            admin: '/admin-dashboard.html',
            teacher: '/teacher-dashboard.html',
            parent: '/parent-dashboard.html'
          };
          window.location.href = redirectMap[role] || '/';
        } else {
          // Fallback - reload to let server decide
          window.location.reload();
        }
      }
    } catch (err) {
      console.error('Failed to end impersonation:', err);
      alert('Failed to exit view mode. Please try again.');
    }
  }

  /**
   * Start impersonating a user (called from dashboard UIs)
   */
  async function start(targetId, options = {}) {
    try {
      const response = await csrfFetch('/api/impersonation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId,
          readOnly: options.readOnly !== false // Default to true
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to start impersonation');
      }

      if (result.success) {
        // Redirect to appropriate page for the target user
        const targetRole = result.impersonation.targetRole;
        const redirectMap = {
          student: '/chat.html',
          teacher: '/teacher-dashboard.html',
          parent: '/parent-dashboard.html'
        };
        window.location.href = options.redirect || redirectMap[targetRole] || '/chat.html';
      }

      return result;
    } catch (err) {
      console.error('Failed to start impersonation:', err);
      throw err;
    }
  }

  /**
   * Get list of users that can be impersonated
   */
  async function getTargets() {
    try {
      const response = await fetch('/api/impersonation/targets');
      if (!response.ok) {
        throw new Error('Failed to fetch impersonation targets');
      }
      return await response.json();
    } catch (err) {
      console.error('Failed to get impersonation targets:', err);
      throw err;
    }
  }

  /**
   * Get current impersonation status
   */
  function getStatus() {
    return currentStatus;
  }

  /**
   * Check if currently impersonating
   */
  function isActive() {
    return currentStatus && currentStatus.active;
  }

  /**
   * Clean up on page unload
   */
  function cleanup() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Expose API globally
  window.ImpersonationBanner = {
    init,
    start,
    exit,
    getTargets,
    getStatus,
    isActive,
    checkImpersonationStatus
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
