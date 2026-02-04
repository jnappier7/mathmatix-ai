/**
 * GROWTH CHECK MODULE
 *
 * A short, targeted assessment to measure progress since last check.
 * Unlike the full "Starting Point" CAT, this:
 * - Is only 5-8 questions
 * - Pulls from skills the student has already worked on
 * - Compares new theta to previous theta
 * - Focuses on their frontier (edge of ability)
 *
 * @module growthCheck
 */

const { estimateAbility, probabilityCorrect, thetaToPercentile } = require('./irt');
const { SESSION_DEFAULTS } = require('./catConfig');

// ===========================================================================
// CONFIGURATION
// ===========================================================================

const GROWTH_CHECK_CONFIG = {
  minQuestions: 5,
  maxQuestions: 8,
  seThreshold: 0.4,  // More lenient than full CAT (0.3)
};

// ===========================================================================
// SESSION INITIALIZATION
// ===========================================================================

/**
 * Initialize a growth check session
 *
 * @param {Object} options - { userId, previousTheta, coveredSkills }
 * @returns {Object} Growth check session
 */
function initializeGrowthCheck(options) {
  const { userId, previousTheta = 0, previousSE = 1.0, coveredSkills = [] } = options;

  return {
    type: 'growth-check',
    userId,
    sessionId: `growth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,

    // Previous ability (for comparison)
    previousTheta,
    previousSE,

    // Current estimate (starts at previous)
    theta: previousTheta,
    standardError: previousSE,

    // Skills to potentially test (from their learning history)
    coveredSkills,

    // Response tracking
    responses: [],
    questionCount: 0,

    // Timing
    startTime: Date.now(),
    endTime: null,

    // Completion
    complete: false,
  };
}

// ===========================================================================
// SKILL SELECTION FOR GROWTH CHECK
// ===========================================================================

/**
 * Select skills for growth check based on student's history
 *
 * Prioritizes:
 * 1. Frontier skills (near their ability level)
 * 2. Recently learned skills (test retention)
 * 3. Previously struggled skills (check improvement)
 *
 * @param {Object} learningProfile - Student's learning profile
 * @param {Number} currentTheta - Current ability estimate
 * @returns {Array} Ordered list of skills to test
 */
function selectGrowthCheckSkills(learningProfile, currentTheta) {
  const { skillMastery = {}, assessmentHistory = [] } = learningProfile;

  const candidates = [];

  // Get all skills the student has interacted with
  for (const [skillId, data] of Object.entries(skillMastery)) {
    const { masteryScore = 0, status, difficulty = 0 } = data;

    // Calculate priority score
    let priority = 0;

    // Frontier skills (within 0.5 of theta) - highest priority
    const distanceFromTheta = Math.abs(difficulty - currentTheta);
    if (distanceFromTheta < 0.5) {
      priority += 10;
    } else if (distanceFromTheta < 1.0) {
      priority += 5;
    }

    // Recently worked on - test retention
    if (status === 'learning' || status === 'practiced') {
      priority += 3;
    }

    // Previously struggled - check improvement
    if (masteryScore < 0.5 && masteryScore > 0) {
      priority += 4;
    }

    // Mastered skills - occasional spot check
    if (status === 'mastered') {
      priority += 1;
    }

    if (priority > 0) {
      candidates.push({
        skillId,
        priority,
        difficulty,
        masteryScore,
      });
    }
  }

  // Sort by priority (highest first), then by distance from theta
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return Math.abs(a.difficulty - currentTheta) - Math.abs(b.difficulty - currentTheta);
  });

  // Return top skills (more than we need, selection will narrow down)
  return candidates.slice(0, 15).map(c => c.skillId);
}

// ===========================================================================
// RESPONSE PROCESSING
// ===========================================================================

/**
 * Process a response in growth check
 *
 * @param {Object} session - Current session
 * @param {Object} response - { problemId, skillId, difficulty, correct, responseTime }
 * @returns {Object} Updated session with next action
 */
function processGrowthCheckResponse(session, response) {
  // Add response
  session.responses.push({
    ...response,
    questionNumber: session.questionCount + 1,
    thetaBefore: session.theta,
  });

  session.questionCount++;

  // Re-estimate ability
  const responsesForEstimation = session.responses.map(r => ({
    difficulty: r.difficulty,
    discrimination: r.discrimination || 1.0,
    correct: r.correct,
  }));

  const estimate = estimateAbility(responsesForEstimation, {
    initialTheta: session.previousTheta,
  });

  session.theta = estimate.theta;
  session.standardError = estimate.standardError;

  // Update response with theta after
  session.responses[session.responses.length - 1].thetaAfter = session.theta;

  // Check if complete
  return checkGrowthCheckCompletion(session);
}

/**
 * Check if growth check should complete
 */
function checkGrowthCheckCompletion(session) {
  const { questionCount, standardError, responses } = session;
  const { minQuestions, maxQuestions, seThreshold } = GROWTH_CHECK_CONFIG;

  // Must answer minimum questions
  if (questionCount < minQuestions) {
    return {
      action: 'continue',
      session,
    };
  }

  // Complete if SE is acceptable
  if (standardError <= seThreshold) {
    return completeGrowthCheck(session, 'confidence-achieved');
  }

  // Complete if max questions reached
  if (questionCount >= maxQuestions) {
    return completeGrowthCheck(session, 'max-questions');
  }

  // Check for clear pattern (3+ same result in a row)
  if (responses.length >= 3) {
    const last3 = responses.slice(-3);
    const allSame = last3.every(r => r.correct === last3[0].correct);
    if (allSame && standardError <= 0.5) {
      return completeGrowthCheck(session, 'clear-pattern');
    }
  }

  return {
    action: 'continue',
    session,
  };
}

/**
 * Complete the growth check and generate results
 */
function completeGrowthCheck(session, reason) {
  session.complete = true;
  session.endTime = Date.now();

  // Calculate growth
  const thetaChange = session.theta - session.previousTheta;
  const percentileChange = thetaToPercentile(session.theta) - thetaToPercentile(session.previousTheta);

  // Determine growth message
  let growthMessage;
  let growthStatus;

  if (thetaChange > 0.3) {
    growthStatus = 'significant-growth';
    growthMessage = "Great progress! You've clearly been learning.";
  } else if (thetaChange > 0.1) {
    growthStatus = 'some-growth';
    growthMessage = "Nice! You're moving in the right direction.";
  } else if (thetaChange > -0.1) {
    growthStatus = 'stable';
    growthMessage = "Holding steady. Keep practicing!";
  } else {
    growthStatus = 'review-needed';
    growthMessage = "Looks like some topics need a refresher.";
  }

  // Calculate accuracy
  const correctCount = session.responses.filter(r => r.correct).length;
  const accuracy = Math.round((correctCount / session.responses.length) * 100);

  return {
    action: 'complete',
    reason,
    session,
    results: {
      // Current state
      theta: session.theta,
      standardError: session.standardError,
      percentile: thetaToPercentile(session.theta),

      // Growth comparison
      previousTheta: session.previousTheta,
      thetaChange: Math.round(thetaChange * 100) / 100,
      percentileChange,
      growthStatus,
      growthMessage,

      // Performance
      questionsAnswered: session.questionCount,
      accuracy,
      correctCount,

      // Duration
      durationMs: session.endTime - session.startTime,
    },
  };
}

// ===========================================================================
// NEXT PROBLEM SELECTION
// ===========================================================================

/**
 * Get target difficulty for next growth check problem
 *
 * Uses simpler logic than full CAT - just target current theta
 *
 * @param {Object} session - Current session
 * @returns {Number} Target difficulty
 */
function getGrowthCheckTargetDifficulty(session) {
  // For growth check, we target slightly above current theta
  // to probe the edge of their ability
  const baseTarget = session.theta;

  // Small adjustment based on recent performance
  if (session.responses.length > 0) {
    const lastResponse = session.responses[session.responses.length - 1];
    if (lastResponse.correct) {
      return baseTarget + 0.3; // Step up slightly
    } else {
      return baseTarget - 0.2; // Step back slightly
    }
  }

  return baseTarget;
}

// ===========================================================================
// EXPORTS
// ===========================================================================

module.exports = {
  // Configuration
  GROWTH_CHECK_CONFIG,

  // Session management
  initializeGrowthCheck,
  processGrowthCheckResponse,
  completeGrowthCheck,

  // Skill selection
  selectGrowthCheckSkills,

  // Problem selection
  getGrowthCheckTargetDifficulty,
};
