/**
 * MATH SOLVER — Difference of squares factoring tests
 */

const {
  detectMathProblem,
  processMathMessage,
  verifyAnswer,
} = require('../../utils/mathSolver');

// ── Detection ──

describe('detectMathProblem — difference of squares', () => {
  test('detects "factor x² - 9"', () => {
    const result = detectMathProblem('factor x² - 9');
    expect(result).not.toBeNull();
    expect(result.type).toBe('factor_diff_of_squares');
    expect(result.a).toBe(1);
    expect(result.c).toBe(9);
  });

  test('detects "factor x^2 - 25"', () => {
    const result = detectMathProblem('factor x^2 - 25');
    expect(result).not.toBeNull();
    expect(result.type).toBe('factor_diff_of_squares');
    expect(result.c).toBe(25);
  });

  test('detects "factor 4x² - 9"', () => {
    const result = detectMathProblem('factor 4x² - 9');
    expect(result).not.toBeNull();
    expect(result.type).toBe('factor_diff_of_squares');
    expect(result.a).toBe(4);
    expect(result.c).toBe(9);
  });

  test('detects "factor x^2 - 16"', () => {
    const result = detectMathProblem('factor x^2 - 16');
    expect(result).not.toBeNull();
    expect(result.type).toBe('factor_diff_of_squares');
  });

  test('detects "factor the difference of squares x² - 49"', () => {
    const result = detectMathProblem('factor the difference of squares x² - 49');
    expect(result).not.toBeNull();
    expect(result.type).toBe('factor_diff_of_squares');
  });

  test('detects "factoring x^2 - 1"', () => {
    const result = detectMathProblem('factoring x^2 - 1');
    expect(result).not.toBeNull();
    expect(result.type).toBe('factor_diff_of_squares');
  });

  test('does NOT detect trinomial as difference of squares', () => {
    const result = detectMathProblem('factor x^2 + 5x + 6');
    expect(result).not.toBeNull();
    expect(result.type).toBe('factor_quadratic');
  });
});

// ── Solving ──

describe('solveFactorDiffOfSquares', () => {
  test('x² - 9 → (x+3)(x-3)', () => {
    const result = processMathMessage('factor x² - 9');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('(x+3)(x-3)');
  });

  test('x² - 25 → (x+5)(x-5)', () => {
    const result = processMathMessage('factor x^2 - 25');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('(x+5)(x-5)');
  });

  test('x² - 16 → (x+4)(x-4)', () => {
    const result = processMathMessage('factor x^2 - 16');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('(x+4)(x-4)');
  });

  test('x² - 1 → (x+1)(x-1)', () => {
    const result = processMathMessage('factor x^2 - 1');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('(x+1)(x-1)');
  });

  test('4x² - 9 → (2x+3)(2x-3)', () => {
    const result = processMathMessage('factor 4x² - 9');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('(2x+3)(2x-3)');
  });

  test('x² - 49 → (x+7)(x-7)', () => {
    const result = processMathMessage('factor x² - 49');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('(x+7)(x-7)');
  });

  test('9x² - 4 → (3x+2)(3x-2)', () => {
    const result = processMathMessage('factor 9x² - 4');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('(3x+2)(3x-2)');
  });
});

// ── Verification with commutative property ──

describe('verifyAnswer — difference of squares', () => {
  test('(x+3)(x-3) matches (x-3)(x+3)', () => {
    expect(verifyAnswer('(x+3)(x-3)', '(x-3)(x+3)').isCorrect).toBe(true);
  });

  test('(x-5)(x+5) matches (x+5)(x-5)', () => {
    expect(verifyAnswer('(x-5)(x+5)', '(x+5)(x-5)').isCorrect).toBe(true);
  });

  test('(x+4)(x-4) matches (x+4)(x-4)', () => {
    expect(verifyAnswer('(x+4)(x-4)', '(x+4)(x-4)').isCorrect).toBe(true);
  });
});
