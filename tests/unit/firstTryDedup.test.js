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
