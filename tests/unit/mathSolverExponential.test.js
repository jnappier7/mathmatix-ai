/**
 * MATH SOLVER — Exponential equation tests
 *
 * Covers all exponential equation forms:
 *   - Simple:        b^x = c
 *   - Coefficient:   a * b^x = c
 *   - Shifted:       b^(x+k) = c
 *   - Sum same base: a(b^x + b^(x+k)) = c
 */

const { detectMathProblem, processMathMessage } = require('../../utils/mathSolver');

// ═══════════════════════════════════════════════════════════════════
// DETECTION — Simple form: b^x = c
// ═══════════════════════════════════════════════════════════════════

describe('detectMathProblem — simple exponential equations', () => {
  test('detects "2^x = 8"', () => {
    const r = detectMathProblem('2^x = 8');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
    expect(r.base).toBe(2);
    expect(r.result).toBe(8);
  });

  test('detects "3^x = 81"', () => {
    const r = detectMathProblem('3^x = 81');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
  });

  test('detects "5^x = 125"', () => {
    const r = detectMathProblem('5^x = 125');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
  });

  test('detects "solve 10^x = 10000"', () => {
    const r = detectMathProblem('solve 10^x = 10000');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
  });
});

// ═══════════════════════════════════════════════════════════════════
// DETECTION — Coefficient form: a * b^x = c
// ═══════════════════════════════════════════════════════════════════

describe('detectMathProblem — coefficient exponential equations', () => {
  test('detects "2 * 3^x = 54"', () => {
    const r = detectMathProblem('2 * 3^x = 54');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
    expect(r.subtype).toBe('coefficient');
    expect(r.coefficient).toBe(2);
    expect(r.base).toBe(3);
    expect(r.result).toBe(54);
  });

  test('detects "2(5^x) = 250"', () => {
    const r = detectMathProblem('2(5^x) = 250');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
    expect(r.subtype).toBe('coefficient');
    expect(r.coefficient).toBe(2);
    expect(r.base).toBe(5);
    expect(r.result).toBe(250);
  });

  test('detects "4 · 3^x = 108"', () => {
    const r = detectMathProblem('4 · 3^x = 108');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
    expect(r.subtype).toBe('coefficient');
    expect(r.coefficient).toBe(4);
    expect(r.base).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// DETECTION — Shifted exponent: b^(x+k) = c
// ═══════════════════════════════════════════════════════════════════

describe('detectMathProblem — shifted exponential equations', () => {
  test('detects "3^(x+1) = 81"', () => {
    const r = detectMathProblem('3^(x+1) = 81');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
    expect(r.subtype).toBe('shifted');
    expect(r.base).toBe(3);
    expect(r.shift).toBe(1);
    expect(r.result).toBe(81);
  });

  test('detects "2^(x-2) = 16"', () => {
    const r = detectMathProblem('2^(x-2) = 16');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
    expect(r.subtype).toBe('shifted');
    expect(r.base).toBe(2);
    expect(r.shift).toBe(-2);
    expect(r.result).toBe(16);
  });

  test('detects "5^(x + 3) = 625"', () => {
    const r = detectMathProblem('5^(x + 3) = 625');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
    expect(r.subtype).toBe('shifted');
    expect(r.base).toBe(5);
    expect(r.shift).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// DETECTION — Sum of same-base exponentials
// ═══════════════════════════════════════════════════════════════════

describe('detectMathProblem — sum of same-base exponential equations', () => {
  test('detects "3(3^x + 3^(x+1)) = 108"', () => {
    const r = detectMathProblem('3(3^x + 3^(x+1)) = 108');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
    expect(r.subtype).toBe('sum_same_base');
    expect(r.outerCoefficient).toBe(3);
    expect(r.base).toBe(3);
    expect(r.result).toBe(108);
  });

  test('detects "3^x + 3^(x+1) = 36"', () => {
    const r = detectMathProblem('3^x + 3^(x+1) = 36');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
    expect(r.subtype).toBe('sum_same_base');
    expect(r.outerCoefficient).toBe(1);
    expect(r.base).toBe(3);
  });

  test('detects reversed order "3^(x+1) + 3^x = 36"', () => {
    const r = detectMathProblem('3^(x+1) + 3^x = 36');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
    expect(r.subtype).toBe('sum_same_base');
    expect(r.base).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SOLVING — Simple form
// ═══════════════════════════════════════════════════════════════════

describe('solveExponentialEquation — simple form', () => {
  test('2^x = 8 → x = 3', () => {
    const r = processMathMessage('2^x = 8');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('3');
  });

  test('3^x = 81 → x = 4', () => {
    const r = processMathMessage('3^x = 81');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('4');
  });

  test('5^x = 125 → x = 3', () => {
    const r = processMathMessage('5^x = 125');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('3');
  });

  test('10^x = 10000 → x = 4', () => {
    const r = processMathMessage('10^x = 10000');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('4');
  });

  test('2^x = 32 → x = 5', () => {
    const r = processMathMessage('2^x = 32');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('5');
  });

  test('4^x = 16 → x = 2', () => {
    const r = processMathMessage('4^x = 16');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('2');
  });

  test('2^x = 1 → x = 0', () => {
    const r = processMathMessage('2^x = 1');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('0');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SOLVING — Coefficient form: a * b^x = c
// ═══════════════════════════════════════════════════════════════════

describe('solveExponentialEquation — coefficient form', () => {
  test('2 * 3^x = 54 → x = 3', () => {
    // 3^x = 54/2 = 27, x = 3
    const r = processMathMessage('2 * 3^x = 54');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('3');
  });

  test('2(5^x) = 250 → x = 3', () => {
    // 5^x = 250/2 = 125, x = 3
    const r = processMathMessage('2(5^x) = 250');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('3');
  });

  test('4 * 2^x = 64 → x = 4', () => {
    // 2^x = 64/4 = 16, x = 4
    const r = processMathMessage('4 * 2^x = 64');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('4');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SOLVING — Shifted exponent: b^(x+k) = c
// ═══════════════════════════════════════════════════════════════════

describe('solveExponentialEquation — shifted exponent', () => {
  test('3^(x+1) = 81 → x = 3', () => {
    // x+1 = log(81)/log(3) = 4, x = 3
    const r = processMathMessage('3^(x+1) = 81');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('3');
  });

  test('2^(x-2) = 16 → x = 6', () => {
    // x-2 = log(16)/log(2) = 4, x = 6
    const r = processMathMessage('2^(x-2) = 16');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('6');
  });

  test('5^(x+3) = 625 → x = 1', () => {
    // x+3 = log(625)/log(5) = 4, x = 1
    const r = processMathMessage('5^(x+3) = 625');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('1');
  });

  test('10^(x-1) = 1000 → x = 4', () => {
    // x-1 = log(1000)/log(10) = 3, x = 4
    const r = processMathMessage('10^(x-1) = 1000');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('4');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SOLVING — Sum of same-base exponentials
// ═══════════════════════════════════════════════════════════════════

describe('solveExponentialEquation — sum of same-base exponentials', () => {
  test('3(3^x + 3^(x+1)) = 108 → x = 2', () => {
    // Factor: 3 · 3^x · (1 + 3) = 108 → 12 · 3^x = 108 → 3^x = 9 → x = 2
    const r = processMathMessage('3(3^x + 3^(x+1)) = 108');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('2');
  });

  test('3^x + 3^(x+1) = 36 → x = 2', () => {
    // Factor: 3^x(1 + 3) = 36 → 4 · 3^x = 36 → 3^x = 9 → x = 2
    const r = processMathMessage('3^x + 3^(x+1) = 36');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('2');
  });

  test('2^x + 2^(x+2) = 40 → x = 3', () => {
    // Factor: 2^x(1 + 4) = 40 → 5 · 2^x = 40 → 2^x = 8 → x = 3
    const r = processMathMessage('2^x + 2^(x+2) = 40');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('3');
  });

  test('reversed order: 3^(x+1) + 3^x = 36 → x = 2', () => {
    const r = processMathMessage('3^(x+1) + 3^x = 36');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('2');
  });
});
