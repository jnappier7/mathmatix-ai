/**
 * Teaching moves around the answer boundary: withhold the answer, but teach.
 *
 *  - Incorrect answer → name the FIRST step that went wrong (diagnose already
 *    finds it when work is shown) and what was right before it; never finish.
 *  - "I don't know" → teach the missing idea, then ONE step. Not the same
 *    question in smaller words.
 *  - Still stuck → the move on a parallel problem with DIFFERENT numbers, then
 *    hand it back. A twin that only rearranges the student's numbers is not one.
 *  - Tutor was wrong → own it, fix the explanation, supply no unattempted answer.
 *  - Frustrated → shrink the task to its one next piece, as an offer.
 *  - Generic effort praise is dropped so the specific feedback leads.
 */

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
}));
jest.mock('../../utils/openaiClient', () => ({
  chat: { completions: { create: jest.fn() } },
}));

const { decide, ACTIONS, firstWrongStepDirective } = require('../../utils/pipeline/decide');
const { MESSAGE_TYPES } = require('../../utils/pipeline/observe');
const { buildActionPrompt } = require('../../utils/pipeline/generate');
const { verify } = require('../../utils/pipeline/verify');
const { reusesStudentNumbers, generateVerifiedTwin } = require('../../utils/twinGenerator');
const { callLLM } = require('../../utils/llmGateway');

const makeObs = (type, overrides = {}) => ({
  messageType: type,
  answer: null,
  contextSignals: [],
  streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
  ...overrides,
});
const noDiag = { type: 'no_answer' };
const joined = (dec) => dec.directives.join('\n');

describe('incorrect answer → first wrong step', () => {
  test('with shown work, the directive points at the exact broken line', () => {
    const d = firstWrongStepDirective({ derivation: { valid: false, firstBadStep: 'x = 6 - 4' } });
    expect(d).toMatch(/FIRST WRONG STEP/);
    expect(d).toContain('"x = 6 - 4"');
    expect(d).toMatch(/do not go on to the final answer/i);
  });

  test('without work, the tutor is told to find the step that produces their number', () => {
    const d = firstWrongStepDirective({ type: 'incorrect' });
    expect(d).toMatch(/FIND THE FIRST WRONG STEP/);
    expect(d).toMatch(/never generic praise/);
  });

  test('decide uses it on a first and a second wrong answer', () => {
    const diag = { type: 'incorrect', isCorrect: false, answer: '2', correctAnswer: '10', misconception: null,
      derivation: { valid: false, firstBadStep: 'x = 6 - 4' } };
    const first = decide(makeObs(MESSAGE_TYPES.ANSWER_ATTEMPT, { answer: { value: '2' } }), diag, {});
    expect(first.action).toBe(ACTIONS.GUIDE_INCORRECT);
    expect(joined(first)).toContain('x = 6 - 4');
    const second = decide(makeObs(MESSAGE_TYPES.ANSWER_ATTEMPT, {
      answer: { value: '2' }, streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 2 },
    }), diag, {});
    expect(joined(second)).toContain('x = 6 - 4');
  });

  test('generate keeps the correct answer for diagnosis only', () => {
    const prompt = buildActionPrompt({
      action: ACTIONS.GUIDE_INCORRECT,
      directives: [],
      observation: { answer: { value: '2' } },
      diagnosis: { correctAnswer: '10' },
    });
    expect(prompt).toMatch(/for YOUR diagnosis only/);
    expect(prompt).toMatch(/FIRST step that went wrong/);
  });
});

describe('"I don\'t know" ladder', () => {
  test('1st: teach the missing idea, then ONE step — not the question again', () => {
    const dec = decide(makeObs(MESSAGE_TYPES.IDK, { streaks: { idkCount: 1, giveUpCount: 0, recentWrongCount: 0 } }), noDiag, {});
    expect(dec.action).toBe(ACTIONS.SCAFFOLD_DOWN);
    expect(joined(dec)).toMatch(/Do NOT re-ask the question/);
    expect(joined(dec)).toMatch(/TEACH the one idea/);
    expect(joined(dec)).toMatch(/ONE manageable step/);
  });

  test('2nd (still stuck): parallel problem with different numbers, handed back', () => {
    const dec = decide(makeObs(MESSAGE_TYPES.IDK, { streaks: { idkCount: 2, giveUpCount: 0, recentWrongCount: 0 } }), noDiag, {});
    expect(dec.action).toBe(ACTIONS.WORKED_EXAMPLE);
    expect(joined(dec)).toMatch(/DIFFERENT numbers/);
    expect(joined(dec)).toMatch(/try that same move on yours/);
    expect(joined(dec)).toMatch(/picture or a different example/);
  });

  test('3rd: exit ramp', () => {
    const dec = decide(makeObs(MESSAGE_TYPES.IDK, { streaks: { idkCount: 3, giveUpCount: 0, recentWrongCount: 0 } }), noDiag, {});
    expect(dec.action).toBe(ACTIONS.EXIT_RAMP);
  });
});

describe('tutor was wrong → own it without answering', () => {
  test('dispute directives forbid supplying an unattempted step', () => {
    const dec = decide(makeObs(MESSAGE_TYPES.DISPUTE, { raw: 'no, you said that step was right' }), noDiag, {});
    expect(joined(dec)).toMatch(/I incorrectly approved that step/);
    expect(joined(dec)).toMatch(/never means finishing their problem/);
  });
});

describe('frustration → shrink the task', () => {
  test.each([
    ['mild', { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 }],
    ['moderate', { idkCount: 1, giveUpCount: 0, recentWrongCount: 2 }],
  ])('%s tier offers the one next piece', (_tier, streaks) => {
    const dec = decide(makeObs(MESSAGE_TYPES.FRUSTRATION, { streaks }), noDiag, {});
    expect(joined(dec)).toMatch(/just handle the −4/);
    // Still an offer, never a restated problem.
    expect(joined(dec)).toMatch(/never restate the whole problem|Never restate the whole problem/);
  });
});

describe('generic effort praise is dropped so specific feedback leads', () => {
  test.each([
    'I appreciate your effort! Your division step is right. What happens to the −4?',
    'Good effort. Your division step is right. What happens to the −4?',
    'Thanks for trying! Your division step is right. What happens to the −4?',
  ])('%s', async (text) => {
    const result = await verify(text, { userId: 'u1', userMessage: 'x=2' });
    expect(result.flags).toContain('canned_opener_stripped');
    expect(result.text).toMatch(/^Your division step is right/);
  });

  test('praise that IS the whole reply stays (no empty bubble)', async () => {
    const result = await verify('Good effort!', { userId: 'u1', userMessage: 'x=2' });
    expect(result.text).toBe('Good effort!');
  });

  test('praise mid-sentence is untouched', async () => {
    const text = 'Good effort on the division, and that step is right. What happens to the −4?';
    const result = await verify(text, { userId: 'u1', userMessage: 'x=2' });
    expect(result.text).toBe(text);
  });
});

describe('parallel problems bring their own numbers', () => {
  test.each([
    ['x - 4 = 6', 'x + 6 = 4', true],
    ['x - 4 = 6', '6 - x = 4', true],
    ['x - 4 = 6', 'y - 3 = 8', false],
    ['2x^2 + 4 = 12', 'x^2 + 3 = 7', false],
    ['x - 4 = 6', 'x - 4 = 9', false],
  ])('%s vs %s → reuses=%s', (student, twin, reuses) => {
    expect(reusesStudentNumbers(student, twin)).toBe(reuses);
  });

  test('a rearranged twin is rejected and the generator retries', async () => {
    callLLM.mockReset();
    callLLM
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ twin: 'Solve x + 6 = 4', problemTex: 'x + 6 = 4', answer: '-2', checkType: 'equation' }) } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ twin: 'Solve y - 3 = 8', problemTex: 'y - 3 = 8', answer: '11', checkType: 'equation' }) } }] });
    const t = await generateVerifiedTwin('Solve x - 4 = 6');
    expect(callLLM).toHaveBeenCalledTimes(2);
    if (t.ok) expect(t.twin).toMatch(/y - 3 = 8/);
  });
});
