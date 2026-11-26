/**
 * Live, 2026-11-26, on 3/4 + 2/3: "9 and 6" for the numerators (2/3 is 8/12),
 * the tutor asked "what do you get when you add the numerators 9 and 6?", and
 * "15/12" was confirmed as the answer to the problem. It is 17/12.
 *
 * Model calls are scripted by what each prompt asks, so the whole verdict path
 * runs: the question's answer, the board problem's answer, and the reading of
 * whether the tutor's question was built on the wrong values.
 */

const mockCall = jest.fn();
jest.mock('../../utils/llmGateway', () => ({
  callLLM: (...args) => mockCall(...args),
  callLLMStructured: jest.fn(),
}));

const { observeAndDiagnose } = require('../../utils/pipeline/index');
const { decide } = require('../../utils/pipeline/decide');
const { buildActionPrompt } = require('../../utils/pipeline/generate');
const { questionBuildsOnAnswer, quotesAnswer } = require('../../utils/pipeline/builtOnMiss');

const json = (obj) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });
const PIN = '\\frac{3}{4}+\\frac{2}{3}';
const BUILT_ON = 'You found the common denominator, \\(12\\). Now check the last step: what do you get when you add the numerators \\(9\\) and \\(6\\), while keeping the denominator \\(12\\)?';
const RE_ASK = 'Not quite on \\(6\\). To change \\(\\frac{2}{3}\\) into twelfths, what do you multiply the numerator by?';

// The verifier's three kinds of call, answered the way the real one answered.
function script({ buildsOn, askedAnswer }) {
  mockCall.mockImplementation(async (_model, messages) => {
    const system = messages[0].content;
    const user = messages[messages.length - 1].content;
    if (/"buildsOn"/.test(system)) return json({ buildsOn });
    if (/answer engine/i.test(system)) {
      // The board problem as the student posed it, or the tutor's follow-up.
      return json({ answer: /^Problem:\ncan you help me with/m.test(user) || !/Problem:\n.*(add the numerators|multiply the numerator)/s.test(user) ? '17/12' : askedAnswer });
    }
    return json({ matches: false, confidence: 0.9, rationale: 'different value' });
  });
}

const conversation = (tutorTurn) => ({
  messages: [
    { role: 'user', content: 'can you help me with 3/4 + 2/3' },
    { role: 'assistant', content: 'What’s the least common denominator of \\(4\\) and \\(3\\)?' },
    { role: 'user', content: '12' },
    { role: 'assistant', content: 'Right. Now rewrite each fraction with denominator \\(12\\). What numerator does each one get?' },
    { role: 'user', content: '9 and 6' },
    { role: 'assistant', content: tutorTurn, problemResult: 'incorrect' },
  ],
  boardProblem: { tex: PIN },
  lastBoardAction: 'pose',
  lastProblemState: null,
});
const run = (message, tutorTurn) => observeAndDiagnose(message, { conversation: conversation(tutorTurn), user: { _id: 'u', firstName: 'Eval' }, activeSkill: null });

beforeEach(() => mockCall.mockReset());

describe('an answer to a question built on a wrong one is not confirmed', () => {
  test('"15/12" after "add the numerators 9 and 6": no verdict, and the tutor is sent back', async () => {
    script({ buildsOn: true, askedAnswer: '15/12' });
    const { diagnosis, observation } = await run('15/12', BUILT_ON);
    expect(diagnosis.isCorrect).toBeNull();
    expect(diagnosis.type).toBe('unverifiable');
    expect(diagnosis.builtOnMiss).toEqual({ previousAnswer: '9 and 6' });
    expect(diagnosis.verificationState).toBe('unverified');

    const decision = decide(observation, diagnosis, {});
    expect(decision.action).toBe('continue_conversation');
    const told = decision.directives.join('\n');
    expect(told).toMatch(/DO NOT CONFIRM THIS AS THE ANSWER/);
    expect(told).toMatch(/Their earlier answer was "9 and 6"/);
    expect(told).toMatch(/do not move to a new problem/i);
    // The generic "could not auto-verify, confirm briefly if right" script is not sent.
    expect(told).not.toMatch(/ANSWER VERIFICATION REQUIRED/);
  });

  test('a student who FIXES the missed step keeps their confirmation', async () => {
    // Same three facts — previous answer wrong, right for the follow-up, not the
    // board problem's answer — but the tutor re-asked instead of building on it.
    script({ buildsOn: false, askedAnswer: '4' });
    const { diagnosis } = await run('4', RE_ASK);
    expect(diagnosis.isCorrect).toBe(true);
    expect(diagnosis.builtOnMiss).toBeUndefined();
  });

  test('the right final answer is confirmed, built-on question or not', async () => {
    script({ buildsOn: true, askedAnswer: '15/12' });
    const { diagnosis } = await run('17/12', BUILT_ON);
    expect(diagnosis.isCorrect).toBe(true);
    expect(diagnosis.builtOnMiss).toBeUndefined();
  });
});

describe('questionBuildsOnAnswer', () => {
  test('is only asked when the wrong values appear in the tutor\'s turn', async () => {
    expect(quotesAnswer(BUILT_ON, '9 and 6')).toBe(true);
    expect(quotesAnswer('Try that step again: what is one third of twenty-four?', '6')).toBe(false);
    expect(await questionBuildsOnAnswer('Try that step again.', '6')).toBe(false);
    expect(mockCall).not.toHaveBeenCalled();
  });

  test('reads the model\'s answer, and any doubt or failure is "no"', async () => {
    mockCall.mockResolvedValue(json({ buildsOn: true }));
    expect(await questionBuildsOnAnswer(BUILT_ON, '9 and 6')).toBe(true);
    mockCall.mockResolvedValue(json({ buildsOn: 'maybe' }));
    expect(await questionBuildsOnAnswer(BUILT_ON, '9 and 6')).toBe(false);
    mockCall.mockResolvedValue({ choices: [{ message: { content: 'hmm' } }] });
    expect(await questionBuildsOnAnswer(BUILT_ON, '9 and 6')).toBe(false);
    mockCall.mockRejectedValue(new Error('down'));
    expect(await questionBuildsOnAnswer(BUILT_ON, '9 and 6')).toBe(false);
  });
});

describe('a wrong answer is never the input to the next step', () => {
  const prompt = (answer, correctAnswer) => buildActionPrompt({
    action: 'guide_incorrect', directives: [], observation: { answer: { value: answer } }, diagnosis: { correctAnswer, isCorrect: false },
  });

  test('several values against a single answer are named as a step, to be checked one by one', () => {
    const p = prompt('9, 6', '1.4167');
    expect(p).toMatch(/these look like values from a step along the way/);
    expect(p).toMatch(/Check EACH value they gave against the problem yourself/);
    expect(p).not.toMatch(/but the correct answer is "1\.4167"/);
  });

  test('a single wrong value keeps the plain wording', () => {
    expect(prompt('15', '6')).toMatch(/The student answered "15" but the correct answer is "6"/);
  });

  test('either way, the tutor is told not to carry it forward', () => {
    expect(prompt('9, 6', '1.4167')).toMatch(/NEVER carry their answer forward/);
    expect(prompt('15', '6')).toMatch(/NEVER carry their answer forward/);
  });
});
