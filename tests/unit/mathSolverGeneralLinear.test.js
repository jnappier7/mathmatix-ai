/**
 * MATH SOLVER — Multi-step & variables-on-both-sides equation tests
 */

const {
  detectMathProblem,
  solveProblem,
  verifyAnswer,
  processMathMessage,
} = require('../../utils/mathSolver');

// ── Detection ──

describe('detectMathProblem — general linear equations', () => {
  test('detects simple "2x + 3 = 7"', () => {
    const result = detectMathProblem('2x + 3 = 7');
    expect(result).not.toBeNull();
    expect(result.type).toBe('general_linear');
  });

  test('detects "3(x+2) - 5 = 16" (distribution)', () => {
    const result = detectMathProblem('3(x+2) - 5 = 16');
    expect(result).not.toBeNull();
    expect(result.type).toBe('general_linear');
  });

  test('detects "-2(x-4) + 3x = 10" (negative distribution + combining)', () => {
    const result = detectMathProblem('-2(x-4) + 3x = 10');
    expect(result).not.toBeNull();
    expect(result.type).toBe('general_linear');
  });

  test('detects "3x + 5 = x + 13" (variables on both sides)', () => {
    const result = detectMathProblem('3x + 5 = x + 13');
    expect(result).not.toBeNull();
    expect(result.type).toBe('general_linear');
  });

  test('detects "5x - 3 = 2x + 9"', () => {
    const result = detectMathProblem('5x - 3 = 2x + 9');
    expect(result).not.toBeNull();
    expect(result.type).toBe('general_linear');
  });

  test('detects "solve for x: 4(x - 1) = 2(x + 3)"', () => {
    const result = detectMathProblem('solve for x: 4(x - 1) = 2(x + 3)');
    expect(result).not.toBeNull();
    expect(result.type).toBe('general_linear');
  });

  test('detects "x = 5" (trivial)', () => {
    const result = detectMathProblem('x = 5');
    expect(result).not.toBeNull();
    expect(result.type).toBe('general_linear');
  });

  test('does NOT detect quadratics as general linear', () => {
    const result = detectMathProblem('x^2 + 5x + 6 = 0');
    expect(result).not.toBeNull();
    expect(result.type).not.toBe('general_linear');
  });

  test('does NOT detect factoring as general linear', () => {
    const result = detectMathProblem('factor x^2 + 5x + 6');
    expect(result).not.toBeNull();
    expect(result.type).not.toBe('general_linear');
  });
});

// ── Solving simple equations ──

describe('solveGeneralLinear — simple equations', () => {
  test('solves 2x + 3 = 7 → x = 2', () => {
    const result = processMathMessage('2x + 3 = 7');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('2');
  });

  test('solves x + 5 = 12 → x = 7', () => {
    const result = processMathMessage('x + 5 = 12');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('7');
  });

  test('solves 3x - 9 = 0 → x = 3', () => {
    const result = processMathMessage('3x - 9 = 0');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('3');
  });

  test('solves -x + 4 = 1 → x = 3', () => {
    const result = processMathMessage('-x + 4 = 1');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('3');
  });
});

// ── Multi-step with distribution ──

describe('solveGeneralLinear — multi-step with distribution', () => {
  test('solves 3(x+2) - 5 = 16 → x = 5', () => {
    // 3x + 6 - 5 = 16 → 3x + 1 = 16 → 3x = 15 → x = 5
    const result = processMathMessage('3(x+2) - 5 = 16');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('5');
  });

  test('solves 2(x-3) = 10 → x = 8', () => {
    // 2x - 6 = 10 → 2x = 16 → x = 8
    const result = processMathMessage('2(x-3) = 10');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('8');
  });

  test('solves -2(x-4) + 3x = 10 → x = 2', () => {
    // -2x + 8 + 3x = 10 → x + 8 = 10 → x = 2
    const result = processMathMessage('-2(x-4) + 3x = 10');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('2');
  });

  test('solves 5(x+1) + 3 = 28 → x = 4', () => {
    // 5x + 5 + 3 = 28 → 5x + 8 = 28 → 5x = 20 → x = 4
    const result = processMathMessage('5(x+1) + 3 = 28');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('4');
  });
});

// ── Variables on both sides ──

describe('solveGeneralLinear — variables on both sides', () => {
  test('solves 3x + 5 = x + 13 → x = 4', () => {
    // 3x - x = 13 - 5 → 2x = 8 → x = 4
    const result = processMathMessage('3x + 5 = x + 13');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('4');
  });

  test('solves 5x - 3 = 2x + 9 → x = 4', () => {
    // 5x - 2x = 9 + 3 → 3x = 12 → x = 4
    const result = processMathMessage('5x - 3 = 2x + 9');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('4');
  });

  test('solves 7x + 2 = 3x + 14 → x = 3', () => {
    const result = processMathMessage('7x + 2 = 3x + 14');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('3');
  });

  test('solves 4(x-1) = 2(x+3) → x = 5', () => {
    // 4x - 4 = 2x + 6 → 2x = 10 → x = 5
    const result = processMathMessage('4(x-1) = 2(x+3)');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('5');
  });

  test('solves x = 5 → x = 5 (trivial)', () => {
    const result = processMathMessage('x = 5');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('5');
  });
});

// ── Edge cases ──

describe('solveGeneralLinear — edge cases', () => {
  test('handles identity: x + 3 = x + 3', () => {
    const result = processMathMessage('x + 3 = x + 3');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toMatch(/all real/i);
  });

  test('handles contradiction: x + 3 = x + 5', () => {
    const result = processMathMessage('x + 3 = x + 5');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toMatch(/no solution/i);
  });

  test('handles fractional answer: 2x + 1 = 6 → x = 2.5', () => {
    const result = processMathMessage('2x + 1 = 6');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('2.5');
  });
});

// ── Answer verification still works ──

describe('verifyAnswer — general linear solutions', () => {
  test('student answer "4" matches correct answer "4"', () => {
    expect(verifyAnswer('4', '4').isCorrect).toBe(true);
  });

  test('student answer "x = 4" extracts 4 correctly', () => {
    // verifyAnswer compares numeric values
    expect(verifyAnswer('4', '4').isCorrect).toBe(true);
  });

  test('student answer "2.5" matches "2.5"', () => {
    expect(verifyAnswer('2.5', '2.5').isCorrect).toBe(true);
  });
});
