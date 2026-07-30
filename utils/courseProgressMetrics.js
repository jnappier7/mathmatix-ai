// utils/courseProgressMetrics.js
// In-memory metrics for COURSE PROGRESSION — did this turn move the lesson
// forward, and if not, why?
//
// Ring buffer, no Mongo, no new infra — mirrors utils/verifyMetrics.js and
// utils/structuredTutorMetrics.js. Surfaced read-only on the admin metrics
// endpoint, and every record is emitted as a structured `course_progress` log
// line so Better Stack can aggregate the advance rate over time.
//
// WHY THIS EXISTS: course progress silently could not advance on the live
// teaching path for an unknown stretch — students worked whole sittings at
// "0/11 modules · 0%" (owner report, 2026-07-29). Nothing alarmed, because
// nothing counted. `advanceRate` near zero while `evaluations` climbs is that
// failure, visible in one number. Treat a sustained advanceRate of 0 with a
// nonzero evaluation count as an outage, not a quiet quarter.

const logger = require('./logger').child({ module: 'courseProgressMetrics' });

const RING_SIZE = 1000;
const ring = new Array(RING_SIZE);
let cursor = 0;
let total = 0;

// What happened to the lesson on this turn.
const OUTCOMES = [
  'advanced',        // scaffold step moved forward
  'module_complete', // last step cleared; module closed and next unlocked
  'held',            // evaluator says the student isn't done with this step yet
  'gate_blocked',    // step judged complete but the practice evidence gate refused
  'error',           // evaluator threw; the turn continued without progression
];

// How the completion decision was reached.
const MODES = ['deterministic', 'llm_eval', 'turn_count', 'explicit_tag', 'checkpoint', 'none'];

/**
 * Record one progression evaluation. Called from the single choke point
 * (pipeline/courseAdapter.advanceCourseProgress) so BOTH entry points —
 * /api/chat and /api/course-chat — land in the same counters.
 *
 * @param {Object} rec
 * @param {string} rec.outcome    one of OUTCOMES
 * @param {string} [rec.mode]     one of MODES
 * @param {string} [rec.courseId]
 * @param {string} [rec.moduleId]
 * @param {number} [rec.stepIndex]
 * @param {number} [rec.stepTotal]
 * @param {string} [rec.stepType]
 * @param {string} [rec.evidence] short human-readable reason
 */
function recordProgression(rec = {}) {
  const entry = {
    at: Date.now(),
    outcome: OUTCOMES.includes(rec.outcome) ? rec.outcome : 'error',
    mode: MODES.includes(rec.mode) ? rec.mode : 'none',
    courseId: rec.courseId || null,
    moduleId: rec.moduleId || null,
    stepIndex: Number.isInteger(rec.stepIndex) ? rec.stepIndex : null,
    stepTotal: Number.isInteger(rec.stepTotal) ? rec.stepTotal : null,
    stepType: rec.stepType || null,
    evidence: rec.evidence ? String(rec.evidence).slice(0, 200) : null,
  };

  ring[cursor] = entry;
  cursor = (cursor + 1) % RING_SIZE;
  total += 1;

  logger.info('course_progress', entry);
  return entry;
}

/** Most recent `limit` records, newest first. */
function snapshot(limit = 50) {
  const out = [];
  for (let i = 1; i <= Math.min(limit, RING_SIZE, total); i++) {
    const idx = (cursor - i + RING_SIZE) % RING_SIZE;
    if (ring[idx]) out.push(ring[idx]);
  }
  return out;
}

/**
 * Aggregate the ring.
 *
 * `advanceRate` is the headline: of the turns where progression was evaluated,
 * what fraction moved the lesson (advanced + module_complete)? A course that
 * teaches should sit well above zero.
 */
function aggregate() {
  const byOutcome = Object.fromEntries(OUTCOMES.map(o => [o, 0]));
  const byMode = Object.fromEntries(MODES.map(m => [m, 0]));
  const byCourse = {};
  let evaluations = 0;

  for (let i = 0; i < RING_SIZE; i++) {
    const e = ring[i];
    if (!e) continue;
    evaluations += 1;
    byOutcome[e.outcome] = (byOutcome[e.outcome] || 0) + 1;
    byMode[e.mode] = (byMode[e.mode] || 0) + 1;
    if (e.courseId) {
      byCourse[e.courseId] = byCourse[e.courseId] || { evaluations: 0, moved: 0 };
      byCourse[e.courseId].evaluations += 1;
      if (e.outcome === 'advanced' || e.outcome === 'module_complete') {
        byCourse[e.courseId].moved += 1;
      }
    }
  }

  const moved = byOutcome.advanced + byOutcome.module_complete;
  const advanceRate = evaluations > 0 ? +(moved / evaluations).toFixed(3) : null;

  return {
    totalRecorded: total,
    inRing: evaluations,
    advanceRate,
    // The alarm condition this module exists for.
    stalled: evaluations >= 20 && moved === 0,
    byOutcome,
    byMode,
    byCourse,
  };
}

function reset() {
  ring.fill(undefined);
  cursor = 0;
  total = 0;
}

module.exports = {
  recordProgression,
  snapshot,
  aggregate,
  reset,
  OUTCOMES,
  MODES,
};
