/**
 * CAT CONVERGENCE MODULE
 *
 * Smart stopping rules for adaptive testing.
 * Uses multiple criteria to determine when we have sufficient confidence.
 *
 * STOPPING CRITERIA:
 * 1. Standard Error threshold (primary)
 * 2. Confidence Interval width
 * 3. Information gain plateau
 * 4. Response pattern stability
 * 5. Early mastery/struggle detection
 *
 * @module catConvergence
 */

const { SESSION_DEFAULTS } = require('./catConfig');
const { thetaToPercentile } = require('./irt');

// ===========================================================================
// CONVERGENCE CRITERIA
// ===========================================================================

/**
 * Check if Standard Error has reached acceptable threshold
 *
 * @param {Number} standardError - Current SE
 * @param {String} threshold - 'stringent' | 'acceptable' | 'fallback'
 * @returns {Boolean}
 */
function checkSEThreshold(standardError, threshold = 'acceptable') {
  const thresholds = {
    stringent: SESSION_DEFAULTS.seThresholdStringent,
    acceptable: SESSION_DEFAULTS.seThresholdAcceptable,
    fallback: SESSION_DEFAULTS.seThresholdFallback,
  };

  return standardError <= (thresholds[threshold] || thresholds.acceptable);
}

/**
 * Check if Confidence Interval is narrow enough
 *
 * Uses 95% CI = theta +/- 1.96 * SE
 * Target width: < 1.0 logit (high precision)
 *
 * @param {Number} standardError - Current SE
 * @param {Number} targetWidth - Maximum acceptable CI width
 * @returns {Boolean}
 */
function checkConfidenceInterval(standardError, targetWidth = 1.0) {
  const ciWidth = 2 * 1.96 * standardError; // 95% CI
  return ciWidth < targetWidth;
}

/**
 * Check if information gain has plateaued
 *
 * Detects when recent questions aren't adding meaningful information.
 *
 * @param {Array} responses - Response history with informationGained
 * @param {Number} windowSize - Number of recent questions to check
 * @returns {Boolean}
 */
function checkInformationPlateau(responses, windowSize = 3) {
  if (responses.length < windowSize) return false;

  const recentResponses = responses.slice(-windowSize);
  const avgRecentInfo = recentResponses.reduce((sum, r) =>
    sum + (r.informationGained || 0), 0) / windowSize;

  return avgRecentInfo < SESSION_DEFAULTS.minInformationGain;
}

/**
 * Check if theta estimate has stabilized
 *
 * Looks for small changes in theta over recent questions.
 *
 * @param {Array} responses - Response history with thetaAfter
 * @param {Number} windowSize - Number of recent questions to check
 * @param {Number} stabilityThreshold - Max allowed theta range
 * @returns {Boolean}
 */
function checkThetaStability(responses, windowSize = 5, stabilityThreshold = 0.3) {
  if (responses.length < windowSize) return false;

  const recentThetas = responses.slice(-windowSize).map(r => r.thetaAfter);
  const thetaRange = Math.max(...recentThetas) - Math.min(...recentThetas);

  return thetaRange < stabilityThreshold;
}

/**
 * Detect alternating response pattern (plateau indicator)
 *
 * When student alternates correct/incorrect multiple times,
 * they've likely reached their true ability boundary.
 *
 * @param {Array} responses - Response history
 * @param {Number} windowSize - Number of recent questions to check
 * @param {Number} minAlternations - Minimum alternations to detect
 * @returns {Boolean}
 */
function checkAlternatingPattern(responses, windowSize = 5, minAlternations = 3) {
  if (responses.length < windowSize) return false;

  const recent = responses.slice(-windowSize);
  let alternations = 0;

  for (let i = 0; i < recent.length - 1; i++) {
    if (recent[i].correct !== recent[i + 1].correct) {
      alternations++;
    }
  }

  return alternations >= minAlternations;
}

/**
 * Detect early mastery (advanced student)
 *
 * Student gets 5+ correct in a row at high difficulty.
 *
 * @param {Array} responses - Response history
 * @param {Number} theta - Current ability estimate
 * @returns {Object|null} Detection result or null
 */
function detectEarlyMastery(responses, theta) {
  if (responses.length < 5) return null;

  const last5 = responses.slice(-5);
  const allCorrect = last5.every(r => r.correct);
  const avgDifficulty = last5.reduce((sum, r) => sum + r.difficulty, 0) / 5;

  if (allCorrect && avgDifficulty > 1.0 && theta > 1.5) {
    return {
      detected: true,
      reason: 'early-mastery',
      message: 'Exceptional performance at advanced level',
      avgDifficulty,
      theta,
    };
  }

  return null;
}

/**
 * Detect foundational needs (struggling student)
 *
 * Student gets 5+ incorrect in a row at low difficulty.
 *
 * @param {Array} responses - Response history
 * @param {Number} theta - Current ability estimate
 * @returns {Object|null} Detection result or null
 */
function detectFoundationalNeeds(responses, theta) {
  if (responses.length < 5) return null;

  const last5 = responses.slice(-5);
  const allIncorrect = last5.every(r => !r.correct);
  const avgDifficulty = last5.reduce((sum, r) => sum + r.difficulty, 0) / 5;

  if (allIncorrect && avgDifficulty < -0.5 && theta < -1.5) {
    return {
      detected: true,
      reason: 'foundational-needs',
      message: 'Need to focus on foundational skills',
      avgDifficulty,
      theta,
    };
  }

  return null;
}

// ===========================================================================
// MAIN CONVERGENCE CHECK
// ===========================================================================

/**
 * Comprehensive convergence check using multiple criteria
 *
 * Returns detailed result with reason and confidence level.
 *
 * @param {Object} session - Current session state
 * @returns {Object} { converged, reason, confidence, details }
 */
function checkConvergence(session) {
  const {
    questionCount,
    standardError,
    responses,
    theta,
    minQuestions,
    targetQuestions,
    maxQuestions,
  } = session;

  const result = {
    converged: false,
    reason: null,
    confidence: 'low',
    canStop: false,
    details: {},
  };

  // Gather all criteria results
  const criteria = {
    seStringent: checkSEThreshold(standardError, 'stringent'),
    seAcceptable: checkSEThreshold(standardError, 'acceptable'),
    seFallback: checkSEThreshold(standardError, 'fallback'),
    ciNarrow: checkConfidenceInterval(standardError),
    infoPlateau: checkInformationPlateau(responses),
    thetaStable: checkThetaStability(responses),
    alternating: checkAlternatingPattern(responses),
    earlyMastery: detectEarlyMastery(responses, theta),
    foundationalNeeds: detectFoundationalNeeds(responses, theta),
  };

  result.details = criteria;

  // Must meet minimum questions first
  if (questionCount < minQuestions) {
    result.reason = 'min-questions-not-met';
    return result;
  }

  // TIER 1: High confidence convergence (ideal stop)
  if (criteria.seStringent && criteria.ciNarrow) {
    result.converged = true;
    result.canStop = true;
    result.reason = 'high-confidence';
    result.confidence = 'high';
    return result;
  }

  // TIER 2: Acceptable confidence with supporting evidence
  if (criteria.seAcceptable && (criteria.ciNarrow || criteria.infoPlateau)) {
    result.converged = true;
    result.canStop = true;
    result.reason = 'acceptable-confidence';
    result.confidence = 'medium';
    return result;
  }

  // TIER 3: Early mastery detection
  if (criteria.earlyMastery?.detected && criteria.seAcceptable) {
    result.converged = true;
    result.canStop = true;
    result.reason = 'early-mastery';
    result.confidence = 'high';
    result.message = criteria.earlyMastery.message;
    return result;
  }

  // TIER 4: Foundational needs detection
  if (criteria.foundationalNeeds?.detected && criteria.seAcceptable) {
    result.converged = true;
    result.canStop = true;
    result.reason = 'foundational-needs';
    result.confidence = 'medium';
    result.message = criteria.foundationalNeeds.message;
    return result;
  }

  // TIER 5: Plateau detection
  if (criteria.alternating && criteria.thetaStable && criteria.seFallback) {
    result.converged = true;
    result.canStop = true;
    result.reason = 'plateau-detected';
    result.confidence = 'medium';
    return result;
  }

  // TIER 6: Target questions reached with fallback SE
  if (questionCount >= targetQuestions && criteria.seFallback) {
    result.converged = true;
    result.canStop = true;
    result.reason = 'target-reached';
    result.confidence = 'medium';
    return result;
  }

  // TIER 7: Max questions (hard stop)
  if (questionCount >= maxQuestions) {
    result.converged = true;
    result.canStop = true;
    result.reason = 'max-questions';
    result.confidence = criteria.seFallback ? 'medium' : 'low';
    return result;
  }

  // Continue testing
  result.reason = 'continue';
  return result;
}

// ===========================================================================
// PROGRESS CALCULATION
// ===========================================================================

/**
 * Calculate adaptive progress for UI display
 *
 * Progress reflects confidence, not just question count.
 *
 * @param {Object} session - Current session state
 * @returns {Object} Progress metrics
 */
function calculateProgress(session) {
  const {
    questionCount,
    minQuestions,
    standardError,
    targetQuestions,
    maxQuestions,
  } = session;

  const seThreshold = SESSION_DEFAULTS.seThresholdAcceptable;

  // Phase 1: Before minimum questions (0-50%)
  let percentComplete;
  if (questionCount < minQuestions) {
    percentComplete = Math.round((questionCount / minQuestions) * 50);
  } else {
    // Phase 2: Confidence-based progress (50-100%)
    const startingSE = 1.0;
    const currentSE = Math.max(seThreshold, Math.min(startingSE, standardError));
    const confidenceGained = startingSE - currentSE;
    const totalConfidenceNeeded = startingSE - seThreshold;
    const confidenceRatio = confidenceGained / totalConfidenceNeeded;
    percentComplete = Math.min(100, Math.round(50 + confidenceRatio * 50));
  }

  // Determine confidence level for UI
  let confidenceLevel, confidenceAchieved, confidenceDescription;

  if (questionCount < minQuestions) {
    confidenceLevel = 'gathering';
    confidenceAchieved = false;
    confidenceDescription = 'Building baseline';
  } else if (standardError <= SESSION_DEFAULTS.seThresholdStringent) {
    confidenceLevel = 'high';
    confidenceAchieved = true;
    confidenceDescription = 'High confidence';
  } else if (standardError <= SESSION_DEFAULTS.seThresholdAcceptable) {
    confidenceLevel = 'medium';
    confidenceAchieved = true;
    confidenceDescription = 'Confident';
  } else {
    confidenceLevel = 'low';
    confidenceAchieved = false;
    confidenceDescription = 'Refining estimate';
  }

  return {
    percentComplete,
    confidenceLevel,
    confidenceAchieved,
    confidenceDescription,
    questionCount,
    minQuestions,
    targetQuestions,
    maxQuestions,
  };
}

// ===========================================================================
// NEXT ACTION DETERMINATION
// ===========================================================================

/**
 * Determine next action based on convergence check
 *
 * @param {Object} session - Current session state
 * @returns {Object} Action recommendation
 */
function determineNextAction(session) {
  const convergence = checkConvergence(session);
  const { theta, standardError, questionCount, frontier } = session;

  if (convergence.canStop) {
    // Decide between interview and complete
    const shouldInterview = frontier?.firstFailureTheta != null ||
                           convergence.reason === 'plateau-detected';

    return {
      action: shouldInterview ? 'interview' : 'complete',
      reason: convergence.reason,
      confidence: convergence.confidence,
      message: getActionMessage(convergence.reason),
      theta,
      standardError,
      percentile: thetaToPercentile(theta),
      questionsAnswered: questionCount,
    };
  }

  // Continue testing
  return {
    action: 'continue',
    reason: 'gathering-data',
    theta,
    standardError,
    progress: calculateProgress(session),
  };
}

/**
 * Get user-friendly message for action reason
 *
 * @param {String} reason - Convergence reason
 * @returns {String} User-friendly message
 */
function getActionMessage(reason) {
  const messages = {
    'high-confidence': "We've found your level with high confidence!",
    'acceptable-confidence': "Great progress! I have a good sense of your abilities.",
    'early-mastery': "Impressive! You're clearly advanced.",
    'foundational-needs': "I have a clear sense of where to start.",
    'plateau-detected': "I see where your frontier is. Let's dig into that.",
    'target-reached': "Excellent work! I've gathered enough information.",
    'max-questions': "Thanks for your patience! Let's see your results.",
  };

  return messages[reason] || "Assessment complete!";
}

// ===========================================================================
// EXPORTS
// ===========================================================================

module.exports = {
  // Individual criteria checks
  checkSEThreshold,
  checkConfidenceInterval,
  checkInformationPlateau,
  checkThetaStability,
  checkAlternatingPattern,
  detectEarlyMastery,
  detectFoundationalNeeds,

  // Main functions
  checkConvergence,
  calculateProgress,
  determineNextAction,
  getActionMessage,
};
