// utils/apiResponse.js — Standardized API response helpers
//
// Usage:
//   const { success, fail } = require('../utils/apiResponse');
//   res.json(success({ user }));                       // { success: true, user: {...} }
//   res.status(400).json(fail('Invalid email'));        // { success: false, message: 'Invalid email' }
//   res.status(404).json(fail('Not found', { id }));   // { success: false, message: 'Not found', id: '...' }

/**
 * Build a success response body.
 * @param {object} [data] - Additional fields to include
 * @returns {object}
 */
function success(data = {}) {
  return { success: true, ...data };
}

/**
 * Build an error response body.
 * @param {string} message - Human-readable error message
 * @param {object} [data] - Additional fields (e.g. field-level errors)
 * @returns {object}
 */
function fail(message, data = {}) {
  return { success: false, message, ...data };
}

module.exports = { success, fail };
