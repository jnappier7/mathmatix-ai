/**
 * Answers nothing read — the ~17% the verdict-accuracy eval left ungraded on
 * 2026-11-04. Each matched no answer pattern, so the turn classified
 * general_math, no grader ran, and a right answer got "walk me through it".
 */

jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));

const { callLLM } = require('../../utils/llmGateway');
const { extractAnswer, observe } = require('../../utils/pipeline/observe');
const { llmVerifyAnswer } = require('../../utils/pipeline/llmVerifier');

const value = (t) => extractAnswer(t)?.value ?? null;

describe('lone answers with a radical, π, e^, trig, or + C', () => {
  test.each([
    ['5√2', '5sqrt2'],
    ['\\(5\\sqrt{2}\\)', '5sqrt{2}'],
    ['5sqrt(2)', '5sqrt(2)'],
    ['6π', '6pi'],
    ['\\(6\\pi\\)', '6pi'],
    ['25pi', '25pi'],
    ['√3/2', 'sqrt3/2'],
    ['2e^(2x)', '2e^(2x)'],
    ['2xe^(2x-1)', '2xe^(2x-1)'],
    ['2x sin x + x^2 cos x', '2x sin x + x^2 cos x'],
    ['\\(2x\\sin x + x^2\\cos x\\)', '2x sin x + x^2 cos x'],
    ['2xsin(x)+x^2cos(x)', '2xsin(x)+x^2cos(x)'],
    ['x^3/3 + C', 'x^3/3+C'],
    ['2π(3) = 6π', '6pi'],              // shown work: the right-hand side is the claim
    ['π(3)^2 = 9π', '9pi'],             // was "9": pi read as a unit, like cm
  ])('%s → %s', (t, v) => expect(value(t)).toBe(v));

  test('a plain polynomial stays a step, not a final answer', () => {
    // diagnose grades a rewrite by equivalence to the live problem; reading it
    // as the final answer would reject a correct intermediate step.
    expect(value('12x(3x+1)^3')).toBeNull();
    expect(value('x^2 - 2x + 5x - 10 = x^2 + 3x - 10')).toBeNull();
  });

  test('prose with a function word is not an expression', () => {
    expect(value('sin is opposite over hypotenuse')).toBeNull();
  });
});

describe('"is it …?" with an expression is a self-check, not a question', () => {
  test.each([
    ['is it x^7?', 'x^7'],
    ['is it 8x^6?', '8x^6'],
    ['is it 4 2/3?', '4 2/3'],
    ['is it 12(3x + 1)^3?', '12(3x+1)^3'],
    ['is it 5√2?', '5sqrt2'],
    ['is it x^3 + C?', 'x^3+C'],
    ['is it x = 5√2?', '5sqrt2'],
    ['is it x > 4?', 'x>4'],
  ])('%s → %s (answer_attempt, proposed)', (t, v) => {
    const o = observe(t, { conversation: { messages: [] } });
    expect(o.messageType).toBe('answer_attempt');
    expect(o.answer.value).toBe(v);
    expect(o.answer.proposed).toBe(true);
  });

  test.each(['is it a square?', 'what is 6π?', 'is it always positive?'])('%s stays a question', (t) => {
    expect(observe(t, { conversation: { messages: [] } }).messageType).toBe('question');
  });
});

describe('inequalities, ±, root pairs, units, no-value answers', () => {
  test.each([
    ['x > 4', 'x>4'],
    ['x>=-4', 'x≥-4'],
    ['x ≤ -4', 'x≤-4'],
    ['2x > 8 so x > 4', 'x>4'],
    ['x = ±7', '±7'],
    ['+/- 7', '±7'],
    ['2 and 3', '2, 3'],
    ['$30', '30'],
    ['52°', '52'],
    ['.1', '0.1'],
    ['DNE', 'DNE'],
    ['does not exist', 'DNE'],
    ['undefined', 'DNE'],
    ["f'(x) = 3x^2 - 5 so f'(1) = -2", '-2'],
    ['x^2/2 from 0 to 2 = 2', '2'],
  ])('%s → %s', (t, v) => expect(value(t)).toBe(v));

  test('a hypothetical inequality is not a claim', () => {
    expect(value('if x > 4')).toBeNull();
  });
});

describe('the verifier solves a sub-question with the turn before it', () => {
  test('earlierContext reaches the solve step, marked as context', async () => {
    callLLM
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"answer":"2x sin x"}' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"matches":true,"confidence":0.95}' } }] });
    const v = await llmVerifyAnswer("u' = 2x and v' = cos x. What would u'v look like?", '2x sin x', {
      earlierContext: 'Let u = x^2 and v = sin x.',
    });
    const solve = callLLM.mock.calls[0][1].find(m => m.role === 'user').content;
    expect(solve).toMatch(/^Earlier in the lesson \(context only/);
    expect(solve).toContain('Let u = x^2 and v = sin x.');
    expect(solve.indexOf('Problem:')).toBeGreaterThan(solve.indexOf('v = sin x'));
    expect(v.isCorrect).toBe(true);
  });

  test('without it the solve prompt is unchanged', async () => {
    callLLM.mockResolvedValueOnce({ choices: [{ message: { content: '{"answer":"6"}' } }] });
    await llmVerifyAnswer('What is 2 + 4?', '6');
    expect(callLLM.mock.calls[0][1].find(m => m.role === 'user').content).toBe('Problem:\nWhat is 2 + 4?');
  });
});

describe('the symbolic checker reads π and √ as numbers', () => {
  const { symbolicVerify } = require('../../utils/pipeline/symbolicVerifier');
  test.each([
    ['9pi', '9π', true],     // was a confident NO MATCH: π parsed as a variable
    ['6pi', '9π', false],
    ['5sqrt2', '5√2', true],
    ['25sqrt2', '5√2', false],
    ['sqrt3/2', '√3/2', true],
    ['sqrt2/2', '√3/2', false],
  ])('%s against %s → %s', (a, b, ok) => {
    expect(symbolicVerify({ studentAnswer: a, correctAnswer: b }).isCorrect).toBe(ok);
  });
});
