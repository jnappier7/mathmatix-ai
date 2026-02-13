// models/section.js — Clever section / class roster mapping
//
// Represents a Clever "section" (a class period) and its student roster.
// Created and updated automatically during Clever SSO login or admin-triggered sync.
// Links Clever's section data to local teacher/student User documents.

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const sectionStudentSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  cleverId:  { type: String, required: true },       // Clever student ID (for fast diff)
  enrolledAt: { type: Date, default: Date.now },
  removedAt:  { type: Date, default: null }           // Soft-remove: set when student leaves roster
}, { _id: false });

const sectionSchema = new Schema({
  // Clever identifiers
  cleverSectionId: { type: String, required: true, unique: true, index: true },
  cleverDistrictId: { type: String, index: true },
  cleverSchoolId:   { type: String, index: true },
  cleverCourseId:   { type: String },                 // Clever course ID (if set by SIS)

  // Human-readable info from Clever
  name:       { type: String, trim: true },           // e.g. "Period 3 - Algebra 1"
  subject:    { type: String, trim: true },           // e.g. "math"
  course:     { type: String, trim: true },           // SIS course name
  grade:      { type: String, trim: true },           // e.g. "7", "9"
  period:     { type: String, trim: true },           // e.g. "3"
  termName:   { type: String, trim: true },           // e.g. "Fall 2025"
  termStartDate: { type: Date },
  termEndDate:   { type: Date },

  // Local references
  teacherId:  { type: Schema.Types.ObjectId, ref: 'User', index: true },   // Primary teacher
  teacherCleverIds: [{ type: String }],               // All Clever teacher IDs (co-teaching)
  schoolLicenseId: { type: Schema.Types.ObjectId, ref: 'SchoolLicense' },

  // Roster
  students: [sectionStudentSchema],

  // Sync metadata
  lastSyncedAt: { type: Date, default: Date.now },
  syncSource:   { type: String, enum: ['login', 'admin', 'webhook', 'manual'], default: 'login' }
}, { timestamps: true });

// Compound indexes for common queries
sectionSchema.index({ teacherId: 1, cleverDistrictId: 1 });
sectionSchema.index({ 'students.studentId': 1 });
sectionSchema.index({ 'students.cleverId': 1 });

/**
 * Return only active (non-removed) students.
 */
sectionSchema.methods.activeStudents = function () {
  return this.students.filter(s => !s.removedAt);
};

/**
 * Diff the current roster against a new list of Clever student IDs.
 * Returns { added: string[], removed: string[], unchanged: string[] }.
 */
sectionSchema.methods.diffRoster = function (newCleverIds) {
  const currentIds = new Set(this.activeStudents().map(s => s.cleverId));
  const incomingIds = new Set(newCleverIds);

  const added     = [...incomingIds].filter(id => !currentIds.has(id));
  const removed   = [...currentIds].filter(id => !incomingIds.has(id));
  const unchanged = [...currentIds].filter(id => incomingIds.has(id));

  return { added, removed, unchanged };
};

const Section = mongoose.models.Section || mongoose.model('Section', sectionSchema);
module.exports = Section;
