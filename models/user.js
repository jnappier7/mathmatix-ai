// models/user.js  –  FULL FILE (paste-ready)

// Ensure this model is defined only once to avoid OverwriteModelError in dev
const mongoose = require('mongoose');
const Schema    = mongoose.Schema;
const bcrypt    = require('bcryptjs');

/* ---------- IEP SUB-SCHEMAS ---------- */
const iepGoalSchema = new Schema({
  description: { type: String, required: true },
  targetDate:  { type: Date },
  currentProgress: { type: Number, default: 0, min: 0, max: 100 },
  measurementMethod: { type: String, trim: true },
  status: { type: String, enum: ['active', 'completed', 'on-hold'], default: 'active' },
  history: [{
    date: { type: Date, default: Date.now },
    editorId: { type: Schema.Types.ObjectId, ref: 'User' },
    field: String,
    from: Schema.Types.Mixed,
    to:   Schema.Types.Mixed
  }]
}, { _id: true });

const iepAccommodationsSchema = new Schema({
  extendedTime:            { type: Boolean, default: false },
  reducedDistraction:      { type: Boolean, default: false },
  calculatorAllowed:       { type: Boolean, default: false },
  audioReadAloud:          { type: Boolean, default: false },
  chunkedAssignments:      { type: Boolean, default: false },
  breaksAsNeeded:          { type: Boolean, default: false },
  digitalMultiplicationChart:{ type: Boolean, default: false },
  largePrintHighContrast:  { type: Boolean, default: false },
  mathAnxietySupport:      { type: Boolean, default: false },
  custom:                  [{ type: String, trim: true }]
}, { _id: false });

const iepPlanSchema = new Schema({
  accommodations: { type: iepAccommodationsSchema, default: () => ({}) },
  goals:          { type: [iepGoalSchema],        default: [] }
}, { _id: false });

/* ---------- CONVERSATION / XP ---------- */
const sessionSchema = new Schema({
  date: { type: Date, default: Date.now },
  messages: [{
    role:    String,      // 'user' | 'assistant'
    content: String
  }],
  summary:       { type: String, default: null },
  activeMinutes: { type: Number, default: 0 }
}, { _id: true });

const xpEventSchema = new Schema({
  date:   { type: Date, default: Date.now },
  amount: Number,
  reason: String
}, { _id: false });

/* ---------- PARENT / CHILD LINKING ---------- */
const inviteCodeSchema = new Schema({
  code:        { type: String, unique: true, sparse: true },
  expiresAt:   { type: Date },
  childLinked: { type: Boolean, default: false }
}, { _id: false });

const studentToParentLinkCodeSchema = new Schema({
  code:         { type: String, unique: true, sparse: true },
  parentLinked: { type: Boolean, default: false }
}, { _id: false });

/* ---------- USER PREFERENCES ---------- */
const userPreferencesSchema = new Schema({
  handsFreeModeEnabled: { type: Boolean, default: false },
  typingDelayMs:        { type: Number, default: 2000, min: 0, max: 5000 },
  typeOnWpm:            { type: Number, default: 60,   min: 10, max: 200 },
  autoplayTtsHandsFree: { type: Boolean, default: true },
  theme: { type: String, enum: ['light', 'dark', 'high-contrast'], default: 'light' }
}, { _id: false });

/* ---------- BADGES ---------- */
const badgeSchema = new Schema({
  key:        { type: String, unique: true, sparse: true },
  badgeId:    { type: String },  // For mastery mode badges
  unlockedAt: { type: Date,   default: Date.now },
  earnedDate: { type: Date },
  score:      { type: Number }
}, { _id: false });

/* ---------- SKILL MASTERY TRACKING ---------- */
const skillMasterySchema = new Schema({
  status: {
    type: String,
    enum: ['locked', 'ready', 'learning', 'mastered', 'needs-review'],
    default: 'locked'
  },
  masteryScore: { type: Number, min: 0, max: 1, default: 0 },
  lastPracticed: { type: Date },
  consecutiveCorrect: { type: Number, default: 0 },
  totalAttempts: { type: Number, default: 0 },
  learningStarted: { type: Date },
  masteredDate: { type: Date },
  strugglingAreas: [String],  // Specific concepts within this skill
  notes: String,  // AI observations about student's understanding

  // Adaptive Fluency Engine: Time-based performance tracking
  fluencyTracking: {
    // Recent response times (in seconds) - keep last 20
    recentTimes: {
      type: [Number],
      default: []
    },

    // Statistical measures
    medianTime: { type: Number },      // Median response time (robust to outliers)
    averageTime: { type: Number },     // Mean response time

    // Fluency score: How does student compare to expected time?
    // Positive z-score = slower than expected, Negative = faster
    fluencyZScore: { type: Number },

    // Trend indicator
    speedTrend: {
      type: String,
      enum: ['improving', 'stable', 'declining', 'unknown'],
      default: 'unknown'
    },

    // Last time fluency was updated
    lastFluencyUpdate: { type: Date }
  }
}, { _id: false });

/* ---------- LEARNING PROFILE ---------- */
const learningProfileSchema = new Schema({
  // Student interests for personalized examples
  interests: [String],  // e.g., ['skateboarding', 'video games', 'basketball']

  // Learning style preferences (AI-detected)
  learningStyle: {
    prefersDiagrams: { type: Boolean, default: false },
    prefersRealWorldExamples: { type: Boolean, default: false },
    prefersStepByStep: { type: Boolean, default: false },
    prefersDiscovery: { type: Boolean, default: false }
  },

  // Historical context
  pastStruggles: [{
    skill: String,
    description: String,
    date: Date
  }],

  recentWins: [{
    skill: String,
    description: String,
    date: Date
  }],

  // Emotional/behavioral patterns
  mathAnxietyLevel: { type: Number, min: 0, max: 10, default: 5 },
  frustrationTolerance: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  confidenceLevel: { type: Number, min: 0, max: 10, default: 5 },

  // AI relationship building
  memorableConversations: [{
    date: Date,
    summary: String,
    context: String  // Why this was memorable/important
  }],

  // Initial assessment
  assessmentCompleted: { type: Boolean, default: false },
  assessmentDate: { type: Date },
  initialPlacement: String,  // Starting point determined by assessment

  // Adaptive Fluency Engine: Baseline speed modifier
  fluencyBaseline: {
    // Measured during initial assessment - multiplier for time expectations
    // 1.0 = neurotypical speed, 1.5 = needs 50% more time, 0.8 = faster than average
    readSpeedModifier: {
      type: Number,
      min: 0.5,   // Minimum: Fast processors (half the time)
      max: 3.0,   // Maximum: Students needing triple time (severe processing delays)
      default: 1.0  // Default to neurotypical until measured
    },

    // Has baseline been calculated?
    baselineCalculated: { type: Boolean, default: false },
    baselineDate: { type: Date },

    // Raw timing data from baseline measurement (median response times)
    measurements: {
      reflexProblems: { type: Number },    // Median time for 5 reflex problems
      processProblems: { type: Number },   // Median time for 5 process problems
      readingSpeed: { type: Number }       // Words per minute (if measured)
    },

    // Confidence in the baseline (improves over time)
    confidence: {
      type: String,
      enum: ['initial', 'moderate', 'high'],
      default: 'initial'
    }
  },

  // Assessment history (for tracking resets by teachers)
  assessmentHistory: [{
    completedDate: { type: Date },
    placement: { type: String },
    resetDate: { type: Date },
    resetBy: { type: Schema.Types.ObjectId, ref: 'User' },  // Teacher/Admin who reset it
    reason: { type: String }
  }]
}, { _id: false });

/* ---------- MAIN USER SCHEMA ---------- */
const userSchema = new Schema({
  /* Credentials */
  username:     { type: String, required: true, unique: true, trim: true, lowercase: true },
  email:        { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String },                       // populated only for local-strategy users
  googleId:     { type: String, unique: true, sparse: true },
  microsoftId:  { type: String, unique: true, sparse: true },

  /* Profile */
  firstName: { type: String, trim: true, required: true },
  lastName:  { type: String, trim: true, required: true },
  name:      { type: String, trim: true },              // derived in pre-save hook
  role:      { type: String, enum: ['student','teacher','parent','admin'], default: 'student' },

  /* Student-specific profile */
  gradeLevel: { type: String, trim: true },              // e.g., '7th Grade', '9th Grade', 'College'
  mathCourse: { type: String, trim: true },              // e.g., 'Algebra 1', 'Geometry', 'Pre-Calculus'
  tonePreference: { type: String, enum: ['encouraging', 'straightforward', 'casual', 'motivational', 'Motivational'], default: 'encouraging' },
  learningStyle: { type: String, trim: true },           // 'Visual', 'Auditory', 'Kinesthetic'
  interests: [{ type: String, trim: true }],             // ['Gaming', 'Basketball', 'Music']

  /* Tutor selection */
  teacherId:        { type: Schema.Types.ObjectId, ref: 'User' },
  selectedTutorId:  { type: String, trim: true },

  /* Parent linking (multi-parent support) */
  parentIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],

  /* Gamification */
  xp:        { type: Number, default: 0, min: 0 },
  level:     { type: Number, default: 1, min: 1 },
  xpHistory: { type: [xpEventSchema], default: [] },
  totalActiveTutoringMinutes:  { type: Number, default: 0 },
  weeklyActiveTutoringMinutes: { type: Number, default: 0 },
  lastWeeklyReset: { type: Date, default: Date.now },

  /* Conversations */
  activeConversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  activeMasteryConversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },

  /* Timestamps */
  lastLogin:  { type: Date },
  createdAt:  { type: Date, default: Date.now },

  /* Onboarding */
  needsProfileCompletion: { type: Boolean, default: true },

  /* Parent-specific fields */
  reportFrequency:   { type: String, enum: ['daily','weekly','biweekly','monthly'], default: 'weekly' },
  goalViewPreference:{ type: String, enum: ['progress','gaps','goals'], default: 'progress' },
  parentTone:        { type: String, trim: true },
  parentLanguage:    { type: String, trim: true, default: 'English' },

  /* Parent-child linking */
  children:                 [{ type: Schema.Types.ObjectId, ref: 'User' }],
  parentToChildInviteCode:   { type: inviteCodeSchema,          default: () => ({}) },
  studentToParentLinkCode:   { type: studentToParentLinkCodeSchema, default: () => ({}) },

  /* IEP Plan */
  iepPlan: { type: iepPlanSchema, default: () => ({}) },

  /* Avatar customization */
  avatar: {
    skin:   { type: String },
    hair:   { type: String },
    top:    { type: String },
    bottom: { type: String },
    accessory:  { type: String },
    lottiePath: { type: String }
  },

  /* Preferences */
  preferences: { type: userPreferencesSchema, default: () => ({}) },

  /* Tokens / Unlockables */
  tokens: { type: Number, default: 0, min: 0 },

  // ★ DEFAULT UNLOCKED TUTORS (Option A complete-profile fallback) ★
  unlockedItems: {
    type: [String],
    default: () => ['mr-nappier', 'maya', 'ms-maria', 'bob']
  },

  badges: { type: [badgeSchema], default: [] },

  /* Mastery Mode Progress */
  masteryProgress: {
    activeBadge: {
      badgeId: String,
      badgeName: String,
      skillId: String,
      startedAt: Date,
      problemsCompleted: { type: Number, default: 0 },
      problemsCorrect: { type: Number, default: 0 },
      requiredProblems: Number,
      requiredAccuracy: Number
    },
    attempts: [{
      badgeId: String,
      attemptDate: Date,
      completed: Boolean,
      score: Number
    }]
  },

  /* Skill Mastery & Learning Profile */
  skillMastery: {
    type: Map,
    of: skillMasterySchema,
    default: () => new Map()
  },

  learningProfile: {
    type: learningProfileSchema,
    default: () => ({})
  }
}, { timestamps: true });

/* ---------- PRE-SAVE HOOK ---------- */
userSchema.pre('save', async function (next) {
  if (this.isModified('passwordHash') && this.passwordHash) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
  }
  if (this.isModified('firstName') || this.isModified('lastName')) {
    this.name = `${this.firstName || ''} ${this.lastName || ''}`.trim();
  }
  next();
});

/* ---------- EXPORT MODEL ---------- */
const User = mongoose.models.User || mongoose.model('User', userSchema);
module.exports = User;
