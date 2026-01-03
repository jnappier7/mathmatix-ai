// routes/factFluency.js - API routes for M∆THBL∆ST Fact Fluency game

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
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

// Generate trap answers (distractors) for multiple choice
function generateTrapAnswers(operation, num1, num2, correctAnswer, count = 3, missingNumberType = null) {
  const traps = new Set();
  const MAX_ATTEMPTS = 100;  // Prevent infinite loops
  let attempts = 0;

  while (traps.size < count && attempts < MAX_ATTEMPTS) {
    attempts++;
    let trap;
    const trapType = Math.floor(Math.random() * 5);

    // For missing number problems, use different trap strategies
    if (missingNumberType && missingNumberType !== 'sum' && missingNumberType !== 'difference' &&
        missingNumberType !== 'product' && missingNumberType !== 'quotient') {
      // Missing operand (not missing answer)
      switch(trapType) {
        case 0: trap = correctAnswer + 1; break; // Off by one
        case 1: trap = correctAnswer - 1; break; // Off by one
        case 2: trap = correctAnswer * 2; break; // Doubled the answer
        case 3: trap = Math.max(1, correctAnswer - 2); break; // Off by two
        case 4: trap = correctAnswer + Math.floor(Math.random() * 3) + 2; break; // Random nearby
        default: trap = correctAnswer + Math.floor(Math.random() * 5) + 1;
      }
    } else {
      // Standard problems or answer-missing problems (use original logic)
      if (operation === 'addition') {
        switch(trapType) {
          case 0: trap = correctAnswer + 1; break; // Off by one
          case 1: trap = correctAnswer - 1; break; // Off by one
          case 2: trap = num1 - num2; break; // Wrong operation (subtraction)
          case 3: trap = num1 * num2; break; // Wrong operation (multiplication)
          case 4: trap = Math.abs(num1 - num2); break; // Absolute difference
          default: trap = correctAnswer + Math.floor(Math.random() * 5) + 1;
        }
      } else if (operation === 'subtraction') {
        switch(trapType) {
          case 0: trap = correctAnswer + 1; break; // Off by one
          case 1: trap = correctAnswer - 1; break; // Off by one
          case 2: trap = num1 + num2; break; // Wrong operation (addition)
          case 3: trap = num2 - num1; break; // Reversed operands
          case 4: trap = -(num1 - num2); break; // Sign error
          default: trap = correctAnswer + Math.floor(Math.random() * 5) + 1;
        }
      } else if (operation === 'multiplication') {
        switch(trapType) {
          case 0: trap = correctAnswer + num1; break; // Added instead of multiplied
          case 1: trap = correctAnswer + num2; break; // Added instead of multiplied
          case 2: trap = num1 + num2; break; // Wrong operation
          case 3: trap = correctAnswer + 1; break; // Off by one
          case 4: trap = correctAnswer - num2; break; // Common mistake
          default: trap = correctAnswer + Math.floor(Math.random() * 10) + 1;
        }
      } else if (operation === 'division') {
        switch(trapType) {
          case 0: trap = correctAnswer + 1; break; // Off by one
          case 1: trap = correctAnswer - 1; break; // Off by one
          case 2: trap = num1 - num2; break; // Subtracted instead
          case 3: trap = num1; break; // Forgot to divide
          case 4: trap = num2; break; // Used divisor
          default: trap = correctAnswer + Math.floor(Math.random() * 5) + 1;
        }
      }
    }

    // Ensure trap is positive, different from correct answer, and reasonable
    if (trap > 0 && trap !== correctAnswer && trap < 200 && !traps.has(trap)) {
      traps.add(trap);
    }
  }

  // SAFETY NET: If we still don't have enough traps (edge cases like 0×0),
  // fill with simple sequential offsets
  let fallbackOffset = 1;
  while (traps.size < count) {
    const fallbackTrap = Math.max(1, Math.abs(correctAnswer) + fallbackOffset);
    if (fallbackTrap !== correctAnswer && !traps.has(fallbackTrap) && fallbackTrap < 200) {
      traps.add(fallbackTrap);
    }
    fallbackOffset++;

    // Absolute safety: if we've tried 50 offsets, just break
    if (fallbackOffset > 50) break;
  }

  return Array.from(traps);
}

// Generate problems for a specific fact family
function generateProblems(operation, familyConfig, count = 20, includeTraps = false) {
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

    // Randomly create missing number problems (30% chance)
    let missingNumberType = null;
    if (Math.random() < 0.3) {
      const position = Math.floor(Math.random() * 3); // 0 = first number, 1 = second number, 2 = answer missing

      if (operation === 'addition') {
        if (position === 0) {
          problem = `___ + ${num2} = ${answer}`;
          missingNumberType = 'addend1';
          answer = num1; // The missing number is num1
        } else if (position === 1) {
          problem = `${num1} + ___ = ${answer}`;
          missingNumberType = 'addend2';
          answer = num2; // The missing number is num2
        } else {
          problem = `${num1} + ${num2} = ___`;
          missingNumberType = 'sum';
          // answer stays as original answer
        }
      } else if (operation === 'subtraction') {
        if (position === 0) {
          problem = `___ - ${num2} = ${answer}`;
          missingNumberType = 'minuend';
          answer = num1; // The missing number is num1
        } else if (position === 1) {
          problem = `${num1} - ___ = ${answer}`;
          missingNumberType = 'subtrahend';
          answer = num2; // The missing number is num2
        } else {
          problem = `${num1} - ${num2} = ___`;
          missingNumberType = 'difference';
          // answer stays as original answer
        }
      } else if (operation === 'multiplication') {
        if (position === 0) {
          problem = `___ × ${num2} = ${answer}`;
          missingNumberType = 'factor1';
          answer = num1; // The missing number is num1
        } else if (position === 1) {
          problem = `${num1} × ___ = ${answer}`;
          missingNumberType = 'factor2';
          answer = num2; // The missing number is num2
        } else {
          problem = `${num1} × ${num2} = ___`;
          missingNumberType = 'product';
          // answer stays as original answer
        }
      } else if (operation === 'division') {
        if (position === 0) {
          problem = `___ ÷ ${num2} = ${answer}`;
          missingNumberType = 'dividend';
          answer = num1; // The missing number is num1
        } else if (position === 1) {
          problem = `${num1} ÷ ___ = ${answer}`;
          missingNumberType = 'divisor';
          answer = num2; // The missing number is num2
        } else {
          problem = `${num1} ÷ ${num2} = ___`;
          missingNumberType = 'quotient';
          // answer stays as original answer
        }
      }
    }

    const problemData = { problem, answer, missingNumberType };

    // Generate trap answers if requested (for shooter mode)
    if (includeTraps) {
      problemData.trapAnswers = generateTrapAnswers(operation, num1, num2, answer, 3, missingNumberType);
    }

    problems.push(problemData);
  }

  return problems;
}

// Generate MIXED problems from ALL families for an operation (for placement tests)
function generateMixedProblems(operation, count = 100, includeTraps = false) {
  const problems = [];
  const families = FACT_FAMILIES[operation];

  if (!families || families.length === 0) return problems;

  // Generate equal number of problems from each family
  const problemsPerFamily = Math.ceil(count / families.length);

  families.forEach(family => {
    const familyProblems = generateProblems(operation, family, problemsPerFamily, includeTraps);
    problems.push(...familyProblems);
  });

  // Shuffle the problems to mix them up
  for (let i = problems.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [problems[i], problems[j]] = [problems[j], problems[i]];
  }

  // Return exactly the requested count
  return problems.slice(0, count);
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
router.get('/progress', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
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
router.post('/placement', isAuthenticated, async (req, res) => {
  try {
    const { results } = req.body; // Array of {operation, rate, accuracy, medianResponseTime, avgResponseTime}
    const user = await User.findById(req.user._id);

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
      const { operation, rate, accuracy, medianResponseTime } = result;
      const families = FACT_FAMILIES[operation];

      // Determine how many families to mark as mastered based on placement performance
      // MORNINGSIDE STANDARDS: Require accuracy + fluency (measured by BOTH rate AND response time)
      let startingFamilyIndex = 0;

      // Calculate fluency from median response time (< 2000ms = fluent, < 3000ms = developing)
      const isFluent = medianResponseTime && medianResponseTime < 2000;  // < 2 seconds per problem
      const isDeveloping = medianResponseTime && medianResponseTime < 3000;  // < 3 seconds per problem

      console.log(`[Placement] ${operation}: ${accuracy}% accuracy, ${rate}/min rate, median: ${medianResponseTime}ms ${isFluent ? '(FLUENT)' : isDeveloping ? '(DEVELOPING)' : '(SLOW)'}`);

      if (accuracy >= MASTERY_CRITERIA.minAccuracy && rate >= targetRate && isFluent) {
        // Excellent: High accuracy + rate + fast individual responses = TRUE mastery
        startingFamilyIndex = Math.floor(families.length * 0.6);
      } else if (accuracy >= MASTERY_CRITERIA.minAccuracy && rate >= targetRate * 0.75 && isFluent) {
        // Good: High accuracy + decent rate + fast responses
        startingFamilyIndex = Math.floor(families.length * 0.4);
      } else if (accuracy >= MASTERY_CRITERIA.minAccuracy && rate >= targetRate * 0.75 && isDeveloping) {
        // Fair: High accuracy + decent rate + moderate speed
        startingFamilyIndex = Math.floor(families.length * 0.3);
      } else if (accuracy >= 85 && rate >= targetRate * 0.5) {
        // Basic: Decent accuracy + rate (regardless of response time)
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

    // Use same fluency criteria as above
    const lowestIsFluent = lowestPerformance.medianResponseTime && lowestPerformance.medianResponseTime < 2000;
    const lowestIsDeveloping = lowestPerformance.medianResponseTime && lowestPerformance.medianResponseTime < 3000;

    if (lowestPerformance.accuracy >= MASTERY_CRITERIA.minAccuracy && lowestPerformance.rate >= targetRate && lowestIsFluent) {
      recommendedFamilyIndex = Math.floor(lowestOpFamilies.length * 0.6);
    } else if (lowestPerformance.accuracy >= MASTERY_CRITERIA.minAccuracy && lowestPerformance.rate >= targetRate * 0.75 && lowestIsFluent) {
      recommendedFamilyIndex = Math.floor(lowestOpFamilies.length * 0.4);
    } else if (lowestPerformance.accuracy >= MASTERY_CRITERIA.minAccuracy && lowestPerformance.rate >= targetRate * 0.75 && lowestIsDeveloping) {
      recommendedFamilyIndex = Math.floor(lowestOpFamilies.length * 0.3);
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
  const startTime = Date.now();
  try {
    const { operation, familyName, count = 20, mixed = false, includeTraps = false } = req.body;
    console.log(`[generate-problems] Request: operation=${operation}, familyName=${familyName}, count=${count}, mixed=${mixed}, includeTraps=${includeTraps}`);

    let problems;

    if (mixed) {
      // Generate mixed problems from ALL families for this operation (placement test)
      if (!FACT_FAMILIES[operation]) {
        console.log(`[generate-problems] Invalid operation: ${operation}`);
        return res.status(400).json({ success: false, error: 'Invalid operation' });
      }
      console.log(`[generate-problems] Generating mixed problems for ${operation}`);
      problems = generateMixedProblems(operation, count, includeTraps);
    } else {
      // Generate problems for a specific family (practice mode)
      const familyConfig = FACT_FAMILIES[operation]?.find(f => f.familyName === familyName);
      if (!familyConfig) {
        console.log(`[generate-problems] Invalid family: ${operation}/${familyName}`);
        return res.status(400).json({ success: false, error: 'Invalid fact family' });
      }
      console.log(`[generate-problems] Generating problems for ${operation}/${familyName}`);
      problems = generateProblems(operation, familyConfig, count, includeTraps);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[generate-problems] Generated ${problems?.length || 0} problems in ${elapsed}ms`);
    res.json({ success: true, problems });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[generate-problems] Error after ${elapsed}ms:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/fact-fluency/record-session - Record practice session results
router.post('/record-session', isAuthenticated, async (req, res) => {
  try {
    const { operation, familyName, displayName, durationSeconds, problemsAttempted, problemsCorrect, medianResponseTime, avgResponseTime } = req.body;
    const user = await User.findById(req.user._id);

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

    // Check if mastery achieved this session (accuracy + rate + fluency)
    const isFluent = medianResponseTime && medianResponseTime < 2000;  // < 2 seconds per problem
    const masteryAchieved = accuracy >= MASTERY_CRITERIA.minAccuracy && rate >= targetRate && isFluent;

    console.log(`[Practice] ${operation}-${familyName}: ${accuracy}%, ${rate}/min, median: ${medianResponseTime}ms ${isFluent ? '(FLUENT)' : '(NEEDS PRACTICE)'} → Mastery: ${masteryAchieved}`);

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
      masteryAchieved,
      medianResponseTime,  // Individual response time (ms)
      avgResponseTime      // Average response time (ms)
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
router.get('/next-level', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
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
