// config/sentry.js — Sentry error monitoring
// Set SENTRY_DSN env var to enable. Without it, Sentry is a no-op.
const Sentry = require('@sentry/node');

function initSentry(app) {
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: 0,
    ignoreErrors: [
      // Don't report expected client errors
      'CSRF token',
      'Rate limit',
      'Cast to ObjectId failed',
    ],
    beforeSend(event) {
      // Strip PII from error reports
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      return event;
    },
  });

  // Request handler — must be first middleware
  app.use(Sentry.Handlers.requestHandler({
    user: ['id', 'role'],
  }));

  return Sentry;
}

function initSentryErrorHandler(app) {
  if (!process.env.SENTRY_DSN) return;

  // Error handler — must be after all routes, before other error handlers
  app.use(Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Only report 5xx errors (not 4xx client errors)
      if (error.status && error.status < 500) return false;
      return true;
    },
  }));
}

module.exports = { initSentry, initSentryErrorHandler };
