/**
 * Wrapped operands — the absolute-value warm-up incident, 2026-09-30.
 *
 * The tutor asked "What is the absolute value of \(3 - 10\)?". No pattern knew
 * the wrapper, so the "what is" catch-all isolated the bare operand 3 - 10 and
 * persist stamped problemInfo.correctAnswer = "-7". The student answered 7
 * (correct) and was told "I see where you're coming from, but…". The tutor then
 * walked them through 3 - 10 = -7, asked for |-7|, and rejected 7 AGAIN — three
 * turns of a right answer being called wrong. That is the trust killer this file
 * pins shut.
 *
 * Two layers:
 *   1. Absolute value of a numeric expression is now a first-class problem
 *      type, so the grouped forms grade deterministically — and correctly.
 *   2. Any other unary wrapper we don't model ("opposite of", "square root of",
 *      "reciprocal of", …) DEMOTES the arithmetic underneath it: no parse, no
 *      stamped answer, the LLM verifier grades with the wording in view. A
 *      missing verdict leaves the tutor asking; a wrong one leaves it accusing.
 */

const {
  parseCleanProblem,
  processMathMessage,
  isWrappedOperand,
  detectAbsoluteValueExpression,
  solveAbsoluteValueExpression,
} = require('../../utils/mathSolver');

const PROD_TURN_2 = "Now, let's try another one. What is the absolute value of \\(3 - 10\\)? What do you think it is?";
const PROD_TURN_1 = "What's the absolute value of \\(-7\\)? What do you think?";
const PROD_TURN_3 = 'Exactly! \\(3 - 10\\) equals \\(-7\\). Now, what is the absolute value of \\(-7\\)?';

describe('absolute value of a numeric expression — the production sentences', () => {
  test('turn 2: "absolute value of \\(3 - 10\\)" is 7, not the operand -7', () => {
    const r = parseCleanProblem(PROD_TURN_2);
    expect(r.hasMath).toBe(true);
    expect(r.problem.type).toBe('absolute_value');
    expect(r.problem.expression).toBe('|3 - 10|');
    expect(String(r.solution.answer)).toBe('7');
    expect(r.solution.steps).toEqual(['3 - 10 = -7', '|-7| = 7']);
  });

  test('turn 1: "absolute value of \\(-7\\)" is 7', () => {
    const r = parseCleanProblem(PROD_TURN_1);
    expect(r.hasMath).toBe(true);
    expect(r.problem.type).toBe('absolute_value');
    expect(String(r.solution.answer)).toBe('7');
  });

  test('turn 3: the arithmetic the tutor RESTATES ("3 - 10 equals -7") does not become the target — the question does', () => {
    const r = parseCleanProblem(PROD_TURN_3);
    expect(r.hasMath).toBe(true);
    expect(r.problem.type).toBe('absolute_value');
    expect(r.problem.operand).toBe('-7');
    expect(String(r.solution.answer)).toBe('7');
  });

  test('the sub-question "what do you get when you calculate \\(3 - 10\\)?" still grades to -7', () => {
    const r = parseCleanProblem('First, what do you get when you calculate \\(3 - 10\\)? What does that equal?');
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('-7');
  });
});

describe('absolute value — grouped forms that grade deterministically', () => {
  test.each([
    ['pipes', 'What is |3 - 10|?', '|3 - 10|', '7'],
    ['board pin with spaces', '| -7 |', '|-7|', '7'],
    ['\\left| … \\right|', 'Evaluate \\left|3-10\\right|', '|3-10|', '7'],
    ['abs(…)', 'abs(3-10)', '|3-10|', '7'],
    ['pipes inside LaTeX delimiters', '\\(|2 - 9|\\)', '|2 - 9|', '7'],
    ['exact rational operand', 'What is |-3/4|?', '|-3/4|', '3/4'],
    ['positive operand with an operator', '|10 - 3|', '|10 - 3|', '7'],
    ['decimal signed number', 'the absolute value of -2.5', '|-2.5|', '2.5'],
  ])('%s', (_label, input, expression, answer) => {
    const r = parseCleanProblem(input);
    expect(r.hasMath).toBe(true);
    expect(r.problem.type).toBe('absolute_value');
    expect(r.problem.expression).toBe(expression);
    expect(String(r.solution.answer)).toBe(answer);
  });

  test('solveAbsoluteValueExpression drops only the sign', () => {
    expect(solveAbsoluteValueExpression({ operand: '-7', expression: '|-7|' })).toMatchObject({ success: true, answer: '7' });
    expect(solveAbsoluteValueExpression({ operand: '7', expression: '|7|' })).toMatchObject({ success: true, answer: '7', steps: ['|7| = 7'] });
    expect(solveAbsoluteValueExpression({ operand: '2 - 9', expression: '|2 - 9|' })).toMatchObject({ answer: '7', steps: ['2 - 9 = -7', '|-7| = 7'] });
    expect(solveAbsoluteValueExpression({ operand: 'nope', expression: '|nope|' }).success).toBe(false);
  });
});

describe('absolute value — shapes deliberately left alone', () => {
  test('|2x + 3| = 7 is still an absolute-value EQUATION, not |numeric|', () => {
    const r = parseCleanProblem('Solve |2x + 3| = 7');
    expect(r.problem.type).toBe('absolute_value_equation');
    expect(String(r.solution.answer)).toBe('x = -5 or x = 2');
  });

  test('a markdown table cell "| 3 |" is not |3|', () => {
    expect(detectAbsoluteValueExpression('Here is a table | 3 | 4 |')).toBeNull();
    expect(parseCleanProblem('Here is a table | 3 | 4 |').hasMath).toBe(false);
  });

  test('ungrouped prose "absolute value of 3 - 10" is ambiguous — no parse, no wrong number', () => {
    // |3| - 10 or |3 - 10|? Neither is guessed; the LLM verifier reads the wording.
    expect(detectAbsoluteValueExpression('What is the absolute value of 3 - 10?')).toBeNull();
    expect(parseCleanProblem('What is the absolute value of 3 - 10?').hasMath).toBe(false);
  });

  test('"absolute value of -7 minus 3" is not |-7| and not 7 - 3', () => {
    expect(detectAbsoluteValueExpression('what is the absolute value of -7 minus 3')).toBeNull();
    expect(parseCleanProblem('what is the absolute value of -7 minus 3').hasMath).toBe(false);
  });
});

describe('other wrappers demote the arithmetic beneath them', () => {
  test.each([
    'What is the opposite of 3 - 10?',
    'What is the square root of 16 - 7?',
    'What is the reciprocal of 3 + 5?',
    'Find the negative of 4 - 9.',
    'What is half of 12 + 6?',
    'What is twice 3 + 4?',
    'What is the cube root of 30 - 3?',
  ])('%s → no parse', (input) => {
    // processMathMessage still finds the raw arithmetic — that is the catch-all
    // doing its job. parseCleanProblem is what persist/diagnose call, and it
    // must refuse to certify the operand as the problem.
    expect(processMathMessage(input).hasMath).toBe(true);
    expect(parseCleanProblem(input).hasMath).toBe(false);
  });

  test('isWrappedOperand: shapes', () => {
    expect(isWrappedOperand('3 - 10', 'the absolute value of \\(3 - 10\\)')).toBe(true);
    expect(isWrappedOperand('3 - 10', '|3 - 10|')).toBe(true);
    expect(isWrappedOperand('16 - 7', 'sqrt(16 - 7)')).toBe(true);
    expect(isWrappedOperand('7 - 3', 'the absolute value of -7 minus 3')).toBe(true); // dropped sign
    expect(isWrappedOperand('3 - 10', 'what is 3 - 10?')).toBe(false);
    expect(isWrappedOperand('15 - 8', 'What is 15 - 8? Double check your work.')).toBe(false);
    expect(isWrappedOperand('3x - 7 = 11', 'the opposite of 3x - 7 = 11')).toBe(false); // variables: not this guard's job
    expect(isWrappedOperand('7', 'the opposite of 7')).toBe(false); // bare number: nothing to demote
    expect(isWrappedOperand('', 'x')).toBe(false);
  });
});

describe('regressions the new guard must not cause', () => {
  test('prose-embedded arithmetic still grades ("what\'s -34 + 6?")', () => {
    const r = parseCleanProblem("what's -34 + 6?");
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('-28');
  });

  test('"Double check" is not the wrapper "double"', () => {
    const r = parseCleanProblem('What is 15 - 8? Double check your work.');
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('7');
  });

  test('"-7 minus 3" keeps its sign (-10, not 4)', () => {
    const r = parseCleanProblem('what is -7 minus 3');
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('-10');
  });

  test('"-7 plus 3" keeps its sign (-4)', () => {
    const r = parseCleanProblem('what is -7 plus 3');
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('-4');
  });

  test('"10 - 7 plus 3": the "-7" is a subtraction, not a signed operand', () => {
    const r = parseCleanProblem('what is 10 - 7 plus 3');
    expect(r.hasMath).toBe(true);
    // the plus pattern reads "7 plus 3" here; either way the answer must not be built from "-7"
    expect(String(r.solution.answer)).not.toBe('-4');
  });

  test('the work-fragment demotion from PR #1588 still holds', () => {
    const r = parseCleanProblem('solve 3x - 7 = 11. i did 3x = 11 - 7 = 4 so x = 4/3');
    expect(r.problem.type).toBe('general_linear');
    expect(String(r.solution.answer)).toBe('6');
  });
});
