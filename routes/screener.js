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
const { generateProblem, TEMPLATES } = require('../utils/problemGenerator');
const { awardBadgesForSkills } = require('../utils/badgeAwarder');
const { generateInterviewQuestions, evaluateResponse } = require('../utils/dynamicInterviewGenerator');

// NEW: Import refactored CAT modules
const { gradeToTheta, thetaToGradeLevel, SESSION_DEFAULTS, getBroadCategory, getCategoryDifficulty } = require('../utils/catConfig');
const { selectSkill, formatScoringLog } = require('../utils/skillSelector');
const { calculateProgress } = require('../utils/catConvergence');
const { getSkillSelectionData, warmupCache } = require('../utils/catCache');

// Warm up cache on module load
warmupCache().catch(err => console.error('[Screener] Cache warmup failed:', err));

/**
 * CTO REVIEW FIX: LRU (Least Recently Used) Strategy for Problem Exclusion
 *
 * PROBLEM: Using $nin with all historical problemIds causes O(N) database queries
 * as students answer 1000+ problems over a school year.
 *
 * SOLUTION: Only exclude the LAST N problems (LRU window). This:
 * - Prevents immediate repeats (boring for students)
 * - Keeps database query size bounded to O(1) constant
 * - Allows old problems to resurface for spaced repetition (pedagogically sound)
 *
 * Now uses centralized config from catConfig.js
 */
const LRU_EXCLUSION_WINDOW = SESSION_DEFAULTS.lruExclusionWindow;

/**
 * Map grade level AND math course to starting theta (ability estimate)
 *
 * DEPRECATED: Now uses centralized gradeToTheta from catConfig.js
 * This local function is kept for backwards compatibility during transition.
 *
 * @param {String|Number} grade - Student's grade level (K-12+)
 * @param {String} mathCourse - Optional specific math course
 * @returns {Number} Starting theta estimate
 */
// gradeToTheta is now imported from catConfig.js at the top of the file

/**
 * Calculate adaptive progress with confidence metrics for UI visualization
 *
 * DEPRECATED: Now uses calculateProgress from catConvergence.js
 *
 * @param {Object} session - Current screener session
 * @returns {Object} Progress metrics including percentage and confidence state
 */
function calculateAdaptiveProgress(session) {
  // Use centralized progress calculation from catConvergence
  return calculateProgress(session);
}

/**
 * POST /api/screener/start
 * Initialize a new adaptive screener session
 *
 * Supports two modes:
 * - Starting Point: Full initial assessment (10-30 questions)
 * - Growth Check: Shorter progress check (5-15 questions), starts at current level
 */
router.post('/start', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const { restart, isGrowthCheck } = req.body;

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

    // Handle Growth Check mode
    if (isGrowthCheck) {
      // Growth check requires a completed assessment first
      if (!user.assessmentCompleted) {
        return res.status(400).json({
          error: 'Complete Starting Point first',
          message: 'Please complete your Starting Point assessment before taking a Growth Check.'
        });
      }

      console.log(`[Screener] Starting GROWTH CHECK for user ${userId}`);
    } else {
      // Starting Point mode - check if already completed
      if (user.assessmentCompleted && !restart) {
        // Check if assessment expired (annual renewal)
        const assessmentExpired = user.assessmentExpiresAt && new Date(user.assessmentExpiresAt) < new Date();

        if (!assessmentExpired) {
          return res.status(403).json({
            error: 'Assessment already completed',
            alreadyCompleted: true,
            message: 'You have already completed your placement assessment. Your results are saved and being used to personalize your learning experience.',
            completedDate: user.assessmentDate,
            gradeLevel: user.initialPlacement,
            canReset: false
          });
        }
        // Assessment expired, allow re-assessment
        console.log(`[Screener] Assessment expired for user ${userId} - allowing annual re-assessment`);
      }
    }

    // Check for existing incomplete session
    const existingSession = await ScreenerSession.getActiveSession(userId);
    const forceRestart = restart === true || isGrowthCheck; // Growth checks always start fresh

    if (existingSession && !forceRestart) {
      // Return existing session for resume
      console.log(`[Screener] Resuming existing session ${existingSession.sessionId} for user ${userId}`);
      return res.json({
        sessionId: existingSession.sessionId,
        message: "Welcome back! Let's continue where you left off.",
        resumed: true,
        questionsCompleted: existingSession.questionCount || 0
      });
    }

    // Delete any existing incomplete sessions if restarting
    if (existingSession && forceRestart) {
      await ScreenerSession.deleteOne({ _id: existingSession._id });
      console.log(`[Screener] Deleted existing session for restart - user ${userId}`);
    }

    // Determine starting theta based on mode
    let startingTheta;

    if (isGrowthCheck) {
      // Growth Check: Start at user's current level (from previous assessment)
      startingTheta = user.learningProfile?.abilityEstimate?.theta || 0;
      console.log(`[Screener Start] GROWTH CHECK - Starting at current level θ=${startingTheta.toFixed(2)}`);
    } else {
      // Starting Point: Start one grade below current to build confidence
      const currentGrade = parseInt(user.gradeLevel, 10);
      const previousGrade = !isNaN(currentGrade) && currentGrade > 1 ? currentGrade - 1 : user.gradeLevel;
      startingTheta = gradeToTheta(previousGrade, null);
      console.log(`[Screener Start] STARTING POINT - Current grade: "${user.gradeLevel}" → Starting at previous grade (${previousGrade}) → θ=${startingTheta.toFixed(2)}`);
    }

    console.log(`[Screener Start] User: ${user.username || user._id}`);

    const sessionData = initializeSession({
      userId: user._id.toString(),
      startingTheta,
      isGrowthCheck: isGrowthCheck || false
    });

    // CTO REVIEW FIX: Store session in database (prevents data loss on restart)
    const session = new ScreenerSession({
      ...sessionData,
      userId: user._id,
      sessionType: isGrowthCheck ? 'growth-check' : 'starting-point'
    });
    await session.save();

    res.json({
      sessionId: session.sessionId,
      message: isGrowthCheck
        ? "Let's check your progress! This will be quick."
        : "Let's find your level! Answer these problems as best you can.",
      started: true,
      isGrowthCheck: isGrowthCheck || false
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
      // First question: Use starting theta from grade level (not always 0!)
      // This ensures high school students get high school problems from the start
      targetDifficulty = session.theta;
      console.log(`[Screener] First question using starting θ=${session.theta.toFixed(2)} based on grade level`);
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
      // FIX: Use Math.max (conservative/higher bound) so a crashed theta can't drag difficulty down
      const lowerBound = Math.max(session.theta - 1.0, lastDifficulty - 1.5);
      const upperBound = Math.max(session.theta + 1.0, lastDifficulty + 1.5);
      targetDifficulty = Math.max(lowerBound, Math.min(upperBound, targetDifficulty));

      console.log(`[Screener Jump] Q${session.questionCount}: ${wasCorrect ? 'CORRECT' : 'INCORRECT'} at d=${lastDifficulty.toFixed(2)} → jump ${jumpSize.toFixed(2)} → target ${targetDifficulty.toFixed(2)} (θ=${session.theta.toFixed(2)}, SE=${session.standardError.toFixed(2)})`);
    }

    // ADAPTIVE SKILL SELECTION - Use new modular skill selection system
    // Get cached skill data for efficient selection
    const { skills: filteredSkills, templateDifficulties } = await getSkillSelectionData();

    console.log(`[Screener] Using ${filteredSkills.length} available skills from cache`);
    console.log(`[DEBUG] Target difficulty: ${targetDifficulty.toFixed(2)}`);
    console.log(`[DEBUG] Tested skills so far: [${session.testedSkills.join(', ')}]`);
    console.log(`[DEBUG] Category counts:`, session.testedSkillCategories);

    // Use the new modular skill selection system
    // This replaces 300+ lines of inline skill scoring, clustering, and balancing logic
    const selectionResult = selectSkill(filteredSkills, session, targetDifficulty, {
      templateDifficultyMap: templateDifficulties,
    });

    const { selectedSkill, scoredCandidates, reason } = selectionResult;
    const selectedSkillId = selectedSkill.skillId;

    // Log selection results
    if (reason === 'fallback') {
      console.log(`[Screener Fallback] Using "${selectedSkillId}" - no optimal candidates found`);
    } else {
      console.log(`[Screener Q${session.questionCount + 1}] Target d=${targetDifficulty.toFixed(2)} → "${selectedSkillId}" (d=${selectedSkill.difficulty.toFixed(2)})`);
      if (scoredCandidates.length > 0) {
        console.log(`[DEBUG] Top candidates:`);
        scoredCandidates.slice(0, 3).forEach((s, i) => {
          console.log(`  ${i+1}. ${formatScoringLog(s)}`);
        });
      }
    }

    // SIMPLIFIED PROBLEM SELECTION
    // Strategy: Prefer multiple-choice for screener reliability
    const recentProblemIds = session.responses
      .slice(-LRU_EXCLUSION_WINDOW)
      .map(r => r.problemId);

    let problem = await Problem.findNearDifficulty(
      selectedSkillId,
      targetDifficulty,
      recentProblemIds,
      { preferMultipleChoice: true }  // Screener uses MC for clarity
    );

    // Fallback: Generate or find any problem
    if (!problem) {
      // Try generation first (templates are optimized for target difficulty)
      try {
        const generated = generateProblem(selectedSkillId, { difficulty: targetDifficulty });
        problem = new Problem(generated);
        await problem.save();
      } catch {
        // No template - find any existing problem for this skill
        problem = await Problem.findOne({
          skillId: selectedSkillId,
          isActive: true,
          answerType: 'multiple-choice'  // Prefer MC even in fallback
        });

        // Last resort: any problem type
        if (!problem) {
          problem = await Problem.findOne({
            skillId: selectedSkillId,
            isActive: true
          });
        }
      }

      // If still no problem, try a different skill instead of crashing
      if (!problem) {
        console.warn(`[Screener] No problems for skill ${selectedSkillId}, selecting alternative`);
        // Find any skill with available problems near target difficulty
        const alternativeProblem = await Problem.findOne({
          isActive: true,
          answerType: 'multiple-choice',
          problemId: { $nin: recentProblemIds }
        });

        if (alternativeProblem) {
          problem = alternativeProblem;
          console.log(`[Screener] Using alternative skill: ${problem.skillId}`);
        } else {
          throw new Error(`No problems available for screener`);
        }
      }
    }

    // Fix mismatched answer types
    if (problem.options?.length > 0 && problem.answerType !== 'multiple-choice') {
      problem.answerType = 'multiple-choice';
      await problem.save();
    }

    // CRITICAL: Normalize options with proper labels (A, B, C, D)
    // Many problems in DB have options without labels or with incorrect labels
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    let normalizedOptions = [];
    let needsSave = false;

    if (problem.options && problem.options.length > 0) {
      normalizedOptions = problem.options.map((opt, idx) => {
        const label = labels[idx];
        const text = opt.text || opt || '';
        if (!opt.label || opt.label !== label) {
          needsSave = true;
        }
        return { label, text: String(text) };
      });

      // Fix correctOption if not set or if it doesn't match the answer
      const answerValue = problem.answer?.value ?? problem.answer;
      let correctLabel = problem.correctOption;

      // Find which option matches the correct answer
      if (!correctLabel || !labels.includes(correctLabel?.toUpperCase())) {
        for (let i = 0; i < normalizedOptions.length; i++) {
          const optText = normalizedOptions[i].text.trim().toLowerCase();
          const ansStr = String(answerValue).trim().toLowerCase();
          if (optText === ansStr || optText.includes(ansStr) || ansStr.includes(optText)) {
            correctLabel = labels[i];
            needsSave = true;
            break;
          }
        }
      }

      // Update problem in DB if we fixed anything
      if (needsSave) {
        problem.options = normalizedOptions;
        if (correctLabel) {
          problem.correctOption = correctLabel;
        }
        await problem.save();
        console.log(`[Screener] Fixed options/correctOption for problem ${problem.problemId} - correctOption: ${correctLabel}`);
      }
    }

    // Calculate progress with confidence metrics for UI
    const progressMetrics = calculateAdaptiveProgress(session);

    res.json({
      problem: {
        problemId: problem.problemId,
        content: problem.prompt,  // Schema uses 'prompt', API returns as 'content' for backwards compat
        skillId: problem.skillId,
        answerType: problem.answerType,
        options: normalizedOptions.length > 0 ? normalizedOptions : problem.options,
        // SECURITY: Never send correctOption to client - validates server-side only
        questionNumber: session.questionCount + 1,
        progress: {
          current: session.questionCount + 1,
          min: session.minQuestions,
          target: session.targetQuestions,
          max: session.maxQuestions,
          percentComplete: progressMetrics.percentComplete,
          confidenceLevel: progressMetrics.confidenceLevel,
          confidenceAchieved: progressMetrics.confidenceAchieved,
          confidenceDescription: progressMetrics.confidenceDescription
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
    const { sessionId, problemId, answer, responseTime, skipped } = req.body;

    if (!sessionId || !problemId || (answer === undefined && !skipped)) {
      const missing = [];
      if (!sessionId) missing.push('sessionId');
      if (!problemId) missing.push('problemId');
      if (answer === undefined && !skipped) missing.push('answer');
      console.error(`[Screener] Submit answer failed - Missing fields: ${missing.join(', ')}`);
      return res.status(400).json({
        error: 'Missing required fields',
        missingFields: missing
      });
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

    // DEBUG: Log problem and answer details for diagnosis
    console.log(`[DEBUG] Problem ${problemId}:`);
    console.log(`[DEBUG]   Skill: ${problem.skillId}`);
    console.log(`[DEBUG]   Prompt: ${problem.prompt?.substring(0, 80)}`);
    console.log(`[DEBUG]   Difficulty: ${problem.difficulty}`);
    console.log(`[DEBUG]   AnswerType: ${problem.answerType}`);
    console.log(`[DEBUG]   Correct Answer: ${JSON.stringify(problem.answer)}`);
    console.log(`[DEBUG]   CorrectOption: ${problem.correctOption || 'NOT SET'}`);
    console.log(`[DEBUG]   Options: ${JSON.stringify(problem.options?.map(o => o.text || o)?.slice(0, 4))}`);
    console.log(`[DEBUG]   User Answer: "${answer}" (type: ${typeof answer})`);

    // Check if answer is correct (skipped questions are treated as incorrect)
    const isCorrect = skipped ? false : problem.checkAnswer(answer);
    console.log(`[DEBUG]   Result: ${skipped ? 'SKIPPED ⏭' : (isCorrect ? 'CORRECT ✓' : 'INCORRECT ✗')}`);

    // Capture previous theta for logging
    const previousTheta = session.theta;

    // Process response
    // Convert difficulty 1-5 to theta scale for IRT calculations
    const difficultyTheta = Problem.difficultyToTheta(problem.difficulty);

    const response = {
      problemId: problem.problemId,
      skillId: problem.skillId,
      skillCategory: skillCategory,  // Pass category for diversity tracking
      difficulty: difficultyTheta,  // IRT uses theta scale
      discrimination: 1.0,  // Default discrimination for simplified model
      correct: isCorrect,
      skipped: !!skipped,
      responseTime: responseTime || null,
      userAnswer: skipped ? '__SKIP__' : answer,
      correctAnswer: problem.answer?.value ?? problem.answer
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

    const resultLabel = skipped ? 'SKIPPED ⏭' : (response.correct ? 'CORRECT ✓' : 'INCORRECT ✗');
    console.log(`[Screener] Q${session.questionCount} Result: ${resultLabel} | Theta: ${previousTheta.toFixed(2)} → ${session.theta.toFixed(2)} (Δ${(session.theta - previousTheta) >= 0 ? '+' : ''}${(session.theta - previousTheta).toFixed(2)}) | SE: ${session.standardError.toFixed(3)}`);
    console.log(`[Screener]   Answer: "${skipped ? 'SKIPPED' : answer}" ${isCorrect ? '==' : '!='} "${response.correctAnswer}"`);
    console.log(`[Screener]   Difficulty theta: ${difficultyTheta.toFixed(2)}`);

    // Determine next action
    if (result.action === 'continue') {
      // Calculate progress with confidence metrics for UI
      const progressMetrics = calculateAdaptiveProgress(session);

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
          percentComplete: progressMetrics.percentComplete,
          confidenceLevel: progressMetrics.confidenceLevel,
          confidenceAchieved: progressMetrics.confidenceAchieved,
          confidenceDescription: progressMetrics.confidenceDescription
        }
        // DO NOT send: feedback text, theta, standardError (student shouldn't see these)
      });

    } else if (result.action === 'interview' || result.action === 'complete') {
      // SIMPLIFIED: Skip interview phase, go directly to complete
      // Interview phase was removed - it added latency and cost without clear diagnostic value
      session.phase = 'complete';
      session.endTime = Date.now();

      // Generate report
      const report = generateReport(session.toObject());

      // Convert theta to human-readable grade level (like STAR testing)
      const gradeLevelResult = thetaToGradeLevel(report.theta);
      report.gradeLevel = gradeLevelResult.gradeLevel;
      report.gradeLevelDescription = gradeLevelResult.description;

      // CTO REVIEW FIX: Persist session state
      await session.save();

      res.json({
        nextAction: 'complete',
        reason: result.reason,
        message: result.message || 'Assessment complete!',
        report: {
          // Students see: grade level, accuracy, time
          gradeLevel: report.gradeLevel,
          gradeLevelDescription: report.gradeLevelDescription,
          accuracy: report.accuracy,
          questionsAnswered: report.questionsAnswered,
          duration: report.duration
          // Teachers/admin see full report via /admin/student-detail endpoint
        }
      });

    } else {
      // Complete
      session.phase = 'complete';
      session.endTime = Date.now();

      const report = generateReport(session.toObject()); // Convert Mongoose doc to plain object

      // Convert theta to human-readable grade level
      const gradeLevelResult = thetaToGradeLevel(report.theta);
      report.gradeLevel = gradeLevelResult.gradeLevel;
      report.gradeLevelDescription = gradeLevelResult.description;

      res.json({
        nextAction: 'complete',
        report: {
          // Students see: grade level, accuracy, time
          gradeLevel: report.gradeLevel,
          gradeLevelDescription: report.gradeLevelDescription,
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

    // Convert theta to human-readable grade level (like STAR testing)
    const gradeLevelResult = thetaToGradeLevel(report.theta);
    report.gradeLevel = gradeLevelResult.gradeLevel;
    report.gradeLevelDescription = gradeLevelResult.description;

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

    // Mark assessment as completed (top-level fields persisted by Mongoose)
    const now = new Date();
    user.assessmentCompleted = true;
    user.assessmentDate = now;
    user.initialPlacement = gradeLevelResult.gradeLevel;

    // Mirror into learningProfile for routes that read from nested path
    user.learningProfile.assessmentCompleted = true;
    user.learningProfile.assessmentDate = now;
    user.learningProfile.initialPlacement = gradeLevelResult.gradeLevel;

    // Update mathCourse to match assessed level so the tutor loads the right pathway
    // (Without this, mathCourse stays at whatever was set at signup/enrollment,
    // causing the tutor to teach from the wrong grade level)
    user.mathCourse = gradeLevelResult.gradeLevel;

    // Store theta in the format expected by badge system
    user.learningProfile.abilityEstimate = {
      theta: report.theta,
      standardError: report.standardError,
      percentile: report.percentile,
      gradeLevel: gradeLevelResult.gradeLevel
    };

    // Store assessment in history for tracking growth over time
    if (!user.assessmentHistory) user.assessmentHistory = [];
    user.assessmentHistory.push({
      type: 'starting-point',
      date: now,
      theta: report.theta,
      standardError: report.standardError,
      gradeLevel: gradeLevelResult.gradeLevel,
      questionsAnswered: report.questionsAnswered,
      accuracy: report.accuracy,
      duration: report.duration,
      skillsAssessed: session.testedSkills || [],
      sessionId: session.sessionId
    });

    // Set assessment expiration (1 year from now)
    const oneYearLater = new Date(now);
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
    user.assessmentExpiresAt = oneYearLater;

    // Set next growth check due date (3 months from now)
    const threeMonthsLater = new Date(now);
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
    user.nextGrowthCheckDue = threeMonthsLater;

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

// ============================================================================
// INTERVIEW PHASE ENDPOINTS
// ============================================================================

/**
 * GET /api/screener/interview-questions
 * Generate interview questions for identified frontier skills
 */
router.get('/interview-questions', async (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }

  try {
    // Get session from database
    const session = await ScreenerSession.findBySessionId(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.phase !== 'interview') {
      return res.status(400).json({ error: 'Session not in interview phase' });
    }

    // Check if questions already generated
    if (session.interviewQuestions && session.interviewQuestions.length > 0) {
      console.log(`[Interview] Returning ${session.interviewQuestions.length} existing questions`);
      return res.json({
        questions: session.interviewQuestions.map(q => ({
          questionId: q.questionId,
          type: q.type,
          question: q.question,
          baseProblem: q.baseProblem,
          skillId: q.skillId,
          rubric: q.rubric
        })),
        sessionId: session.sessionId
      });
    }

    // Identify frontier skills to probe
    const interviewSkills = identifyInterviewSkills(session.toObject(), []);
    console.log(`[Interview] Identified ${interviewSkills.length} frontier skills to probe`);

    if (interviewSkills.length === 0) {
      return res.status(400).json({ error: 'No frontier skills identified for interview' });
    }

    // Store interview skills
    session.interviewSkills = interviewSkills;
    session.interviewStartTime = new Date();

    // Generate questions for top 3 frontier skills
    const questionsToGenerate = interviewSkills.slice(0, 3);
    const allQuestions = [];

    for (const frontierSkill of questionsToGenerate) {
      // Fetch full skill object
      const skill = await Skill.findOne({ skillId: frontierSkill.skillId }).lean();

      if (!skill) {
        console.warn(`[Interview] Skill not found: ${frontierSkill.skillId}`);
        continue;
      }

      // Generate interview questions for this skill
      const questions = await generateInterviewQuestions(skill, session.theta, {
        responses: session.responses,
        theta: session.theta,
        standardError: session.standardError
      });

      // Add questionId and store
      for (const question of questions) {
        const questionWithId = {
          questionId: `interview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          ...question
        };
        allQuestions.push(questionWithId);
      }
    }

    console.log(`[Interview] Generated ${allQuestions.length} interview questions`);

    // Save questions to session
    session.interviewQuestions = allQuestions;
    await session.save();

    // Return questions (without responses/evaluation)
    res.json({
      questions: allQuestions.map(q => ({
        questionId: q.questionId,
        type: q.type,
        question: q.question,
        baseProblem: q.baseProblem,
        skillId: q.skillId,
        rubric: q.rubric
      })),
      sessionId: session.sessionId
    });

  } catch (error) {
    console.error('[Interview] Error generating questions:', error);
    res.status(500).json({ error: 'Failed to generate interview questions' });
  }
});

/**
 * POST /api/screener/interview-answer
 * Submit and analyze interview answer
 */
router.post('/interview-answer', async (req, res) => {
  const { sessionId, questionId, answer } = req.body;

  if (!sessionId || !questionId || !answer) {
    return res.status(400).json({ error: 'Session ID, question ID, and answer required' });
  }

  try {
    // Get session
    const session = await ScreenerSession.findBySessionId(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.phase !== 'interview') {
      return res.status(400).json({ error: 'Session not in interview phase' });
    }

    // Find the question
    const questionIndex = session.interviewQuestions.findIndex(q => q.questionId === questionId);
    if (questionIndex === -1) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const question = session.interviewQuestions[questionIndex];

    // Check if already answered
    if (question.response) {
      return res.status(400).json({ error: 'Question already answered' });
    }

    // Get skill for evaluation
    const skill = await Skill.findOne({ skillId: question.skillId }).lean();
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Evaluate response using Claude
    console.log(`[Interview] Evaluating response for question ${questionId}`);
    const evaluation = await evaluateResponse(question, answer, skill);

    // Update question with response and evaluation
    session.interviewQuestions[questionIndex].response = answer;
    session.interviewQuestions[questionIndex].evaluation = evaluation;
    session.interviewQuestions[questionIndex].answeredAt = new Date();

    // Mark as modified for Mongoose
    session.markModified('interviewQuestions');
    await session.save();

    // Check if interview is complete (all questions answered)
    const answeredCount = session.interviewQuestions.filter(q => q.response).length;
    const totalQuestions = session.interviewQuestions.length;
    const complete = answeredCount >= totalQuestions;

    console.log(`[Interview] Progress: ${answeredCount}/${totalQuestions} questions answered`);

    // Return feedback and next question
    const nextUnanswered = session.interviewQuestions.find(q => !q.response);

    res.json({
      evaluation: {
        rating: evaluation.rating,
        strengths: evaluation.strengths,
        areasForGrowth: evaluation.areasForGrowth
      },
      progress: {
        answered: answeredCount,
        total: totalQuestions
      },
      complete,
      nextQuestion: nextUnanswered ? {
        questionId: nextUnanswered.questionId,
        type: nextUnanswered.type,
        question: nextUnanswered.question,
        baseProblem: nextUnanswered.baseProblem,
        skillId: nextUnanswered.skillId,
        rubric: nextUnanswered.rubric
      } : null
    });

  } catch (error) {
    console.error('[Interview] Error submitting answer:', error);
    res.status(500).json({ error: 'Failed to submit interview answer' });
  }
});

/**
 * POST /api/screener/interview-complete
 * Finalize interview and update user profile
 */
router.post('/interview-complete', async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }

  try {
    // Get session
    const session = await ScreenerSession.findBySessionId(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.phase !== 'interview') {
      return res.status(400).json({ error: 'Session not in interview phase' });
    }

    // Verify all questions answered
    const unansweredQuestions = session.interviewQuestions.filter(q => !q.response);
    if (unansweredQuestions.length > 0) {
      return res.status(400).json({
        error: 'Interview not complete',
        unansweredCount: unansweredQuestions.length
      });
    }

    // Mark interview phase as complete
    session.phase = 'complete';
    session.interviewEndTime = new Date();

    // Analyze interview results to refine pattern mastery
    const patternMastery = analyzePatternMastery(session);

    // Get user
    const user = await User.findById(session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user profile with refined results
    user.learningProfile = user.learningProfile || {};
    user.assessmentCompleted = true;
    user.assessmentDate = new Date();
    user.learningProfile.abilityEstimate = {
      theta: session.theta,
      standardError: session.standardError,
      percentile: thetaToPercentile(session.theta),
      confidence: session.confidence
    };

    // Store pattern mastery from interview
    user.learningProfile.patternMastery = patternMastery;

    // Award badges based on demonstrated mastery
    const skillsToAward = [];
    for (const question of session.interviewQuestions) {
      if (question.evaluation?.rating === 'excellent' || question.evaluation?.rating === 'good') {
        if (!skillsToAward.includes(question.skillId)) {
          skillsToAward.push(question.skillId);
        }
      }
    }

    let earnedBadges = [];
    if (skillsToAward.length > 0) {
      earnedBadges = await awardBadgesForSkills(user._id, skillsToAward);
      console.log(`[Interview] Awarded ${earnedBadges.length} badges based on interview performance`);
    }

    // Save session and user
    await session.save();
    await user.save();

    // Generate final report
    const report = generateReport(session.toObject());

    console.log(`[Interview] Complete for user ${user._id} - Theta: ${session.theta.toFixed(2)}, Badges: ${earnedBadges.length}`);

    res.json({
      success: true,
      report: {
        accuracy: report.accuracy,
        questionsAnswered: report.questionsAnswered,
        duration: report.duration,
        interviewQuestionsAnswered: session.interviewQuestions.length
      },
      patternMastery,
      earnedBadges: earnedBadges.map(b => ({
        badgeId: b.badgeId,
        displayName: b.displayName,
        category: b.category
      })),
      message: earnedBadges.length > 0
        ? `Assessment complete! You earned ${earnedBadges.length} badge${earnedBadges.length > 1 ? 's' : ''} based on your interview performance!`
        : 'Assessment complete! Your learning path has been customized.'
    });

  } catch (error) {
    console.error('[Interview] Error completing interview:', error);
    res.status(500).json({ error: 'Failed to complete interview' });
  }
});

/**
 * Helper: Analyze pattern mastery from interview responses
 */
function analyzePatternMastery(session) {
  const patternMastery = {};

  // Group questions by skill/pattern
  const skillEvaluations = {};

  for (const question of session.interviewQuestions) {
    if (!question.evaluation) continue;

    const skillId = question.skillId;
    if (!skillEvaluations[skillId]) {
      skillEvaluations[skillId] = [];
    }
    skillEvaluations[skillId].push(question.evaluation);
  }

  // Determine mastery level for each skill
  for (const [skillId, evaluations] of Object.entries(skillEvaluations)) {
    const ratings = evaluations.map(e => e.rating);
    const understandingLevels = evaluations.map(e => e.understandingLevel);

    // Calculate mastery level
    const excellentCount = ratings.filter(r => r === 'excellent').length;
    const goodCount = ratings.filter(r => r === 'good').length;
    const deepUnderstanding = understandingLevels.filter(u => u === 'deep').length;

    let level = 'learning';
    let confidence = 0.5;

    if (excellentCount >= evaluations.length * 0.67) {
      level = 'mastered';
      confidence = 0.9;
    } else if (excellentCount + goodCount >= evaluations.length * 0.67) {
      level = 'mastered';
      confidence = 0.75;
    } else if (deepUnderstanding >= evaluations.length * 0.5) {
      level = 'mastered';
      confidence = 0.7;
    } else if (ratings.includes('needs_work') || understandingLevels.includes('misconception')) {
      level = 'learning';
      confidence = 0.4;
    }

    patternMastery[skillId] = { level, confidence };
  }

  return patternMastery;
}

/**
 * Helper: Convert theta to percentile
 */
function thetaToPercentile(theta) {
  // Standard normal CDF approximation
  // θ ~ N(0, 1) in IRT
  const z = theta;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

  const percentile = z >= 0 ? (1 - p) * 100 : p * 100;
  return Math.round(percentile);
}

/**
 * GET /api/screener/status
 * Check assessment status including growth check availability
 */
router.get('/status', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      'assessmentCompleted assessmentDate startingPointOffered assessmentExpiresAt nextGrowthCheckDue lastGrowthCheck assessmentHistory learningProfile'
    ).lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = new Date();

    // Check if assessment has expired (annual expiration)
    const assessmentExpired = user.assessmentExpiresAt && new Date(user.assessmentExpiresAt) < now;

    // Check if growth check is due (every 3 months)
    const growthCheckDue = user.nextGrowthCheckDue && new Date(user.nextGrowthCheckDue) < now;

    // Get current grade level from most recent assessment
    const lastAssessment = user.assessmentHistory?.length > 0
      ? user.assessmentHistory[user.assessmentHistory.length - 1]
      : null;

    res.json({
      assessmentCompleted: user.assessmentCompleted || false,
      assessmentDate: user.assessmentDate || null,
      startingPointOffered: user.startingPointOffered || false,
      assessmentExpired,
      growthCheckDue: growthCheckDue && user.assessmentCompleted,
      nextGrowthCheckDue: user.nextGrowthCheckDue || null,
      assessmentExpiresAt: user.assessmentExpiresAt || null,
      currentGradeLevel: lastAssessment?.gradeLevel || user.learningProfile?.abilityEstimate?.gradeLevel || null,
      assessmentCount: user.assessmentHistory?.length || 0
    });
  } catch (error) {
    console.error('[Screener] Error checking assessment status:', error);
    res.status(500).json({ error: 'Failed to check assessment status' });
  }
});

/**
 * POST /api/screener/mark-offered
 * Mark that Starting Point has been offered to user in chat (so AI won't ask again)
 */
router.post('/mark-offered', isAuthenticated, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      startingPointOffered: true,
      startingPointOfferedAt: new Date()
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Screener] Error marking as offered:', error);
    res.status(500).json({ error: 'Failed to mark as offered' });
  }
});

/**
 * POST /api/screener/reset
 * Reset a student's assessment status (teacher/admin only)
 */
router.post('/reset', isAuthenticated, async (req, res) => {
  try {
    const { studentId } = req.body;

    // Only teachers and admins can reset
    if (!['teacher', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only teachers and admins can reset assessments' });
    }

    const targetUserId = studentId || req.user._id; // Default to self for testing
    const student = await User.findById(targetUserId);

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Reset assessment status but preserve history
    student.assessmentCompleted = false;
    student.assessmentDate = null;
    student.assessmentExpiresAt = null;
    student.nextGrowthCheckDue = null;
    // Mirror reset into learningProfile
    if (student.learningProfile) {
      student.learningProfile.assessmentCompleted = false;
      student.learningProfile.assessmentDate = null;
      student.learningProfile.initialPlacement = null;
    }
    // Keep assessmentHistory for historical tracking

    await student.save();

    console.log(`[Screener] Assessment reset for student ${targetUserId} by ${req.user.role} ${req.user._id}`);

    res.json({
      success: true,
      message: 'Assessment status reset. Student can now retake the Starting Point assessment.'
    });
  } catch (error) {
    console.error('[Screener] Error resetting assessment:', error);
    res.status(500).json({ error: 'Failed to reset assessment' });
  }
});

/**
 * POST /api/screener/skip
 * Record that user skipped the assessment
 * They'll be offered again on next login
 */
router.post('/skip', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Mark that user was offered but skipped
    // Don't set assessmentCompleted, so they'll be offered again
    if (!user.learningProfile) {
      user.learningProfile = {};
    }

    user.learningProfile.assessmentOfferedAt = new Date();
    user.learningProfile.assessmentSkipped = true;

    await user.save();

    res.json({
      success: true,
      message: 'Assessment skipped - will be offered again next time'
    });

  } catch (error) {
    console.error('[Screener Skip] Error:', error);
    res.status(500).json({ error: 'Failed to record skip' });
  }
});

module.exports = router;
