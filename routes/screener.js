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
const { initializeSession, processResponse, generateReport, identifyInterviewSkills } = require('../utils/adaptiveScreener');
const { generateProblem } = require('../utils/problemGenerator');
const { awardBadgesForSkills } = require('../utils/badgeAwarder');

// In-memory session storage (TODO: move to Redis/database for production)
const activeSessions = new Map();

/**
 * POST /api/screener/start
 * Initialize a new adaptive screener session
 */
router.post('/start', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if assessment already completed
    if (user.learningProfile.assessmentCompleted) {
      return res.json({
        alreadyCompleted: true,
        message: 'Assessment already completed. Would you like to retake it?',
        completedDate: user.learningProfile.assessmentDate
      });
    }

    // Initialize screener session
    const session = initializeSession({
      userId: user._id.toString(),
      startingTheta: 0  // Start at average ability
    });

    // Store session
    activeSessions.set(session.sessionId, session);

    res.json({
      sessionId: session.sessionId,
      message: "Let's find your level! Answer these problems as best you can.",
      started: true
    });

  } catch (error) {
    console.error('Error starting screener:', error);
    res.status(500).json({ error: 'Failed to start screener' });
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

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    // Determine target difficulty
    let targetDifficulty;
    if (session.questionCount === 0) {
      // First question: medium difficulty
      targetDifficulty = 0;
    } else {
      // Use current theta estimate
      targetDifficulty = session.theta;
    }

    // Select skill to test (TODO: more sophisticated skill selection)
    const skillsToTest = [
      'integer-addition',
      'one-step-equations-addition',
      'two-step-equations',
      'combining-like-terms',
      'order-of-operations'
    ];

    const skillId = skillsToTest[session.questionCount % skillsToTest.length];

    // Try to find existing problem in database
    let problem = await Problem.findNearDifficulty(
      skillId,
      targetDifficulty,
      session.responses.map(r => r.problemId)
    );

    // If no problem found, generate one
    if (!problem) {
      console.log(`[Screener] No problem found in DB, generating for ${skillId} at difficulty ${targetDifficulty}`);
      const generated = generateProblem(skillId, { difficulty: targetDifficulty });

      // Optionally save to database for future use
      problem = new Problem(generated);
      await problem.save();
    }

    res.json({
      problem: {
        problemId: problem.problemId,
        content: problem.content,
        skillId: problem.skillId,
        questionNumber: session.questionCount + 1,
        maxQuestions: session.maxQuestions
      },
      session: {
        questionCount: session.questionCount,
        theta: session.theta,
        confidence: session.confidence
      }
    });

  } catch (error) {
    console.error('Error getting next problem:', error);
    res.status(500).json({ error: 'Failed to get next problem' });
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

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get problem from database
    const problem = await Problem.findOne({ problemId });
    if (!problem) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    // Check if answer is correct
    const isCorrect = problem.checkAnswer(answer);

    // Process response
    const response = {
      problemId: problem.problemId,
      skillId: problem.skillId,
      difficulty: problem.irtParameters.difficulty,
      discrimination: problem.irtParameters.discrimination,
      correct: isCorrect,
      responseTime: responseTime || null,
      userAnswer: answer,
      correctAnswer: problem.answer
    };

    const result = processResponse(session, response);

    // Update session
    activeSessions.set(sessionId, session);

    // Determine next action
    if (result.action === 'continue') {
      // Continue screening
      res.json({
        correct: isCorrect,
        feedback: isCorrect ? 'Correct!' : `Not quite. The answer was ${problem.answer}.`,
        nextAction: 'continue',
        session: {
          questionCount: session.questionCount,
          theta: session.theta,
          standardError: session.standardError,
          confidence: session.confidence
        }
      });

    } else if (result.action === 'interview') {
      // Move to interview phase
      session.phase = 'interview';
      session.endTime = Date.now();

      // Generate report
      const report = generateReport(session);

      // Identify skills to probe
      const interviewSkills = identifyInterviewSkills(session, []);

      res.json({
        correct: isCorrect,
        feedback: isCorrect ? 'Correct!' : `The answer was ${problem.answer}.`,
        nextAction: 'interview',
        reason: result.reason,
        message: result.message,
        report: {
          theta: report.theta,
          percentile: report.percentile,
          confidence: report.confidence,
          questionsAnswered: report.questionsAnswered
        },
        interviewSkills
      });

    } else {
      // Complete
      session.phase = 'complete';
      session.endTime = Date.now();

      const report = generateReport(session);

      res.json({
        correct: isCorrect,
        nextAction: 'complete',
        report
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

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.phase === 'screener') {
      return res.status(400).json({ error: 'Screener not yet complete' });
    }

    const report = generateReport(session);

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
    const userId = req.session?.userId;
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate final report
    const report = generateReport(session);

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

    await user.save();

    // Clean up session
    activeSessions.delete(sessionId);

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
