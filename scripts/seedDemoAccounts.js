// scripts/seedDemoAccounts.js
// Creates demo accounts for Clever Library certification review.
//
// Accounts created:
//   1. Teacher Demo   — Ms. Rivera (teacher with class data, AI settings, enrollment code)
//   2. Student Demo   — Jayden Brooks (active student in Ms. Rivera's class, rich progress data)
//   3. IEP Demo       — Maria Santos (student with IEP accommodations + goals)
//   4. Parent Demo    — David Brooks (Jayden's parent, linked to child)
//
// Run with:  node scripts/seedDemoAccounts.js
// Clear with: node scripts/seedDemoAccounts.js --clear

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');
const EnrollmentCode = require('../models/enrollmentCode');
const Section = require('../models/section');
const Conversation = require('../models/conversation');

const PASSWORD = 'DemoPass2026!';

// Identifiers used to find/clean up demo data
const DEMO_PREFIX = 'clever-demo';
const DEMO_EMAILS = [
  'demo.teacher@mathmatix.ai',
  'demo.jayden@mathmatix.ai',
  'demo.maria@mathmatix.ai',
  'demo.isabella@mathmatix.ai',
  'demo.ethan@mathmatix.ai',
  'demo.aisha@mathmatix.ai',
  'demo.parent@mathmatix.ai'
];
const DEMO_ENROLLMENT_CODE = 'DEMO-ALG1';
const DEMO_SECTION_ID = 'demo-clever-section-001';

// ---------------------------------------------------------------------------
// Helper: dates relative to "now"
// ---------------------------------------------------------------------------
const now = new Date();
const daysAgo = (n) => new Date(now - n * 86400000);
const weeksAgo = (n) => daysAgo(n * 7);
const monthsAgo = (n) => { const d = new Date(now); d.setMonth(d.getMonth() - n); return d; };

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function seedDemoAccounts() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    // Handle --clear flag
    if (process.argv.includes('--clear')) {
      await clearDemoData();
      process.exit(0);
    }

    // Clean previous demo data first
    await clearDemoData();

    // =====================================================================
    // 1. TEACHER DEMO — Ms. Rivera
    // =====================================================================
    const teacher = new User({
      username: 'demo.teacher',
      email: 'demo.teacher@mathmatix.ai',
      passwordHash: PASSWORD,
      role: 'teacher',
      firstName: 'Ms.',
      lastName: 'Rivera',
      emailVerified: true,
      needsProfileCompletion: false,
      lastLogin: daysAgo(0),
      createdAt: monthsAgo(4),

      classAISettings: {
        calculatorAccess: 'skill-based',
        calculatorNote: 'Allow for multi-step computation problems; no calculators during fact fluency.',
        scaffoldingLevel: 3,
        scaffoldingNote: 'Start at 3, increase to 4 for struggling learners.',
        vocabularyPreferences: {
          orderOfOperations: 'GEMS',
          customVocabulary: [
            "Use 'rate of change' alongside 'slope'",
            "Say 'equal groups' not 'times' for multiplication intro"
          ]
        },
        solutionApproaches: {
          equationSolving: 'balance-method',
          fractionOperations: 'traditional-lcd',
          wordProblems: 'CUBES'
        },
        manipulatives: {
          allowed: true,
          preferred: ['algebra-tiles', 'number-line', 'coordinate-plane']
        },
        currentTeaching: {
          topic: 'Two-step equations and inequalities',
          approach: 'Balance method with algebra tiles before abstract notation',
          pacing: 'Moderate — we spend 2 days per skill, practice day + mastery day',
          additionalContext: 'End-of-quarter assessment in 3 weeks.'
        },
        responseStyle: {
          encouragementLevel: 'moderate',
          errorCorrectionStyle: 'socratic',
          showWorkRequirement: 'always'
        },
        lastUpdated: daysAgo(2)
      }
    });
    await teacher.save();
    console.log('Created: Ms. Rivera (Teacher Demo)');
    console.log(`  Login: demo.teacher@mathmatix.ai / ${PASSWORD}`);

    // Enrollment code for Ms. Rivera's class
    const enrollmentCode = new EnrollmentCode({
      code: DEMO_ENROLLMENT_CODE,
      teacherId: teacher._id,
      className: 'Period 3 — Algebra 1',
      description: 'Demo class for Clever Library certification',
      gradeLevel: '8th Grade',
      mathCourse: 'Algebra 1',
      isActive: true,
      createdBy: teacher._id,
      createdAt: monthsAgo(4)
    });
    await enrollmentCode.save();
    console.log(`  Enrollment code: ${DEMO_ENROLLMENT_CODE}\n`);

    // =====================================================================
    // 2. STUDENT DEMO — Jayden Brooks (high-engagement, solid progress)
    // =====================================================================
    const jayden = new User({
      username: 'demo.jayden',
      email: 'demo.jayden@mathmatix.ai',
      passwordHash: PASSWORD,
      role: 'student',
      firstName: 'Jayden',
      lastName: 'Brooks',
      gradeLevel: '8th Grade',
      mathCourse: 'Algebra 1',
      dateOfBirth: new Date('2012-06-15'),
      hasParentalConsent: true,
      teacherId: teacher._id,
      emailVerified: true,
      needsProfileCompletion: false,
      lastLogin: daysAgo(0),
      createdAt: monthsAgo(3),
      selectedTutorId: 'mr-nappier',
      selectedAvatarId: 'dragon',
      tonePreference: 'casual',
      preferredLanguage: 'English',
      interests: ['basketball', 'video games', 'sneakers'],

      // Privacy consent
      privacyConsent: {
        status: 'active',
        consentPathway: 'individual_parent',
        history: [{
          consentType: 'parent_individual',
          grantedByRole: 'parent',
          grantedByName: 'David Brooks',
          grantedAt: monthsAgo(3),
          scope: ['data_collection', 'ai_processing', 'progress_tracking', 'teacher_visibility', 'parent_visibility'],
          verificationMethod: 'email_link'
        }],
        activeConsentDate: monthsAgo(3)
      },

      // Gamification — active, engaged student
      xp: 2450,
      level: 8,
      xpHistory: [
        { date: daysAgo(0), amount: 75, reason: 'Solved 2-step equation correctly' },
        { date: daysAgo(0), amount: 50, reason: 'Daily quest progress' },
        { date: daysAgo(1), amount: 150, reason: 'Mastery badge earned: two-step-equations-bronze' },
        { date: daysAgo(1), amount: 100, reason: 'Skill mastered: solving-two-step-equations' },
        { date: daysAgo(2), amount: 75, reason: '5-day streak bonus' },
        { date: daysAgo(3), amount: 50, reason: 'Problem correct' },
        { date: weeksAgo(1), amount: 200, reason: 'Weekly challenge completed' }
      ],
      xpLadderStats: {
        lifetimeTier1: 980,
        lifetimeTier2: 1120,
        lifetimeTier3: 350,
        tier3Behaviors: [
          { behavior: 'caught_own_error', count: 4, lastEarned: daysAgo(3) },
          { behavior: 'persistence', count: 7, lastEarned: daysAgo(1) }
        ]
      },

      totalActiveTutoringMinutes: 420,
      weeklyActiveTutoringMinutes: 45,
      totalActiveSeconds: 25200,
      weeklyActiveSeconds: 2700,
      totalAISeconds: 3600,
      weeklyAISeconds: 540,

      // Skill mastery — mix of mastered, learning, and locked
      skillMastery: new Map([
        ['integer-operations', {
          status: 'mastered', masteryScore: 95, masteryType: 'verified',
          lastPracticed: daysAgo(14), consecutiveCorrect: 12, totalAttempts: 38,
          learningStarted: monthsAgo(3), masteredDate: monthsAgo(2),
          currentTier: 'gold',
          pillars: {
            accuracy: { correct: 36, total: 38, percentage: 0.947 },
            independence: { hintsUsed: 1, hintsAvailable: 15, hintThreshold: 3 },
            transfer: { contextsAttempted: ['numeric', 'word-problem', 'real-world'], contextsRequired: 3 },
            retention: {
              lastPracticed: daysAgo(14),
              retentionChecks: [
                { checkDate: daysAgo(14), daysSinceLastPractice: 21, accuracy: 95, passed: true }
              ]
            }
          }
        }],
        ['order-of-operations', {
          status: 'mastered', masteryScore: 91, masteryType: 'verified',
          lastPracticed: daysAgo(21), consecutiveCorrect: 10, totalAttempts: 30,
          learningStarted: monthsAgo(3), masteredDate: weeksAgo(6),
          currentTier: 'silver',
          pillars: {
            accuracy: { correct: 27, total: 30, percentage: 0.90 },
            independence: { hintsUsed: 2, hintsAvailable: 15, hintThreshold: 3 },
            transfer: { contextsAttempted: ['numeric', 'word-problem', 'graphical'], contextsRequired: 3 },
            retention: { lastPracticed: daysAgo(21), retentionChecks: [] }
          }
        }],
        ['fraction-operations', {
          status: 'mastered', masteryScore: 88, masteryType: 'verified',
          lastPracticed: weeksAgo(3), consecutiveCorrect: 8, totalAttempts: 35,
          learningStarted: monthsAgo(2), masteredDate: weeksAgo(4),
          currentTier: 'silver',
          pillars: {
            accuracy: { correct: 31, total: 35, percentage: 0.886 },
            independence: { hintsUsed: 3, hintsAvailable: 15, hintThreshold: 3 },
            transfer: { contextsAttempted: ['numeric', 'word-problem'], contextsRequired: 3 },
            retention: { lastPracticed: weeksAgo(3), retentionChecks: [] }
          }
        }],
        ['decimal-operations', {
          status: 'mastered', masteryScore: 92, masteryType: 'verified',
          lastPracticed: weeksAgo(5), consecutiveCorrect: 10, totalAttempts: 28,
          learningStarted: monthsAgo(2), masteredDate: weeksAgo(5),
          currentTier: 'silver',
          pillars: {
            accuracy: { correct: 26, total: 28, percentage: 0.929 },
            independence: { hintsUsed: 1, hintsAvailable: 15, hintThreshold: 3 },
            transfer: { contextsAttempted: ['numeric', 'real-world', 'word-problem'], contextsRequired: 3 },
            retention: { lastPracticed: weeksAgo(5), retentionChecks: [] }
          }
        }],
        ['combining-like-terms', {
          status: 'mastered', masteryScore: 90, masteryType: 'verified',
          lastPracticed: daysAgo(10), consecutiveCorrect: 9, totalAttempts: 25,
          learningStarted: weeksAgo(6), masteredDate: weeksAgo(3),
          currentTier: 'bronze',
          pillars: {
            accuracy: { correct: 23, total: 25, percentage: 0.92 },
            independence: { hintsUsed: 2, hintsAvailable: 15, hintThreshold: 3 },
            transfer: { contextsAttempted: ['numeric', 'word-problem', 'real-world'], contextsRequired: 3 },
            retention: { lastPracticed: daysAgo(10), retentionChecks: [] }
          }
        }],
        ['distributive-property', {
          status: 'mastered', masteryScore: 86, masteryType: 'verified',
          lastPracticed: daysAgo(7), consecutiveCorrect: 7, totalAttempts: 22,
          learningStarted: weeksAgo(5), masteredDate: weeksAgo(2),
          currentTier: 'bronze',
          pillars: {
            accuracy: { correct: 19, total: 22, percentage: 0.864 },
            independence: { hintsUsed: 3, hintsAvailable: 15, hintThreshold: 3 },
            transfer: { contextsAttempted: ['numeric', 'word-problem'], contextsRequired: 3 },
            retention: { lastPracticed: daysAgo(7), retentionChecks: [] }
          }
        }],
        ['solving-one-step-equations', {
          status: 'mastered', masteryScore: 94, masteryType: 'verified',
          lastPracticed: daysAgo(5), consecutiveCorrect: 11, totalAttempts: 32,
          learningStarted: weeksAgo(5), masteredDate: weeksAgo(2),
          currentTier: 'gold',
          pillars: {
            accuracy: { correct: 30, total: 32, percentage: 0.938 },
            independence: { hintsUsed: 1, hintsAvailable: 15, hintThreshold: 3 },
            transfer: { contextsAttempted: ['numeric', 'word-problem', 'real-world'], contextsRequired: 3 },
            retention: {
              lastPracticed: daysAgo(5),
              retentionChecks: [
                { checkDate: daysAgo(5), daysSinceLastPractice: 14, accuracy: 92, passed: true }
              ]
            }
          }
        }],
        ['solving-two-step-equations', {
          status: 'practicing', masteryScore: 78, masteryType: 'verified',
          lastPracticed: daysAgo(0), consecutiveCorrect: 5, totalAttempts: 18,
          learningStarted: weeksAgo(2),
          currentTier: 'bronze',
          strugglingAreas: ['Equations with negative coefficients'],
          pillars: {
            accuracy: { correct: 14, total: 18, percentage: 0.778 },
            independence: { hintsUsed: 4, hintsAvailable: 15, hintThreshold: 3 },
            transfer: { contextsAttempted: ['numeric', 'word-problem'], contextsRequired: 3 },
            retention: { lastPracticed: daysAgo(0), retentionChecks: [] }
          }
        }],
        ['solving-multi-step-equations', {
          status: 'learning', masteryScore: 42, masteryType: 'verified',
          lastPracticed: daysAgo(1), consecutiveCorrect: 2, totalAttempts: 8,
          learningStarted: daysAgo(5),
          currentTier: 'none',
          strugglingAreas: ['Combining steps', 'Variables on both sides'],
          pillars: {
            accuracy: { correct: 4, total: 8, percentage: 0.50 },
            independence: { hintsUsed: 6, hintsAvailable: 15, hintThreshold: 3 },
            transfer: { contextsAttempted: ['numeric'], contextsRequired: 3 },
            retention: { lastPracticed: daysAgo(1), retentionChecks: [] }
          }
        }],
        ['understanding-ratios', {
          status: 'ready', masteryScore: 0, totalAttempts: 0, currentTier: 'none'
        }],
        ['solving-proportions', {
          status: 'locked', masteryScore: 0, totalAttempts: 0, currentTier: 'none'
        }]
      ]),

      // Badges earned
      badges: [
        { badgeId: 'integer-operations-bronze', earnedDate: monthsAgo(2) },
        { badgeId: 'integer-operations-silver', earnedDate: weeksAgo(6) },
        { badgeId: 'integer-operations-gold', earnedDate: weeksAgo(4) },
        { badgeId: 'one-step-equations-bronze', earnedDate: weeksAgo(3) },
        { badgeId: 'one-step-equations-silver', earnedDate: weeksAgo(2) },
        { badgeId: 'order-operations-bronze', earnedDate: weeksAgo(6) },
        { badgeId: 'order-operations-silver', earnedDate: weeksAgo(5) },
        { badgeId: 'combining-like-terms-bronze', earnedDate: weeksAgo(3) },
        { badgeId: 'two-step-equations-bronze', earnedDate: daysAgo(1) }
      ],
      habitBadges: [
        {
          badgeId: 'streak-warrior', badgeName: 'Streak Warrior',
          category: 'consistency', earnedDate: daysAgo(2),
          count: 2, currentStreak: 7, bestStreak: 7
        },
        {
          badgeId: 'bounce-back', badgeName: 'Bounce Back',
          category: 'resilience', earnedDate: daysAgo(5),
          count: 1, currentStreak: 0, bestStreak: 0,
          metadata: { recoveredFromSkill: 'fraction-operations' }
        }
      ],

      // Active mastery progress
      masteryProgress: {
        activeBadge: {
          badgeId: 'two-step-equations-silver',
          badgeName: 'Two-Step Equations Silver',
          skillId: 'solving-two-step-equations',
          tier: 'silver',
          startedAt: daysAgo(0),
          problemsCompleted: 3,
          problemsCorrect: 2,
          requiredProblems: 10,
          requiredAccuracy: 0.85,
          hintsUsed: 1,
          pillarProgress: { accuracy: 67, independence: 80, transfer: 40, retention: 0 }
        },
        attempts: [
          { badgeId: 'two-step-equations-bronze', attemptDate: daysAgo(2), completed: true, score: 88 }
        ]
      },

      // Daily quests — partially completed
      dailyQuests: {
        quests: [
          {
            id: 'dq-1', templateId: 'problem-solver', name: 'Problem Solver',
            description: 'Solve 5 problems correctly', icon: '1F4DA',
            target: 'problemsCorrect', targetCount: 5, progress: 3,
            completed: false, xpReward: 100, bonusMultiplier: 1.2
          },
          {
            id: 'dq-2', templateId: 'skill-explorer', name: 'Skill Explorer',
            description: 'Practice 2 different skills', icon: '1F9ED',
            target: 'skillsPracticed', targetCount: 2, progress: 2,
            completed: true, xpReward: 75, bonusMultiplier: 1.2,
            completedAt: daysAgo(0)
          },
          {
            id: 'dq-3', templateId: 'hint-free', name: 'Independent Thinker',
            description: 'Solve 3 problems without hints', icon: '1F4AA',
            target: 'noHintCorrect', targetCount: 3, progress: 1,
            completed: false, xpReward: 120, bonusMultiplier: 1.2
          }
        ],
        lastRefreshDate: daysAgo(0),
        currentStreak: 7,
        longestStreak: 12,
        lastPracticeDate: daysAgo(0),
        totalQuestsCompleted: 38
      },

      // Weekly challenges
      weeklyChallenges: {
        challenges: [
          {
            id: 'wc-1', templateId: 'equation-master', name: 'Equation Master',
            description: 'Solve 20 equations this week', icon: '1F3AF',
            difficulty: 'medium',
            targetType: 'equationsSolved', targetCount: 20, progress: 14,
            completed: false, xpReward: 300, specialReward: null,
            startDate: daysAgo(3), endDate: daysAgo(-4)
          }
        ],
        weekStartDate: daysAgo(3),
        completedChallengesAllTime: 6
      },

      // Course enrollment
      courseEnrollments: [{
        courseId: 'algebra-1', courseName: 'Algebra 1',
        enrolledAt: monthsAgo(3), status: 'active',
        currentModuleId: 'linear-equations', currentLessonId: 'two-step-equations',
        overallProgress: 35,
        modules: [
          {
            moduleId: 'number-sense-review', status: 'completed',
            startedAt: monthsAgo(3), completedAt: monthsAgo(2),
            checkpointScore: 92, checkpointPassed: true
          },
          {
            moduleId: 'expressions', status: 'completed',
            startedAt: monthsAgo(2), completedAt: weeksAgo(3),
            checkpointScore: 88, checkpointPassed: true
          },
          {
            moduleId: 'linear-equations', status: 'in_progress',
            startedAt: weeksAgo(3)
          }
        ]
      }],

      // Learning profile
      learningProfile: {
        interests: ['basketball', 'video games', 'sneakers'],
        learningStyle: {
          prefersDiagrams: false,
          prefersRealWorldExamples: true,
          prefersStepByStep: true,
          prefersDiscovery: false
        },
        recentWins: [
          { skill: 'solving-one-step-equations', description: 'Mastered with 94% accuracy!', date: weeksAgo(2) },
          { skill: 'distributive-property', description: 'Got it on first try after algebra tiles demo', date: weeksAgo(2) }
        ],
        mathAnxietyLevel: 3,
        frustrationTolerance: 'medium',
        confidenceLevel: 7,
        rapportBuildingComplete: true,
        rapportAnswers: {
          interests: 'Basketball and gaming',
          favoriteSubject: 'PE, but math is growing on me',
          currentTopic: 'Two-step equations',
          learningGoal: 'Get an A in Algebra 1',
          conversationStyle: 'Likes sports analogies, responds well to challenges'
        },
        assessmentCompleted: true,
        assessmentDate: monthsAgo(3),
        initialPlacement: '7th Grade',
        currentTheta: 1.2,
        standardError: 0.35,
        lastGrowthCheck: weeksAgo(4),
        growthCheckHistory: [
          {
            date: weeksAgo(4), previousTheta: 0.8, newTheta: 1.2,
            thetaChange: 0.4, growthStatus: 'significant-growth',
            questionsAnswered: 15, accuracy: 80
          }
        ],
        quarterlyCheckpoints: [{
          checkpointDate: weeksAgo(4), schoolYear: '2025-2026', quarter: 2,
          academicQuarter: '2026-Q2',
          skillsMastered: [
            { skillId: 'integer-operations', masteredDate: monthsAgo(2), course: 'Algebra 1', category: 'number-system' },
            { skillId: 'order-of-operations', masteredDate: weeksAgo(6), course: 'Algebra 1', category: 'operations' },
            { skillId: 'fraction-operations', masteredDate: weeksAgo(4), course: 'Algebra 1', category: 'operations' },
            { skillId: 'solving-one-step-equations', masteredDate: weeksAgo(2), course: 'Algebra 1', category: 'equations' }
          ],
          metrics: {
            newSkillsCount: 4,
            newSkillsList: ['integer-operations', 'order-of-operations', 'fraction-operations', 'solving-one-step-equations'],
            retainedSkillsCount: 4, retainedPercentage: 100,
            lostSkillsCount: 0, lostSkillsList: [],
            skillsPerWeek: 0.5,
            coursesInProgress: ['algebra-1'], coursesCompleted: []
          },
          activity: {
            totalMinutes: 420, problemsAttempted: 210,
            problemsCorrect: 178, accuracy: 85
          },
          generatedBy: 'auto'
        }]
      },

      // Assessment history
      assessmentHistory: [
        {
          type: 'starting-point', date: monthsAgo(3),
          theta: 0.4, standardError: 0.5,
          gradeLevel: '7th Grade', questionsAnswered: 20,
          accuracy: 0.65, duration: 900, skillsAssessed: ['integer-operations', 'fraction-operations', 'order-of-operations']
        },
        {
          type: 'growth-check', date: weeksAgo(4),
          theta: 1.2, standardError: 0.35,
          gradeLevel: '8th Grade', questionsAnswered: 15,
          accuracy: 0.80, duration: 720, skillsAssessed: ['solving-one-step-equations', 'combining-like-terms', 'distributive-property']
        }
      ],
      lastGrowthCheck: weeksAgo(4),
      nextGrowthCheckDue: weeksAgo(-8),

      // Fact fluency
      factFluencyProgress: {
        placement: {
          completed: true, completedDate: monthsAgo(3),
          recommendedOperation: 'multiplication', recommendedLevel: 'times7',
          placementResults: [
            { operation: 'addition', averageRate: 62, averageAccuracy: 98 },
            { operation: 'subtraction', averageRate: 55, averageAccuracy: 95 },
            { operation: 'multiplication', averageRate: 38, averageAccuracy: 82 },
            { operation: 'division', averageRate: 30, averageAccuracy: 75 }
          ]
        },
        factFamilies: new Map([
          ['times2', { operation: 'multiplication', familyName: 'times2', displayName: 'x2', mastered: true, masteredDate: monthsAgo(2), bestRate: 58, bestAccuracy: 100, attempts: 5, lastPracticed: monthsAgo(2) }],
          ['times3', { operation: 'multiplication', familyName: 'times3', displayName: 'x3', mastered: true, masteredDate: monthsAgo(2), bestRate: 52, bestAccuracy: 97, attempts: 6, lastPracticed: weeksAgo(6) }],
          ['times5', { operation: 'multiplication', familyName: 'times5', displayName: 'x5', mastered: true, masteredDate: weeksAgo(6), bestRate: 55, bestAccuracy: 98, attempts: 4, lastPracticed: weeksAgo(5) }],
          ['times7', { operation: 'multiplication', familyName: 'times7', displayName: 'x7', mastered: false, bestRate: 35, bestAccuracy: 80, attempts: 8, lastPracticed: daysAgo(3) }],
          ['times8', { operation: 'multiplication', familyName: 'times8', displayName: 'x8', mastered: false, bestRate: 28, bestAccuracy: 72, attempts: 4, lastPracticed: daysAgo(5) }]
        ]),
        stats: {
          totalSessions: 27, totalProblemsAttempted: 540,
          totalProblemsCorrect: 470, overallAccuracy: 87,
          currentStreak: 3, longestStreak: 8, lastPracticeDate: daysAgo(3)
        }
      },

      // Subscription
      subscriptionTier: 'free'
    });
    await jayden.save();
    console.log('Created: Jayden Brooks (Student Demo)');
    console.log(`  Login: demo.jayden@mathmatix.ai / ${PASSWORD}`);

    // =====================================================================
    // 3. IEP DEMO — Maria Santos (IEP accommodations + goals)
    // =====================================================================
    const maria = new User({
      username: 'demo.maria',
      email: 'demo.maria@mathmatix.ai',
      passwordHash: PASSWORD,
      role: 'student',
      firstName: 'Maria',
      lastName: 'Santos',
      gradeLevel: '8th Grade',
      mathCourse: 'Algebra 1',
      dateOfBirth: new Date('2012-01-20'),
      hasParentalConsent: true,
      teacherId: teacher._id,
      emailVerified: true,
      needsProfileCompletion: false,
      lastLogin: daysAgo(1),
      createdAt: monthsAgo(3),
      selectedTutorId: 'maya',
      tonePreference: 'encouraging',
      preferredLanguage: 'Spanish',
      interests: ['drawing', 'soccer', 'music'],

      privacyConsent: {
        status: 'active',
        consentPathway: 'individual_parent',
        history: [{
          consentType: 'parent_individual',
          grantedByRole: 'parent',
          grantedByName: 'Carlos Santos',
          grantedAt: monthsAgo(3),
          scope: ['data_collection', 'ai_processing', 'progress_tracking', 'teacher_visibility', 'parent_visibility', 'iep_data_processing'],
          verificationMethod: 'email_link'
        }],
        activeConsentDate: monthsAgo(3)
      },

      // IEP Plan — the showcase feature
      iepPlan: {
        accommodations: {
          extendedTime: true,
          reducedDistraction: true,
          calculatorAllowed: true,
          audioReadAloud: true,
          chunkedAssignments: true,
          breaksAsNeeded: true,
          mathAnxietySupport: true,
          custom: ['Bilingual prompts (English/Spanish)', 'Visual fraction models required']
        },
        goals: [
          {
            description: 'Solve one-step equations with 80% accuracy across 3 consecutive sessions',
            targetDate: new Date('2026-05-15'),
            currentProgress: 72,
            measurementMethod: 'Mathmatix mastery tracking — accuracy pillar across verified attempts',
            status: 'active'
          },
          {
            description: 'Demonstrate multiplication fact fluency (x2 through x6) at 40+ digits per minute with 90%+ accuracy',
            targetDate: new Date('2026-04-01'),
            currentProgress: 55,
            measurementMethod: 'Fact Fluency module — best rate and accuracy per family',
            status: 'active'
          },
          {
            description: 'Reduce reliance on calculator for basic integer operations (fewer than 3 hints per 10 problems)',
            targetDate: new Date('2026-06-01'),
            currentProgress: 40,
            measurementMethod: 'Independence pillar — hints used vs. available',
            status: 'active'
          },
          {
            description: 'Master fraction addition and subtraction with unlike denominators',
            targetDate: new Date('2026-03-15'),
            currentProgress: 85,
            measurementMethod: 'Skill mastery score for fraction-operations',
            status: 'active'
          }
        ]
      },

      // Gamification — slower pace, but progressing
      xp: 980,
      level: 4,
      xpHistory: [
        { date: daysAgo(1), amount: 50, reason: 'Problem correct with audio support' },
        { date: daysAgo(2), amount: 75, reason: 'Completed chunked assignment' },
        { date: daysAgo(4), amount: 100, reason: 'IEP goal milestone — fraction-operations at 85%' }
      ],
      totalActiveTutoringMinutes: 180,
      weeklyActiveTutoringMinutes: 25,

      // Skill mastery — showing IEP-supported progress
      skillMastery: new Map([
        ['integer-operations', {
          status: 'practicing', masteryScore: 72, masteryType: 'verified',
          lastPracticed: daysAgo(1), consecutiveCorrect: 4, totalAttempts: 40,
          learningStarted: monthsAgo(3), currentTier: 'bronze',
          strugglingAreas: ['Negative number operations', 'Order of subtraction'],
          notes: 'Responds well to number line visuals. Extended time accommodation active.',
          pillars: {
            accuracy: { correct: 29, total: 40, percentage: 0.725 },
            independence: { hintsUsed: 8, hintsAvailable: 15, hintThreshold: 3 },
            transfer: { contextsAttempted: ['numeric', 'word-problem'], contextsRequired: 3 },
            retention: { lastPracticed: daysAgo(1), retentionChecks: [] }
          }
        }],
        ['fraction-operations', {
          status: 'practicing', masteryScore: 68, masteryType: 'verified',
          lastPracticed: daysAgo(2), consecutiveCorrect: 3, totalAttempts: 32,
          learningStarted: monthsAgo(2), currentTier: 'bronze',
          strugglingAreas: ['Finding LCD with larger denominators'],
          notes: 'Uses visual fraction models effectively. Bilingual prompts help comprehension.',
          pillars: {
            accuracy: { correct: 22, total: 32, percentage: 0.688 },
            independence: { hintsUsed: 7, hintsAvailable: 15, hintThreshold: 3 },
            transfer: { contextsAttempted: ['numeric', 'word-problem'], contextsRequired: 3 },
            retention: { lastPracticed: daysAgo(2), retentionChecks: [] }
          }
        }],
        ['order-of-operations', {
          status: 'learning', masteryScore: 55, masteryType: 'verified',
          lastPracticed: daysAgo(3), consecutiveCorrect: 2, totalAttempts: 20,
          learningStarted: weeksAgo(4), currentTier: 'none',
          strugglingAreas: ['Parentheses with negative numbers', 'Multi-step expressions'],
          pillars: {
            accuracy: { correct: 11, total: 20, percentage: 0.55 },
            independence: { hintsUsed: 9, hintsAvailable: 15, hintThreshold: 3 },
            transfer: { contextsAttempted: ['numeric'], contextsRequired: 3 },
            retention: { lastPracticed: daysAgo(3), retentionChecks: [] }
          }
        }],
        ['solving-one-step-equations', {
          status: 'learning', masteryScore: 48, masteryType: 'verified',
          lastPracticed: daysAgo(1), consecutiveCorrect: 2, totalAttempts: 15,
          learningStarted: weeksAgo(2), currentTier: 'none',
          strugglingAreas: ['Choosing correct inverse operation', 'Equations with fractions'],
          pillars: {
            accuracy: { correct: 8, total: 15, percentage: 0.533 },
            independence: { hintsUsed: 6, hintsAvailable: 15, hintThreshold: 3 },
            transfer: { contextsAttempted: ['numeric'], contextsRequired: 3 },
            retention: { lastPracticed: daysAgo(1), retentionChecks: [] }
          }
        }]
      ]),

      badges: [
        { badgeId: 'integer-operations-bronze', earnedDate: weeksAgo(4) },
        { badgeId: 'fraction-operations-bronze', earnedDate: weeksAgo(2) }
      ],

      // Learning profile — reflects IEP accommodations influence
      learningProfile: {
        interests: ['drawing', 'soccer', 'music'],
        learningStyle: {
          prefersDiagrams: true,
          prefersRealWorldExamples: true,
          prefersStepByStep: true,
          prefersDiscovery: false
        },
        pastStruggles: [
          { skill: 'integer-operations', description: 'Difficulty with negative numbers', date: monthsAgo(2) },
          { skill: 'order-of-operations', description: 'Overwhelmed by multi-step problems', date: weeksAgo(4) }
        ],
        recentWins: [
          { skill: 'fraction-operations', description: 'IEP goal nearly met! 85% progress on fraction addition', date: daysAgo(4) }
        ],
        mathAnxietyLevel: 7,
        frustrationTolerance: 'low',
        confidenceLevel: 4,
        rapportBuildingComplete: true,
        rapportAnswers: {
          interests: 'Drawing and soccer',
          favoriteSubject: 'Art',
          currentTopic: 'Fractions and one-step equations',
          learningGoal: 'Feel less stressed about math tests',
          conversationStyle: 'Needs encouragement. Prefers short, chunked problems. Responds to bilingual support.'
        },
        assessmentCompleted: true,
        assessmentDate: monthsAgo(3),
        initialPlacement: '6th Grade',
        currentTheta: 0.3,
        standardError: 0.45
      },

      // Fact fluency — IEP goal tracking
      factFluencyProgress: {
        placement: {
          completed: true, completedDate: monthsAgo(3),
          recommendedOperation: 'multiplication', recommendedLevel: 'times2',
          placementResults: [
            { operation: 'addition', averageRate: 45, averageAccuracy: 90 },
            { operation: 'subtraction', averageRate: 35, averageAccuracy: 82 },
            { operation: 'multiplication', averageRate: 20, averageAccuracy: 65 },
            { operation: 'division', averageRate: 15, averageAccuracy: 55 }
          ]
        },
        factFamilies: new Map([
          ['times2', { operation: 'multiplication', familyName: 'times2', displayName: 'x2', mastered: true, masteredDate: weeksAgo(6), bestRate: 48, bestAccuracy: 95, attempts: 12, lastPracticed: weeksAgo(3) }],
          ['times3', { operation: 'multiplication', familyName: 'times3', displayName: 'x3', mastered: true, masteredDate: weeksAgo(3), bestRate: 42, bestAccuracy: 92, attempts: 10, lastPracticed: weeksAgo(2) }],
          ['times4', { operation: 'multiplication', familyName: 'times4', displayName: 'x4', mastered: false, bestRate: 32, bestAccuracy: 78, attempts: 8, lastPracticed: daysAgo(3) }],
          ['times5', { operation: 'multiplication', familyName: 'times5', displayName: 'x5', mastered: true, masteredDate: weeksAgo(2), bestRate: 50, bestAccuracy: 96, attempts: 7, lastPracticed: weeksAgo(1) }],
          ['times6', { operation: 'multiplication', familyName: 'times6', displayName: 'x6', mastered: false, bestRate: 22, bestAccuracy: 68, attempts: 5, lastPracticed: daysAgo(2) }]
        ]),
        stats: {
          totalSessions: 42, totalProblemsAttempted: 630,
          totalProblemsCorrect: 485, overallAccuracy: 77,
          currentStreak: 2, longestStreak: 5, lastPracticeDate: daysAgo(2)
        }
      },

      preferences: {
        handsFreeModeEnabled: true,
        autoplayTtsHandsFree: true,
        theme: 'high-contrast'
      },

      subscriptionTier: 'free'
    });
    await maria.save();
    console.log('Created: Maria Santos (IEP Demo)');
    console.log(`  Login: demo.maria@mathmatix.ai / ${PASSWORD}`);
    console.log('  IEP: 4 active goals, 8 accommodations enabled\n');

    // =====================================================================
    // Background students (fill out the class roster)
    // =====================================================================
    const bgStudentData = [
      { first: 'Isabella', last: 'Chen', username: 'demo.isabella', email: 'demo.isabella@mathmatix.ai', xp: 1800, level: 6 },
      { first: 'Ethan', last: 'Williams', username: 'demo.ethan', email: 'demo.ethan@mathmatix.ai', xp: 1200, level: 5 },
      { first: 'Aisha', last: 'Patel', username: 'demo.aisha', email: 'demo.aisha@mathmatix.ai', xp: 3100, level: 10 }
    ];

    const bgStudents = [];
    for (const s of bgStudentData) {
      const stu = new User({
        username: s.username,
        email: s.email,
        passwordHash: PASSWORD,
        role: 'student',
        firstName: s.first,
        lastName: s.last,
        gradeLevel: '8th Grade',
        mathCourse: 'Algebra 1',
        teacherId: teacher._id,
        emailVerified: true,
        needsProfileCompletion: false,
        lastLogin: daysAgo(Math.floor(Math.random() * 3)),
        createdAt: monthsAgo(3),
        xp: s.xp,
        level: s.level,
        subscriptionTier: 'free',
        privacyConsent: { status: 'active', consentPathway: 'school_dpa', activeConsentDate: monthsAgo(3) }
      });
      await stu.save();
      bgStudents.push(stu);
      console.log(`Created: ${s.first} ${s.last} (background student)`);
    }

    // Enroll all students in the enrollment code
    const allStudents = [jayden, maria, ...bgStudents];
    for (const stu of allStudents) {
      enrollmentCode.enrolledStudents.push({
        studentId: stu._id,
        enrolledAt: monthsAgo(3),
        enrollmentMethod: 'admin-created'
      });
      enrollmentCode.useCount++;
    }
    await enrollmentCode.save();

    // Create a Clever-style section for the class
    const section = new Section({
      cleverSectionId: DEMO_SECTION_ID,
      cleverDistrictId: 'demo-district-001',
      cleverSchoolId: 'demo-school-001',
      name: 'Period 3 - Algebra 1',
      subject: 'math',
      course: 'Algebra 1',
      grade: '8',
      period: '3',
      termName: 'Spring 2026',
      termStartDate: monthsAgo(4),
      termEndDate: monthsAgo(-3),
      teacherId: teacher._id,
      teacherCleverIds: ['demo-clever-teacher-001'],
      students: allStudents.map(s => ({
        studentId: s._id,
        cleverId: `demo-clever-student-${s.firstName.toLowerCase()}`,
        enrolledAt: monthsAgo(3)
      })),
      lastSyncedAt: daysAgo(0),
      syncSource: 'login'
    });
    await section.save();
    console.log('\nCreated: Period 3 - Algebra 1 (Clever Section)');

    // =====================================================================
    // 4. PARENT DEMO — David Brooks (Jayden's parent)
    // =====================================================================
    const parent = new User({
      username: 'demo.parent',
      email: 'demo.parent@mathmatix.ai',
      passwordHash: PASSWORD,
      role: 'parent',
      firstName: 'David',
      lastName: 'Brooks',
      emailVerified: true,
      needsProfileCompletion: false,
      lastLogin: daysAgo(1),
      createdAt: monthsAgo(3),

      children: [jayden._id],
      reportFrequency: 'weekly',
      goalViewPreference: 'progress',
      parentTone: 'encouraging',
      parentLanguage: 'English'
    });
    await parent.save();

    // Link Jayden back to parent
    jayden.parentIds = [parent._id];
    jayden.hasParentalConsent = true;
    await jayden.save();

    console.log('\nCreated: David Brooks (Parent Demo)');
    console.log(`  Login: demo.parent@mathmatix.ai / ${PASSWORD}`);
    console.log(`  Linked to child: Jayden Brooks\n`);

    // =====================================================================
    // SUMMARY
    // =====================================================================
    console.log('='.repeat(60));
    console.log('  CLEVER LIBRARY DEMO ACCOUNTS — READY');
    console.log('='.repeat(60));
    console.log(`\n  Password for all accounts: ${PASSWORD}\n`);
    console.log('  1. TEACHER DEMO');
    console.log('     demo.teacher@mathmatix.ai');
    console.log('     Shows: Class roster, AI settings, student dashboards,');
    console.log('     enrollment codes, mastery tracking, live feed\n');
    console.log('  2. STUDENT DEMO');
    console.log('     demo.jayden@mathmatix.ai');
    console.log('     Shows: AI tutoring, skill mastery, badges, quests,');
    console.log('     course mode, fact fluency, growth tracking\n');
    console.log('  3. IEP DEMO');
    console.log('     demo.maria@mathmatix.ai');
    console.log('     Shows: IEP accommodations (extended time, audio,');
    console.log('     chunking, bilingual), 4 active IEP goals with');
    console.log('     measurable progress, high-contrast mode, TTS\n');
    console.log('  4. PARENT DEMO');
    console.log('     demo.parent@mathmatix.ai');
    console.log('     Shows: Child progress dashboard, growth reports,');
    console.log('     mastery overview, weekly report preference\n');
    console.log('  Enrollment Code: DEMO-ALG1');
    console.log('  Clever Section:  Period 3 - Algebra 1 (5 students)\n');
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('Error seeding demo accounts:', error);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Clear demo data
// ---------------------------------------------------------------------------
async function clearDemoData() {
  const userResult = await User.deleteMany({ email: { $in: DEMO_EMAILS } });
  const codeResult = await EnrollmentCode.deleteMany({ code: DEMO_ENROLLMENT_CODE });
  const sectionResult = await Section.deleteMany({ cleverSectionId: DEMO_SECTION_ID });

  const total = userResult.deletedCount + codeResult.deletedCount + sectionResult.deletedCount;
  if (total > 0) {
    console.log(`Cleared ${total} previous demo records (${userResult.deletedCount} users, ${codeResult.deletedCount} codes, ${sectionResult.deletedCount} sections)`);
  }
}

// Run
if (require.main === module) {
  seedDemoAccounts();
}

module.exports = seedDemoAccounts;
