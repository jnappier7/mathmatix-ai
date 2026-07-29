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
  };
}

/** Test/maintenance hook — clears the ring. */
function reset() {
  ring.fill(undefined);
  cursor = 0;
  total = 0;
}

module.exports = {
  recordVerification,
  classifyOutcome,
  classifyResolver,
  snapshot,
  aggregate,
  reset,
  OUTCOMES,
};
