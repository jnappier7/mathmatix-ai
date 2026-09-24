/**
 * A stated "x = …" is graded against the PINNED problem, not the tutor's
 * latest sub-question.
 *
 * Production, 2026-09-24: "Solve 2(x - 3) = 10" → divide by two → x-3=5 →
 * add 3 → "x=8". The LLM verifier was handed the newest mathy tutor message
 * ("Great job getting to x−3=5! … how would you isolate x from here?"), its
 * answer engine computed "add 3 to both sides", and it reported NO MATCH on a
 * correct x = 8. Where the solver has no verdict of its own, that LLM verdict
 * is the grade, so the student is told a right answer is wrong.
 *
 * The rule is narrow on purpose: a student usually answers the question in
 * front of them (the 2026-07-28 AP Calc case in llmVerifier.pickProblemContext),
 * so only a full "<the pin's variable> = <value>" claim reaches for the pin.
 */

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
  callLLMStructured: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const { pinnedProblemForAnswer } = require('../../utils/pipeline/llmVerifier');

describe('pinnedProblemForAnswer: a finished solution grades against the pin', () => {
  test.each([
    ['2(x - 3) = 10', 'x=8'],
    ['2(x - 3) = 10', 'x = 8.'],
    ['2(x−3)=10', 'x = 8'],                 // the model's Unicode-minus re-pose
    ['2\\left(x-3\\right)=10', 'x=8'],
    ['\\frac{x}{2}=4', 'x=\\frac{16}{2}'],
    ['\\sqrt{x}=4', 'x=16'],
    ['2(X - 3) = 10', 'x=8'],               // case-insensitive variable
  ])('pin %p, student %p → "Solve for x: <pin>"', (pin, said) => {
    expect(pinnedProblemForAnswer(pin, said)).toBe(`Solve for x: ${pin}`);
  });
});

describe('pinnedProblemForAnswer: everything else answers the latest question', () => {
  test.each([
    ['bare number (answers a sub-question)', '2(x - 3) = 10', '8'],
    ['intermediate step', '2(x - 3) = 10', 'x-3=5'],
    ['a different variable', '2(x - 3) = 10', 'y=8'],
    ['prose around the claim', '2(x - 3) = 10', 'x = 8 because I added 3'],
    ['variable on the right side', '2(x - 3) = 10', 'x = x'],
    ['two unknowns', '2x + y = 5', 'x=1'],
    ['an expression pin (AP Calc 2026-07-28)', '(x^2-9)/(x-3)', 'x=3'],
    ['a chained worked line', '3x = 11 - 7 = 4', 'x=4/3'],
    ['prose in the pin', 'Solve 2x=4', 'x=2'],
    ['no pin', null, 'x=8'],
    ['empty message', '2(x - 3) = 10', ''],
  ])('%s → null', (_label, pin, said) => {
    expect(pinnedProblemForAnswer(pin, said)).toBeNull();
  });
});

test('the pipeline asks the pin first and falls back to pickProblemContext', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../utils/pipeline/index.js'), 'utf8');
  expect(src).toMatch(
    /pinnedProblemForAnswer\(ctx\.conversation\?\.boardProblem\?\.tex[^)]*,\s*message\)\s*\|\|\s*pickProblemContext\(assistantContext\)/
  );
});
