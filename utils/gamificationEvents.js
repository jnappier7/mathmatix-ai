/**
 * Gamification Event Bus — Centralized event dispatch for quests, challenges, and badges.
 *
 * All tutoring flows (chat, mastery-chat, course-chat) call emitGamificationEvent()
 * after each problem is answered. This module updates daily quests, weekly challenges,
 * and badge progress in one place — so gamification systems are never orphaned.
 *
 * @module utils/gamificationEvents
 */

const logger = require('./logger').child({ module: 'gamificationEvents' });

/**
 * Check whether a user can use their weekly streak freeze.
 * Each user gets 1 free freeze per calendar week (resets Sunday midnight UTC).
 */
function canUseStreakFreeze(user) {
  const lastUsed = user.dailyQuests?.streakFreezeUsedAt;
  if (!lastUsed) return true;

  // Reset each week: find the most recent Sunday at midnight UTC
  const now = new Date();
  const daysSinceSunday = now.getUTCDay(); // 0 = Sunday
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceSunday);
  weekStart.setUTCHours(0, 0, 0, 0);

  return new Date(lastUsed) < weekStart;
}

/**
 * Process a gamification event and update all relevant systems.
 *
 * @param {Object} user - Mongoose user document (will be mutated + saved by caller)
 * @param {string} eventType - One of: 'problemSolved', 'skillPracticed', 'skillMastered',
 *                             'newSkillStarted', 'sessionComplete', 'domainPracticed', 'thetaImprovement'
 * @param {Object} data - Event-specific payload
 * @param {boolean} [data.correct] - Whether the answer was correct
 * @param {string}  [data.skillId] - Skill that was practiced
 * @param {string}  [data.domain] - Math domain (e.g. 'algebra', 'geometry')
 * @param {number}  [data.timeTaken] - Seconds to solve
 * @param {number}  [data.accuracy] - Session accuracy (0-100) for sessionComplete
 * @param {number}  [data.thetaGain] - Theta improvement for thetaImprovement events
 * @param {number}  [data.masteryGained] - Mastery percentage gained
 * @returns {Object} { questsCompleted: [], challengesCompleted: [], xpAwarded: number }
 */
function emitGamificationEvent(user, eventType, data = {}) {
  const result = {
    questsCompleted: [],
    challengesCompleted: [],
    xpAwarded: 0,
  };

  try {
    // ── 1. Update Daily Quests ──
    const questResult = updateDailyQuests(user, eventType, data);
    result.questsCompleted = questResult.completed;
    result.xpAwarded += questResult.xpAwarded;
    if (questResult.streakFreezeUsed) result.streakFreezeUsed = true;
    if (questResult.streakLost) result.streakLost = questResult.streakLost;

    // ── 2. Update Weekly Challenges ──
    const challengeResult = updateWeeklyChallenges(user, eventType, data);
    result.challengesCompleted = challengeResult.completed;
    result.xpAwarded += challengeResult.xpAwarded;

    // ── 3. Check if all daily quests completed → trigger weekly challenge update ──
    if (user.dailyQuests?.quests?.length > 0) {
      const allDone = user.dailyQuests.quests.every(q => q.completed);
      if (allDone && questResult.completed.length > 0) {
        const weeklyFromDaily = updateWeeklyChallenges(user, 'dailyQuestCompleted', {
          allQuestsCompleted: true,
        });
        result.challengesCompleted.push(...weeklyFromDaily.completed);
        result.xpAwarded += weeklyFromDaily.xpAwarded;
      }
    }

  } catch (err) {
    logger.error('Gamification event processing failed', { eventType, error: err.message });
  }

  return result;
}

/**
 * Update daily quests based on an event.
 * Mirrors the logic in routes/dailyQuests.js POST handler but runs in-process.
 */
function updateDailyQuests(user, eventType, data) {
  const result = { completed: [], xpAwarded: 0 };

  if (!user.dailyQuests) {
    user.dailyQuests = {
      quests: [],
      lastRefreshDate: null,
      currentStreak: 0,
      longestStreak: 0,
      lastPracticeDate: null,
      totalQuestsCompleted: 0,
      todayProgress: {},
    };
  }

  // Check if quests need refresh (new day)
  if (shouldRefreshDailyQuests(user.dailyQuests.lastRefreshDate)) {
    // Don't generate quests here — let the GET endpoint handle that.
    // Just skip updating stale quests.
    return result;
  }

  if (!user.dailyQuests.quests || user.dailyQuests.quests.length === 0) {
    return result;
  }

  // Update streak on any activity
  const now = new Date();
  const lastPractice = user.dailyQuests.lastPracticeDate
    ? new Date(user.dailyQuests.lastPracticeDate)
    : null;

  if (lastPractice) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const lastDay = new Date(lastPractice);
    lastDay.setHours(0, 0, 0, 0);
    const daysDiff = Math.floor((today - lastDay) / (1000 * 60 * 60 * 24));

    if (daysDiff === 1) {
      user.dailyQuests.currentStreak = (user.dailyQuests.currentStreak || 0) + 1;
    } else if (daysDiff === 2 && canUseStreakFreeze(user)) {
      // Missed exactly 1 day — auto-apply weekly streak freeze
      user.dailyQuests.currentStreak = (user.dailyQuests.currentStreak || 0) + 1;
      user.dailyQuests.streakFreezeUsedAt = now;
      result.streakFreezeUsed = true;
    } else if (daysDiff > 1) {
      result.streakLost = user.dailyQuests.currentStreak || 0;
      user.dailyQuests.currentStreak = 1;
    }
    // daysDiff === 0 means same day — keep current streak
  } else {
    user.dailyQuests.currentStreak = 1;
  }

  user.dailyQuests.lastPracticeDate = now;

  if ((user.dailyQuests.currentStreak || 0) > (user.dailyQuests.longestStreak || 0)) {
    user.dailyQuests.longestStreak = user.dailyQuests.currentStreak;
  }

  if (!user.dailyQuests.todayProgress) {
    user.dailyQuests.todayProgress = {};
  }

  // Map event types to quest target actions
  for (const quest of user.dailyQuests.quests) {
    if (quest.completed) continue;

    let progressIncrease = 0;

    switch (quest.target) {
      case 'problemsCorrect':
        if (eventType === 'problemSolved' && data.correct) {
          progressIncrease = 1;
        }
        break;

      case 'skillsPracticed':
        if (eventType === 'skillPracticed' || eventType === 'problemSolved') {
          const skillId = data.skillId;
          if (skillId) {
            if (!user.dailyQuests.todayProgress._skillsPracticedSet) {
              user.dailyQuests.todayProgress._skillsPracticedSet = [];
            }
            if (!user.dailyQuests.todayProgress._skillsPracticedSet.includes(skillId)) {
              user.dailyQuests.todayProgress._skillsPracticedSet.push(skillId);
            }
            quest.progress = user.dailyQuests.todayProgress._skillsPracticedSet.length;
          }
        }
        break;

      case 'dailyPractice':
        // Auto-complete on any activity
        progressIncrease = 1;
        break;

      case 'masteryGained':
        if (eventType === 'skillMastered' || (eventType === 'problemSolved' && data.masteryGained)) {
          progressIncrease = data.masteryGained || 10;
        }
        break;

      case 'accuracy':
        if (eventType === 'sessionComplete' && data.accuracy >= quest.targetCount) {
          quest.progress = quest.targetCount;
        }
        break;

      case 'fastSolving':
        if (eventType === 'problemSolved' && data.timeTaken && data.timeTaken < (15 * 60)) {
          progressIncrease = 1;
        }
        break;

      case 'consecutiveCorrect':
        if (eventType === 'problemSolved') {
          if (!user.dailyQuests.todayProgress._consecutiveCorrect) {
            user.dailyQuests.todayProgress._consecutiveCorrect = 0;
          }
          if (data.correct) {
            user.dailyQuests.todayProgress._consecutiveCorrect++;
            quest.progress = Math.max(
              quest.progress || 0,
              user.dailyQuests.todayProgress._consecutiveCorrect
            );
          } else {
            user.dailyQuests.todayProgress._consecutiveCorrect = 0;
          }
        }
        break;

      case 'newSkill':
        if (eventType === 'newSkillStarted') {
          progressIncrease = 1;
        }
        break;
    }

    if (progressIncrease > 0 && quest.target !== 'skillsPracticed') {
      quest.progress = Math.min((quest.progress || 0) + progressIncrease, quest.targetCount);
    }

    // Check completion
    if ((quest.progress || 0) >= quest.targetCount && !quest.completed) {
      quest.completed = true;
      quest.completedAt = new Date();
      user.dailyQuests.totalQuestsCompleted = (user.dailyQuests.totalQuestsCompleted || 0) + 1;

      const xpEarned = Math.round(quest.xpReward * (quest.bonusMultiplier || 1));
      user.xp = (user.xp || 0) + xpEarned;
      result.xpAwarded += xpEarned;

      result.completed.push({
        id: quest.id,
        name: quest.name,
        icon: quest.icon,
        xpEarned,
      });

      logger.info('Daily quest completed', { questId: quest.id, questName: quest.name, xpEarned });
    }
  }

  return result;
}

/**
 * Update weekly challenges based on an event.
 * Mirrors the logic in routes/weeklyChallenges.js POST handler.
 */
function updateWeeklyChallenges(user, eventType, data) {
  const result = { completed: [], xpAwarded: 0 };

  if (!user.weeklyChallenges) {
    user.weeklyChallenges = {
      challenges: [],
      weekStartDate: null,
      completedChallengesAllTime: 0,
      weeklyProgress: {},
    };
  }

  // Check if challenges are from the current week
  if (!user.weeklyChallenges.weekStartDate || !isCurrentWeek(user.weeklyChallenges.weekStartDate)) {
    return result; // Stale — let GET endpoint refresh
  }

  if (!user.weeklyChallenges.challenges || user.weeklyChallenges.challenges.length === 0) {
    return result;
  }

  if (!user.weeklyChallenges.weeklyProgress) {
    user.weeklyChallenges.weeklyProgress = {};
  }

  for (const challenge of user.weeklyChallenges.challenges) {
    if (challenge.completed) continue;

    let progressIncrease = 0;

    switch (challenge.targetType) {
      case 'skillsMastered':
        if (eventType === 'skillMastered') {
          progressIncrease = 1;
        }
        break;

      case 'weeklyAccuracy':
        if (eventType === 'problemSolved') {
          if (!user.weeklyChallenges.weeklyProgress.totalProblems) {
            user.weeklyChallenges.weeklyProgress.totalProblems = 0;
            user.weeklyChallenges.weeklyProgress.correctProblems = 0;
          }
          user.weeklyChallenges.weeklyProgress.totalProblems++;
          if (data.correct) {
            user.weeklyChallenges.weeklyProgress.correctProblems++;
          }
          const accuracy = Math.round(
            (user.weeklyChallenges.weeklyProgress.correctProblems /
              user.weeklyChallenges.weeklyProgress.totalProblems) * 100
          );
          if (accuracy >= challenge.targetCount) {
            challenge.progress = challenge.targetCount;
          } else {
            challenge.progress = accuracy;
          }
        }
        break;

      case 'problemsSolved':
        if (eventType === 'problemSolved' && data.correct) {
          progressIncrease = 1;
        }
        break;

      case 'dailyQuestStreak':
        if (eventType === 'dailyQuestCompleted') {
          if (!user.weeklyChallenges.weeklyProgress._daysWithAllQuests) {
            user.weeklyChallenges.weeklyProgress._daysWithAllQuests = [];
          }
          const today = new Date().toDateString();
          if (data.allQuestsCompleted && !user.weeklyChallenges.weeklyProgress._daysWithAllQuests.includes(today)) {
            user.weeklyChallenges.weeklyProgress._daysWithAllQuests.push(today);
            challenge.progress = user.weeklyChallenges.weeklyProgress._daysWithAllQuests.length;
          }
        }
        break;

      case 'domainsPracticed':
        if (eventType === 'domainPracticed' || eventType === 'problemSolved') {
          const domain = data.domain;
          if (domain) {
            if (!user.weeklyChallenges.weeklyProgress._domainsPracticed) {
              user.weeklyChallenges.weeklyProgress._domainsPracticed = [];
            }
            if (!user.weeklyChallenges.weeklyProgress._domainsPracticed.includes(domain)) {
              user.weeklyChallenges.weeklyProgress._domainsPracticed.push(domain);
            }
            challenge.progress = user.weeklyChallenges.weeklyProgress._domainsPracticed.length;
          }
        }
        break;

      case 'fastProblems':
        if (eventType === 'problemSolved' && data.timeTaken && data.timeTaken < 60 && data.correct) {
          progressIncrease = 1;
        }
        break;

      case 'thetaGrowth':
        if (eventType === 'thetaImprovement') {
          progressIncrease = data.thetaGain || 0;
        }
        break;

      case 'peersHelped':
        if (eventType === 'peerHelped') {
          progressIncrease = 1;
        }
        break;
    }

    if (progressIncrease > 0 && challenge.targetType !== 'weeklyAccuracy' &&
        challenge.targetType !== 'dailyQuestStreak' && challenge.targetType !== 'domainsPracticed') {
      challenge.progress = Math.min((challenge.progress || 0) + progressIncrease, challenge.targetCount);
    }

    // Check completion
    if ((challenge.progress || 0) >= challenge.targetCount && !challenge.completed) {
      challenge.completed = true;
      challenge.completedAt = new Date();
      user.weeklyChallenges.completedChallengesAllTime =
        (user.weeklyChallenges.completedChallengesAllTime || 0) + 1;

      user.xp = (user.xp || 0) + challenge.xpReward;
      result.xpAwarded += challenge.xpReward;

      result.completed.push({
        id: challenge.id,
        name: challenge.name,
        icon: challenge.icon,
        xpEarned: challenge.xpReward,
        specialReward: challenge.specialReward,
      });

      logger.info('Weekly challenge completed', {
        challengeId: challenge.id,
        challengeName: challenge.name,
        xpEarned: challenge.xpReward,
      });
    }
  }

  return result;
}

// ── Helpers ──

function shouldRefreshDailyQuests(lastRefreshDate) {
  if (!lastRefreshDate) return true;
  const now = new Date();
  const last = new Date(lastRefreshDate);
  return now.toDateString() !== last.toDateString();
}

function isCurrentWeek(date) {
  const weekStart = getWeekStart();
  return new Date(date) >= weekStart;
}

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

module.exports = { emitGamificationEvent };
