/**
 * ADAPTIVE SCREENER (CAT - Computerized Adaptive Testing)
 *
 * PHILOSOPHY: "Scantron with a brain"
 *
 * THE ALGORITHM:
 * - Start at medium difficulty
 * - Correct → Jump UP (large early, dampens over time)
 * - Incorrect → Step DOWN (consistent -0.5)
 * - Converge when SE < 0.3 or plateau detected
 *
 * RESPECTS:
 * - Advanced students: Jump to hard problems fast, finish in 5 questions
 * - Struggling students: Drop to foundations fast, no extended frustration
 * - "Downward Inference": If you can solve calculus, you can add
 *
 * REFACTORED: Now uses centralized modules for configuration, skill selection,
 * and convergence. See catConfig.js, skillSelector.js, catConvergence.js.
 *
 * @module adaptiveScreener
 */

const { estimateAbility, estimateAbilityMAP, hasConverged, hasPlateaued, thetaToPercentile, calculateInformation } = require('./irt');
const { gradeToTheta, SESSION_DEFAULTS, getBroadCategory, calculateJumpSize: configCalculateJumpSize } = require('./catConfig');
const { checkConvergence, calculateProgress, determineNextAction: convergenceDetermineNextAction } = require('./catConvergence');
const { initializeCategoryTracking } = require('./skillSelector');

// ===========================================================================
// GRADE-BASED STARTING POINT
// ===========================================================================

/**
 * Map grade level to starting theta (IRT ability scale)
 *
 * DEPRECATED: Use gradeToTheta from catConfig.js directly.
 * This wrapper exists for backwards compatibility.
 *
 * @param {String|Number} grade - Grade level or gradeBand
 * @returns {Number} Starting theta for CAT
 */
function gradeToStartingTheta(grade) {
  // Use centralized function from catConfig
  return gradeToTheta(grade, null);
}

// ===========================================================================
// DAMPENING CONVERGENCE ("THE WAVE")
// ===========================================================================

/**
 * Calculate adaptive jump size based on correctness and confidence
 *
 * DEPRECATED: Use calculateJumpSize from catConfig.js directly.
 * This wrapper exists for backwards compatibility.
 *
 * @param {Boolean} isCorrect - Was the answer correct?
 * @param {Number} questionNumber - Question count (1-indexed)
 * @param {Number} standardError - Current standard error (confidence inverse)
 * @returns {Number} Difficulty adjustment
 */
function calculateJumpSize(isCorrect, questionNumber, standardError) {
  // Use centralized function from catConfig
  return configCalculateJumpSize(isCorrect, questionNumber, standardError);
}

// ===========================================================================
// ADAPTIVE SCREENER SESSION
// ===========================================================================

/**
 * Initialize a new adaptive screener session
 *
 * @param {Object} options - { userId, grade, startingTheta, pathway }
 * @returns {Object} Initial session state
 */
function initializeSession(options = {}) {
  const {
    userId,
    grade,           // Student's grade level (e.g., 7, "8th", "Algebra 1")
    pathway,         // Selected pathway (e.g., "ready-for-algebra-1")
    startingTheta    // Override: explicit starting theta
  } = options;

  // Determine starting theta from grade/pathway, or use explicit override
  let theta;
  if (startingTheta !== undefined) {
    theta = startingTheta;
    console.log(`[Screener] Using explicit startingTheta: ${theta}`);
  } else if (grade) {
    theta = gradeToStartingTheta(grade);
    console.log(`[Screener] Grade "${grade}" → startingTheta: ${theta}`);
  } else if (pathway) {
    // Extract grade hint from pathway name
    theta = gradeToStartingTheta(pathway);
    console.log(`[Screener] Pathway "${pathway}" → startingTheta: ${theta}`);
  } else {
    theta = 0;
    console.log(`[Screener] No grade/pathway provided, using default startingTheta: 0`);
  }

  // Use centralized session defaults from catConfig
  const {
    minQuestions, targetQuestions, maxQuestions,
    seThresholdStringent, seThresholdAcceptable, seThresholdFallback,
    minInformationGain, priorSD
  } = SESSION_DEFAULTS;

  return {
    userId,
    sessionId: generateSessionId(),

    // Current ability estimate
    theta: theta,
    standardError: Infinity,
    confidence: 0,  // 0 to 1
    cumulativeInformation: 0,  // Track total information gathered

    // Bayesian prior (for MAP estimation in early questions)
    priorMean: theta,  // Grade-based starting point
    priorSD: priorSD,  // From centralized config

    // Response history
    responses: [],

    // Session state
    questionCount: 0,
    converged: false,
    plateaued: false,
    frontierDetected: false,

    // Frontier information (where they start failing)
    frontier: {
      skillId: null,
      difficultyLevel: null,
      firstFailureTheta: null
    },

    // Timing
    startTime: Date.now(),
    endTime: null,

    // Completion criteria from centralized config
    minQuestions,
    targetQuestions,
    maxQuestions,
    seThresholdStringent,
    seThresholdAcceptable,
    seThresholdFallback,
    minInformationGain,

    // Skill coverage tracking (use centralized initializer)
    testedSkills: [],
    testedSkillCategories: initializeCategoryTracking(),

    // Phase tracking
    phase: 'screener'  // 'screener' | 'interview' | 'complete'
  };
}

/**
 * Process a student response and update session state
 *
 * @param {Object} session - Current session state
 * @param {Object} response - { problemId, skillId, difficulty, discrimination, correct, responseTime }
 * @returns {Object} Updated session with next recommendation
 */
function processResponse(session, response) {
  // Calculate information gained from this response (before updating theta)
  const informationBefore = session.cumulativeInformation;
  const questionInfo = calculateInformation(session.theta, [{
    difficulty: response.difficulty,
    discrimination: response.discrimination,
    correct: response.correct
  }]);

  // Add response to history
  session.responses.push({
    ...response,
    questionNumber: session.questionCount + 1,
    thetaBefore: session.theta,
    seBefore: session.standardError,
    informationGained: questionInfo
  });

  session.questionCount++;

  // Estimate ability using all responses so far
  const responsesForEstimation = session.responses.map(r => ({
    difficulty: r.difficulty,
    discrimination: r.discrimination,
    correct: r.correct
  }));

  // DEBUG: Log what we're passing to estimateAbility
  console.log(`[DEBUG] Estimating ability with ${responsesForEstimation.length} responses:`,
    responsesForEstimation.map(r => `d=${r.difficulty}, a=${r.discrimination}, c=${r.correct}`).join('; '));

  // HYBRID APPROACH: Use MAP (Bayesian) early, transition to MLE once sufficient data
  // MAP stabilizes early estimates with grade-based prior, MLE maximizes precision later
  let abilityEstimate;

  if (session.questionCount <= 10) {
    // Early questions: Use MAP with grade-based prior
    abilityEstimate = estimateAbilityMAP(responsesForEstimation, {
      priorMean: session.priorMean,
      priorSD: session.priorSD,
      initialTheta: session.theta
    });
    console.log(`[Screener] Using MAP estimation (Q${session.questionCount}) with prior μ=${session.priorMean.toFixed(2)}`);
  } else {
    // Later questions: Pure MLE (data-driven)
    abilityEstimate = estimateAbility(responsesForEstimation, {
      initialTheta: session.theta
    });
    console.log(`[Screener] Using MLE estimation (Q${session.questionCount})`);
  }

  const previousTheta = session.theta;
  session.theta = abilityEstimate.theta;
  session.standardError = abilityEstimate.standardError;
  session.confidence = 1 / (1 + session.standardError);  // Convert SE to confidence (0-1)

  // Update cumulative information
  session.cumulativeInformation = informationBefore + questionInfo;

  // Track skill coverage
  session.testedSkills.push(response.skillId);

  // Track category coverage for diversity balancing
  if (response.skillCategory) {
    // Use centralized category mapping from catConfig
    const broadCategory = getBroadCategory(response.skillCategory);

    // Initialize category tracking if not exists
    if (!session.testedSkillCategories) {
      session.testedSkillCategories = initializeCategoryTracking();
    }

    // Increment category counter
    session.testedSkillCategories[broadCategory] = (session.testedSkillCategories[broadCategory] || 0) + 1;
  }

  // Update response history with theta after
  session.responses[session.responses.length - 1].thetaAfter = session.theta;
  session.responses[session.responses.length - 1].thetaChange = Math.abs(session.theta - previousTheta);

  // FRONTIER DETECTION: Track first failure
  if (!response.correct && !session.frontier.firstFailureTheta) {
    session.frontier = {
      skillId: response.skillId,
      difficultyLevel: response.difficulty,
      firstFailureTheta: session.theta
    };
  }

  // Check convergence using new multi-criteria approach
  session.converged = checkConvergenceCriteria(session);

  // Check plateau
  session.plateaued = hasPlateaued(session.responses);

  // Detect if we should move to interview phase
  if (session.frontier.firstFailureTheta && session.questionCount >= session.minQuestions) {
    session.frontierDetected = true;
  }

  // Determine next action
  return determineNextAction(session);
}

/**
 * Check if multiple convergence criteria are met (like ALEKS/Scantron)
 *
 * DEPRECATED: Use checkConvergence from catConvergence.js for full details.
 * This wrapper exists for backwards compatibility.
 *
 * @param {Object} session - Current session state
 * @returns {Boolean} True if converged with high confidence
 */
function checkConvergenceCriteria(session) {
  // Use the new convergence module for comprehensive checking
  const result = checkConvergence(session);
  return result.converged;
}

/**
 * Determine what to do next based on session state
 *
 * @param {Object} session - Current session state
 * @returns {Object} Recommendation for next action
 */
function determineNextAction(session) {
  // COMPLETION CRITERIA (Multi-tier like ALEKS)

  // DEBUG: Log current state
  console.log(`[determineNextAction] questionCount=${session.questionCount}, maxQuestions=${session.maxQuestions}, targetQuestions=${session.targetQuestions}, SE=${session.standardError?.toFixed(3)}, converged=${session.converged}`);

  // 1. High confidence convergence (IDEAL STOP)
  if (session.converged && session.questionCount >= session.minQuestions) {
    return {
      action: 'complete',
      reason: 'converged',
      message: 'Assessment complete! We\'ve found your level with high confidence.',
      theta: session.theta,
      confidence: session.confidence,
      standardError: session.standardError,
      percentile: thetaToPercentile(session.theta),
      questionsAnswered: session.questionCount
    };
  }

  // 2. Target questions reached with acceptable confidence
  if (session.questionCount >= session.targetQuestions && session.standardError <= session.seThresholdFallback) {
    return {
      action: 'complete',
      reason: 'target-reached',
      message: 'Great progress! I have a good sense of your abilities.',
      theta: session.theta,
      confidence: session.confidence,
      standardError: session.standardError,
      percentile: thetaToPercentile(session.theta)
    };
  }

  // 3. Max questions reached (HARD STOP)
  if (session.questionCount >= session.maxQuestions) {
    return {
      action: 'complete',
      reason: 'max-questions',
      message: 'Excellent work! I\'ve gathered enough information about your abilities.',
      theta: session.theta,
      confidence: session.confidence,
      standardError: session.standardError,
      percentile: thetaToPercentile(session.theta)
    };
  }

  // 4. Plateau detected (EFFICIENCY STOP)
  if (session.plateaued && session.questionCount >= session.minQuestions) {
    return {
      action: 'complete',
      reason: 'plateaued',
      message: 'Assessment complete! We\'ve identified your current level.',
      theta: session.theta,
      frontier: session.frontier,
      standardError: session.standardError
    };
  }

  // 5. Early high confidence (ADVANCED STUDENTS - like when you ace first 5 calculus problems)
  if (session.questionCount >= session.minQuestions &&
      session.standardError <= session.seThresholdStringent &&
      session.responses.slice(-5).every(r => r.correct)) {
    return {
      action: 'complete',
      reason: 'early-mastery',
      message: 'Impressive! You\'re clearly advanced. Assessment complete!',
      theta: session.theta,
      confidence: session.confidence,
      standardError: session.standardError,
      percentile: thetaToPercentile(session.theta)
    };
  }

  // 6. Very early stopping for extremely clear cases (5 questions minimum)
  // - Perfect streak of 5+ at high difficulty (theta > 1.5)
  // - Or perfect failure of 5+ at low difficulty (theta < -1.5)
  if (session.questionCount >= 5) {
    const last5 = session.responses.slice(-5);
    const allCorrect = last5.every(r => r.correct);
    const allIncorrect = last5.every(r => !r.correct);
    const avgDifficulty = last5.reduce((sum, r) => sum + r.difficulty, 0) / last5.length;

    // Advanced student: 5 correct in a row at high difficulty
    if (allCorrect && avgDifficulty > 1.0 && session.theta > 1.5 && session.standardError <= 0.35) {
      return {
        action: 'complete',
        reason: 'very-advanced',
        message: 'Exceptional! You\'re performing at an advanced level. Assessment complete!',
        theta: session.theta,
        confidence: session.confidence,
        standardError: session.standardError,
        percentile: thetaToPercentile(session.theta)
      };
    }

    // Struggling student: 5 incorrect in a row at low difficulty
    if (allIncorrect && avgDifficulty < -0.5 && session.theta < -1.5 && session.standardError <= 0.35) {
      return {
        action: 'complete',
        reason: 'foundational-needs',
        message: 'Assessment complete! We have a clear sense of where to focus.',
        theta: session.theta,
        confidence: session.confidence,
        standardError: session.standardError,
        percentile: thetaToPercentile(session.theta)
      };
    }
  }

  // CONTINUE SCREENING
  // Note: Target difficulty is calculated in the route handler using dampened jumps
  // to prevent wild swings between question difficulties
  return {
    action: 'continue',
    reason: 'gathering-data',
    theta: session.theta,
    standardError: session.standardError,
    confidence: session.confidence,
    questionCount: session.questionCount,
    progress: {
      min: session.minQuestions,
      current: session.questionCount,
      target: session.targetQuestions,
      max: session.maxQuestions
    }
  };
}

// ===========================================================================
// FRONTIER ANALYSIS
// ===========================================================================

/**
 * Analyze frontier to determine which skills to probe in interview
 *
 * @param {Object} session - Completed screener session
 * @param {Array} skillTree - Available skills
 * @returns {Array} Skills to probe in interview phase
 */
function identifyInterviewSkills(session, skillTree) {
  const { theta, frontier, responses } = session;

  // Find skills at the frontier (difficulty near theta ± 0.5)
  const frontierSkills = [];

  for (const response of responses) {
    const diffFromTheta = Math.abs(response.difficulty - theta);

    // Problems near theta that were failed = frontier
    if (!response.correct && diffFromTheta < 0.7) {
      if (!frontierSkills.find(s => s.skillId === response.skillId)) {
        frontierSkills.push({
          skillId: response.skillId,
          difficulty: response.difficulty,
          needsProbe: true,
          reason: 'failed-near-theta'
        });
      }
    }

    // Problems just below theta that were barely passed = worth probing
    if (response.correct && diffFromTheta < 0.5 && response.responseTime > 45) {
      if (!frontierSkills.find(s => s.skillId === response.skillId)) {
        frontierSkills.push({
          skillId: response.skillId,
          difficulty: response.difficulty,
          needsProbe: true,
          reason: 'slow-correct-near-theta'
        });
      }
    }
  }

  // Limit to top 3 skills for interview
  return frontierSkills.slice(0, 3);
}

// ===========================================================================
// REPORTING
// ===========================================================================

/**
 * Generate final screener report
 *
 * @param {Object} session - Completed session
 * @returns {Object} Summary report
 */
function generateReport(session) {
  const percentile = thetaToPercentile(session.theta);

  // Calculate skill-level mastery based on theta
  const skillLevelEstimates = categorizeSkills(session.theta, session.responses);

  // Performance summary
  const correctCount = session.responses.filter(r => r.correct).length;
  const totalQuestions = session.responses.length;
  const accuracy = totalQuestions > 0 ? correctCount / totalQuestions : 0;

  // DEBUG: Log accuracy calculation
  console.log(`[Screener Report] Correct: ${correctCount}/${totalQuestions} = ${(accuracy * 100).toFixed(1)}%`);

  return {
    // Ability estimate
    theta: session.theta,
    standardError: session.standardError,
    confidence: session.confidence,
    percentile,

    // Performance
    questionsAnswered: session.questionCount,
    correctCount,
    totalQuestions,
    accuracy: Math.round(accuracy * 100),

    // Time
    duration: session.endTime - session.startTime,
    averageTimePerProblem: (session.endTime - session.startTime) / session.questionCount,

    // Skill categorization
    masteredSkills: skillLevelEstimates.mastered,
    learningSkills: skillLevelEstimates.learning,
    readySkills: skillLevelEstimates.ready,

    // Frontier
    frontier: session.frontier,
    frontierSkills: skillLevelEstimates.frontier,

    // Next steps
    recommendedAction: 'complete'
  };
}

/**
 * Categorize skills based on ability estimate and response pattern
 *
 * @param {Number} theta - Ability estimate
 * @param {Array} responses - All responses
 * @returns {Object} { mastered, learning, ready, frontier }
 */
function categorizeSkills(theta, responses) {
  const skillPerformance = {};

  // Aggregate performance by skill
  for (const response of responses) {
    if (!skillPerformance[response.skillId]) {
      skillPerformance[response.skillId] = {
        attempts: 0,
        correct: 0,
        avgDifficulty: 0,
        difficulties: []
      };
    }

    const perf = skillPerformance[response.skillId];
    perf.attempts++;
    if (response.correct) perf.correct++;
    perf.difficulties.push(response.difficulty);
  }

  // Calculate average difficulty for each skill
  for (const skillId in skillPerformance) {
    const perf = skillPerformance[skillId];
    perf.avgDifficulty = perf.difficulties.reduce((a, b) => a + b, 0) / perf.difficulties.length;
    perf.accuracy = perf.correct / perf.attempts;
  }

  // Categorize
  const mastered = [];
  const learning = [];
  const ready = [];
  const frontier = [];

  for (const [skillId, perf] of Object.entries(skillPerformance)) {
    // Mastered: High accuracy AND difficulty well below theta
    if (perf.accuracy >= 0.8 && perf.avgDifficulty < theta - 0.5) {
      mastered.push(skillId);
    }
    // Frontier: Mixed performance at theta level
    else if (Math.abs(perf.avgDifficulty - theta) < 0.5) {
      frontier.push(skillId);
    }
    // Learning: Some correct, difficulty near or below theta
    else if (perf.correct > 0 && perf.avgDifficulty <= theta) {
      learning.push(skillId);
    }
    // Ready: Not attempted or difficulty above theta
    else {
      ready.push(skillId);
    }
  }

  return { mastered, learning, ready, frontier };
}

// ===========================================================================
// UTILITIES
// ===========================================================================

function generateSessionId() {
  return `screener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ===========================================================================
// EXPORTS
// ===========================================================================

module.exports = {
  // Session management
  initializeSession,
  processResponse,
  determineNextAction,
  checkConvergenceCriteria,

  // Analysis
  identifyInterviewSkills,
  generateReport,
  categorizeSkills,

  // Utilities
  calculateJumpSize,
  gradeToStartingTheta
};
