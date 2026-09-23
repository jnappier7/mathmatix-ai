/**
 * ACTIVITY ASSIGNMENT — a Class Activity assigned by a teacher to one class.
 *
 * The activity itself is not in the database: `activitySlug` names an entry in
 * activities/manifest.json (utils/activityRegistry.js). A "class" is an
 * EnrollmentCode, the same object the teacher dashboard's Classes tab manages,
 * so who can see an assignment is exactly who is enrolled in that class.
 *
 * @model ActivityAssignment
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const activityAssignmentSchema = new Schema({
  teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  classId: { type: Schema.Types.ObjectId, ref: 'EnrollmentCode', required: true, index: true },
  activitySlug: { type: String, required: true, maxlength: 64 },
  dueDate: { type: Date, default: null },
  note: { type: String, maxlength: 500, default: '' },
  assignedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// One live assignment of a given activity per class.
activityAssignmentSchema.index({ classId: 1, activitySlug: 1 }, { unique: true });

module.exports = mongoose.models.ActivityAssignment
  || mongoose.model('ActivityAssignment', activityAssignmentSchema);
