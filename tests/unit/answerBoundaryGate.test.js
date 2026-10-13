/**
 * The answer boundary: the student supplies the answer first.
 *
 * verify §3a is a post-condition on the text that actually ships. Every
 * giveaway guard used to check only the reply it was handed, while later
 * stages rewrote through the model — four of them handed the correct answer
 * to steer by — and nothing re-checked the result. Pinned here:
 *   • a WRONG answer unlocks nothing: the verified answer is never revealed;
 *   • a rewrite handed the answer may not print it;
 *   • a review item's multiple-choice key is not named before the student picks it;
 *   • an upload rewrite that fails is REPLACED, never appended to.
 */

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
}));
jest.mock('../../utils/openaiClient', () => ({
  chat: { completions: { create: jest.fn() } },
}));

const { verify } = require('../../utils/pipeline/verify');
const { MESSAGE_TYPES } = require('../../utils/pipeline/observe');
const { ACTIONS } = require('../../utils/pipeline/decide');
const { VERIFICATION_STATES } = require('../../utils/pipeline/verificationState');
const { findKnownValueReveal, findChoiceKeyReveal } = require('../../utils/pipeline/valueLeak');
const { callLLM } = require('../../utils/llmGateway');

const reply = (content) => ({ choices: [{ message: { content } }] });

// Route mocked LLM calls by their system prompt: the assertion classifier
// answers "neither", each rewrite stage answers what the test gives it.
function routeLLM(routes) {
  callLLM.mockImplementation(async (_model, messages) => {
    const system = (messages[0] && messages[0].content) || '';
    if (/^You classify a math tutor/.test(system)) return reply('{"verdict":"neither","confidence":0.9}');
    for (const [rx, content] of routes) if (rx.test(system)) return reply(content);
    throw new Error(`unrouted LLM call: ${system.slice(0, 80)}`);
  });
}
const FINAL_GATE = /must supply the answer themselves/;

// x - 4 = 6 → x = 10; the student said x = 2.
const wrongTurn = {
  userId: 'u1',
  userMessage: 'I got x=2',
  messageType: MESSAGE_TYPES.ANSWER_ATTEMPT,
  action: ACTIONS.GUIDE_INCORRECT,
  diagnosisType: 'incorrect',
  verificationState: VERIFICATION_STATES.VERIFIED_INCORRECT,
  correctAnswer: '10',
  studentAnswer: '2',
};

describe('findKnownValueReveal', () => {
  test.each([
    ['Add 4 to both sides and you get x = 10.', '10'],
    ['So x is ten.', '10'],
    ['The answer is 10, not 2.', '10'],
    ['Plug in 10 and check it.', 'x = 10'],
    ['so y = 3/4', '3/4'],
    ['The factored form is (x+2)(x-5)', '(x+2)(x-5)'],
  ])('reveals: %s', (text, answer) => {
    expect(findKnownValueReveal(text, answer)).not.toBeNull();
  });

  test.each([
    ['Your division step was right. What happens when you add 4 to both sides of x − 4 = 6?', '10'],
    ['If x = 2, then 2 − 4 = −2, not 6.', '10'],
    ['Try y − 3 = 8: adding 3 to both sides gives y = 11. Now do that move on yours.', '10'],
    ['There are 10 problems on the sheet.', '10'],
    ['Factor x² − 3x − 10. What two numbers multiply to −10?', '(x+2)(x-5)'],
  ])('does not reveal: %s', (text, answer) => {
    expect(findKnownValueReveal(text, answer)).toBeNull();
  });
});

describe('findChoiceKeyReveal', () => {
  const key = { letters: ['C'], text: 'x − 5' };
  test.each([
    'The answer is C.',
    'The correct choice is (C).',
    'C is correct!',
    "It's option C.",
    'Go with C.',
    'So the answer is x − 5.',
  ])('reveals: %s', (text) => {
    expect(findChoiceKeyReveal(text, key)).not.toBeNull();
  });

  test.each([
    'A) x + 2   B) x − 2   C) x − 5   D) x + 5\nWhich one works?',
    'Look at option C — what happens when you multiply it out?',
    'Would you pick C or D? Test one.',
    'That is a good start. (x + 2)(x − 5) is the factoring step — now which choice matches?',
    'Take a look at each answer choice.',
  ])('does not reveal: %s', (text) => {
    expect(findChoiceKeyReveal(text, key)).toBeNull();
  });
});

describe('verify §3a: a wrong answer unlocks nothing', () => {
  beforeEach(() => callLLM.mockReset());

  test('a first draft that hands over the value is rewritten', async () => {
    callLLM.mockResolvedValueOnce(reply('Your division step was right. What happens when you add 4 to both sides of x − 4 = 6?'));
    const result = await verify('Not quite. Adding 4 to both sides, x is ten.', wrongTurn);
    expect(result.flags).toContain('final_disclosure_detected');
    expect(result.flags).toContain('final_disclosure_regenerated');
    expect(result.text).toMatch(/add 4/);
    expect(findKnownValueReveal(result.text, '10')).toBeNull();
  });

  test('a rewrite that leaks again gets the deterministic fallback', async () => {
    // "x is ten" has no announcement phrase and no "x = …", so 2c-leak's form
    // test passes it; only the value check sees it.
    routeLLM([[FINAL_GATE, 'Close! Add 4 to both sides to get x = 10.']]);
    const result = await verify('Not quite — so x is ten.', wrongTurn);
    expect(result.flags).toContain('final_disclosure_still_leaked');
    expect(findKnownValueReveal(result.text, '10')).toBeNull();
  });

  test('2c false-confirmation rewrite is re-checked (it was handed the answer)', async () => {
    // 2c rewrites the affirmation; its rewrite prints the answer. 2c-leak is
    // skipped for the turn (regeneratedThisPass) — §3a catches it.
    routeLLM([
      [/verified as INCORRECT/, "Hmm, let's look again — adding 4 gives x = 10."],
      [FINAL_GATE, 'Your division step was right. What do you get when you add 4 to both sides?'],
    ]);
    const result = await verify("That's right! Great work.", wrongTurn);
    expect(result.flags).toContain('false_confirmation_regenerated');
    expect(result.flags).toContain('final_disclosure_regenerated');
    expect(result.text).not.toMatch(/10/);
  });

  test('a clean reply on a wrong answer passes untouched', async () => {
    const clean = 'Your division step was right. The trouble is the −4: what happens when you add 4 to both sides of x − 4 = 6?';
    routeLLM([]);
    const result = await verify(clean, wrongTurn);
    expect(result.flags).not.toContain('final_disclosure_detected');
    expect(result.text).toBe(clean);
  });

  test('a CORRECT answer is not guarded — confirming it is fine', async () => {
    const result = await verify('Yes — x = 10. Nice work.', {
      ...wrongTurn,
      userMessage: 'x=10',
      action: ACTIONS.CONFIRM_CORRECT,
      diagnosisType: 'correct',
      verificationState: VERIFICATION_STATES.VERIFIED_CORRECT,
      studentAnswer: '10',
    });
    expect(result.flags).not.toContain('final_disclosure_detected');
  });

  test('LLM-verifier "wrong" verdict guards its model answer too', async () => {
    callLLM.mockResolvedValueOnce(reply('Check your derivative of the second term — what is the derivative of 3x²?'));
    const result = await verify('Close, but the answer is 6x + 2.', {
      userId: 'u1',
      userMessage: 'is it 3x + 2?',
      messageType: MESSAGE_TYPES.ANSWER_ATTEMPT,
      diagnosisType: 'unverifiable',
      verificationState: VERIFICATION_STATES.VERIFIED_INCORRECT,
      llmVerdict: { isCorrect: false, modelAnswer: '6x + 2', confidence: 0.95 },
    });
    expect(result.flags).toContain('final_disclosure_regenerated');
    expect(result.text).not.toMatch(/6x\s*\+\s*2/);
  });
});

describe('verify §3a: review multiple-choice key', () => {
  beforeEach(() => callLLM.mockReset());
  const miss = { hasPrompt: true, key: { letters: ['C'], text: 'x − 5' } };
  const reviewTurn = {
    userId: 'u1',
    messageType: MESSAGE_TYPES.ANSWER_ATTEMPT,
    actReviewMiss: miss,
  };

  test('naming the key after a wrong pick is rewritten', async () => {
    callLLM.mockResolvedValueOnce(reply('B gives x + 2 when you factor — does that match the expression? Try multiplying it out.'));
    const result = await verify('Not quite — the answer is C.', { ...reviewTurn, userMessage: 'B' });
    expect(result.flags).toContain('final_disclosure_regenerated');
    expect(findChoiceKeyReveal(result.text, miss.key)).toBeNull();
  });

  test('once the student names the key, confirming it is fine', async () => {
    const result = await verify('Yes — C is correct. Factoring did it.', { ...reviewTurn, userMessage: 'C' });
    expect(result.flags).not.toContain('final_disclosure_detected');
  });

  test('a key dispute may name the stored key', async () => {
    const result = await verify('I got B, but the stored answer is C. I\'m flagging this one.\n<KEY_DISPUTE: B>', { ...reviewTurn, userMessage: 'B' });
    expect(result.flags).not.toContain('final_disclosure_detected');
  });
});

describe('verify: upload giveaway fallback replaces, never appends', () => {
  beforeEach(() => callLLM.mockReset());
  const uploadCtx = { userId: 'u1', userMessage: 'help with #3', messageType: MESSAGE_TYPES.HELP_REQUEST, hasRecentUpload: true };
  const solved = 'Step 1: Subtract 7 from both sides: 3x = 27.\nStep 2: Divide by 3.\nThe answer is x = 9.';

  test('rewrite failure ships the fallback, not the solution plus a question', async () => {
    callLLM.mockRejectedValueOnce(new Error('LLM unavailable'));
    const result = await verify(solved, uploadCtx);
    expect(result.flags).toContain('upload_solution_redirect_fallback');
    expect(result.text).not.toMatch(/x = 9/);
  });

  test('a rewrite that solves it again is replaced', async () => {
    callLLM.mockResolvedValueOnce(reply(solved));
    const result = await verify(solved, uploadCtx);
    expect(result.flags).toContain('upload_solution_redirect_still_leaked');
    expect(result.text).not.toMatch(/x = 9/);
  });
});
