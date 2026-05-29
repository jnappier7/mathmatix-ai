// utils/structuredTutorMetrics.js
// Per-turn observability for the structured-tutor-response path
// (STRUCTURED_TUTOR_RESPONSE). In-memory ring buffer + cumulative
// counters — no Mongo, no new infra. Reset on process restart; scraped
// via GET /api/admin/structured-tutor-metrics.
//
// Why this exists
// ---------------
// The turn_type audit (turnTypeAudit.js) logs each mismatch one line at a
// time, and Stage 5c.1's pose backfill is silent. With the flag still
// dark there is no aggregated view of the two numbers that decide whether
// STRUCTURED_TUTOR_RESPONSE is safe to flip on:
//
//   1. How often does the model misclassify the turn? (mismatch rates,
//      split hard vs. soft, broken out by kind)
//   2. How often must Stage 5c.1 backfill a pose the model forgot, and
//      does the backfill succeed? (backfill rate + outcome)
//
// This module turns those scattered logs into rates. It is a passive
// recorder: it never touches board_commands or the response.

'use strict';

const logger = require('./logger').child({ module: 'structuredTutorMetrics' });

const RING_SIZE = 1000;
let ring = new Array(RING_SIZE);
let cursor = 0;

// Cumulative since process start. The ring is for recent inspection;
// these counters drive the rollout decision.
let counters = freshCounters();

function freshCounters() {
  return {
    turns: 0, // structured turns recorded (one per flag-on tutor turn)
    turn_type: { _total: 0 }, // keyed by declared turn_type
    mismatch_hard: { _total: 0 }, // keyed by mismatch kind
    mismatch_soft: { _total: 0 }, // keyed by mismatch kind
    turns_with_hard: 0, // turns carrying >= 1 hard mismatch
    turns_with_soft: 0, // turns carrying >= 1 soft mismatch
    clean_turns: 0, // turns with zero mismatches
    // Stage 5c.1 outcomes. `attempted` counts turns that entered the
    // backfill branch (problem_introduction with no surviving pose).
    backfill: {
      attempted: 0,
      posed: 0, // a verbatim pose was synthesized + survived the guard
      no_posable_problem: 0, // nothing posable in student/tutor text
      guard_dropped: 0, // synthesized pose, but pedagogy guard dropped it
    },
  };
}

/**
 * Record one structured tutor turn. Called once per turn from the
 * pipeline when generate() returned a structured turn_type.
 *
 * @param {object} input
 * @param {string|null} input.turnType - The model's declared turn_type.
 * @param {number} [input.llmBoardCount] - Board commands the LLM emitted
 *   (pre-synthesis), for context on how empty the model left the board.
 * @param {Array<{severity:string, kind:string}>} [input.mismatches] -
 *   Output of auditTurn().
 * @param {('posed'|'no_posable_problem'|'guard_dropped'|null)} [input.backfill]
 *   - Stage 5c.1 outcome, or null if the backfill branch didn't fire.
 * @returns {object} The stored record.
 */
function recordStructuredTurn({ turnType, llmBoardCount = 0, mismatches = [], backfill = null } = {}) {
  counters.turns++;

  const typeKey = turnType == null ? 'null' : String(turnType);
  counters.turn_type[typeKey] = (counters.turn_type[typeKey] || 0) + 1;
  counters.turn_type._total++;

  const hard = [];
  const soft = [];
  for (const m of Array.isArray(mismatches) ? mismatches : []) {
    if (!m || !m.kind) continue;
    if (m.severity === 'hard') {
      hard.push(m.kind);
      counters.mismatch_hard[m.kind] = (counters.mismatch_hard[m.kind] || 0) + 1;
      counters.mismatch_hard._total++;
    } else {
      soft.push(m.kind);
      counters.mismatch_soft[m.kind] = (counters.mismatch_soft[m.kind] || 0) + 1;
      counters.mismatch_soft._total++;
    }
  }
  if (hard.length) counters.turns_with_hard++;
  if (soft.length) counters.turns_with_soft++;
  if (!hard.length && !soft.length) counters.clean_turns++;

  if (backfill) {
    counters.backfill.attempted++;
    if (Object.prototype.hasOwnProperty.call(counters.backfill, backfill)
        && backfill !== 'attempted') {
      counters.backfill[backfill]++;
    }
  }

  const rec = {
    ts: Date.now(),
    turnType: typeKey,
    llmBoardCount,
    hard,
    soft,
    backfill: backfill || null,
  };
  ring[cursor] = rec;
  cursor = (cursor + 1) % RING_SIZE;

  // Sample 1-of-25 to logs so a flag-on session leaves a breadcrumb trail
  // without flooding; always log a turn that needed a hard backfill.
  if (backfill === 'posed' || backfill === 'guard_dropped' || counters.turns % 25 === 0) {
    logger.info('structured_turn', {
      turnType: rec.turnType,
      hard: hard.length,
      soft: soft.length,
      backfill: rec.backfill,
    });
  }

  return rec;
}

/**
 * Most-recent records, newest first. For ad-hoc inspection in the admin
 * endpoint; the rates in aggregate() are what drive decisions.
 */
function snapshot(limit = 100) {
  const out = [];
  const n = Math.min(limit, RING_SIZE);
  for (let i = 0; i < n; i++) {
    const idx = (cursor - 1 - i + RING_SIZE) % RING_SIZE;
    if (ring[idx]) out.push(ring[idx]);
  }
  return out;
}

/**
 * Cumulative counters with computed rates. This is the rollout dashboard.
 */
function aggregate() {
  const n = counters.turns;
  const rate = (x) => (n > 0 ? x / n : null);
  return {
    turns: n,
    turn_type: { ...counters.turn_type },
    mismatch: {
      hard: { ...counters.mismatch_hard },
      soft: { ...counters.mismatch_soft },
      hard_turn_rate: rate(counters.turns_with_hard),
      soft_turn_rate: rate(counters.turns_with_soft),
      clean_turn_rate: rate(counters.clean_turns),
    },
    backfill: {
      ...counters.backfill,
      // Of the turns that entered the backfill branch, the share that
      // produced a usable pose. The headline "did Phase 5 save the board"
      // number.
      pose_success_rate: counters.backfill.attempted > 0
        ? counters.backfill.posed / counters.backfill.attempted
        : null,
      // Backfill branch entries as a share of all structured turns.
      attempt_rate: rate(counters.backfill.attempted),
    },
  };
}

/** Test-only: wipe ring + counters. */
function reset() {
  ring = new Array(RING_SIZE);
  cursor = 0;
  counters = freshCounters();
}

module.exports = {
  recordStructuredTurn,
  snapshot,
  aggregate,
  reset,
};
