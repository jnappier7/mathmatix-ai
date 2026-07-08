/**
 * Multi-root answer grading.
 *
 * Origin: a student factored x^2-5x+6=0 to (x-2)(x-3)=0 and answered "x=2 and x=3"
 * — correct — and the tutor doubted it. Two defects:
 *   1. "(x-2)(x-3)=0" was mis-detected as a linear equation, so it carried no roots
 *      and the multi-root grading path couldn't fire off the form the student wrote.
 *   2. verifyAnswer only exact-matched, so "x=2 and x=3" vs "x=2 or x=3" was false.
 */
const { processMathMessage, verifyAnswer } = require('../../utils/mathSolver');

describe('factored equation → roots', () => {
  it('detects "(x-2)(x-3)=0" as a factored equation with roots [2,3]', () => {
    const r = processMathMessage('(x-2)(x-3)=0');
    expect(r.hasMath).toBe(true);
    expect(r.problem.type).toBe('factored_equation');
    expect(r.solution.roots).toEqual([2, 3]);
    expect(r.solution.answer).toBe('x = 2 or x = 3');
  });

  it('handles a leading coefficient: "(2x+1)(x-3)=0" → [-0.5, 3]', () => {
    const r = processMathMessage('(2x+1)(x-3)=0');
    expect(r.solution.roots).toEqual([-0.5, 3]);
  });

  it('still solves the standard form "x^2-5x+6=0" to the same roots', () => {
    const r = processMathMessage('x^2-5x+6=0');
    expect(r.solution.roots.slice().sort()).toEqual([2, 3]);
  });
});

describe('verifyAnswer — root sets grade by membership', () => {
  const t = (a, b, e) => expect(verifyAnswer(a, b).isCorrect).toBe(e);

  it('accepts "and" vs "or" and any order', () => {
    t('x=2 and x=3', 'x=2 or x=3', true);
    t('x=2 and x=3', 'x = 3 or x = 2', true);
    t('2 and 3', 'x = 3 or x = 2', true);
  });

  it('accepts fraction roots regardless of order', () => {
    t('x = -7/3 or 1', 'x = 1 or x = -7/3', true);
  });

  it('rejects a wrong or incomplete set', () => {
    t('x=2 and x=5', 'x=2 or x=3', false); // wrong second root
    t('x=2', 'x=2 or x=3', false);          // only one of two roots
  });

  it('does not disturb single-value or fraction/decimal grading', () => {
    t('5', '5', true);
    t('3/4', '0.75', true);
    t('8', '9', false);
  });
});
