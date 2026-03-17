/**
 * COGNITIVE LOAD ESTIMATOR
 *
 * Models the student's cognitive load in real-time from behavioral signals.
 * When cognitive load exceeds capacity, learning stops — the student is just
 * surviving, not understanding.
 *
 * This goes beyond session mood (which tracks emotional state) to model
 * the COGNITIVE dimension: how much working memory is being consumed.
 *
 * COGNITIVE LOAD THEORY (Sweller, 1988):
 *   - Intrinsic load: complexity inherent to the material
 *   - Extraneous load: complexity from poor instruction/interface
 *   - Germane load: productive processing that leads to learning
 *   Total load must stay within working memory capacity.
 *
 * SIGNALS WE TRACK:
 *   1. Response time trends (slowing = overload)
 *   2. Error pattern changes (sudden errors after success = capacity exceeded)
 *   3. Hint frequency (increased hints = struggling to hold info in WM)
 *   4. Message length changes (shorter messages = cognitive tunneling)
 *   5. Problem complexity vs. student level (ZPD alignment)
 *   6. Time-on-task fatigue (diminishing returns after ~25 min)
 *
 * RESEARCH BASIS:
 *   - Dual-Stream Deep KT + Cognitive Load (Nature Scientific Reports, 2025)
 *     87.5% prediction accuracy, 24.6% learning efficiency improvement
 *   - Sweller's Cognitive Load Theory (1988, 2011)
 *   - Paas & van Merriënboer: Cognitive load measurement
 *   - Kalyuga: Expertise reversal effect
 *
 * @module cognitiveLoadEstimator
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const COGNITIVE_LOAD_CONFIG = {
  // Cognitive load levels (0-1 scale)
  levels: {
    LOW: { min: 0, max: 0.3, label: 'low' },
    OPTIMAL: { min: 0.3, max: 0.7, label: 'optimal' },
    HIGH: { min: 0.7, max: 0.85, label: 'high' },
    OVERLOAD: { min: 0.85, max: 1.0, label: 'overload' },
  },

  // Signal weights (how much each signal contributes to load estimate)
  signalWeights: {
    responseTimeAcceleration: 0.20,  // Response time trend
    errorBurstDetection: 0.25,       // Sudden error clusters
    hintEscalation: 0.15,            // Increasing hint usage
    messageBrevity: 0.10,            // Shrinking message length
    complexityMismatch: 0.15,        // Problem too hard for level
    timeOnTaskFatigue: 0.15,         // Session duration fatigue
  },

  // Thresholds
  thresholds: {
    responseTimeSlowdownFactor: 1.5,  // 50% slower = elevated signal
    errorBurstWindow: 4,              // Errors within 4 problems = burst
    errorBurstThreshold: 3,           // 3+ errors in window = burst
    hintEscalationWindow: 6,          // Hint frequency measured over 6 problems
    hintEscalationThreshold: 0.5,     // 50%+ of problems needed hints = escalation
    messageBrevityThreshold: 3,       // Average < 3 words = tunneling
    fatigueOnsetMinutes: 25,          // Fatigue starts after 25 minutes
    fatiguePeakMinutes: 45,           // Full fatigue penalty at 45 minutes
  },
};

// ============================================================================
// CORE ESTIMATOR
// ============================================================================

/**
 * Estimate cognitive load from a session's behavioral signals.
 *
 * @param {Object} signals - Behavioral data from the session
 * @param {Array} signals.responseTimes - Array of response times (seconds)
 * @param {Array} signals.results - Array of { correct, hintUsed, difficulty }
 * @param {Array} signals.messageLengths - Array of user message word counts
 * @param {number} signals.sessionDurationMinutes - Minutes since session start
 * @param {number} signals.studentTheta - Student's current ability level
 * @param {number} signals.currentDifficulty - Current problem difficulty
 * @returns {Object} Cognitive load estimate
 */
function estimateCognitiveLoad(signals = {}) {
  const {
    responseTimes = [],
    results = [],
    messageLengths = [],
    sessionDurationMinutes = 0,
    studentTheta = 0,
    currentDifficulty = 0,
  } = signals;

  // Calculate individual signal scores (each 0-1)
  const responseTimeSignal = calculateResponseTimeSignal(responseTimes);
  const errorBurstSignal = calculateErrorBurstSignal(results);
  const hintEscalationSignal = calculateHintEscalationSignal(results);
  const messageBrevitySignal = calculateMessageBrevitySignal(messageLengths);
  const complexityMismatchSignal = calculateComplexityMismatchSignal(
    studentTheta, currentDifficulty
  );
  const fatigueSignal = calculateFatigueSignal(sessionDurationMinutes);

  // Weighted combination
  const weights = COGNITIVE_LOAD_CONFIG.signalWeights;
  const cognitiveLoad =
    responseTimeSignal * weights.responseTimeAcceleration +
    errorBurstSignal * weights.errorBurstDetection +
    hintEscalationSignal * weights.hintEscalation +
    messageBrevitySignal * weights.messageBrevity +
    complexityMismatchSignal * weights.complexityMismatch +
    fatigueSignal * weights.timeOnTaskFatigue;

  // Clamp to [0, 1]
  const clampedLoad = Math.max(0, Math.min(1, cognitiveLoad));

  // Determine level
  const level = getLoadLevel(clampedLoad);

  // Generate adaptive recommendations
  const recommendations = generateRecommendations(level, {
    responseTimeSignal,
    errorBurstSignal,
    hintEscalationSignal,
    messageBrevitySignal,
    complexityMismatchSignal,
    fatigueSignal,
  });

  return {
    cognitiveLoad: Math.round(clampedLoad * 1000) / 1000,
    level: level.label,
    isOverloaded: level.label === 'overload',
    isOptimal: level.label === 'optimal',

    // Individual signal scores (for debugging/dashboards)
    signals: {
      responseTime: Math.round(responseTimeSignal * 100) / 100,
      errorBurst: Math.round(errorBurstSignal * 100) / 100,
      hintEscalation: Math.round(hintEscalationSignal * 100) / 100,
      messageBrevity: Math.round(messageBrevitySignal * 100) / 100,
      complexityMismatch: Math.round(complexityMismatchSignal * 100) / 100,
      fatigue: Math.round(fatigueSignal * 100) / 100,
    },

    recommendations,
  };
}

// ============================================================================
// INDIVIDUAL SIGNAL CALCULATORS
// ============================================================================

/**
 * Response time acceleration signal.
 *
 * Detects if the student is slowing down, which indicates
 * increasing cognitive load.
 *
 * @param {Array} responseTimes - Array of response times in seconds
 * @returns {number} Signal score (0-1)
 */
function calculateResponseTimeSignal(responseTimes) {
  if (responseTimes.length < 4) return 0;

  // Compare first half baseline to second half
  const mid = Math.floor(responseTimes.length / 2);
  const firstHalf = responseTimes.slice(0, mid);
  const secondHalf = responseTimes.slice(mid);

  const firstAvg = average(firstHalf);
  const secondAvg = average(secondHalf);

  if (firstAvg <= 0) return 0;

  // Slowdown ratio
  const slowdownRatio = secondAvg / firstAvg;
  const threshold = COGNITIVE_LOAD_CONFIG.thresholds.responseTimeSlowdownFactor;

  if (slowdownRatio <= 1.0) return 0; // Getting faster = good
  if (slowdownRatio >= threshold * 1.5) return 1.0; // Very slow = max signal

  // Linear interpolation
  return Math.min(1, (slowdownRatio - 1.0) / (threshold - 1.0));
}

/**
 * Error burst detection signal.
 *
 * Sudden clusters of errors (after a period of success) indicate
 * that cognitive capacity was exceeded.
 *
 * @param {Array} results - Array of { correct }
 * @returns {number} Signal score (0-1)
 */
function calculateErrorBurstSignal(results) {
  const window = COGNITIVE_LOAD_CONFIG.thresholds.errorBurstWindow;
  const threshold = COGNITIVE_LOAD_CONFIG.thresholds.errorBurstThreshold;

  if (results.length < window) return 0;

  // Check the most recent window
  const recent = results.slice(-window);
  const recentErrors = recent.filter(r => !r.correct).length;

  if (recentErrors < 2) return 0;

  // Check if errors are clustered (not spread out)
  // If recent errors are higher than overall error rate, it's a burst
  const overallErrorRate = results.filter(r => !r.correct).length / results.length;
  const recentErrorRate = recentErrors / window;

  if (recentErrorRate <= overallErrorRate) return 0;

  // Burst intensity: how much worse than baseline
  const burstIntensity = (recentErrorRate - overallErrorRate) / (1 - overallErrorRate);

  // Scale to 0-1 based on threshold
  return Math.min(1, recentErrors >= threshold ? burstIntensity * 1.5 : burstIntensity);
}

/**
 * Hint escalation signal.
 *
 * Increasing hint usage suggests the student can't hold enough
 * information in working memory to solve independently.
 *
 * @param {Array} results - Array of { hintUsed }
 * @returns {number} Signal score (0-1)
 */
function calculateHintEscalationSignal(results) {
  const window = COGNITIVE_LOAD_CONFIG.thresholds.hintEscalationWindow;

  if (results.length < window) return 0;

  const recent = results.slice(-window);
  const hintRate = recent.filter(r => r.hintUsed).length / window;
  const threshold = COGNITIVE_LOAD_CONFIG.thresholds.hintEscalationThreshold;

  if (hintRate < 0.2) return 0;

  // Compare to earlier hint rate
  if (results.length >= window * 2) {
    const earlier = results.slice(-window * 2, -window);
    const earlierHintRate = earlier.filter(r => r.hintUsed).length / window;

    // Escalation = recent rate significantly higher than earlier rate
    if (hintRate > earlierHintRate * 1.5) {
      return Math.min(1, hintRate / threshold);
    }
  }

  return Math.min(1, Math.max(0, (hintRate - 0.2) / (threshold - 0.2)));
}

/**
 * Message brevity signal.
 *
 * When cognitive load is high, students give shorter responses —
 * they're tunneling on the problem, not elaborating.
 *
 * @param {Array} messageLengths - Array of word counts
 * @returns {number} Signal score (0-1)
 */
function calculateMessageBrevitySignal(messageLengths) {
  if (messageLengths.length < 4) return 0;

  const recent = messageLengths.slice(-4);
  const avgLength = average(recent);
  const threshold = COGNITIVE_LOAD_CONFIG.thresholds.messageBrevityThreshold;

  if (avgLength >= 6) return 0; // Normal length
  if (avgLength <= 1) return 0.9; // Extremely terse

  // Check if lengths are decreasing (trend toward brevity)
  const earlier = messageLengths.length >= 8
    ? messageLengths.slice(-8, -4)
    : messageLengths.slice(0, Math.min(4, messageLengths.length));
  const earlierAvg = average(earlier);

  const shrinkage = earlierAvg > 0 ? 1 - (avgLength / earlierAvg) : 0;

  // Combine brevity and shrinkage
  const brevityScore = avgLength < threshold
    ? (threshold - avgLength) / threshold
    : 0;

  return Math.min(1, brevityScore * 0.6 + Math.max(0, shrinkage) * 0.4);
}

/**
 * Complexity mismatch signal.
 *
 * When problem difficulty significantly exceeds student ability,
 * cognitive load spikes. This is the ZPD violation signal.
 *
 * @param {number} studentTheta - Student's ability level
 * @param {number} problemDifficulty - Problem difficulty level
 * @returns {number} Signal score (0-1)
 */
function calculateComplexityMismatchSignal(studentTheta, problemDifficulty) {
  const mismatch = problemDifficulty - studentTheta;

  // Negative mismatch (problem too easy) = no cognitive load
  if (mismatch <= 0) return 0;

  // Mismatch of 0.5 = optimal challenge (no signal)
  // Mismatch of 1.0 = moderate challenge
  // Mismatch of 2.0+ = severe mismatch
  if (mismatch <= 0.5) return 0;

  return Math.min(1, (mismatch - 0.5) / 1.5);
}

/**
 * Time-on-task fatigue signal.
 *
 * Working memory capacity diminishes with sustained cognitive effort.
 * After ~25 minutes, learning efficiency drops significantly.
 *
 * @param {number} minutes - Minutes since session start
 * @returns {number} Signal score (0-1)
 */
function calculateFatigueSignal(minutes) {
  const onset = COGNITIVE_LOAD_CONFIG.thresholds.fatigueOnsetMinutes;
  const peak = COGNITIVE_LOAD_CONFIG.thresholds.fatiguePeakMinutes;

  if (minutes < onset) return 0;
  if (minutes >= peak) return 1;

  // Linear ramp between onset and peak
  return (minutes - onset) / (peak - onset);
}

// ============================================================================
// RECOMMENDATIONS
// ============================================================================

/**
 * Generate adaptive recommendations based on cognitive load level.
 */
function generateRecommendations(level, signals) {
  const recommendations = [];

  if (level.label === 'overload') {
    recommendations.push({
      action: 'reduce_complexity',
      priority: 'high',
      description: 'Cognitive overload detected. Reduce problem difficulty immediately.',
    });

    // Identify the dominant signal
    const dominantSignal = getDominantSignal(signals);

    if (dominantSignal === 'errorBurst') {
      recommendations.push({
        action: 'switch_approach',
        priority: 'high',
        description: 'Error burst detected. Switch to a worked example or different representation.',
      });
    }

    if (dominantSignal === 'fatigue') {
      recommendations.push({
        action: 'suggest_break',
        priority: 'high',
        description: 'Session fatigue detected. Suggest a break or end the session.',
      });
    }
  }

  if (level.label === 'high') {
    recommendations.push({
      action: 'increase_scaffolding',
      priority: 'medium',
      description: 'High cognitive load. Provide more scaffolding and break problems into smaller steps.',
    });

    if (signals.complexityMismatch > 0.5) {
      recommendations.push({
        action: 'reduce_difficulty',
        priority: 'medium',
        description: 'Problem difficulty exceeds ZPD. Step back to a slightly easier level.',
      });
    }
  }

  if (level.label === 'low') {
    recommendations.push({
      action: 'increase_challenge',
      priority: 'low',
      description: 'Low cognitive load. Student may be bored. Increase difficulty or complexity.',
    });
  }

  return recommendations;
}

/**
 * Identify which signal is contributing most to cognitive load.
 */
function getDominantSignal(signals) {
  const entries = Object.entries(signals);
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || null;
}

/**
 * Get the cognitive load level object for a given load value.
 */
function getLoadLevel(load) {
  const { levels } = COGNITIVE_LOAD_CONFIG;

  if (load >= levels.OVERLOAD.min) return levels.OVERLOAD;
  if (load >= levels.HIGH.min) return levels.HIGH;
  if (load >= levels.OPTIMAL.min) return levels.OPTIMAL;
  return levels.LOW;
}

// ============================================================================
// UTILITIES
// ============================================================================

function average(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core
  estimateCognitiveLoad,

  // Individual signals
  calculateResponseTimeSignal,
  calculateErrorBurstSignal,
  calculateHintEscalationSignal,
  calculateMessageBrevitySignal,
  calculateComplexityMismatchSignal,
  calculateFatigueSignal,

  // Recommendations
  generateRecommendations,

  // Config
  COGNITIVE_LOAD_CONFIG,
};
