/**
 * ACTIVITY ATTEMPT — one event from a student working a Class Activity.
 *
 *   kind 'open'  — the student loaded the activity (written server-side when the
 *                  frame is served, so it can't be faked or skipped).
 *   kind 'check' — the student pressed Check on one item. Every check is kept,
 *                  not just solves: the wrong checks are where the misconceptions
 *                  are, and they are what the teacher's trap report counts.
 *
 * Identity comes from the session, never from the activity — that is the whole
 * point of hosting the activity inside Mathmatix instead of trusting a
 * completion code. `itemKey` and `level` are validated against the manifest.
 *
 * This is a student education record: it is included in the FERPA export and
 * the account-deletion sweep in routes/dataPrivacy.js.
 *
 * @model ActivityAttempt
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const misconceptionSchema = new Schema({
  key: { type: String, maxlength: 32, required: true },
  label: { type: String, maxlength: 200, default: '' }
}, { _id: false });

const activityAttemptSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  activitySlug: { type: String, required: true, maxlength: 64 },
  kind: { type: String, enum: ['open', 'check'], required: true },

  // Present on 'check' events only.
  itemKey: { type: String, maxlength: 32 },
  level: { type: Number },
  correct: { type: Number },        // rows / parts right on this check
  total: { type: Number },          // rows / parts in the item
  solved: { type: Boolean, default: false },
  checks: { type: Number },         // checks used on this item so far, this one included
  durationMs: { type: Number },     // time since the item was loaded
  misconceptions: { type: [misconceptionSchema], default: [] }
}, { timestamps: { createdAt: true, updatedAt: false } });

activityAttemptSchema.index({ activitySlug: 1, userId: 1, createdAt: 1 });
activityAttemptSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.ActivityAttempt
  || mongoose.model('ActivityAttempt', activityAttemptSchema);
