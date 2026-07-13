/* --- /js/impersonationBanner.js --- */
// public/js/impersonationBanner.js
// Impersonation indicator - subtle teal glow + floating pill when viewing as another user

(function() {
  'use strict';

  const POLL_INTERVAL = 30000; // Check status every 30 seconds
  const MAX_POLL_INTERVAL = 300000; // 5 minutes cap

  let pollTimer = null;
  let pillElement = null;
  let currentStatus = null;
  let consecutiveFailures = 0;

  /**
   * Initialize the impersonation indicator
   */
  async function init() {
    await checkImpersonationStatus();

    // Poll for status changes (timeout, external end, etc.)
    schedulePoll();

    // Clean up on page unload
    window.addEventListener('beforeunload', cleanup);
  }

  function schedulePoll() {
    if (pollTimer) clearTimeout(pollTimer);
    if (window.__sessionExpired) return;
    const interval = Math.min(
      POLL_INTERVAL * Math.pow(2, consecutiveFailures),
      MAX_POLL_INTERVAL
    );
    pollTimer = setTimeout(async () => {
      await checkImpersonationStatus();
      schedulePoll();
    }, interval);
  }

  /**
   * Check current impersonation status from server
   */
  async function checkImpersonationStatus() {
    if (window.__sessionExpired) return;
    try {
      const response = await fetch('/api/impersonation/status');
      if (!response.ok) {
        if (response.status === 401) {
          cleanup();
          if (typeof handleSessionExpired === 'function') handleSessionExpired();
          return;
        }
        if (response.status === 429) consecutiveFailures++;
        return;
      }

      consecutiveFailures = 0;
      const status = await response.json();
      currentStatus = status;

      if (status.active) {
        showIndicator(status);
      } else {
        hideIndicator();
      }
    } catch (err) {
      consecutiveFailures++;
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
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
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

;
/* --- /js/storage-utils.js --- */
/**
 * Safe Storage Utilities
 * Provides error-safe access to localStorage and sessionStorage
 * Handles Safari's Tracking Prevention and other storage blocking scenarios
 */

const StorageUtils = (() => {
  // Test if storage is available and accessible
  function isStorageAvailable(type) {
    try {
      const storage = window[type];
      const testKey = '__storage_test__';
      storage.setItem(testKey, 'test');
      storage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Cache availability checks to avoid repeated testing
  let localStorageAvailable = null;
  let sessionStorageAvailable = null;

  function checkLocalStorage() {
    if (localStorageAvailable === null) {
      localStorageAvailable = isStorageAvailable('localStorage');
    }
    return localStorageAvailable;
  }

  function checkSessionStorage() {
    if (sessionStorageAvailable === null) {
      sessionStorageAvailable = isStorageAvailable('sessionStorage');
    }
    return sessionStorageAvailable;
  }

  // LocalStorage safe methods
  const safeLocalStorage = {
    setItem(key, value) {
      try {
        if (checkLocalStorage()) {
          localStorage.setItem(key, value);
          return true;
        } else {
          console.warn(`[Storage] localStorage blocked for key: ${key}`);
          return false;
        }
      } catch (error) {
        console.error(`[Storage] Failed to set localStorage key "${key}":`, error);
        return false;
      }
    },

    getItem(key) {
      try {
        if (checkLocalStorage()) {
          return localStorage.getItem(key);
        } else {
          console.warn(`[Storage] localStorage blocked for key: ${key}`);
          return null;
        }
      } catch (error) {
        console.error(`[Storage] Failed to get localStorage key "${key}":`, error);
        return null;
      }
    },

    removeItem(key) {
      try {
        if (checkLocalStorage()) {
          localStorage.removeItem(key);
          return true;
        } else {
          console.warn(`[Storage] localStorage blocked for key: ${key}`);
          return false;
        }
      } catch (error) {
        console.error(`[Storage] Failed to remove localStorage key "${key}":`, error);
        return false;
      }
    },

    clear() {
      try {
        if (checkLocalStorage()) {
          localStorage.clear();
          return true;
        } else {
          console.warn('[Storage] localStorage blocked for clear operation');
          return false;
        }
      } catch (error) {
        console.error('[Storage] Failed to clear localStorage:', error);
        return false;
      }
    }
  };

  // SessionStorage safe methods
  const safeSessionStorage = {
    setItem(key, value) {
      try {
        if (checkSessionStorage()) {
          sessionStorage.setItem(key, value);
          return true;
        } else {
          console.warn(`[Storage] sessionStorage blocked for key: ${key}`);
          return false;
        }
      } catch (error) {
        console.error(`[Storage] Failed to set sessionStorage key "${key}":`, error);
        return false;
      }
    },

    getItem(key) {
      try {
        if (checkSessionStorage()) {
          return sessionStorage.getItem(key);
        } else {
          console.warn(`[Storage] sessionStorage blocked for key: ${key}`);
          return null;
        }
      } catch (error) {
        console.error(`[Storage] Failed to get sessionStorage key "${key}":`, error);
        return null;
      }
    },

    removeItem(key) {
      try {
        if (checkSessionStorage()) {
          sessionStorage.removeItem(key);
          return true;
        } else {
          console.warn(`[Storage] sessionStorage blocked for key: ${key}`);
          return false;
        }
      } catch (error) {
        console.error(`[Storage] Failed to remove sessionStorage key "${key}":`, error);
        return false;
      }
    },

    clear() {
      try {
        if (checkSessionStorage()) {
          sessionStorage.clear();
          return true;
        } else {
          console.warn('[Storage] sessionStorage blocked for clear operation');
          return false;
        }
      } catch (error) {
        console.error('[Storage] Failed to clear sessionStorage:', error);
        return false;
      }
    }
  };

  // Public API
  return {
    local: safeLocalStorage,
    session: safeSessionStorage,
    isLocalStorageAvailable: checkLocalStorage,
    isSessionStorageAvailable: checkSessionStorage
  };
})();

// Make available globally
window.StorageUtils = StorageUtils;

;
/* --- /js/sanitize-util.js --- */
/**
 * HTML Sanitization Utility
 *
 * Provides safe HTML sanitization using DOMPurify to prevent XSS attacks.
 * This utility should be used whenever setting innerHTML from user-generated
 * or AI-generated content.
 */

// DOMPurify availability is checked lazily at call-time so that this script
// can be loaded before the deferred DOMPurify CDN finishes executing.

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param {string} html - The HTML string to sanitize
 * @param {Object} options - Optional DOMPurify configuration
 * @returns {string} Sanitized HTML safe for innerHTML
 */
function sanitizeHTML(html, options = {}) {
    if (!html || typeof html !== 'string') {
        return '';
    }

    if (typeof DOMPurify === 'undefined') {
        console.error('DOMPurify is not loaded! Returning empty string for safety.');
        return '';
    }

    const defaultConfig = {
        ALLOWED_TAGS: [
            'p', 'br', 'strong', 'em', 'u', 'code', 'pre',
            'ul', 'ol', 'li', 'blockquote',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'a', 'span', 'div', 'table', 'thead', 'tbody',
            'tr', 'td', 'th', 'img'
        ],
        ALLOWED_ATTR: [
            'href', 'class', 'target', 'rel', 'src', 'alt',
            'title', 'style', 'id', 'data-*'
        ],
        ALLOW_DATA_ATTR: true
    };

    const config = { ...defaultConfig, ...options };

    try {
        return DOMPurify.sanitize(html, config);
    } catch (error) {
        console.error('Error sanitizing HTML:', error);
        return ''; // Return empty string on error for safety
    }
}

/**
 * Safely set innerHTML with automatic sanitization
 * @param {HTMLElement} element - The DOM element
 * @param {string} html - The HTML content to set
 * @param {Object} options - Optional DOMPurify configuration
 */
function safeSetInnerHTML(element, html, options = {}) {
    if (!element || !(element instanceof HTMLElement)) {
        console.error('Invalid element provided to safeSetInnerHTML');
        return;
    }

    const sanitized = sanitizeHTML(html, options);
    element.innerHTML = sanitized;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sanitizeHTML, safeSetInnerHTML };
}
