/**
 * Regression tests for expressions written at the END OF A SENTENCE, and for
 * the LaTeX spellings of ×, ÷ and ·.
 *
 * THE BUG (from a real session): the tutor posed "24 − 6 ÷ 2 + 3." in chat, but
 * the workspace's PROBLEM card read "24 − 6 ÷ 2." The board does not receive the
 * tutor's own text — boardSynthesizer.detectPosedProblem re-derives the problem
 * from the prose via parseCleanProblem → isolateNumericExpression, whose
 * trailing guard `(?![\w.^])` was meant to keep a decimal point inside its
 * number but also rejected a sentence-ending period. The match backtracked off
 * the last term and returned the truncated "24 - 6 / 2".
 *
 * The visible card was the least of it: the same parse produced
 * correctAnswer = 21, which is pinned and graded against. A student answering
 * the correct 24 would have been marked wrong — the same failure mode as the
 * "16/4 ⋅ 2" regression next door.
 *
 * A parallel defect: the engine normalizes the Unicode glyphs (÷ × ⋅) but never
 * the LaTeX commands, so "3 \times 4 + 2" parsed as "4 + 2" = 6. Wrong answers,
 * not parse failures.
 *
 * THE FIX:
 *   - Only treat "." as part of a number when a digit follows it.
 *   - Strip a sentence-final period before the pure-numeric chain parse, so it
 *     cannot ride along inside `expression` and onto the board card.
 *   - Normalize \div, \times, \cdot and \ast alongside their Unicode glyphs.
 */
const { parseCleanProblem, detectMathProblem } = require('../../utils/mathSolver');

describe('expressions at the end of a sentence — the "24 − 6 ÷ 2 + 3." regression', () => {
  // Every phrasing here truncated to "24 - 6 / 2" (answer 21) before the fix.
  const phrasings = [
    'Try this: 24 − 6 ÷ 2 + 3.',
    'Solve 24 − 6 ÷ 2 + 3.',
    'Here is one: 24 − 6 ÷ 2 + 3.',
    'Next up: 24 − 6 ÷ 2 + 3. Ready?',
    'Let us try 24 − 6 ÷ 2 + 3. Remember PEMDAS.',
  ];

  it.each(phrasings)('keeps the whole expression in %j', (text) => {
    const r = parseCleanProblem(text);
    expect(r.problem.expression.replace(/\s/g, '')).toBe('24-6/2+3');
    expect(Number(r.solution.answer)).toBe(24);
  });

  it('a question mark never regressed, and still works', () => {
    const r = parseCleanProblem('What is 24 − 6 ÷ 2 + 3?');
    expect(Number(r.solution.answer)).toBe(24);
  });

  it('does not carry the sentence period into the expression (it reaches the board verbatim)', () => {
    const r = parseCleanProblem('24 − 6 ÷ 2 + 3.');
    expect(r.problem.expression).not.toMatch(/\.$/);
    expect(Number(r.solution.answer)).toBe(24);
  });

  it('still keeps decimal points inside their numbers', () => {
    const r = parseCleanProblem('Compute 3.5 + 1.5 today.');
    expect(Number(r.solution.answer)).toBe(5);
  });

  it('drops only the final term-eating period, not a trailing exponent term', () => {
    const r = parseCleanProblem('Evaluate 2^3 + 1.');
    expect(Number(r.solution.answer)).toBe(9);
  });
});

describe('LaTeX operator spellings grade like their Unicode glyphs', () => {
  const cases = [
    ['24 - 6 \\div 2 + 3', 24],
    ['3 \\times 4 + 2', 14],
    ['6 \\cdot 2 - 1', 11],
  ];

  it.each(cases)('%s = %i', (text, expected) => {
    const r = parseCleanProblem(text);
    expect(Number(r.solution.answer)).toBe(expected);
  });

  it('agrees with the Unicode form it mirrors', () => {
    expect(parseCleanProblem('3 \\times 4 + 2').solution.answer)
      .toBe(parseCleanProblem('3 × 4 + 2').solution.answer);
  });

  it('leaves a word merely starting with an operator name alone', () => {
    // \divide must not normalize as \div + "ide"
    expect(detectMathProblem('\\divide')).toBeNull();
  });
});
