'use strict';
/* ============================================================
   commandTypes.js — server → client render commands.

   Two families, kept separate so presence logic never leaks
   into math elements (spec §3.9, critique point 13):
     - PRESENCE_COMMANDS: the tutor's "body" (point, circle, pause).
       Always skippable; reduced-motion gets static equivalents.
     - LEARNING_EVENT_TYPES: neutral signals elements EMIT; the
       central EngagementEngine — not the element — decides reward
       (spec §3.10 ownership rule).
   ============================================================ */

// Tutor presence / annotation (P8). Advisory: the student can always
// interact through them; they never block input.
const PRESENCE_COMMANDS = Object.freeze([
  'move_pointer',  // ghost cursor travels to a target
  'circle',        // hand-drawn circle around a region
  'underline',     // underline a token
  'check',         // draw a checkmark
  'pause',         // "write half, pause, invite" beat
  'focus',         // bring an element into view / frame it
]);

// Neutral events elements emit → consumed by the EngagementEngine.
// NB: these describe EFFORT/THINKING, not correctness (the juice rule).
const LEARNING_EVENT_TYPES = Object.freeze([
  'student_attempted',
  'student_persisted',
  'student_self_corrected',
  'student_explained',
  'student_used_hint',
  'student_completed_hard_step',
  'student_completed_problem',
]);

// EngagementEngine outputs (reference; the engine owns the mapping).
const ENGAGEMENT_TIERS = Object.freeze([
  'none',
  'micro_ack',
  'warm_pulse',
  'spark',
  'confetti',
  'celebration',
]);

module.exports = { PRESENCE_COMMANDS, LEARNING_EVENT_TYPES, ENGAGEMENT_TIERS };
