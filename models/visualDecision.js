// models/visualDecision.js
// Training corpus for the Visual Gate (utils/visualGate.js). One document per
// graph/image board command the gate evaluated — the decision it made, the
// active-problem context, and (harvested later) the downstream learning
// outcome. This is the "moat": student state -> visual decision -> outcome.
//
// Raw rows auto-expire via a TTL index so the collection can't grow unbounded;
// promote/export corpus-worthy rows before expiry. The outcome label is only
// causally meaningful for rows logged in live_experimental (randomized) mode —
// shadow/audit rows capture the DECISION, not a clean outcome (see the gate's
// "Important Corpus Warning").

const mongoose = require('mongoose');

const visualDecisionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', index: true },
  turnIndex: { type: Number, default: null },

  mode: {
    type: String,
    enum: ['off', 'shadow', 'audit_only', 'live_control', 'live_experimental'],
    required: true,
  },

  // --- The gate's decision -------------------------------------------------
  action: { type: String, enum: ['graph', 'image'], required: true },
  decision: { type: String, enum: ['allow', 'block', 'transform'], required: true },
  reasonCode: { type: String, default: null },
  riskLevel: { type: String, enum: ['none', 'low', 'medium', 'high', 'fatal'], default: 'none' },
  visualPurpose: { type: String, default: null },

  originalCommand: { type: mongoose.Schema.Types.Mixed, default: null },
  replacementCommand: { type: mongoose.Schema.Types.Mixed, default: null },
  auditReason: { type: String, default: null },

  // --- Context snapshot at decision time -----------------------------------
  activeProblem: {
    problemText: { type: String, default: null },
    correctAnswer: { type: String, default: null },
    problemType: { type: String, default: null },
    status: { type: String, default: null },
  },
  learningState: {
    concept: { type: String, default: null },
    misconception: { type: String, default: null },
    masteryScore: { type: Number, default: null },
  },

  // --- Outcome harvest (backfilled by a later job; null until then) --------
  outcomeWindow: {
    nextAttemptCorrect: { type: Boolean, default: null },
    attemptsNext5Turns: { type: Number, default: null },
    hintsNext5Turns: { type: Number, default: null },
    masteryDeltaNext5Turns: { type: Number, default: null },
    harvestedAt: { type: Date, default: null },
  },

  // --- Human review (optional, for spot-checking the gate's taste) ---------
  humanLabel: {
    reviewed: { type: Boolean, default: false },
    helpful: { type: Boolean, default: null },
    safe: { type: Boolean, default: null },
    notes: { type: String, default: null },
  },

  createdAt: { type: Date, default: Date.now },
});

// Bounded growth: raw decisions auto-expire after 180 days. This index also
// serves as the createdAt query index, so we don't declare a second one.
visualDecisionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

// Guard against OverwriteModelError when the module is required across test
// files in the same process.
module.exports = mongoose.models.VisualDecision
  || mongoose.model('VisualDecision', visualDecisionSchema);
