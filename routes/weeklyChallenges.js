// routes/weeklyChallenges.js - Weekly Challenges System for Enhanced Engagement

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const logger = require('../utils/logger').child({ route: 'weeklyChallenges' });
const { createPerUserLock } = require('../utils/perUserLock');

// Weekly challenge templates
const WEEKLY_CHALLENGE_TEMPLATES = {
  skillMaster: {
    id: 'skillMaster',
    name: 'Skill Master',
    description: 'Master {count} new skills this week',
    icon: '🎓',
    difficulty: 'hard',
    targetType: 'skillsMastered',
    countOptions: [1, 2, 3],
    xpReward: 500,
    specialReward: 'Skill Master Badge'
  },

  accuracyChampion: {
    id: 'accuracyChampion',
    name: 'Accuracy Champion',
    description: 'Maintain {count}% accuracy across all practice',
    icon: '🎯',
    difficulty: 'medium',
    targetType: 'weeklyAccuracy',
    countOptions: [85, 90, 95],
    xpReward: 300,
    specialReward: '2x XP Weekend Pass'
  },

  marathoner: {
    id: 'marathoner',
    name: 'Math Marathoner',
    description: 'Solve {count} problems this week',
    icon: '🏃',
    difficulty: 'medium',
    targetType: 'problemsSolved',
    countOptions: [50, 100, 150],
    xpReward: 400,
    specialReward: 'Marathoner Badge'
  },

  perfectWeek: {
    id: 'perfectWeek',
    name: 'Perfect Week',
    description: 'Complete all daily quests for 7 days straight',
    icon: '✨',
    difficulty: 'hard',
    targetType: 'dailyQuestStreak',
    countOptions: [7],
    xpReward: 750,
    specialReward: 'Perfect Week Badge + 3 days XP boost'
  },

  diverseLearner: {
    id: 'diverseLearner',
    name: 'Diverse Learner',
    description: 'Practice {count} different skill domains',
    icon: '🌈',
    difficulty: 'medium',
    targetType: 'domainsPracticed',
    countOptions: [3, 4, 5],
    xpReward: 350,
    specialReward: 'Domain Explorer Badge'
  },

  // Replaces Weekly Speedster (2026-10-24): it never progressed (no solve
  // time is sent) and rewarded rushing. Fixing a miss is the habit we pay for.
  comebackKid: {
    id: 'comebackKid',
    name: 'Comeback Kid',
    description: 'Fix {count} problems you got wrong at first',
    icon: '💪',
    difficulty: 'medium',
    targetType: 'weeklyComebacks',
    countOptions: [5, 8, 12],
    xpReward: 400,
    specialReward: 'Comeback Kid Badge'
  },

  // Not dealt (2026-10-24): its only event, thetaImprovement, is never sent (growth checks are quarterly, not weekly), so it sat at 0 all week.
  growthMindset: {
    id: 'growthMindset',
    retired: true,
    name: 'Growth Mindset',
    description: 'Grow your math level by {count} points on your growth checks',
    icon: '📈',
    difficulty: 'medium',
    targetType: 'thetaGrowth',
    countOptions: [2, 3, 5],
    xpReward: 400,
    specialReward: 'Growth Star Badge'
  },

  // Not dealt (2026-10-24): there is no peer-tutoring feature to send peerHelped, so it sat at 0 all week.
  helpfulHelper: {
    id: 'helpfulHelper',
    retired: true,
    name: 'Helpful Helper',
    description: 'Help {count} classmates this week (peer tutoring)',
    icon: '🤝',
    difficulty: 'easy',
    targetType: 'peersHelped',
    countOptions: [3, 5, 10],
    xpReward: 300,
    specialReward: 'Helper Badge'
  }
};

// Get start of current week (Monday 00:00:00)
function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const updateLock = createPerUserLock();

// A weekly-accuracy challenge is judged only once this many problems are in.
const MIN_ACCURACY_SAMPLE = 10;

// Check if date is in current week
function isCurrentWeek(date) {
  const weekStart = getWeekStart();
  const checkDate = new Date(date);
  return checkDate >= weekStart;
}

// Generate weekly challenges based on user level and preferences
function generateWeeklyChallenges(user) {
  const userLevel = user.level || 1;
  const challenges = [];

  // Select 3 random challenge types
  // Only challenges a student can actually finish (retired ones stay defined
  // so a challenge already dealt still renders).
  const templateKeys = Object.keys(WEEKLY_CHALLENGE_TEMPLATES)
    .filter(key => !WEEKLY_CHALLENGE_TEMPLATES[key].retired);
  const selectedTemplates = [];

  // Always include one hard challenge
  const hardChallenges = templateKeys.filter(key =>
    WEEKLY_CHALLENGE_TEMPLATES[key].difficulty === 'hard'
  );
  if (hardChallenges.length > 0) {
    const randomHard = hardChallenges[Math.floor(Math.random() * hardChallenges.length)];
    selectedTemplates.push(WEEKLY_CHALLENGE_TEMPLATES[randomHard]);
  }

  // Add 2 more random challenges
  while (selectedTemplates.length < 3) {
    const randomKey = templateKeys[Math.floor(Math.random() * templateKeys.length)];
    const template = WEEKLY_CHALLENGE_TEMPLATES[randomKey];

    if (!selectedTemplates.find(t => t.id === template.id)) {
      selectedTemplates.push(template);
    }
  }

  // Generate actual challenges with scaled difficulty
  selectedTemplates.forEach(template => {
    // Scale count based on user level
    const scaleFactor = Math.min(Math.floor(userLevel / 10), template.countOptions.length - 1);
    const targetCount = template.countOptions[scaleFactor];

    challenges.push({
      id: `${template.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      templateId: template.id,
      name: template.name,
      description: template.description.replace('{count}', targetCount),
      icon: template.icon,
      difficulty: template.difficulty,
      targetType: template.targetType,
      targetCount: targetCount,
      progress: 0,
      completed: false,
      xpReward: template.xpReward,
      specialReward: template.specialReward,
      startDate: getWeekStart(),
      endDate: new Date(getWeekStart().getTime() + 7 * 24 * 60 * 60 * 1000)
    });
  });

  return challenges;
}

// GET /api/weekly-challenges - Get current week's challenges
router.get('/weekly-challenges', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    // A new week (or a first visit) needs a fresh set.
    //
    // This used to set the fields on the loaded document and `user.save()`.
    // The chat page fires this GET alongside several other requests that also
    // load and save the user, and a whole-document save carries the version it
    // was loaded at — so whichever landed second threw VersionError ("No
    // matching document found for id … version 0") and the student's weekly
    // challenges answered 500 on exactly the load that was meant to create
    // them. The roll-over is now ONE conditional update: it writes only these
    // three fields, only if the week has not already been rolled, and never
    // looks at the document's version. Two requests racing produce one set —
    // the loser's update matches nothing and it reads the winner's.
    let weekly = user.weeklyChallenges;
    const needsNewChallenges = !weekly || !weekly.weekStartDate || !isCurrentWeek(weekly.weekStartDate);

    if (needsNewChallenges) {
      const weekStartNow = getWeekStart();
      const rolled = await User.findOneAndUpdate(
        {
          _id: user._id,
          $or: [
            { 'weeklyChallenges.weekStartDate': { $exists: false } },
            { 'weeklyChallenges.weekStartDate': null },
            { 'weeklyChallenges.weekStartDate': { $lt: weekStartNow } }
          ]
        },
        {
          $set: {
            'weeklyChallenges.challenges': generateWeeklyChallenges(user),
            'weeklyChallenges.weekStartDate': weekStartNow,
            'weeklyChallenges.weeklyProgress': {}
          }
        },
        { new: true, projection: { weeklyChallenges: 1 } }
      ).lean();
      const current = rolled || await User.findById(user._id, { weeklyChallenges: 1 }).lean();
      weekly = (current && current.weeklyChallenges) || { challenges: [] };
    }
    const challenges = weekly.challenges || [];

    // Calculate time remaining
    const weekStart = getWeekStart();
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const hoursRemaining = Math.floor((weekEnd - now) / (1000 * 60 * 60));
    const daysRemaining = Math.floor(hoursRemaining / 24);

    res.json({
      success: true,
      challenges,
      weekStart: weekStart,
      weekEnd: weekEnd,
      hoursRemaining,
      daysRemaining,
      completedCount: challenges.filter(c => c.completed).length,
      totalCount: challenges.length,
      completedAllTime: weekly.completedChallengesAllTime || 0
    });
  } catch (error) {
    logger.error('Error fetching weekly challenges:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/weekly-challenges/update - Update challenge progress
router.post('/weekly-challenges/update', isAuthenticated, async (req, res) => {
  // Progress is applied to the loaded document and saved whole, so a save that
  // loses a race with another request's save throws VersionError. Nothing has
  // been written at that point (XP, coins and progress all live on the
  // document), so the honest answer is to load the fresh document and apply
  // the event again — not to tell the student their progress failed.
  //
  // And a student's own updates are taken ONE AT A TIME. A burst of them (a
  // solved problem fires several events) each loaded the same document, each
  // added one, and each saved "progress: 1": editing a field inside an array
  // element is not something mongoose's version check covers, so nothing threw
  // and three of four answers were silently lost.
  const release = await updateLock.acquire(req.user._id);
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await applyChallengeEvent(req, res);
      } catch (error) {
        if (error && error.name === 'VersionError' && attempt < 3) continue;
        logger.error('Error updating weekly challenges:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  } finally {
    release();
  }
});

async function applyChallengeEvent(req, res) {
  {
    const { event, data = {} } = req.body;
    const user = await User.findById(req.user._id);

    if (!user || !user.weeklyChallenges) {
      return res.json({ success: true, message: 'No challenges initialized yet' });
    }

    // Only update if in current week
    if (!isCurrentWeek(user.weeklyChallenges.weekStartDate)) {
      return res.json({ success: true, message: 'Week has ended, new challenges coming' });
    }

    // weeklyProgress is a Mongoose Map. It was read and written as a plain
    // object (`weeklyProgress.totalProblems++`, `new Set()` on a property), and
    // properties set on a Map are not saved — so every request started from
    // zero: the weekly-accuracy challenge completed on the first right answer,
    // and the quest-streak and domains challenges could never pass 1. Counters
    // and lists go through get/set, lists as arrays.
    if (!(user.weeklyChallenges.weeklyProgress instanceof Map)) {
      user.weeklyChallenges.weeklyProgress = new Map();
    }
    const progress = user.weeklyChallenges.weeklyProgress;
    const num = (key) => Number(progress.get(key)) || 0;
    const addToList = (key, value) => {
      const list = Array.isArray(progress.get(key)) ? progress.get(key).slice() : [];
      if (value !== undefined && value !== null && !list.includes(value)) list.push(value);
      progress.set(key, list);
      return list.length;
    };
    // An event is counted once per request, however many challenges read it.
    let accuracyCounted = false;

    const completedChallenges = [];

    user.weeklyChallenges.challenges.forEach(challenge => {
      if (challenge.completed) return; // Skip completed

      let progressIncrease = 0;

      switch (challenge.targetType) {
        case 'skillsMastered':
          if (event === 'skillMastered') {
            progressIncrease = 1;
          }
          break;

        case 'weeklyAccuracy':
          if (event === 'problemSolved') {
            // Track weekly accuracy
            if (!accuracyCounted) {
              progress.set('totalProblems', num('totalProblems') + 1);
              if (data.correct) progress.set('correctProblems', num('correctProblems') + 1);
              accuracyCounted = true;
            }
            const accuracy = Math.round((num('correctProblems') / num('totalProblems')) * 100);

            // A percentage needs a sample: one right answer is "100%".
            if (num('totalProblems') < MIN_ACCURACY_SAMPLE) break;

            if (accuracy >= challenge.targetCount) {
              challenge.progress = challenge.targetCount;
            }
          }
          break;

        case 'problemsSolved':
          if (event === 'problemSolved' && data.correct) {
            progressIncrease = 1;
          }
          break;

        case 'dailyQuestStreak':
          if (event === 'dailyQuestCompleted') {
            if (data.allQuestsCompleted) {
              challenge.progress = addToList('daysWithAllQuests', new Date().toDateString());
            }
          }
          break;

        case 'domainsPracticed':
          if (event === 'domainPracticed') {
            if (data.domain) challenge.progress = addToList('domainsPracticed', String(data.domain));
          }
          break;

        case 'fastProblems':
          if (event === 'problemSolved' && data.timeTaken < 60 && data.correct) {
            progressIncrease = 1;
          }
          break;

        case 'thetaGrowth':
          if (event === 'thetaImprovement') {
            if (!challenge.progress) challenge.progress = 0;
            progressIncrease = data.thetaGain || 0;
          }
          break;

        case 'peersHelped':
          if (event === 'peerHelped') {
            progressIncrease = 1;
          }
          break;
      }

      if (progressIncrease > 0 && challenge.targetType !== 'weeklyAccuracy' &&
          challenge.targetType !== 'dailyQuestStreak' && challenge.targetType !== 'domainsPracticed') {
        challenge.progress = Math.min((challenge.progress || 0) + progressIncrease, challenge.targetCount);
      }

      // Check if challenge completed
      if (challenge.progress >= challenge.targetCount && !challenge.completed) {
        challenge.completed = true;
        challenge.completedAt = new Date();
        user.weeklyChallenges.completedChallengesAllTime =
          (user.weeklyChallenges.completedChallengesAllTime || 0) + 1;

        // Award XP
        user.xp = (user.xp || 0) + challenge.xpReward;

        // Award Coins (earned soft currency; server-authoritative, daily-capped).
        // Non-blocking — a coin failure must never break challenge completion.
        let coinsEarned = 0;
        try {
          const { awardCoins } = require('../utils/coinEngine');
          const BRAND = require('../utils/brand');
          const perChallenge = (BRAND.coinRewards && BRAND.coinRewards.challengeComplete) || 0;
          coinsEarned = awardCoins(user, perChallenge, 'challenge_complete').awarded;
        } catch (coinErr) {
          console.error('[weeklyChallenges] coin award failed:', coinErr.message);
        }

        completedChallenges.push({
          ...challenge,
          xpEarned: challenge.xpReward,
          coinsEarned
        });
      }
    });

    await user.save();

    res.json({
      success: true,
      challenges: user.weeklyChallenges.challenges,
      completedChallenges: completedChallenges.length > 0 ? completedChallenges : undefined
    });
  }
}

// GET /api/weekly-challenges/leaderboard - Get weekly leaderboard
router.get('/weekly-challenges/leaderboard', async (req, res) => {
  try {
    const weekStart = getWeekStart();

    // Find all users with challenges from this week
    const users = await User.find({
      'weeklyChallenges.weekStartDate': { $gte: weekStart }
    })
      .select('firstName lastName weeklyChallenges.challenges level')
      .limit(100);

    const leaderboard = users.map(user => {
      const completed = user.weeklyChallenges?.challenges?.filter(c => c.completed).length || 0;
      const total = user.weeklyChallenges?.challenges?.length || 0;

      return {
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`,
        completedChallenges: completed,
        totalChallenges: total,
        level: user.level || 1
      };
    });

    // Sort by completed challenges (desc), then by level (desc)
    leaderboard.sort((a, b) => {
      if (b.completedChallenges !== a.completedChallenges) {
        return b.completedChallenges - a.completedChallenges;
      }
      return b.level - a.level;
    });

    res.json({
      success: true,
      leaderboard: leaderboard.slice(0, 20) // Top 20
    });
  } catch (error) {
    logger.error('Error fetching leaderboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
// For tests: which challenges get dealt, and what they ask.
module.exports.WEEKLY_CHALLENGE_TEMPLATES = WEEKLY_CHALLENGE_TEMPLATES;
module.exports.generateWeeklyChallenges = generateWeeklyChallenges;
