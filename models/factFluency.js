/**
 * FACT FLUENCY — a student's math-facts record, built from the live Math Facts drill
 * (utils/liveDrill/facts.js) and carried from game to game.
 *
 * One document per student. `facts` is keyed by the exact fact ("mul:7,8", "div:7,8" for 56 ÷ 7,
 * "imul:-8,3") so 7 × 8 and 8 × 7 are tracked separately — a student can know one and not the
 * other — and each entry also carries its family cell (fam, a, b) so the teacher's grid folds a
 * fact and its inverse together (56 ÷ 7 lands in the 7 × 8 cell). Each fact keeps its totals and
 * the last few tries; status (fluent / slow / missed / new) is computed from those on read, in
 * utils/liveDrill/fluency.js, so the rule can change without a migration.
 *
 * `facts` is Mixed rather than a Map: it is written only by fluency.saveGame's dotted-path
 * $inc/$push upserts, and Mixed applies those exactly as written.
 *
 * Only signed-in students get one (a code-only guest has no account to save to). This is a
 * student education record: it is in the FERPA export and the account-deletion sweep in
 * routes/dataPrivacy.js, and every teacher read is logged (ferpaAccessLog, 'skill_mastery').
 *
 * @model FactFluency
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const factFluencySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  // factId → { label, fam, a, b, att, right, recent: [{ ok, ms, at }] (last RECENT), lastAt }
  facts: { type: Schema.Types.Mixed, default: {} },
  games: { type: Number, default: 0 },
  lastGameAt: { type: Date },
}, { timestamps: true, minimize: false });

factFluencySchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.models.FactFluency
  || mongoose.model('FactFluency', factFluencySchema);
