/**
 * MATH SOLVER FACTORING TESTS — Unit tests for factoring quadratics
 *
 * Tests the three new capabilities:
 * 1. Factoring problem detection (detectMathProblem)
 * 2. Factoring solver (solveFactorQuadratic)
 * 3. Factored-form answer verification (verifyAnswer with commutative property)
 */

const {
  detectMathProblem,
  solveProblem,
  verifyAnswer,
  processMathMessage,
  findFactorPair,
  parseFactoredForm,
  areFactoredFormsEquivalent,
  formatBinomialProduct,
} = require('../../utils/mathSolver');

// ── Detection ──

describe('detectMathProblem — factoring quadratics', () => {
  test('detects "factor x²+5x+6"', () => {
    const result = detectMathProblem('factor x²+5x+6');
    expect(result).not.toBeNull();
    expect(result.type).toBe('factor_quadratic');
    expect(result.a).toBe(1);
    expect(result.b).toBe(5);
    expect(result.c).toBe(6);
  });

  test('detects "factor x^2 + 7x + 10"', () => {
    const result = detectMathProblem('factor x^2 + 7x + 10');
    expect(result).not.toBeNull();
    expect(result.type).toBe('factor_quadratic');
    expect(result.b).toBe(7);
    expect(result.c).toBe(10);
  });

  test('detects "factor the expression x²+9x+20"', () => {
    const result = detectMathProblem('factor the expression x²+9x+20');
    expect(result).not.toBeNull();
    expect(result.type).toBe('factor_quadratic');
  });

  test('detects negative b term: "factor x² - 5x - 14"', () => {
    const result = detectMathProblem('factor x² - 5x - 14');
    expect(result).not.toBeNull();
    expect(result.type).toBe('factor_quadratic');
    expect(result.bSign).toBe('-');
    expect(result.b).toBe(5);
    expect(result.cSign).toBe('-');
    expect(result.c).toBe(14);
  });

  test('detects "factor x²+6x-16" (positive b, negative c)', () => {
    const result = detectMathProblem('factor x²+6x-16');
    expect(result).not.toBeNull();
    expect(result.type).toBe('factor_quadratic');
    expect(result.bSign).toBe('+');
    expect(result.cSign).toBe('-');
  });

  test('detects "factoring x²+5x+6"', () => {
    const result = detectMathProblem('factoring x²+5x+6');
    expect(result).not.toBeNull();
    expect(result.type).toBe('factor_quadratic');
  });

  test('detects "factor the quadratic x^2+7x+10"', () => {
    const result = detectMathProblem('factor the quadratic x^2+7x+10');
    expect(result).not.toBeNull();
    expect(result.type).toBe('factor_quadratic');
  });

  test('detects "factor the trinomial x^2-5x-14"', () => {
    const result = detectMathProblem('factor the trinomial x^2-5x-14');
    expect(result).not.toBeNull();
    expect(result.type).toBe('factor_quadratic');
  });
});

// ── findFactorPair ──

describe('findFactorPair', () => {
  test('finds 2,3 for product=6, sum=5', () => {
    const result = findFactorPair(6, 5);
    expect(result).toEqual([2, 3]);
  });

  test('finds 2,5 for product=10, sum=7', () => {
    const result = findFactorPair(10, 7);
    expect(result).toEqual([2, 5]);
  });

  test('finds 4,5 for product=20, sum=9', () => {
    const result = findFactorPair(20, 9);
    expect(result).toEqual([4, 5]);
  });

  test('finds -2,8 for product=-16, sum=6', () => {
    const result = findFactorPair(-16, 6);
    expect(result).not.toBeNull();
    const [p, q] = result;
    expect(p + q).toBe(6);
    expect(p * q).toBe(-16);
  });

  test('finds 2,-7 for product=-14, sum=-5', () => {
    const result = findFactorPair(-14, -5);
    expect(result).not.toBeNull();
    const [p, q] = result;
    expect(p + q).toBe(-5);
    expect(p * q).toBe(-14);
  });

  test('returns null for unfactorable product=7, sum=3', () => {
    const result = findFactorPair(7, 3);
    expect(result).toBeNull();
  });
});

// ── Solver ──

describe('solveFactorQuadratic', () => {
  test('factors x²+5x+6 → (x+2)(x+3)', () => {
    const problem = { type: 'factor_quadratic', a: 1, bSign: '+', b: 5, cSign: '+', c: 6 };
    const result = solveProblem(problem);
    expect(result.success).toBe(true);
    // Verify the answer expands back to x²+5x+6
    const parsed = parseFactoredForm(result.answer);
    expect(parsed).not.toBeNull();
    expect(parsed.binomials[0].constant + parsed.binomials[1].constant).toBe(5);
    expect(parsed.binomials[0].constant * parsed.binomials[1].constant).toBe(6);
  });

  test('factors x²+7x+10 → (x+2)(x+5)', () => {
    const problem = { type: 'factor_quadratic', a: 1, bSign: '+', b: 7, cSign: '+', c: 10 };
    const result = solveProblem(problem);
    expect(result.success).toBe(true);
    const parsed = parseFactoredForm(result.answer);
    expect(parsed).not.toBeNull();
    const [p, q] = parsed.binomials.map(b => b.constant);
    expect(p + q).toBe(7);
    expect(p * q).toBe(10);
  });

  test('factors x²+9x+20 → (x+4)(x+5)', () => {
    const problem = { type: 'factor_quadratic', a: 1, bSign: '+', b: 9, cSign: '+', c: 20 };
    const result = solveProblem(problem);
    expect(result.success).toBe(true);
    const parsed = parseFactoredForm(result.answer);
    expect(parsed).not.toBeNull();
    const [p, q] = parsed.binomials.map(b => b.constant);
    expect(p + q).toBe(9);
    expect(p * q).toBe(20);
  });

  test('factors x²+6x-16 → (x-2)(x+8)', () => {
    const problem = { type: 'factor_quadratic', a: 1, bSign: '+', b: 6, cSign: '-', c: 16 };
    const result = solveProblem(problem);
    expect(result.success).toBe(true);
    const parsed = parseFactoredForm(result.answer);
    expect(parsed).not.toBeNull();
    const [p, q] = parsed.binomials.map(b => b.constant);
    expect(p + q).toBe(6);
    expect(p * q).toBe(-16);
  });

  test('factors x²-5x-14 → (x+2)(x-7)', () => {
    const problem = { type: 'factor_quadratic', a: 1, bSign: '-', b: 5, cSign: '-', c: 14 };
    const result = solveProblem(problem);
    expect(result.success).toBe(true);
    const parsed = parseFactoredForm(result.answer);
    expect(parsed).not.toBeNull();
    const [p, q] = parsed.binomials.map(b => b.constant);
    expect(p + q).toBe(-5);
    expect(p * q).toBe(-14);
  });
});

// ── parseFactoredForm ──

describe('parseFactoredForm', () => {
  test('parses (x+2)(x+3)', () => {
    const result = parseFactoredForm('(x+2)(x+3)');
    expect(result).not.toBeNull();
    expect(result.binomials).toHaveLength(2);
    expect(result.binomials[0]).toEqual({ coeff: 1, constant: 2 });
    expect(result.binomials[1]).toEqual({ coeff: 1, constant: 3 });
  });

  test('parses (x+5)(x+2)', () => {
    const result = parseFactoredForm('(x+5)(x+2)');
    expect(result).not.toBeNull();
    expect(result.binomials).toHaveLength(2);
    expect(result.binomials[0]).toEqual({ coeff: 1, constant: 5 });
    expect(result.binomials[1]).toEqual({ coeff: 1, constant: 2 });
  });

  test('parses (x+8)(x-2)', () => {
    const result = parseFactoredForm('(x+8)(x-2)');
    expect(result).not.toBeNull();
    expect(result.binomials[0]).toEqual({ coeff: 1, constant: 8 });
    expect(result.binomials[1]).toEqual({ coeff: 1, constant: -2 });
  });

  test('parses (x-7)(x+2)', () => {
    const result = parseFactoredForm('(x-7)(x+2)');
    expect(result).not.toBeNull();
    expect(result.binomials[0]).toEqual({ coeff: 1, constant: -7 });
    expect(result.binomials[1]).toEqual({ coeff: 1, constant: 2 });
  });

  test('parses with spaces: ( x + 2 )( x + 3 )', () => {
    const result = parseFactoredForm('( x + 2 )( x + 3 )');
    expect(result).not.toBeNull();
    expect(result.binomials).toHaveLength(2);
  });

  test('parses (2x+1)(x-3)', () => {
    const result = parseFactoredForm('(2x+1)(x-3)');
    expect(result).not.toBeNull();
    expect(result.binomials[0]).toEqual({ coeff: 2, constant: 1 });
    expect(result.binomials[1]).toEqual({ coeff: 1, constant: -3 });
  });

  test('returns null for non-factored expressions', () => {
    expect(parseFactoredForm('x+2')).toBeNull();
    expect(parseFactoredForm('42')).toBeNull();
    expect(parseFactoredForm('hello')).toBeNull();
  });
});

// ── areFactoredFormsEquivalent ──

describe('areFactoredFormsEquivalent', () => {
  test('(x+2)(x+3) ≡ (x+3)(x+2) — commutative property', () => {
    const a = parseFactoredForm('(x+2)(x+3)');
    const b = parseFactoredForm('(x+3)(x+2)');
    expect(areFactoredFormsEquivalent(a, b)).toBe(true);
  });

  test('(x+5)(x+2) ≡ (x+2)(x+5) — the bug from the transcript', () => {
    const a = parseFactoredForm('(x+5)(x+2)');
    const b = parseFactoredForm('(x+2)(x+5)');
    expect(areFactoredFormsEquivalent(a, b)).toBe(true);
  });

  test('(x+8)(x-2) ≡ (x-2)(x+8)', () => {
    const a = parseFactoredForm('(x+8)(x-2)');
    const b = parseFactoredForm('(x-2)(x+8)');
    expect(areFactoredFormsEquivalent(a, b)).toBe(true);
  });

  test('(x+2)(x-7) ≡ (x-7)(x+2)', () => {
    const a = parseFactoredForm('(x+2)(x-7)');
    const b = parseFactoredForm('(x-7)(x+2)');
    expect(areFactoredFormsEquivalent(a, b)).toBe(true);
  });

  test('(x+2)(x+3) ≢ (x+2)(x+4) — different expressions', () => {
    const a = parseFactoredForm('(x+2)(x+3)');
    const b = parseFactoredForm('(x+2)(x+4)');
    expect(areFactoredFormsEquivalent(a, b)).toBe(false);
  });

  test('(x+1)(x+6) ≢ (x+2)(x+3) — same sum but different product', () => {
    // Both have constants summing to 7, but 1*6=6 vs 2*3=6... actually these
    // both produce x²+7x+6, so they ARE equivalent!
    // Wait: (x+1)(x+6) = x²+7x+6, (x+2)(x+3) = x²+5x+6. Different.
    const a = parseFactoredForm('(x+1)(x+6)');
    const b = parseFactoredForm('(x+2)(x+3)');
    expect(areFactoredFormsEquivalent(a, b)).toBe(false);
  });
});

// ── verifyAnswer with factored forms ──

describe('verifyAnswer — factored form equivalence', () => {
  test('(x+5)(x+2) matches (x+2)(x+5)', () => {
    const result = verifyAnswer('(x+5)(x+2)', '(x+2)(x+5)');
    expect(result.isCorrect).toBe(true);
  });

  test('(x+2)(x+3) matches (x+3)(x+2)', () => {
    const result = verifyAnswer('(x+2)(x+3)', '(x+3)(x+2)');
    expect(result.isCorrect).toBe(true);
  });

  test('(x+8)(x-2) matches (x-2)(x+8)', () => {
    const result = verifyAnswer('(x+8)(x-2)', '(x-2)(x+8)');
    expect(result.isCorrect).toBe(true);
  });

  test('(x+2)(x-7) matches (x-7)(x+2)', () => {
    const result = verifyAnswer('(x+2)(x-7)', '(x-7)(x+2)');
    expect(result.isCorrect).toBe(true);
  });

  test('(x+2)(x+3) does NOT match (x+1)(x+4)', () => {
    const result = verifyAnswer('(x+2)(x+3)', '(x+1)(x+4)');
    expect(result.isCorrect).toBe(false);
  });

  test('exact match (x+2)(x+3) matches (x+2)(x+3)', () => {
    const result = verifyAnswer('(x+2)(x+3)', '(x+2)(x+3)');
    expect(result.isCorrect).toBe(true);
  });
});

// ── End-to-end: processMathMessage for factoring ──

describe('processMathMessage — factoring end-to-end', () => {
  test('detects and solves "factor x²+5x+6"', () => {
    const result = processMathMessage('factor x²+5x+6');
    expect(result.hasMath).toBe(true);
    expect(result.problem.type).toBe('factor_quadratic');
    expect(result.solution.success).toBe(true);
    // The answer should be verifiable against student responses
    expect(verifyAnswer('(x+2)(x+3)', result.solution.answer).isCorrect).toBe(true);
    expect(verifyAnswer('(x+3)(x+2)', result.solution.answer).isCorrect).toBe(true);
  });

  test('detects and solves "factor x²-5x-14"', () => {
    const result = processMathMessage('factor x²-5x-14');
    expect(result.hasMath).toBe(true);
    expect(result.solution.success).toBe(true);
    expect(verifyAnswer('(x+2)(x-7)', result.solution.answer).isCorrect).toBe(true);
    expect(verifyAnswer('(x-7)(x+2)', result.solution.answer).isCorrect).toBe(true);
  });
});
