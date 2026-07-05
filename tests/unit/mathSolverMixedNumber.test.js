/**
 * Mixed-number arithmetic support.
 *
 * Origin: a student dropped "12⅔ - 4¼" and the engine couldn't grade it at all —
 * mixed numbers fell through every handler (and the chain detector actively
 * misread "12 2/3" by stripping the space to "122/3"). This adds a dedicated
 * detector + solver that converts mixed numbers to improper fractions, and lets
 * verifyAnswer accept any equivalent form (mixed, improper, or decimal).
 */
const { processMathMessage, verifyAnswer, detectMathProblem } = require('../../utils/mathSolver');

describe('mixed-number detection & solving', () => {
  const cases = [
    ['12⅔ - 4¼', '8 5/12'],       // 38/3 - 17/4 = 101/12
    ['12 2/3 - 4 1/4', '8 5/12'], // ASCII form
    ['1½ + 2¼', '3 3/4'],         // 3/2 + 9/4 = 15/4
    ['2 1/2 + 3', '5 1/2'],       // mixed + integer
    ['3 3/4 * 2', '7 1/2'],       // 15/4 * 2 = 30/4
    ['2 1/4 - 3 1/2', '-1 1/4'],  // negative result: 9/4 - 7/2 = -5/4
    ['4 1/2 / 1 1/2', '3'],       // 9/2 ÷ 3/2 = 3 (whole)
    ['1 1/2 + 1 1/2', '3'],       // sums to a whole number
  ];

  for (const [input, expected] of cases) {
    it(`solves "${input}" → ${expected}`, () => {
      const r = processMathMessage(input);
      expect(r.hasMath).toBe(true);
      expect(r.problem.type).toBe('mixed_number_arithmetic');
      expect(String(r.solution.answer)).toBe(expected);
    });
  }

  it('handles a "solve …" prose prefix', () => {
    const r = processMathMessage('solve 12⅔ - 4¼');
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('8 5/12');
  });
});

describe('mixed-number detection defers to existing handlers', () => {
  it('leaves proper-fraction arithmetic to fraction_arithmetic', () => {
    const r = processMathMessage('1/2 + 1/4');
    expect(r.problem.type).toBe('fraction_arithmetic');
    expect(String(r.solution.answer)).toBe('3/4');
  });

  it('leaves multi-operand integer/fraction chains to the evaluation path', () => {
    expect(String(processMathMessage('16/4 - 2').solution.answer)).toBe('2');
  });

  it('leaves plain two-operand arithmetic alone', () => {
    const r = processMathMessage('15 + 27');
    expect(r.problem.type).toBe('arithmetic');
    expect(String(r.solution.answer)).toBe('42');
  });

  it('does not treat a lone mixed number as mixed-number arithmetic (needs an operator)', () => {
    // No binary operator → not a computation, so the mixed-number detector defers.
    expect(detectMathProblem('12⅔')).toBeNull();
    const ascii = detectMathProblem('12 2/3');
    expect(ascii === null || ascii.type !== 'mixed_number_arithmetic').toBe(true);
  });
});

describe('verifyAnswer — mixed / improper / decimal all grade equal', () => {
  it('accepts the mixed, improper, and decimal forms of 8 5/12', () => {
    expect(verifyAnswer('8 5/12', '8 5/12').isCorrect).toBe(true);
    expect(verifyAnswer('101/12', '8 5/12').isCorrect).toBe(true);
    expect(verifyAnswer('8.4167', '8 5/12').isCorrect).toBe(true);
    expect(verifyAnswer('8 5/12', '101/12').isCorrect).toBe(true);
  });

  it('accepts a vulgar-fraction answer form', () => {
    expect(verifyAnswer('2⅔', '8/3').isCorrect).toBe(true); // 2 2/3 = 8/3
  });

  it('still rejects a wrong mixed number', () => {
    expect(verifyAnswer('8 4/12', '8 5/12').isCorrect).toBe(false);
    expect(verifyAnswer('7 5/12', '8 5/12').isCorrect).toBe(false);
  });
});
