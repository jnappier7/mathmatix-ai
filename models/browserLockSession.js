// models/browserLockSession.js
// Tracks browser-lock sessions activated by teachers for their classes.
// Records student violations (tab switches, navigation attempts, fullscreen exits).

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const violationSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['tab-switch', 'navigation-attempt', 'fullscreen-exit', 'window-blur', 'devtools-open'],
    required: true
  },
  timestamp: { type: Date, default: Date.now },
  details: { type: String } // e.g. "Switched away for 12 seconds"
}, { _id: true });

const studentStatusSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['active', 'idle', 'tab-away', 'disconnected', 'off-task'],
    default: 'active'
  },
  lastHeartbeat: { type: Date, default: Date.now },
  violationCount: { type: Number, default: 0 },
  currentActivity: { type: String, default: '' }, // e.g. "Working on fractions"
  currentPage: { type: String, default: '' }, // e.g. "/chat.html"
  lastMessagePreview: { type: String, default: '' }, // Last chat message preview
  joinedAt: { type: Date, default: Date.now },
  isFullscreen: { type: Boolean, default: false }
}, { _id: false });

const browserLockSessionSchema = new Schema({
  // Teacher who created this lock session
  teacherId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Class this lock applies to (references enrollment code)
  classId: {
    type: Schema.Types.ObjectId,
    ref: 'EnrollmentCode',
    required: true,
    index: true
  },

  // Session name (e.g. "Period 3 - Quiz Time")
  sessionName: {
    type: String,
    trim: true,
    default: 'Focus Session'
  },

  // Lock configuration
  settings: {
    enforceFullscreen: { type: Boolean, default: false },
    blockNavigation: { type: Boolean, default: true },
    trackTabSwitches: { type: Boolean, default: true },
    showWarningOnViolation: { type: Boolean, default: true },
    maxViolationsBeforeAlert: { type: Number, default: 3 },
    allowCalculator: { type: Boolean, default: true },
    allowWhiteboard: { type: Boolean, default: true },
    lockMessage: { type: String, default: 'Your teacher has enabled focus mode. Please stay on this page.' }
  },

  // Whether the session is currently active
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  // Track each student's current status
  studentStatuses: [studentStatusSchema],

  // All violations across the session
  violations: [violationSchema],

  // Timestamps
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null }
});

// Compound index for quick lookups
browserLockSessionSchema.index({ classId: 1, isActive: 1 });
browserLockSessionSchema.index({ teacherId: 1, isActive: 1 });

// Find the active lock session for a given class
browserLockSessionSchema.statics.findActiveForClass = function (classId) {
  return this.findOne({ classId, isActive: true }).sort({ startedAt: -1 });
};

// Find active lock session affecting a specific student
browserLockSessionSchema.statics.findActiveForStudent = async function (studentId) {
  const EnrollmentCode = mongoose.model('EnrollmentCode');
  // Find all classes this student is enrolled in
  const enrollments = await EnrollmentCode.find(
    { 'enrolledStudents.studentId': studentId, isActive: true },
    '_id'
  ).lean();

  if (!enrollments.length) return null;

  const classIds = enrollments.map(e => e._id);
  return this.findOne({ classId: { $in: classIds }, isActive: true }).sort({ startedAt: -1 });
};

// Update a student's status within the session
browserLockSessionSchema.methods.updateStudentStatus = function (studentId, updates) {
  const existing = this.studentStatuses.find(
    s => s.studentId.toString() === studentId.toString()
  );

  if (existing) {
    Object.assign(existing, updates, { lastHeartbeat: new Date() });
  } else {
    this.studentStatuses.push({
      studentId,
      ...updates,
      lastHeartbeat: new Date(),
      joinedAt: new Date()
    });
  }
};

const BrowserLockSession = mongoose.models.BrowserLockSession ||
  mongoose.model('BrowserLockSession', browserLockSessionSchema);

module.exports = BrowserLockSession;
