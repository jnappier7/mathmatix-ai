/**
 * MATH SOLVER — Polynomial expansion tests
 */

const {
  detectMathProblem,
  processMathMessage,
  verifyAnswer,
  parseFactoredForm,
} = require('../../utils/mathSolver');

// ── Detection ──

describe('detectMathProblem — polynomial expansion', () => {
  test('detects "expand (x+2)(x+3)"', () => {
    const result = detectMathProblem('expand (x+2)(x+3)');
    expect(result).not.toBeNull();
    expect(result.type).toBe('expand_polynomial');
  });

  test('detects "multiply (2x+3)(x-4)"', () => {
    const result = detectMathProblem('multiply (2x+3)(x-4)');
    expect(result).not.toBeNull();
    expect(result.type).toBe('expand_polynomial');
  });

  test('detects bare "(x+3)(x+4)" without keyword', () => {
    const result = detectMathProblem('(x+3)(x+4)');
    expect(result).not.toBeNull();
    expect(result.type).toBe('expand_polynomial');
  });

  test('detects "FOIL (x+5)(x-2)"', () => {
    const result = detectMathProblem('FOIL (x+5)(x-2)');
    expect(result).not.toBeNull();
    expect(result.type).toBe('expand_polynomial');
  });

  test('detects "simplify (x+1)(x+6)"', () => {
    const result = detectMathProblem('simplify (x+1)(x+6)');
    expect(result).not.toBeNull();
    expect(result.type).toBe('expand_polynomial');
  });
});

// ── Solving ──

describe('solveExpandPolynomial', () => {
  test('(x+2)(x+3) → x^2 + 5x + 6', () => {
    const result = processMathMessage('expand (x+2)(x+3)');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('x^2 + 5x + 6');
  });

  test('(x+5)(x-2) → x^2 + 3x - 10', () => {
    const result = processMathMessage('expand (x+5)(x-2)');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('x^2 + 3x - 10');
  });

  test('(2x+3)(x-4) → 2x^2 - 5x - 12', () => {
    const result = processMathMessage('multiply (2x+3)(x-4)');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('2x^2 - 5x - 12');
  });

  test('(x+1)(x+1) → x^2 + 2x + 1', () => {
    const result = processMathMessage('expand (x+1)(x+1)');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('x^2 + 2x + 1');
  });

  test('(x-3)(x-3) → x^2 - 6x + 9', () => {
    const result = processMathMessage('expand (x-3)(x-3)');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('x^2 - 6x + 9');
  });

  test('(x+4)(x-4) → x^2 - 16 (difference of squares)', () => {
    const result = processMathMessage('expand (x+4)(x-4)');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('x^2 - 16');
  });

  test('(3x+1)(x+2) → 3x^2 + 7x + 2', () => {
    const result = processMathMessage('expand (3x+1)(x+2)');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('3x^2 + 7x + 2');
  });
});

// ── Verification ──

describe('verifyAnswer — polynomial expansion', () => {
  test('"x^2 + 5x + 6" matches "x^2 + 5x + 6"', () => {
    expect(verifyAnswer('x^2 + 5x + 6', 'x^2 + 5x + 6').isCorrect).toBe(true);
  });

  test('"2x^2 - 5x - 12" matches "2x^2 - 5x - 12"', () => {
    expect(verifyAnswer('2x^2 - 5x - 12', '2x^2 - 5x - 12').isCorrect).toBe(true);
  });
});
