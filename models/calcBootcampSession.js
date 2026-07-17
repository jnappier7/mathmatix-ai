// models/calcBootcampSession.js
// One weekly AP Calculus AB bootcamp diagnostic attempt (15 MC + one 9-point
// FRQ). The item sequence is frozen at start from the weekly assessment map
// (seeds/calc-assessment-map.json). MC is auto-scored by re-fetching Problems
// server-side (keys never stored on the session); the FRQ is rubric-scored
// (AI/tutor). Completing a week seeds the student's tutorPlan with the
// priority-ranked weak skills. See utils/calcBootcamp.js + the design doc.

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// A frozen MC item (client-safe payload — no answer key).
const mcItemSchema = new Schema({
  n: { type: Number },
  problemId: { type: String, required: true },
  unit: { type: String },
  skill: { type: String },
  skillId: { type: String },
  practice: { type: String },
  calc: { type: Boolean, default: false },
  content: { type: String },
  svg: { type: String },
  options: [{ label: String, text: String }],
}, { _id: false });

const mcResponseSchema = new Schema({
  problemId: { type: String },
  n: { type: Number },
  unit: { type: String },
  skillId: { type: String },
  practice: { type: String },
  calc: { type: Boolean },
  answer: { type: String },
  correct: { type: Boolean },
  answeredAt: { type: Date, default: Date.now },
}, { _id: false });

// The FRQ prompt (client-safe — rubric point descriptors are fine to show, but
// worked solutions are not sent until after scoring).
const frqPromptSchema = new Schema({
  unit: { type: String },
  skill: { type: String },
  skillId: { type: String },
  calc: { type: Boolean, default: false },
  context: { type: String },
  svg: { type: String },
  parts: [{
    label: String,
    prompt: String,
    points: Number,
    rubric: [String],
  }],
}, { _id: false });

const frqResponseSchema = new Schema({
  submitted: { type: String },                 // the student's written work
  partScores: [{
    label: String,
    pointsEarned: Number,
    pointsPossible: Number,
    feedback: String,
  }],
  totalEarned: { type: Number },
  totalPossible: { type: Number },
  scoredBy: { type: String, enum: ['ai', 'tutor'], default: 'ai' },
  scoredAt: { type: Date },
}, { _id: false });

const calcBootcampSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  week: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String },

  mcItems: [mcItemSchema],
  frq: frqPromptSchema,

  mcResponses: [mcResponseSchema],
  frqResponse: frqResponseSchema,

  status: {
    type: String,
    enum: ['in_progress', 'mc_submitted', 'completed', 'abandoned'],
    default: 'in_progress',
    index: true,
  },

  timeLimitMinutes: { type: Number, default: 60 },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },

  // Scored at completion
  mcCorrect: { type: Number },
  mcTotal: { type: Number },
  frqEarned: { type: Number },
  frqPossible: { type: Number },
  composite: { type: Number },                 // 0–100
  apBand: { type: Number },                     // 1–5 (approximate)

  // The committed ≤3-topic weekly plan (+ one retrospective).
  plannedSkills: [{
    skillId: String,
    name: String,
    unit: String,
    kind: { type: String, enum: ['target', 'retrospective'] },
    accuracy: Number,
    priority: Number,
  }],
}, { timestamps: true });

calcBootcampSessionSchema.index({ userId: 1, week: 1, status: 1 });

calcBootcampSessionSchema.statics.getActiveSession = function (userId) {
  return this.findOne({ userId, status: { $in: ['in_progress', 'mc_submitted'] } })
    .sort({ createdAt: -1 });
};

const CalcBootcampSession = mongoose.models.CalcBootcampSession
  || mongoose.model('CalcBootcampSession', calcBootcampSessionSchema);

module.exports = CalcBootcampSession;
