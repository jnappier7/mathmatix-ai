/**
 * HTML Sanitization Utility
 *
 * Provides safe HTML sanitization using DOMPurify to prevent XSS attacks.
 * This utility should be used whenever setting innerHTML from user-generated
 * or AI-generated content.
 */

// Check if DOMPurify is available
if (typeof DOMPurify === 'undefined') {
    console.error('DOMPurify is not loaded! Include DOMPurify CDN before this script.');
}

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
