'use strict';
/* ============================================================
   moveTypes.js — vocabulary for StudentMove / VerifiedMove.

   Split by authority:
     - SOURCES/MODES/GESTURE/POINTER + intents are CLIENT-declared
       (descriptive: what the student did / how).
     - MATH_CLASSIFICATIONS are SERVER-assigned (judgmental: what
       the move means mathematically). The client never sets these.
       See spec §3.4 — "client proposes, server disposes".
   ============================================================ */

// How the move entered the system.
const MOVE_SOURCES = Object.freeze(['gesture', 'keyboard', 'voice', 'upload']);

// What KIND of move it is — separates doing-math from housekeeping.
//   attempt     → a mathematical claim (enters diagnose as a step)
//   exploration → poking around; NOT an answer attempt (no answer-injection)
//   reposition  → moved an element in space; no math changed
//   undo        → revert the previous move
const MOVE_MODES = Object.freeze(['attempt', 'exploration', 'reposition', 'undo']);

const GESTURE_TYPES = Object.freeze(['drag', 'drop', 'tap', 'draw', 'edit']);
const POINTER_TYPES = Object.freeze(['mouse', 'touch', 'pen', 'keyboard']);

// Canonical intents the CLIENT may declare per element. First release =
// the algebra-tile engine set (spec P2). Extend as elements are added.
const TILE_INTENTS = Object.freeze([
  'combine_like_terms',
  'create_zero_pair',
  'remove_zero_pair',
  'move_group',
  'split_group',
  'select_group',
  'undo',
]);

// The SERVER's verdict on what the move means. NOT client-settable.
const MATH_CLASSIFICATIONS = Object.freeze([
  'combine_like_terms',    // valid
  'combine_unlike_terms',  // the classic misconception — coach, don't reject
  'create_zero_pair',      // valid
  'no_op',                 // nothing mathematically happened (e.g. reposition)
  'invalid_interaction',   // physics-invalid (dropped into empty space) → snap back
  // Concept-model exploration (spec §6.9): the server's judgment of whether a
  // manipulation MEANT something mathematically. Neither is a correctness
  // claim — exploration never carries one.
  'meaningful_exploration', // settled, directional param change — evidence-worthy
  'noise',                  // jitter / no-change scrubbing — recorded, never credited
  // Scaffold-blank fills on an equation card (owner call 2026-07-28 —
  // interactive blanks return, through the StudentMove contract this time).
  'blank_fill_valid',       // CAS-settled: the filled equation holds
  'blank_fill_incorrect',   // CAS-settled: it does not
  'blank_fill_unverified',  // CAS abstained — the delegated tutor turn decides
]);

module.exports = {
  MOVE_SOURCES,
  MOVE_MODES,
  GESTURE_TYPES,
  POINTER_TYPES,
  TILE_INTENTS,
  MATH_CLASSIFICATIONS,
};
