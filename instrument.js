// instrument.js — Sentry initialization (must load before all other modules)
// Loaded via --require in the start script so Sentry can hook into modules early.
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN || 'https://67c6229fdb39e2cfd2e556527f7b95b1@o4511100444016640.ingest.us.sentry.io/4511100447162368',
  environment: process.env.NODE_ENV || 'development',
  sendDefaultPii: true,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: 0,
  ignoreErrors: [
    'CSRF token',
    'Rate limit',
    'Cast to ObjectId failed',
  ],
});
