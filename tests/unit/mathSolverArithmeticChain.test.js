/**
 * Regression tests for multi-operand arithmetic chains and the multiplication-dot
 * normalization that feeds answer verification.
 *
 * THE BUG (from a real session): a student typed the problem "16/4 ⋅ 2" (the "⋅" is
 * U+22C5, how LaTeX \cdot renders). The math engine evaluated it to 4, not 8, because:
 *   1. The "⋅" multiplication dot was not recognized as an operator at all, and
 *   2. The last-resort embeddedArithmeticPattern captured only the FIRST operator
 *      pair ("16/4") of a multi-operand expression, silently dropping "⋅ 2".
 * That bogus "4" was pinned as the problem's correctAnswer. So when the student gave
 * the correct final answer "8", diagnose graded it INCORRECT against the pinned 4 and
 * the tutor rejected a right answer — exactly the failure we are guarding against here.
 *
 * THE FIX:
 *   - Normalize multiplication dots (⋅ · ∙ •) to "*" up front.
 *   - Detect a whole-expression multi-operand arithmetic chain and route it to
 *     solveEvaluation, which honors operator precedence and left-to-right associativity
 *     (16/4*2 = (16/4)*2 = 8, NOT 16/(4*2) = 2).
 *   - Harden verifyAnswer so an expression-form answer is compared by value, not by
 *     its stripped digits ("16/4 ⋅ 2" → 8, not parseFloat("1642")).
 */
const {
  detectMathProblem,
  processMathMessage,
  verifyAnswer,
} = require('../../utils/mathSolver');

describe('arithmetic chains — the "16/4 ⋅ 2 = 8" regression', () => {
  const cdot = '⋅';   // ⋅  LaTeX \cdot
  const middot = '·'; // ·

  it('evaluates "16/4 ⋅ 2" to 8 (cdot), not 4', () => {
    const r = processMathMessage(`16/4 ${cdot} 2`);
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('8');
  });

  it('evaluates "16/4 · 2" to 8 (middot)', () => {
    const r = processMathMessage(`16/4 ${middot} 2`);
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('8');
  });

  it('evaluates "16/4 * 2", "16/4 × 2", "16 ÷ 4 ⋅ 2" all to 8', () => {
    for (const expr of ['16/4 * 2', '16/4 × 2', `16 ÷ 4 ${cdot} 2`]) {
      expect(String(processMathMessage(expr).solution.answer)).toBe('8');
    }
  });

  it('honors precedence in mixed chains: "2+3*4" = 14, "100 - 10 - 5" = 85, "2^3 * 4" = 32', () => {
    expect(String(processMathMessage('2+3*4').solution.answer)).toBe('14');
    expect(String(processMathMessage('100 - 10 - 5').solution.answer)).toBe('85');
    expect(String(processMathMessage('2^3 * 4').solution.answer)).toBe('32');
  });

  it('recognizes a standalone "4 ⋅ 2" as multiplication = 8 (dot was previously unrecognized)', () => {
    const r = processMathMessage(`4 ${cdot} 2`);
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('8');
  });
});

describe('arithmetic chains — no collateral damage to existing detection', () => {
  it('still treats two-operand "16/4" as arithmetic = 4', () => {
    const r = processMathMessage('16/4');
    expect(r.problem.type).toBe('arithmetic');
    expect(String(r.solution.answer)).toBe('4');
  });

  it('still treats two-fraction "1/2 + 1/4" as fraction arithmetic = 3/4 (not a decimal chain)', () => {
    const r = processMathMessage('1/2 + 1/4');
    expect(r.problem.type).toBe('fraction_arithmetic');
    expect(String(r.solution.answer)).toBe('3/4');
  });

  it('still treats plain "15 + 27" as arithmetic = 42', () => {
    const r = processMathMessage('15 + 27');
    expect(r.problem.type).toBe('arithmetic');
    expect(String(r.solution.answer)).toBe('42');
  });

  it('a bare number "8" is not math on its own', () => {
    expect(processMathMessage('8').hasMath).toBe(false);
  });
});

describe('verifyAnswer — expression-form answers compared by value', () => {
  const cdot = '⋅';

  it('accepts an expression-form student answer equal to the numeric correct answer', () => {
    expect(verifyAnswer(`16/4 ${cdot} 2`, '8').isCorrect).toBe(true);
    expect(verifyAnswer('16/4*2', '8').isCorrect).toBe(true);
    expect(verifyAnswer(`4 ${cdot} 2`, '8').isCorrect).toBe(true);
  });

  it('accepts when the correct answer itself is stored as an expression', () => {
    expect(verifyAnswer('8', '16/4*2').isCorrect).toBe(true);
  });

  it('still rejects genuinely wrong answers (the half-finished "4")', () => {
    expect(verifyAnswer('4', '8').isCorrect).toBe(false);
    expect(verifyAnswer('2', '8').isCorrect).toBe(false);
  });

  it('does not disturb plain numbers, units, or fraction/decimal equivalence', () => {
    expect(verifyAnswer('8', '8').isCorrect).toBe(true);
    expect(verifyAnswer('1,000', '1000').isCorrect).toBe(true);
    expect(verifyAnswer('0.75', '3/4').isCorrect).toBe(true);
  });

  it('does not treat algebraic expressions as arithmetic (letters guard intact)', () => {
    expect(verifyAnswer('2x', '3x').isCorrect).toBe(false);
  });
});
