// utils/healthReport.js
//
// One definition of "is this instance healthy", shared by the two endpoints
// that answer the question for different audiences:
//
//   GET /api/health              public, unauthenticated, polled by Render
//   GET /api/admin/health-check  admin, drives the dashboard's System Status panel
//
// It lives in its own module because the two used to disagree by construction.
// The public one checked OPENAI and MATHPIX keys; the admin one returned the
// literal string 'Operational' and looked at nothing at all. Neither watched
// Anthropic, which is a production dependency even with TUTOR_MODEL on OpenAI —
// llmVerifier hard-pins tier 1 of the answer verifier to claude-haiku-4-5 and
// does not read TUTOR_MODEL. So an unfunded Anthropic account degraded grading
// across the whole product and every health surface stayed green.

const { crossProviderHealth, aggregate } = require('./verifyMetrics');

const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

/**
 * Which third-party keys are configured on this instance.
 *
 * ANTHROPIC is required, not optional: see the module note. MATHPIX is reported
 * but not required — OCR failing degrades photo upload, not tutoring.
 */
function providerKeys() {
  return {
    openai: process.env.OPENAI_API_KEY ? 'ok' : 'missing',
    anthropic: process.env.ANTHROPIC_API_KEY ? 'ok' : 'missing',
    mathpix: (process.env.MATHPIX_APP_ID && process.env.MATHPIX_APP_KEY) ? 'ok' : 'missing',
  };
}

/** The keys whose absence is a degradation, as opposed to a note. */
const REQUIRED_KEYS = ['openai', 'anthropic'];

/** Names of the required keys that are missing. Empty array is the happy path. */
function missingRequiredKeys(keys = providerKeys()) {
  return REQUIRED_KEYS.filter((k) => keys[k] !== 'ok');
}

/**
 * The answer verifier's cross-provider state.
 *
 * This is the check a key-presence test cannot make. In the failure that
 * prompted this module the key was present and valid and the BALANCE was empty:
 * every verifier call took a terminal 400, verifierCall fell back to
 * gpt-4o-mini — which is TUTOR_MODEL — and the model grading the tutor's answer
 * became the model that wrote it. Grading continued, verdicts kept their shape,
 * nothing threw. Only observed state can see that.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.includeDetail] - add the provider's own error text and
 *   the verifier's outcome rates. Admin surfaces only: the error string is
 *   third-party prose and /api/health is unauthenticated.
 */
function verifierReport({ includeDetail = false } = {}) {
  const cp = crossProviderHealth();
  const base = {
    status: cp.degraded ? 'degraded' : 'ok',
    crossProvider: cp.provider,
    degraded: cp.degraded,
    fallbacks: cp.fallbacks,
    lastFallbackAt: iso(cp.lastFallbackAt),
    lastFallbackStatus: cp.lastFallbackStatus,
  };
  if (!includeDetail) return base;
  const agg = aggregate();
  return {
    ...base,
    lastFallbackMessage: cp.lastFallbackMessage,
    // Reported next to the cross-provider state on purpose: the same
    // unverifiableRate means two different things depending on whether the
    // verdicts behind it came from an independent model or from the tutor's own.
    unverifiableRate: agg.unverifiableRate,
    resolvedRate: agg.resolvedRate,
    sampleSize: agg.sampleSize,
  };
}

/**
 * Is anything wrong that an operator should act on?
 *
 * DEGRADED IS NOT UNHEALTHY, and the distinction is load-bearing: /api/health
 * answers 503 for 'unhealthy' and Render stops routing to a 503. A verifier
 * grading without independence, or a missing key, is a real problem and a
 * reason to page someone — it is not a reason to take a serving instance out of
 * rotation, which would turn a quality regression into an outage.
 */
function isDegraded({ dbConnected = true } = {}) {
  return !dbConnected
    || missingRequiredKeys().length > 0
    || crossProviderHealth().degraded;
}

module.exports = {
  providerKeys,
  missingRequiredKeys,
  verifierReport,
  isDegraded,
  REQUIRED_KEYS,
};
