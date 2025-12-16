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
 * @module adaptiveScreener
 */

const { estimateAbility, hasConverged, hasPlateaued, thetaToPercentile, calculateInformation } = require('./irt');

// ===========================================================================
// DAMPENING CONVERGENCE ("THE WAVE")
// ===========================================================================

/**
 * Calculate adaptive jump size based on correctness and confidence
 *
 * THE "BACK AND DOWN" LOGIC:
 * - Correct: Large jump early (+1.5), dampens to small jump (+0.3) as confidence grows
 * - Incorrect: Consistent small step (-0.5) always
 *
 * @param {Boolean} isCorrect - Was the answer correct?
 * @param {Number} questionNumber - Question count (1-indexed)
 * @param {Number} standardError - Current standard error (confidence inverse)
 * @returns {Number} Difficulty adjustment
 */
function calculateJumpSize(isCorrect, questionNumber, standardError) {
  if (isCorrect) {
    // UPWARD JUMP (dampens with confidence)
    const baseJump = 1.5;  // Start with large jumps

    // Dampening factor: Higher confidence (lower SE) = smaller jumps
    // SE of 1.0 (low confidence) → dampen by 1.0x (full jump)
    // SE of 0.3 (high confidence) → dampen by 0.3x (small jump)
    const confidenceDampen = Math.max(standardError, 0.3);

    // Time-based dampening: Later questions = smaller jumps
    const timeDampen = Math.pow(0.9, questionNumber - 1);

    const jumpSize = baseJump * confidenceDampen * timeDampen;

    // Minimum jump of 0.3 (always move up at least a little)
    return Math.max(0.3, Math.min(jumpSize, 1.5));

  } else {
    // DOWNWARD STEP (consistent, gentle)
    return -0.5;  // Always step down half a difficulty level
  }
}

// ===========================================================================
// ADAPTIVE SCREENER SESSION
// ===========================================================================

/**
 * Initialize a new adaptive screener session
 *
 * @param {Object} options - { userId, startingTheta }
 * @returns {Object} Initial session state
 */
function initializeSession(options = {}) {
  const {
    userId,
    startingTheta = 0  // Default to average ability
  } = options;

  return {
    userId,
    sessionId: generateSessionId(),

    // Current ability estimate
    theta: startingTheta,
    standardError: Infinity,
    confidence: 0,  // 0 to 1
    cumulativeInformation: 0,  // Track total information gathered

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

    // Completion criteria (like ALEKS: 20-30 questions adaptive)
    minQuestions: 15,       // Minimum for reliable estimate
    targetQuestions: 20,    // Target for most students
    maxQuestions: 25,       // Hard cap to prevent fatigue
    seThresholdStringent: 0.25,  // Ideal confidence (early stop)
    seThresholdAcceptable: 0.30,  // Acceptable confidence (normal stop)
    seThresholdFallback: 0.35,    // Minimum at max questions
    minInformationGain: 0.05,     // Stop if gains < this for 3 questions

    // Skill coverage tracking
    testedSkills: [],
    testedSkillCategories: {
      'number-operations': 0,
      'algebra': 0,
      'geometry': 0,
      'advanced': 0
    },

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
  const abilityEstimate = estimateAbility(session.responses.map(r => ({
    difficulty: r.difficulty,
    discrimination: r.discrimination,
    correct: r.correct
  })));

  const previousTheta = session.theta;
  session.theta = abilityEstimate.theta;
  session.standardError = abilityEstimate.standardError;
  session.confidence = 1 / (1 + session.standardError);  // Convert SE to confidence (0-1)

  // Update cumulative information
  session.cumulativeInformation = informationBefore + questionInfo;

  // Track skill coverage
  if (!session.testedSkills.includes(response.skillId)) {
    session.testedSkills.push(response.skillId);
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
 * STOPPING RULES (research-based):
 * 1. Standard Error below threshold (primary)
 * 2. Minimum questions answered (reliability)
 * 3. Confidence interval width acceptable
 * 4. Information gains plateauing (efficiency)
 *
 * @param {Object} session - Current session state
 * @returns {Boolean} True if converged with high confidence
 */
function checkConvergenceCriteria(session) {
  const { questionCount, standardError, responses, minQuestions, seThresholdStringent, seThresholdAcceptable } = session;

  // Must meet minimum questions first
  if (questionCount < minQuestions) {
    return false;
  }

  // CRITERION 1: Standard Error below threshold
  const seConverged = standardError <= seThresholdAcceptable;

  // CRITERION 2: Confidence Interval width < 1.0 logit (95% CI = theta ± 1.96*SE)
  const confidenceIntervalWidth = 2 * 1.96 * standardError;
  const ciNarrow = confidenceIntervalWidth < 1.0;

  // CRITERION 3: Information gains plateauing (last 3 questions added < 0.05 each)
  let informationPlateaued = false;
  if (responses.length >= 3) {
    const last3 = responses.slice(-3);
    const avgRecentInfo = last3.reduce((sum, r) => sum + (r.informationGained || 0), 0) / 3;
    informationPlateaued = avgRecentInfo < session.minInformationGain;
  }

  // High confidence: SE below stringent threshold + narrow CI
  if (standardError <= seThresholdStringent && ciNarrow) {
    return true;
  }

  // Normal confidence: SE below acceptable + (narrow CI OR information plateau)
  if (seConverged && (ciNarrow || informationPlateaued)) {
    return true;
  }

  return false;
}

/**
 * Determine what to do next based on session state
 *
 * @param {Object} session - Current session state
 * @returns {Object} Recommendation for next action
 */
function determineNextAction(session) {
  // COMPLETION CRITERIA (Multi-tier like ALEKS)

  // 1. High confidence convergence (IDEAL STOP)
  if (session.converged && session.questionCount >= session.minQuestions) {
    return {
      action: 'interview',
      reason: 'converged',
      message: 'We\'ve found your level with high confidence! Let\'s explore a bit deeper.',
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
      action: 'interview',
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
      action: 'interview',
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
      action: 'interview',
      reason: 'plateaued',
      message: 'I see where your frontier is. Let\'s dig into that.',
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
      action: 'interview',
      reason: 'early-mastery',
      message: 'Impressive! You\'re clearly advanced. Let\'s confirm your level.',
      theta: session.theta,
      confidence: session.confidence,
      standardError: session.standardError,
      percentile: thetaToPercentile(session.theta)
    };
  }

  // CONTINUE SCREENING: Calculate next difficulty (use theta directly, not jump-based)
  // This allows maximum information selection to work properly
  return {
    action: 'continue',
    reason: 'gathering-data',
    targetDifficulty: session.theta,  // Next problem should target current theta estimate
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
  const accuracy = correctCount / session.responses.length;

  return {
    // Ability estimate
    theta: session.theta,
    standardError: session.standardError,
    confidence: session.confidence,
    percentile,

    // Performance
    questionsAnswered: session.questionCount,
    correctCount,
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
    recommendedAction: session.phase === 'interview' ? 'interview' : 'complete'
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
  calculateJumpSize
};
