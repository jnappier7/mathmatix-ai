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
  svg: { type: String },                     // optional figure
  figureAlt: { type: String },               // its text description (screen readers)
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
  flagged: { type: Boolean, default: false },   // marked for review mid-test
  // The runner's per-question change counter, carried on every save. The
  // save route only lets a newer sequence replace an older one, so a save that
  // left the browser first can never overwrite the correction that followed it.
  seq: { type: Number, default: 0 },

  responseTime: { type: Number },            // ms
  answeredAt: { type: Date, default: Date.now },
}, { _id: false });

// How long an unclaimed guest test lives. Long enough to cover "I'll make the
// account tonight", short enough that anonymous forms don't pile up.
const GUEST_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const actTestSessionSchema = new Schema({
  // Null only for a GUEST test (the public, no-account practice test at
  // /act-practice-test). A guest session is owned by whoever holds the token
  // whose hash is stored below; signing up claims it, which sets userId and
  // clears both guest fields in one atomic update (routes/actTest.js /claim).
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: function () { return !this.guestTokenHash; },
  },
  // sha256 of the guest's bearer token. Never the token itself, and never
  // selected by default, so no ordinary read can hand it back.
  guestTokenHash: { type: String, select: false },
  // TTL anchor: Mongo deletes an unclaimed guest session at this time. Unset on
  // claim, so a claimed test is permanent like any other. Rows without the
  // field (every signed-in test) are never touched by the TTL monitor.
  guestExpiresAt: { type: Date },
  // Who took an unclaimed guest test, for keeping its questions out of that
  // guest's NEXT test. The browser's own list of past tests lives in
  // localStorage and is lost to a private window or cleared storage, and then
  // retakes repeated: five repeats a form, one item on three of four forms
  // (external audit, 2026-10-07). So the server keeps its own record:
  //   guestBrowserHash  keyed hash of a random httpOnly cookie (this browser)
  //   guestNetHash      keyed hash of the client IP (fallback when cookies go)
  // Keyed HMACs (SESSION_SECRET), never the raw values; never selected by
  // default; cleared on claim; deleted with the session by the TTL above.
  guestBrowserHash: { type: String, select: false, index: true },
  guestNetHash: { type: String, select: false, index: true },
  // When a guest test was attached to an account — the hook's conversion mark.
  claimedAt: { type: Date },
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

  // Why an abandoned session was abandoned: 'expired' = the clock ran out
  // while the student was away (never scored — not an attempt); unset = the
  // student started a new test over it.
  abandonedReason: { type: String },

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
actTestSessionSchema.index({ guestExpiresAt: 1 }, { expireAfterSeconds: 0 });

actTestSessionSchema.statics.getActiveSession = function (userId) {
  return this.findOne({ userId, status: 'in_progress' }).sort({ createdAt: -1 });
};

const ActTestSession = mongoose.models.ActTestSession
  || mongoose.model('ActTestSession', actTestSessionSchema);

module.exports = ActTestSession;
module.exports.GUEST_TTL_MS = GUEST_TTL_MS;
