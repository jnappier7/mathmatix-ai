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
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
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

    // ADAPTIVE SKILL SELECTION (diversified, not round-robin)
    // Full skill library organized by difficulty tiers
    const skillLibrary = {
      'foundations': [
        { id: 'integer-addition', difficulty: -1.5 },
        { id: 'integer-subtraction', difficulty: -1.3 }
      ],
      'basic-algebra': [
        { id: 'combining-like-terms', difficulty: -0.5 },
        { id: 'order-of-operations', difficulty: -0.3 },
        { id: 'one-step-equations-addition', difficulty: 0.0 }
      ],
      'intermediate': [
        { id: 'one-step-equations-multiplication', difficulty: 0.5 },
        { id: 'two-step-equations', difficulty: 1.0 },
        { id: 'distributive-property', difficulty: 1.2 }
      ],
      'advanced': [
        { id: 'solving-multi-step-equations', difficulty: 1.8 },
        { id: 'integer-all-operations', difficulty: 2.0 }
      ]
    };

    // Select skill near target difficulty that hasn't been over-tested
    let selectedSkillId;
    let candidateSkills = [];

    // Gather candidate skills from all tiers
    for (const tier in skillLibrary) {
      for (const skill of skillLibrary[tier]) {
        // Count how many times this skill has been tested
        const testCount = session.testedSkills.filter(s => s === skill.id).length;

        // Calculate distance from target difficulty
        const difficultyDistance = Math.abs(skill.difficulty - targetDifficulty);

        // Prefer untested or less-tested skills near target difficulty
        candidateSkills.push({
          skillId: skill.id,
          difficulty: skill.difficulty,
          testCount,
          difficultyDistance,
          // Lower score = better candidate
          score: difficultyDistance * 10 + testCount * 5
        });
      }
    }

    // Sort by score (lower is better) and pick best untested or least-tested
    candidateSkills.sort((a, b) => a.score - b.score);
    selectedSkillId = candidateSkills[0].skillId;

    // Try to find existing problem in database
    let problem = await Problem.findNearDifficulty(
      selectedSkillId,
      targetDifficulty,
      session.responses.map(r => r.problemId)
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
        questionNumber: session.questionCount + 1,
        progress: {
          current: session.questionCount + 1,
          min: session.minQuestions,
          target: session.targetQuestions,
          max: session.maxQuestions
        }
      },
      session: {
        questionCount: session.questionCount,
        theta: session.theta,
        standardError: session.standardError,
        confidence: session.confidence
      }
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
    const userId = req.user._id;
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
