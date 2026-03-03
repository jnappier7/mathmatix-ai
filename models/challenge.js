/**
 * CHALLENGE MODEL
 *
 * Represents a head-to-head math challenge ("Math Showdown") between two students.
 * The challenger picks a skill, and both players get the same 5-question set.
 * Scoring is based on accuracy first, then speed as tiebreaker.
 *
 * Supports both asynchronous (take it when you're ready) and live play.
 *
 * @model Challenge
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Individual response within a challenge attempt
const responseSchema = new Schema({
  problemId: { type: String, required: true },
  answer: { type: Schema.Types.Mixed },
  correct: { type: Boolean, required: true },
  responseTime: { type: Number, default: 0 }, // milliseconds
  answeredAt: { type: Date, default: Date.now }
}, { _id: false });

// A player's attempt at the challenge
const attemptSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  responses: [responseSchema],
  score: { type: Number, default: 0 },        // correct answers (0-5)
  totalTime: { type: Number, default: 0 },     // total ms across all questions
  startedAt: { type: Date },
  completedAt: { type: Date },
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed'],
    default: 'not_started'
  }
}, { _id: false });

const challengeSchema = new Schema({
  // The skill being tested
  skillId: { type: String, required: true, ref: 'Skill', index: true },
  skillName: { type: String, required: true },

  // The fixed set of 5 problem IDs (same for both players)
  problemIds: [{ type: String, required: true }],

  // Players
  challengerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  challengerName: { type: String, required: true },
  opponentId: { type: Schema.Types.ObjectId, ref: 'User', index: true },  // null until accepted
  opponentName: { type: String },

  // Attempts
  challengerAttempt: { type: attemptSchema, default: () => ({ status: 'not_started', responses: [] }) },
  opponentAttempt: { type: attemptSchema, default: () => ({ status: 'not_started', responses: [] }) },

  // Challenge lifecycle
  status: {
    type: String,
    enum: ['open', 'accepted', 'in_progress', 'completed', 'expired', 'declined'],
    default: 'open',
    index: true
  },

  // Result (set when both complete)
  winnerId: { type: Schema.Types.ObjectId, ref: 'User' },
  result: {
    type: String,
    enum: ['challenger_win', 'opponent_win', 'tie', null],
    default: null
  },

  // XP awarded
  xpAwarded: {
    winner: { type: Number, default: 0 },
    loser: { type: Number, default: 0 }
  },

  // Visibility: who can see/accept this challenge
  visibility: {
    type: String,
    enum: ['class', 'direct'],  // class = anyone in same class, direct = specific opponent
    default: 'class'
  },

  // Expiration (challenges expire after 48 hours if not accepted)
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 48 * 60 * 60 * 1000),
    index: true
  }
}, {
  timestamps: true
});

// Indexes for common queries
challengeSchema.index({ status: 1, expiresAt: 1 });
challengeSchema.index({ challengerId: 1, status: 1 });
challengeSchema.index({ opponentId: 1, status: 1 });

// Virtual: is this challenge expired?
challengeSchema.virtual('isExpired').get(function () {
  return this.status === 'open' && this.expiresAt < new Date();
});

module.exports = mongoose.model('Challenge', challengeSchema);
