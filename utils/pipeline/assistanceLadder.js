/**
 * assistanceLadder.js — the 11-level assistance ladder (Live Workspace spec §12).
 *
 * "Mathmatix must record how much support was required. A correct result
 *  reached independently must generate stronger evidence than the same result
 *  reached after heavy tutoring."
 *
 * The pipeline already KNOWS how much it helped — decide.js picks the
 * instructional action and a 1–5 scaffold intensity, and the board emits
 * scaffold/example cards — but none of that was recorded as evidence. The
 * mastery engine's independence pillar ran on a word-scan proxy instead
 * (grepping the student's messages for "help/stuck"), reading the student's
 * words because nothing recorded the tutor's actions.
 *
 * This module maps the tutor's ACTUAL actions on a turn onto the spec ladder:
 *
 *    1 Independent            — problem posed / student works alone
 *    2 Encouragement only     — affirmation, celebration, empathy
 *    3 Directions restated    — clarifying what's being asked
 *    4 Attention cue          — redirect to the math / to a step
 *    5 Strategic question     — hint, probe, guided error-inspection
 *    6 Visual scaffold        — representation switch, graph/visual model
 *    7 Partial setup          — we-do, fill-in-the-blank scaffolds
 *    8 Parallel example       — worked example on DIFFERENT math
 *    9 Explicit instruction   — direct teaching, reteach, prerequisite review
 *   10 Tutor-modeled step     — tutor does a step OF THE STUDENT'S problem
 *   11 Tutor-completed solution
 *
 * Levels 10–11 are deliberately unmapped: the anti-cheat gauntlet forbids the
 * tutor from working the student's own problem (worked examples are parallel
 * math by construction, and board apply/resolve cards mirror the student's own
 * verified moves). If those levels ever become reachable, something upstream
 * has broken containment — they exist in the ladder so the data model matches
 * the spec, not because the pipeline can legally produce them.
 *
 * A turn's level is the MAX of its signals; a problem's level is the MAX
 * across its turns (folded into boardLedger). Pure module, no side effects.
 */
'use strict';

const LADDER = {
  1: 'independent',
  2: 'encouragement_only',
  3: 'directions_restated',
  4: 'attention_cue',
  5: 'strategic_question',
  6: 'visual_scaffold',
  7: 'partial_setup',
  8: 'parallel_example',
  9: 'explicit_instruction',
  10: 'tutor_modeled_step',
  11: 'tutor_completed_solution',
};

// Levels 1–4 leave the thinking entirely with the student; 5+ is substantive
// help. This is the threshold the independence pillar counts against.
const INDEPENDENT_MAX = 4;

// decide.js ACTIONS → ladder level. Anything unlisted contributes level 1
// (no instructional support implied by the action itself).
const ACTION_LEVELS = {
  // student works / no help
  elicit_first: 1,
  present_problem: 1,
  independent_practice: 1,
  strengthen_challenge: 1,
  continue_conversation: 1,
  // affirmation & empathy
  confirm_correct: 2,
  acknowledge_progress: 2,
  acknowledge_frustration: 2,
  // restating / checking the ask
  check_understanding: 3,
  // attention cues
  redirect_to_math: 4,
  // strategic questions & hints
  hint: 5,
  probing_question: 5,
  guide_incorrect: 5,
  leverage_bridge: 5,
  // visual / representation support
  switch_representation: 6,
  // partial setup (we-do)
  guided_practice: 7,
  scaffold_down: 7,
  // parallel example (anti-cheat guarantees it is not the student's problem)
  worked_example: 8,
  // explicit teaching
  direct_instruction: 9,
  phase_instruction: 9,
  reteach_misconception: 9,
  review_prerequisite: 9,
  prerequisite_bridge: 9,
  exit_ramp: 9,
};

// Board cards the tutor drew this turn → ladder floor. scaffold cards are
// fill-in-the-blank partial setups (the guard REQUIRES a blank); example
// cards are parallel worked examples; the visual family supports level 6.
const BOARD_LEVELS = {
  scaffold: 7,
  example: 8,
  graph: 6,
  image: 6,
  diagram: 6,
  model: 6,
};

/**
 * The assistance level for one tutor turn: max of the decide action, the
 * board cards drawn, and a floor implied by heavy scaffold intensity.
 *
 * @param {object} signals
 * @param {string} [signals.decisionAction] - decision.action from decide.js
 * @param {number} [signals.scaffoldLevel] - decision.scaffoldLevel (1–5)
 * @param {Array}  [signals.boardCommands] - the turn's verified board commands
 * @returns {number} 1–11
 */
function assistanceLevelForTurn(signals) {
  const s = signals || {};
  let level = ACTION_LEVELS[s.decisionAction] || 1;

  for (const cmd of Array.isArray(s.boardCommands) ? s.boardCommands : []) {
    const floor = cmd && BOARD_LEVELS[cmd.action];
    if (floor && floor > level) level = floor;
  }

  // Heavy scaffold intensity means substantive help even when the action
  // reads mild (e.g. a "hint" pitched at maximum support).
  const intensity = Number(s.scaffoldLevel);
  if (intensity >= 5 && level < 6) level = 6;
  else if (intensity >= 4 && level < 5) level = 5;

  return level;
}

function assistanceLabel(level) {
  return LADDER[level] || null;
}

function isIndependent(level) {
  return !(Number(level) > INDEPENDENT_MAX);
}

/** Max-fold two levels; either side may be null/undefined. */
function maxAssistance(a, b) {
  const an = Number(a) || 0;
  const bn = Number(b) || 0;
  const m = Math.max(an, bn);
  return m > 0 ? m : null;
}

module.exports = {
  LADDER,
  INDEPENDENT_MAX,
  assistanceLevelForTurn,
  assistanceLabel,
  isIndependent,
  maxAssistance,
};
