/**
 * Fractional-coefficient linear equations — "x/5 + 6 = 10".
 *
 * PRODUCTION BUG: parseSingleTerm had patterns for "2x" and for constants, but
 * none for a variable over a number. So parseLinearExpression returned null for
 * the whole expression, solveGeneralLinear never ran, and a fallback path
 * produced a WRONG answer rather than none:
 *
 *     x/5 + 6 = 10  ->  11   (correct: 20)
 *     x/2 + 3 = 7   ->   5   (correct: 8)
 *
 * A student photographed exactly this homework. Silently mis-solving one of the
 * most common Algebra 1 forms is worse than declining to solve it: the wrong
 * value became the grading target, so both the student's wrong answer and the
 * genuinely correct answer were graded against 11.
 */

const { parseCleanProblem, parseLinearExpression } = require('../../utils/mathSolver');

const solve = (tex) => {
  const r = parseCleanProblem(tex);
  return r && r.solution && r.solution.success ? String(r.solution.answer) : null;
};

describe('x over a number is a real coefficient', () => {
  test('parses x/5 as coefficient 1/5', () => {
    expect(parseLinearExpression('x/5 + 6')).toEqual({ xCoeff: 0.2, constant: 6 });
  });

  test('parses a numerator: 3x/4', () => {
    expect(parseLinearExpression('3x/4')).toEqual({ xCoeff: 0.75, constant: 0 });
  });

  test('parses a negative: -x/2', () => {
    expect(parseLinearExpression('-x/2 + 1')).toEqual({ xCoeff: -0.5, constant: 1 });
  });
});

describe('the equations that were mis-solved', () => {
  test('the student homework: x/5 + 6 = 10 is 20, not 11', () => {
    expect(solve('x/5 + 6 = 10')).toBe('20');
  });

  test('x/2 + 3 = 7 is 8, not 5', () => {
    expect(solve('x/2 + 3 = 7')).toBe('8');
  });

  test('handles subtraction and a bare fractional term', () => {
    expect(solve('x/5 - 2 = 1')).toBe('15');
    expect(solve('x/3 = 4')).toBe('12');
  });

  test('handles a numerator and a negative coefficient', () => {
    expect(solve('3x/4 = 9')).toBe('12');
    expect(solve('-x/2 + 1 = 4')).toBe('-6');
  });
});

describe('nothing that already worked regressed', () => {
  test('integer coefficients still solve', () => {
    expect(solve('2x+6=10')).toBe('2');
    expect(solve('3x - 5 = 16')).toBe('7');
  });

  test('a zero denominator declines rather than guessing', () => {
    // Infinity/NaN answers are worse than no answer — they become grading targets.
    expect(parseLinearExpression('x/0 + 1')).toBeNull();
  });
});
