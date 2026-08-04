// models/quizPoll.js — one document per pop-quiz, holding the live vote tally
// shown on /quiz ("what did everyone else get?"). Counts only — no user data,
// no per-vote rows; dedupe lives in the (anonymous) session, not here.

const mongoose = require('mongoose');

const quizPollSchema = new mongoose.Schema(
  {
    quizId: { type: String, required: true, unique: true },
    // option value ('14', '2', 'other', …) → vote count
    counts: { type: Map, of: Number, default: {} },
    total: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/** Atomically record one vote and return the updated tally. */
quizPollSchema.statics.recordVote = function (quizId, answer) {
  return this.findOneAndUpdate(
    { quizId },
    { $inc: { [`counts.${answer}`]: 1, total: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

module.exports = mongoose.models.QuizPoll || mongoose.model('QuizPoll', quizPollSchema);
