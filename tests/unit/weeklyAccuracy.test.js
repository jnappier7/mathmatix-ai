/**
 * computeWeeklyAccuracy UNIT TESTS
 *
 * Locks the student-facing accuracy decision: how the two correctness sources
 * (chat pipeline + Show Your Work) combine, and when a sample is large enough to
 * show as a percentage vs. a raw fraction.
 */

const { computeWeeklyAccuracy, MIN_ACCURACY_SAMPLE } = require('../../utils/weeklyAccuracy');

describe('computeWeeklyAccuracy', () => {
  test('combines chat-path and Show Your Work counts', () => {
    const r = computeWeeklyAccuracy({ convProblems: 3, convCorrect: 2, gwProblems: 4, gwCorrect: 3 });
    expect(r.problemsSolved).toBe(7);
    expect(r.problemsCorrect).toBe(5);
    expect(r.accuracy).toBe(71); // round(5/7 * 100)
  });

  test('suppresses the percentage below the sample threshold', () => {
    const r = computeWeeklyAccuracy({ convProblems: 2, convCorrect: 1 });
    expect(r.problemsSolved).toBe(2);
    expect(r.problemsCorrect).toBe(1); // fraction still available to the client
    expect(r.accuracy).toBeNull();
  });

  test('shows a percentage exactly at the threshold', () => {
    const r = computeWeeklyAccuracy({ convProblems: MIN_ACCURACY_SAMPLE, convCorrect: 2 });
    expect(r.problemsSolved).toBe(5);
    expect(r.accuracy).toBe(40);
  });

  test('Show Your Work alone can push the sample over the threshold', () => {
    const r = computeWeeklyAccuracy({ gwProblems: 6, gwCorrect: 6 });
    expect(r.problemsSolved).toBe(6);
    expect(r.accuracy).toBe(100);
  });

  test('rounds to the nearest whole percent', () => {
    const r = computeWeeklyAccuracy({ convProblems: 6, convCorrect: 2 });
    expect(r.accuracy).toBe(33); // round(2/6 * 100) = round(33.33)
  });

  test('no activity returns zeros and no percentage', () => {
    expect(computeWeeklyAccuracy()).toEqual({ problemsSolved: 0, problemsCorrect: 0, accuracy: null });
    expect(computeWeeklyAccuracy({})).toEqual({ problemsSolved: 0, problemsCorrect: 0, accuracy: null });
  });

  test('respects a custom minSample override', () => {
    const r = computeWeeklyAccuracy({ convProblems: 2, convCorrect: 1, minSample: 2 });
    expect(r.accuracy).toBe(50);
  });
});
