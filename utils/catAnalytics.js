/**
 * CAT ANALYTICS MODULE
 *
 * Track test quality metrics to measure and improve CAT performance.
 *
 * KEY METRICS:
 * - Time to convergence (questions to stable estimate)
 * - Estimation accuracy (for validation studies)
 * - Test efficiency (information per question)
 * - Category coverage (domain balance)
 *
 * @module catAnalytics
 */

const { SESSION_DEFAULTS } = require('./catConfig');

// ===========================================================================
// SESSION METRICS
// ===========================================================================

/**
 * Calculate metrics for a completed CAT session
 *
 * @param {Object} session - Completed session object
 * @returns {Object} Session metrics
 */
function calculateSessionMetrics(session) {
  const { responses, theta, standardError, questionCount, startTime, endTime } = session;

  if (!responses || responses.length === 0) {
    return null;
  }

  // Time metrics
  const totalDuration = endTime ? endTime - startTime : Date.now() - startTime;
  const avgTimePerQuestion = totalDuration / questionCount;

  // Accuracy metrics
  const correctCount = responses.filter(r => r.correct).length;
  const accuracy = correctCount / responses.length;

  // Efficiency metrics
  const totalInformation = responses.reduce((sum, r) => sum + (r.informationGained || 0), 0);
  const avgInformationPerQuestion = totalInformation / responses.length;

  // Convergence metrics
  const seHistory = responses.map(r => r.seBefore).filter(se => se && isFinite(se));
  const seReduction = seHistory.length > 1
    ? seHistory[0] - seHistory[seHistory.length - 1]
    : 0;

  // Theta stability (variance in last 5 estimates)
  const last5Thetas = responses.slice(-5).map(r => r.thetaAfter).filter(t => t !== undefined);
  const thetaVariance = last5Thetas.length > 1
    ? calculateVariance(last5Thetas)
    : 0;

  // Category balance
  const categoryDistribution = calculateCategoryDistribution(responses);

  // Difficulty targeting accuracy
  const difficultyErrors = responses.map(r => {
    if (r.difficulty === undefined || r.thetaBefore === undefined) return null;
    return Math.abs(r.difficulty - r.thetaBefore);
  }).filter(e => e !== null);

  const avgDifficultyError = difficultyErrors.length > 0
    ? difficultyErrors.reduce((a, b) => a + b, 0) / difficultyErrors.length
    : 0;

  return {
    // Session info
    sessionId: session.sessionId,
    questionCount,
    completionReason: session.converged ? 'converged' : (session.plateaued ? 'plateaued' : 'max-questions'),

    // Time
    totalDurationMs: totalDuration,
    avgTimePerQuestionMs: Math.round(avgTimePerQuestion),

    // Performance
    accuracy: Math.round(accuracy * 100),
    correctCount,

    // Ability estimate quality
    finalTheta: theta,
    finalSE: standardError,
    seReduction: Math.round(seReduction * 100) / 100,
    thetaStability: Math.round(thetaVariance * 1000) / 1000,

    // Efficiency
    totalInformation: Math.round(totalInformation * 100) / 100,
    avgInformationPerQuestion: Math.round(avgInformationPerQuestion * 100) / 100,

    // Targeting
    avgDifficultyError: Math.round(avgDifficultyError * 100) / 100,

    // Coverage
    categoryDistribution,
    categoryBalance: calculateCategoryBalance(categoryDistribution),
  };
}

/**
 * Calculate category distribution from responses
 */
function calculateCategoryDistribution(responses) {
  const distribution = {
    'number-operations': 0,
    'algebra': 0,
    'geometry': 0,
    'advanced': 0,
  };

  for (const r of responses) {
    if (r.skillCategory && distribution[r.skillCategory] !== undefined) {
      distribution[r.skillCategory]++;
    }
  }

  return distribution;
}

/**
 * Calculate category balance score (0-1, 1 = perfectly balanced)
 */
function calculateCategoryBalance(distribution) {
  const counts = Object.values(distribution);
  const total = counts.reduce((a, b) => a + b, 0);

  if (total === 0) return 0;

  // Expected proportion for perfect balance
  const expected = total / counts.length;

  // Calculate deviation from expected
  const deviation = counts.reduce((sum, c) => sum + Math.abs(c - expected), 0);
  const maxDeviation = 2 * total * (1 - 1 / counts.length);

  // Convert to 0-1 score (1 = perfectly balanced)
  return maxDeviation > 0 ? 1 - (deviation / maxDeviation) : 1;
}

/**
 * Calculate variance of an array of numbers
 */
function calculateVariance(arr) {
  if (arr.length < 2) return 0;

  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const squaredDiffs = arr.map(x => Math.pow(x - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / arr.length;
}

// ===========================================================================
// AGGREGATE METRICS
// ===========================================================================

/**
 * Calculate aggregate metrics across multiple sessions
 *
 * @param {Array} sessions - Array of session objects
 * @returns {Object} Aggregate metrics
 */
function calculateAggregateMetrics(sessions) {
  if (!sessions || sessions.length === 0) {
    return null;
  }

  const metrics = sessions
    .map(s => calculateSessionMetrics(s))
    .filter(m => m !== null);

  if (metrics.length === 0) return null;

  // Aggregate calculations
  const avgQuestions = average(metrics.map(m => m.questionCount));
  const avgDuration = average(metrics.map(m => m.totalDurationMs));
  const avgAccuracy = average(metrics.map(m => m.accuracy));
  const avgSE = average(metrics.map(m => m.finalSE));
  const avgEfficiency = average(metrics.map(m => m.avgInformationPerQuestion));
  const avgBalance = average(metrics.map(m => m.categoryBalance));

  // Convergence rate
  const convergedCount = metrics.filter(m => m.completionReason === 'converged').length;
  const convergenceRate = convergedCount / metrics.length;

  // SE threshold achievement
  const achievedThreshold = metrics.filter(m => m.finalSE <= SESSION_DEFAULTS.seThresholdAcceptable).length;
  const thresholdRate = achievedThreshold / metrics.length;

  return {
    sessionCount: metrics.length,

    // Central tendencies
    avgQuestionsToComplete: Math.round(avgQuestions * 10) / 10,
    avgDurationMinutes: Math.round(avgDuration / 60000 * 10) / 10,
    avgAccuracy: Math.round(avgAccuracy),
    avgFinalSE: Math.round(avgSE * 100) / 100,

    // Quality indicators
    convergenceRate: Math.round(convergenceRate * 100),
    thresholdAchievementRate: Math.round(thresholdRate * 100),
    avgEfficiency: Math.round(avgEfficiency * 100) / 100,
    avgCategoryBalance: Math.round(avgBalance * 100),

    // Distribution
    questionDistribution: {
      min: Math.min(...metrics.map(m => m.questionCount)),
      max: Math.max(...metrics.map(m => m.questionCount)),
      median: median(metrics.map(m => m.questionCount)),
    },

    seDistribution: {
      min: Math.min(...metrics.map(m => m.finalSE)),
      max: Math.max(...metrics.map(m => m.finalSE)),
      median: median(metrics.map(m => m.finalSE)),
    },
  };
}

/**
 * Calculate average
 */
function average(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Calculate median
 */
function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ===========================================================================
// QUALITY CHECKS
// ===========================================================================

/**
 * Check if a session meets quality standards
 *
 * @param {Object} metrics - Session metrics
 * @returns {Object} Quality assessment
 */
function assessSessionQuality(metrics) {
  if (!metrics) return { quality: 'unknown', issues: ['No metrics available'] };

  const issues = [];

  // Check SE threshold
  if (metrics.finalSE > SESSION_DEFAULTS.seThresholdFallback) {
    issues.push(`High uncertainty (SE=${metrics.finalSE})`);
  }

  // Check efficiency
  if (metrics.avgInformationPerQuestion < 0.1) {
    issues.push('Low information gain per question');
  }

  // Check category balance
  if (metrics.categoryBalance < 0.5) {
    issues.push('Poor category coverage');
  }

  // Check theta stability
  if (metrics.thetaStability > 0.1) {
    issues.push('Unstable theta estimate');
  }

  // Determine overall quality
  let quality;
  if (issues.length === 0) {
    quality = 'excellent';
  } else if (issues.length === 1) {
    quality = 'good';
  } else if (issues.length <= 2) {
    quality = 'acceptable';
  } else {
    quality = 'poor';
  }

  return { quality, issues };
}

// ===========================================================================
// EXPORTS
// ===========================================================================

module.exports = {
  // Session-level
  calculateSessionMetrics,

  // Aggregate
  calculateAggregateMetrics,

  // Quality
  assessSessionQuality,

  // Helpers
  calculateCategoryDistribution,
  calculateCategoryBalance,
  calculateVariance,
};
