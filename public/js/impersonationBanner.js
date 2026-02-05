// public/js/impersonationBanner.js
// Impersonation indicator - subtle teal glow + floating pill when viewing as another user

(function() {
  'use strict';

  const POLL_INTERVAL = 30000; // Check status every 30 seconds

  let pollInterval = null;
  let pillElement = null;
  let currentStatus = null;

  /**
   * Initialize the impersonation indicator
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
        showIndicator(status);
      } else {
        hideIndicator();
      }
    } catch (err) {
      console.error('Failed to check impersonation status:', err);
    }
  }

  /**
   * Show the impersonation indicator (glow + pill)
   */
  function showIndicator(status) {
    // Add body class for teal glow effect
    document.body.classList.add('impersonation-active');

    // Create or update pill
    if (!pillElement) {
      pillElement = createPillElement();
      document.body.appendChild(pillElement);
    }

    updatePillContent(status);
  }

  /**
   * Hide the impersonation indicator
   */
  function hideIndicator() {
    document.body.classList.remove('impersonation-active');

    if (pillElement) {
      pillElement.remove();
      pillElement = null;
    }
  }

  /**
   * Create the floating pill element
   */
  function createPillElement() {
    const pill = document.createElement('div');
    pill.className = 'impersonation-pill';
    pill.id = 'impersonation-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');

    return pill;
  }

  /**
   * Update pill content with current status
   */
  function updatePillContent(status) {
    pillElement.innerHTML = `
      <span class="impersonation-pill__icon">&#128065;</span>
      <span class="impersonation-pill__text">
        <span class="impersonation-pill__name">${escapeHtml(status.targetName)}</span>
        <span class="impersonation-pill__details">${status.remainingMinutes}m left</span>
      </span>
      <button class="impersonation-pill__exit" onclick="window.ImpersonationBanner.exit(); event.stopPropagation();">
        Exit
      </button>
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
