// models/courseSession.js
// Tracks a user's enrollment and progress in a pathway-based course.
// This is separate from the Conversation model (chat threads) and
// the express-session (auth/activity tracking).

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const moduleProgressSchema = new Schema({
  moduleId: { type: String, required: true },
  status: {
    type: String,
    enum: ['locked', 'available', 'in_progress', 'completed'],
    default: 'locked'
  },
  startedAt: { type: Date },
  completedAt: { type: Date },
  checkpointScore: { type: Number },
  checkpointPassed: { type: Boolean, default: false },
  scaffoldProgress: { type: Number, default: 0, min: 0, max: 100 }
}, { _id: false });

const courseSessionSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Which course this session is for (matches pathway JSON courseId)
  courseId: { type: String, required: true },      // e.g., 'ap-calculus-ab'
  courseName: { type: String, required: true },    // e.g., 'AP Calculus AB'
  pathwayId: { type: String, required: true },     // e.g., 'ap-calculus-ab-pathway'

  // Current position
  currentModuleId: { type: String },
  currentScaffoldIndex: { type: Number, default: 0 },

  // Module-level progress
  modules: [moduleProgressSchema],

  // Overall progress
  overallProgress: { type: Number, default: 0, min: 0, max: 100 },

  // Status
  status: {
    type: String,
    enum: ['active', 'paused', 'completed'],
    default: 'active'
  },

  // Linked conversation (when user is chatting within this course)
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation'
  },

  // How session was created
  createdBy: {
    type: String,
    enum: ['self', 'teacher', 'screener', 'system'],
    default: 'self'
  },

  completedAt: { type: Date }
}, { timestamps: true });

// Compound index: one active session per course per user
courseSessionSchema.index({ userId: 1, courseId: 1, status: 1 });
courseSessionSchema.index({ userId: 1, status: 1 });

const CourseSession = mongoose.models.CourseSession || mongoose.model('CourseSession', courseSessionSchema);

module.exports = CourseSession;
