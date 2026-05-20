/**
 * MASTERY GUARD — small, shared helpers for "is this skill done?" decisions.
 *
 * Centralizes the logic that prevents:
 * - Starting a badge for a skill the student has already mastered
 * - Leaving a stuck activeBadge (high attempt count, low accuracy) pinned
 *   to the student's profile, which would keep dominating the tutor's
 *   focus queue and suggestion chips
 *
 * Shares the familiarity model with TutorPlan so badges and the tutor
 * agree on what "mastered" means.
 */

const TutorPlan = require('../models/tutorPlan');

// If a badge has been attempted this many times its requirement without
// being earned, we consider it stuck and clear it so the student can pick
// (or be routed to) a fresh target. 2x is conservative — it gives plenty
// of room for normal struggle before intervening.
const STUCK_BADGE_ATTEMPT_MULTIPLIER = 2;

function getSkillMasteryEntry(user, skillId) {
  if (!user || !skillId) return null;
  const sm = user.skillMastery;
  if (!sm) return null;
  if (typeof sm.get === 'function') return sm.get(skillId) || null;
  return sm[skillId] || null;
}

/**
 * Is this skill already mastered for this user?
 * Uses the same TutorPlan.inferFamiliarity rule the tutor uses, so the
 * answer here is consistent with the tutor's instructional-mode pick.
 */
function isSkillMastered(user, skillId) {
  const entry = getSkillMasteryEntry(user, skillId);
  return TutorPlan.inferFamiliarity(entry) === 'mastered';
}

/**
 * Has an activeBadge attempted enough problems that we should consider it
 * stuck and clear it? Only fires when accuracy is still below requirement.
 */
function isBadgeStuck(badge) {
  if (!badge) return false;
  const required = badge.requiredProblems || 0;
  if (required <= 0) return false;
  const completed = badge.problemsCompleted || 0;
  if (completed < required * STUCK_BADGE_ATTEMPT_MULTIPLIER) return false;
  const accuracy = completed > 0 ? (badge.problemsCorrect || 0) / completed : 0;
  return accuracy < (badge.requiredAccuracy || 0);
}

/**
 * Clear the user's activeBadge and record the abandoned attempt.
 * Returns the previously-active badge for logging/telemetry, or null.
 *
 * `reason` is logged for observability; it isn't persisted on the attempt
 * subdoc because the User.masteryProgress.attempts schema only stores
 * { badgeId, attemptDate, completed, score }.
 */
function clearActiveBadge(user, reason) {
  if (!user?.masteryProgress?.activeBadge) return null;
  const prior = user.masteryProgress.activeBadge;
  const completed = prior.problemsCompleted || 0;
  const correct = prior.problemsCorrect || 0;
  const accuracy = completed > 0 ? correct / completed : 0;

  user.masteryProgress.activeBadge = null;
  if (!Array.isArray(user.masteryProgress.attempts)) {
    user.masteryProgress.attempts = [];
  }
  user.masteryProgress.attempts.push({
    badgeId: prior.badgeId,
    attemptDate: new Date(),
    completed: false,
    score: Math.round(accuracy * 100),
  });
  user.markModified('masteryProgress');

  if (reason && typeof console !== 'undefined') {
    console.log(`[masteryGuard] cleared activeBadge ${prior.badgeId} (skill=${prior.skillId}, ${correct}/${completed} = ${Math.round(accuracy * 100)}%): ${reason}`);
  }
  return prior;
}

module.exports = {
  STUCK_BADGE_ATTEMPT_MULTIPLIER,
  isSkillMastered,
  isBadgeStuck,
  clearActiveBadge,
};
