/**
 * Regression tests for the Unicode MINUS SIGN (−, U+2212) in the math engine.
 *
 * THE BUG (from a real session): a student correctly solved 3(x-2)=2x-34 down to
 * x - 6 = -34, then answered "-28" (x = -34 + 6 = -28). The tutor rejected it
 * repeatedly — even reproducing "-28" while insisting it was wrong. Root cause:
 * MathLive/LaTeX render subtraction and negatives with the Unicode MINUS SIGN
 * (−, U+2212), NOT the ASCII hyphen. mathSolver never normalized it, so:
 *   - processMathMessage("−34+6") dropped the leading minus and returned 40.
 *   - the equation "3x−6=2x−34" was not detected as an equation at all (noMath).
 *   - verifyAnswer("−28", "-28") stripped the U+2212 to a positive "28" and
 *     graded the correct negative answer INCORRECT.
 *
 * THE FIX: normalize U+2212 (and the fullwidth/small hyphen-minus U+FF0D, U+FE63)
 * to ASCII "-" in detection and in verifyAnswer/evalArithmeticString. En/em dashes
 * (– —) are deliberately NOT normalized — they are prose punctuation.
 */
const { processMathMessage, verifyAnswer } = require('../../utils/mathSolver');

const MINUS = '−'; // − MINUS SIGN

describe('Unicode minus (U+2212) — arithmetic and equations', () => {
  it('evaluates "−34+6" to -28 (not 40)', () => {
    const r = processMathMessage(`${MINUS}34+6`);
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('-28');
  });

  it('evaluates "−34 + 6" (spaced) to -28', () => {
    expect(String(processMathMessage(`${MINUS}34 + 6`).solution.answer)).toBe('-28');
  });

  it('detects and solves the equation "3x−6=2x−34" → x = -28', () => {
    const r = processMathMessage(`3x${MINUS}6=2x${MINUS}34`);
    expect(r.hasMath).toBe(true);
    expect(r.problem.type).toBe('general_linear');
    expect(String(r.solution.answer)).toBe('-28');
  });

  it('detects and solves "x−6=−34" → x = -28', () => {
    const r = processMathMessage(`x${MINUS}6=${MINUS}34`);
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('-28');
  });
});

describe('Unicode minus (U+2212) — verifyAnswer accepts the correct negative', () => {
  it('accepts a student "−28" against a correct "-28"', () => {
    expect(verifyAnswer(`${MINUS}28`, '-28').isCorrect).toBe(true);
  });

  it('accepts either side using U+2212', () => {
    expect(verifyAnswer('-28', `${MINUS}28`).isCorrect).toBe(true);
    expect(verifyAnswer(`${MINUS}28`, `${MINUS}28`).isCorrect).toBe(true);
  });

  it('still rejects a genuinely wrong sign or value', () => {
    expect(verifyAnswer('28', '-28').isCorrect).toBe(false);      // wrong sign
    expect(verifyAnswer(`${MINUS}40`, '-28').isCorrect).toBe(false); // wrong value
  });
});

describe('en/em dashes are prose — NOT normalized as minus', () => {
  it('leaves an em-dash in wrapper prose alone (limit detection still works)', () => {
    const r = processMathMessage(
      "Try this one: $\\lim_{x \\to 1} \\frac{x^2-1}{x-1}$ — what's your first move?"
    );
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('2');
  });
});
