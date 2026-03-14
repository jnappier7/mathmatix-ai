// routes/dailyQuests.js - Daily Quest System for Mastery Mode

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');

// Daily quest templates
const QUEST_TEMPLATES = {
  problemSolver: {
    id: 'problemSolver',
    name: 'Problem Solver',
    description: 'Solve {count} problems correctly',
    icon: '🎯',
    target: 'problemsCorrect',
    countOptions: [5, 10, 15, 20],
    xpReward: 50
  },

  skillBuilder: {
    id: 'skillBuilder',
    name: 'Skill Builder',
    description: 'Practice {count} different skills',
    icon: '📚',
    target: 'skillsPracticed',
    countOptions: [2, 3, 4],
    xpReward: 75
  },

  streakKeeper: {
    id: 'streakKeeper',
    name: 'Streak Keeper',
    description: 'Maintain your learning streak',
    icon: '🔥',
    target: 'dailyPractice',
    countOptions: [1],
    xpReward: 25
  },

  masteryHunter: {
    id: 'masteryHunter',
    name: 'Mastery Hunter',
    description: 'Gain {count}% mastery on any skill',
    icon: '⭐',
    target: 'masteryGained',
    countOptions: [10, 20, 30],
    xpReward: 100
  },

  accuracyAce: {
    id: 'accuracyAce',
    name: 'Accuracy Ace',
    description: 'Maintain {count}% accuracy or higher',
    icon: '🎯',
    target: 'accuracy',
    countOptions: [80, 90, 95],
    xpReward: 75
  },

  speedster: {
    id: 'speedster',
    name: 'Speedster',
    description: 'Solve {count} problems in under 15 minutes',
    icon: '⚡',
    target: 'fastSolving',
    countOptions: [10, 15, 20],
    xpReward: 60
  },

  perfectionist: {
    id: 'perfectionist',
    name: 'Perfectionist',
    description: 'Get {count} problems correct in a row',
    icon: '💯',
    target: 'consecutiveCorrect',
    countOptions: [5, 10, 15],
    xpReward: 100
  },

  explorer: {
    id: 'explorer',
    name: 'Math Explorer',
    description: 'Try a new skill for the first time',
    icon: '🗺️',
    target: 'newSkill',
    countOptions: [1],
    xpReward: 50
  }
};

// ── Pi Day Special Quest Templates (March 14) ──────────────────────
const PI_DAY_QUEST_TEMPLATES = {
  piDigitChallenge: {
    id: 'piDigitChallenge',
    name: 'Pi Digit Challenge',
    description: 'Solve 3 problems about circles, circumference, or area',
    icon: '\u03C0',
    target: 'problemsCorrect',
    countOptions: [3],
    xpReward: 100,
    piDay: true
  },
  piMinilesson: {
    id: 'piMinilesson',
    name: 'Pi Day Mini-Lesson',
    description: 'Ask your tutor to teach you something amazing about pi!',
    icon: '\u03C0',
    target: 'dailyPractice',
    countOptions: [1],
    xpReward: 75,
    piDay: true
  },
  circleExplorer: {
    id: 'circleExplorer',
    name: 'Circle Explorer',
    description: 'Practice a circle-related skill (area, circumference, or arc length)',
    icon: '\u{1F4D0}',
    target: 'skillsPracticed',
    countOptions: [1],
    xpReward: 75,
    piDay: true
  }
};

// Pi Day mini-lesson topics the AI tutor can teach
const PI_DAY_MINILESSONS = [
  {
    title: 'Why Pi Never Ends',
    prompt: 'Teach me a fun mini-lesson about why pi is an irrational number and its decimal digits never end or repeat. Use examples a student would find mind-blowing.',
    gradeBand: 'all'
  },
  {
    title: 'Pi in the Real World',
    prompt: 'Give me a mini-lesson about where pi shows up in real life — wheels, planets, sound waves, GPS, and more. Make it surprising and fun.',
    gradeBand: 'all'
  },
  {
    title: 'The History of Pi',
    prompt: 'Teach me a mini-lesson about the history of pi — from ancient Egyptians and Archimedes to modern supercomputers calculating trillions of digits.',
    gradeBand: 'all'
  },
  {
    title: 'Pi vs Tau Debate',
    prompt: 'Teach me a fun mini-lesson about the pi vs tau (2pi) debate. Why do some mathematicians think we should use tau instead? Present both sides!',
    gradeBand: '5-8'
  },
  {
    title: 'Buffon\'s Needle: Finding Pi by Dropping Sticks',
    prompt: 'Teach me about Buffon\'s Needle experiment — how dropping sticks on lined paper can actually calculate pi. Walk me through the math!',
    gradeBand: '8-12'
  },
  {
    title: 'Pi and Infinite Series',
    prompt: 'Teach me a mini-lesson about how you can calculate pi using infinite series like Leibniz or Gregory series. Show me the pattern!',
    gradeBand: '8-12'
  }
];

/**
 * Check if today is Pi Day (March 14)
 */
function isPiDay() {
  const now = new Date();
  return now.getMonth() === 2 && now.getDate() === 14; // month is 0-indexed
}

// Generate daily quests for a user based on their level and progress
function generateDailyQuests(user) {
  const userLevel = user.level || 1;
  const quests = [];

  // On Pi Day, use special Pi Day quests instead of regular ones
  if (isPiDay()) {
    const piTemplates = Object.values(PI_DAY_QUEST_TEMPLATES);
    piTemplates.forEach(template => {
      quests.push({
        id: `${template.id}-${Date.now()}`,
        templateId: template.id,
        name: template.name,
        description: template.description,
        icon: template.icon,
        target: template.target,
        targetCount: template.countOptions[0],
        progress: 0,
        completed: false,
        xpReward: template.xpReward,
        bonusMultiplier: 3.14, // Pi Day XP multiplier!
        piDay: true
      });
    });
    return quests;
  }

  // Select 3 random quest types
  const templateKeys = Object.keys(QUEST_TEMPLATES);
  const selectedTemplates = [];

  // Always include streak keeper
  selectedTemplates.push(QUEST_TEMPLATES.streakKeeper);

  // Add 2 more random quests
  while (selectedTemplates.length < 3) {
    const randomKey = templateKeys[Math.floor(Math.random() * templateKeys.length)];
    const template = QUEST_TEMPLATES[randomKey];

    if (!selectedTemplates.find(q => q.id === template.id)) {
      selectedTemplates.push(template);
    }
  }

  // Generate actual quests with scaled difficulty
  selectedTemplates.forEach(template => {
    // Scale count based on user level
    const scaleFactor = Math.min(Math.floor(userLevel / 5), template.countOptions.length - 1);
    const targetCount = template.countOptions[scaleFactor];

    quests.push({
      id: `${template.id}-${Date.now()}`,
      templateId: template.id,
      name: template.name,
      description: template.description.replace('{count}', targetCount),
      icon: template.icon,
      target: template.target,
      targetCount: targetCount,
      progress: 0,
      completed: false,
      xpReward: template.xpReward,
      bonusMultiplier: 1.0
    });
  });

  return quests;
}

// Check if quests need to be refreshed (new day or Pi Day status change)
function shouldRefreshQuests(lastRefreshDate, currentQuests) {
  if (!lastRefreshDate) return true;

  const now = new Date();
  const lastRefresh = new Date(lastRefreshDate);

  // Refresh if it's a new day
  if (now.toDateString() !== lastRefresh.toDateString()) return true;

  // Force refresh if it's Pi Day but current quests aren't Pi Day quests
  const hasPiDayQuests = currentQuests && currentQuests.some(q => q.piDay);
  if (isPiDay() && !hasPiDayQuests) return true;

  return false;
}

// Calculate streak
function calculateStreak(user) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const lastPractice = user.dailyQuests?.lastPracticeDate
    ? new Date(user.dailyQuests.lastPracticeDate)
    : null;

  if (!lastPractice) {
    return 1; // First day
  }

  lastPractice.setHours(0, 0, 0, 0);
  const daysDiff = Math.floor((now - lastPractice) / (1000 * 60 * 60 * 24));

  if (daysDiff === 0) {
    // Same day, keep streak
    return user.dailyQuests?.currentStreak || 1;
  } else if (daysDiff === 1) {
    // Consecutive day, increment streak
    return (user.dailyQuests?.currentStreak || 0) + 1;
  } else {
    // Streak broken, reset to 1
    return 1;
  }
}

// GET /api/daily-quests - Get today's quests
router.get('/daily-quests', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    // Initialize daily quests if not exists
    if (!user.dailyQuests) {
      user.dailyQuests = {
        quests: [],
        lastRefreshDate: null,
        currentStreak: 0,
        longestStreak: 0,
        lastPracticeDate: null,
        totalQuestsCompleted: 0,
        todayProgress: {}
      };
    }

    // Check if we need new quests
    if (shouldRefreshQuests(user.dailyQuests.lastRefreshDate, user.dailyQuests.quests)) {
      user.dailyQuests.quests = generateDailyQuests(user);
      user.dailyQuests.lastRefreshDate = new Date();
      user.dailyQuests.todayProgress = {}; // Reset daily progress
      await user.save();
    }

    res.json({
      success: true,
      piDay: isPiDay(),
      quests: user.dailyQuests.quests,
      streak: user.dailyQuests.currentStreak || 0,
      longestStreak: user.dailyQuests.longestStreak || 0,
      totalCompleted: user.dailyQuests.totalQuestsCompleted || 0
    });
  } catch (error) {
    console.error('Error fetching daily quests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/daily-quests/update - Update quest progress
router.post('/daily-quests/update', isAuthenticated, async (req, res) => {
  try {
    const { action, data } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    if (!user.dailyQuests) {
      return res.json({ success: true, message: 'No quests initialized yet' });
    }

    // Update streak
    const newStreak = calculateStreak(user);
    user.dailyQuests.currentStreak = newStreak;
    user.dailyQuests.lastPracticeDate = new Date();

    if (newStreak > (user.dailyQuests.longestStreak || 0)) {
      user.dailyQuests.longestStreak = newStreak;
    }

    // Initialize today's progress if needed
    if (!user.dailyQuests.todayProgress) {
      user.dailyQuests.todayProgress = {};
    }

    // Update progress based on action
    const completedQuests = [];

    user.dailyQuests.quests.forEach(quest => {
      if (quest.completed) return; // Skip already completed

      let progressIncrease = 0;

      switch (quest.target) {
        case 'problemsCorrect':
          if (action === 'problemSolved' && data.correct) {
            progressIncrease = 1;
          }
          break;

        case 'skillsPracticed':
          if (action === 'skillPracticed') {
            if (!user.dailyQuests.todayProgress.skillsPracticed) {
              user.dailyQuests.todayProgress.skillsPracticed = new Set();
            }
            user.dailyQuests.todayProgress.skillsPracticed.add(data.skillId);
            quest.progress = user.dailyQuests.todayProgress.skillsPracticed.size;
          }
          break;

        case 'dailyPractice':
          // Auto-complete streak keeper quest
          progressIncrease = 1;
          break;

        case 'masteryGained':
          if (action === 'masteryProgress' && data.masteryGained) {
            progressIncrease = data.masteryGained; // Percentage gained
          }
          break;

        case 'accuracy':
          if (action === 'sessionComplete' && data.accuracy >= quest.targetCount) {
            quest.progress = quest.targetCount;
          }
          break;

        case 'fastSolving':
          if (action === 'problemSolved' && data.timeTaken < (15 * 60)) {
            progressIncrease = 1;
          }
          break;

        case 'consecutiveCorrect':
          if (action === 'problemSolved') {
            if (!user.dailyQuests.todayProgress.consecutiveCorrect) {
              user.dailyQuests.todayProgress.consecutiveCorrect = 0;
            }

            if (data.correct) {
              user.dailyQuests.todayProgress.consecutiveCorrect++;
              quest.progress = Math.max(
                quest.progress,
                user.dailyQuests.todayProgress.consecutiveCorrect
              );
            } else {
              user.dailyQuests.todayProgress.consecutiveCorrect = 0;
            }
          }
          break;

        case 'newSkill':
          if (action === 'newSkillStarted') {
            progressIncrease = 1;
          }
          break;
      }

      if (progressIncrease > 0 && quest.target !== 'skillsPracticed') {
        quest.progress = Math.min(quest.progress + progressIncrease, quest.targetCount);
      }

      // Check if quest completed
      if (quest.progress >= quest.targetCount && !quest.completed) {
        quest.completed = true;
        quest.completedAt = new Date();
        user.dailyQuests.totalQuestsCompleted = (user.dailyQuests.totalQuestsCompleted || 0) + 1;

        // Award XP
        const xpEarned = Math.round(quest.xpReward * quest.bonusMultiplier);
        user.xp = (user.xp || 0) + xpEarned;

        completedQuests.push({
          ...quest,
          xpEarned
        });
      }
    });

    await user.save();

    res.json({
      success: true,
      quests: user.dailyQuests.quests,
      streak: user.dailyQuests.currentStreak,
      completedQuests: completedQuests.length > 0 ? completedQuests : undefined
    });
  } catch (error) {
    console.error('Error updating quests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/daily-quests/stats - Get quest statistics
router.get('/daily-quests/stats', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const stats = {
      currentStreak: user.dailyQuests?.currentStreak || 0,
      longestStreak: user.dailyQuests?.longestStreak || 0,
      totalQuestsCompleted: user.dailyQuests?.totalQuestsCompleted || 0,
      questsCompletedToday: user.dailyQuests?.quests?.filter(q => q.completed).length || 0,
      totalQuestsToday: user.dailyQuests?.quests?.length || 3,
      streakMultiplier: 1.0 + Math.min((user.dailyQuests?.currentStreak || 0) * 0.01, 0.5)
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching quest stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/daily-quests/pi-day-lessons - Get Pi Day mini-lesson topics
router.get('/daily-quests/pi-day-lessons', isAuthenticated, (req, res) => {
  if (!isPiDay()) {
    return res.json({ success: true, active: false, lessons: [] });
  }

  // Return all mini-lessons — frontend can filter by grade band
  res.json({
    success: true,
    active: true,
    lessons: PI_DAY_MINILESSONS
  });
});

module.exports = router;
