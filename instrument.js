// instrument.js — Sentry initialization (must load before all other modules)
// Loaded via --require in the start script so Sentry can hook into modules early.
const Sentry = require('@sentry/node');
const { scrubEvent } = require('./utils/sentryScrub');

Sentry.init({
  dsn: process.env.SENTRY_DSN || 'https://67c6229fdb39e2cfd2e556527f7b95b1@o4511100444016640.ingest.us.sentry.io/4511100447162368',
  environment: process.env.NODE_ENV || 'development',
  // OFF, deliberately. With this on, every captured 5xx shipped the request's
  // cookies (session id), headers, body and client IP to Sentry — and the body
  // of a chat request is a child's message. Nothing disclosed Sentry as a
  // recipient of any of that. Keep it off; beforeSend below is the backstop.
  // Pinned by tests/unit/sentryPii.test.js and disclosed on
  // public/subprocessors.html — change all three together or not at all.
  sendDefaultPii: false,
  beforeSend: scrubEvent,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: 0,
  ignoreErrors: [
    'CSRF token',
    'Rate limit',
    'Cast to ObjectId failed',
  ],
});
