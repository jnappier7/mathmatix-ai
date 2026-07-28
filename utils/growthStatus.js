/**
 * GROWTH STATUS
 *
 * Classify a growth check's theta change into the four buckets that
 * models/user.js pins in the `growthCheckHistory.growthStatus` enum, plus the
 * student-facing sentence for each.
 *
 * This is the one piece of the retired utils/growthCheck.js worth keeping. The
 * rest of that module was a second, diverged CAT implementation running off an
 * in-memory session Map; growth checks now run on the DB-backed screener
 * (routes/screener.js, sessionType 'growth-check'), which calls into here when
 * it writes the history entry.
 *
 * Thresholds are carried over verbatim from the old completeGrowthCheck() so
 * existing history rows stay comparable to new ones.
 *
 * @module growthStatus
 */

const GROWTH_STATUSES = ['significant-growth', 'some-growth', 'stable', 'review-needed'];

const GROWTH_MESSAGES = {
  'significant-growth': "Great progress! You've clearly been learning.",
  'some-growth': "Nice! You're moving in the right direction.",
  'stable': 'Holding steady. Keep practicing!',
  'review-needed': 'Looks like some topics need a refresher.',
};

/**
 * @param {Number} thetaChange - newTheta - previousTheta, on the IRT theta scale
 * @returns {String} one of GROWTH_STATUSES
 */
function classifyGrowth(thetaChange) {
  // A non-finite change (no prior estimate, NaN theta) is not evidence of a
  // decline — treat it as "stable" rather than telling a student to review.
  if (typeof thetaChange !== 'number' || !Number.isFinite(thetaChange)) {
    return 'stable';
  }
  if (thetaChange > 0.3) return 'significant-growth';
  if (thetaChange > 0.1) return 'some-growth';
  if (thetaChange > -0.1) return 'stable';
  return 'review-needed';
}

/**
 * @param {String} status - a value from GROWTH_STATUSES
 * @returns {String} the student-facing sentence for that status
 */
function growthMessage(status) {
  return GROWTH_MESSAGES[status] || GROWTH_MESSAGES.stable;
}

module.exports = { classifyGrowth, growthMessage, GROWTH_STATUSES, GROWTH_MESSAGES };
