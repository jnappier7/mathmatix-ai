// routes/weeklyChallenges.js - Weekly Challenges System for Enhanced Engagement

const express = require('express');
const router = express.Router();
const User = require('../models/user');

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

  speedster: {
    id: 'speedster',
    name: 'Weekly Speedster',
    description: 'Solve {count} problems in under 1 minute each',
    icon: '⚡',
    difficulty: 'hard',
    targetType: 'fastProblems',
    countOptions: [20, 30, 50],
    xpReward: 450,
    specialReward: 'Speed Demon Badge'
  },

  growthMindset: {
    id: 'growthMindset',
    name: 'Growth Mindset',
    description: 'Improve ability (θ) by {count} points total',
    icon: '📈',
    difficulty: 'medium',
    targetType: 'thetaGrowth',
    countOptions: [2, 3, 5],
    xpReward: 400,
    specialReward: 'Growth Star Badge'
  },

  helpfulHelper: {
    id: 'helpfulHelper',
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
  const templateKeys = Object.keys(WEEKLY_CHALLENGE_TEMPLATES);
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
router.get('/weekly-challenges', async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    // Initialize weekly challenges if not exists
    if (!user.weeklyChallenges) {
      user.weeklyChallenges = {
        challenges: [],
        weekStartDate: null,
        completedChallengesAllTime: 0,
        weeklyProgress: {}
      };
    }

    // Check if we need new challenges (new week)
    const needsNewChallenges = !user.weeklyChallenges.weekStartDate ||
                               !isCurrentWeek(user.weeklyChallenges.weekStartDate);

    if (needsNewChallenges) {
      user.weeklyChallenges.challenges = generateWeeklyChallenges(user);
      user.weeklyChallenges.weekStartDate = getWeekStart();
      user.weeklyChallenges.weeklyProgress = {}; // Reset weekly progress
      await user.save();
    }

    // Calculate time remaining
    const weekStart = getWeekStart();
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const hoursRemaining = Math.floor((weekEnd - now) / (1000 * 60 * 60));
    const daysRemaining = Math.floor(hoursRemaining / 24);

    res.json({
      success: true,
      challenges: user.weeklyChallenges.challenges,
      weekStart: weekStart,
      weekEnd: weekEnd,
      hoursRemaining,
      daysRemaining,
      completedCount: user.weeklyChallenges.challenges.filter(c => c.completed).length,
      totalCount: user.weeklyChallenges.challenges.length,
      completedAllTime: user.weeklyChallenges.completedChallengesAllTime || 0
    });
  } catch (error) {
    console.error('Error fetching weekly challenges:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/weekly-challenges/update - Update challenge progress
router.post('/weekly-challenges/update', async (req, res) => {
  try {
    const { event, data } = req.body;
    const user = await User.findById(req.session.userId);

    if (!user || !user.weeklyChallenges) {
      return res.json({ success: true, message: 'No challenges initialized yet' });
    }

    // Only update if in current week
    if (!isCurrentWeek(user.weeklyChallenges.weekStartDate)) {
      return res.json({ success: true, message: 'Week has ended, new challenges coming' });
    }

    // Initialize weekly progress if needed
    if (!user.weeklyChallenges.weeklyProgress) {
      user.weeklyChallenges.weeklyProgress = {};
    }

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
            // Check if all daily quests completed
            if (!user.weeklyChallenges.weeklyProgress.daysWithAllQuests) {
              user.weeklyChallenges.weeklyProgress.daysWithAllQuests = new Set();
            }

            const today = new Date().toDateString();
            if (data.allQuestsCompleted) {
              user.weeklyChallenges.weeklyProgress.daysWithAllQuests.add(today);
              challenge.progress = user.weeklyChallenges.weeklyProgress.daysWithAllQuests.size;
            }
          }
          break;

        case 'domainsPracticed':
          if (event === 'domainPracticed') {
            if (!user.weeklyChallenges.weeklyProgress.domainsPracticed) {
              user.weeklyChallenges.weeklyProgress.domainsPracticed = new Set();
            }
            user.weeklyChallenges.weeklyProgress.domainsPracticed.add(data.domain);
            challenge.progress = user.weeklyChallenges.weeklyProgress.domainsPracticed.size;
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

        completedChallenges.push({
          ...challenge,
          xpEarned: challenge.xpReward
        });
      }
    });

    await user.save();

    res.json({
      success: true,
      challenges: user.weeklyChallenges.challenges,
      completedChallenges: completedChallenges.length > 0 ? completedChallenges : undefined
    });
  } catch (error) {
    console.error('Error updating weekly challenges:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
