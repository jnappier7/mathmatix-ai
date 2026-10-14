// models/practiceTestAssignment.js
// A teacher assigns a PreACT / PSAT / SAT / ACT practice test to one of their
// classes. Students see it with their class activities (/api/activities/mine)
// and take it in the logged-in runner, so the result always lands in their
// account; the teacher's Test Prep tab shows Done / In progress / Not started.
//
// Completion is DERIVED from ActTestSession (same testId, started after the
// assignment) — never stored here, so it can't drift from the real attempt.

const mongoose = require('mongoose');
const { Schema } = mongoose;

const practiceTestAssignmentSchema = new Schema({
  teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  classId: { type: Schema.Types.ObjectId, ref: 'EnrollmentCode', required: true, index: true },
  testId: { type: String, required: true, enum: ['act-math', 'sat-math', 'psat-math', 'preact-math'] },
  dueDate: { type: Date, default: null },
  note: { type: String, maxlength: 500, default: '' },
  assignedAt: { type: Date, default: Date.now },
});

// One live assignment per exam per class; re-assigning replaces the due date.
practiceTestAssignmentSchema.index({ classId: 1, testId: 1 }, { unique: true });

module.exports = mongoose.models.PracticeTestAssignment
  || mongoose.model('PracticeTestAssignment', practiceTestAssignmentSchema);
