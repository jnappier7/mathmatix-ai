// utils/progressCardState.js
//
// Decides which lifecycle state the student progress card should render. Kept
// pure and server-side so the client stays dumb and the rule is testable.
//
// Governing principle (see the card redesign): never show a number that reads as
// a verdict — always name the effort and offer a next step. The state drives the
// framing:
//   first_session  — no skill in progress and no activity yet → an invitation.
//   mastery        — just mastered a skill → celebrate + open the next door.
//   struggling     — recent effort with low first-try success → supportive, no %.
//   progress       — the normal in-progress state.
//
// The handler already early-returns for students who haven't completed the
// assessment, so this only runs for assessed students.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {Object} args
 * @param {Object|null} args.currentLearning   skill in progress, or null
 * @param {Object|null} args.recentMastery     { date } of the most recent mastery, or null
 * @param {Object} [args.weeklyStats]          { problemsSolved, problemsCorrect }
 * @param {number} [args.now]                  epoch ms (injectable for tests)
 * @param {number} [args.masteryWindowMs]      how recent a mastery still counts as "just now"
 * @param {number} [args.minStruggleAttempts]  min attempts before we'll call it struggling
 * @param {number} [args.struggleThreshold]    first-try ratio below which it's struggling
 * @returns {'first_session'|'mastery'|'struggling'|'progress'}
 */
function deriveProgressCardState({
  currentLearning = null,
  recentMastery = null,
  weeklyStats = {},
  now = Date.now(),
  masteryWindowMs = DAY_MS,
  minStruggleAttempts = 3,
  struggleThreshold = 0.4,
} = {}) {
  const solved = weeklyStats.problemsSolved || 0;
  const correct = weeklyStats.problemsCorrect || 0;

  // Celebrate a fresh mastery first — it outranks everything.
  if (recentMastery && recentMastery.date) {
    const ageMs = now - new Date(recentMastery.date).getTime();
    if (ageMs >= 0 && ageMs <= masteryWindowMs) return 'mastery';
  }

  // Brand-new: nothing in progress and nothing done yet → an invitation, not a 0%.
  if (!currentLearning && solved === 0) return 'first_session';

  // Enough recent effort but few first-try wins → supportive framing, never a %.
  if (solved >= minStruggleAttempts && correct / solved < struggleThreshold) return 'struggling';

  return 'progress';
}

module.exports = { deriveProgressCardState };
