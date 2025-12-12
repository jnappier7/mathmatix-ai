/**
 * ADAPTIVE FLUENCY ENGINE
 *
 * Engineering fair, rigorous, and invisible time-based mastery tracking.
 *
 * PHILOSOPHY:
 * - A student with dyslexia reads slower, but might compute faster
 * - Hard-coding 60 seconds for everyone is bad code AND bad teaching
 * - We calculate z-scores based on Question Type AND User Baseline
 *
 * @module adaptiveFluency
 */

// ============================================================================
// STATISTICAL UTILITIES
// ============================================================================

/**
 * Calculate median of an array (robust to outliers)
 */
function median(values) {
  if (!values || values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate mean (average) of an array
 */
function mean(values) {
  if (!values || values.length === 0) return null;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
function standardDeviation(values) {
  if (!values || values.length < 2) return null;

  const avg = mean(values);
  const squaredDiffs = values.map(val => Math.pow(val - avg, 2));
  const variance = mean(squaredDiffs);
  return Math.sqrt(variance);
}

/**
 * Calculate z-score: (observed - expected) / std_deviation
 * Positive z-score = slower than expected
 * Negative z-score = faster than expected
 */
function calculateZScore(observed, expected, stdDev = null) {
  if (!observed || !expected) return 0;

  // If no standard deviation provided, use 30% of expected time as default variance
  const sigma = stdDev || (expected * 0.3);

  return (observed - expected) / sigma;
}

// ============================================================================
// ADAPTIVE TIME CALCULATION
// ============================================================================

/**
 * Calculate the "Ghost Timer" limit for a specific problem.
 *
 * This is the core of the Adaptive Fluency Engine.
 *
 * @param {Object} skill - The skill object from database with fluencyMetadata
 * @param {Object} userProfile - User's learningProfile with fluencyBaseline
 * @param {Object} options - Additional options
 * @returns {Object} { ghostLimit, strictLimit, warningThreshold, expectedTime }
 *
 * @example
 * const skill = {
 *   fluencyMetadata: {
 *     baseFluencyTime: 3.0,  // 3 seconds for multiplication fact
 *     fluencyType: 'reflex',
 *     toleranceFactor: 1.2
 *   }
 * };
 * const userProfile = {
 *   fluencyBaseline: { readSpeedModifier: 1.5 }  // Student needs 50% more time
 * };
 *
 * const timers = calculateAdaptiveTimeLimit(skill, userProfile);
 * // => { ghostLimit: 5.4, strictLimit: 3.6, warningThreshold: 4.5, expectedTime: 4.5 }
 */
function calculateAdaptiveTimeLimit(skill, userProfile, options = {}) {
  // Extract fluency metadata from skill
  const baseFluencyTime = skill?.fluencyMetadata?.baseFluencyTime || 30;
  const toleranceFactor = skill?.fluencyMetadata?.toleranceFactor || 2.0;

  // Extract user's speed modifier (1.0 = neurotypical, 1.5 = needs 50% more time)
  const readSpeedModifier = userProfile?.fluencyBaseline?.readSpeedModifier || 1.0;

  // STEP 1: Calculate the Expected Time for THIS student
  // This is the "fair" baseline adjusted for their processing speed
  const expectedTime = baseFluencyTime * readSpeedModifier;

  // STEP 2: Apply Tolerance Factor for the skill type
  // - Reflex problems: Low tolerance (1.2x) - must be fast
  // - Process problems: Moderate tolerance (2.0x) - should be smooth
  // - Algorithm problems: High tolerance (3.0x+) - methodical is fine
  const ghostLimit = expectedTime * toleranceFactor;

  // STEP 3: Calculate intermediate thresholds
  // Warning threshold: 75% of the way to ghost limit
  const warningThreshold = expectedTime + (ghostLimit - expectedTime) * 0.75;

  // Strict limit: For "fluent" designation (halfway between expected and ghost)
  const strictLimit = expectedTime + (ghostLimit - expectedTime) * 0.5;

  return {
    expectedTime: Math.round(expectedTime * 10) / 10,      // Expected time for this student
    strictLimit: Math.round(strictLimit * 10) / 10,        // Time for "fluent" badge
    warningThreshold: Math.round(warningThreshold * 10) / 10,  // Visual warning cue
    ghostLimit: Math.round(ghostLimit * 10) / 10,          // Hard cutoff for mastery credit
    baseFluencyTime,                                        // Reference: neurotypical time
    userModifier: readSpeedModifier,                       // Reference: user's handicap
    toleranceFactor                                         // Reference: skill tolerance
  };
}

/**
 * Determine if a response time qualifies for mastery credit
 *
 * @param {Number} responseTime - Time taken to answer (seconds)
 * @param {Object} timeLimits - Result from calculateAdaptiveTimeLimit()
 * @returns {Object} { qualifiesForMastery, fluencyLevel, feedback }
 */
function evaluateResponseTime(responseTime, timeLimits) {
  const { expectedTime, strictLimit, warningThreshold, ghostLimit } = timeLimits;

  // Calculate z-score
  const zScore = calculateZScore(responseTime, expectedTime);

  let fluencyLevel, qualifiesForMastery, feedback;

  if (responseTime <= strictLimit) {
    // FLUENT: Within expected range (eligible for fluency badge)
    fluencyLevel = 'fluent';
    qualifiesForMastery = true;
    feedback = 'Excellent speed! You\'ve got this down cold.';

  } else if (responseTime <= warningThreshold) {
    // PROFICIENT: A bit slow, but still good (full mastery credit)
    fluencyLevel = 'proficient';
    qualifiesForMastery = true;
    feedback = 'Good work! Keep practicing to build speed.';

  } else if (responseTime <= ghostLimit) {
    // DEVELOPING: Within ghost limit, but approaching threshold
    fluencyLevel = 'developing';
    qualifiesForMastery = true;
    feedback = 'Correct! Focus on building confidence to improve speed.';

  } else {
    // TOO SLOW: Exceeds ghost limit (no mastery credit, needs more practice)
    fluencyLevel = 'struggling';
    qualifiesForMastery = false;
    feedback = 'You got it right, but let\'s practice more to build fluency.';
  }

  return {
    qualifiesForMastery,
    fluencyLevel,
    feedback,
    zScore: Math.round(zScore * 100) / 100,
    responseTime,
    expectedTime,
    ghostLimit
  };
}

// ============================================================================
// BASELINE MEASUREMENT (During Initial Assessment)
// ============================================================================

/**
 * Calculate a student's baseline readSpeedModifier from assessment data
 *
 * This runs during initial assessment. We give students 5 reflex problems
 * and 5 process problems, measure their median times, and calculate how
 * they compare to neurotypical expectations.
 *
 * @param {Array} reflexTimes - Array of response times for reflex problems
 * @param {Array} processTimes - Array of response times for process problems
 * @returns {Object} { readSpeedModifier, confidence, measurements }
 */
function calculateBaselineModifier(reflexTimes, processTimes) {
  // Default expected times (neurotypical)
  const EXPECTED_REFLEX_TIME = 5.0;    // 5 seconds for basic facts
  const EXPECTED_PROCESS_TIME = 20.0;  // 20 seconds for one-step equations

  // Calculate medians (robust to outliers)
  const reflexMedian = median(reflexTimes);
  const processMedian = median(processTimes);

  if (!reflexMedian || !processMedian) {
    // Not enough data
    return {
      readSpeedModifier: 1.0,
      confidence: 'initial',
      measurements: {
        reflexProblems: reflexMedian,
        processProblems: processMedian
      }
    };
  }

  // Calculate individual modifiers
  const reflexModifier = reflexMedian / EXPECTED_REFLEX_TIME;
  const processModifier = processMedian / EXPECTED_PROCESS_TIME;

  // Take weighted average (process problems are more reliable)
  const readSpeedModifier = (reflexModifier * 0.3) + (processModifier * 0.7);

  // Clamp to reasonable bounds (0.5x to 3.0x)
  const clampedModifier = Math.max(0.5, Math.min(3.0, readSpeedModifier));

  // Determine confidence based on sample consistency
  let confidence = 'initial';
  const variance = Math.abs(reflexModifier - processModifier);

  if (variance < 0.3) {
    confidence = 'high';    // Very consistent
  } else if (variance < 0.6) {
    confidence = 'moderate'; // Somewhat consistent
  }

  return {
    readSpeedModifier: Math.round(clampedModifier * 100) / 100,
    confidence,
    measurements: {
      reflexProblems: Math.round(reflexMedian * 10) / 10,
      processProblems: Math.round(processMedian * 10) / 10
    },
    metadata: {
      reflexModifier: Math.round(reflexModifier * 100) / 100,
      processModifier: Math.round(processModifier * 100) / 100,
      variance: Math.round(variance * 100) / 100
    }
  };
}

// ============================================================================
// FLUENCY TRACKING UPDATES
// ============================================================================

/**
 * Update a student's fluency tracking data for a skill
 *
 * Call this after each problem attempt to track performance over time.
 *
 * @param {Object} currentTracking - Current fluencyTracking object from skillMastery
 * @param {Number} newTime - New response time to add
 * @param {Number} expectedTime - Expected time for this problem
 * @returns {Object} Updated fluencyTracking object
 */
function updateFluencyTracking(currentTracking = {}, newTime, expectedTime) {
  // Get recent times, add new time, keep last 20
  const recentTimes = [...(currentTracking.recentTimes || []), newTime].slice(-20);

  // Calculate statistics
  const medianTime = median(recentTimes);
  const averageTime = mean(recentTimes);

  // Calculate z-score
  const fluencyZScore = calculateZScore(medianTime, expectedTime);

  // Determine speed trend (if we have enough data)
  let speedTrend = 'unknown';
  if (recentTimes.length >= 10) {
    const firstHalf = recentTimes.slice(0, 5);
    const secondHalf = recentTimes.slice(-5);

    const firstAvg = mean(firstHalf);
    const secondAvg = mean(secondHalf);

    const improvement = ((firstAvg - secondAvg) / firstAvg) * 100;

    if (improvement > 10) {
      speedTrend = 'improving';      // Getting 10%+ faster
    } else if (improvement < -10) {
      speedTrend = 'declining';      // Getting 10%+ slower
    } else {
      speedTrend = 'stable';         // Within 10%
    }
  }

  return {
    recentTimes,
    medianTime: Math.round(medianTime * 10) / 10,
    averageTime: Math.round(averageTime * 10) / 10,
    fluencyZScore: Math.round(fluencyZScore * 100) / 100,
    speedTrend,
    lastFluencyUpdate: new Date()
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core functions
  calculateAdaptiveTimeLimit,
  evaluateResponseTime,
  calculateBaselineModifier,
  updateFluencyTracking,

  // Statistical utilities
  median,
  mean,
  standardDeviation,
  calculateZScore
};
