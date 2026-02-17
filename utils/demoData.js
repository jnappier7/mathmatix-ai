// utils/demoData.js
// Central definition of all demo/playground account data.
// Used by both the seed script (to create accounts) and the reset utility (to restore on logout).

const mongoose = require('mongoose');

// --- Deterministic ObjectIds for cross-referencing ---
// Using fixed hex strings so relationships survive reset cycles.
const DEMO_IDS = {
  // Loginable demo accounts
  teacherRivera:  new mongoose.Types.ObjectId('d3m0000000000000000001a1'),
  parentChen:     new mongoose.Types.ObjectId('d3m0000000000000000002a2'),
  studentMaya:    new mongoose.Types.ObjectId('d3m0000000000000000003a3'),
  studentAlex:    new mongoose.Types.ObjectId('d3m0000000000000000004a4'),
  studentJordan:  new mongoose.Types.ObjectId('d3m0000000000000000005a5'),

  // Non-loginable mock students in Ms. Rivera's class
  mockStudent01:  new mongoose.Types.ObjectId('d3m0000000000000000010b1'),
  mockStudent02:  new mongoose.Types.ObjectId('d3m0000000000000000010b2'),
  mockStudent03:  new mongoose.Types.ObjectId('d3m0000000000000000010b3'),
  mockStudent04:  new mongoose.Types.ObjectId('d3m0000000000000000010b4'),
  mockStudent05:  new mongoose.Types.ObjectId('d3m0000000000000000010b5'),
  mockStudent06:  new mongoose.Types.ObjectId('d3m0000000000000000010b6'),
  mockStudent07:  new mongoose.Types.ObjectId('d3m0000000000000000010b7'),
  mockStudent08:  new mongoose.Types.ObjectId('d3m0000000000000000010b8'),
  mockStudent09:  new mongoose.Types.ObjectId('d3m0000000000000000010b9'),
  mockStudent10:  new mongoose.Types.ObjectId('d3m00000000000000001000'),
  mockStudent11:  new mongoose.Types.ObjectId('d3m00000000000000001001'),
  mockStudent12:  new mongoose.Types.ObjectId('d3m00000000000000001002'),

  // A teacher for Maya & Alex (separate from Ms. Rivera)
  teacherForChenKids: new mongoose.Types.ObjectId('d3m0000000000000000006a6'),

  // Enrollment code
  enrollmentCode: new mongoose.Types.ObjectId('d3m0000000000000000e0001'),
};

// All demo user IDs for cleanup queries
const ALL_DEMO_USER_IDS = Object.values(DEMO_IDS).filter(id =>
  id.toString() !== DEMO_IDS.enrollmentCode.toString()
);

// --- Password (bcrypt will hash on save via pre-save hook) ---
const DEMO_PASSWORD = 'demo1234';

// ============================================================================
//  TEACHER: Ms. Rivera — 8th Grade Math
// ============================================================================
const teacherRivera = {
  _id: DEMO_IDS.teacherRivera,
  username: 'demo-teacher',
  email: 'demo-teacher@mathmatix.ai',
  passwordHash: DEMO_PASSWORD,
  firstName: 'Ms.',
  lastName: 'Rivera',
  role: 'teacher',
  roles: ['teacher'],
  isDemo: true,
  demoProfileId: 'teacher-rivera',
  needsProfileCompletion: false,
  emailVerified: true,
  xp: 0,
  level: 1,
  selectedTutorId: 'default',
  tourCompleted: false,
  tourDismissed: false,
  preferences: {
    theme: 'light',
    handsFreeModeEnabled: false,
  },
  classAISettings: {
    calculatorAccess: 'skill-based',
    calculatorNote: 'Allow calculators for computation-heavy problems. No calculators during fact fluency practice.',
    scaffoldingLevel: 3,
    scaffoldingNote: 'Medium support — let students struggle productively before stepping in.',
    vocabularyPreferences: {
      orderOfOperations: 'GEMS',
      customVocabulary: [
        "Use 'rate of change' alongside 'slope'",
        "Say 'equal groups' for multiplication"
      ],
      vocabularyNote: ''
    },
    solutionApproaches: {
      equationSolving: 'balance-method',
      fractionOperations: 'traditional-lcd',
      wordProblems: 'UPS-Check',
      customApproaches: 'I teach bar models for ratio/proportion problems.'
    },
    manipulatives: {
      allowed: true,
      preferred: ['number-line', 'algebra-tiles', 'coordinate-plane'],
      note: ''
    },
    currentTeaching: {
      topic: 'Linear Equations & Slope',
      approach: 'We start with tables and patterns before moving to y = mx + b.',
      pacing: 'Taking it steady — many students are still building integer fluency.',
      additionalContext: 'We have state testing in 6 weeks. Focus on expressions, equations, and geometry.'
    },
    responseStyle: {
      encouragementLevel: 'moderate',
      errorCorrectionStyle: 'socratic',
      showWorkRequirement: 'always'
    },
    lastUpdated: new Date()
  }
};

// ============================================================================
//  PARENT: Sarah Chen — parent of Maya (5th) and Alex (11th)
// ============================================================================
const parentChen = {
  _id: DEMO_IDS.parentChen,
  username: 'demo-parent',
  email: 'demo-parent@mathmatix.ai',
  passwordHash: DEMO_PASSWORD,
  firstName: 'Sarah',
  lastName: 'Chen',
  role: 'parent',
  roles: ['parent'],
  isDemo: true,
  demoProfileId: 'parent-chen',
  needsProfileCompletion: false,
  emailVerified: true,
  xp: 0,
  level: 1,
  tourCompleted: false,
  tourDismissed: false,
  children: [DEMO_IDS.studentMaya, DEMO_IDS.studentAlex],
  reportFrequency: 'weekly',
  goalViewPreference: 'progress',
  parentTone: 'supportive',
  parentLanguage: 'English',
  preferences: { theme: 'light' }
};

// ============================================================================
//  Hidden teacher for Chen kids (not a loginable demo account)
// ============================================================================
const teacherForChenKids = {
  _id: DEMO_IDS.teacherForChenKids,
  username: 'demo-teacher-chen-hidden',
  email: 'demo-teacher-chen@mathmatix.ai',
  passwordHash: DEMO_PASSWORD,
  firstName: 'Mr.',
  lastName: 'Patel',
  role: 'teacher',
  roles: ['teacher'],
  isDemo: true,
  demoProfileId: 'teacher-chen-kids',
  needsProfileCompletion: false,
  emailVerified: true,
  xp: 0,
  level: 1,
  classAISettings: {
    calculatorAccess: 'skill-based',
    scaffoldingLevel: 3,
    vocabularyPreferences: { orderOfOperations: 'PEMDAS' },
    responseStyle: {
      encouragementLevel: 'moderate',
      errorCorrectionStyle: 'socratic',
      showWorkRequirement: 'always'
    }
  }
};

// ============================================================================
//  STUDENT 1: Maya Chen — 5th grader (child of Sarah Chen)
// ============================================================================
const studentMaya = {
  _id: DEMO_IDS.studentMaya,
  username: 'demo-student-maya',
  email: 'demo-student-maya@mathmatix.ai',
  passwordHash: DEMO_PASSWORD,
  firstName: 'Maya',
  lastName: 'Chen',
  role: 'student',
  roles: ['student'],
  isDemo: true,
  demoProfileId: 'student-maya',
  needsProfileCompletion: false,
  emailVerified: true,
  gradeLevel: '5th Grade',
  mathCourse: '5th Grade Math',
  teacherId: DEMO_IDS.teacherForChenKids,
  parentIds: [DEMO_IDS.parentChen],
  hasParentalConsent: true,
  selectedTutorId: 'maya',
  selectedAvatarId: 'panda',
  xp: 2450,
  level: 8,
  totalActiveTutoringMinutes: 340,
  totalActiveSeconds: 20400,
  weeklyActiveSeconds: 3600,
  tourCompleted: false,
  tourDismissed: false,
  tonePreference: 'encouraging',
  preferences: { theme: 'light' },
  interests: ['art', 'soccer', 'animals'],
  subscriptionTier: 'unlimited',
  learningProfile: {
    interests: ['art', 'soccer', 'animals'],
    learningStyle: {
      prefersDiagrams: true,
      prefersRealWorldExamples: true,
      prefersStepByStep: true,
      prefersDiscovery: false
    },
    mathAnxietyLevel: 4,
    frustrationTolerance: 'medium',
    confidenceLevel: 6,
    rapportBuildingComplete: true,
    rapportAnswers: {
      interests: 'I like drawing and playing soccer',
      favoriteSubject: 'Art',
      currentTopic: 'Fractions and decimals',
      learningGoal: 'I want to understand fractions better',
      conversationStyle: 'Friendly and encouraging'
    },
    assessmentCompleted: true,
    initialPlacement: '5th Grade'
  },
  iepPlan: {
    accommodations: {
      extendedTime: false,
      reducedDistraction: false,
      calculatorAllowed: false,
      audioReadAloud: false,
      chunkedAssignments: false,
      breaksAsNeeded: false,
      digitalMultiplicationChart: false,
      largePrintHighContrast: false,
      mathAnxietySupport: false,
      custom: []
    },
    goals: [],
    preferredScaffolds: []
  },
  skillMastery: new Map([
    ['fractions-add-same', {
      status: 'mastered', masteryScore: 95, masteryType: 'verified',
      lastPracticed: new Date(Date.now() - 2 * 86400000),
      consecutiveCorrect: 8, totalAttempts: 12, currentTier: 'gold',
      pillars: {
        accuracy: { correct: 11, total: 12, percentage: 0.92, threshold: 0.90 },
        independence: { hintsUsed: 1, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['numeric', 'word-problem', 'real-world'], contextsRequired: 3 },
        retention: { retentionChecks: [{ checkDate: new Date(Date.now() - 86400000), daysSinceLastPractice: 5, accuracy: 90, passed: true }], failed: false }
      }
    }],
    ['fractions-add-different', {
      status: 'practicing', masteryScore: 65, masteryType: 'verified',
      lastPracticed: new Date(Date.now() - 86400000),
      consecutiveCorrect: 3, totalAttempts: 8, currentTier: 'bronze',
      pillars: {
        accuracy: { correct: 6, total: 8, percentage: 0.75, threshold: 0.90 },
        independence: { hintsUsed: 4, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['numeric'], contextsRequired: 3 },
        retention: { retentionChecks: [], failed: false }
      }
    }],
    ['decimals-compare', {
      status: 'mastered', masteryScore: 92, masteryType: 'verified',
      lastPracticed: new Date(Date.now() - 5 * 86400000),
      consecutiveCorrect: 10, totalAttempts: 14, currentTier: 'silver',
      pillars: {
        accuracy: { correct: 13, total: 14, percentage: 0.93, threshold: 0.90 },
        independence: { hintsUsed: 2, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['numeric', 'graphical', 'word-problem'], contextsRequired: 3 },
        retention: { retentionChecks: [], failed: false }
      }
    }],
    ['multiply-multi-digit', {
      status: 'learning', masteryScore: 40, masteryType: 'verified',
      lastPracticed: new Date(),
      consecutiveCorrect: 2, totalAttempts: 5, currentTier: 'none',
      pillars: {
        accuracy: { correct: 3, total: 5, percentage: 0.60, threshold: 0.90 },
        independence: { hintsUsed: 3, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['numeric'], contextsRequired: 3 },
        retention: { retentionChecks: [], failed: false }
      }
    }],
    ['place-value-thousands', {
      status: 'mastered', masteryScore: 98, masteryType: 'verified',
      lastPracticed: new Date(Date.now() - 10 * 86400000),
      consecutiveCorrect: 12, totalAttempts: 13, currentTier: 'gold',
      pillars: {
        accuracy: { correct: 13, total: 13, percentage: 1.0, threshold: 0.90 },
        independence: { hintsUsed: 0, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['numeric', 'graphical', 'word-problem'], contextsRequired: 3 },
        retention: { retentionChecks: [{ checkDate: new Date(Date.now() - 3 * 86400000), daysSinceLastPractice: 7, accuracy: 100, passed: true }], failed: false }
      }
    }]
  ]),
  badges: [
    { key: 'first-problem', badgeId: 'first-problem', unlockedAt: new Date(Date.now() - 30 * 86400000) },
    { key: 'streak-3', badgeId: 'streak-3', unlockedAt: new Date(Date.now() - 20 * 86400000) },
    { key: 'fraction-explorer', badgeId: 'fraction-explorer', unlockedAt: new Date(Date.now() - 10 * 86400000) }
  ],
  dailyQuests: {
    quests: [
      { id: 'dq-1', templateId: 'solve-5', name: 'Problem Solver', description: 'Solve 5 problems correctly', icon: 'star', target: 'problemsCorrect', targetCount: 5, progress: 2, completed: false, xpReward: 50, bonusMultiplier: 1.0 },
      { id: 'dq-2', templateId: 'practice-2-skills', name: 'Skill Explorer', description: 'Practice 2 different skills', icon: 'compass', target: 'skillsPracticed', targetCount: 2, progress: 1, completed: false, xpReward: 30, bonusMultiplier: 1.0 }
    ],
    lastRefreshDate: new Date(),
    currentStreak: 4,
    longestStreak: 7,
    totalQuestsCompleted: 28
  }
};

// ============================================================================
//  STUDENT 2: Alex Chen — 11th grader (child of Sarah Chen)
// ============================================================================
const studentAlex = {
  _id: DEMO_IDS.studentAlex,
  username: 'demo-student-alex',
  email: 'demo-student-alex@mathmatix.ai',
  passwordHash: DEMO_PASSWORD,
  firstName: 'Alex',
  lastName: 'Chen',
  role: 'student',
  roles: ['student'],
  isDemo: true,
  demoProfileId: 'student-alex',
  needsProfileCompletion: false,
  emailVerified: true,
  gradeLevel: '11th Grade',
  mathCourse: 'Algebra 2',
  teacherId: DEMO_IDS.teacherForChenKids,
  parentIds: [DEMO_IDS.parentChen],
  hasParentalConsent: true,
  selectedTutorId: 'mr-nappier',
  selectedAvatarId: 'wolf',
  xp: 8750,
  level: 15,
  totalActiveTutoringMinutes: 1200,
  totalActiveSeconds: 72000,
  weeklyActiveSeconds: 5400,
  tourCompleted: false,
  tourDismissed: false,
  tonePreference: 'straightforward',
  preferences: { theme: 'dark' },
  interests: ['basketball', 'gaming', 'music'],
  subscriptionTier: 'unlimited',
  learningProfile: {
    interests: ['basketball', 'gaming', 'music'],
    learningStyle: {
      prefersDiagrams: false,
      prefersRealWorldExamples: true,
      prefersStepByStep: false,
      prefersDiscovery: true
    },
    mathAnxietyLevel: 2,
    frustrationTolerance: 'high',
    confidenceLevel: 7,
    rapportBuildingComplete: true,
    rapportAnswers: {
      interests: 'Basketball and video games',
      favoriteSubject: 'Physics',
      currentTopic: 'Quadratic equations and polynomials',
      learningGoal: 'Get ready for Pre-Calc next year',
      conversationStyle: 'Direct, not too much fluff'
    },
    assessmentCompleted: true,
    initialPlacement: '10th Grade'
  },
  iepPlan: {
    accommodations: {
      extendedTime: false, reducedDistraction: false, calculatorAllowed: false,
      audioReadAloud: false, chunkedAssignments: false, breaksAsNeeded: false,
      digitalMultiplicationChart: false, largePrintHighContrast: false,
      mathAnxietySupport: false, custom: []
    },
    goals: [],
    preferredScaffolds: []
  },
  skillMastery: new Map([
    ['quadratic-standard-form', {
      status: 'mastered', masteryScore: 94, masteryType: 'verified',
      lastPracticed: new Date(Date.now() - 3 * 86400000),
      consecutiveCorrect: 9, totalAttempts: 11, currentTier: 'gold',
      pillars: {
        accuracy: { correct: 10, total: 11, percentage: 0.91, threshold: 0.90 },
        independence: { hintsUsed: 1, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['numeric', 'graphical', 'word-problem'], contextsRequired: 3 },
        retention: { retentionChecks: [{ checkDate: new Date(Date.now() - 2 * 86400000), daysSinceLastPractice: 7, accuracy: 95, passed: true }], failed: false }
      }
    }],
    ['quadratic-factoring', {
      status: 'practicing', masteryScore: 72, masteryType: 'verified',
      lastPracticed: new Date(Date.now() - 86400000),
      consecutiveCorrect: 4, totalAttempts: 9, currentTier: 'silver',
      pillars: {
        accuracy: { correct: 7, total: 9, percentage: 0.78, threshold: 0.90 },
        independence: { hintsUsed: 3, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['numeric', 'graphical'], contextsRequired: 3 },
        retention: { retentionChecks: [], failed: false }
      }
    }],
    ['linear-equations-two-step', {
      status: 'mastered', masteryScore: 97, masteryType: 'verified',
      lastPracticed: new Date(Date.now() - 14 * 86400000),
      consecutiveCorrect: 15, totalAttempts: 16, currentTier: 'diamond',
      pillars: {
        accuracy: { correct: 15, total: 16, percentage: 0.94, threshold: 0.90 },
        independence: { hintsUsed: 0, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['numeric', 'graphical', 'word-problem', 'real-world'], contextsRequired: 3 },
        retention: { retentionChecks: [{ checkDate: new Date(Date.now() - 7 * 86400000), daysSinceLastPractice: 14, accuracy: 100, passed: true }], failed: false }
      }
    }],
    ['polynomial-operations', {
      status: 'learning', masteryScore: 45, masteryType: 'verified',
      lastPracticed: new Date(),
      consecutiveCorrect: 2, totalAttempts: 6, currentTier: 'none',
      pillars: {
        accuracy: { correct: 3, total: 6, percentage: 0.50, threshold: 0.90 },
        independence: { hintsUsed: 5, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['numeric'], contextsRequired: 3 },
        retention: { retentionChecks: [], failed: false }
      }
    }],
    ['systems-of-equations', {
      status: 'mastered', masteryScore: 91, masteryType: 'verified',
      lastPracticed: new Date(Date.now() - 7 * 86400000),
      consecutiveCorrect: 8, totalAttempts: 10, currentTier: 'gold',
      pillars: {
        accuracy: { correct: 9, total: 10, percentage: 0.90, threshold: 0.90 },
        independence: { hintsUsed: 2, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['numeric', 'graphical', 'word-problem'], contextsRequired: 3 },
        retention: { retentionChecks: [], failed: false }
      }
    }],
    ['slope-intercept', {
      status: 'mastered', masteryScore: 96, masteryType: 'verified',
      lastPracticed: new Date(Date.now() - 20 * 86400000),
      consecutiveCorrect: 12, totalAttempts: 13, currentTier: 'diamond',
      pillars: {
        accuracy: { correct: 12, total: 13, percentage: 0.92, threshold: 0.90 },
        independence: { hintsUsed: 0, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['numeric', 'graphical', 'word-problem', 'real-world'], contextsRequired: 3 },
        retention: { retentionChecks: [{ checkDate: new Date(Date.now() - 10 * 86400000), daysSinceLastPractice: 10, accuracy: 100, passed: true }], failed: false }
      }
    }]
  ]),
  badges: [
    { key: 'first-problem', badgeId: 'first-problem', unlockedAt: new Date(Date.now() - 90 * 86400000) },
    { key: 'streak-7', badgeId: 'streak-7', unlockedAt: new Date(Date.now() - 60 * 86400000) },
    { key: 'streak-30', badgeId: 'streak-30', unlockedAt: new Date(Date.now() - 30 * 86400000) },
    { key: 'algebra-master', badgeId: 'algebra-master', unlockedAt: new Date(Date.now() - 15 * 86400000) },
    { key: 'equation-solver', badgeId: 'equation-solver', unlockedAt: new Date(Date.now() - 5 * 86400000) }
  ],
  dailyQuests: {
    quests: [
      { id: 'dq-1', templateId: 'solve-10', name: 'Math Machine', description: 'Solve 10 problems correctly', icon: 'fire', target: 'problemsCorrect', targetCount: 10, progress: 6, completed: false, xpReward: 100, bonusMultiplier: 1.5 },
      { id: 'dq-2', templateId: 'practice-3-skills', name: 'Skill Seeker', description: 'Practice 3 different skills', icon: 'compass', target: 'skillsPracticed', targetCount: 3, progress: 2, completed: false, xpReward: 60, bonusMultiplier: 1.0 }
    ],
    lastRefreshDate: new Date(),
    currentStreak: 12,
    longestStreak: 22,
    totalQuestsCompleted: 94
  }
};

// ============================================================================
//  STUDENT 3: Jordan Martinez — 8th grader in Ms. Rivera's class (has IEP)
// ============================================================================
const studentJordan = {
  _id: DEMO_IDS.studentJordan,
  username: 'demo-student-jordan',
  email: 'demo-student-jordan@mathmatix.ai',
  passwordHash: DEMO_PASSWORD,
  firstName: 'Jordan',
  lastName: 'Martinez',
  role: 'student',
  roles: ['student'],
  isDemo: true,
  demoProfileId: 'student-jordan',
  needsProfileCompletion: false,
  emailVerified: true,
  gradeLevel: '8th Grade',
  mathCourse: '8th Grade Math',
  teacherId: DEMO_IDS.teacherRivera,
  parentIds: [],
  hasParentalConsent: true,
  selectedTutorId: 'ms-maria',
  selectedAvatarId: 'dragon',
  xp: 3100,
  level: 10,
  totalActiveTutoringMinutes: 520,
  totalActiveSeconds: 31200,
  weeklyActiveSeconds: 2700,
  tourCompleted: false,
  tourDismissed: false,
  tonePreference: 'encouraging',
  preferences: { theme: 'light' },
  interests: ['skateboarding', 'drawing', 'video games'],
  subscriptionTier: 'unlimited',
  learningProfile: {
    interests: ['skateboarding', 'drawing', 'video games'],
    learningStyle: {
      prefersDiagrams: true,
      prefersRealWorldExamples: true,
      prefersStepByStep: true,
      prefersDiscovery: false
    },
    mathAnxietyLevel: 7,
    frustrationTolerance: 'low',
    confidenceLevel: 4,
    rapportBuildingComplete: true,
    rapportAnswers: {
      interests: 'Skateboarding and drawing',
      favoriteSubject: 'Art',
      currentTopic: 'Linear equations — struggling with word problems',
      learningGoal: 'Pass my math class and feel less stressed about tests',
      conversationStyle: 'Patient, encouraging, lots of examples'
    },
    assessmentCompleted: true,
    initialPlacement: '6th Grade'
  },
  iepPlan: {
    accommodations: {
      extendedTime: true,
      reducedDistraction: true,
      calculatorAllowed: true,
      audioReadAloud: true,
      chunkedAssignments: true,
      breaksAsNeeded: true,
      digitalMultiplicationChart: true,
      largePrintHighContrast: false,
      mathAnxietySupport: true,
      custom: ['Frequent check-ins', 'Allow verbal responses', 'Frequent breaks']
    },
    goals: [
      {
        description: 'Solve two-step equations with 80% accuracy on 3 consecutive assessments',
        targetDate: new Date(Date.now() + 60 * 86400000),
        currentProgress: 55,
        measurementMethod: 'AI-tracked problem accuracy with skill mastery pillars',
        status: 'active',
        history: [
          { date: new Date(Date.now() - 30 * 86400000), field: 'currentProgress', from: 30, to: 45 },
          { date: new Date(Date.now() - 14 * 86400000), field: 'currentProgress', from: 45, to: 55 }
        ]
      },
      {
        description: 'Independently identify the operation in word problems 70% of the time',
        targetDate: new Date(Date.now() + 90 * 86400000),
        currentProgress: 35,
        measurementMethod: 'Tutor observation + word problem accuracy',
        status: 'active',
        history: [
          { date: new Date(Date.now() - 21 * 86400000), field: 'currentProgress', from: 20, to: 35 }
        ]
      },
      {
        description: 'Demonstrate fluency with single-digit multiplication facts (40+ digits/min)',
        targetDate: new Date(Date.now() + 45 * 86400000),
        currentProgress: 70,
        measurementMethod: 'Fact fluency game performance',
        status: 'active',
        history: [
          { date: new Date(Date.now() - 30 * 86400000), field: 'currentProgress', from: 40, to: 55 },
          { date: new Date(Date.now() - 14 * 86400000), field: 'currentProgress', from: 55, to: 70 }
        ]
      }
    ],
    readingLevel: 5.5,
    preferredScaffolds: ['hints', 'examples', 'graphic organizers', 'number line']
  },
  skillMastery: new Map([
    ['linear-equations-one-step', {
      status: 'mastered', masteryScore: 88, masteryType: 'verified',
      lastPracticed: new Date(Date.now() - 5 * 86400000),
      consecutiveCorrect: 7, totalAttempts: 10, currentTier: 'silver',
      pillars: {
        accuracy: { correct: 9, total: 10, percentage: 0.90, threshold: 0.90 },
        independence: { hintsUsed: 2, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['numeric', 'word-problem', 'real-world'], contextsRequired: 3 },
        retention: { retentionChecks: [{ checkDate: new Date(Date.now() - 3 * 86400000), daysSinceLastPractice: 5, accuracy: 85, passed: true }], failed: false }
      }
    }],
    ['linear-equations-two-step', {
      status: 'practicing', masteryScore: 52, masteryType: 'verified',
      lastPracticed: new Date(Date.now() - 86400000),
      consecutiveCorrect: 2, totalAttempts: 8, currentTier: 'bronze',
      pillars: {
        accuracy: { correct: 5, total: 8, percentage: 0.63, threshold: 0.90 },
        independence: { hintsUsed: 6, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['numeric'], contextsRequired: 3 },
        retention: { retentionChecks: [], failed: false }
      }
    }],
    ['integer-operations', {
      status: 'practicing', masteryScore: 60, masteryType: 'verified',
      lastPracticed: new Date(Date.now() - 2 * 86400000),
      consecutiveCorrect: 3, totalAttempts: 7, currentTier: 'bronze',
      pillars: {
        accuracy: { correct: 5, total: 7, percentage: 0.71, threshold: 0.90 },
        independence: { hintsUsed: 4, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['numeric', 'word-problem'], contextsRequired: 3 },
        retention: { retentionChecks: [], failed: false }
      }
    }],
    ['fractions-add-same', {
      status: 'mastered', masteryScore: 90, masteryType: 'verified',
      lastPracticed: new Date(Date.now() - 20 * 86400000),
      consecutiveCorrect: 8, totalAttempts: 10, currentTier: 'silver',
      pillars: {
        accuracy: { correct: 9, total: 10, percentage: 0.90, threshold: 0.90 },
        independence: { hintsUsed: 1, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['numeric', 'word-problem', 'real-world'], contextsRequired: 3 },
        retention: { retentionChecks: [], failed: false }
      }
    }],
    ['multiplication-facts', {
      status: 'practicing', masteryScore: 68, masteryType: 'verified',
      lastPracticed: new Date(Date.now() - 86400000),
      consecutiveCorrect: 4, totalAttempts: 10, currentTier: 'bronze',
      pillars: {
        accuracy: { correct: 7, total: 10, percentage: 0.70, threshold: 0.90 },
        independence: { hintsUsed: 0, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['numeric'], contextsRequired: 3 },
        retention: { retentionChecks: [], failed: false }
      }
    }]
  ]),
  badges: [
    { key: 'first-problem', badgeId: 'first-problem', unlockedAt: new Date(Date.now() - 60 * 86400000) },
    { key: 'streak-3', badgeId: 'streak-3', unlockedAt: new Date(Date.now() - 40 * 86400000) },
    { key: 'comeback-kid', badgeId: 'comeback-kid', unlockedAt: new Date(Date.now() - 10 * 86400000) }
  ],
  factFluencyProgress: {
    placement: {
      completed: true,
      completedDate: new Date(Date.now() - 30 * 86400000),
      recommendedOperation: 'multiplication',
      recommendedLevel: 'times6'
    },
    stats: {
      totalSessions: 18,
      totalProblemsAttempted: 540,
      totalProblemsCorrect: 378,
      overallAccuracy: 70,
      currentStreak: 3,
      longestStreak: 5,
      lastPracticeDate: new Date(Date.now() - 86400000)
    }
  },
  dailyQuests: {
    quests: [
      { id: 'dq-1', templateId: 'solve-5', name: 'Problem Solver', description: 'Solve 5 problems correctly', icon: 'star', target: 'problemsCorrect', targetCount: 5, progress: 1, completed: false, xpReward: 50, bonusMultiplier: 1.0 }
    ],
    lastRefreshDate: new Date(),
    currentStreak: 3,
    longestStreak: 5,
    totalQuestsCompleted: 15
  }
};

// ============================================================================
//  MOCK STUDENTS for Ms. Rivera's class (non-loginable, for dashboard realism)
// ============================================================================
function buildMockStudent(id, firstName, lastName, xp, level, opts = {}) {
  return {
    _id: id,
    username: `demo-mock-${firstName.toLowerCase()}`,
    email: `demo-mock-${firstName.toLowerCase()}@mathmatix.ai`,
    passwordHash: DEMO_PASSWORD,
    firstName,
    lastName,
    role: 'student',
    roles: ['student'],
    isDemo: true,
    demoProfileId: `mock-student-${firstName.toLowerCase()}`,
    needsProfileCompletion: false,
    emailVerified: true,
    gradeLevel: '8th Grade',
    mathCourse: '8th Grade Math',
    teacherId: DEMO_IDS.teacherRivera,
    parentIds: [],
    hasParentalConsent: true,
    selectedTutorId: ['mr-nappier', 'maya', 'ms-maria', 'bob'][Math.floor(Math.random() * 4)],
    selectedAvatarId: ['cat', 'dog', 'fox', 'owl', 'bear', 'rabbit'][Math.floor(Math.random() * 6)],
    xp,
    level,
    totalActiveTutoringMinutes: opts.minutes || Math.floor(xp / 5),
    totalActiveSeconds: (opts.minutes || Math.floor(xp / 5)) * 60,
    weeklyActiveSeconds: Math.floor(Math.random() * 5400),
    tourCompleted: true,
    tonePreference: 'encouraging',
    preferences: { theme: 'light' },
    subscriptionTier: 'unlimited',
    interests: opts.interests || ['sports', 'gaming'],
    iepPlan: opts.iepPlan || {
      accommodations: { extendedTime: false, reducedDistraction: false, calculatorAllowed: false, audioReadAloud: false, chunkedAssignments: false, breaksAsNeeded: false, digitalMultiplicationChart: false, largePrintHighContrast: false, mathAnxietySupport: false, custom: [] },
      goals: [],
      preferredScaffolds: []
    },
    learningProfile: {
      interests: opts.interests || ['sports', 'gaming'],
      mathAnxietyLevel: opts.anxietyLevel || 5,
      frustrationTolerance: opts.frustration || 'medium',
      confidenceLevel: opts.confidence || 5,
      assessmentCompleted: true,
      initialPlacement: opts.placement || '8th Grade'
    },
    skillMastery: opts.skillMastery || new Map(),
    badges: opts.badges || [{ key: 'first-problem', badgeId: 'first-problem', unlockedAt: new Date(Date.now() - 30 * 86400000) }],
  };
}

const mockStudents = [
  // High performers
  buildMockStudent(DEMO_IDS.mockStudent01, 'Aisha', 'Thompson', 6200, 13, {
    minutes: 800, interests: ['reading', 'science'], confidence: 8, anxietyLevel: 2, placement: '9th Grade',
    badges: [
      { key: 'first-problem', badgeId: 'first-problem', unlockedAt: new Date(Date.now() - 60 * 86400000) },
      { key: 'streak-7', badgeId: 'streak-7', unlockedAt: new Date(Date.now() - 30 * 86400000) },
      { key: 'equation-solver', badgeId: 'equation-solver', unlockedAt: new Date(Date.now() - 10 * 86400000) },
    ]
  }),
  buildMockStudent(DEMO_IDS.mockStudent02, 'Ethan', 'Kim', 5500, 12, {
    minutes: 650, interests: ['coding', 'chess'], confidence: 7, anxietyLevel: 3, placement: '8th Grade'
  }),

  // Mid-level students
  buildMockStudent(DEMO_IDS.mockStudent03, 'Sofia', 'Ramirez', 3800, 10, {
    minutes: 450, interests: ['dance', 'art'], confidence: 6, anxietyLevel: 4
  }),
  buildMockStudent(DEMO_IDS.mockStudent04, 'Marcus', 'Williams', 3200, 9, {
    minutes: 400, interests: ['football', 'music'], confidence: 5, anxietyLevel: 5
  }),
  buildMockStudent(DEMO_IDS.mockStudent05, 'Lily', 'Nguyen', 2900, 9, {
    minutes: 380, interests: ['writing', 'animals'], confidence: 6, anxietyLevel: 4
  }),
  buildMockStudent(DEMO_IDS.mockStudent06, 'Diego', 'Hernandez', 2600, 8, {
    minutes: 320, interests: ['soccer', 'cooking'], confidence: 5, anxietyLevel: 5
  }),

  // Students who need extra support
  buildMockStudent(DEMO_IDS.mockStudent07, 'Jasmine', 'Brown', 1800, 6, {
    minutes: 280, interests: ['art', 'music'], confidence: 4, anxietyLevel: 6, frustration: 'low', placement: '7th Grade',
    iepPlan: {
      accommodations: { extendedTime: true, reducedDistraction: false, calculatorAllowed: true, audioReadAloud: false, chunkedAssignments: true, breaksAsNeeded: false, digitalMultiplicationChart: false, largePrintHighContrast: false, mathAnxietySupport: true, custom: [] },
      goals: [
        { description: 'Master integer operations with 75% accuracy', targetDate: new Date(Date.now() + 45 * 86400000), currentProgress: 40, measurementMethod: 'AI-tracked accuracy', status: 'active', history: [] }
      ],
      preferredScaffolds: ['hints', 'examples']
    }
  }),
  buildMockStudent(DEMO_IDS.mockStudent08, 'Tyler', 'O\'Brien', 1500, 5, {
    minutes: 220, interests: ['gaming', 'skateboarding'], confidence: 3, anxietyLevel: 7, frustration: 'low', placement: '6th Grade',
    iepPlan: {
      accommodations: { extendedTime: true, reducedDistraction: true, calculatorAllowed: true, audioReadAloud: true, chunkedAssignments: true, breaksAsNeeded: true, digitalMultiplicationChart: true, largePrintHighContrast: false, mathAnxietySupport: true, custom: ['Preferential seating', 'Frequent breaks'] },
      goals: [
        { description: 'Solve one-step equations independently 70% of the time', targetDate: new Date(Date.now() + 60 * 86400000), currentProgress: 50, measurementMethod: 'AI independence pillar tracking', status: 'active', history: [] },
        { description: 'Improve multiplication fact fluency to 30 digits/min', targetDate: new Date(Date.now() + 90 * 86400000), currentProgress: 45, measurementMethod: 'Fact fluency game data', status: 'active', history: [] }
      ],
      readingLevel: 4.5,
      preferredScaffolds: ['hints', 'examples', 'graphic organizers', 'number line']
    }
  }),
  buildMockStudent(DEMO_IDS.mockStudent09, 'Priya', 'Patel', 2100, 7, {
    minutes: 300, interests: ['reading', 'dance'], confidence: 4, anxietyLevel: 6
  }),

  // Low activity / newer students
  buildMockStudent(DEMO_IDS.mockStudent10, 'Zach', 'Taylor', 800, 3, {
    minutes: 90, interests: ['gaming'], confidence: 5, anxietyLevel: 5
  }),
  buildMockStudent(DEMO_IDS.mockStudent11, 'Mia', 'Anderson', 400, 2, {
    minutes: 45, interests: ['gymnastics', 'art'], confidence: 6, anxietyLevel: 4
  }),
  buildMockStudent(DEMO_IDS.mockStudent12, 'Cameron', 'Jackson', 150, 1, {
    minutes: 15, interests: ['sports'], confidence: 5, anxietyLevel: 5
  }),
];

// ============================================================================
//  ENROLLMENT CODE for Ms. Rivera's class
// ============================================================================
const enrollmentCode = {
  _id: DEMO_IDS.enrollmentCode,
  code: 'RIVERA-8TH',
  teacherId: DEMO_IDS.teacherRivera,
  className: 'Period 3 — 8th Grade Math',
  description: 'Ms. Rivera\'s 8th grade math class',
  gradeLevel: '8th Grade',
  mathCourse: '8th Grade Math',
  isActive: true,
  expiresAt: new Date(Date.now() + 365 * 86400000),
  maxUses: 35,
  useCount: 13, // Jordan + 12 mock students
  enrolledStudents: [
    { studentId: DEMO_IDS.studentJordan, enrolledAt: new Date(Date.now() - 60 * 86400000), enrollmentMethod: 'self-signup' },
    ...Object.keys(DEMO_IDS)
      .filter(k => k.startsWith('mockStudent'))
      .map(k => ({
        studentId: DEMO_IDS[k],
        enrolledAt: new Date(Date.now() - Math.floor(Math.random() * 60 + 30) * 86400000),
        enrollmentMethod: 'admin-created'
      }))
  ],
  createdBy: DEMO_IDS.teacherRivera,
  createdAt: new Date(Date.now() - 90 * 86400000)
};

// ============================================================================
//  SAMPLE CONVERSATIONS (for live activity feed & chat history)
// ============================================================================
function buildConversations(userIds) {
  const now = Date.now();
  return [
    // Maya's active conversation about fractions
    {
      userId: userIds.studentMaya,
      conversationName: 'Adding Fractions',
      topic: 'Fractions',
      topicEmoji: '🍕',
      conversationType: 'general',
      startDate: new Date(now - 15 * 60000),
      lastActivity: new Date(now - 2 * 60000),
      isActive: true,
      activeMinutes: 13,
      activeSeconds: 780,
      liveSummary: 'Maya is working on adding fractions with different denominators. She understands the concept of finding a common denominator but needs practice with the mechanics.',
      currentTopic: 'Adding fractions with different denominators',
      problemsAttempted: 4,
      problemsCorrect: 2,
      strugglingWith: 'finding LCD for larger denominators',
      lastSummaryUpdate: new Date(now - 3 * 60000),
      messages: [
        { role: 'user', content: 'Can you help me add 2/3 + 1/4?', timestamp: new Date(now - 14 * 60000) },
        { role: 'assistant', content: 'Of course! To add fractions with different denominators, we first need to find a common denominator. What number do both 3 and 4 divide into evenly?', timestamp: new Date(now - 13 * 60000) },
        { role: 'user', content: 'Um, 12?', timestamp: new Date(now - 12 * 60000) },
        { role: 'assistant', content: 'Great job! 12 is the least common denominator (LCD) of 3 and 4. Now, we need to convert each fraction:\n\n- 2/3 → multiply top and bottom by 4 → 8/12\n- 1/4 → multiply top and bottom by 3 → 3/12\n\nCan you add 8/12 + 3/12 for me?', timestamp: new Date(now - 11 * 60000) },
        { role: 'user', content: '11/12!', timestamp: new Date(now - 10 * 60000) },
        { role: 'assistant', content: 'That\'s exactly right! 8/12 + 3/12 = 11/12. You nailed it! 🎉\n\nWant to try another one? How about 3/5 + 2/7?', timestamp: new Date(now - 9 * 60000) },
        { role: 'user', content: 'Ok... the LCD would be 35?', timestamp: new Date(now - 7 * 60000) },
        { role: 'assistant', content: 'Perfect! 5 × 7 = 35. Now convert each fraction to have a denominator of 35. What would 3/5 become?', timestamp: new Date(now - 6 * 60000) },
        { role: 'user', content: 'I\'m not sure... 21/35?', timestamp: new Date(now - 4 * 60000) },
        { role: 'assistant', content: 'Yes! You multiplied the top and bottom by 7: (3×7)/(5×7) = 21/35 ✓\n\nNow what about 2/7?', timestamp: new Date(now - 3 * 60000) }
      ]
    },

    // Alex's active conversation about quadratics
    {
      userId: userIds.studentAlex,
      conversationName: 'Factoring Quadratics',
      topic: 'Quadratic Equations',
      topicEmoji: '📐',
      conversationType: 'general',
      startDate: new Date(now - 25 * 60000),
      lastActivity: new Date(now - 5 * 60000),
      isActive: true,
      activeMinutes: 20,
      activeSeconds: 1200,
      liveSummary: 'Alex is factoring quadratic expressions. He has a solid grasp of the standard form and can identify a, b, c. Working on finding factors efficiently.',
      currentTopic: 'Factoring trinomials',
      problemsAttempted: 6,
      problemsCorrect: 4,
      strugglingWith: null,
      lastSummaryUpdate: new Date(now - 5 * 60000),
      messages: [
        { role: 'user', content: 'How do I factor x² + 7x + 12?', timestamp: new Date(now - 24 * 60000) },
        { role: 'assistant', content: 'Good question! To factor x² + 7x + 12, we need two numbers that:\n- **Multiply** to give 12 (the last term)\n- **Add** to give 7 (the middle coefficient)\n\nWhat two numbers multiply to 12 and add to 7?', timestamp: new Date(now - 23 * 60000) },
        { role: 'user', content: '3 and 4', timestamp: new Date(now - 22 * 60000) },
        { role: 'assistant', content: 'Exactly! 3 × 4 = 12 and 3 + 4 = 7. ✓\n\nSo the factored form is: **(x + 3)(x + 4)**\n\nYou can verify by FOILing it back out. Want to try one that\'s a bit trickier?', timestamp: new Date(now - 21 * 60000) },
        { role: 'user', content: 'Yeah go for it', timestamp: new Date(now - 20 * 60000) },
        { role: 'assistant', content: 'Try this: **x² - 5x + 6**\n\nSame process — find two numbers that multiply to 6 and add to -5. Be careful with the signs!', timestamp: new Date(now - 19 * 60000) },
        { role: 'user', content: '-2 and -3?', timestamp: new Date(now - 17 * 60000) },
        { role: 'assistant', content: 'Nailed it! (-2) × (-3) = 6 ✓ and (-2) + (-3) = -5 ✓\n\nFactored: **(x - 2)(x - 3)**\n\nYou\'re getting the hang of this! Let\'s level up: **2x² + 5x + 3**\n\nThis one has a leading coefficient other than 1.', timestamp: new Date(now - 15 * 60000) },
        { role: 'user', content: 'Hmm this is harder. Do I use the same method?', timestamp: new Date(now - 12 * 60000) },
        { role: 'assistant', content: 'Similar idea but with a twist! For **ax² + bx + c** where a ≠ 1:\n\n1. Multiply a × c = 2 × 3 = 6\n2. Find two numbers that multiply to 6 and add to 5 (the b value)\n3. Rewrite the middle term using those numbers\n4. Factor by grouping\n\nWhat two numbers multiply to 6 and add to 5?', timestamp: new Date(now - 10 * 60000) }
      ]
    },

    // Jordan's active conversation about equations (with struggle)
    {
      userId: userIds.studentJordan,
      conversationName: 'Two-Step Equations',
      topic: 'Linear Equations',
      topicEmoji: '⚖️',
      conversationType: 'general',
      startDate: new Date(now - 10 * 60000),
      lastActivity: new Date(now - 1 * 60000),
      isActive: true,
      activeMinutes: 9,
      activeSeconds: 540,
      liveSummary: 'Jordan is working on two-step equations. Making progress on the steps but struggling with negative numbers in the process. Using hints frequently.',
      currentTopic: 'Solving two-step equations',
      problemsAttempted: 3,
      problemsCorrect: 1,
      strugglingWith: 'negative numbers when isolating variables',
      lastSummaryUpdate: new Date(now - 2 * 60000),
      alerts: [{
        type: 'struggle',
        message: 'Struggling with negative numbers when solving equations',
        timestamp: new Date(now - 3 * 60000),
        acknowledged: false
      }],
      messages: [
        { role: 'user', content: 'I need help with 3x - 7 = 14', timestamp: new Date(now - 9 * 60000) },
        { role: 'assistant', content: 'No problem, Jordan! Let\'s solve this step by step. 💪\n\n**3x - 7 = 14**\n\nFirst step: We want to get the x-term alone. What should we do to get rid of the -7?', timestamp: new Date(now - 8 * 60000) },
        { role: 'user', content: 'Add 7 to both sides?', timestamp: new Date(now - 7 * 60000) },
        { role: 'assistant', content: 'Exactly right! Adding 7 to both sides:\n\n3x - 7 + 7 = 14 + 7\n3x = 21\n\nGreat! Now what do we do to find x?', timestamp: new Date(now - 6 * 60000) },
        { role: 'user', content: 'Divide by 3. x = 7', timestamp: new Date(now - 5 * 60000) },
        { role: 'assistant', content: 'Perfect! x = 7 ✓ You got it!\n\nLet\'s try: **-2x + 5 = 11**\n\nThis one starts with a negative. What\'s the first step?', timestamp: new Date(now - 4 * 60000) },
        { role: 'user', content: 'Subtract 5? So -2x = 6?', timestamp: new Date(now - 3 * 60000) },
        { role: 'assistant', content: 'Yes! 11 - 5 = 6, so -2x = 6. ✓\n\nNow, to find x, we divide both sides by -2. What is 6 ÷ (-2)?', timestamp: new Date(now - 2 * 60000) },
        { role: 'user', content: 'x = 3? Wait no... a negative divided... x = -3?', timestamp: new Date(now - 1 * 60000) },
        { role: 'assistant', content: 'You got it right the second time! x = -3 ✓\n\nWhen we divide a positive by a negative, the answer is negative. It\'s totally normal for the negative signs to be tricky — you\'re doing great by catching your own mistake! That shows real mathematical thinking. 🌟\n\nWant to try one more?', timestamp: new Date(now - 30000) }
      ]
    },

    // Mock student conversations for teacher live feed
    {
      userId: userIds.mockStudent01,
      conversationName: 'Systems of Equations',
      topic: 'Systems of Equations',
      topicEmoji: '📊',
      conversationType: 'general',
      startDate: new Date(now - 18 * 60000),
      lastActivity: new Date(now - 4 * 60000),
      isActive: true,
      activeMinutes: 14,
      activeSeconds: 840,
      liveSummary: 'Aisha is working through systems of equations using substitution. She\'s making excellent progress.',
      currentTopic: 'Systems — substitution method',
      problemsAttempted: 5,
      problemsCorrect: 4,
      lastSummaryUpdate: new Date(now - 5 * 60000),
      messages: [
        { role: 'user', content: 'Can we do systems of equations? My teacher said I could move ahead.', timestamp: new Date(now - 18 * 60000) },
        { role: 'assistant', content: 'Absolutely! Let\'s work on solving systems of equations using substitution. Here\'s a system:\n\ny = 2x + 1\n3x + y = 16\n\nSince we already know y = 2x + 1, can you substitute it into the second equation?', timestamp: new Date(now - 17 * 60000) }
      ]
    },
    {
      userId: userIds.mockStudent04,
      conversationName: 'Slope Practice',
      topic: 'Slope',
      topicEmoji: '📈',
      conversationType: 'general',
      startDate: new Date(now - 8 * 60000),
      lastActivity: new Date(now - 2 * 60000),
      isActive: true,
      activeMinutes: 6,
      activeSeconds: 360,
      liveSummary: 'Marcus is calculating slope from two points. Understands rise/run but making arithmetic errors with negatives.',
      currentTopic: 'Finding slope between two points',
      problemsAttempted: 3,
      problemsCorrect: 1,
      strugglingWith: 'subtracting negative coordinates',
      lastSummaryUpdate: new Date(now - 3 * 60000),
      alerts: [{
        type: 'struggle',
        message: 'Arithmetic errors with negative coordinate subtraction',
        timestamp: new Date(now - 3 * 60000),
        acknowledged: false
      }],
      messages: [
        { role: 'user', content: 'What is slope again?', timestamp: new Date(now - 8 * 60000) },
        { role: 'assistant', content: 'Slope measures how steep a line is. It\'s the ratio of the vertical change (rise) to the horizontal change (run) between two points.\n\nFormula: slope = (y₂ - y₁) / (x₂ - x₁)\n\nLet\'s try it! Find the slope between (2, 3) and (5, 9).', timestamp: new Date(now - 7 * 60000) }
      ]
    },
    {
      userId: userIds.mockStudent08,
      conversationName: 'One-Step Equations Practice',
      topic: 'Linear Equations',
      topicEmoji: '⚖️',
      conversationType: 'general',
      startDate: new Date(now - 12 * 60000),
      lastActivity: new Date(now - 1 * 60000),
      isActive: true,
      activeMinutes: 11,
      activeSeconds: 660,
      liveSummary: 'Tyler is reviewing one-step equations. Taking his time and using the calculator for basic arithmetic. Working at his own pace.',
      currentTopic: 'One-step equations review',
      problemsAttempted: 4,
      problemsCorrect: 3,
      lastSummaryUpdate: new Date(now - 2 * 60000),
      messages: [
        { role: 'user', content: 'I want to practice equations', timestamp: new Date(now - 12 * 60000) },
        { role: 'assistant', content: 'Sure thing, Tyler! Let\'s start with some one-step equations and build up from there. Try this:\n\nx + 9 = 15\n\nWhat do you think x is?', timestamp: new Date(now - 11 * 60000) }
      ]
    }
  ];
}

// ============================================================================
//  EXPORTS
// ============================================================================
module.exports = {
  DEMO_IDS,
  ALL_DEMO_USER_IDS,
  DEMO_PASSWORD,

  // Loginable accounts
  teacherRivera,
  parentChen,
  studentMaya,
  studentAlex,
  studentJordan,

  // Supporting accounts
  teacherForChenKids,
  mockStudents,
  enrollmentCode,

  // Builder functions
  buildConversations,

  // All loginable demo profiles (for the demo selection page)
  DEMO_PROFILES: {
    'teacher-rivera': {
      label: '8th Grade Teacher',
      name: 'Ms. Rivera',
      description: 'View an 8th grade math class with 15 students at various ability levels, IEPs, and live tutoring sessions.',
      role: 'teacher',
      icon: 'fa-chalkboard-teacher',
      highlights: ['Class of 15 students', 'Students with IEPs', 'Live activity feed', 'Class AI settings configured']
    },
    'parent-chen': {
      label: 'Parent',
      name: 'Sarah Chen',
      description: 'See the parent experience with two children — a 5th grader and an 11th grader.',
      role: 'parent',
      icon: 'fa-house-user',
      highlights: ['5th grader (Maya)', '11th grader (Alex)', 'Weekly progress reports', 'Multi-child dashboard']
    },
    'student-maya': {
      label: '5th Grade Student',
      name: 'Maya Chen',
      description: 'Experience the AI tutor as a 5th grader working on fractions and decimals.',
      role: 'student',
      icon: 'fa-graduation-cap',
      highlights: ['Working on fractions', '4-day streak', 'Daily quests active', 'Parent connected']
    },
    'student-alex': {
      label: '11th Grade Student',
      name: 'Alex Chen',
      description: 'Explore the student experience as a high schooler tackling Algebra 2.',
      role: 'student',
      icon: 'fa-graduation-cap',
      highlights: ['Algebra 2 (quadratics)', '12-day streak', 'Multiple mastery badges', 'Dark mode enabled']
    },
    'student-jordan': {
      label: '8th Grader with IEP',
      name: 'Jordan Martinez',
      description: 'See how accommodations and IEP goals are supported in tutoring sessions.',
      role: 'student',
      icon: 'fa-universal-access',
      highlights: ['IEP with 3 active goals', 'Extended time + calculator', 'Frequent breaks', 'Math anxiety support']
    }
  }
};
