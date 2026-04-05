// models/tutorPlan.js
//
// THE TUTOR'S MENTAL MODEL — the backbone of Mathmatix.
//
// A human tutor walks into every session with a living picture of the student:
// what they're working on in class, where their gaps are, what prerequisites
// need shoring up, what worked last time, what didn't. This model captures
// that picture and makes it available to every interaction — chat, course,
// homework help, mastery practice — so the AI tutor can behave like ONE
// tutor who knows the student, not two disconnected systems.
//
// Updated after every interaction by the pipeline's persist stage.

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ── A single skill focus entry in the plan ──
const skillFocusSchema = new Schema({
  skillId: { type: String, required: true },
  displayName: { type: String },

  // Why this skill is in the plan
  reason: {
    type: String,
    enum: [
      'course-current',       // Active in the student's current course
      'course-upcoming',      // Coming up in the course — needs prereq work
      'prerequisite-gap',     // Required by a target skill but weak/missing
      'assessment-identified', // Flagged by screener or checkpoint
      'struggle-detected',    // Pipeline noticed repeated difficulty
      'review-due',           // Spaced repetition says it's time
      'student-requested',    // Student asked to work on this
      'teacher-assigned'      // Teacher explicitly assigned this focus
    ],
    required: true
  },

  // How familiar is the student with this skill?
  familiarity: {
    type: String,
    enum: [
      'never-seen',    // Student has no exposure — needs direct instruction
      'introduced',    // Has seen it but hasn't practiced — needs guided instruction
      'developing',    // Has some ability but shaky — needs Socratic guidance
      'proficient',    // Solid but not fluent — needs practice and challenge
      'mastered'       // Fluent — leverage as bridge to new skills
    ],
    required: true
  },

  // What instructional mode should the tutor use?
  // Derived from familiarity but stored explicitly so the pipeline
  // can read it without re-computing
  instructionalMode: {
    type: String,
    enum: [
      'instruct',    // Novel skill: teach from scratch (vocab → concept → I Do → We Do → You Do)
      'guide',       // Familiar but shaky: Socratic questioning, scaffolded practice
      'strengthen',  // Solid but not fluent: harder problems, transfer, speed
      'leverage'     // Mastered: use as bridge, skip, or quick review
    ],
    required: true
  },

  priority: { type: Number, default: 0, min: 0, max: 10 },

  // Prerequisites that need work before this skill can be taught
  prerequisiteGaps: [{
    skillId: { type: String, required: true },
    displayName: { type: String },
    familiarity: { type: String, enum: ['never-seen', 'introduced', 'developing', 'proficient', 'mastered'] },
    status: {
      type: String,
      enum: ['needs-work', 'in-progress', 'resolved'],
      default: 'needs-work'
    }
  }],

  // Tracking
  addedAt: { type: Date, default: Date.now },
  lastWorkedOn: { type: Date },
  resolvedAt: { type: Date },
  status: {
    type: String,
    enum: ['active', 'in-progress', 'resolved', 'deferred'],
    default: 'active'
  }
}, { _id: false });

// ── Tutor observations — things a human tutor would jot in their notebook ──
const tutorNoteSchema = new Schema({
  content: { type: String, required: true },
  category: {
    type: String,
    enum: [
      'learning-style',      // "Responds well to visual models"
      'misconception',       // "Thinks multiplying by negative flips the >"
      'emotional',           // "Gets frustrated with word problems"
      'strength',            // "Strong number sense, good estimation"
      'strategy',            // "Prefers area model for multiplication"
      'engagement',          // "More engaged when problems use sports context"
      'prerequisite',        // "Needs fraction review before ratios"
      'breakthrough',        // "Finally grasped variable as placeholder"
      'general'
    ],
    default: 'general'
  },
  skillId: { type: String, default: null }, // Optional link to specific skill
  source: {
    type: String,
    enum: ['pipeline', 'assessment', 'teacher', 'system'],
    default: 'pipeline'
  },
  createdAt: { type: Date, default: Date.now },
  supersededAt: { type: Date, default: null } // Null = still current
}, { _id: false });

// ── Session continuity — what happened last time ──
const lastSessionSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  date: { type: Date },
  topic: { type: String },
  skillId: { type: String },
  mood: { type: String }, // rising, falling, stable
  outcome: {
    type: String,
    enum: ['productive', 'struggled', 'breakthrough', 'disengaged', 'incomplete'],
    default: 'productive'
  },
  summary: { type: String }, // One-sentence summary: "Worked on equivalent fractions, struggled with unlike denominators"
  unfinishedBusiness: { type: String } // "Was mid-problem on 3/4 + 2/5 when session ended"
}, { _id: false });

// ═══════════════════════════════════════════════════════════════
// THE TUTOR PLAN
// ═══════════════════════════════════════════════════════════════

const tutorPlanSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },

  // ── What the student is working on in class ──
  // Links to active course sessions, but the plan owns the "what to teach" logic
  activeCourseIds: [{ type: String }], // courseId strings from CourseSession

  // ── The skill focus queue — the tutor's prioritized plan ──
  // Ordered by priority. The tutor works through these, but adapts
  // based on what the student brings to each session.
  skillFocus: [skillFocusSchema],

  // ── Current instructional target ──
  // The ONE skill the tutor is actively working on right now.
  // May shift mid-session if the student brings homework on a different topic.
  currentTarget: {
    skillId: { type: String, default: null },
    displayName: { type: String, default: null },
    instructionalMode: {
      type: String,
      enum: ['instruct', 'guide', 'strengthen', 'leverage', null],
      default: null
    },
    startedAt: { type: Date },
    // Where are we in the instructional sequence for this skill?
    // Only relevant when mode is 'instruct'
    instructionPhase: {
      type: String,
      enum: ['prerequisite-review', 'vocabulary', 'concept-intro', 'i-do', 'we-do', 'you-do', 'mastery-check', null],
      default: null
    }
  },

  // ── Session continuity ──
  lastSession: { type: lastSessionSchema, default: null },

  // ── Tutor's notebook — observations that persist across sessions ──
  tutorNotes: [tutorNoteSchema],

  // ── Aggregate student profile signals ──
  // Quick-access signals the pipeline reads every turn
  studentSignals: {
    overallConfidence: { type: String, enum: ['low', 'moderate', 'high'], default: 'moderate' },
    engagementTrend: { type: String, enum: ['declining', 'stable', 'growing'], default: 'stable' },
    preferredRepresentations: [{ type: String }], // ['visual', 'algebraic', 'numeric', 'verbal']
    frustrationTriggers: [{ type: String }],      // ['word-problems', 'fractions', 'timed-work']
    strengths: [{ type: String }],                 // ['number-sense', 'pattern-recognition']
    recentBreakthroughs: [{ type: String }],       // Last 3 breakthrough moments
    averageSessionLength: { type: Number, default: 0 } // minutes
  },

  // ── Plan metadata ──
  createdAt: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now },

  // How many sessions has this plan been active for?
  sessionCount: { type: Number, default: 0 },

  // Plan version — incremented on major restructuring (e.g., new course enrolled)
  version: { type: Number, default: 1 }
}, { timestamps: true });

// ── Indexes ──
tutorPlanSchema.index({ userId: 1 });
tutorPlanSchema.index({ 'skillFocus.skillId': 1 });
tutorPlanSchema.index({ 'currentTarget.skillId': 1 });

// ── Instance Methods ──

/**
 * Get the active skill focus entries, sorted by priority (highest first).
 */
tutorPlanSchema.methods.getActiveSkillFocus = function () {
  return this.skillFocus
    .filter(sf => sf.status === 'active' || sf.status === 'in-progress')
    .sort((a, b) => b.priority - a.priority);
};

/**
 * Find a skill in the focus queue.
 */
tutorPlanSchema.methods.findSkillFocus = function (skillId) {
  return this.skillFocus.find(sf => sf.skillId === skillId);
};

/**
 * Get all current (non-superseded) tutor notes for a skill.
 */
tutorPlanSchema.methods.getNotesForSkill = function (skillId) {
  return this.tutorNotes.filter(n => n.skillId === skillId && !n.supersededAt);
};

/**
 * Get the most relevant tutor notes (current, last 20).
 */
tutorPlanSchema.methods.getCurrentNotes = function (limit = 20) {
  return this.tutorNotes
    .filter(n => !n.supersededAt)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
};

/**
 * Determine the instructional mode for a skill based on familiarity.
 */
tutorPlanSchema.statics.familiarityToMode = function (familiarity) {
  const mapping = {
    'never-seen': 'instruct',
    'introduced': 'instruct',
    'developing': 'guide',
    'proficient': 'strengthen',
    'mastered': 'leverage'
  };
  return mapping[familiarity] || 'guide';
};

/**
 * Determine familiarity from existing skill mastery data.
 * This bridges the existing user.skillMastery map to the new plan system.
 */
tutorPlanSchema.statics.inferFamiliarity = function (skillMasteryEntry) {
  if (!skillMasteryEntry) return 'never-seen';

  const { status, masteryScore, totalAttempts } = skillMasteryEntry;

  // Never attempted
  if (!totalAttempts || totalAttempts === 0) return 'never-seen';

  // Mastered
  if (status === 'mastered' && masteryScore >= 80) return 'mastered';

  // Proficient but not mastered
  if (masteryScore >= 60 || status === 'practicing') return 'proficient';

  // Has some experience
  if (status === 'learning' || totalAttempts >= 3) return 'developing';

  // Barely touched
  if (totalAttempts >= 1) return 'introduced';

  return 'never-seen';
};

const TutorPlan = mongoose.models.TutorPlan || mongoose.model('TutorPlan', tutorPlanSchema);

module.exports = TutorPlan;
