/**
 * calculateProblemStats REGRESSION TESTS
 *
 * This function feeds the student-facing accuracy/problems stat. It previously
 * had NO direct coverage, and a keyword-detection fallback silently fabricated
 * "attempts" by scanning the tutor's coaching text — supportive phrasing like
 * "let's take a look" / "almost" / "not quite" matched its "incorrect" patterns,
 * inventing problems that were never answered and depressing accuracy.
 *
 * The fallback was removed: only structured `problemResult` tags count. These
 * tests lock that contract so the bypass cannot come back.
 */

const { calculateProblemStats } = require('../../utils/activitySummarizer');

describe('calculateProblemStats', () => {
  test('never fabricates attempts from the tutor\'s coaching language', () => {
    // These messages carry NO problemResult tag. Every phrase below used to trip
    // the old keyword fallback and get counted as an incorrect attempt.
    const coachingOnly = [
      { role: 'assistant', content: "Let's take a closer look at how you solved it." },
      { role: 'assistant', content: 'Almost! Not quite there yet.' },
      { role: 'assistant', content: "Let's try that again together." },
      { role: 'assistant', content: 'Great job showing your work — exactly!' },
      { role: 'user', content: 'is it 12?' },
    ];
    expect(calculateProblemStats(coachingOnly)).toEqual({ attempted: 0, correct: 0 });
  });

  test('counts only structured problemResult tags on assistant messages', () => {
    const messages = [
      { role: 'user', content: 'x = 7', problemResult: 'correct' }, // user msg: ignored
      { role: 'assistant', content: 'Nice!', problemResult: 'correct' },
      { role: 'assistant', content: 'Not quite — check the sign.', problemResult: 'incorrect' },
      { role: 'assistant', content: 'No worries, we can skip it.', problemResult: 'skipped' },
      { role: 'assistant', content: 'Here is a hint.' }, // untagged coaching: ignored
    ];
    // 3 tagged assistant messages -> 3 attempts; only 1 is 'correct'.
    expect(calculateProblemStats(messages)).toEqual({ attempted: 3, correct: 1 });
  });

  test('returns zeros for an empty conversation', () => {
    expect(calculateProblemStats([])).toEqual({ attempted: 0, correct: 0 });
  });

  test('a fully correct run reports 100% of attempts correct', () => {
    const messages = [
      { role: 'assistant', content: 'Right!', problemResult: 'correct' },
      { role: 'assistant', content: 'Right again!', problemResult: 'correct' },
    ];
    expect(calculateProblemStats(messages)).toEqual({ attempted: 2, correct: 2 });
  });
});
