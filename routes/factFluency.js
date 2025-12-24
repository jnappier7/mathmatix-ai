// routes/factFluency.js - API routes for M∆THBL∆ST Fact Fluency game

const express = require('express');
const router = express.Router();
const User = require('../models/user');

// Fact family definitions (Morningside-style build-up sequence)
const FACT_FAMILIES = {
  addition: [
    { familyName: 'plus0', displayName: '+0', range: [0, 10], addend: 0 },
    { familyName: 'plus1', displayName: '+1', range: [0, 10], addend: 1 },
    { familyName: 'plus2', displayName: '+2', range: [0, 10], addend: 2 },
    { familyName: 'doubles', displayName: 'Doubles', range: [0, 10], special: 'doubles' },
    { familyName: 'plus10', displayName: '+10', range: [0, 10], addend: 10 },
    { familyName: 'plus3', displayName: '+3', range: [0, 10], addend: 3 },
    { familyName: 'plus4', displayName: '+4', range: [0, 10], addend: 4 },
    { familyName: 'plus5', displayName: '+5', range: [0, 10], addend: 5 },
    { familyName: 'plus6', displayName: '+6', range: [0, 10], addend: 6 },
    { familyName: 'plus7', displayName: '+7', range: [0, 10], addend: 7 },
    { familyName: 'plus8', displayName: '+8', range: [0, 10], addend: 8 },
    { familyName: 'plus9', displayName: '+9', range: [0, 10], addend: 9 },
    { familyName: 'make10', displayName: 'Make 10', range: [1, 9], special: 'make10' },
    { familyName: 'teens', displayName: 'Teens', range: [10, 19], special: 'teens' }
  ],
  subtraction: [
    { familyName: 'minus0', displayName: '-0', range: [0, 10], subtrahend: 0 },
    { familyName: 'minus1', displayName: '-1', range: [1, 10], subtrahend: 1 },
    { familyName: 'minus2', displayName: '-2', range: [2, 10], subtrahend: 2 },
    { familyName: 'minus10', displayName: '-10', range: [10, 20], subtrahend: 10 },
    { familyName: 'minus3', displayName: '-3', range: [3, 10], subtrahend: 3 },
    { familyName: 'minus4', displayName: '-4', range: [4, 10], subtrahend: 4 },
    { familyName: 'minus5', displayName: '-5', range: [5, 10], subtrahend: 5 },
    { familyName: 'minus6', displayName: '-6', range: [6, 10], subtrahend: 6 },
    { familyName: 'minus7', displayName: '-7', range: [7, 10], subtrahend: 7 },
    { familyName: 'minus8', displayName: '-8', range: [8, 10], subtrahend: 8 },
    { familyName: 'minus9', displayName: '-9', range: [9, 10], subtrahend: 9 }
  ],
  multiplication: [
    { familyName: 'times0', displayName: '×0', range: [0, 12], factor: 0 },
    { familyName: 'times1', displayName: '×1', range: [0, 12], factor: 1 },
    { familyName: 'times2', displayName: '×2', range: [0, 12], factor: 2 },
    { familyName: 'times5', displayName: '×5', range: [0, 12], factor: 5 },
    { familyName: 'times10', displayName: '×10', range: [0, 12], factor: 10 },
    { familyName: 'squares', displayName: 'Squares', range: [0, 12], special: 'squares' },
    { familyName: 'times3', displayName: '×3', range: [0, 12], factor: 3 },
    { familyName: 'times4', displayName: '×4', range: [0, 12], factor: 4 },
    { familyName: 'times6', displayName: '×6', range: [0, 12], factor: 6 },
    { familyName: 'times9', displayName: '×9', range: [0, 12], factor: 9 },
    { familyName: 'times7', displayName: '×7', range: [0, 12], factor: 7 },
    { familyName: 'times8', displayName: '×8', range: [0, 12], factor: 8 },
    { familyName: 'times11', displayName: '×11', range: [0, 12], factor: 11 },
    { familyName: 'times12', displayName: '×12', range: [0, 12], factor: 12 }
  ],
  division: [
    { familyName: 'divby1', displayName: '÷1', range: [0, 12], divisor: 1 },
    { familyName: 'divby2', displayName: '÷2', range: [0, 12], divisor: 2 },
    { familyName: 'divby5', displayName: '÷5', range: [0, 12], divisor: 5 },
    { familyName: 'divby10', displayName: '÷10', range: [0, 12], divisor: 10 },
    { familyName: 'divby3', displayName: '÷3', range: [0, 12], divisor: 3 },
    { familyName: 'divby4', displayName: '÷4', range: [0, 12], divisor: 4 },
    { familyName: 'divby6', displayName: '÷6', range: [0, 12], divisor: 6 },
    { familyName: 'divby9', displayName: '÷9', range: [0, 12], divisor: 9 },
    { familyName: 'divby7', displayName: '÷7', range: [0, 12], divisor: 7 },
    { familyName: 'divby8', displayName: '÷8', range: [0, 12], divisor: 8 },
    { familyName: 'divby11', displayName: '÷11', range: [0, 12], divisor: 11 },
    { familyName: 'divby12', displayName: '÷12', range: [0, 12], divisor: 12 }
  ]
};

// Mastery criteria (Morningside standards)
const MASTERY_CRITERIA = {
  minAccuracy: 95,       // 95% accuracy required
  minRateElementary: 40, // 40 digits correct per minute (grades K-5)
  minRateMiddle: 50,     // 50 digits correct per minute (grades 6-8)
  minRateHigh: 60        // 60 digits correct per minute (grades 9+)
};

// Generate problems for a specific fact family
function generateProblems(operation, familyConfig, count = 20) {
  const problems = [];
  const { familyName, range, addend, subtrahend, factor, divisor, special } = familyConfig;

  for (let i = 0; i < count; i++) {
    let num1, num2, answer, problem;

    if (special === 'doubles') {
      // Doubles: 1+1, 2+2, 3+3, etc.
      num1 = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
      num2 = num1;
      answer = num1 + num2;
      problem = `${num1} + ${num2}`;
    } else if (special === 'make10') {
      // Make 10: pairs that sum to 10 (1+9, 2+8, etc.)
      num1 = Math.floor(Math.random() * 9) + 1;
      num2 = 10 - num1;
      answer = 10;
      problem = `${num1} + ${num2}`;
    } else if (special === 'teens') {
      // Teens: 10+1 through 10+9
      num1 = 10;
      num2 = Math.floor(Math.random() * 9) + 1;
      answer = num1 + num2;
      problem = `${num1} + ${num2}`;
    } else if (special === 'squares') {
      // Squares: 1×1, 2×2, 3×3, etc.
      num1 = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
      num2 = num1;
      answer = num1 * num2;
      problem = `${num1} × ${num2}`;
    } else if (operation === 'addition') {
      num1 = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
      num2 = addend;
      // Randomize order
      if (Math.random() > 0.5) [num1, num2] = [num2, num1];
      answer = num1 + num2;
      problem = `${num1} + ${num2}`;
    } else if (operation === 'subtraction') {
      num1 = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
      num2 = subtrahend;
      answer = num1 - num2;
      problem = `${num1} - ${num2}`;
    } else if (operation === 'multiplication') {
      num1 = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
      num2 = factor;
      // Randomize order
      if (Math.random() > 0.5) [num1, num2] = [num2, num1];
      answer = num1 * num2;
      problem = `${num1} × ${num2}`;
    } else if (operation === 'division') {
      num2 = divisor;
      num1 = num2 * (Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0]);
      answer = num1 / num2;
      problem = `${num1} ÷ ${num2}`;
    }

    problems.push({ problem, answer });
  }

  return problems;
}

// GET /api/fact-fluency/families - Get all fact families
router.get('/families', async (req, res) => {
  try {
    res.json({ success: true, families: FACT_FAMILIES });
  } catch (error) {
    console.error('Error fetching fact families:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/fact-fluency/progress - Get user's fact fluency progress
router.get('/progress', async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const progress = user.factFluencyProgress || {
      placement: { completed: false },
      factFamilies: new Map(),
      stats: {
        totalSessions: 0,
        totalProblemsAttempted: 0,
        totalProblemsCorrect: 0,
        currentStreak: 0,
        longestStreak: 0
      }
    };

    // Convert Map to object for JSON serialization
    const progressObj = {
      ...progress,
      factFamilies: Object.fromEntries(progress.factFamilies || new Map())
    };

    res.json({ success: true, progress: progressObj });
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/fact-fluency/placement - Complete placement test
router.post('/placement', async (req, res) => {
  try {
    const { results } = req.body; // Array of {operation, rate, accuracy}
    const user = await User.findById(req.session.userId);

    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    // Initialize factFluencyProgress if it doesn't exist
    if (!user.factFluencyProgress) {
      user.factFluencyProgress = {
        placement: {},
        factFamilies: new Map(),
        stats: {
          totalSessions: 0,
          totalProblemsAttempted: 0,
          totalProblemsCorrect: 0,
          currentStreak: 0,
          longestStreak: 0
        }
      };
    }

    // Determine recommended starting point (lowest performing operation)
    const lowestPerformance = results.reduce((lowest, current) =>
      (current.rate < lowest.rate) ? current : lowest
    );

    // Determine mastery criteria based on grade level
    let targetRate = MASTERY_CRITERIA.minRateElementary;
    if (user.gradeLevel) {
      const grade = parseInt(user.gradeLevel);
      if (grade >= 9) targetRate = MASTERY_CRITERIA.minRateHigh;
      else if (grade >= 6) targetRate = MASTERY_CRITERIA.minRateMiddle;
    }

    // For each operation in placement results, mark families as mastered based on performance
    results.forEach(result => {
      const { operation, rate, accuracy } = result;
      const families = FACT_FAMILIES[operation];

      // Determine how many families to mark as mastered based on placement performance
      let startingFamilyIndex = 0;

      if (accuracy >= MASTERY_CRITERIA.minAccuracy && rate >= targetRate) {
        // Excellent performance - skip first 60% of families
        startingFamilyIndex = Math.floor(families.length * 0.6);
      } else if (accuracy >= MASTERY_CRITERIA.minAccuracy && rate >= targetRate * 0.75) {
        // Good performance - skip first 40% of families
        startingFamilyIndex = Math.floor(families.length * 0.4);
      } else if (accuracy >= 85 && rate >= targetRate * 0.5) {
        // Fair performance - skip first 20% of families
        startingFamilyIndex = Math.floor(families.length * 0.2);
      }
      // Otherwise start at 0 (first family)

      // Mark all families before starting point as "screened out" mastery
      for (let i = 0; i < startingFamilyIndex; i++) {
        const family = families[i];
        const familyKey = `${operation}-${family.familyName}`;

        user.factFluencyProgress.factFamilies.set(familyKey, {
          operation,
          familyName: family.familyName,
          displayName: family.displayName,
          mastered: true,
          masteredDate: new Date(),
          screenedOut: true, // Flag to indicate this was earned via placement, not practice
          bestRate: rate,
          bestAccuracy: accuracy,
          attempts: 0,
          sessions: []
        });
      }
    });

    // Set recommended starting point for lowest performing operation
    const lowestOpFamilies = FACT_FAMILIES[lowestPerformance.operation];
    let recommendedFamilyIndex = 0;

    if (lowestPerformance.accuracy >= MASTERY_CRITERIA.minAccuracy && lowestPerformance.rate >= targetRate) {
      recommendedFamilyIndex = Math.floor(lowestOpFamilies.length * 0.6);
    } else if (lowestPerformance.accuracy >= MASTERY_CRITERIA.minAccuracy && lowestPerformance.rate >= targetRate * 0.75) {
      recommendedFamilyIndex = Math.floor(lowestOpFamilies.length * 0.4);
    } else if (lowestPerformance.accuracy >= 85 && lowestPerformance.rate >= targetRate * 0.5) {
      recommendedFamilyIndex = Math.floor(lowestOpFamilies.length * 0.2);
    }

    user.factFluencyProgress.placement = {
      completed: true,
      completedDate: new Date(),
      recommendedOperation: lowestPerformance.operation,
      recommendedLevel: lowestOpFamilies[recommendedFamilyIndex].familyName,
      placementResults: results
    };

    await user.save();

    res.json({
      success: true,
      recommendedOperation: lowestPerformance.operation,
      recommendedLevel: FACT_FAMILIES[lowestPerformance.operation][0].familyName
    });
  } catch (error) {
    console.error('Error saving placement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/fact-fluency/generate-problems - Generate practice problems
router.post('/generate-problems', async (req, res) => {
  try {
    const { operation, familyName, count = 20 } = req.body;

    const familyConfig = FACT_FAMILIES[operation]?.find(f => f.familyName === familyName);
    if (!familyConfig) {
      return res.status(400).json({ success: false, error: 'Invalid fact family' });
    }

    const problems = generateProblems(operation, familyConfig, count);

    res.json({ success: true, problems });
  } catch (error) {
    console.error('Error generating problems:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/fact-fluency/record-session - Record practice session results
router.post('/record-session', async (req, res) => {
  try {
    const { operation, familyName, displayName, durationSeconds, problemsAttempted, problemsCorrect } = req.body;
    const user = await User.findById(req.session.userId);

    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    // Initialize if needed
    if (!user.factFluencyProgress) {
      user.factFluencyProgress = {
        placement: { completed: false },
        factFamilies: new Map(),
        stats: {
          totalSessions: 0,
          totalProblemsAttempted: 0,
          totalProblemsCorrect: 0,
          currentStreak: 0,
          longestStreak: 0
        }
      };
    }

    // Calculate performance metrics
    const accuracy = Math.round((problemsCorrect / problemsAttempted) * 100);
    const rate = Math.round((problemsCorrect / durationSeconds) * 60); // Digits per minute

    // Determine mastery criteria based on grade level
    let targetRate = MASTERY_CRITERIA.minRateElementary;
    if (user.gradeLevel) {
      const grade = parseInt(user.gradeLevel);
      if (grade >= 9) targetRate = MASTERY_CRITERIA.minRateHigh;
      else if (grade >= 6) targetRate = MASTERY_CRITERIA.minRateMiddle;
    }

    // Check if mastery achieved this session
    const masteryAchieved = accuracy >= MASTERY_CRITERIA.minAccuracy && rate >= targetRate;

    // Get or create fact family record
    const familyKey = `${operation}-${familyName}`;
    let familyData = user.factFluencyProgress.factFamilies.get(familyKey) || {
      operation,
      familyName,
      displayName,
      mastered: false,
      bestRate: 0,
      bestAccuracy: 0,
      attempts: 0,
      sessions: []
    };

    // Update family data
    familyData.attempts += 1;
    familyData.lastPracticed = new Date();
    if (rate > (familyData.bestRate || 0)) familyData.bestRate = rate;
    if (accuracy > (familyData.bestAccuracy || 0)) familyData.bestAccuracy = accuracy;

    if (masteryAchieved && !familyData.mastered) {
      familyData.mastered = true;
      familyData.masteredDate = new Date();
    }

    // Add session to history (keep last 10)
    familyData.sessions.push({
      date: new Date(),
      durationSeconds,
      problemsAttempted,
      problemsCorrect,
      rate,
      accuracy,
      masteryAchieved
    });
    if (familyData.sessions.length > 10) {
      familyData.sessions = familyData.sessions.slice(-10);
    }

    user.factFluencyProgress.factFamilies.set(familyKey, familyData);

    // Update overall stats
    user.factFluencyProgress.stats.totalSessions += 1;
    user.factFluencyProgress.stats.totalProblemsAttempted += problemsAttempted;
    user.factFluencyProgress.stats.totalProblemsCorrect += problemsCorrect;
    user.factFluencyProgress.stats.overallAccuracy = Math.round(
      (user.factFluencyProgress.stats.totalProblemsCorrect / user.factFluencyProgress.stats.totalProblemsAttempted) * 100
    );

    // Update streak
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastPractice = user.factFluencyProgress.stats.lastPracticeDate
      ? new Date(user.factFluencyProgress.stats.lastPracticeDate)
      : null;

    if (lastPractice) {
      lastPractice.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((today - lastPractice) / (1000 * 60 * 60 * 24));

      if (daysDiff === 0) {
        // Same day, no change to streak
      } else if (daysDiff === 1) {
        // Consecutive day, increment streak
        user.factFluencyProgress.stats.currentStreak += 1;
      } else {
        // Streak broken, reset to 1
        user.factFluencyProgress.stats.currentStreak = 1;
      }
    } else {
      // First practice ever
      user.factFluencyProgress.stats.currentStreak = 1;
    }

    user.factFluencyProgress.stats.lastPracticeDate = new Date();

    // Update longest streak
    if (user.factFluencyProgress.stats.currentStreak > user.factFluencyProgress.stats.longestStreak) {
      user.factFluencyProgress.stats.longestStreak = user.factFluencyProgress.stats.currentStreak;
    }

    await user.save();

    res.json({
      success: true,
      masteryAchieved,
      rate,
      accuracy,
      familyData: {
        ...familyData,
        sessions: familyData.sessions.map(s => ({...s})) // Convert to plain objects
      }
    });
  } catch (error) {
    console.error('Error recording session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/fact-fluency/next-level - Get recommended next level
router.get('/next-level', async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const progress = user.factFluencyProgress;
    if (!progress || !progress.placement.completed) {
      return res.json({
        success: true,
        needsPlacement: true
      });
    }

    // Find first non-mastered fact family in recommended operation
    const operation = progress.placement.recommendedOperation;
    const families = FACT_FAMILIES[operation];

    for (const family of families) {
      const familyKey = `${operation}-${family.familyName}`;
      const familyData = progress.factFamilies.get(familyKey);

      if (!familyData || !familyData.mastered) {
        return res.json({
          success: true,
          nextLevel: {
            operation,
            familyName: family.familyName,
            displayName: family.displayName
          }
        });
      }
    }

    // All families mastered in this operation
    res.json({
      success: true,
      allMastered: true,
      operation
    });
  } catch (error) {
    console.error('Error getting next level:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
