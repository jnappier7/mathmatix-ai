/**
 * isSameProblemRetry UNIT TESTS
 *
 * Locks the retry-detection that powers the first-try accuracy metric: a
 * miss-then-fix on the same problem must NOT open a second attempt slot, but a
 * genuinely new problem must, even when a stale in-progress problem lingers.
 */

const { isSameProblemRetry } = require('../../utils/pipeline/persist');

const diag = (content) => ({ problemInfo: content ? { content } : undefined });

describe('isSameProblemRetry', () => {
  test('first attempt (no in-progress problem) is not a retry', () => {
    expect(isSameProblemRetry(null, diag('2 + 2'))).toBe(false);
    expect(isSameProblemRetry(undefined, diag('2 + 2'))).toBe(false);
  });

  test('in-progress problem with no prior wrong attempt is not a retry', () => {
    // e.g. multi-root partial: state exists but attemptCount is still 0
    const state = { problemText: 'solve x^2 = 9', attemptCount: 0 };
    expect(isSameProblemRetry(state, diag('solve x^2 = 9'))).toBe(false);
  });

  test('second try on the same problem is a retry', () => {
    const state = { problemText: 'solve 3x + 6 = 12', attemptCount: 1 };
    expect(isSameProblemRetry(state, diag('solve 3x + 6 = 12'))).toBe(true);
  });

  test('a new problem is not a retry even if a wrong problem is still in progress', () => {
    // Student gave up on one problem (attemptCount 1) and moved to another.
    const state = { problemText: 'factor x^2 - 9', attemptCount: 1 };
    expect(isSameProblemRetry(state, diag('simplify 4/8'))).toBe(false);
  });

  test('when problem text cannot be compared, defer to the in-progress flag', () => {
    const state = { problemText: '', attemptCount: 2 };
    expect(isSameProblemRetry(state, diag(null))).toBe(true);
  });
});

// The moments the Bounce Back / First Try quests and the client's Comeback
// stamp are built on (2026-10-24).
const { turnMoments } = require('../../utils/pipeline/persist');

describe('turnMoments', () => {
  test('right on the first attempt: first try, not a comeback', () => {
    expect(turnMoments({ wasCorrect: true, wasSkipped: false }, false)).toEqual({ firstTry: true, comeback: false });
  });

  test('right after a miss on the same problem: a comeback', () => {
    expect(turnMoments({ wasCorrect: true, wasSkipped: false }, true)).toEqual({ firstTry: false, comeback: true });
  });

  test('wrong again on a retry: neither', () => {
    expect(turnMoments({ wasCorrect: false, wasSkipped: false }, true)).toEqual({ firstTry: false, comeback: false });
  });

  test('wrong on the first attempt: a first try that the quest will not count', () => {
    expect(turnMoments({ wasCorrect: false, wasSkipped: false }, false)).toEqual({ firstTry: true, comeback: false });
  });

  test('a skip is never a moment', () => {
    expect(turnMoments({ wasCorrect: false, wasSkipped: true }, true)).toEqual({ firstTry: false, comeback: false });
    expect(turnMoments({ wasCorrect: false, wasSkipped: true }, false)).toEqual({ firstTry: false, comeback: false });
  });
});
