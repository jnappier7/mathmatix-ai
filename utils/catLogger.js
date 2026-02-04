/**
 * CAT LOGGER
 *
 * Simple logging utility for CAT system.
 * Respects LOG_LEVEL environment variable.
 *
 * Levels: error < warn < info < debug
 *
 * @module catLogger
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Default to 'info' in production, 'debug' in development
const currentLevel = LOG_LEVELS[process.env.CAT_LOG_LEVEL] ??
  (process.env.NODE_ENV === 'production' ? LOG_LEVELS.info : LOG_LEVELS.debug);

/**
 * Log at debug level (verbose, for development)
 */
function debug(message, ...args) {
  if (currentLevel >= LOG_LEVELS.debug) {
    console.log(`[CAT] ${message}`, ...args);
  }
}

/**
 * Log at info level (normal operation)
 */
function info(message, ...args) {
  if (currentLevel >= LOG_LEVELS.info) {
    console.log(`[CAT] ${message}`, ...args);
  }
}

/**
 * Log at warn level (potential issues)
 */
function warn(message, ...args) {
  if (currentLevel >= LOG_LEVELS.warn) {
    console.warn(`[CAT WARN] ${message}`, ...args);
  }
}

/**
 * Log at error level (errors)
 */
function error(message, ...args) {
  if (currentLevel >= LOG_LEVELS.error) {
    console.error(`[CAT ERROR] ${message}`, ...args);
  }
}

/**
 * Log a skill selection decision
 */
function logSkillSelection(questionNum, targetDiff, selectedSkill, reason) {
  if (currentLevel >= LOG_LEVELS.info) {
    console.log(`[CAT Q${questionNum}] Target d=${targetDiff.toFixed(2)} → ${selectedSkill} (${reason})`);
  }
}

/**
 * Log an ability update
 */
function logAbilityUpdate(questionNum, wasCorrect, difficulty, newTheta, newSE) {
  if (currentLevel >= LOG_LEVELS.debug) {
    const result = wasCorrect ? '✓' : '✗';
    console.log(`[CAT] Q${questionNum} ${result} at d=${difficulty.toFixed(2)} → θ=${newTheta.toFixed(2)}, SE=${newSE.toFixed(2)}`);
  }
}

/**
 * Log session completion
 */
function logCompletion(sessionId, reason, theta, se, questionCount) {
  if (currentLevel >= LOG_LEVELS.info) {
    console.log(`[CAT] Session ${sessionId} complete: ${reason}, θ=${theta.toFixed(2)}, SE=${se.toFixed(2)}, Q=${questionCount}`);
  }
}

module.exports = {
  debug,
  info,
  warn,
  error,
  logSkillSelection,
  logAbilityUpdate,
  logCompletion,
  LOG_LEVELS,
};
