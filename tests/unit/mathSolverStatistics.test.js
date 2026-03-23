/**
 * MATH SOLVER — Mean, median, mode, range tests
 */

const { detectMathProblem, processMathMessage } = require('../../utils/mathSolver');

describe('detectMathProblem — statistics', () => {
  test('detects "find the mean of 3, 5, 7, 9"', () => {
    const r = detectMathProblem('find the mean of 3, 5, 7, 9');
    expect(r).not.toBeNull();
    expect(r.type).toBe('statistics');
    expect(r.operation).toBe('mean');
    expect(r.data).toEqual([3, 5, 7, 9]);
  });

  test('detects "median of 12, 15, 18, 20, 22"', () => {
    const r = detectMathProblem('median of 12, 15, 18, 20, 22');
    expect(r).not.toBeNull();
    expect(r.type).toBe('statistics');
    expect(r.operation).toBe('median');
  });

  test('detects "mode of 3, 8, 3, 2, 8, 3"', () => {
    const r = detectMathProblem('mode of 3, 8, 3, 2, 8, 3');
    expect(r).not.toBeNull();
    expect(r.type).toBe('statistics');
    expect(r.operation).toBe('mode');
  });

  test('detects "range of 5, 10, 15, 20"', () => {
    const r = detectMathProblem('range of 5, 10, 15, 20');
    expect(r).not.toBeNull();
    expect(r.type).toBe('statistics');
    expect(r.operation).toBe('range');
  });

  test('detects "average of 80, 90, 70, 85"', () => {
    const r = detectMathProblem('average of 80, 90, 70, 85');
    expect(r).not.toBeNull();
    expect(r.type).toBe('statistics');
    expect(r.operation).toBe('average');
  });
});

describe('solveStatistics — mean', () => {
  test('mean of 3, 5, 7, 9 → 6', () => {
    const r = processMathMessage('mean of 3, 5, 7, 9');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('6');
  });

  test('average of 80, 90, 70, 85 → 81.25', () => {
    const r = processMathMessage('average of 80, 90, 70, 85');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('81.25');
  });

  test('mean of 10, 20, 30 → 20', () => {
    const r = processMathMessage('mean of 10, 20, 30');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('20');
  });
});

describe('solveStatistics — median', () => {
  test('median of 12, 15, 18, 20, 22 (odd count) → 18', () => {
    const r = processMathMessage('median of 12, 15, 18, 20, 22');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('18');
  });

  test('median of 3, 7, 1, 9 (even count, unsorted) → 5', () => {
    const r = processMathMessage('median of 3, 7, 1, 9');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('5');
  });

  test('median of 10, 20 → 15', () => {
    const r = processMathMessage('median of 10, 20');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('15');
  });
});

describe('solveStatistics — mode', () => {
  test('mode of 3, 8, 3, 2, 8, 3 → 3', () => {
    const r = processMathMessage('mode of 3, 8, 3, 2, 8, 3');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('3');
  });

  test('mode of 1, 2, 2, 3, 3 → 2, 3 (bimodal)', () => {
    const r = processMathMessage('mode of 1, 2, 2, 3, 3');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('2, 3');
  });

  test('mode of 1, 2, 3, 4 → No mode', () => {
    const r = processMathMessage('mode of 1, 2, 3, 4');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('No mode');
  });
});

describe('solveStatistics — range', () => {
  test('range of 5, 10, 15, 20 → 15', () => {
    const r = processMathMessage('range of 5, 10, 15, 20');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('15');
  });

  test('range of 3, 1, 9, 7 → 8', () => {
    const r = processMathMessage('range of 3, 1, 9, 7');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('8');
  });
});
