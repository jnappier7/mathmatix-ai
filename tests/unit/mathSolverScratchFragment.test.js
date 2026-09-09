/**
 * parseCleanProblem — a line of the writer's WORKING is not the problem.
 *
 * Production, 2026-09-09. Student: "im so bad at this. solve 3x - 7 = 11.
 * i did 3x = 11 - 7 = 4 so x = 4/3". The whole-message catch-all grabbed
 * "11 - 7" (pure arithmetic, so the prose-embedded-arithmetic trust rule let
 * it through) before the verb-anchored candidate "3x - 7 = 11" was ever
 * tried. That fragment became the board's PROBLEM card and the grader's pin;
 * the next turn "11 - 7 = 4 … so x = 4/3 right?" was graded CORRECT against
 * it (the sign error certified, XP awarded, card sealed ✓ Solved).
 *
 * The rule is narrow on purpose: a pure-numeric expression is a fragment when
 * the text states it as one SIDE of an equation — preceded by "=" (always a
 * step), or followed by "=" while algebra is in play in the same text. A
 * self-contained arithmetic statement ("4(6) + 3 = 27") and a tutor's
 * prose-embedded ask ("what's -34 + 6?") are untouched.
 */

const {
  parseCleanProblem,
  isEquationSideFragment,
  hasVariableEquation,
} = require('../../utils/mathSolver');

const STUDENT_TURN_1 = 'im so bad at this. solve 3x - 7 = 11. i did 3x = 11 - 7 = 4 so x = \\(\\frac{4}{3}\\)';
const STUDENT_TURN_2 = '11 - 7 = 4. thats what i said. so x = \\(\\frac{4}{3}\\) right?';
const TUTOR_TURN_2 = "You're right that 11 - 7 = 4. So you have 3x = 4. Now, how do you isolate x from 3x = 4? What would be your next step?";

describe('hasVariableEquation', () => {
  test('an equation with a variable, coefficient glued or not', () => {
    expect(hasVariableEquation('3x - 7 = 11')).toBe(true);
    expect(hasVariableEquation('x^2 = 16')).toBe(true);
    expect(hasVariableEquation('2x + y = 5, x - y = 1')).toBe(true);
  });

  test('a stated solution counts — "so x = 4/3" is algebra in play', () => {
    expect(hasVariableEquation('so x = 4/3 right?')).toBe(true);
    expect(hasVariableEquation('so x = \\(\\frac{4}{3}\\) right?')).toBe(true);
  });

  test('pure arithmetic and prose do not', () => {
    expect(hasVariableEquation('4(6) + 3 = 27')).toBe(false);
    expect(hasVariableEquation("what's -34 + 6?")).toBe(false);
    expect(hasVariableEquation('solve 12 + 8')).toBe(false);
    expect(hasVariableEquation('')).toBe(false);
    expect(hasVariableEquation(null)).toBe(false);
  });
});

describe('isEquationSideFragment', () => {
  test('the right-hand side of a step is a fragment ("3x = 11 - 7 = 4")', () => {
    expect(isEquationSideFragment('11 - 7', STUDENT_TURN_1)).toBe(true);
  });

  test('a stated arithmetic fact is a fragment when algebra is in play', () => {
    expect(isEquationSideFragment('11 - 7', STUDENT_TURN_2)).toBe(true);
    expect(isEquationSideFragment('11 - 7', TUTOR_TURN_2)).toBe(true);
  });

  test('LaTeX delimiters around the fragment do not hide it', () => {
    expect(isEquationSideFragment('11 - 7', 'You moved to \\(3x = 11 - 7\\), nice.')).toBe(true);
  });

  test('a self-contained arithmetic statement is NOT a fragment', () => {
    // A substitution check / stated fact with no algebra around it still
    // poses + verifies on the board and still grades.
    expect(isEquationSideFragment('4(6) + 3', '4(6) + 3 = 27')).toBe(false);
    expect(isEquationSideFragment('24 + 3', '24 + 3 = 27')).toBe(false);
  });

  test('arithmetic the text asks for is NOT a fragment', () => {
    expect(isEquationSideFragment('-34 + 6', "what's -34 + 6?")).toBe(false);
    expect(isEquationSideFragment('12 + 8', 'solve 12 + 8')).toBe(false);
  });

  test('only bare arithmetic qualifies — a variable or a lone number never does', () => {
    expect(isEquationSideFragment('3x - 7', STUDENT_TURN_1)).toBe(false);
    expect(isEquationSideFragment('4', STUDENT_TURN_1)).toBe(false);
    expect(isEquationSideFragment('', STUDENT_TURN_1)).toBe(false);
    expect(isEquationSideFragment('11 - 7', '')).toBe(false);
  });

  test('an expression that is not in the text at all is not a fragment', () => {
    expect(isEquationSideFragment('5 + 5', STUDENT_TURN_1)).toBe(false);
  });
});

describe('parseCleanProblem — the stated problem outranks a line of working', () => {
  test('THE BUG: "solve 3x - 7 = 11. i did 3x = 11 - 7 = 4 …" → the equation, answer 6', () => {
    const r = parseCleanProblem(STUDENT_TURN_1);
    expect(r.hasMath).toBe(true);
    expect(r.problem.type).toBe('general_linear');
    expect(String(r.solution.answer)).toBe('6');
  });

  test('"11 - 7 = 4 … so x = 4/3 right?" is working, not a problem', () => {
    const r = parseCleanProblem(STUDENT_TURN_2);
    expect(r.hasMath).toBe(false);
  });

  test('a tutor writing the student\'s arithmetic down never becomes the grading target', () => {
    // Before: evaluation "11 - 7" → 4, and the pin followed it.
    const r = parseCleanProblem(TUTOR_TURN_2);
    const answer = r.hasMath ? String(r.solution?.answer ?? '') : '';
    expect(answer).not.toBe('4');
    if (r.hasMath) expect(r.problem.expression).not.toBe('11 - 7');
  });

  test('prose-embedded arithmetic the tutor asks still grades deterministically', () => {
    const r = parseCleanProblem("what's -34 + 6?");
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('-28');
  });

  test('a bare arithmetic ask still parses ("solve 12 + 8")', () => {
    const r = parseCleanProblem('solve 12 + 8');
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('20');
  });

  test('a self-contained substitution check still parses ("4(6) + 3 = 27")', () => {
    const r = parseCleanProblem('4(6) + 3 = 27');
    expect(r.hasMath).toBe(true);
    expect(r.solution.success).toBe(true);
  });

  test('a lone intermediate line still parses as itself ("3x = 11 - 7")', () => {
    const r = parseCleanProblem('3x = 11 - 7');
    expect(r.hasMath).toBe(true);
    expect(r.problem.type).toBe('general_linear');
  });
});
