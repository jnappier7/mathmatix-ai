'use strict';
/* ============================================================
   engagementEvent.schema.js — the neutral events elements EMIT.

   Elements never award XP or fire celebrations themselves. They
   emit a neutral LearningEvent; the central EngagementEngine decides
   tier/sound/XP — the one place the "reward effort, not correctness"
   rule lives, so it's auditable, rate-limited, and farm-proof
   (spec §3.10 ownership rule).

   `type` is the ONLY thing that matters for reward; validity of the
   underlying move is irrelevant here (a thoughtful WRONG attempt can
   still earn encouragement).
   ============================================================ */

const { makeValidator } = require('./_validator');
const { LEARNING_EVENT_TYPES } = require('../constants/commandTypes');

const LearningEvent = makeValidator('LearningEvent', {
  type:      { type: 'string', required: true, enum: LEARNING_EVENT_TYPES },
  elementId: { type: 'string', required: false },
  // 0..1 — how hard the moment was (used to scale reward, not to gate it)
  difficulty: { type: 'number', required: false },
  attempts:   { type: 'number', required: false },
  at:         { type: 'iso', required: false },
});

module.exports = { LearningEvent };
