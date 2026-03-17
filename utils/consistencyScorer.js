/**
 * CONSISTENCY-WEIGHTED SCORING ENGINE (SmartScore-style)
 *
 * Traditional accuracy tracking (correct/total) misses a critical insight:
 * HOW a student arrived at their score matters as much as the score itself.
 *
 * IXL's research (2024) found that students whose SmartScore *fluctuated*
 * (making mistakes and recovering) showed STRONGER academic growth than
 * students with smooth upward progression. This is Bjork's "desirable
 * difficulties" in action.
 *
 * This module implements three key innovations:
 *
 * 1. CONSISTENCY WEIGHTING
 *    A student who gets 8/10 right with errors spread out scores HIGHER
 *    than one who gets 8/10 but misses the last two (suggesting fatigue
 *    or fragile understanding).
 *
 * 2. PRODUCTIVE STRUGGLE DETECTION
 *    Tracks whether a student experienced and recovered from errors.
 *    Students who struggle and recover demonstrate deeper learning than
 *    those who never struggled at all.
 *
 * 3. CHALLENGE ZONE GATING
 *    Like IXL's SmartScore, reaching 100 requires consistently correct
 *    answers on harder problems. Getting easy problems right doesn't
 *    demonstrate mastery — it demonstrates minimum competence.
 *
 * RESEARCH BASIS:
 *   - IXL SmartScore Productive Struggle (2024, PR Newswire)
 *   - Bjork, R.A. (1994): Desirable difficulties in learning
 *   - Kapur, M. (2016): Productive failure in math
 *   - Stigler & Hiebert: The Teaching Gap
 *
 * @module consistencyScorer
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const SCORING_CONFIG = {
  // Score range: 0-100
  maxScore: 100,

  // Minimum problems for a meaningful score
  minProblems: 3,

  // Challenge zone threshold (score at which harder problems are required)
  challengeZoneThreshold: 80,

  // Recovery bonus: extra points for getting correct after being wrong
  recoveryBonus: 1.15, // 15% bonus

  // Consistency decay: how much inconsistency penalizes
  inconsistencyPenalty: 0.85, // 15% penalty

  // Difficulty multipliers for scoring
  difficultyMultipliers: {
    easy: 0.7,       // Easy problems worth 70% of base
    medium: 1.0,     // Medium problems worth full value
    hard: 1.3,       // Hard problems worth 130%
    challenge: 1.6,  // Challenge zone problems worth 160%
  },

  // Productive struggle thresholds
  productiveStruggle: {
    minErrors: 2,           // Must have made at least 2 errors
    minRecoveries: 1,       // Must have recovered at least once
    recoveryWindow: 5,      // Recovery must happen within 5 problems
    bonusMultiplier: 1.10,  // 10% bonus for productive struggle
  },
};

// ============================================================================
// CORE SCORING
// ============================================================================

/**
 * Initialize a consistency score tracker for a skill.
 *
 * @param {string} skillId - The skill being tracked
 * @returns {Object} Initial score state
 */
function initializeScore(skillId) {
  return {
    skillId,
    smartScore: 0,
    rawAccuracy: 0,

    // Response history (ordered, most recent last)
    responses: [],

    // Consistency tracking
    streakType: null,       // 'correct' | 'incorrect' | null
    currentStreakLength: 0,
    longestCorrectStreak: 0,
    longestIncorrectStreak: 0,

    // Productive struggle tracking
    errorCount: 0,
    recoveryCount: 0,       // Times student got correct after incorrect
    lastErrorIndex: -1,
    productiveStruggleDetected: false,

    // Challenge zone
    inChallengeZone: false,
    challengeProblemsAttempted: 0,
    challengeProblemsCorrect: 0,

    // Timestamps
    firstAttempt: null,
    lastAttempt: null,
  };
}

/**
 * Calculate the SmartScore after each problem attempt.
 *
 * This is the core algorithm. It weighs:
 * 1. Base accuracy (what fraction is correct)
 * 2. Consistency pattern (how spread out are errors)
 * 3. Difficulty of problems answered correctly
 * 4. Recency weighting (recent performance matters more)
 * 5. Productive struggle bonus
 *
 * @param {Object} state - Current score state
 * @param {Object} attempt - { correct, difficulty, responseTime }
 * @returns {Object} Updated score state with new smartScore
 */
function recordAttempt(state, attempt) {
  const { correct, difficulty = 'medium', responseTime } = attempt;

  // Record the response
  state.responses.push({
    correct,
    difficulty,
    responseTime,
    timestamp: Date.now(),
    smartScoreBefore: state.smartScore,
  });

  if (!state.firstAttempt) state.firstAttempt = new Date();
  state.lastAttempt = new Date();

  // Update streaks
  if (correct) {
    if (state.streakType === 'correct') {
      state.currentStreakLength++;
    } else {
      state.streakType = 'correct';
      state.currentStreakLength = 1;
    }
    state.longestCorrectStreak = Math.max(
      state.longestCorrectStreak, state.currentStreakLength
    );

    // Check for recovery (correct after recent error)
    if (state.lastErrorIndex >= 0) {
      const problemsSinceError = state.responses.length - 1 - state.lastErrorIndex;
      if (problemsSinceError <= SCORING_CONFIG.productiveStruggle.recoveryWindow) {
        state.recoveryCount++;
      }
    }
  } else {
    if (state.streakType === 'incorrect') {
      state.currentStreakLength++;
    } else {
      state.streakType = 'incorrect';
      state.currentStreakLength = 1;
    }
    state.longestIncorrectStreak = Math.max(
      state.longestIncorrectStreak, state.currentStreakLength
    );
    state.errorCount++;
    state.lastErrorIndex = state.responses.length - 1;
  }

  // Check for productive struggle
  const ps = SCORING_CONFIG.productiveStruggle;
  state.productiveStruggleDetected = (
    state.errorCount >= ps.minErrors &&
    state.recoveryCount >= ps.minRecoveries
  );

  // Track challenge zone
  state.inChallengeZone = state.smartScore >= SCORING_CONFIG.challengeZoneThreshold;
  if (state.inChallengeZone && (difficulty === 'hard' || difficulty === 'challenge')) {
    state.challengeProblemsAttempted++;
    if (correct) state.challengeProblemsCorrect++;
  }

  // Calculate new SmartScore
  state.smartScore = calculateSmartScore(state);
  state.rawAccuracy = state.responses.filter(r => r.correct).length / state.responses.length;

  return state;
}

/**
 * The SmartScore calculation algorithm.
 *
 * @param {Object} state - Current score state
 * @returns {number} SmartScore (0-100)
 */
function calculateSmartScore(state) {
  const { responses } = state;

  if (responses.length < SCORING_CONFIG.minProblems) {
    // Not enough data — use simple accuracy
    const correct = responses.filter(r => r.correct).length;
    return Math.round((correct / responses.length) * 60); // Cap at 60 until enough data
  }

  // ── 1. Weighted accuracy (recent problems matter more) ──
  const weightedAccuracy = calculateWeightedAccuracy(responses);

  // ── 2. Consistency score ──
  const consistencyScore = calculateConsistencyScore(responses);

  // ── 3. Difficulty-adjusted score ──
  const difficultyScore = calculateDifficultyScore(responses);

  // ── 4. Combine scores ──
  let smartScore = (
    weightedAccuracy * 0.40 +    // 40% weighted accuracy
    consistencyScore * 0.25 +    // 25% consistency
    difficultyScore * 0.35       // 35% difficulty-adjusted
  ) * 100;

  // ── 5. Apply productive struggle bonus ──
  if (state.productiveStruggleDetected) {
    smartScore *= SCORING_CONFIG.productiveStruggle.bonusMultiplier;
  }

  // ── 6. Challenge zone gate ──
  // Score can't reach 100 without challenge zone problems
  if (smartScore > SCORING_CONFIG.challengeZoneThreshold) {
    if (state.challengeProblemsAttempted === 0) {
      smartScore = Math.min(smartScore, SCORING_CONFIG.challengeZoneThreshold);
    } else {
      const challengeAccuracy = state.challengeProblemsCorrect / state.challengeProblemsAttempted;
      if (challengeAccuracy < 0.8) {
        // Scale score between threshold and max based on challenge accuracy
        const excess = smartScore - SCORING_CONFIG.challengeZoneThreshold;
        smartScore = SCORING_CONFIG.challengeZoneThreshold + (excess * challengeAccuracy);
      }
    }
  }

  return Math.round(Math.max(0, Math.min(100, smartScore)));
}

// ============================================================================
// SCORING COMPONENTS
// ============================================================================

/**
 * Calculate recency-weighted accuracy.
 * Recent problems get exponentially more weight.
 *
 * @param {Array} responses - Array of { correct, difficulty }
 * @returns {number} Weighted accuracy (0-1)
 */
function calculateWeightedAccuracy(responses) {
  if (responses.length === 0) return 0;

  let weightedCorrect = 0;
  let totalWeight = 0;

  for (let i = 0; i < responses.length; i++) {
    // Exponential recency weight: most recent = highest weight
    const recencyWeight = Math.pow(1.1, i - responses.length + 1);
    totalWeight += recencyWeight;

    if (responses[i].correct) {
      weightedCorrect += recencyWeight;
    }
  }

  return totalWeight > 0 ? weightedCorrect / totalWeight : 0;
}

/**
 * Calculate consistency score.
 *
 * Measures HOW spread out errors are. Clustered errors at the end
 * (suggesting fatigue/fragile understanding) are penalized more than
 * scattered errors (suggesting learning through struggle).
 *
 * @param {Array} responses - Array of { correct }
 * @returns {number} Consistency score (0-1)
 */
function calculateConsistencyScore(responses) {
  if (responses.length < 3) return 0.5; // Neutral with insufficient data

  const n = responses.length;

  // Calculate error distribution evenness
  const errorIndices = responses
    .map((r, i) => r.correct ? -1 : i)
    .filter(i => i >= 0);

  if (errorIndices.length === 0) return 1.0; // Perfect — maximum consistency
  if (errorIndices.length === n) return 0.0; // All wrong — minimum consistency

  // Measure spacing between errors (more even = better)
  const gaps = [];
  for (let i = 1; i < errorIndices.length; i++) {
    gaps.push(errorIndices[i] - errorIndices[i - 1]);
  }

  // Add edge gaps (start to first error, last error to end)
  gaps.unshift(errorIndices[0]);
  gaps.push(n - 1 - errorIndices[errorIndices.length - 1]);

  // Calculate coefficient of variation of gaps (lower = more even)
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const gapVariance = gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length;
  const gapCV = avgGap > 0 ? Math.sqrt(gapVariance) / avgGap : 0;

  // Score: lower CV = higher consistency
  // CV of 0 = perfectly spaced (score 1.0)
  // CV of 2+ = very clustered (score ~0.3)
  const evenness = Math.max(0, 1 - gapCV * 0.35);

  // Penalty for errors at the END (suggests fatigue/fragile knowledge)
  const lastThird = responses.slice(Math.floor(n * 0.67));
  const lastThirdErrors = lastThird.filter(r => !r.correct).length;
  const lastThirdErrorRate = lastThirdErrors / lastThird.length;
  const endPenalty = lastThirdErrorRate > 0.5 ? 0.7 : 1.0;

  // Recovery bonus: errors followed by correct answers
  const recoveries = countRecoveries(responses);
  const recoveryBonus = recoveries > 0
    ? Math.min(1.15, 1 + recoveries * 0.05) // Up to 15% bonus
    : 1.0;

  return Math.min(1, evenness * endPenalty * recoveryBonus);
}

/**
 * Calculate difficulty-adjusted score.
 *
 * Getting hard problems right is worth more than easy problems.
 * Getting easy problems wrong is penalized more than hard problems.
 *
 * @param {Array} responses - Array of { correct, difficulty }
 * @returns {number} Difficulty-adjusted score (0-1)
 */
function calculateDifficultyScore(responses) {
  if (responses.length === 0) return 0;

  let weightedCorrect = 0;
  let totalWeight = 0;

  for (const response of responses) {
    const multiplier = SCORING_CONFIG.difficultyMultipliers[response.difficulty] ||
                       SCORING_CONFIG.difficultyMultipliers.medium;

    totalWeight += multiplier;

    if (response.correct) {
      weightedCorrect += multiplier;
    }
  }

  return totalWeight > 0 ? weightedCorrect / totalWeight : 0;
}

/**
 * Count recovery events (correct answer after incorrect answer).
 */
function countRecoveries(responses) {
  let recoveries = 0;

  for (let i = 1; i < responses.length; i++) {
    if (responses[i].correct && !responses[i - 1].correct) {
      recoveries++;
    }
  }

  return recoveries;
}

// ============================================================================
// ANALYSIS & REPORTING
// ============================================================================

/**
 * Analyze a student's scoring pattern to detect learning signals.
 *
 * @param {Object} state - Current score state
 * @returns {Object} Learning signal analysis
 */
function analyzePattern(state) {
  const { responses, smartScore, productiveStruggleDetected, recoveryCount } = state;
  const n = responses.length;

  if (n < 5) {
    return {
      pattern: 'insufficient-data',
      signal: 'neutral',
      recommendation: 'Continue practicing to establish a pattern.',
    };
  }

  // Analyze trajectory
  const firstHalf = responses.slice(0, Math.floor(n / 2));
  const secondHalf = responses.slice(Math.floor(n / 2));
  const firstAccuracy = firstHalf.filter(r => r.correct).length / firstHalf.length;
  const secondAccuracy = secondHalf.filter(r => r.correct).length / secondHalf.length;
  const trajectoryDelta = secondAccuracy - firstAccuracy;

  // Detect patterns
  if (productiveStruggleDetected && trajectoryDelta > 0.1) {
    return {
      pattern: 'productive-struggle',
      signal: 'strong-positive',
      trajectoryDelta: Math.round(trajectoryDelta * 100),
      recoveryCount,
      recommendation: 'Student struggled and recovered — this indicates deep learning. Continue with increasing difficulty.',
    };
  }

  if (trajectoryDelta > 0.2) {
    return {
      pattern: 'rapid-improvement',
      signal: 'positive',
      trajectoryDelta: Math.round(trajectoryDelta * 100),
      recommendation: 'Student is improving rapidly. Ready for harder problems.',
    };
  }

  if (trajectoryDelta < -0.2) {
    return {
      pattern: 'declining',
      signal: 'negative',
      trajectoryDelta: Math.round(trajectoryDelta * 100),
      recommendation: 'Performance declining. Check for fatigue or confusion. Consider scaffolding.',
    };
  }

  if (Math.abs(trajectoryDelta) < 0.05 && secondAccuracy > 0.85) {
    return {
      pattern: 'stable-mastery',
      signal: 'positive',
      trajectoryDelta: Math.round(trajectoryDelta * 100),
      recommendation: 'Consistent high performance. Move to challenge zone or new skill.',
    };
  }

  if (Math.abs(trajectoryDelta) < 0.05 && secondAccuracy < 0.5) {
    return {
      pattern: 'stuck',
      signal: 'negative',
      trajectoryDelta: Math.round(trajectoryDelta * 100),
      recommendation: 'Student is stuck. Try a different teaching approach or review prerequisites.',
    };
  }

  return {
    pattern: 'mixed',
    signal: 'neutral',
    trajectoryDelta: Math.round(trajectoryDelta * 100),
    recommendation: 'Mixed performance. Continue monitoring.',
  };
}

/**
 * Map a difficulty level string to a numeric value.
 *
 * @param {string|number} difficulty - Difficulty level or IRT difficulty
 * @returns {string} Difficulty category
 */
function categorizeDifficulty(difficulty) {
  if (typeof difficulty === 'string') return difficulty;

  // IRT difficulty scale mapping
  if (difficulty < -1.0) return 'easy';
  if (difficulty < 0.5) return 'medium';
  if (difficulty < 1.5) return 'hard';
  return 'challenge';
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core
  initializeScore,
  recordAttempt,
  calculateSmartScore,

  // Components
  calculateWeightedAccuracy,
  calculateConsistencyScore,
  calculateDifficultyScore,

  // Analysis
  analyzePattern,
  categorizeDifficulty,

  // Config
  SCORING_CONFIG,
};
