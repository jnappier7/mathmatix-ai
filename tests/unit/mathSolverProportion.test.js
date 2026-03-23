/**
 * MATH SOLVER — Proportion / cross-multiplication tests
 */

const { detectMathProblem, processMathMessage } = require('../../utils/mathSolver');

describe('detectMathProblem — proportions', () => {
  test('detects "x/4 = 3/8"', () => {
    const r = detectMathProblem('x/4 = 3/8');
    expect(r).not.toBeNull();
    expect(r.type).toBe('proportion');
  });

  test('detects "2/5 = x/15"', () => {
    const r = detectMathProblem('2/5 = x/15');
    expect(r).not.toBeNull();
    expect(r.type).toBe('proportion');
  });

  test('detects "solve 3/x = 9/12"', () => {
    const r = detectMathProblem('solve 3/x = 9/12');
    expect(r).not.toBeNull();
    expect(r.type).toBe('proportion');
  });

  test('detects "7/10 = 21/x"', () => {
    const r = detectMathProblem('7/10 = 21/x');
    expect(r).not.toBeNull();
    expect(r.type).toBe('proportion');
  });
});

describe('solveProportion', () => {
  test('x/4 = 3/8 → x = 1.5', () => {
    const r = processMathMessage('x/4 = 3/8');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('1.5');
  });

  test('2/5 = x/15 → x = 6', () => {
    const r = processMathMessage('2/5 = x/15');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('6');
  });

  test('3/x = 9/12 → x = 4', () => {
    const r = processMathMessage('3/x = 9/12');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('4');
  });

  test('7/10 = 21/x → x = 30', () => {
    const r = processMathMessage('7/10 = 21/x');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('30');
  });

  test('x/6 = 5/3 → x = 10', () => {
    const r = processMathMessage('x/6 = 5/3');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('10');
  });

  test('4/x = 8/6 → x = 3', () => {
    const r = processMathMessage('4/x = 8/6');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('3');
  });
});
