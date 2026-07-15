// models/actTestSession.js
// A fixed-form ACT Math practice-test session. Unlike ScreenerSession (an
// adaptive CAT), the item sequence here is FROZEN at start from an assembled
// parallel form (utils/actTestAssembler.js) so the test is stable and
// simulates the real 60-item exam. Answers are graded by re-fetching the
// Problem server-side; correct-answer keys are never stored on the session.

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// One frozen item in the form (client-safe payload — no answer key).
const actItemSchema = new Schema({
  position: { type: Number, required: true },
  problemId: { type: String, required: true },
  skillId: { type: String },
  category: { type: String },
  content: { type: String },                 // the prompt shown to the student
  answerType: { type: String },
  options: [{ label: String, text: String }],
  difficulty: { type: Number },
}, { _id: false });

const actResponseSchema = new Schema({
  position: { type: Number },
  problemId: { type: String },
  skillId: { type: String },
  category: { type: String },
  answer: { type: String },
  correct: { type: Boolean },
  skipped: { type: Boolean, default: false },
  responseTime: { type: Number },            // ms
  answeredAt: { type: Date, default: Date.now },
}, { _id: false });

const actTestSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  testId: { type: String, default: 'act-math' },
  seed: { type: Number },

  items: [actItemSchema],
  currentIndex: { type: Number, default: 0 },
  responses: [actResponseSchema],

  status: {
    type: String,
    enum: ['in_progress', 'completed', 'abandoned'],
    default: 'in_progress',
    index: true,
  },

  timeLimitMinutes: { type: Number, default: 60 },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },

  // Scored at completion
  rawScore: { type: Number },
  scaledScore: { type: Number },

  // What the bank could / couldn't cover at assembly time
  coverage: {
    total: { type: Number },
    filled: { type: Number },
    missing: { type: Number },
  },
}, { timestamps: true });

actTestSessionSchema.index({ userId: 1, status: 1 });

actTestSessionSchema.statics.getActiveSession = function (userId) {
  return this.findOne({ userId, status: 'in_progress' }).sort({ createdAt: -1 });
};

const ActTestSession = mongoose.models.ActTestSession
  || mongoose.model('ActTestSession', actTestSessionSchema);

module.exports = ActTestSession;
