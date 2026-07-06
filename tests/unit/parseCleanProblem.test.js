/**
 * parseCleanProblem — prose-aware wrapper around processMathMessage.
 *
 * The bug this guards against: a tutor turn like
 *   "Here's another equation for you to solve: Solve 4x+3=27."
 * runs through processMathMessage and returns the 'evaluation'
 * catch-all with answer "331". Persist stores that as the
 * correctAnswer, and the next student answer ("x=6") gets diagnosed
 * as INCORRECT against the bogus 331 — which fires an
 * ANSWER_PRE_CHECK INCORRECT directive, and the tutor hedges on a
 * right answer.
 *
 * parseCleanProblem rejects the evaluation catch-all on prose-laden
 * input and tries to extract a clean math substring before giving up.
 */

const { parseCleanProblem, processMathMessage } = require('../../utils/mathSolver');

describe('parseCleanProblem — clean inputs (delegates to processMathMessage)', () => {
  test('"Solve 4x+3=27" → general_linear, answer 6', () => {
    const r = parseCleanProblem('Solve 4x+3=27');
    expect(r.hasMath).toBe(true);
    expect(r.problem.type).toBe('general_linear');
    expect(String(r.solution.answer)).toBe('6');
  });

  test('"3x - 5 = 16" → general_linear, answer 7', () => {
    const r = parseCleanProblem('3x - 5 = 16');
    expect(r.hasMath).toBe(true);
    expect(r.problem.type).toBe('general_linear');
    expect(String(r.solution.answer)).toBe('7');
  });

  test('"5 * 7" → arithmetic, answer 35', () => {
    const r = parseCleanProblem('5 * 7');
    expect(r.hasMath).toBe(true);
    expect(r.problem.type).toBe('arithmetic');
    expect(String(r.solution.answer)).toBe('35');
  });
});

describe('parseCleanProblem — prose-wrapped tutor poses (the Bug B regression)', () => {
  test('"Here\'s another equation for you to solve: Solve 4x+3=27." extracts answer 6', () => {
    const r = parseCleanProblem("Here's another equation for you to solve: Solve 4x+3=27.");
    expect(r.hasMath).toBe(true);
    expect(r.problem.type).toBe('general_linear');
    expect(String(r.solution.answer)).toBe('6');
  });

  test('full tutor sentence with multiple clauses extracts the right answer', () => {
    const r = parseCleanProblem(
      "Awesome! Let's keep the momentum going. Here's another equation for you to solve: Solve 4x+3=27. What's the first step you want to take?"
    );
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('6');
  });

  test('"Try this one: 3x - 5 = 16" extracts answer 7', () => {
    const r = parseCleanProblem('Try this one: 3x - 5 = 16');
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('7');
  });

  test('raw processMathMessage no longer fabricates a bogus answer from prose (exact engine refuses)', () => {
    // HISTORY: the old Function()-based evaluation catch-all stripped the letters
    // out of "Here's another equation for you to solve: Solve 4x+3=27." and
    // evaluated the leftover digits to a bogus "331", which then poisoned grading.
    // The exact-rational engine refuses to evaluate a prose-laden string (it can't
    // tokenize letters), so no fake answer is produced. parseCleanProblem is still
    // the right front door — this just confirms the raw path is no longer a hazard.
    const r = processMathMessage(
      "Here's another equation for you to solve: Solve 4x+3=27."
    );
    const fabricated = r.hasMath && r.solution && r.solution.success && r.solution.answer === '331';
    expect(fabricated).toBe(false);
  });
});

describe('parseCleanProblem — pure prose returns no math', () => {
  test('"Let\'s tackle it. What\'s a good first move?" → no math', () => {
    const r = parseCleanProblem("Let's tackle it. What's a good first move?");
    expect(r.hasMath).toBe(false);
  });

  test('"Great job! Now what?" → no math', () => {
    const r = parseCleanProblem('Great job! Now what?');
    expect(r.hasMath).toBe(false);
  });

  test('"Hmm, let\'s double-check that last step." → no math', () => {
    const r = parseCleanProblem("Hmm, let's double-check that last step.");
    expect(r.hasMath).toBe(false);
  });
});

describe('parseCleanProblem — edge cases', () => {
  test('empty string returns no math', () => {
    expect(parseCleanProblem('').hasMath).toBe(false);
  });

  test('null/undefined returns no math', () => {
    expect(parseCleanProblem(null).hasMath).toBe(false);
    expect(parseCleanProblem(undefined).hasMath).toBe(false);
  });

  test('non-string returns no math', () => {
    expect(parseCleanProblem(42).hasMath).toBe(false);
    expect(parseCleanProblem({}).hasMath).toBe(false);
  });
});
