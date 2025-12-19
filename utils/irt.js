/**
 * IRT (ITEM RESPONSE THEORY) UTILITIES
 *
 * Core algorithms for computerized adaptive testing (CAT).
 *
 * THEORY:
 * - 2PL (2-Parameter Logistic) Model
 * - P(θ, β, α) = 1 / (1 + e^(-α(θ - β)))
 * - θ (theta) = person's ability
 * - β (beta) = item difficulty
 * - α (alpha) = item discrimination
 *
 * IMPLEMENTATION:
 * - Maximum Likelihood Estimation (MLE) for ability
 * - Fisher Information for standard error
 * - Adaptive problem selection
 *
 * @module irt
 */

// ===========================================================================
// PROBABILITY FUNCTIONS
// ===========================================================================

/**
 * Calculate probability of correct response using 2PL model
 *
 * P(θ) = 1 / (1 + exp(-α(θ - β)))
 *
 * @param {Number} theta - Person's ability estimate
 * @param {Number} difficulty - Item difficulty (β)
 * @param {Number} discrimination - Item discrimination (α)
 * @returns {Number} Probability of correct response (0 to 1)
 */
function probabilityCorrect(theta, difficulty, discrimination = 1.0) {
  const exponent = -discrimination * (theta - difficulty);
  return 1 / (1 + Math.exp(exponent));
}

/**
 * Calculate log-likelihood for a response pattern
 *
 * @param {Number} theta - Ability estimate
 * @param {Array} responses - Array of {difficulty, discrimination, correct}
 * @returns {Number} Log-likelihood
 */
function logLikelihood(theta, responses) {
  let ll = 0;

  for (const response of responses) {
    const p = probabilityCorrect(theta, response.difficulty, response.discrimination);

    if (response.correct) {
      ll += Math.log(p);
    } else {
      ll += Math.log(1 - p);
    }
  }

  return ll;
}

// ===========================================================================
// ABILITY ESTIMATION (MLE - Maximum Likelihood Estimation)
// ===========================================================================

/**
 * Estimate ability using Maximum Likelihood Estimation
 *
 * Uses Newton-Raphson method to find theta that maximizes likelihood
 *
 * @param {Array} responses - Array of {difficulty, discrimination, correct}
 * @param {Object} options - { initialTheta, maxIterations, tolerance }
 * @returns {Object} { theta, standardError, converged, iterations }
 */
function estimateAbility(responses, options = {}) {
  const {
    initialTheta = 0,
    maxIterations = 20,
    tolerance = 0.001
  } = options;

  if (responses.length === 0) {
    return {
      theta: 0,
      standardError: Infinity,
      converged: false,
      iterations: 0
    };
  }

  let theta = initialTheta;
  let converged = false;
  let iterations = 0;

  for (let i = 0; i < maxIterations; i++) {
    iterations++;

    // Calculate first derivative (score function)
    let firstDerivative = 0;
    // Calculate second derivative (information)
    let secondDerivative = 0;

    for (const response of responses) {
      const { difficulty, discrimination, correct } = response;
      const p = probabilityCorrect(theta, difficulty, discrimination);
      const q = 1 - p;

      // First derivative
      const score = discrimination * (correct - p);
      firstDerivative += score;

      // Second derivative (negative information)
      const info = discrimination * discrimination * p * q;
      secondDerivative -= info;
    }

    // Newton-Raphson update
    // Guard against division by zero (when all items are at extreme probabilities)
    if (Math.abs(secondDerivative) < 1e-10) {
      // Information is too low to update - return current theta
      converged = true;
      break;
    }

    const delta = firstDerivative / secondDerivative;
    theta = theta - delta;

    // Check convergence
    if (Math.abs(delta) < tolerance) {
      converged = true;
      break;
    }

    // Prevent theta from exploding
    if (theta > 4) theta = 4;
    if (theta < -4) theta = -4;
  }

  // Calculate standard error
  const information = calculateInformation(theta, responses);
  const standardError = information > 0 ? 1 / Math.sqrt(information) : Infinity;

  // Final NaN check - if theta became NaN, reset to initial value
  if (isNaN(theta)) {
    console.warn('[IRT] Theta calculation resulted in NaN, resetting to 0');
    theta = initialTheta;
  }

  return {
    theta: Math.round(theta * 100) / 100,  // Round to 2 decimals
    standardError: Math.round(standardError * 100) / 100,
    converged,
    iterations
  };
}

/**
 * Calculate Fisher Information at a given theta
 *
 * I(θ) = Σ α² * P(θ) * (1 - P(θ))
 *
 * @param {Number} theta - Ability estimate
 * @param {Array} responses - Array of {difficulty, discrimination, correct}
 * @returns {Number} Fisher information
 */
function calculateInformation(theta, responses) {
  let information = 0;

  for (const response of responses) {
    const { difficulty, discrimination } = response;
    const p = probabilityCorrect(theta, difficulty, discrimination);
    const q = 1 - p;

    information += discrimination * discrimination * p * q;
  }

  return information;
}

// ===========================================================================
// ADAPTIVE PROBLEM SELECTION
// ===========================================================================

/**
 * Select next optimal problem using Maximum Information criterion
 *
 * Choose the problem that provides most information at current theta estimate
 *
 * @param {Number} theta - Current ability estimate
 * @param {Array} availableProblems - Array of {difficulty, discrimination}
 * @returns {Object} Selected problem
 */
function selectNextProblem(theta, availableProblems) {
  if (availableProblems.length === 0) {
    return null;
  }

  let maxInformation = 0;
  let bestProblem = availableProblems[0];

  for (const problem of availableProblems) {
    const p = probabilityCorrect(theta, problem.difficulty, problem.discrimination);
    const q = 1 - p;

    // Information for this problem
    const info = problem.discrimination * problem.discrimination * p * q;

    if (info > maxInformation) {
      maxInformation = info;
      bestProblem = problem;
    }
  }

  return bestProblem;
}

/**
 * Calculate expected information for a problem at current theta
 *
 * @param {Number} theta - Current ability estimate
 * @param {Number} difficulty - Problem difficulty
 * @param {Number} discrimination - Problem discrimination
 * @returns {Number} Expected information
 */
function expectedInformation(theta, difficulty, discrimination = 1.0) {
  const p = probabilityCorrect(theta, difficulty, discrimination);
  const q = 1 - p;

  return discrimination * discrimination * p * q;
}

// ===========================================================================
// CONVERGENCE DETECTION
// ===========================================================================

/**
 * Check if ability estimate has converged to acceptable confidence
 *
 * @param {Number} standardError - Current standard error
 * @param {Object} options - { seThreshold, minQuestions }
 * @returns {Boolean} True if converged
 */
function hasConverged(standardError, options = {}) {
  const {
    seThreshold = 0.3,  // Standard error threshold
    minQuestions = 5     // Minimum questions before convergence allowed
  } = options;

  return standardError <= seThreshold;
}

/**
 * Detect if student has plateaued (alternating correct/incorrect at same difficulty)
 *
 * @param {Array} recentResponses - Last 5-7 responses with theta estimates
 * @returns {Boolean} True if plateaued
 */
function hasPlateaued(recentResponses) {
  if (recentResponses.length < 5) return false;

  const last5 = recentResponses.slice(-5);

  // Check for alternating pattern
  let alternations = 0;
  for (let i = 0; i < last5.length - 1; i++) {
    if (last5[i].correct !== last5[i + 1].correct) {
      alternations++;
    }
  }

  // If 3+ alternations in last 5, likely plateaued
  if (alternations >= 3) {
    // Check if theta estimates are stable (within 0.5)
    const thetas = last5.map(r => r.thetaAfter);
    const thetaRange = Math.max(...thetas) - Math.min(...thetas);

    return thetaRange < 0.5;
  }

  return false;
}

// ===========================================================================
// CONVERSION UTILITIES
// ===========================================================================

/**
 * Convert theta to percentile rank (approximate)
 *
 * Assumes normal distribution N(0, 1)
 *
 * @param {Number} theta - Ability estimate
 * @returns {Number} Percentile (0-100)
 */
function thetaToPercentile(theta) {
  // Approximate normal CDF using erf approximation
  const z = theta;
  const t = 1 / (1 + 0.5 * Math.abs(z));

  const tau = t * Math.exp(-z * z - 1.26551223 +
    t * (1.00002368 +
      t * (0.37409196 +
        t * (0.09678418 +
          t * (-0.18628806 +
            t * (0.27886807 +
              t * (-1.13520398 +
                t * (1.48851587 +
                  t * (-0.82215223 +
                    t * 0.17087277)))))))));

  const cdf = z >= 0 ? 1 - 0.5 * tau : 0.5 * tau;

  return Math.round(cdf * 100);
}

/**
 * Convert theta to grade level estimate (rough approximation)
 *
 * @param {Number} theta - Ability estimate
 * @returns {Number} Estimated grade level
 */
function thetaToGradeLevel(theta) {
  // Rough mapping based on typical progression
  // theta = -2: Grade 4-5
  // theta = -1: Grade 6
  // theta = 0: Grade 7-8
  // theta = +1: Grade 9-10
  // theta = +2: Grade 11-12
  // theta = +3: College

  if (theta < -2) return 5;
  if (theta < -1) return 6;
  if (theta < 0) return 7;
  if (theta < 1) return 9;
  if (theta < 2) return 11;
  return 12;
}

// ===========================================================================
// EXPORTS
// ===========================================================================

module.exports = {
  // Core IRT functions
  probabilityCorrect,
  logLikelihood,
  estimateAbility,
  calculateInformation,

  // Adaptive selection
  selectNextProblem,
  expectedInformation,

  // Convergence
  hasConverged,
  hasPlateaued,

  // Utilities
  thetaToPercentile,
  thetaToGradeLevel
};
