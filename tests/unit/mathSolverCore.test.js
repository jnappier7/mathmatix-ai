/**
 * Tests for core mathSolver functions: arithmetic, fractions, percentages,
 * exponents, square roots, and the detectMathProblem / verifyAnswer entry points
 * for everyday student math.
 */
const {
  detectMathProblem,
  solveArithmetic,
  solveFractionArithmetic,
  solvePercentage,
  solveExponent,
  solveSqrt,
  verifyAnswer,
  processMathMessage,
} = require('../../utils/mathSolver');

// ---------------------------------------------------------------------------
// detectMathProblem — basic arithmetic
// ---------------------------------------------------------------------------
describe('detectMathProblem — arithmetic', () => {
  it('detects "5 + 3"', () => {
    const r = detectMathProblem('5 + 3');
    expect(r).not.toBeNull();
    expect(r.type).toBe('arithmetic');
    expect(r.operator).toBe('+');
  });

  it('detects "12 - 7"', () => {
    const r = detectMathProblem('12 - 7');
    expect(r).not.toBeNull();
    expect(r.type).toBe('arithmetic');
  });

  it('detects "6 * 9"', () => {
    const r = detectMathProblem('6 * 9');
    expect(r).not.toBeNull();
    expect(r.type).toBe('arithmetic');
  });

  it('detects "20 / 4"', () => {
    const r = detectMathProblem('20 / 4');
    expect(r).not.toBeNull();
    expect(r.type).toBe('arithmetic');
  });

  it('detects natural language "multiply 6 by 7"', () => {
    const r = detectMathProblem('multiply 6 by 7');
    expect(r).not.toBeNull();
    expect(r.operator).toBe('*');
    expect(r.left).toBe(6);
    expect(r.right).toBe(7);
  });

  it('detects "8 times 3"', () => {
    const r = detectMathProblem('8 times 3');
    expect(r).not.toBeNull();
    expect(r.operator).toBe('*');
  });

  it('detects "divide 24 by 6"', () => {
    const r = detectMathProblem('divide 24 by 6');
    expect(r).not.toBeNull();
    expect(r.operator).toBe('/');
  });

  it('detects "15 divided by 3"', () => {
    const r = detectMathProblem('15 divided by 3');
    expect(r).not.toBeNull();
    expect(r.operator).toBe('/');
  });

  it('detects "add 5 and 3"', () => {
    const r = detectMathProblem('add 5 and 3');
    expect(r).not.toBeNull();
    expect(r.operator).toBe('+');
  });

  it('detects "7 plus 8"', () => {
    const r = detectMathProblem('7 plus 8');
    expect(r).not.toBeNull();
    expect(r.operator).toBe('+');
  });

  it('returns null for plain text', () => {
    expect(detectMathProblem('hello how are you')).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(detectMathProblem(null)).toBeNull();
    expect(detectMathProblem(undefined)).toBeNull();
    expect(detectMathProblem('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// solveArithmetic
// ---------------------------------------------------------------------------
describe('solveArithmetic', () => {
  it('adds two numbers', () => {
    const r = solveArithmetic({ left: 5, operator: '+', right: 3 });
    expect(r.success).toBe(true);
    expect(parseFloat(r.answer)).toBe(8);
  });

  it('subtracts two numbers', () => {
    const r = solveArithmetic({ left: 10, operator: '-', right: 4 });
    expect(r.success).toBe(true);
    expect(parseFloat(r.answer)).toBe(6);
  });

  it('multiplies two numbers', () => {
    const r = solveArithmetic({ left: 7, operator: '*', right: 8 });
    expect(r.success).toBe(true);
    expect(parseFloat(r.answer)).toBe(56);
  });

  it('divides two numbers', () => {
    const r = solveArithmetic({ left: 20, operator: '/', right: 4 });
    expect(r.success).toBe(true);
    expect(parseFloat(r.answer)).toBe(5);
  });

  it('handles division by zero', () => {
    const r = solveArithmetic({ left: 5, operator: '/', right: 0 });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/zero/i);
  });

  it('handles decimal arithmetic', () => {
    const r = solveArithmetic({ left: 3.5, operator: '+', right: 2.7 });
    expect(r.success).toBe(true);
    expect(parseFloat(r.answer)).toBeCloseTo(6.2);
  });

  it('handles negative results', () => {
    const r = solveArithmetic({ left: 3, operator: '-', right: 10 });
    expect(r.success).toBe(true);
    expect(parseFloat(r.answer)).toBe(-7);
  });

  it('handles unknown operator', () => {
    const r = solveArithmetic({ left: 3, operator: '%', right: 2 });
    expect(r.success).toBe(false);
  });

  it('returns steps showing the work', () => {
    const r = solveArithmetic({ left: 6, operator: '*', right: 7 });
    expect(r.steps).toBeDefined();
    expect(r.steps.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// solveFractionArithmetic
// ---------------------------------------------------------------------------
describe('solveFractionArithmetic', () => {
  it('adds 1/2 + 1/3 = 5/6', () => {
    const r = solveFractionArithmetic({ leftNum: 1, leftDen: 2, operator: '+', rightNum: 1, rightDen: 3 });
    expect(r.success).toBe(true);
    expect(r.answer).toBe('5/6');
  });

  it('subtracts 3/4 - 1/4 = 1/2', () => {
    const r = solveFractionArithmetic({ leftNum: 3, leftDen: 4, operator: '-', rightNum: 1, rightDen: 4 });
    expect(r.success).toBe(true);
    expect(r.answer).toBe('1/2');
  });

  it('multiplies 2/3 * 3/4 = 1/2', () => {
    const r = solveFractionArithmetic({ leftNum: 2, leftDen: 3, operator: '*', rightNum: 3, rightDen: 4 });
    expect(r.success).toBe(true);
    expect(r.answer).toBe('1/2');
  });

  it('divides 1/2 ÷ 1/4 = 2', () => {
    const r = solveFractionArithmetic({ leftNum: 1, leftDen: 2, operator: '/', rightNum: 1, rightDen: 4 });
    expect(r.success).toBe(true);
    expect(r.answer).toBe('2');
  });

  it('simplifies fractions (2/4 + 2/4 = 1)', () => {
    const r = solveFractionArithmetic({ leftNum: 2, leftDen: 4, operator: '+', rightNum: 2, rightDen: 4 });
    expect(r.success).toBe(true);
    expect(r.answer).toBe('1');
  });

  it('handles negative results (1/3 - 2/3 = -1/3)', () => {
    const r = solveFractionArithmetic({ leftNum: 1, leftDen: 3, operator: '-', rightNum: 2, rightDen: 3 });
    expect(r.success).toBe(true);
    expect(r.answer).toBe('-1/3');
  });
});

// ---------------------------------------------------------------------------
// solvePercentage
// ---------------------------------------------------------------------------
describe('solvePercentage', () => {
  it('calculates 25% of 200 = 50', () => {
    const r = solvePercentage({ percent: 25, whole: 200 });
    expect(r.success).toBe(true);
    expect(parseFloat(r.answer)).toBe(50);
  });

  it('calculates 10% of 350 = 35', () => {
    const r = solvePercentage({ percent: 10, whole: 350 });
    expect(r.success).toBe(true);
    expect(parseFloat(r.answer)).toBe(35);
  });

  it('calculates 100% of 42 = 42', () => {
    const r = solvePercentage({ percent: 100, whole: 42 });
    expect(r.success).toBe(true);
    expect(parseFloat(r.answer)).toBe(42);
  });

  it('calculates 0% = 0', () => {
    const r = solvePercentage({ percent: 0, whole: 500 });
    expect(r.success).toBe(true);
    expect(parseFloat(r.answer)).toBe(0);
  });

  it('returns steps', () => {
    const r = solvePercentage({ percent: 15, whole: 80 });
    expect(r.steps.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// solveExponent
// ---------------------------------------------------------------------------
describe('solveExponent', () => {
  it('calculates 2^3 = 8', () => {
    const r = solveExponent({ base: 2, exponent: 3 });
    expect(r.success).toBe(true);
    expect(parseFloat(r.answer)).toBe(8);
  });

  it('calculates 5^0 = 1', () => {
    const r = solveExponent({ base: 5, exponent: 0 });
    expect(r.success).toBe(true);
    expect(parseFloat(r.answer)).toBe(1);
  });

  it('calculates 10^2 = 100', () => {
    const r = solveExponent({ base: 10, exponent: 2 });
    expect(r.success).toBe(true);
    expect(parseFloat(r.answer)).toBe(100);
  });

  it('handles Unicode superscript via detect → solve', () => {
    const r = processMathMessage('3²');
    expect(r.hasMath).toBe(true);
    expect(parseFloat(r.solution.answer)).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// solveSqrt
// ---------------------------------------------------------------------------
describe('solveSqrt', () => {
  it('calculates √16 = 4', () => {
    const r = solveSqrt({ value: 16 });
    expect(r.success).toBe(true);
    expect(parseFloat(r.answer)).toBe(4);
    expect(r.isPerfectSquare).toBe(true);
  });

  it('calculates √2 ≈ 1.414', () => {
    const r = solveSqrt({ value: 2 });
    expect(r.success).toBe(true);
    expect(parseFloat(r.answer)).toBeCloseTo(1.414, 2);
    expect(r.isPerfectSquare).toBe(false);
  });

  it('calculates √0 = 0', () => {
    const r = solveSqrt({ value: 0 });
    expect(r.success).toBe(true);
    expect(parseFloat(r.answer)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// verifyAnswer — the core correctness checker
// ---------------------------------------------------------------------------
describe('verifyAnswer', () => {
  it('exact string match', () => {
    expect(verifyAnswer('42', '42').isCorrect).toBe(true);
    expect(verifyAnswer('42', '42').exact).toBe(true);
  });

  it('numeric match with tolerance', () => {
    expect(verifyAnswer('3.14', '3.14159').isCorrect).toBe(true);
  });

  it('rejects wrong answers', () => {
    expect(verifyAnswer('5', '10').isCorrect).toBe(false);
  });

  it('compares equivalent fractions (2/4 vs 1/2)', () => {
    expect(verifyAnswer('2/4', '1/2').isCorrect).toBe(true);
  });

  it('compares system of equations in different order', () => {
    expect(verifyAnswer('x = 3, y = 2', 'y = 2, x = 3').isCorrect).toBe(true);
  });

  it('compares factored forms with commutative property', () => {
    expect(verifyAnswer('(x+2)(x+3)', '(x+3)(x+2)').isCorrect).toBe(true);
  });

  it('handles whitespace differences', () => {
    expect(verifyAnswer(' 42 ', '42').isCorrect).toBe(true);
  });

  it('case-insensitive comparison', () => {
    expect(verifyAnswer('X = 5', 'x = 5').isCorrect).toBe(true);
  });

  it('does not falsely match algebraic and numeric forms', () => {
    // "3x^2-3+2" should NOT match "3x^2-3"
    expect(verifyAnswer('3x^2-3+2', '3x^2-3').isCorrect).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// processMathMessage — end-to-end detect + solve
// ---------------------------------------------------------------------------
describe('processMathMessage', () => {
  it('solves "5 + 3"', () => {
    const r = processMathMessage('5 + 3');
    expect(r.hasMath).toBe(true);
    expect(parseFloat(r.solution.answer)).toBe(8);
  });

  it('solves "12 * 4"', () => {
    const r = processMathMessage('12 * 4');
    expect(r.hasMath).toBe(true);
    expect(parseFloat(r.solution.answer)).toBe(48);
  });

  it('solves "100 / 5"', () => {
    const r = processMathMessage('100 / 5');
    expect(r.hasMath).toBe(true);
    expect(parseFloat(r.solution.answer)).toBe(20);
  });

  it('returns hasMath: false for non-math messages', () => {
    const r = processMathMessage('thanks for the help!');
    expect(r.hasMath).toBe(false);
  });

  it('returns hasMath: false for null input', () => {
    expect(processMathMessage(null).hasMath).toBe(false);
    expect(processMathMessage('').hasMath).toBe(false);
  });
});
