// config/sentry.js — Sentry Express integration
// Sentry.init() happens in instrument.js (loaded via --require before server.js)
const Sentry = require('@sentry/node');

function initSentry() {
  // No-op — initialization moved to instrument.js for early module hooking.
  // Kept for backwards compatibility with server.js call.
}

function initSentryErrorHandler(app) {
  // Sentry error handler — must be registered after all routes
  Sentry.setupExpressErrorHandler(app, {
    shouldHandleError(error) {
      if (error.status && error.status < 500) return false;
      return true;
    },
  });
}

module.exports = { initSentry, initSentryErrorHandler };
