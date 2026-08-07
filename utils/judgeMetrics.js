// utils/judgeMetrics.js
// In-memory metrics for the reply judges (utils/replyJudges.js) running on LIVE
// tutor turns — pipeline Stage 5g scores every persisted reply against the
// failure classes the eval harness pins (rejected-correct-answer, false
// non-equivalence, imprecise terms, bad order-of-operations rules).
//
// This is the production half of the eval loop: the 10-scenario eval matrix
// says whether a failure class CAN happen; this ring says how often it DOES.
// A model or prompt change that moves a violation rate shows up here first.
//
// Ring buffer, no Mongo, no new infra — mirrors utils/verifyMetrics.js.
// Surfaced read-only on GET /api/admin/structured-tutor-metrics. Violations are
// also emitted as structured `reply_judge` log lines so Better Stack / Logtail
// can aggregate and alert over time. No student content is stored: evidence is
// the tutor-side matched marker phrase, never the student's message.

const logger = require('./logger').child({ module: 'judgeMetrics' });

const RING_SIZE = 1000;
const ring = new Array(RING_SIZE);
let cursor = 0;
let total = 0;

/**
 * Record one judged tutor turn.
 * @param {Object} args
 * @param {Array<{judge: string, evidence: string}>} args.violations - judge hits
 *   on this turn (empty array = clean turn; still recorded, it's the denominator)
 * @param {boolean} args.studentWasCorrect - the ctx the correctness-gated judges ran with
 * @param {string|null} [args.action] - the decide-stage action for the turn
 * @param {string|null} [args.skillId] - active skill, when the turn has one
 * @returns {Object} the stored record
 */
function recordJudgedTurn({ violations = [], studentWasCorrect = false, action = null, skillId = null } = {}) {
  const rec = {
    t: Date.now(),
    violated: violations.length > 0,
    judges: violations.map((v) => v.judge),
    evidence: violations.map((v) => String(v.evidence || '').slice(0, 160)),
    studentWasCorrect: !!studentWasCorrect,
    action,
    skillId,
  };
  ring[cursor] = rec;
  cursor = (cursor + 1) % RING_SIZE;
  total += 1;
  // Only violations get a log line — clean turns would be noise at chat volume.
  if (rec.violated) {
    logger.warn('reply_judge', rec);
  }
  return rec;
}

/** Most-recent records, newest first. Pass violationsOnly to skip clean turns. */
function snapshot(limit = 100, { violationsOnly = false } = {}) {
  const out = [];
  const count = Math.min(total, RING_SIZE);
  for (let i = 1; i <= count && out.length < limit; i++) {
    const idx = (cursor - i + RING_SIZE) % RING_SIZE;
    if (!ring[idx]) continue;
    if (violationsOnly && !ring[idx].violated) continue;
    out.push(ring[idx]);
  }
  return out;
}

/**
 * Aggregate over the records currently in the ring. The headline number is
 * `violationRate` — the share of tutor turns that tripped ANY judge — and
 * `rejectedCorrectRate`, the same for the single worst class (doubting a
 * verified-correct answer), computed against its own denominator: turns where
 * the student actually WAS correct.
 */
function aggregate() {
  const records = snapshot(RING_SIZE);
  const n = records.length;
  const byJudge = {};
  let violated = 0;
  let correctTurns = 0;
  let rejectedCorrect = 0;
  for (const r of records) {
    if (r.violated) violated += 1;
    if (r.studentWasCorrect) correctTurns += 1;
    for (const j of r.judges) {
      byJudge[j] = (byJudge[j] || 0) + 1;
      if (j === 'rejectedCorrectAnswer') rejectedCorrect += 1;
    }
  }
  const rate = (x, d) => (d > 0 ? Number((x / d).toFixed(4)) : 0);
  return {
    sampleSize: n,
    totalEver: total,
    violated,
    violationRate: rate(violated, n),
    byJudge,
    // The doubt-on-correct rate against the turns where doubt was even possible.
    correctAnswerTurns: correctTurns,
    rejectedCorrectRate: rate(rejectedCorrect, correctTurns),
  };
}

/** Test/maintenance hook — clears the ring. */
function reset() {
  ring.fill(undefined);
  cursor = 0;
  total = 0;
}

module.exports = {
  recordJudgedTurn,
  snapshot,
  aggregate,
  reset,
};
