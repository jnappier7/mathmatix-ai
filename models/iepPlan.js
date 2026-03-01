/**
 * IEP PLAN MODEL — Separated from User for privacy boundary
 *
 * IEP data is legally sensitive (FERPA/IDEA compliance). Storing it
 * in its own collection provides:
 *
 * 1. Privacy boundary: IEP data can be access-controlled independently
 * 2. Audit trail: goal history is first-class, not buried in User doc
 * 3. Query flexibility: find all students with specific accommodations
 * 4. Reduced User document size: IEP data doesn't load on every user fetch
 *
 * Migration: The User model retains `iepPlan` as a lightweight cache
 * (readingLevel + accommodation flags only) for the hot path (chat).
 * Full IEP data (goals, history, preferred scaffolds) lives here.
 *
 * @module models/iepPlan
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ── Sub-schemas (same structure as User model, now canonical) ──

const iepGoalSchema = new Schema({
  description: { type: String, required: true },
  targetDate: { type: Date },
  currentProgress: { type: Number, default: 0, min: 0, max: 100 },
  measurementMethod: { type: String, trim: true },
  status: {
    type: String,
    enum: ['active', 'completed', 'on-hold'],
    default: 'active',
  },
  history: [{
    date: { type: Date, default: Date.now },
    editorId: { type: Schema.Types.ObjectId, ref: 'User' },
    field: String,
    from: Schema.Types.Mixed,
    to: Schema.Types.Mixed,
  }],
}, { _id: true });

const iepAccommodationsSchema = new Schema({
  extendedTime: { type: Boolean, default: false },
  reducedDistraction: { type: Boolean, default: false },
  calculatorAllowed: { type: Boolean, default: false },
  audioReadAloud: { type: Boolean, default: false },
  chunkedAssignments: { type: Boolean, default: false },
  breaksAsNeeded: { type: Boolean, default: false },
  digitalMultiplicationChart: { type: Boolean, default: false },
  largePrintHighContrast: { type: Boolean, default: false },
  mathAnxietySupport: { type: Boolean, default: false },
  custom: [{ type: String, trim: true }],
}, { _id: false });

// ── Main schema ──

const iepPlanSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  accommodations: {
    type: iepAccommodationsSchema,
    default: () => ({}),
  },
  goals: {
    type: [iepGoalSchema],
    default: [],
  },
  readingLevel: {
    type: Number,
    default: null,
    // Lexile (>20) or grade-level equivalent (1-12)
  },
  preferredScaffolds: {
    type: [String],
    default: [],
    // e.g. ['hints', 'examples', 'graphic organizers']
  },
  // ── Metadata ──
  templateApplied: {
    type: String,
    default: null,
    // Which template was last applied (e.g., 'dyscalculia', 'adhd')
  },
  lastUpdatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, {
  timestamps: true,
  collection: 'iepplans',
});

// ── Static helpers ──

/**
 * Get the IEP plan for a user. Returns null if none exists.
 * This is the primary read path — cached aggressively.
 */
iepPlanSchema.statics.forUser = async function (userId) {
  return this.findOne({ userId }).lean();
};

/**
 * Get or create an IEP plan for a user.
 * Used by teacher/admin write paths.
 */
iepPlanSchema.statics.forUserOrCreate = async function (userId) {
  let plan = await this.findOne({ userId });
  if (!plan) {
    plan = new this({ userId });
    await plan.save();
  }
  return plan;
};

/**
 * Get the lightweight accommodation cache for the chat hot path.
 * Returns only what's needed during tutoring: accommodation flags + reading level.
 * Does NOT include goals, history, or scaffolds.
 */
iepPlanSchema.statics.getChatCache = async function (userId) {
  return this.findOne({ userId })
    .select('accommodations readingLevel preferredScaffolds')
    .lean();
};

/**
 * Find all students with a specific accommodation enabled.
 * Useful for teacher reports.
 */
iepPlanSchema.statics.findByAccommodation = async function (accommodationField, teacherStudentIds) {
  const query = { [`accommodations.${accommodationField}`]: true };
  if (teacherStudentIds) {
    query.userId = { $in: teacherStudentIds };
  }
  return this.find(query).populate('userId', 'firstName lastName gradeLevel').lean();
};

/**
 * Update goal progress (called from pipeline persist stage).
 * Returns the updated goal or null.
 */
iepPlanSchema.statics.updateGoalProgress = async function (userId, goalIdentifier, progressChange, editorId) {
  const plan = await this.findOne({ userId });
  if (!plan || !plan.goals || plan.goals.length === 0) return null;

  let targetGoal = null;

  // Try index first
  const idx = parseInt(goalIdentifier, 10);
  if (!isNaN(idx) && idx >= 0 && idx < plan.goals.length) {
    targetGoal = plan.goals[idx];
  } else {
    // Find by description
    targetGoal = plan.goals.find(g =>
      g.description?.toLowerCase().includes(goalIdentifier.toLowerCase())
    );
  }

  if (!targetGoal || targetGoal.status !== 'active') return null;

  const oldProgress = targetGoal.currentProgress || 0;
  const newProgress = Math.max(0, Math.min(100, oldProgress + progressChange));
  targetGoal.currentProgress = newProgress;

  if (!targetGoal.history) targetGoal.history = [];
  targetGoal.history.push({
    date: new Date(),
    editorId: editorId || userId,
    field: 'currentProgress',
    from: oldProgress,
    to: newProgress,
  });

  if (newProgress >= 100 && targetGoal.status === 'active') {
    targetGoal.status = 'completed';
  }

  plan.markModified('goals');
  await plan.save();

  return {
    goalIndex: plan.goals.indexOf(targetGoal),
    description: targetGoal.description,
    oldProgress,
    newProgress,
    change: progressChange,
    completed: newProgress >= 100,
  };
};

// Prevent OverwriteModelError in development with hot reload
module.exports = mongoose.models.IEPPlan || mongoose.model('IEPPlan', iepPlanSchema);
