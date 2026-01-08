// public/js/csrf.js
// CSRF Token Helper for Frontend
// Include this in HTML pages that need to make POST/PUT/DELETE requests

/**
 * Get CSRF token from cookie
 * @returns {string|null} CSRF token or null if not found
 */
function getCsrfToken() {
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === '_csrf') {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * Add CSRF token to fetch request headers
 * Usage:
 *   fetch('/api/endpoint', addCsrfToken({
 *     method: 'POST',
 *     body: JSON.stringify(data)
 *   }))
 *
 * @param {Object} options - Fetch options object
 * @returns {Object} Options with CSRF token added
 */
function addCsrfToken(options = {}) {
  const token = getCsrfToken();

  if (!token) {
    console.warn('[CSRF] No CSRF token found in cookies. Request may be rejected.');
    return options;
  }

  // Add CSRF token to headers
  options.headers = options.headers || {};
  options.headers['X-CSRF-Token'] = token;

  // Ensure Content-Type is set for JSON requests
  if (options.body && typeof options.body === 'string') {
    options.headers['Content-Type'] = 'application/json';
  }

  return options;
}

/**
 * Add CSRF token to FormData
 * Usage:
 *   const formData = new FormData();
 *   formData.append('field', 'value');
 *   addCsrfTokenToForm(formData);
 *
 * @param {FormData} formData - FormData object
 * @returns {FormData} FormData with CSRF token added
 */
function addCsrfTokenToForm(formData) {
  const token = getCsrfToken();

  if (!token) {
    console.warn('[CSRF] No CSRF token found in cookies. Request may be rejected.');
    return formData;
  }

  formData.append('_csrf', token);
  return formData;
}

/**
 * Enhanced fetch wrapper with automatic CSRF token injection
 * Drop-in replacement for fetch() that handles CSRF automatically
 *
 * Usage:
 *   csrfFetch('/api/endpoint', {
 *     method: 'POST',
 *     body: JSON.stringify(data)
 *   })
 *
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @returns {Promise} Fetch promise
 */
async function csrfFetch(url, options = {}) {
  // Only add CSRF token for state-changing methods
  const method = (options.method || 'GET').toUpperCase();
  const needsCsrf = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

  if (needsCsrf) {
    options = addCsrfToken(options);
  }

  return fetch(url, options);
}

// Export for use in other modules (if using ES6 modules)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getCsrfToken,
    addCsrfToken,
    addCsrfTokenToForm,
    csrfFetch
  };
}
