// tests/unit/mathSolverSolutionForms.test.js
//
// QA handoff 2026-10-14 §2.3, witnessed through the real observe → diagnose:
// for "solve y = 2x + 3, 3x − y = 7",
//   "(10, 23)"   → general_math, no answer extracted → no_answer (tutor asked a
//                  student with a complete, correct solve to redo it);
//   "x=10, y=23" → varAssignment kept only "10" → graded INCORRECT.
// Numeric forms (9/2 ↔ 4.5 ↔ 4 1/2) were already equivalent; pinned here too.

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';
const { verifyAnswer } = require('../../utils/mathSolver');
const { observe, extractAnswer } = require('../../utils/pipeline/observe');
const { diagnose } = require('../../utils/pipeline/diagnose');

describe('30 equivalent answer forms grade correct', () => {
  const PAIRS = [
    // two-variable solutions
    ['(10, 23)', 'x = 10, y = 23'],
    ['(10,23)', 'x = 10, y = 23'],
    ['( 10 , 23 )', 'x = 10, y = 23'],
    ['x=10, y=23', 'x = 10, y = 23'],
    ['x = 10 and y = 23', 'x = 10, y = 23'],
    ['y = 23, x = 10', 'x = 10, y = 23'],
    ['x=10 y=23', 'x = 10, y = 23'],
    ['x = 10; y = 23', 'x = 10, y = 23'],
    ['(-2, 5)', 'x = -2, y = 5'],
    ['(−2, 5)', 'x = -2, y = 5'],
    ['(1/2, 3)', 'x = 1/2, y = 3'],
    ['(0.5, 3)', 'x = 1/2, y = 3'],
    ['x = 0.5, y = 3', 'x = 1/2, y = 3'],
    ['x = 9/2, y = -1', 'x = 4.5, y = -1'],
    ['(4.5, -1)', 'x = 9/2, y = -1'],
    ['x = 10, y = 23', '(10, 23)'],
    ['(10, 23)', '(10, 23)'],
    // numbers
    ['9/2', '4.5'],
    ['4.5', '9/2'],
    ['4 1/2', '4.5'],
    ['4½', '9/2'],
    ['0.25', '1/4'],
    ['2/4', '1/2'],
    ['-3/4', '-0.75'],
    ['−7', '-7'],
    ['negative six', '-6'],
    ['1,000', '1000'],
    // expressions
    ['8x + 2x^2', '2x^2 + 8x'],
    ['2+x', 'x+2'],
    ['(x+3)(x-2)', '(x-2)(x+3)'],
  ];

  test('fixture is the 30 pairs the handoff asked for', () => {
    expect(PAIRS).toHaveLength(30);
  });

  test.each(PAIRS)('%s ≡ %s', (student, correct) => {
    expect(verifyAnswer(student, correct).isCorrect).toBe(true);
  });
});

describe('wrong solutions stay wrong', () => {
  test.each([
    ['(23, 10)', 'x = 10, y = 23'],     // swapped coordinates
    ['(10, 24)', 'x = 10, y = 23'],
    ['x = 10, y = 24', '(10, 23)'],
    ['(10, 23)', 'a = 10, b = 23'],     // pair only maps onto an {x, y} solution
    ['(10, 23, 4)', 'x = 10, y = 23'],
    ['x = 1, y = 23', 'x = 1/2, y = 23'], // fractions are no longer cut at the slash
  ])('%s ≠ %s', (student, correct) => {
    expect(verifyAnswer(student, correct).isCorrect).toBe(false);
  });
});

describe('observe extracts a two-variable solution as ONE answer', () => {
  test.each([
    ['(10, 23)', '(10, 23)'],
    ['(10,23)', '(10, 23)'],
    ['so (10, 23)', '(10, 23)'],
    ['the answer is (10, 23).', '(10, 23)'],
    ["it's (-2, 1/2)", '(-2, 1/2)'],
    ['(x, y) = (10, 23)', '(10, 23)'],
    ['x=10, y=23', 'x=10, y=23'],
    ['x = 10 and y = 23', 'x=10, y=23'],
    ['y = 23, x = 10', 'y=23, x=10'],
  ])('%s → %s', (msg, value) => {
    expect(extractAnswer(msg)).toEqual(expect.objectContaining({ value }));
  });

  test('a repeated variable is a root set, not a tuple — unchanged path', () => {
    const out = extractAnswer('x = 2 and x = 3');
    expect(out?.value).not.toMatch(/,/);
  });

  test('a bare list without parentheses is not read as a pair', () => {
    expect(extractAnswer('10, 23')?.value).not.toBe('(10, 23)');
  });
});

describe('end to end: observe → diagnose on the handoff problem', () => {
  const recent = [{
    role: 'assistant',
    content: 'Solve the system by substitution: y = 2x + 3 and 3x - y = 7. What are x and y?',
    problemInfo: { type: 'system_of_equations', correctAnswer: 'x = 10, y = 23' },
  }];
  const run = async (m) => {
    const o = observe(m, { recentAssistantMessages: recent, conversationHistory: [...recent, { role: 'user', content: m }] });
    return { o, d: await diagnose(o, { recentAssistantMessages: recent, userMessage: m }) };
  };

  test.each(['(10, 23)', 'x=10, y=23', 'x = 10 and y = 23'])('%s → answer_attempt, correct', async (m) => {
    const { o, d } = await run(m);
    expect(o.messageType).toBe('answer_attempt');
    expect(d.isCorrect).toBe(true);
  });

  test.each(['(23, 10)', 'x=10, y=24'])('%s → incorrect', async (m) => {
    const { d } = await run(m);
    expect(d.isCorrect).toBe(false);
  });
});
