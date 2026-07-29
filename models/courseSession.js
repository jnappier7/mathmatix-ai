// models/courseSession.js
// Tracks a user's enrollment and progress in a pathway-based course.
// This is separate from the Conversation model (chat threads) and
// the express-session (auth/activity tracking).

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const lessonProgressSchema = new Schema({
  lessonId: { type: String, required: true },
  title: { type: String },
  order: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['locked', 'available', 'in_progress', 'completed'],
    default: 'locked'
  },
  startedAt: { type: Date },
  completedAt: { type: Date }
}, { _id: false });

const moduleProgressSchema = new Schema({
  moduleId: { type: String, required: true },
  unit: { type: Number },
  title: { type: String },
  status: {
    type: String,
    enum: ['locked', 'available', 'in_progress', 'completed'],
    default: 'locked'
  },
  startedAt: { type: Date },
  completedAt: { type: Date },
  checkpointScore: { type: Number },
  checkpointPassed: { type: Boolean, default: false },
  scaffoldProgress: { type: Number, default: 0, min: 0, max: 100 },
  // Share of the real exam this module represents (ACT reporting-category
  // percentage). Drives score-weighted progress in test-prep courses; null in
  // curriculum courses, which weight modules equally.
  examWeight: { type: Number, default: null },
  lessons: [lessonProgressSchema]
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
  currentLessonId: { type: String },
  currentScaffoldIndex: { type: Number, default: 0 },

  // Module-level progress
  modules: [moduleProgressSchema],

  // Checkpoint state (transient — cleared when checkpoint completes)
  checkpointState: { type: Object, default: null },

  // Diagnostic plan from a completed practice test (e.g. the ACT bootcamp).
  // Shape: { focusCategories: [], masteredCategories: [], startModuleId, takenAt }.
  // Used to open the course on the highest-leverage weak module and to recap the
  // result in the greeting. Set at practice-test completion; null otherwise.
  diagnosticPlan: { type: Schema.Types.Mixed, default: null },

  // ACT bootcamp state — the test→work-misses→re-test→compare loop that replaces
  // the gradual-release scaffold for ACT prep. Shape:
  //   { phase: 'review'|'reassess', round, testSessionId,
  //     queue: [ { problemId, skillId, category, prompt, options, theirAnswer,
  //                correctOption, explanation, leverage, status } ],
  //     index }.
  // Set at practice-test completion (utils/actReview.buildReviewQueue); the chat
  // prompt presents queue[index] and <REVIEW_NEXT> advances index.
  bootcamp: { type: Schema.Types.Mixed, default: null },

  // Course pre-assessment: every course opens by establishing what the student
  // already owns, so it can skip that content instead of re-teaching it. Set
  // once, on completion; the diagnostic card stops appearing after that.
  // Shape: { credited: [skillId], notCredited: [skillId], clearedFromAbove: [skillId],
  //          startModuleId, coverage, totalCourseSkills, skippedForNoItems: [skillId] }.
  preAssessmentCompletedAt: { type: Date, default: null },
  preAssessment: { type: Schema.Types.Mixed, default: null },

  // Overall progress
  overallProgress: { type: Number, default: 0, min: 0, max: 100 },

  // Progress floor: highest progress ever achieved (bar never moves backward)
  progressFloorPct: { type: Number, default: 0, min: 0, max: 100 },

  // Status
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'dropped'],
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
