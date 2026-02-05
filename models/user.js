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
  voiceChatEnabled:     { type: Boolean, default: true },  // Show/hide voice chat orb
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

// ★ MASTER MODE: Strategy Badges ★
const strategyBadgeSchema = new Schema({
  badgeId: { type: String, required: true },
  badgeName: { type: String, required: true },
  category: { type: String },  // 'algebra', 'geometry', 'meta', etc.
  earnedDate: { type: Date, default: Date.now },
  triggerContext: {
    problemIds: [String],
    detectionReason: String
  }
}, { _id: false });

// ★ MASTER MODE: Habits Badges ★
const habitBadgeSchema = new Schema({
  badgeId: { type: String, required: true },
  badgeName: { type: String, required: true },
  category: {
    type: String,
    enum: ['consistency', 'resilience', 'efficiency', 'metacognition']
  },
  earnedDate: { type: Date, default: Date.now },
  count: { type: Number, default: 1 },  // For re-earnable badges
  currentStreak: { type: Number, default: 0 },  // For streak badges
  bestStreak: { type: Number, default: 0 },
  metadata: Schema.Types.Mixed  // Flexible for different badge types
}, { _id: false });

// ★ MASTER MODE: Meta/Challenge Badges ★
const metaBadgeSchema = new Schema({
  badgeId: { type: String, required: true },
  badgeName: { type: String, required: true },
  category: {
    type: String,
    enum: ['milestone', 'community', 'event', 'ultra-rare']
  },
  earnedDate: { type: Date, default: Date.now },
  specialData: Schema.Types.Mixed  // Flexible for special badges
}, { _id: false });

/* ---------- COURSE ENROLLMENT & PROGRESS ---------- */
const courseLessonProgressSchema = new Schema({
  lessonId: { type: String, required: true },
  status: { type: String, enum: ['locked', 'available', 'in_progress', 'completed'], default: 'locked' },
  startedAt: { type: Date },
  completedAt: { type: Date },
  practiceProblems: {
    attempted: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    lastAttemptAt: { type: Date }
  },
  masteryQuizScore: { type: Number },  // 0-100
  masteryQuizPassed: { type: Boolean, default: false },
  timeSpentMinutes: { type: Number, default: 0 }
}, { _id: false });

const courseModuleProgressSchema = new Schema({
  moduleId: { type: String, required: true },
  status: { type: String, enum: ['locked', 'available', 'in_progress', 'completed'], default: 'locked' },
  startedAt: { type: Date },
  completedAt: { type: Date },
  lessons: [courseLessonProgressSchema],
  checkpointScore: { type: Number },  // For checkpoint modules
  checkpointPassed: { type: Boolean, default: false }
}, { _id: false });

const courseEnrollmentSchema = new Schema({
  courseId: { type: String, required: true },  // e.g., 'calculus-1', 'algebra-1'
  courseName: { type: String },
  enrolledAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'paused', 'completed', 'dropped'], default: 'active' },
  currentModuleId: { type: String },  // Current module being worked on
  currentLessonId: { type: String },  // Current lesson within the module
  modules: [courseModuleProgressSchema],
  overallProgress: { type: Number, default: 0, min: 0, max: 100 },  // Percentage complete
  completedAt: { type: Date },

  // Course mode settings
  settings: {
    autoAdvance: { type: Boolean, default: true },  // Auto-advance to next lesson on completion
    practiceRequirement: { type: Number, default: 3 },  // Min practice problems before advancing
    masteryThreshold: { type: Number, default: 80 }  // Score needed to pass mastery quizzes
  }
}, { _id: false });

/* ---------- SKILL MASTERY TRACKING ---------- */
const skillMasterySchema = new Schema({
  status: {
    type: String,
    enum: ['locked', 'ready', 'learning', 'practicing', 'mastered', 're-fragile', 'needs-review'],
    default: 'locked'
  },
  masteryScore: { type: Number, min: 0, max: 100, default: 0 },  // Changed to 0-100 scale
  masteryType: { type: String, enum: ['verified', 'inferred', 'fragile-inferred'], default: 'verified' },
  lastPracticed: { type: Date },
  consecutiveCorrect: { type: Number, default: 0 },
  totalAttempts: { type: Number, default: 0 },
  learningStarted: { type: Date },
  masteredDate: { type: Date },
  strugglingAreas: [String],  // Specific concepts within this skill
  notes: String,  // AI observations about student's understanding

  // ★ INFERENCE TRACKING ★
  inferredFrom: String,  // SkillId that triggered inference
  inferredDate: { type: Date },
  inferredTier: Number,  // Tier of skill that triggered inference
  explicitlyFailed: { type: Boolean, default: false },  // Failed when directly tested
  failureDate: { type: Date },
  failureContext: Schema.Types.Mixed,  // Context where failure occurred

  // ★ MASTER MODE: 4 Pillars of Mastery ★
  pillars: {
    // Pillar 1: Accuracy
    accuracy: {
      correct: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      percentage: { type: Number, min: 0, max: 1, default: 0 },  // 0-1 scale
      threshold: { type: Number, default: 0.90 }  // 90% required for mastery
    },

    // Pillar 2: Independence
    independence: {
      hintsUsed: { type: Number, default: 0 },
      hintsAvailable: { type: Number, default: 15 },  // Total hints allowed
      hintThreshold: { type: Number, default: 3 },    // Max 3 hints for mastery
      autoStepUsed: { type: Boolean, default: false } // Auto-pause mastery if true
    },

    // Pillar 3: Transfer
    transfer: {
      contextsAttempted: [String],  // ['numeric', 'graphical', 'word-problem', 'real-world']
      contextsRequired: { type: Number, default: 3 },  // Minimum 3 contexts
      formatVariety: { type: Boolean, default: false }
    },

    // Pillar 4: Retention
    retention: {
      lastPracticed: { type: Date },
      retentionChecks: [{
        checkDate: { type: Date },
        daysSinceLastPractice: { type: Number },
        accuracy: { type: Number },
        passed: { type: Boolean }  // ≥80% to pass
      }],
      nextRetentionCheck: { type: Date },
      failed: { type: Boolean, default: false }  // Triggers re-fragile state
    }
  },

  // Current badge tier for this skill
  currentTier: {
    type: String,
    enum: ['none', 'bronze', 'silver', 'gold', 'diamond'],
    default: 'none'
  },

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

  // Rapport building (getting-to-know-you phase for new users)
  rapportBuildingComplete: { type: Boolean, default: false },
  rapportAnswers: {
    interests: String,           // What they're interested in learning
    favoriteSubject: String,     // Favorite subject in school
    currentTopic: String,        // What they're working on in school
    learningGoal: String,        // What they want to improve at
    conversationStyle: String    // Casual notes about how they communicate
  },

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
  }],

  // Quarterly growth tracking checkpoints
  quarterlyCheckpoints: [{
    // Checkpoint metadata
    checkpointDate: { type: Date, default: Date.now },
    schoolYear: { type: String },  // e.g., "2024-2025"
    quarter: { type: Number, min: 1, max: 4 },  // 1=Fall, 2=Winter, 3=Spring, 4=Summer
    academicQuarter: { type: String },  // e.g., "2024-Q1", "2024-Q2"

    // Snapshot of mastery state at checkpoint
    skillsMastered: [{
      skillId: { type: String },
      masteredDate: { type: Date },
      course: { type: String },  // Course this skill belongs to
      category: { type: String }
    }],

    // Growth metrics calculated at checkpoint
    metrics: {
      // New skills mastered this quarter
      newSkillsCount: { type: Number, default: 0 },
      newSkillsList: [String],  // skillIds mastered this quarter

      // Retention: skills from previous quarters still mastered
      retainedSkillsCount: { type: Number, default: 0 },
      retainedPercentage: { type: Number, min: 0, max: 100 },  // % of previous skills retained

      // Skills that were mastered before but no longer mastered
      lostSkillsCount: { type: Number, default: 0 },
      lostSkillsList: [String],  // skillIds that regressed

      // Velocity: skills mastered per week
      skillsPerWeek: { type: Number, default: 0 },

      // Theta (ability level) change
      thetaChange: { type: Number },  // Change from previous quarter

      // Course progression
      coursesInProgress: [String],  // Courses student is working on
      coursesCompleted: [String]    // Courses where all skills are mastered
    },

    // Activity metrics
    activity: {
      totalMinutes: { type: Number, default: 0 },
      problemsAttempted: { type: Number, default: 0 },
      problemsCorrect: { type: Number, default: 0 },
      accuracy: { type: Number, min: 0, max: 100 }
    },

    // Notes from teacher/system
    notes: { type: String },
    generatedBy: { type: String, enum: ['auto', 'manual', 'teacher'], default: 'auto' }
  }],

  // Growth Check tracking (short progress assessments)
  currentTheta: { type: Number, default: 0 },  // Current ability estimate from IRT
  standardError: { type: Number, default: 1.0 },  // Uncertainty in theta estimate
  lastGrowthCheck: { type: Date },  // When the last growth check was completed

  // Growth Check history
  growthCheckHistory: [{
    sessionId: { type: String },
    date: { type: Date, default: Date.now },
    previousTheta: { type: Number },
    newTheta: { type: Number },
    thetaChange: { type: Number },
    growthStatus: { type: String, enum: ['significant-growth', 'some-growth', 'stable', 'review-needed'] },
    questionsAnswered: { type: Number },
    accuracy: { type: Number, min: 0, max: 100 }
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

  /* Password Reset */
  resetPasswordToken:   { type: String },
  resetPasswordExpires: { type: Date },

  /* Email Verification */
  emailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String },
  emailVerificationExpires: { type: Date },

  /* Profile */
  firstName: { type: String, trim: true, required: true },
  lastName:  { type: String, trim: true, required: true },
  name:      { type: String, trim: true },              // derived in pre-save hook
  role:      { type: String, enum: ['student','teacher','parent','admin'], default: 'student' },

  /* Student-specific profile */
  gradeLevel: { type: String, trim: true },              // e.g., '7th Grade', '9th Grade', 'College'
  mathCourse: { type: String, trim: true },              // e.g., 'Algebra 1', 'Geometry', 'Pre-Calculus'
  dateOfBirth: { type: Date },                           // For COPPA compliance (under 13 requires parental consent)
  hasParentalConsent: { type: Boolean, default: false }, // True when linked to a parent account (required for under 13)
  tonePreference: { type: String, enum: ['encouraging', 'straightforward', 'casual', 'motivational', 'Motivational', 'chill', 'Chill'], default: 'encouraging' },
  learningStyle: { type: String, trim: true },           // 'Visual', 'Auditory', 'Kinesthetic'
  preferredLanguage: { type: String, enum: ['English', 'Spanish', 'Russian', 'Chinese', 'Vietnamese', 'Arabic', 'Somali', 'French', 'German'], default: 'English' }, // Student's preferred language for tutoring
  interests: [{ type: String, trim: true }],             // ['Gaming', 'Basketball', 'Music']

  /* Tutor selection */
  teacherId:        { type: Schema.Types.ObjectId, ref: 'User' },
  selectedTutorId:  { type: String, trim: true },

  /* Avatar selection (creature avatars like Blooket) */
  selectedAvatarId: { type: String, trim: true }, // e.g., 'lion', 'dragon', 'panda'

  /* Parent linking (multi-parent support) */
  parentIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],

  /* Gamification */
  xp:        { type: Number, default: 0, min: 0 },
  level:     { type: Number, default: 1, min: 1 },
  xpHistory: { type: [xpEventSchema], default: [] },

  // XP Ladder Analytics (Three Tiers)
  // Enables "grinding vs growing" analysis
  xpLadderStats: {
    lifetimeTier1: { type: Number, default: 0 },  // Total turn XP (engagement)
    lifetimeTier2: { type: Number, default: 0 },  // Total performance XP (competence)
    lifetimeTier3: { type: Number, default: 0 },  // Total behavior XP (identity)
    tier3Behaviors: [{
      behavior: { type: String },      // 'caught_own_error', 'persistence', etc.
      count: { type: Number, default: 0 },
      lastEarned: { type: Date }
    }]
  },

  totalActiveTutoringMinutes:  { type: Number, default: 0 },
  weeklyActiveTutoringMinutes: { type: Number, default: 0 },
  // Precise time tracking in seconds (minutes are derived from these)
  totalActiveSeconds:  { type: Number, default: 0 },
  weeklyActiveSeconds: { type: Number, default: 0 },
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

  /* Teacher Class AI Settings - Controls how AI tutors students in this teacher's class */
  classAISettings: {
    // Calculator access
    calculatorAccess: {
      type: String,
      enum: ['always', 'never', 'skill-based', 'teacher-discretion'],
      default: 'skill-based'
    },
    calculatorNote: { type: String, default: '' },  // e.g., "Allow for computation-heavy problems only"

    // Scaffolding/prompt level (how much support the AI provides)
    scaffoldingLevel: {
      type: Number,
      min: 1,
      max: 5,
      default: 3  // 1=Minimal hints, 5=Maximum support
    },
    scaffoldingNote: { type: String, default: '' },

    // Vocabulary preferences
    vocabularyPreferences: {
      orderOfOperations: {
        type: String,
        enum: ['PEMDAS', 'GEMS', 'BODMAS', 'BEDMAS', 'teacher-custom'],
        default: 'PEMDAS'
      },
      customVocabulary: [{ type: String }],  // Array of custom terms: ["Use 'rate of change' not 'slope'"]
      vocabularyNote: { type: String, default: '' }
    },

    // Solution approach preferences
    solutionApproaches: {
      equationSolving: {
        type: String,
        enum: ['opposite-operations', 'balance-method', 'algebraic-manipulation', 'any'],
        default: 'any'
      },
      fractionOperations: {
        type: String,
        enum: ['butterfly-method', 'traditional-lcd', 'visual-models', 'any'],
        default: 'any'
      },
      wordProblems: {
        type: String,
        enum: ['CUBES', 'UPS-Check', 'draw-first', 'any'],
        default: 'any'
      },
      customApproaches: { type: String, default: '' }  // Freeform teacher notes
    },

    // Manipulatives and visual aids
    manipulatives: {
      allowed: { type: Boolean, default: true },
      preferred: [{
        type: String,
        enum: ['number-line', 'algebra-tiles', 'fraction-bars', 'area-model', 'base-ten-blocks', 'graph-paper', 'coordinate-plane']
      }],
      note: { type: String, default: '' }
    },

    // Current teaching context
    currentTeaching: {
      topic: { type: String, default: '' },  // "We're currently learning quadratic equations"
      approach: { type: String, default: '' },  // "I teach factoring before the quadratic formula"
      pacing: { type: String, default: '' },  // "We're taking it slow - emphasize understanding over speed"
      additionalContext: { type: String, default: '' }
    },

    // Response style
    responseStyle: {
      encouragementLevel: {
        type: String,
        enum: ['minimal', 'moderate', 'high'],
        default: 'moderate'
      },
      errorCorrectionStyle: {
        type: String,
        enum: ['direct', 'socratic', 'discovery'],
        default: 'socratic'
      },
      showWorkRequirement: {
        type: String,
        enum: ['always', 'sometimes', 'never'],
        default: 'always'
      }
    },

    // Last updated timestamp
    lastUpdated: { type: Date }
  },

  /* IEP Plan */
  iepPlan: { type: iepPlanSchema, default: () => ({}) },

  /* Avatar customization */
  avatar: {
    skin:   { type: String },
    hair:   { type: String },
    top:    { type: String },
    bottom: { type: String },
    accessory:  { type: String },
    lottiePath: { type: String },
    // DiceBear custom avatar support
    dicebearConfig: {
      style: { type: String },        // e.g., 'adventurer', 'pixel-art', 'lorelei'
      seed: { type: String },         // Random seed for avatar generation
      skinColor: { type: String },    // Skin tone hex color
      hairColor: { type: String },    // Hair color hex
      backgroundColor: { type: String }, // Background color or 'transparent'
      glasses: { type: Boolean, default: false },
      earrings: { type: Boolean, default: false },
      flip: { type: Boolean, default: false }
    },
    dicebearUrl: { type: String }     // Cached avatar URL for quick display
  },

  /* Avatar Gallery - up to 3 saved custom avatars */
  avatarGallery: {
    type: [{
      name: { type: String, default: 'My Avatar' },
      dicebearConfig: {
        style: { type: String },
        seed: { type: String },
        skinColor: { type: String },
        hairColor: { type: String },
        backgroundColor: { type: String },
        glasses: { type: Boolean, default: false },
        earrings: { type: Boolean, default: false },
        flip: { type: Boolean, default: false }
      },
      dicebearUrl: { type: String },
      createdAt: { type: Date, default: Date.now }
    }],
    default: [],
    validate: [arr => arr.length <= 3, 'Maximum 3 custom avatars allowed']
  },

  /* Preferences */
  preferences: { type: userPreferencesSchema, default: () => ({}) },

  /* Tour & Survey Tracking */
  tourCompleted: { type: Boolean, default: false },
  tourCompletedAt: { type: Date },
  tourDismissed: { type: Boolean, default: false },  // If user dismissed without completing

  sessionSurveys: {
    enabled: { type: Boolean, default: true },  // Can be disabled by user
    lastShownAt: { type: Date },
    nextShowAfter: { type: Date },
    frequency: { type: String, enum: ['every-session', 'daily', 'weekly', 'never'], default: 'daily' },
    responsesCount: { type: Number, default: 0 },
    consecutiveDismissals: { type: Number, default: 0 },  // Track if user keeps dismissing
    lastTrigger: String,  // What triggered the survey: 'problems_completed', 'milestone', 'time_based', 'tab_return', 'manual'
    lastTriggerContext: {
      problemsSolved: Number,
      sessionDuration: Number,
      timestamp: Date
    },
    responses: [{
      submittedAt: { type: Date, default: Date.now },
      sessionDuration: Number,  // Minutes in session
      problemsSolved: Number,  // Problems solved this session
      rating: Number,  // 1-5 star rating
      experience: String,  // 'excellent', 'good', 'okay', 'frustrating', 'confusing'
      feedback: String,  // Open-ended feedback
      bugs: String,  // Bug reports
      features: String,  // Feature requests
      helpfulness: Number,  // 1-5 rating
      difficulty: Number,  // 1-5 rating
      willingness: Number,  // 0-10 NPS score
      isQuickResponse: { type: Boolean, default: false }  // Was this a quick 1-tap response
    }]
  },

  /* Upload Retention Settings */
  retainUploadsIndefinitely: { type: Boolean, default: false }, // If true, student's uploads won't auto-delete (parent/teacher/admin can set)

  /* Tokens / Unlockables */
  tokens: { type: Number, default: 0, min: 0 },

  // ★ DEFAULT UNLOCKED TUTORS (Option A complete-profile fallback) ★
  unlockedItems: {
    type: [String],
    default: () => ['mr-nappier', 'maya', 'ms-maria', 'bob']
  },

  badges: { type: [badgeSchema], default: [] },

  // ★ MASTER MODE: Badge Collections ★
  strategyBadges: { type: [strategyBadgeSchema], default: [] },
  habitBadges: { type: [habitBadgeSchema], default: [] },
  metaBadges: { type: [metaBadgeSchema], default: [] },

  // ★ MASTER MODE: Pattern Badge Progress ★
  patternProgress: {
    type: Map,
    of: new Schema({
      patternId: String,
      currentTier: { type: Number, default: 0 },
      highestTierReached: { type: Number, default: 0 },
      tierUpgradeHistory: [{
        fromTier: Number,
        toTier: Number,
        upgradeDate: Date
      }],
      milestonesCompleted: [{
        milestoneId: String,
        completedDate: Date,
        masteryType: { type: String, enum: ['verified', 'inferred'] }
      }],
      lastPracticed: Date,
      status: {
        type: String,
        enum: ['locked', 'in-progress', 'ready-for-upgrade', 'mastered'],
        default: 'locked'
      }
    }, { _id: false }),
    default: () => new Map()
  },

  /* Mastery Mode Progress */
  masteryProgress: {
    activeBadge: {
      badgeId: String,
      badgeName: String,
      skillId: String,
      tier: { type: String, enum: ['bronze', 'silver', 'gold', 'diamond'] },  // Current tier being worked on
      startedAt: Date,
      problemsCompleted: { type: Number, default: 0 },
      problemsCorrect: { type: Number, default: 0 },
      requiredProblems: Number,
      requiredAccuracy: Number,
      currentPhase: String,
      phaseHistory: [String],
      hintsUsed: { type: Number, default: 0 },

      // 4-Pillar Progress for active badge
      pillarProgress: {
        accuracy: { type: Number, default: 0 },      // 0-100
        independence: { type: Number, default: 0 },  // 0-100
        transfer: { type: Number, default: 0 },      // 0-100
        retention: { type: Number, default: 0 }      // 0-100
      }
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
  },

  /* Fact Fluency Progress (Math Blaster-style game) */
  factFluencyProgress: {
    // Placement test (1-minute timed assessment to determine starting point)
    placement: {
      completed: { type: Boolean, default: false },
      completedDate: { type: Date },
      recommendedOperation: String,  // 'addition', 'subtraction', 'multiplication', 'division'
      recommendedLevel: String,      // 'plus0', 'times2', etc.
      placementResults: [{
        operation: String,
        averageRate: Number,      // Digits correct per minute
        averageAccuracy: Number   // Percentage
      }]
    },

    // Track each fact family (e.g., +0, +1, ×2, ×5, etc.)
    factFamilies: {
      type: Map,
      of: new Schema({
        operation: String,      // 'addition', 'subtraction', 'multiplication', 'division'
        familyName: String,     // 'plus0', 'minus2', 'times5', 'divided-by-3'
        displayName: String,    // '+0', '-2', '×5', '÷3'

        // Mastery status (Morningside criteria: 95%+ accuracy, 40-60 digits/min)
        mastered: { type: Boolean, default: false },
        masteredDate: { type: Date },

        // Best performance
        bestRate: Number,       // Digits correct per minute
        bestAccuracy: Number,   // Percentage (0-100)

        // Practice tracking
        attempts: { type: Number, default: 0 },
        lastPracticed: { type: Date },

        // Session history (keep last 10 sessions)
        sessions: [{
          date: { type: Date, default: Date.now },
          durationSeconds: Number,
          problemsAttempted: Number,
          problemsCorrect: Number,
          rate: Number,           // Digits correct per minute
          accuracy: Number,       // Percentage
          masteryAchieved: Boolean
        }]
      }, { _id: false }),
      default: () => new Map()
    },

    // Overall statistics
    stats: {
      totalSessions: { type: Number, default: 0 },
      totalProblemsAttempted: { type: Number, default: 0 },
      totalProblemsCorrect: { type: Number, default: 0 },
      overallAccuracy: Number,
      currentStreak: { type: Number, default: 0 },   // Days practiced in a row
      longestStreak: { type: Number, default: 0 },
      lastPracticeDate: { type: Date }
    }
  },

  /* Daily Quests & Streak System */
  dailyQuests: {
    // Current quests (reset daily)
    quests: [{
      id: String,
      templateId: String,
      name: String,
      description: String,
      icon: String,
      target: String,           // 'problemsCorrect', 'skillsPracticed', etc.
      targetCount: Number,
      progress: { type: Number, default: 0 },
      completed: { type: Boolean, default: false },
      xpReward: Number,
      bonusMultiplier: { type: Number, default: 1.0 },
      completedAt: Date
    }],

    // Metadata
    lastRefreshDate: Date,
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastPracticeDate: Date,
    totalQuestsCompleted: { type: Number, default: 0 },

    // Daily progress tracking (resets each day)
    todayProgress: {
      type: Map,
      of: Schema.Types.Mixed,
      default: () => new Map()
    }
  },

  /* Weekly Challenges System */
  weeklyChallenges: {
    // Current week's challenges (reset weekly)
    challenges: [{
      id: String,
      templateId: String,
      name: String,
      description: String,
      icon: String,
      difficulty: String,       // 'easy', 'medium', 'hard'
      targetType: String,
      targetCount: Number,
      progress: { type: Number, default: 0 },
      completed: { type: Boolean, default: false },
      xpReward: Number,
      specialReward: String,
      startDate: Date,
      endDate: Date,
      completedAt: Date
    }],

    // Metadata
    weekStartDate: Date,
    completedChallengesAllTime: { type: Number, default: 0 },

    // Weekly progress tracking (resets each week)
    weeklyProgress: {
      type: Map,
      of: Schema.Types.Mixed,
      default: () => new Map()
    }
  },

  /* Course Mode Enrollment (Structured Learning Paths) */
  courseEnrollments: {
    type: [courseEnrollmentSchema],
    default: []
  },

  // Active course for "course mode" tutoring sessions
  activeCourse: {
    courseId: { type: String },
    moduleId: { type: String },
    lessonId: { type: String },
    lastActiveAt: { type: Date }
  },

  /* ============================================================
   * AUTOMATIC PATHWAY ASSIGNMENT (CAT-based)
   *
   * After CAT assessment, student is automatically placed in a pathway.
   * They can venture off to fill gaps or extend beyond.
   * ============================================================ */
  pathwayAssignment: {
    // Primary pathway (auto-assigned from CAT theta)
    assignedPathwayId: { type: String },
    assignedPathwayName: { type: String },
    assignedAt: { type: Date },
    assignedTheta: { type: Number },  // Theta at time of assignment

    // Assignment source
    assignmentSource: {
      type: String,
      enum: ['cat-assessment', 'teacher-override', 'self-selected', 'grade-inferred'],
      default: 'cat-assessment'
    },

    // Gap-filling: when student works on skills BELOW their pathway
    gapFilling: {
      enabled: { type: Boolean, default: true },
      currentGapSkillId: { type: String },
      gapSkillsAddressed: [{
        skillId: { type: String },
        startedAt: { type: Date },
        completedAt: { type: Date },
        wasSuccessful: { type: Boolean }
      }]
    },

    // Extension: when student works on skills ABOVE their pathway
    extension: {
      enabled: { type: Boolean, default: true },
      currentExtensionSkillId: { type: String },
      extensionSkillsAttempted: [{
        skillId: { type: String },
        startedAt: { type: Date },
        completedAt: { type: Date },
        wasSuccessful: { type: Boolean }
      }]
    },

    // Pathway progression history
    progressionHistory: [{
      fromPathwayId: { type: String },
      toPathwayId: { type: String },
      progressedAt: { type: Date },
      reason: { type: String }  // 'mastery', 'reassessment', 'teacher-override'
    }]
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

/* ---------- DATABASE INDEXES ---------- */
// Critical indexes for dashboard performance
userSchema.index({ role: 1, teacherId: 1 });  // Teacher dashboard: find students by teacher
userSchema.index({ teacherId: 1 });            // Student lookups by teacher
userSchema.index({ role: 1 });                 // Role-based queries
userSchema.index({ parentIds: 1 });            // Parent dashboard: find children
userSchema.index({ lastLogin: -1 });           // Activity reports sorted by login
userSchema.index({ role: 1, lastLogin: -1 });  // Admin usage reports

/* ---------- EXPORT MODEL ---------- */
const User = mongoose.models.User || mongoose.model('User', userSchema);
module.exports = User;
