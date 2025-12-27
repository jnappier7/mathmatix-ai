// utils/habitBadges.js
// Master Mode: Habits Badge Definitions & Tracking Logic

/**
 * HABITS BADGES
 *
 * Not participation trophies. Tied to learning science.
 * Categories:
 * - Consistency (streaks, spaced practice)
 * - Resilience (comeback, error recovery, grit)
 * - Efficiency (speed, no hints, mixed review)
 * - Metacognition (self-checking, strategy switching)
 */

const HABITS_BADGES = {
  // ========================================
  // CONSISTENCY BADGES
  // ========================================

  'spaced-practice-pro': {
    badgeId: 'spaced-practice-pro',
    badgeName: 'Spaced Practice Pro',
    category: 'consistency',
    description: 'Returns after 2+ days and improves performance',
    icon: 'fa-calendar-check',
    reEarnable: true,
    triggerCriteria: {
      requiredSessions: 3,
      minDaysBetween: 2,
      accuracyImprovement: true
    }
  },

  'daily-grinder': {
    badgeId: 'daily-grinder',
    badgeName: 'Daily Grinder',
    category: 'consistency',
    description: 'Works on math 7+ days in a row',
    icon: 'fa-fire',
    reEarnable: true,
    triggerCriteria: {
      streakDays: 7,
      minProblemsPerDay: 5
    }
  },

  'marathon-mode': {
    badgeId: 'marathon-mode',
    badgeName: 'Marathon Mode',
    category: 'consistency',
    description: 'Consistent practice for a full month',
    icon: 'fa-medal',
    reEarnable: true,
    triggerCriteria: {
      streakDays: 30,
      maxGapDays: 2
    }
  },

  'weekend-warrior': {
    badgeId: 'weekend-warrior',
    badgeName: 'Weekend Warrior',
    category: 'consistency',
    description: 'Practices on weekends without being assigned',
    icon: 'fa-sun',
    reEarnable: true,
    triggerCriteria: {
      weekendSessions: 4,  // 4 weekend sessions
      voluntary: true
    }
  },

  // ========================================
  // RESILIENCE BADGES
  // ========================================

  'comeback-kid': {
    badgeId: 'comeback-kid',
    badgeName: 'Comeback Kid',
    category: 'resilience',
    description: 'Scores <70%, retries, then scores ≥85%',
    icon: 'fa-heart-circle-plus',
    reEarnable: true,
    triggerCriteria: {
      initialAccuracy: { max: 0.70 },
      retryAccuracy: { min: 0.85 },
      sameSkill: true
    }
  },

  'error-recovery': {
    badgeId: 'error-recovery',
    badgeName: 'Error Recovery',
    category: 'resilience',
    description: 'Gets wrong → analyzes mistake → corrects next attempt',
    icon: 'fa-rotate-right',
    reEarnable: true,
    triggerCriteria: {
      errorCorrectionCycles: 5,
      analyzedMistake: true
    }
  },

  'grit-award': {
    badgeId: 'grit-award',
    badgeName: 'Grit Award',
    category: 'resilience',
    description: 'Attempts challenging problem 3+ times before succeeding',
    icon: 'fa-hand-fist',
    reEarnable: true,
    triggerCriteria: {
      minAttempts: 3,
      eventuallyCorrect: true,
      challengingProblem: true  // DOK level 3
    }
  },

  'never-give-up': {
    badgeId: 'never-give-up',
    badgeName: 'Never Give Up',
    category: 'resilience',
    description: 'Completes 5 difficult problems after initial failures',
    icon: 'fa-mountain',
    reEarnable: true,
    triggerCriteria: {
      difficultProblems: 5,
      hadInitialFailure: true,
      eventuallyCorrect: true
    }
  },

  // ========================================
  // EFFICIENCY BADGES
  // ========================================

  'no-hint-needed': {
    badgeId: 'no-hint-needed',
    badgeName: 'No Hint Needed',
    category: 'efficiency',
    description: 'Solves 5 in a row without hints',
    icon: 'fa-lightbulb-slash',
    reEarnable: true,
    triggerCriteria: {
      consecutiveCorrect: 5,
      hintsUsed: 0
    }
  },

  'speed-demon': {
    badgeId: 'speed-demon',
    badgeName: 'Speed Demon',
    category: 'efficiency',
    description: 'Completes 10 problems in <2 minutes total with ≥80% accuracy',
    icon: 'fa-bolt',
    reEarnable: true,
    triggerCriteria: {
      problemCount: 10,
      maxTotalTime: 120,  // seconds
      minAccuracy: 0.80
    }
  },

  'mixed-review-beast': {
    badgeId: 'mixed-review-beast',
    badgeName: 'Mixed Review Beast',
    category: 'efficiency',
    description: 'Handles interleaving without accuracy drop (≥85%)',
    icon: 'fa-shuffle',
    reEarnable: true,
    triggerCriteria: {
      mixedReviewSessions: 1,
      minSkills: 5,
      minAccuracy: 0.85
    }
  },

  'first-try-master': {
    badgeId: 'first-try-master',
    badgeName: 'First Try Master',
    category: 'efficiency',
    description: 'Gets 8 problems correct on first attempt',
    icon: 'fa-bullseye-arrow',
    reEarnable: true,
    triggerCriteria: {
      firstAttemptCorrect: 8
    }
  },

  // ========================================
  // METACOGNITION BADGES
  // ========================================

  'self-checker': {
    badgeId: 'self-checker',
    badgeName: 'Self-Checker',
    category: 'metacognition',
    description: 'Catches own mistakes before submitting (80% success)',
    icon: 'fa-magnifying-glass-check',
    reEarnable: true,
    triggerCriteria: {
      checkWorkUsed: 5,
      foundErrorsPercent: 0.80
    }
  },

  'strategy-switcher': {
    badgeId: 'strategy-switcher',
    badgeName: 'Strategy Switcher',
    category: 'metacognition',
    description: 'Tries different approach after getting stuck',
    icon: 'fa-arrows-rotate',
    reEarnable: true,
    triggerCriteria: {
      strategyChanges: 3,
      successfulSwitch: true
    }
  },

  'question-asker': {
    badgeId: 'question-asker',
    badgeName: 'Question Asker',
    category: 'metacognition',
    description: 'Asks clarifying questions before solving',
    icon: 'fa-circle-question',
    reEarnable: true,
    triggerCriteria: {
      questionsAsked: 5,
      ledToCorrectAnswer: true
    }
  },

  'explain-it-master': {
    badgeId: 'explain-it-master',
    badgeName: 'Explain-It Master',
    category: 'metacognition',
    description: 'Explains reasoning on 3 problems clearly',
    icon: 'fa-comments',
    reEarnable: true,
    triggerCriteria: {
      explanationsProvided: 3,
      explanationQuality: 'good'  // AI-evaluated
    }
  }
};

/**
 * Check consistency badges (streaks, spaced practice)
 */
function checkConsistencyBadges(user) {
  const earnedBadges = [];
  const { dailyQuests } = user;

  // Daily Grinder (7-day streak)
  if (dailyQuests.currentStreak >= 7) {
    const existingBadge = user.habitBadges.find(b => b.badgeId === 'daily-grinder');
    if (existingBadge) {
      // Update count for re-earnable badge
      existingBadge.count++;
      existingBadge.earnedDate = new Date();
    } else {
      earnedBadges.push({
        badgeId: 'daily-grinder',
        badgeName: 'Daily Grinder',
        category: 'consistency',
        earnedDate: new Date(),
        currentStreak: dailyQuests.currentStreak,
        bestStreak: Math.max(dailyQuests.currentStreak, dailyQuests.longestStreak)
      });
    }
  }

  // Marathon Mode (30-day streak)
  if (dailyQuests.currentStreak >= 30) {
    const existingBadge = user.habitBadges.find(b => b.badgeId === 'marathon-mode');
    if (!existingBadge) {
      earnedBadges.push({
        badgeId: 'marathon-mode',
        badgeName: 'Marathon Mode',
        category: 'consistency',
        earnedDate: new Date(),
        currentStreak: dailyQuests.currentStreak,
        bestStreak: dailyQuests.longestStreak
      });
    }
  }

  return earnedBadges;
}

/**
 * Check resilience badges (comeback, error recovery, grit)
 */
function checkResilienceBadges(attemptHistory, user) {
  const earnedBadges = [];

  // Comeback Kid: <70% → retry → ≥85%
  const skillAttempts = {};
  attemptHistory.forEach(attempt => {
    if (!skillAttempts[attempt.skillId]) {
      skillAttempts[attempt.skillId] = [];
    }
    skillAttempts[attempt.skillId].push(attempt);
  });

  for (const [skillId, attempts] of Object.entries(skillAttempts)) {
    if (attempts.length < 2) continue;

    // Check for comeback pattern
    for (let i = 0; i < attempts.length - 1; i++) {
      const firstSession = attempts[i];
      const secondSession = attempts[i + 1];

      if (firstSession.accuracy < 0.70 && secondSession.accuracy >= 0.85) {
        const existingBadge = user.habitBadges.find(b => b.badgeId === 'comeback-kid');
        if (!existingBadge) {
          earnedBadges.push({
            badgeId: 'comeback-kid',
            badgeName: 'Comeback Kid',
            category: 'resilience',
            earnedDate: new Date(),
            metadata: {
              skillId,
              initialAccuracy: firstSession.accuracy,
              improvedAccuracy: secondSession.accuracy
            }
          });
        }
      }
    }
  }

  // Grit Award: 3+ attempts on challenging problem before success
  const problemAttempts = {};
  attemptHistory.forEach(attempt => {
    if (!problemAttempts[attempt.problemId]) {
      problemAttempts[attempt.problemId] = [];
    }
    problemAttempts[attempt.problemId].push(attempt);
  });

  let gritInstances = 0;
  for (const [problemId, attempts] of Object.entries(problemAttempts)) {
    if (attempts.length >= 3 && attempts[attempts.length - 1].correct) {
      // Check if problem was challenging (DOK level 3)
      if (attempts[0].dokLevel >= 3) {
        gritInstances++;
      }
    }
  }

  if (gritInstances >= 3) {
    const existingBadge = user.habitBadges.find(b => b.badgeId === 'grit-award');
    if (!existingBadge) {
      earnedBadges.push({
        badgeId: 'grit-award',
        badgeName: 'Grit Award',
        category: 'resilience',
        earnedDate: new Date(),
        metadata: { gritInstances }
      });
    }
  }

  return earnedBadges;
}

/**
 * Check efficiency badges (speed, no hints, mixed review)
 */
function checkEfficiencyBadges(attemptHistory, user) {
  const earnedBadges = [];

  // No Hint Needed: 5 consecutive correct without hints
  let consecutiveNoHint = 0;
  for (const attempt of attemptHistory.slice(-10)) {  // Check last 10
    if (attempt.correct && !attempt.hintUsed) {
      consecutiveNoHint++;
      if (consecutiveNoHint >= 5) {
        const existingBadge = user.habitBadges.find(b => b.badgeId === 'no-hint-needed');
        if (!existingBadge) {
          earnedBadges.push({
            badgeId: 'no-hint-needed',
            badgeName: 'No Hint Needed',
            category: 'efficiency',
            earnedDate: new Date()
          });
        }
        break;
      }
    } else {
      consecutiveNoHint = 0;
    }
  }

  // Speed Demon: 10 problems in <2 minutes with ≥80% accuracy
  const recentAttempts = attemptHistory.slice(-10);
  if (recentAttempts.length === 10) {
    const totalTime = recentAttempts.reduce((sum, a) => sum + (a.responseTime || 0), 0);
    const correct = recentAttempts.filter(a => a.correct).length;
    const accuracy = correct / 10;

    if (totalTime <= 120 && accuracy >= 0.80) {
      const existingBadge = user.habitBadges.find(b => b.badgeId === 'speed-demon');
      if (!existingBadge) {
        earnedBadges.push({
          badgeId: 'speed-demon',
          badgeName: 'Speed Demon',
          category: 'efficiency',
          earnedDate: new Date(),
          metadata: { totalTime, accuracy }
        });
      }
    }
  }

  // First Try Master: 8 problems correct on first attempt
  let firstTryCorrect = 0;
  const seenProblems = new Set();

  for (const attempt of attemptHistory) {
    if (!seenProblems.has(attempt.problemId)) {
      seenProblems.add(attempt.problemId);
      if (attempt.correct) {
        firstTryCorrect++;
      }
    }
  }

  if (firstTryCorrect >= 8) {
    const existingBadge = user.habitBadges.find(b => b.badgeId === 'first-try-master');
    if (!existingBadge) {
      earnedBadges.push({
        badgeId: 'first-try-master',
        badgeName: 'First Try Master',
        category: 'efficiency',
        earnedDate: new Date(),
        metadata: { firstTryCorrect }
      });
    }
  }

  return earnedBadges;
}

/**
 * Check metacognition badges (self-checking, strategy switching)
 */
function checkMetacognitionBadges(attemptHistory, user) {
  const earnedBadges = [];

  // Self-Checker: Uses "Check My Work" 5 times, finds errors 80% of time
  const checkWorkAttempts = attemptHistory.filter(a => a.usedCheckWork);
  if (checkWorkAttempts.length >= 5) {
    const foundErrors = checkWorkAttempts.filter(a => a.foundError).length;
    const successRate = foundErrors / checkWorkAttempts.length;

    if (successRate >= 0.80) {
      const existingBadge = user.habitBadges.find(b => b.badgeId === 'self-checker');
      if (!existingBadge) {
        earnedBadges.push({
          badgeId: 'self-checker',
          badgeName: 'Self-Checker',
          category: 'metacognition',
          earnedDate: new Date(),
          metadata: { checkWorkAttempts: checkWorkAttempts.length, successRate }
        });
      }
    }
  }

  // Strategy Switcher: Requests hint, then solves using alternative method 3 times
  const strategySwitches = attemptHistory.filter(a => a.switchedStrategy).length;
  if (strategySwitches >= 3) {
    const existingBadge = user.habitBadges.find(b => b.badgeId === 'strategy-switcher');
    if (!existingBadge) {
      earnedBadges.push({
        badgeId: 'strategy-switcher',
        badgeName: 'Strategy Switcher',
        category: 'metacognition',
        earnedDate: new Date(),
        metadata: { strategySwitches }
      });
    }
  }

  return earnedBadges;
}

/**
 * Check all habit badges for a user
 */
function checkAllHabitBadges(user, attemptHistory) {
  const earnedBadges = [
    ...checkConsistencyBadges(user),
    ...checkResilienceBadges(attemptHistory, user),
    ...checkEfficiencyBadges(attemptHistory, user),
    ...checkMetacognitionBadges(attemptHistory, user)
  ];

  return earnedBadges;
}

/**
 * Get habit badge by ID
 */
function getHabitBadge(badgeId) {
  return HABITS_BADGES[badgeId] || null;
}

/**
 * Get all habit badges
 */
function getAllHabitBadges() {
  return Object.values(HABITS_BADGES);
}

/**
 * Get habit badges by category
 */
function getHabitBadgesByCategory(category) {
  return Object.values(HABITS_BADGES).filter(b => b.category === category);
}

/**
 * Update streak tracking
 */
function updateStreakTracking(user) {
  const now = new Date();
  const lastPractice = user.dailyQuests.lastPracticeDate;

  if (!lastPractice) {
    // First practice session
    user.dailyQuests.currentStreak = 1;
    user.dailyQuests.lastPracticeDate = now;
    return;
  }

  const daysSinceLastPractice = Math.floor((now - new Date(lastPractice)) / (1000 * 60 * 60 * 24));

  if (daysSinceLastPractice === 0) {
    // Same day, don't increment
    return;
  } else if (daysSinceLastPractice === 1) {
    // Consecutive day, increment streak
    user.dailyQuests.currentStreak++;
    user.dailyQuests.longestStreak = Math.max(
      user.dailyQuests.currentStreak,
      user.dailyQuests.longestStreak || 0
    );
  } else {
    // Streak broken
    user.dailyQuests.currentStreak = 1;
  }

  user.dailyQuests.lastPracticeDate = now;
}

module.exports = {
  HABITS_BADGES,
  checkAllHabitBadges,
  checkConsistencyBadges,
  checkResilienceBadges,
  checkEfficiencyBadges,
  checkMetacognitionBadges,
  getHabitBadge,
  getAllHabitBadges,
  getHabitBadgesByCategory,
  updateStreakTracking
};
