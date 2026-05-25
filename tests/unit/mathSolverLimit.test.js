/**
 * MATH SOLVER — Limit detection & solving tests
 *
 * Covers:
 *  - Plain-text "limit of EXPR as x approaches VALUE"
 *  - LaTeX-wrapped: $\lim_{x \to N} \frac{NUM}{DEN}$  ← THE bug fix
 *  - Unicode variants: x², −, →
 *  - 0/0 indeterminate form (factor + cancel)
 *  - Direct substitution
 *  - DNE (non-zero / zero)
 *  - Answer extraction for persist.js canonicalization
 */

const {
  detectLimit,
  solveLimit,
  processMathMessage,
} = require('../../utils/mathSolver');

describe('detectLimit — plain text patterns', () => {
  test('"limit of (x^2-1)/(x-1) as x approaches 1"', () => {
    const r = detectLimit('limit of (x^2-1)/(x-1) as x approaches 1');
    expect(r).not.toBeNull();
    expect(r.type).toBe('limit');
    expect(r.approachValue).toBe(1);
  });

  test('"lim x→2 (x^2-4)/(x-2)"', () => {
    const r = detectLimit('lim x→2 (x^2-4)/(x-2)');
    expect(r).not.toBeNull();
    expect(r.approachValue).toBe(2);
  });

  test('"what is the limit of x^2 + 3x as x approaches 1"', () => {
    const r = detectLimit('what is the limit of x^2 + 3x as x approaches 1');
    expect(r).not.toBeNull();
    expect(r.approachValue).toBe(1);
    expect(r.denominator).toBeNull();
  });
});

describe('detectLimit — Unicode normalization', () => {
  test('Unicode superscript and minus: "(x²−1)/(x−1) as x→1"', () => {
    const r = detectLimit('limit of (x²−1)/(x−1) as x→1');
    expect(r).not.toBeNull();
    expect(r.approachValue).toBe(1);
    expect(r.numerator).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ coeff: 1, exp: 2 }),
        expect.objectContaining({ coeff: -1, exp: 0 }),
      ])
    );
  });
});

describe('detectLimit — LaTeX \\frac normalization (the warmup-repeat bug fix)', () => {
  test('$\\lim_{x \\to 1} \\frac{x^2-1}{x-1}$', () => {
    const r = detectLimit('$\\lim_{x \\to 1} \\frac{x^2-1}{x-1}$');
    expect(r).not.toBeNull();
    expect(r.type).toBe('limit');
    expect(r.approachValue).toBe(1);
  });

  test('\\(\\lim_{x \\to 2} \\frac{x^2-4}{x-2}\\)', () => {
    const r = detectLimit('\\(\\lim_{x \\to 2} \\frac{x^2-4}{x-2}\\)');
    expect(r).not.toBeNull();
    expect(r.approachValue).toBe(2);
  });

  test('\\displaystyle gets stripped', () => {
    const r = detectLimit('$\\displaystyle\\lim_{x \\to 1} \\frac{x^2-1}{x-1}$');
    expect(r).not.toBeNull();
    expect(r.approachValue).toBe(1);
  });

  test('\\left( \\right) modifiers get stripped', () => {
    const r = detectLimit('limit of \\left(\\frac{x^2-1}{x-1}\\right) as x approaches 1');
    expect(r).not.toBeNull();
    expect(r.approachValue).toBe(1);
  });

  test('embedded in a tutor sentence', () => {
    const r = detectLimit(
      "Hey Jason! Let's warm up with this one: $\\lim_{x \\to 1} \\frac{x^2-1}{x-1}$. What do you think?"
    );
    expect(r).not.toBeNull();
    expect(r.approachValue).toBe(1);
  });
});

describe('solveLimit — 0/0 indeterminate form', () => {
  test('canonical warm-up: (x^2-1)/(x-1) at x=1 → 2', () => {
    const detected = detectLimit('limit of (x^2-1)/(x-1) as x approaches 1');
    const solution = solveLimit(detected);
    expect(solution.success).toBe(true);
    expect(solution.answer).toBe('2');
  });

  test('LaTeX form solves identically: $\\lim_{x \\to 1} \\frac{x^2-1}{x-1}$ → 2', () => {
    const detected = detectLimit('$\\lim_{x \\to 1} \\frac{x^2-1}{x-1}$');
    const solution = solveLimit(detected);
    expect(solution.success).toBe(true);
    expect(solution.answer).toBe('2');
  });

  test('(x^2-4)/(x-2) at x=2 → 4', () => {
    const detected = detectLimit('limit of (x^2-4)/(x-2) as x approaches 2');
    const solution = solveLimit(detected);
    expect(solution.success).toBe(true);
    expect(solution.answer).toBe('4');
  });
});

describe('solveLimit — direct substitution', () => {
  test('x^2 + 3x at x=2 → 10', () => {
    const detected = detectLimit('limit of x^2 + 3x as x approaches 2');
    const solution = solveLimit(detected);
    expect(solution.success).toBe(true);
    expect(solution.answer).toBe('10');
  });
});

describe('processMathMessage — full pipeline for limit', () => {
  test('LaTeX limit produces hasMath + solvable solution + raw expression', () => {
    const result = processMathMessage('$\\lim_{x \\to 1} \\frac{x^2-1}{x-1}$');
    expect(result.hasMath).toBe(true);
    expect(result.problem.type).toBe('limit');
    expect(result.problem.approachValue).toBe(1);
    expect(result.problem.raw).toBeTruthy();
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('2');
  });

  test('Maya wrapper text does not break detection', () => {
    const wrapper1 = "Hey Jason! Let's warm up: $\\lim_{x \\to 1} \\frac{x^2-1}{x-1}$. Take your time.";
    const wrapper2 = "Welcome back! Try this one: $\\lim_{x \\to 1} \\frac{x^2-1}{x-1}$ — what's your first move?";

    const r1 = processMathMessage(wrapper1);
    const r2 = processMathMessage(wrapper2);

    expect(r1.hasMath).toBe(true);
    expect(r2.hasMath).toBe(true);
    expect(r1.solution.answer).toBe('2');
    expect(r2.solution.answer).toBe('2');

    // Critical for dedup: raw expression + approachValue should match across wrappers
    expect(r1.problem.approachValue).toBe(r2.problem.approachValue);
    // raw may have minor whitespace differences but should represent the same fraction
    expect(r1.problem.raw.replace(/\s/g, '')).toBe(r2.problem.raw.replace(/\s/g, ''));
  });
});
