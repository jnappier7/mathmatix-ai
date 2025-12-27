/**
 * ADAPTIVE SCREENER API
 *
 * Endpoints for CAT (Computerized Adaptive Testing) placement system.
 *
 * FLOW:
 * 1. POST /start → Initialize session
 * 2. GET /next-problem → Get next adaptive problem
 * 3. POST /submit-answer → Submit answer, get next recommendation
 * 4. GET /report → Get final placement report
 *
 * @route /api/screener
 */

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const Problem = require('../models/problem');
const Skill = require('../models/skill');
const ScreenerSession = require('../models/screenerSession'); // CTO REVIEW FIX: Persistent session storage
const { initializeSession, processResponse, generateReport, identifyInterviewSkills, calculateJumpSize } = require('../utils/adaptiveScreener');
const { generateProblem } = require('../utils/problemGenerator');
const { awardBadgesForSkills } = require('../utils/badgeAwarder');

/**
 * CTO REVIEW FIX: LRU (Least Recently Used) Strategy for Problem Exclusion
 *
 * PROBLEM: Using $nin with all historical problemIds causes O(N) database queries
 * as students answer 1000+ problems over a school year.
 *
 * SOLUTION: Only exclude the LAST 100 problems (LRU window). This:
 * - Prevents immediate repeats (boring for students)
 * - Keeps database query size bounded to O(1) constant
 * - Allows old problems to resurface for spaced repetition (pedagogically sound)
 */
const LRU_EXCLUSION_WINDOW = 100;

/**
 * POST /api/screener/start
 * Initialize a new adaptive screener session
 */
router.post('/start', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Initialize learningProfile if it doesn't exist
    if (!user.learningProfile) {
      user.learningProfile = {
        assessmentCompleted: false,
        abilityEstimate: {},
        skillMastery: new Map()
      };
      await user.save();
    }

    // Check if assessment already completed
    if (user.learningProfile.assessmentCompleted) {
      return res.status(403).json({
        error: 'Assessment already completed',
        alreadyCompleted: true,
        message: 'You have already completed your placement assessment. Your results are saved and being used to personalize your learning experience.',
        completedDate: user.learningProfile.assessmentDate,
        theta: user.learningProfile.initialPlacement,
        canReset: false  // Only teachers can reset via dashboard
      });
    }

    // Initialize screener session
    const sessionData = initializeSession({
      userId: user._id.toString(),
      startingTheta: 0  // Start at average ability
    });

    // CTO REVIEW FIX: Store session in database (prevents data loss on restart)
    const session = new ScreenerSession({
      ...sessionData,
      userId: user._id // Convert to ObjectId
    });
    await session.save();

    res.json({
      sessionId: session.sessionId,
      message: "Let's find your level! Answer these problems as best you can.",
      started: true
    });

  } catch (error) {
    console.error('[Screener Start] Error starting screener:', error);
    console.error('[Screener Start] Error stack:', error.stack);
    console.error('[Screener Start] User ID:', req.user?._id);
    res.status(500).json({
      error: 'Failed to start screener',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/screener/next-problem
 * Get the next adaptive problem
 */
router.get('/next-problem', isAuthenticated, async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    // CTO REVIEW FIX: Retrieve session from database
    const session = await ScreenerSession.findBySessionId(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    // Determine target difficulty using DAMPENED JUMPS (not raw theta!)
    let targetDifficulty;
    if (session.questionCount === 0) {
      // First question: medium difficulty
      targetDifficulty = 0;
    } else {
      // Get last response to determine jump direction
      const lastResponse = session.responses[session.responses.length - 1];
      const lastDifficulty = lastResponse.difficulty;
      const wasCorrect = lastResponse.correct;

      // Calculate dampened jump size based on correctness, question count, and SE
      const jumpSize = calculateJumpSize(wasCorrect, session.questionCount, session.standardError);

      // Apply jump to previous difficulty (not raw theta!)
      targetDifficulty = lastDifficulty + jumpSize;

      // Bound jumps to reasonable range to prevent wild swings
      // Allow theta to influence bounds, but don't jump to theta directly
      const lowerBound = Math.min(session.theta - 1.0, lastDifficulty - 1.5);
      const upperBound = Math.max(session.theta + 1.0, lastDifficulty + 1.5);
      targetDifficulty = Math.max(lowerBound, Math.min(upperBound, targetDifficulty));

      console.log(`[Screener Jump] Q${session.questionCount}: ${wasCorrect ? 'CORRECT' : 'INCORRECT'} at d=${lastDifficulty.toFixed(2)} → jump ${jumpSize.toFixed(2)} → target ${targetDifficulty.toFixed(2)} (θ=${session.theta.toFixed(2)}, SE=${session.standardError.toFixed(2)})`);
    }

    // ADAPTIVE SKILL SELECTION - Use FULL curriculum from database (not hardcoded!)
    // Query all skills from database with estimated difficulty ranges
    const allSkills = await Skill.find({}).select('skillId name category irtDifficulty').lean();

    console.log(`[DEBUG] Queried ${allSkills.length} skills from database`);

    // Map specific skill categories to broad categories for diversity tracking
    const categoryToBroadCategory = (category) => {
      // Number operations (Elementary K-5)
      if (['counting-cardinality', 'number-recognition', 'addition-subtraction', 'multiplication-division',
           'place-value', 'arrays', 'decimals', 'fractions', 'number-system', 'operations'].includes(category)) {
        return 'number-operations';
      }
      // Algebra (Middle School through High School)
      if (['integers-rationals', 'scientific-notation', 'ratios-proportions', 'percent',
           'expressions', 'equations', 'linear-equations', 'systems', 'inequalities',
           'polynomials', 'factoring', 'quadratics', 'radicals', 'rational-expressions',
           'complex-numbers', 'exponentials-logarithms', 'sequences-series', 'conics',
           'functions', 'graphing', 'coordinate-plane'].includes(category)) {
        return 'algebra';
      }
      // Geometry
      if (['shapes-geometry', 'measurement', 'area-perimeter', 'volume', 'angles',
           'pythagorean-theorem', 'transformations', 'geometry', 'trigonometry',
           'identities', 'polar-coordinates', 'vectors', 'matrices'].includes(category)) {
        return 'geometry';
      }
      // Advanced (Calculus, Statistics, etc.)
      if (['limits', 'derivatives', 'integration', 'series-tests', 'taylor-series',
           'parametric-polar', 'differential-equations', 'multivariable', 'vector-calculus',
           'statistics', 'probability', 'advanced'].includes(category)) {
        return 'advanced';
      }
      // Default
      return 'number-operations';
    };

    // If no IRT difficulty in database, use category-based estimates
    const categoryDifficultyMap = {
      // Elementary (K-5)
      'counting-cardinality': -2.5,
      'number-recognition': -2.3,
      'addition-subtraction': -2.0,
      'place-value': -1.8,
      'multiplication-division': -1.5,
      'fractions-basics': -1.2,
      'decimals-basics': -1.0,
      'measurement': -0.8,

      // Middle School (6-8)
      'integers-rationals': -0.5,
      'proportional-reasoning': -0.3,
      'percent-applications': 0.0,
      'integer-operations': -0.4,
      'integer-addition': -0.6,
      'integer-subtraction': -0.5,
      'integer-multiplication': -0.2,
      'integer-division': 0.0,
      'integer-all-operations': 0.2,
      'expressions-equations': 0.3,
      'solving-equations': 0.5,
      'one-step-equations-addition': 0.0,
      'one-step-equations-multiplication': 0.5,
      'two-step-equations': 1.0,
      'multi-step-equations': 1.5,
      'inequalities': 0.8,
      'scientific-notation': 0.6,
      'pythagorean-theorem': 0.7,
      'geometry-basics': -0.6,

      // High School Algebra
      'linear-equations': 1.0,
      'systems-equations': 1.5,
      'quadratics': 1.8,
      'polynomials': 1.6,
      'rational-expressions': 2.0,
      'exponentials-logs': 2.2,
      'functions': 1.4,
      'graphing': 1.2,

      // Advanced
      'trigonometry': 2.5,
      'precalculus': 2.8,
      'limits': 3.0,
      'derivatives': 3.2,
      'integration': 3.5,
      'series': 3.8
    };

    // Build candidate skills with estimated difficulties
    let candidateSkills = [];
    for (const skill of allSkills) {
      // Use IRT difficulty if available, otherwise category estimate
      const estimatedDifficulty = skill.irtDifficulty || categoryDifficultyMap[skill.category] || 0;

      // Count how many times this skill has been tested
      const testCount = session.testedSkills.filter(s => s === skill.skillId).length;

      // Calculate recency penalty (skills tested recently should be heavily penalized)
      let recencyPenalty = 0;
      const skillIndices = session.testedSkills
        .map((s, idx) => s === skill.skillId ? idx : -1)
        .filter(idx => idx >= 0);

      if (skillIndices.length > 0) {
        // Most recent test gets highest penalty
        const mostRecentIndex = Math.max(...skillIndices);
        const questionsSinceLastTest = session.testedSkills.length - mostRecentIndex;

        // Exponential decay: recently tested skills get massive penalty
        // Just tested (1 question ago) = 50 penalty, 2 ago = 25, 3 ago = 12.5, etc.
        recencyPenalty = 50 * Math.pow(0.5, questionsSinceLastTest - 1);
      }

      // Calculate category balance penalty
      const broadCategory = categoryToBroadCategory(skill.category);
      const categoryTestCount = session.testedSkillCategories[broadCategory] || 0;
      const categoryPenalty = categoryTestCount * 5; // 5 points per category test

      // Calculate distance from target difficulty
      const difficultyDistance = Math.abs(estimatedDifficulty - targetDifficulty);

      // Scoring formula:
      // - Difficulty match is most important (10x weight)
      // - Recency penalty is severe for just-tested skills (exponential)
      // - Category balancing encourages diversity (5x per category test)
      // - Test count provides base repetition penalty (exponential: 2^testCount)
      const score = (difficultyDistance * 10) +
                    recencyPenalty +
                    categoryPenalty +
                    (Math.pow(2, testCount) - 1);  // Exponential: 0, 1, 3, 7, 15, 31...

      candidateSkills.push({
        skillId: skill.skillId,
        difficulty: estimatedDifficulty,
        category: skill.category,
        broadCategory,
        testCount,
        recencyPenalty,
        categoryPenalty,
        difficultyDistance,
        score
      });
    }

    console.log(`[DEBUG] Built ${candidateSkills.length} candidate skills`);
    console.log(`[DEBUG] Target difficulty: ${targetDifficulty.toFixed(2)}`);
    console.log(`[DEBUG] Tested skills so far: [${session.testedSkills.join(', ')}]`);
    console.log(`[DEBUG] Category counts:`, session.testedSkillCategories);

    // SKILL CLUSTERING: Group skills by difficulty bins to prevent wild jumps
    // Test 2-3 skills at similar difficulty before moving to next level
    const DIFFICULTY_BIN_SIZE = 0.7; // Skills within 0.7 difficulty are "similar level"
    const MIN_SKILLS_PER_BIN = 2;     // Test at least 2 skills before jumping

    // Determine current difficulty bin (if we've tested any skills)
    let currentBin = null;
    if (session.responses.length > 0) {
      const recentDifficulties = session.responses.slice(-3).map(r => r.difficulty);
      const avgRecentDifficulty = recentDifficulties.reduce((a, b) => a + b, 0) / recentDifficulties.length;
      currentBin = {
        center: avgRecentDifficulty,
        min: avgRecentDifficulty - DIFFICULTY_BIN_SIZE / 2,
        max: avgRecentDifficulty + DIFFICULTY_BIN_SIZE / 2
      };

      // Count how many skills we've tested in this bin
      const skillsInCurrentBin = session.responses.filter(r =>
        r.difficulty >= currentBin.min && r.difficulty <= currentBin.max
      ).length;

      console.log(`[DEBUG] Current difficulty bin: [${currentBin.min.toFixed(2)}, ${currentBin.max.toFixed(2)}], tested ${skillsInCurrentBin} skills in bin`);

      // If we've tested fewer than MIN_SKILLS_PER_BIN in current bin, prefer skills in this bin
      if (skillsInCurrentBin < MIN_SKILLS_PER_BIN) {
        const skillsInBin = candidateSkills.filter(s =>
          s.difficulty >= currentBin.min && s.difficulty <= currentBin.max && s.testCount === 0
        );

        if (skillsInBin.length > 0) {
          console.log(`[DEBUG] Clustering: Staying in current bin, ${skillsInBin.length} untested skills available`);
          candidateSkills = skillsInBin; // Focus on current difficulty level
        }
      }
    }

    // Filter out skills tested 3+ times (ensure diversity)
    const fresherSkills = candidateSkills.filter(s => s.testCount < 3);
    console.log(`[DEBUG] After filtering (testCount < 3): ${fresherSkills.length} fresher skills`);

    if (fresherSkills.length > 0) {
      candidateSkills = fresherSkills;
    }

    // Sort by score (lower is better) and pick best match
    candidateSkills.sort((a, b) => a.score - b.score);

    if (candidateSkills.length === 0) {
      console.error('[Screener] No candidate skills found! Using intelligent fallback.');

      // Fallback: Rotate through different skill categories to maintain diversity
      const fallbackSkillsByCategory = {
        'number-operations': ['addition-subtraction', 'multiplication-division', 'fractions'],
        'algebra': ['one-step-equations-addition', 'linear-equations', 'expressions'],
        'geometry': ['shapes-geometry', 'area-perimeter', 'pythagorean-theorem'],
        'advanced': ['quadratics', 'functions', 'limits']
      };

      // Find the least-tested category
      let leastTestedCategory = 'algebra'; // default
      let minCount = Infinity;
      for (const [category, count] of Object.entries(session.testedSkillCategories)) {
        if (count < minCount) {
          minCount = count;
          leastTestedCategory = category;
        }
      }

      // Pick a skill from the least-tested category
      const fallbackOptions = fallbackSkillsByCategory[leastTestedCategory] || fallbackSkillsByCategory['algebra'];
      selectedSkillId = fallbackOptions[session.questionCount % fallbackOptions.length];

      console.log(`[Screener Fallback] Using "${selectedSkillId}" from least-tested category "${leastTestedCategory}" (count=${minCount})`);
    } else {
      selectedSkillId = candidateSkills[0].skillId;
      const selected = candidateSkills[0];
      console.log(`[Screener Q${session.questionCount + 1}] Target d=${targetDifficulty.toFixed(2)} → "${selectedSkillId}" (d=${selected.difficulty.toFixed(2)}, Δ=${selected.difficultyDistance.toFixed(2)}, score=${selected.score.toFixed(1)} [diff=${(selected.difficultyDistance * 10).toFixed(1)} + recency=${selected.recencyPenalty.toFixed(1)} + cat=${selected.categoryPenalty.toFixed(1)} + tests=${(Math.pow(2, selected.testCount) - 1).toFixed(1)}])`);
    }

    // Try to find existing problem in database
    // CTO REVIEW FIX: Use LRU strategy - only exclude last N problems (not all history)
    const recentProblemIds = session.responses
      .slice(-LRU_EXCLUSION_WINDOW)  // Take only the last 100 responses
      .map(r => r.problemId);

    let problem = await Problem.findNearDifficulty(
      selectedSkillId,
      targetDifficulty,
      recentProblemIds  // Bounded array size (max 100 items) instead of O(N)
    );

    // If no problem found, generate one
    if (!problem) {
      console.log(`[Screener] No problem found in DB, generating for ${selectedSkillId} at difficulty ${targetDifficulty.toFixed(2)}`);
      const generated = generateProblem(selectedSkillId, { difficulty: targetDifficulty });

      // Optionally save to database for future use
      problem = new Problem(generated);
      await problem.save();
    }

    res.json({
      problem: {
        problemId: problem.problemId,
        content: problem.content,
        skillId: problem.skillId,
        answerType: problem.answerType,
        options: problem.options,
        correctOption: problem.correctOption,
        questionNumber: session.questionCount + 1,
        progress: {
          current: session.questionCount + 1,
          min: session.minQuestions,
          target: session.targetQuestions,
          max: session.maxQuestions,
          percentComplete: Math.round(((session.questionCount + 1) / session.targetQuestions) * 100)
        }
      }
      // DO NOT expose session theta/SE/confidence to students - teacher/admin only
    });

  } catch (error) {
    console.error('Error getting next problem:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to get next problem',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/screener/submit-answer
 * Submit answer and get next recommendation
 */
router.post('/submit-answer', isAuthenticated, async (req, res) => {
  try {
    const { sessionId, problemId, answer, responseTime } = req.body;

    if (!sessionId || !problemId || answer === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // CTO REVIEW FIX: Retrieve session from database
    const session = await ScreenerSession.findBySessionId(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get problem from database
    const problem = await Problem.findOne({ problemId });
    if (!problem) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    // Get skill to retrieve category for diversity tracking
    const skill = await Skill.findOne({ skillId: problem.skillId }).select('category').lean();
    const skillCategory = skill?.category || 'unknown';

    // DEBUG: Log problem IRT parameters to diagnose NaN issue
    console.log(`[DEBUG] Problem ${problemId} IRT params:`, {
      difficulty: problem.irtParameters?.difficulty,
      discrimination: problem.irtParameters?.discrimination,
      hasIrtParameters: !!problem.irtParameters
    });

    // Check if answer is correct
    const isCorrect = problem.checkAnswer(answer);

    // Capture previous theta for logging
    const previousTheta = session.theta;

    // Process response
    const response = {
      problemId: problem.problemId,
      skillId: problem.skillId,
      skillCategory: skillCategory,  // Pass category for diversity tracking
      difficulty: problem.irtParameters.difficulty,
      discrimination: problem.irtParameters.discrimination,
      correct: isCorrect,
      responseTime: responseTime || null,
      userAnswer: answer,
      correctAnswer: problem.answer
    };

    const result = processResponse(session, response);

    // CTO REVIEW FIX: Update session in database
    // Mark ALL modified fields including theta, standardError, confidence
    session.markModified('theta');
    session.markModified('standardError');
    session.markModified('confidence');
    session.markModified('cumulativeInformation');
    session.markModified('responses'); // Ensure nested arrays are saved
    session.markModified('testedSkills');
    session.markModified('testedSkillCategories');
    session.markModified('questionCount');
    session.markModified('converged');
    session.markModified('plateaued');
    session.markModified('frontier');
    await session.save();

    console.log(`[Screener] Q${session.questionCount} Result: ${response.correct ? 'CORRECT' : 'INCORRECT'} | Theta: ${previousTheta.toFixed(2)} → ${session.theta.toFixed(2)} (Δ${(session.theta - previousTheta).toFixed(2)}) | SE: ${session.standardError.toFixed(3)}`);

    // Determine next action
    if (result.action === 'continue') {
      // Continue screening - NO FEEDBACK TEXT (prevents negative momentum)
      // But DO send correct flag for client-side tracking
      res.json({
        nextAction: 'continue',
        correct: isCorrect,  // Track correctness without showing feedback
        progress: {
          current: session.questionCount,
          min: session.minQuestions,
          target: session.targetQuestions,
          max: session.maxQuestions,
          percentComplete: Math.round((session.questionCount / session.targetQuestions) * 100)
        }
        // DO NOT send: feedback text, theta, standardError (student shouldn't see these)
      });

    } else if (result.action === 'interview') {
      // Move to interview phase
      session.phase = 'interview';
      session.endTime = Date.now();

      // Generate report
      const report = generateReport(session.toObject()); // Convert Mongoose doc to plain object

      // Identify skills to probe
      const interviewSkills = identifyInterviewSkills(session.toObject(), []);

      res.json({
        nextAction: 'interview',
        reason: result.reason,
        message: result.message,
        report: {
          // Students see: score percentage only
          accuracy: report.accuracy,
          questionsAnswered: report.questionsAnswered
          // Teachers/admin see in separate endpoint: theta, percentile, confidence, SE
        },
        interviewSkills
      });

    } else {
      // Complete
      session.phase = 'complete';
      session.endTime = Date.now();

      const report = generateReport(session.toObject()); // Convert Mongoose doc to plain object

      res.json({
        nextAction: 'complete',
        report: {
          // Students see: final score and time only
          accuracy: report.accuracy,
          questionsAnswered: report.questionsAnswered,
          duration: report.duration
          // Teachers/admin see full report via /admin/student-detail endpoint
        }
      });
    }

  } catch (error) {
    console.error('Error submitting answer:', error);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

/**
 * GET /api/screener/report
 * Get final screener report
 */
router.get('/report', isAuthenticated, async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    // CTO REVIEW FIX: Retrieve session from database
    const session = await ScreenerSession.findBySessionId(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.phase === 'screener') {
      return res.status(400).json({ error: 'Screener not yet complete' });
    }

    const report = generateReport(session.toObject()); // Convert Mongoose doc to plain object

    res.json(report);

  } catch (error) {
    console.error('Error getting report:', error);
    res.status(500).json({ error: 'Failed to get report' });
  }
});

/**
 * POST /api/screener/complete
 * Mark screener as complete and update user profile
 */
router.post('/complete', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    // CTO REVIEW FIX: Retrieve session from database
    const session = await ScreenerSession.findBySessionId(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Initialize learningProfile if it doesn't exist
    if (!user.learningProfile) {
      user.learningProfile = {
        assessmentCompleted: false,
        abilityEstimate: {},
        skillMastery: new Map()
      };
    }

    // Generate final report
    const report = generateReport(session.toObject()); // Convert Mongoose doc to plain object

    // Update user's skill mastery based on screener results
    for (const skillId of report.masteredSkills) {
      user.skillMastery.set(skillId, {
        status: 'mastered',
        masteryScore: 1.0,
        masteredDate: new Date(),
        notes: 'Demonstrated in adaptive screener'
      });
    }

    for (const skillId of report.learningSkills) {
      user.skillMastery.set(skillId, {
        status: 'learning',
        masteryScore: 0.5,
        learningStarted: new Date(),
        notes: 'Partial mastery in screener'
      });
    }

    for (const skillId of report.readySkills) {
      user.skillMastery.set(skillId, {
        status: 'ready',
        masteryScore: 0,
        notes: 'Ready to learn based on screener'
      });
    }

    // 🎖️ AUTO-AWARD BADGES (Like ALEKS: fill in the pie with what they already know)
    const earnedBadges = await awardBadgesForSkills(
      user,
      session,
      report.masteredSkills,
      report.theta
    );

    // Add earned badges to report
    report.earnedBadges = earnedBadges;
    report.badgeCount = earnedBadges.length;

    // Mark assessment as completed
    user.learningProfile.assessmentCompleted = true;
    user.learningProfile.assessmentDate = new Date();
    user.learningProfile.initialPlacement = `Theta: ${report.theta} (${report.percentile}th percentile)`;

    // Store theta in the format expected by badge system
    user.learningProfile.abilityEstimate = {
      theta: report.theta,
      standardError: report.standardError,
      percentile: report.percentile
    };

    await user.save();

    // CTO REVIEW FIX: Mark session as complete and let TTL index auto-delete after 24h
    session.phase = 'complete';
    session.endTime = new Date();
    await session.save();

    res.json({
      success: true,
      report,
      message: earnedBadges.length > 0
        ? `Assessment complete! You tested out and earned ${earnedBadges.length} badge${earnedBadges.length > 1 ? 's' : ''}!`
        : 'Assessment complete! Your learning path has been customized.'
    });

  } catch (error) {
    console.error('Error completing screener:', error);
    res.status(500).json({ error: 'Failed to complete screener' });
  }
});

module.exports = router;
