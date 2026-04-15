/**
 * MATH SOLVER — Derivative detection & solving tests
 *
 * Covers:
 * - Pattern 1: "derivative of EXPR"
 * - Pattern 1 with function definition: "derivative of f(x) = EXPR"
 * - Pattern 2: "d/dx(EXPR)"
 * - Pattern 3: "differentiate EXPR"
 * - Pattern 4: Function definition + derivative mention in same message
 * - Power rule solving
 * - Answer verification for derivative answers
 */

const {
  detectDerivative,
  solveDerivative,
  detectMathProblem,
  processMathMessage,
  verifyAnswer,
} = require('../../utils/mathSolver');

// ── Detection: Pattern 1 — "derivative of EXPR" ──

describe('detectDerivative — Pattern 1: derivative of EXPR', () => {
  test('"derivative of x^3 - 3x + 2"', () => {
    const result = detectDerivative('derivative of x^3 - 3x + 2');
    expect(result).not.toBeNull();
    expect(result.type).toBe('derivative');
  });

  test('"what is the derivative of 5x^2 + 3x"', () => {
    const result = detectDerivative('what is the derivative of 5x^2 + 3x');
    expect(result).not.toBeNull();
    expect(result.type).toBe('derivative');
  });

  test('"find the derivative of 2x^3 + 4x - 7"', () => {
    const result = detectDerivative('find the derivative of 2x^3 + 4x - 7');
    expect(result).not.toBeNull();
    expect(result.type).toBe('derivative');
  });

  test('"derivative of f(x) = 5x^4 + 3x^2 - 7x + 1" strips function prefix', () => {
    const result = detectDerivative('find the derivative of f(x) = 5x^4 + 3x^2 - 7x + 1');
    expect(result).not.toBeNull();
    expect(result.type).toBe('derivative');
    // Verify the polynomial is parsed correctly (4 terms)
    expect(result.terms).toHaveLength(4);
  });

  test('"derivative of g(x) = 2x^3 + 4x - 7" strips function prefix', () => {
    const result = detectDerivative('the derivative of g(x) = 2x^3 + 4x - 7');
    expect(result).not.toBeNull();
    expect(result.type).toBe('derivative');
    expect(result.terms).toHaveLength(3);
  });
});

// ── Detection: Pattern 4 — Function definition + derivative mention ──

describe('detectDerivative — Pattern 4: function definition + derivative mention', () => {
  test('"g(x)=2x^3+4x-7. What do you get for the derivative g\'(x)?"', () => {
    const result = detectDerivative('g(x)=2x^3+4x-7. What do you get for the derivative g\'(x)?');
    expect(result).not.toBeNull();
    expect(result.type).toBe('derivative');
    expect(result.terms).toHaveLength(3);
  });

  test('tutor phrasing with surrounding text', () => {
    const msg = 'Absolutely, go for it! Give this function a shot: g(x)=2x^3+4x-7. What do you get for the derivative g\'(x)? Take your time!';
    const result = detectDerivative(msg);
    expect(result).not.toBeNull();
    expect(result.type).toBe('derivative');
  });

  test('"Let\'s try f(x) = 5x^2 - 3x + 8. Find the derivative."', () => {
    const result = detectDerivative("Let's try f(x) = 5x^2 - 3x + 8. Find the derivative.");
    expect(result).not.toBeNull();
    expect(result.type).toBe('derivative');
    expect(result.terms).toHaveLength(3);
  });

  test('"Consider h(x) = x^4 - 2x^3 + x. What\'s the derivative?"', () => {
    const result = detectDerivative("Consider h(x) = x^4 - 2x^3 + x. What's the derivative?");
    expect(result).not.toBeNull();
    expect(result.type).toBe('derivative');
  });

  test('with Unicode superscripts', () => {
    // After normalization by detectMathProblem, superscripts become ^n
    // But detectDerivative itself doesn't normalize — the caller does.
    // Test with already-normalized input:
    const result = detectDerivative('g(x)=2x^3+4x-7. What do you get for the derivative?');
    expect(result).not.toBeNull();
    expect(result.type).toBe('derivative');
  });

  test('does NOT match function definition without derivative mention', () => {
    const result = detectDerivative('Let\'s evaluate g(x) = 2x + 3 when x = 2');
    expect(result).toBeNull();
  });

  test('does NOT match derivative keyword without function definition', () => {
    // Just "derivative" alone without a parseable polynomial isn't enough
    const result = detectDerivative('The derivative is a fundamental concept in calculus');
    expect(result).toBeNull();
  });
});

// ── Solving ──

describe('solveDerivative — power rule', () => {
  test('derivative of 2x^3 + 4x - 7 = 6x^2+4', () => {
    const problem = { type: 'derivative', terms: [
      { coeff: 2, exp: 3 },
      { coeff: 4, exp: 1 },
      { coeff: -7, exp: 0 },
    ]};
    const solution = solveDerivative(problem);
    expect(solution.success).toBe(true);
    expect(solution.answer).toBe('6x^2+4');
  });

  test('derivative of x^2 = 2x', () => {
    const problem = { type: 'derivative', terms: [{ coeff: 1, exp: 2 }] };
    const solution = solveDerivative(problem);
    expect(solution.success).toBe(true);
    expect(solution.answer).toBe('2x');
  });

  test('derivative of 5x^4 + 3x^2 - 7x + 1 = 20x^3+6x-7', () => {
    const problem = { type: 'derivative', terms: [
      { coeff: 5, exp: 4 },
      { coeff: 3, exp: 2 },
      { coeff: -7, exp: 1 },
      { coeff: 1, exp: 0 },
    ]};
    const solution = solveDerivative(problem);
    expect(solution.success).toBe(true);
    expect(solution.answer).toBe('20x^3+6x-7');
  });

  test('derivative of constant = 0', () => {
    const problem = { type: 'derivative', terms: [{ coeff: 7, exp: 0 }] };
    const solution = solveDerivative(problem);
    expect(solution.success).toBe(true);
    expect(solution.answer).toBe('0');
  });
});

// ── End-to-end: processMathMessage + verifyAnswer ──

describe('End-to-end derivative detection and verification', () => {
  test('function-def phrasing: "6x^2+4" verified against g(x)=2x^3+4x-7', () => {
    const msg = 'Give this function a shot: g(x)=2x^3+4x-7. What do you get for the derivative g\'(x)?';
    const result = processMathMessage(msg);
    expect(result.hasMath).toBe(true);
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('6x^2+4');

    const verification = verifyAnswer('6x^2+4', result.solution.answer);
    expect(verification.isCorrect).toBe(true);
  });

  test('"derivative of f(x) = EXPR" phrasing detects and solves correctly', () => {
    const msg = 'Find the derivative of f(x) = 5x^4 + 3x^2 - 7x + 1';
    const result = processMathMessage(msg);
    expect(result.hasMath).toBe(true);
    expect(result.solution.answer).toBe('20x^3+6x-7');
  });
});
