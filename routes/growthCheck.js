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
// PR #1343 referenced these without the require — every growth-check route
// threw ReferenceError at request time. Import what the handlers use.
// (#1347 patched resolveTheta/thetaWritePatch but missed resolveStandardError,
// so /growth-check/start STILL crashed — caught when no-undef was restored.)
const { resolveTheta, resolveStandardError, thetaWritePatch } = require('../utils/theta');
const { thetaToGradeLevel } = require('../utils/catConfig');
const { assessedLevelWritePatch } = require('../utils/gradeLevel');
// Shared closure moment — same summary shape the FloatingScreener flow
// returns (routes/screener.js), so a student gets the same wrap-up either way.
const { buildGrowthCheckSummary, deriveSkillHighlights } = require('../utils/growthSummary');
// A 5-8 item check must not cost a student their level on a bad day.
const { dampGrowthCheckDrop } = require('../utils/growthGuard');
const logger = require('../utils/catLogger');

// In-memory session store (production would use Redis)
const growthCheckSessions = new Map();

/**
 * The "here's what this is" moment, served before the first question.
 *
 * A growth check used to open cold on question 1 with no idea what it was for
 * or how long it would take — the fastest way to make a 6-question check feel
 * like a test. Same copy for both entry points.
 */
function growthCheckFraming(currentTheta) {
  const level = thetaToGradeLevel(currentTheta).gradeLevel;
  return {
    title: 'Growth Check',
    subtitle: `Let's see how you've grown since ${level}.`,
    what: `A few questions from topics you've already worked on — no new material, nothing you haven't seen.`,
    duration: `${GROWTH_CHECK_CONFIG.minQuestions}-${GROWTH_CHECK_CONFIG.maxQuestions} questions, about 5 minutes.`,
    reassurance: `It's not a test you can fail. Wrong answers just tell us where to focus next.`,
    currentLevel: level,
  };
}

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
      previousTheta: resolveTheta(student),
      coveredSkillCount,
      framing: growthCheckFraming(resolveTheta(student)),
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
      previousTheta: resolveTheta(student),
      previousSE: resolveStandardError(student),
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
      // The starting point of the experience: what this is, how long it takes,
      // and where they're starting from. Served by the API (not hardcoded in
      // the page) so both entry points frame it identically.
      framing: growthCheckFraming(resolveTheta(student)),
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
      // A short check must not cost a student their level on a bad day —
      // growth is trusted in full, drops are throttled (utils/growthGuard.js).
      const guard = dampGrowthCheckDrop({
        previousTheta: result.results.previousTheta,
        measuredTheta: result.results.theta,
        measuredSE: result.results.standardError,
      });
      if (guard.damped) {
        logger.info(`Growth check drop damped: raw θ=${guard.rawTheta} (${guard.rawLevel}) → applied θ=${guard.theta} (${guard.appliedLevel}), reason=${guard.reason}`);
      }

      // The completion moment: previous vs new level, what they confirmed,
      // what needs review, what just came into reach, and ONE next step.
      const summary = await buildSummaryForCompletedSession(req.user._id, result, guard);

      // Save results to student progress (incl. the pending tutor debrief)
      await saveGrowthCheckResults(session.userId, result, summary, guard);

      // Clean up session
      growthCheckSessions.delete(sessionId);

      return res.json({
        correct,
        complete: true,
        results: result.results,
        ...(summary ? { growthSummary: summary } : {}),
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
        // The full summary outlives the in-memory session as the pending
        // debrief — serve it so a refreshed results page keeps its closure.
        const pending = student?.learningProfile?.pendingGrowthCheckDebrief?.summary;
        return res.json({
          results: lastCheck,
          ...(pending && pending.sessionId === sessionId ? { growthSummary: pending } : {}),
        });
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
 * Build the student-readable summary for a just-completed session.
 *
 * The session carries its own previousTheta (captured at /start, before any
 * writes), so this doesn't need to race the persistence below.
 */
async function buildSummaryForCompletedSession(userId, result, guard) {
  try {
    const { results, session } = result;
    const student = await User.findById(userId).select('skillMastery').lean();

    const masteredSkillIds = [];
    if (student?.skillMastery) {
      // .lean() gives a plain object for Map fields
      for (const [skillId, data] of Object.entries(student.skillMastery)) {
        if (data && data.status === 'mastered') masteredSkillIds.push(skillId);
      }
    }

    const highlights = await deriveSkillHighlights({
      responses: session.responses || [],
      previousTheta: results.previousTheta,
      newTheta: guard.theta,
      masteredSkillIds,
    });

    return buildGrowthCheckSummary({
      previousTheta: results.previousTheta,
      newTheta: guard.theta,
      rawNewTheta: guard.rawTheta,
      levelHeld: guard.levelHeld,
      accuracy: results.accuracy,
      questionsAnswered: results.questionsAnswered,
      durationMs: results.durationMs,
      sessionId: session.sessionId,
      confirmedSkills: highlights.confirmedSkills,
      needsReviewSkills: highlights.needsReviewSkills,
      newlyReachableSkills: highlights.newlyReachableSkills,
    });
  } catch (error) {
    // The check itself succeeded — never fail completion over the wrap-up.
    logger.error('Growth check summary build failed:', error);
    return null;
  }
}

/**
 * Save growth check results to student's learning profile
 */
async function saveGrowthCheckResults(userId, result, summary = null, guard = null) {
  try {
    const { results, session } = result;
    // Write the APPLIED ability, not the raw measurement (utils/growthGuard.js).
    const appliedTheta = guard ? guard.theta : results.theta;

    // The next check unlocks in 3 months — the same cadence the Starting
    // Point sets (routes/screener.js). This route never wrote it, so a
    // student who finished here stayed "due" forever and kept being nudged.
    const nextDue = new Date();
    nextDue.setMonth(nextDue.getMonth() + 3);

    await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          nextGrowthCheckDue: nextDue,
          // The tutor owes this student a debrief next time they're in chat
          // (see routes/chat.js). Without it the check ends on a stats card
          // and the tutor never mentions it again.
          ...(summary
            ? { 'learningProfile.pendingGrowthCheckDebrief': { summary, createdAt: new Date() } }
            : {}),
          // Every theta writer syncs ALL read paths (utils/theta.js) — the
          // growth-check-only field split-brained against the screener's and
          // anchored every check at θ=0 ("5th grade" for a math teacher).
          ...thetaWritePatch(appliedTheta, results.standardError),
          // Keep the assessed-level STRING and the tutor's mathCourse pathway
          // in step with the new theta (utils/gradeLevel.js) — before this,
          // growth checks moved theta but left abilityEstimate.gradeLevel
          // frozen at the initial placement.
          ...assessedLevelWritePatch(thetaToGradeLevel(appliedTheta).gradeLevel),
          // Both read paths: eligibility here reads the nested field, the
          // screener flow and dashboards read the top-level one.
          'learningProfile.lastGrowthCheck': new Date(),
          lastGrowthCheck: new Date(),
        },
        $push: {
          'learningProfile.growthCheckHistory': {
            $each: [{
              sessionId: session.sessionId,
              date: new Date(),
              previousTheta: results.previousTheta,
              newTheta: appliedTheta,
              thetaChange: summary ? summary.thetaChange : results.thetaChange,
              growthStatus: results.growthStatus,
              questionsAnswered: results.questionsAnswered,
              accuracy: results.accuracy,
              // The honest reading, before the guard throttled a drop.
              rawTheta: guard ? guard.rawTheta : results.theta,
              damped: !!guard?.damped,
              ...(guard?.damped ? { dampReason: guard.reason } : {}),
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
