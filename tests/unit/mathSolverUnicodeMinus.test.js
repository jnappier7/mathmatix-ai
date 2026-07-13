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
const { processMathMessage, verifyAnswer, parseCleanProblem } = require('../../utils/mathSolver');

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

// SECOND-ORDER REGRESSION (same real session): the earlier fix corrected the BARE
// form "−34+6", but a leading-negative arithmetic step EMBEDDED in tutor prose — or
// followed by "=?" — still fell through to the last-resort embedded-arithmetic matcher,
// whose left-operand capture dropped the sign. So the tutor posed "compute −34+6 on the
// right side?", the pipeline computed the expected answer as 40, and graded the student's
// correct "−28" INCORRECT — the exact trust-killing loop, one layer deeper. The fix lets
// the last-resort matcher capture a leading unary minus (guarded so "5−34" is unchanged).
describe('leading-negative arithmetic keeps its sign in prose / with "=?"', () => {
  it('evaluates "−34+6=?" to -28 (not 40)', () => {
    expect(String(processMathMessage(`${MINUS}34+6=?`).solution.answer)).toBe('-28');
    expect(String(processMathMessage('-34+6=?').solution.answer)).toBe('-28');
  });

  it('evaluates a leading negative embedded in prose to -28', () => {
    const r = parseCleanProblem(
      `So what do you get when you compute ${MINUS}34+6 on the right side?`
    );
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('-28');
  });

  it('the pipeline verdict now confirms the student\'s "−28" is correct', () => {
    const posed = parseCleanProblem(`compute ${MINUS}34+6 on the right side?`);
    expect(verifyAnswer(`${MINUS}28`, posed.solution.answer).isCorrect).toBe(true);
  });

  it('does NOT turn a binary minus into a leading sign ("5-34" stays 5 − 34 = -29)', () => {
    // The leading-sign capture must only fire on a genuine unary minus, never on a
    // subtraction that follows a value — otherwise "5-34" would misread as left=-34.
    expect(String(processMathMessage('result is 5-34 here').solution.answer)).toBe('-29');
    expect(String(processMathMessage('20-8=?').solution.answer)).toBe('12');
  });

  it('leaves "x^2 + 8" as a non-arithmetic expression (no false "2 + 8")', () => {
    const r = processMathMessage('x^2 + 8 here');
    expect(r.problem && r.problem.type).not.toBe('arithmetic');
  });
});

// ROOT-CAUSE FIX (finishing the migration): the two sign bugs above were both patches
// on a matcher that re-parsed prose-embedded arithmetic into {left, operator, right} and
// rebuilt a string — a lossy round-trip that kept dropping signs and could only ever see
// ONE operator pair. The real fix isolates the arithmetic substring and hands it WHOLE to
// the exact-rational engine (as rationalEvaluator.js's header always intended). That kills
// the whole class: any sign, any number of operators, correct precedence — or, when the
// slice isn't clean arithmetic, NO answer at all rather than a confident wrong one.
describe('prose-embedded arithmetic goes through the exact evaluator (no operand re-parse)', () => {
  it('handles multi-operand chains the old single-pair matcher could not', () => {
    // Old path saw only "-34+6" and stopped; exact engine evaluates the whole chain.
    expect(String(parseCleanProblem('compute -34+6-2 on the right side').solution.answer)).toBe('-30');
  });

  it('respects operator precedence in prose ("2+3*4" = 14, not 20)', () => {
    expect(String(parseCleanProblem('so what is 2+3*4 here').solution.answer)).toBe('14');
  });

  it('keeps the sign on a negative RIGHT operand ("6+-34" = -28)', () => {
    expect(String(parseCleanProblem('the answer to 6+-34 please').solution.answer)).toBe('-28');
  });

  it('now grades a bare "what is -34 + 6" phrasing (previously undetected)', () => {
    expect(String(parseCleanProblem('what is -34 + 6').solution.answer)).toBe('-28');
  });

  it('SAFETY: an ambiguous slice defers (never a confidently-wrong answer)', () => {
    // "8x" is a coefficient, "x^2 + 8" an algebraic term — the guards keep the exact
    // engine from ever inventing "8", so these produce no arithmetic verdict at all.
    expect(parseCleanProblem('the term 8x sits here').hasMath).toBe(false);
    const r = parseCleanProblem('x^2 + 8 over here');
    expect(r.hasMath && r.problem.type === 'arithmetic').toBeFalsy();
  });

  it('leaves bare two-operand arithmetic as the arithmetic type (unchanged)', () => {
    expect(processMathMessage('15 + 27').problem.type).toBe('arithmetic');
    expect(String(processMathMessage('15 + 27').solution.answer)).toBe('42');
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
