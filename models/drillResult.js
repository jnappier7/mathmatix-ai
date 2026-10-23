/**
 * DRILL RESULT — one completed round of solo practice (/drill), for a signed-in student.
 *
 * One document per round, not per student: the point of keeping every round is the history —
 * how much a student actually practised, and whether the scores moved — which a single
 * best-ever row cannot answer. Guests save nothing; there is no account to save to, and the
 * page keeps its localStorage personal best for them exactly as before.
 *
 * ⚠️ SELF-REPORTED. The round is played entirely in the browser (utils/liveDrill/solo.js deals
 * the questions; nothing is posted back as it goes), so `score`, `right`, `att` and `streak` are
 * whatever the page says they were. That is fine for practice — a student gains nothing real by
 * lying to their own history — but it means this collection must NEVER be treated as assessment
 * evidence: not for a grade, not for mastery, not as proof of work. If that is ever wanted, the
 * server has to score the round from the seed rather than trusting the client. The bounds below
 * exist to keep a malformed or hostile payload from poisoning a teacher's averages, not to make
 * the number trustworthy.
 *
 * This is a student education record: it is in the FERPA export and the account-deletion sweep
 * in routes/dataPrivacy.js. Any teacher-facing read added later must also log via ferpaAccessLog,
 * the way the FactFluency reads do.
 *
 * @model DrillResult
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const drillResultSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // Which hub the game was played from ('algebra', 'geometry') and which game
  // ('algebra', 'alg1m3', 'facts', 'geometry', 'hgeo3'). Both are stored as plain
  // strings rather than enums so adding a game in utils/liveDrill/solo.js does not
  // need a migration; the route validates them against HUBS at write time.
  hub: { type: String, required: true, trim: true, maxlength: 40 },
  drill: { type: String, required: true, trim: true, maxlength: 40 },
  playbook: { type: String, trim: true, maxlength: 60, default: '' },
  // The clock the student chose, in seconds, and (Math Facts only) which tables.
  seconds: { type: Number, min: 0, max: 3600, default: 0 },
  focus: { type: [Number], default: [] },

  score: { type: Number, required: true, min: 0, max: 100000 },
  right: { type: Number, required: true, min: 0, max: 10000 },
  attempted: { type: Number, required: true, min: 0, max: 10000 },
  streak: { type: Number, min: 0, max: 10000, default: 0 },

  playedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// The two reads this collection exists for: a student's own history, newest first,
// and their best in one game.
drillResultSchema.index({ userId: 1, playedAt: -1 });
drillResultSchema.index({ userId: 1, drill: 1, score: -1 });

/** Accuracy is derived, never stored — a stored copy is one more thing to disagree. */
drillResultSchema.virtual('accuracy').get(function accuracy() {
  return this.attempted > 0 ? this.right / this.attempted : 0;
});

module.exports = mongoose.models.DrillResult
  || mongoose.model('DrillResult', drillResultSchema);
