// utils/verifyMetrics.js
// In-memory metrics for the LLM answer-verifier — the small, parallel "second
// LLM call" that checks a student's answer in utils/pipeline/llmVerifier.js.
//
// Ring buffer, no Mongo, no new infra — mirrors utils/voiceMetrics.js and
// utils/structuredTutorMetrics.js. Surfaced read-only on the admin metrics
// endpoint. Every record is also emitted as a structured `llm_verify` log line
// so Better Stack / Logtail can aggregate the unverifiable rate over time.

const logger = require('./logger').child({ module: 'verifyMetrics' });

const RING_SIZE = 1000;
const ring = new Array(RING_SIZE);
let cursor = 0;
let total = 0;

// Outcome taxonomy for one verification attempt.
const OUTCOMES = [
  'verified_correct',   // judge resolved: student answer is correct
  'verified_incorrect', // judge resolved: student answer is wrong
  'low_confidence',     // judge ran but below the confidence threshold (no usable verdict)
  'unverifiable',       // could not compute/parse a verdict (not a missing-input case)
  'error',              // missing input or upstream failure
];

/**
 * Map a verifier verdict to a single outcome bucket.
 * @param {{isCorrect:(boolean|null), error:(string|null)}} verdict
 * @returns {string} one of OUTCOMES
 */
function classifyOutcome(verdict) {
  if (!verdict) return 'error';
  if (verdict.isCorrect === true) return 'verified_correct';
  if (verdict.isCorrect === false) return 'verified_incorrect';
  // isCorrect === null from here on.
  if (verdict.error) {
    return verdict.error === 'missing_input' ? 'error' : 'unverifiable';
  }
  // Judge ran, no error, but confidence was below threshold.
  return 'low_confidence';
}

/**
 * Which tier actually produced a resolved verdict. The LLM verifier runs the
 * deterministic CAS first and tags those verdicts `symbolic:<method>` in the
 * rationale, so the split is readable off the verdict without new plumbing.
 * This is the baseline for any "should we widen the CAS" decision: it says how
 * much the symbolic tier is already carrying.
 * @param {Object} verdict
 * @returns {string|null} 'symbolic' | 'llm' | null (nothing was resolved)
 */
function classifyResolver(verdict) {
  if (!verdict || verdict.isCorrect === null || verdict.isCorrect === undefined) return null;
  return /^symbolic:/.test(String(verdict.rationale || '')) ? 'symbolic' : 'llm';
}

/**
 * Record one verification attempt.
 * @param {Object} args
 * @param {Object} args.verdict - the (possibly escalated) verifier verdict
 * @param {boolean} [args.escalated] - whether the stronger judge was invoked
 * @param {boolean} [args.escalationResolved] - whether escalation produced a verdict
 * @param {string|null} [args.tier] - the model that produced the final verdict
 * @param {number|null} [args.latencyMs] - wall-clock of the verification
 * @param {string|null} [args.mathType] - mathSolver's parse type for the posed
 *   problem ('quadratic_equation', 'derivative', … or 'unparsed'). The ranking
 *   key: without it the ring says how often verification fails but not on what,
 *   so coverage work is guesswork. Never the problem text itself — a bounded
 *   taxonomy label carries no student content into the logs.
 * @param {string|null} [args.skillId] - active skill, when the turn has one
 * @returns {Object} the stored record
 */
function recordVerification({
  verdict,
  escalated = false,
  escalationResolved = false,
  tier = null,
  latencyMs = null,
  mathType = null,
  skillId = null,
} = {}) {
  const outcome = classifyOutcome(verdict);
  const rec = {
    t: Date.now(),
    outcome,
    escalated: !!escalated,
    escalationResolved: !!escalationResolved,
    tier,
    resolvedBy: classifyResolver(verdict),
    mathType,
    skillId,
    confidence: verdict && typeof verdict.confidence === 'number' ? verdict.confidence : null,
    latencyMs,
  };
  ring[cursor] = rec;
  cursor = (cursor + 1) % RING_SIZE;
  total += 1;
  // Structured log → Logtail/Better Stack. Cheap; one line per answer attempt.
  logger.info('llm_verify', rec);
  return rec;
}

/** Most-recent records, newest first. */
function snapshot(limit = 100) {
  const out = [];
  const count = Math.min(total, RING_SIZE);
  for (let i = 1; i <= count && out.length < limit; i++) {
    const idx = (cursor - i + RING_SIZE) % RING_SIZE;
    if (ring[idx]) out.push(ring[idx]);
  }
  return out;
}

/**
 * Aggregate over the records currently in the ring. The headline number is
 * `unverifiableRate` — the share of answer attempts the engine could not give
 * a usable correct/incorrect verdict on, which is the gap escalation is meant
 * to shrink.
 */
function aggregate() {
  const records = snapshot(RING_SIZE);
  const n = records.length;
  const byOutcome = Object.fromEntries(OUTCOMES.map((o) => [o, 0]));
  const byResolver = { symbolic: 0, llm: 0 };
  const perType = new Map();
  let escalated = 0;
  let escalationResolved = 0;
  for (const r of records) {
    byOutcome[r.outcome] = (byOutcome[r.outcome] || 0) + 1;
    if (r.resolvedBy) byResolver[r.resolvedBy] = (byResolver[r.resolvedBy] || 0) + 1;
    if (r.escalated) escalated += 1;
    if (r.escalated && r.escalationResolved) escalationResolved += 1;
    const key = r.mathType || 'unknown';
    const bucket = perType.get(key) || { mathType: key, attempts: 0, unresolved: 0 };
    bucket.attempts += 1;
    if (r.outcome === 'low_confidence' || r.outcome === 'unverifiable') bucket.unresolved += 1;
    perType.set(key, bucket);
  }
  // The actionable output: which problem classes burn the unverifiable budget,
  // ranked by absolute count so the top of the list is where widening the CAS
  // (or adding a solver type) buys the most resolved turns — not by rate, which
  // would float a type seen twice above one seen two hundred times.
  const unresolvedByMathType = [...perType.values()]
    .filter((b) => b.unresolved > 0)
    .map((b) => ({ ...b, unresolvedRate: Number((b.unresolved / b.attempts).toFixed(4)) }))
    .sort((a, b) => b.unresolved - a.unresolved);
  const resolved = byOutcome.verified_correct + byOutcome.verified_incorrect;
  const unresolved = byOutcome.low_confidence + byOutcome.unverifiable;
  const rate = (x) => (n > 0 ? Number((x / n).toFixed(4)) : 0);
  return {
    sampleSize: n,
    totalEver: total,
    byOutcome,
    resolvedRate: rate(resolved),
    unverifiableRate: rate(unresolved),
    errorRate: rate(byOutcome.error),
    escalationRate: rate(escalated),
    // Of the attempts we escalated, how often did the stronger judge resolve them?
    escalationResolveRate: escalated > 0 ? Number((escalationResolved / escalated).toFixed(4)) : 0,
    escalated,
    escalationResolved,
    byResolver,
    unresolvedByMathType,
    // Not derived from the ring — live provider state. It rides along here
    // because every consumer of unverifiableRate needs it to read the number:
    // a rate measured while tier 1 is self-grading means something different
    // from the same rate measured across two providers.
    crossProvider: crossProviderHealth(),
  };
}

// ── Cross-provider health ───────────────────────────────────────────────────
// The verifier exists to be a SECOND opinion: the model grading the tutor's
// answer must not be the model that wrote it. llmVerifier pins tier 1 to
// claude-haiku-4-5 while generate runs TUTOR_MODEL (gpt-4o-mini today), and
// that split is the entire value of the check.
//
// It can be lost without anything breaking. An unfunded Anthropic balance or a
// bad key is a terminal 4xx, which openaiClient deliberately does not fail over,
// so llmVerifier's verifierCall catches it and retries on gpt-4o-mini — the
// SAME model as generate. Grading keeps working, verdicts keep the same shape,
// nothing throws, and the cross-check is gone: gpt-4o-mini grading gpt-4o-mini.
// Before this, the only trace was one console.error line per call.
//
// `degraded` is live state, not a counter: it goes true on a fallback and false
// again on the next Claude call that succeeds, so funding the account clears it
// without a restart and without a timer that could lie in either direction.
const crossProvider = {
  degraded: false,
  fallbacks: 0,
  lastFallbackAt: null,
  lastFallbackStatus: null,
  lastFallbackMessage: null,
  lastOkAt: null,
};

/** The Claude verifier refused the call and we fell back to the tutor's model. */
function noteCrossProviderFallback({ status = null, message = null } = {}) {
  crossProvider.degraded = true;
  crossProvider.fallbacks += 1;
  crossProvider.lastFallbackAt = Date.now();
  crossProvider.lastFallbackStatus = status;
  // Bounded: provider error strings are short, but they are third-party text
  // heading for an admin page and a public health payload.
  crossProvider.lastFallbackMessage = message ? String(message).slice(0, 300) : null;
  logger.warn('llm_verify_cross_provider_fallback', {
    status, fallbacks: crossProvider.fallbacks,
  });
  return { ...crossProvider };
}

/** A Claude verifier call went through — the cross-check is intact again. */
function noteCrossProviderOk() {
  const wasDegraded = crossProvider.degraded;
  crossProvider.degraded = false;
  crossProvider.lastOkAt = Date.now();
  if (wasDegraded) {
    logger.info('llm_verify_cross_provider_recovered', { fallbacks: crossProvider.fallbacks });
  }
  return { ...crossProvider };
}

/**
 * Current cross-provider state, for /api/health and the admin panels.
 * `provider` is what tier 1 is actually running on right now, which is the
 * one-word answer to "is the verifier still a second opinion?".
 */
function crossProviderHealth() {
  return {
    ...crossProvider,
    provider: crossProvider.degraded ? 'fallback' : 'claude',
  };
}

/** Test/maintenance hook — clears the ring. */
function reset() {
  ring.fill(undefined);
  cursor = 0;
  total = 0;
  crossProvider.degraded = false;
  crossProvider.fallbacks = 0;
  crossProvider.lastFallbackAt = null;
  crossProvider.lastFallbackStatus = null;
  crossProvider.lastFallbackMessage = null;
  crossProvider.lastOkAt = null;
}

module.exports = {
  recordVerification,
  noteCrossProviderFallback,
  noteCrossProviderOk,
  crossProviderHealth,
  classifyOutcome,
  classifyResolver,
  snapshot,
  aggregate,
  reset,
  OUTCOMES,
};
