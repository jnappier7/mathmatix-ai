// utils/weeklyAccuracy.js
//
// Single source of truth for the student-facing weekly accuracy stat.
// Combines the two correctness sources — the chat pipeline counters
// (conversation.problemsAttempted/problemsCorrect) and the "Show Your Work"
// grader (GradingResult.problemCount/correctCount) — and decides whether the
// sample is large enough to express as a percentage.
//
// A percentage on a tiny sample is noise: a single graded problem swings it 20+
// points. Below MIN_ACCURACY_SAMPLE we return accuracy: null so the client shows
// the raw "correct / attempts" fraction instead (honest at low n).

const MIN_ACCURACY_SAMPLE = 5;

/**
 * @param {Object} counts
 * @param {number} [counts.convProblems=0]  chat-path attempts this window
 * @param {number} [counts.convCorrect=0]   chat-path correct this window
 * @param {number} [counts.gwProblems=0]    Show Your Work problems this window
 * @param {number} [counts.gwCorrect=0]     Show Your Work correct this window
 * @param {number} [counts.minSample=MIN_ACCURACY_SAMPLE] threshold to show a %
 * @returns {{ problemsSolved: number, problemsCorrect: number, accuracy: number|null }}
 */
function computeWeeklyAccuracy({
  convProblems = 0,
  convCorrect = 0,
  gwProblems = 0,
  gwCorrect = 0,
  minSample = MIN_ACCURACY_SAMPLE,
} = {}) {
  const problemsSolved = convProblems + gwProblems;
  const problemsCorrect = convCorrect + gwCorrect;
  const accuracy = problemsSolved >= minSample
    ? Math.round((problemsCorrect / problemsSolved) * 100)
    : null;
  return { problemsSolved, problemsCorrect, accuracy };
}

module.exports = { computeWeeklyAccuracy, MIN_ACCURACY_SAMPLE };
