// utils/conversionEvents.js — record freemium-funnel events
//
// Single entry point for logging conversion "wall" events. Two design rules:
//   1. NEVER block or fail the request it's called from — always fire-and-forget
//      and swallow errors (telemetry must not break tutoring or billing).
//   2. Write to BOTH Mongo (queryable rows) and Winston (Better Stack dashboards)
//      so the data is usable immediately without extra tooling.

const ConversionEvent = require('../models/conversionEvent');
const logger = require('./logger').child({ module: 'conversion' });

/**
 * Record a conversion-funnel event. Fire-and-forget: returns immediately and
 * persists in the background; callers should NOT await this in a hot path.
 *
 * @param {string} event      One of ConversionEvent.CONVERSION_EVENTS.
 * @param {object} [opts]
 * @param {string|object} [opts.userId]     Mongo user id for authenticated events.
 * @param {string} [opts.sessionKey]        Anonymized session id for anonymous events.
 * @param {object} [opts.context]           Non-PII context payload.
 */
function recordConversionEvent(event, opts = {}) {
  const { userId = null, sessionKey = null, context = {} } = opts;

  // Structured log line first — cheap, synchronous, always lands even if the DB
  // write is slow or fails.
  logger.info(`[conversion] ${event}`, {
    conversionEvent: event,
    userId: userId ? String(userId) : undefined,
    sessionKey: sessionKey || undefined,
    ...context,
  });

  // Durable row — background, best-effort.
  ConversionEvent.create({ event, userId, sessionKey, context })
    .catch((err) => {
      logger.warn(`[conversion] failed to persist ${event}: ${err.message}`);
    });
}

module.exports = { recordConversionEvent };
