/**
 * FSRS SPACED REPETITION SCHEDULER
 *
 * Based on the Free Spaced Repetition Scheduler (FSRS v4) algorithm,
 * which uses a transformer-inspired approach to model memory dynamics.
 *
 * Key insight: Every student forgets at different rates for different skills.
 * Population-level forgetting curves (like Ebbinghaus) are wrong for individuals.
 * FSRS models THREE per-skill, per-student memory parameters:
 *
 *   - Stability (S): How many days until recall probability drops to 90%
 *   - Difficulty (D): How hard this material is for THIS student (1-10)
 *   - Retrievability (R): Current probability of recall (0-1)
 *
 * The forgetting curve is: R(t) = (1 + t/(9*S))^(-1)
 * where t = days since last review, S = stability
 *
 * After each review, stability and difficulty are updated based on:
 *   - Whether the student recalled successfully
 *   - How long since the last review
 *   - The current difficulty and stability
 *
 * RESEARCH BASIS:
 * - Tabibian et al. (PNAS): Optimal scheduling is data-driven, not heuristic
 * - FSRS v4: https://github.com/open-spaced-repetition/fsrs4anki
 * - Wozniak's SuperMemo SM-18 (theoretical basis)
 * - Settles & Meeder (ACL 2016): Half-life regression for memory modeling
 *
 * @module fsrsScheduler
 */

// ============================================================================
// FSRS PARAMETERS (calibrated for math skill retention)
// ============================================================================

/**
 * Default FSRS parameters, tuned for math education.
 * These can be personalized per-student over time.
 */
const DEFAULT_PARAMS = {
  // Initial stability values for different rating outcomes
  // (how many days of stability after first review)
  w0: 0.4,    // Again (complete failure) → ~0.4 days stability
  w1: 0.6,    // Hard (struggled but got it) → ~0.6 days
  w2: 2.4,    // Good (normal recall) → ~2.4 days
  w3: 5.8,    // Easy (effortless recall) → ~5.8 days

  // Difficulty parameters
  w4: 4.93,   // Initial difficulty mean
  w5: 0.94,   // Initial difficulty weight
  w6: 0.86,   // Difficulty reversion toward mean
  w7: 0.01,   // Difficulty penalty for failure

  // Stability parameters (after successful recall)
  w8: 1.49,   // Stability increase factor
  w9: 0.14,   // Stability increase exponent (difficulty)
  w10: 0.94,  // Stability increase exponent (stability)
  w11: 2.18,  // Stability increase exponent (retrievability)

  // Stability parameters (after failed recall)
  w12: 0.05,  // Stability decrease minimum factor
  w13: 0.34,  // Stability decrease exponent (difficulty)
  w14: 1.26,  // Stability decrease exponent (stability)
  w15: 0.29,  // Stability decrease exponent (retrievability)

  // Scheduling parameters
  w16: 2.61,  // Hard penalty multiplier
  w17: 0.27,  // Easy bonus multiplier

  // Target retention
  requestedRetention: 0.90,  // Schedule reviews to maintain 90% recall
};

// Rating scale (maps to student performance)
const RATINGS = {
  AGAIN: 1,    // Complete failure, couldn't recall at all
  HARD: 2,     // Recalled with significant difficulty/errors
  GOOD: 3,     // Normal recall, some effort
  EASY: 4,     // Effortless recall, automatic
};

// ============================================================================
// CORE FSRS FUNCTIONS
// ============================================================================

/**
 * Calculate retrievability (probability of recall) using the power forgetting curve.
 *
 * R(t, S) = (1 + t/(9*S))^(-1)
 *
 * This is the FSRS forgetting curve, which approximates the exponential
 * forgetting curve but is more computationally stable.
 *
 * @param {number} elapsedDays - Days since last review
 * @param {number} stability - Current stability parameter
 * @returns {number} Retrievability (0-1)
 */
function calculateRetrievability(elapsedDays, stability) {
  if (stability <= 0 || elapsedDays < 0) return 0;
  if (elapsedDays === 0) return 1;

  return Math.pow(1 + elapsedDays / (9 * stability), -1);
}

/**
 * Calculate the optimal review interval to maintain target retention.
 *
 * Inverts the forgetting curve: t = 9*S * (R^(-1) - 1)
 *
 * @param {number} stability - Current stability
 * @param {number} targetRetention - Desired recall probability (default 0.90)
 * @returns {number} Optimal interval in days
 */
function calculateOptimalInterval(stability, targetRetention = DEFAULT_PARAMS.requestedRetention) {
  if (stability <= 0) return 0;

  const interval = 9 * stability * (Math.pow(targetRetention, -1) - 1);

  // Clamp to reasonable bounds (1 day minimum, 365 days maximum)
  return Math.max(1, Math.min(365, Math.round(interval * 10) / 10));
}

/**
 * Initialize a new memory card (first time seeing a skill).
 *
 * @param {number} rating - First review rating (1-4)
 * @param {Object} params - FSRS parameters (default: DEFAULT_PARAMS)
 * @returns {Object} Initial memory state
 */
function initializeCard(rating, params = DEFAULT_PARAMS) {
  const ratingIdx = Math.max(1, Math.min(4, Math.round(rating))) - 1;

  // Initial stability from first rating
  const initialStabilities = [params.w0, params.w1, params.w2, params.w3];
  const stability = initialStabilities[ratingIdx];

  // Initial difficulty
  const difficulty = clampDifficulty(
    params.w4 - Math.exp(params.w5 * (rating - 1)) + 1
  );

  return {
    stability,
    difficulty,
    elapsedDays: 0,
    scheduledDays: calculateOptimalInterval(stability, params.requestedRetention),
    reps: 1,
    lapses: rating === RATINGS.AGAIN ? 1 : 0,
    state: rating === RATINGS.AGAIN ? 'relearning' : 'learning',
    lastReview: new Date(),
    lastRating: rating,
  };
}

/**
 * Update memory state after a review.
 *
 * This is the core FSRS algorithm. It updates stability and difficulty
 * based on the review outcome and elapsed time.
 *
 * @param {Object} card - Current memory state
 * @param {number} rating - Review rating (1-4)
 * @param {number} elapsedDays - Days since last review
 * @param {Object} params - FSRS parameters
 * @returns {Object} Updated memory state
 */
function updateCard(card, rating, elapsedDays = null, params = DEFAULT_PARAMS) {
  // Calculate elapsed days if not provided
  if (elapsedDays === null) {
    elapsedDays = card.lastReview
      ? (Date.now() - new Date(card.lastReview).getTime()) / (1000 * 60 * 60 * 24)
      : 0;
  }

  const retrievability = calculateRetrievability(elapsedDays, card.stability);

  // Update difficulty
  const newDifficulty = updateDifficulty(card.difficulty, rating, params);

  // Update stability
  let newStability;
  if (rating === RATINGS.AGAIN) {
    // Failed recall: stability decreases
    newStability = calculateStabilityAfterFailure(
      card.stability, newDifficulty, retrievability, params
    );
  } else {
    // Successful recall: stability increases
    newStability = calculateStabilityAfterSuccess(
      card.stability, newDifficulty, retrievability, rating, params
    );
  }

  // Calculate next interval
  const scheduledDays = calculateOptimalInterval(newStability, params.requestedRetention);

  // Determine card state
  let state = card.state;
  let lapses = card.lapses;

  if (rating === RATINGS.AGAIN) {
    lapses++;
    state = 'relearning';
  } else if (state === 'learning' || state === 'relearning') {
    if (rating >= RATINGS.GOOD) {
      state = 'review';
    }
  }

  return {
    stability: Math.round(newStability * 100) / 100,
    difficulty: Math.round(newDifficulty * 100) / 100,
    elapsedDays: Math.round(elapsedDays * 10) / 10,
    scheduledDays,
    reps: card.reps + 1,
    lapses,
    state,
    lastReview: new Date(),
    lastRating: rating,
    retrievability: Math.round(retrievability * 1000) / 1000,
  };
}

// ============================================================================
// STABILITY CALCULATIONS
// ============================================================================

/**
 * Calculate new stability after successful recall.
 *
 * S'(S, D, R, G) = S * (e^(w8) * (11-D)^w9 * S^(-w10) * (e^(w11*(1-R)) - 1) * hardPenalty * easyBonus + 1)
 */
function calculateStabilityAfterSuccess(stability, difficulty, retrievability, rating, params) {
  const hardPenalty = rating === RATINGS.HARD ? params.w16 : 1;
  const easyBonus = rating === RATINGS.EASY ? params.w17 : 1;

  const newStability = stability * (
    Math.exp(params.w8) *
    Math.pow(11 - difficulty, params.w9) *
    Math.pow(stability, -params.w10) *
    (Math.exp(params.w11 * (1 - retrievability)) - 1) *
    hardPenalty *
    easyBonus +
    1
  );

  // Stability must increase after successful recall (minimum 0.1 day increase)
  return Math.max(stability + 0.1, newStability);
}

/**
 * Calculate new stability after failed recall.
 *
 * S'(S, D, R) = w12 * D^(-w13) * ((S+1)^w14 - 1) * e^(w15*(1-R))
 */
function calculateStabilityAfterFailure(stability, difficulty, retrievability, params) {
  const newStability = params.w12 *
    Math.pow(difficulty, -params.w13) *
    (Math.pow(stability + 1, params.w14) - 1) *
    Math.exp(params.w15 * (1 - retrievability));

  // Stability must decrease after failure, but not below 0.1
  return Math.max(0.1, Math.min(stability, newStability));
}

// ============================================================================
// DIFFICULTY CALCULATIONS
// ============================================================================

/**
 * Update difficulty after a review.
 *
 * D'(D, G) = w7 * D_0(4) + (1-w7) * (D - w6*(G-3))
 *
 * Difficulty reverts toward mean over time (mean reversion),
 * and adjusts based on performance.
 */
function updateDifficulty(difficulty, rating, params) {
  // Mean reversion: pull toward initial difficulty for rating 4
  const d0Rating4 = params.w4 - Math.exp(params.w5 * (4 - 1)) + 1;

  const newDifficulty = params.w7 * d0Rating4 +
    (1 - params.w7) * (difficulty - params.w6 * (rating - 3));

  return clampDifficulty(newDifficulty);
}

/**
 * Clamp difficulty to valid range [1, 10]
 */
function clampDifficulty(difficulty) {
  return Math.max(1, Math.min(10, difficulty));
}

// ============================================================================
// SCHEDULING & PRIORITIZATION
// ============================================================================

/**
 * Map a problem attempt result to an FSRS rating.
 *
 * @param {Object} attemptData - { correct, hintUsed, responseTime, expectedTime, consecutiveCorrect }
 * @returns {number} FSRS rating (1-4)
 */
function rateAttempt(attemptData) {
  const { correct, hintUsed, responseTime, expectedTime, consecutiveCorrect = 0 } = attemptData;

  if (!correct) {
    return RATINGS.AGAIN;
  }

  // Correct answer — determine quality
  if (hintUsed) {
    return RATINGS.HARD; // Needed help
  }

  // Check speed (if timing data available)
  if (responseTime && expectedTime) {
    const speedRatio = responseTime / expectedTime;

    if (speedRatio <= 0.5 && consecutiveCorrect >= 3) {
      return RATINGS.EASY; // Fast and consistent
    }

    if (speedRatio > 1.5) {
      return RATINGS.HARD; // Slow but correct
    }
  }

  // Default: correct without help, reasonable speed
  if (consecutiveCorrect >= 5) {
    return RATINGS.EASY;
  }

  return RATINGS.GOOD;
}

/**
 * Get all skills due for review, sorted by urgency.
 *
 * @param {Map} skillMemory - Map of skillId → memory card
 * @param {Object} options - { maxSkills, includeOverdue }
 * @returns {Array} Skills due for review, sorted by urgency
 */
function getSkillsDueForReview(skillMemory, options = {}) {
  const { maxSkills = 10, includeOverdue = true } = options;

  const now = new Date();
  const dueSkills = [];

  for (const [skillId, card] of skillMemory.entries()) {
    if (!card || !card.lastReview) continue;

    const elapsedDays = (now.getTime() - new Date(card.lastReview).getTime()) / (1000 * 60 * 60 * 24);
    const retrievability = calculateRetrievability(elapsedDays, card.stability);
    const isDue = elapsedDays >= card.scheduledDays;
    const isOverdue = elapsedDays > card.scheduledDays * 1.5;

    if (isDue || (includeOverdue && isOverdue)) {
      dueSkills.push({
        skillId,
        card,
        retrievability,
        elapsedDays: Math.round(elapsedDays * 10) / 10,
        scheduledDays: card.scheduledDays,
        overdueRatio: elapsedDays / card.scheduledDays,
        urgency: 1 - retrievability, // Higher urgency = lower recall probability
      });
    }
  }

  // Sort by urgency (highest first = most likely to be forgotten)
  dueSkills.sort((a, b) => b.urgency - a.urgency);

  return dueSkills.slice(0, maxSkills);
}

/**
 * Calculate retention statistics for a student's skill portfolio.
 *
 * @param {Map} skillMemory - Map of skillId → memory card
 * @returns {Object} Retention statistics
 */
function calculateRetentionStats(skillMemory) {
  const now = new Date();
  let totalSkills = 0;
  let totalRetrievability = 0;
  let dueCount = 0;
  let overdueCount = 0;
  let averageStability = 0;
  let averageDifficulty = 0;
  const stateDistribution = { learning: 0, review: 0, relearning: 0 };

  for (const [, card] of skillMemory.entries()) {
    if (!card || !card.lastReview) continue;

    totalSkills++;
    const elapsedDays = (now.getTime() - new Date(card.lastReview).getTime()) / (1000 * 60 * 60 * 24);
    const retrievability = calculateRetrievability(elapsedDays, card.stability);

    totalRetrievability += retrievability;
    averageStability += card.stability;
    averageDifficulty += card.difficulty;

    if (elapsedDays >= card.scheduledDays) dueCount++;
    if (elapsedDays > card.scheduledDays * 1.5) overdueCount++;

    if (card.state && stateDistribution[card.state] !== undefined) {
      stateDistribution[card.state]++;
    }
  }

  return {
    totalSkills,
    averageRetrievability: totalSkills > 0
      ? Math.round((totalRetrievability / totalSkills) * 1000) / 1000
      : 0,
    averageStability: totalSkills > 0
      ? Math.round((averageStability / totalSkills) * 10) / 10
      : 0,
    averageDifficulty: totalSkills > 0
      ? Math.round((averageDifficulty / totalSkills) * 10) / 10
      : 0,
    dueCount,
    overdueCount,
    stateDistribution,
    retentionRate: totalSkills > 0
      ? Math.round((totalRetrievability / totalSkills) * 100)
      : 100,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core FSRS
  calculateRetrievability,
  calculateOptimalInterval,
  initializeCard,
  updateCard,

  // Stability
  calculateStabilityAfterSuccess,
  calculateStabilityAfterFailure,

  // Difficulty
  updateDifficulty,

  // Scheduling
  rateAttempt,
  getSkillsDueForReview,
  calculateRetentionStats,

  // Constants
  RATINGS,
  DEFAULT_PARAMS,
};
