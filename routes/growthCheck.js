/**
 * GROWTH CHECK ROUTES
 *
 * Short, targeted assessment to measure student progress since last check.
 * Distinct from the full "Starting Point" assessment - this is:
 * - 5-8 questions (vs variable for Starting Point)
 * - Pulls from skills the student has already worked on
 * - Compares new ability to previous ability
 * - Focuses on their frontier (edge of ability)
 *
 * @module routes/growthCheck
 */

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const Problem = require('../models/problem');
const Skill = require('../models/skill');
const {
  initializeGrowthCheck,
  processGrowthCheckResponse,
  selectGrowthCheckSkills,
  getGrowthCheckTargetDifficulty,
  GROWTH_CHECK_CONFIG,
} = require('../utils/growthCheck');
const logger = require('../utils/catLogger');

// In-memory session store (production would use Redis)
const growthCheckSessions = new Map();

// ===========================================================================
// CHECK ELIGIBILITY
// ===========================================================================

/**
 * GET /api/growth-check/eligible
 *
 * Check if student is eligible for a growth check
 * Requirements:
 * - Has completed initial assessment (Starting Point)
 * - Has some learning history
 */
router.get('/eligible', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;

    // Get student
    const student = await User.findById(userId);

    if (!student) {
      return res.json({
        eligible: false,
        reason: 'no-progress',
        message: 'Complete your Starting Point assessment first',
      });
    }

    // Must have completed initial assessment
    if (!student.learningProfile?.assessmentCompleted) {
      return res.json({
        eligible: false,
        reason: 'no-initial-assessment',
        message: 'Complete your Starting Point assessment first',
      });
    }

    // Should have some learning history
    const coveredSkillCount = student.skillMastery ? student.skillMastery.size : 0;
    if (coveredSkillCount < 3) {
      return res.json({
        eligible: false,
        reason: 'insufficient-history',
        message: 'Work on a few more skills first',
        skillsCovered: coveredSkillCount,
        skillsNeeded: 3,
      });
    }

    // Check cooldown (don't allow more than once per day)
    const lastGrowthCheck = student.learningProfile?.lastGrowthCheck;
    if (lastGrowthCheck) {
      const hoursSince = (Date.now() - new Date(lastGrowthCheck).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        return res.json({
          eligible: false,
          reason: 'cooldown',
          message: 'Growth checks are available once per day',
          hoursRemaining: Math.ceil(24 - hoursSince),
        });
      }
    }

    return res.json({
      eligible: true,
      previousTheta: student.learningProfile?.currentTheta || 0,
      coveredSkillCount,
    });

  } catch (error) {
    logger.error('Growth check eligibility error:', error);
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

// ===========================================================================
// START SESSION
// ===========================================================================

/**
 * POST /api/growth-check/start
 *
 * Start a new growth check session
 */
router.post('/start', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;

    // Get student for previous theta and covered skills
    const student = await User.findById(userId);

    if (!student || !student.learningProfile?.assessmentCompleted) {
      return res.status(400).json({
        error: 'Must complete Starting Point assessment first',
      });
    }

    // Get covered skills from their learning history (Map -> Array of keys)
    const coveredSkills = student.skillMastery ? Array.from(student.skillMastery.keys()) : [];

    // Convert skillMastery Map to object for the skill selector
    const skillMasteryObj = {};
    if (student.skillMastery) {
      for (const [skillId, data] of student.skillMastery) {
        skillMasteryObj[skillId] = data;
      }
    }

    // Initialize the growth check session
    const session = initializeGrowthCheck({
      userId: userId.toString(),
      previousTheta: student.learningProfile?.currentTheta || 0,
      previousSE: student.learningProfile?.standardError || 1.0,
      coveredSkills,
    });

    // Select skills to test (prioritized list)
    const skillsToTest = selectGrowthCheckSkills(
      {
        skillMastery: skillMasteryObj,
        assessmentHistory: student.learningProfile?.assessmentHistory || [],
      },
      session.theta
    );

    session.skillsToTest = skillsToTest;

    // Store session
    growthCheckSessions.set(session.sessionId, session);

    logger.info(`Growth check started: ${session.sessionId} for user ${userId}`);

    res.json({
      sessionId: session.sessionId,
      previousTheta: session.previousTheta,
      questionsExpected: `${GROWTH_CHECK_CONFIG.minQuestions}-${GROWTH_CHECK_CONFIG.maxQuestions}`,
    });

  } catch (error) {
    logger.error('Growth check start error:', error);
    res.status(500).json({ error: 'Failed to start growth check' });
  }
});

// ===========================================================================
// GET NEXT PROBLEM
// ===========================================================================

/**
 * GET /api/growth-check/:sessionId/next-problem
 *
 * Get the next problem for the growth check
 */
router.get('/:sessionId/next-problem', isAuthenticated, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = growthCheckSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.complete) {
      return res.json({
        complete: true,
        message: 'Growth check already complete',
      });
    }

    // Get target difficulty
    const targetDifficulty = getGrowthCheckTargetDifficulty(session);

    // Get problems used in this session
    const usedProblemIds = session.responses.map(r => r.problemId);

    // Find a problem from covered skills at target difficulty
    const problem = await findGrowthCheckProblem(
      session.skillsToTest,
      targetDifficulty,
      usedProblemIds
    );

    if (!problem) {
      // If we can't find a suitable problem, complete early
      return res.json({
        complete: true,
        reason: 'no-problems-available',
        message: 'Not enough problems available for growth check',
      });
    }

    // Get skill display name
    const skill = await Skill.findOne({ skillId: problem.skillId });

    res.json({
      sessionId,
      questionNumber: session.questionCount + 1,
      totalExpected: GROWTH_CHECK_CONFIG.maxQuestions,
      problem: {
        _id: problem._id,
        problemId: problem.problemId,
        skillId: problem.skillId,
        skillName: skill?.displayName || problem.skillId,
        difficulty: problem.difficulty || 0,
        problemText: problem.problemText,
        problemType: problem.problemType,
        choices: problem.choices,
        hints: problem.hints,
      },
      progress: {
        current: session.questionCount + 1,
        min: GROWTH_CHECK_CONFIG.minQuestions,
        max: GROWTH_CHECK_CONFIG.maxQuestions,
      },
    });

  } catch (error) {
    logger.error('Growth check next-problem error:', error);
    res.status(500).json({ error: 'Failed to get next problem' });
  }
});

// ===========================================================================
// SUBMIT ANSWER
// ===========================================================================

/**
 * POST /api/growth-check/:sessionId/submit
 *
 * Submit an answer and get updated status
 */
router.post('/:sessionId/submit', isAuthenticated, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { problemId, answer, responseTime } = req.body;

    const session = growthCheckSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.complete) {
      return res.status(400).json({ error: 'Session already complete' });
    }

    // Get problem to check answer
    const problem = await Problem.findOne({ problemId });
    if (!problem) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    // Check if correct
    const correct = checkAnswer(problem, answer);

    // Get skill for category info
    const skill = await Skill.findOne({ skillId: problem.skillId });

    // Process response
    const result = processGrowthCheckResponse(session, {
      problemId,
      skillId: problem.skillId,
      skillCategory: skill?.category,
      difficulty: problem.difficulty || 0,
      discrimination: problem.discrimination || 1.0,
      correct,
      responseTime,
    });

    // Update stored session
    growthCheckSessions.set(sessionId, result.session);

    if (result.action === 'complete') {
      // Save results to student progress
      await saveGrowthCheckResults(session.userId, result);

      // Clean up session
      growthCheckSessions.delete(sessionId);

      return res.json({
        correct,
        complete: true,
        results: result.results,
      });
    }

    res.json({
      correct,
      complete: false,
      theta: result.session.theta,
      questionCount: result.session.questionCount,
      progress: {
        current: result.session.questionCount,
        min: GROWTH_CHECK_CONFIG.minQuestions,
        max: GROWTH_CHECK_CONFIG.maxQuestions,
      },
    });

  } catch (error) {
    logger.error('Growth check submit error:', error);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

// ===========================================================================
// GET RESULTS
// ===========================================================================

/**
 * GET /api/growth-check/:sessionId/results
 *
 * Get results for a completed growth check
 */
router.get('/:sessionId/results', isAuthenticated, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = growthCheckSessions.get(sessionId);

    if (!session) {
      // Session might have been cleaned up, check student's learning profile
      const student = await User.findById(req.user._id);
      const lastCheck = student?.learningProfile?.growthCheckHistory?.slice(-1)[0];

      if (lastCheck && lastCheck.sessionId === sessionId) {
        return res.json({ results: lastCheck });
      }

      return res.status(404).json({ error: 'Session not found' });
    }

    if (!session.complete) {
      return res.status(400).json({ error: 'Session not complete' });
    }

    res.json({
      results: session.results,
    });

  } catch (error) {
    logger.error('Growth check results error:', error);
    res.status(500).json({ error: 'Failed to get results' });
  }
});

// ===========================================================================
// HELPER FUNCTIONS
// ===========================================================================

/**
 * Find a problem for growth check from covered skills
 */
async function findGrowthCheckProblem(skillsToTest, targetDifficulty, usedProblemIds) {
  const difficultyRange = 0.8; // Allow wider range since we have fewer skills to choose from

  // Try each skill in priority order
  for (const skillId of skillsToTest) {
    const problem = await Problem.findOne({
      skillId,
      _id: { $nin: usedProblemIds },
      difficulty: {
        $gte: targetDifficulty - difficultyRange,
        $lte: targetDifficulty + difficultyRange,
      },
    }).sort({ difficulty: 1 }); // Prefer easier within range

    if (problem) {
      return problem;
    }
  }

  // Fallback: any problem from covered skills
  for (const skillId of skillsToTest) {
    const problem = await Problem.findOne({
      skillId,
      _id: { $nin: usedProblemIds },
    });

    if (problem) {
      return problem;
    }
  }

  return null;
}

/**
 * Check if answer is correct
 */
function checkAnswer(problem, answer) {
  if (!problem || answer === undefined || answer === null) {
    return false;
  }

  const correctAnswer = problem.correctAnswer;

  // Handle different answer formats
  if (typeof correctAnswer === 'number') {
    return Number(answer) === correctAnswer;
  }

  if (typeof correctAnswer === 'string') {
    return String(answer).trim().toLowerCase() === correctAnswer.trim().toLowerCase();
  }

  return answer === correctAnswer;
}

/**
 * Save growth check results to student's learning profile
 */
async function saveGrowthCheckResults(userId, result) {
  try {
    const { results, session } = result;

    await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'learningProfile.currentTheta': results.theta,
          'learningProfile.standardError': results.standardError,
          'learningProfile.lastGrowthCheck': new Date(),
        },
        $push: {
          'learningProfile.growthCheckHistory': {
            $each: [{
              sessionId: session.sessionId,
              date: new Date(),
              previousTheta: results.previousTheta,
              newTheta: results.theta,
              thetaChange: results.thetaChange,
              growthStatus: results.growthStatus,
              questionsAnswered: results.questionsAnswered,
              accuracy: results.accuracy,
            }],
            $slice: -20, // Keep last 20 growth checks
          },
        },
      }
    );

    logger.info(`Growth check results saved for user ${userId}: ${results.growthStatus}`);

  } catch (error) {
    logger.error('Failed to save growth check results:', error);
  }
}

module.exports = router;
