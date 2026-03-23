/**
 * MATH SOLVER — Absolute value equation tests
 */

const { detectMathProblem, processMathMessage, verifyAnswer } = require('../../utils/mathSolver');

describe('detectMathProblem — absolute value equations', () => {
  test('detects "|2x + 3| = 7"', () => {
    const r = detectMathProblem('|2x + 3| = 7');
    expect(r).not.toBeNull();
    expect(r.type).toBe('absolute_value_equation');
    expect(r.coefficient).toBe(2);
    expect(r.operator).toBe('+');
    expect(r.constant).toBe(3);
    expect(r.result).toBe(7);
  });

  test('detects "|x - 5| = 10"', () => {
    const r = detectMathProblem('|x - 5| = 10');
    expect(r).not.toBeNull();
    expect(r.type).toBe('absolute_value_equation');
    expect(r.coefficient).toBe(1);
  });

  test('detects "solve |3x + 1| = 4"', () => {
    const r = detectMathProblem('solve |3x + 1| = 4');
    expect(r).not.toBeNull();
    expect(r.type).toBe('absolute_value_equation');
  });

  test('detects "|x + 7| = 0"', () => {
    const r = detectMathProblem('|x + 7| = 0');
    expect(r).not.toBeNull();
    expect(r.type).toBe('absolute_value_equation');
  });
});

describe('solveAbsoluteValue', () => {
  test('|2x + 3| = 7 → x = -5 or x = 2', () => {
    const r = processMathMessage('|2x + 3| = 7');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('x = -5 or x = 2');
  });

  test('|x - 5| = 10 → x = -5 or x = 15', () => {
    const r = processMathMessage('|x - 5| = 10');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('x = -5 or x = 15');
  });

  test('|3x + 1| = 4 → x = -5/3 or x = 1', () => {
    const r = processMathMessage('|3x + 1| = 4');
    expect(r.solution.success).toBe(true);
    // (4 - 1)/3 = 1, (-4 - 1)/3 = -5/3 ≈ -1.6667
    expect(r.solution.answer).toContain('x = 1');
    expect(r.solution.answer).toContain('or');
  });

  test('|x + 7| = 0 → x = -7 (single solution)', () => {
    const r = processMathMessage('|x + 7| = 0');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('x = -7');
  });

  test('|x + 3| = 5 → x = -8 or x = 2', () => {
    const r = processMathMessage('|x + 3| = 5');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('x = -8 or x = 2');
  });

  test('|x - 1| = 4 → x = -3 or x = 5', () => {
    const r = processMathMessage('|x - 1| = 4');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('x = -3 or x = 5');
  });
});
