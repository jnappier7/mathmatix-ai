/**
 * A plain ask carries no work of the student's, so it is NOT_APPLICABLE, not
 * UNVERIFIED.
 *
 * Found driving the chat: "can you help me with 2x+5=17" — a request for help
 * — went to the tutor with "[ANSWER_PRE_CHECK: UNVERIFIED. We could not
 * determine whether this is right or wrong … Ask the student to show their
 * step]", because ANY math with no verdict was UNVERIFIED. The tutor was told
 * to demand work from a student who had only asked for help.
 *
 * The exemption is deliberately narrow. UNVERIFIED is what stops the tutor
 * rejecting correct work (and the assertion invariant in verify.js only runs
 * when the state is not NOT_APPLICABLE), so anything that presents the
 * student's own work or belief — even phrased as a question — keeps it.
 */

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
  callLLMStructured: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const { observe } = require('../../utils/pipeline/observe');
const { isPlainAsk, deriveVerificationState, hasMathematicalContent, VERIFICATION_STATES } =
  require('../../utils/pipeline/verificationState');
const { buildVerificationContext } = require('../../utils/pipeline/generate');

const prev = [{ role: 'assistant', content: 'What would you like to work on today?' }];
const stateFor = (message) => {
  const o = observe(message, { recentAssistantMessages: prev, recentUserMessages: [] });
  const candidate = o.answer?.value || null;
  return deriveVerificationState(
    { type: 'no_answer' },
    hasMathematicalContent(message) && !isPlainAsk(message, o, candidate)
  );
};

describe('plain asks → NOT_APPLICABLE (nothing to be right or wrong about)', () => {
  test.each([
    'can you help me with 2x+5=17',
    'how do I solve 3x - 7 = 20?',
    'solve 4x + 3 = 31',
    'what is 12*7',
    'explain 3/4 + 1/8',
    'how do I find the slope of y = 2x + 3',
    'what does x = 5 mean on a graph',
  ])('%p', (message) => {
    expect(stateFor(message)).toBe(VERIFICATION_STATES.NOT_APPLICABLE);
  });
});

describe('anything carrying the student\'s own work or belief stays UNVERIFIED', () => {
  test.each([
    ['a numeric claim in a question', 'why is 1/2 + 1/3 = 2/5?'],
    ['a comparison claim', 'explain why 3/4 > 2/3'],
    ['"my answer"', 'why is my answer of 5 wrong?'],
    ['"I got"', 'I got 12 but how do I check it?'],
    ['"how did I get"', 'how did I get 9 when it should be 7?'],
    ['a check request', 'can you check 2x = 12?'],
    ['"does … mean x ="', 'does 2x = 12 mean x = 6?'],
    ['an answer attempt', 'is my answer 12 right?'],
    ['a bare answer', 'x = 6'],
    ['a proposed step', 'subtract 5 from both sides'],
    ['work with "is that right"', 'I got x=5, is that right?'],
  ])('%s: %p', (_label, message) => {
    expect(stateFor(message)).toBe(VERIFICATION_STATES.UNVERIFIED);
  });
});

describe('isPlainAsk guards', () => {
  test('a dispute or a verification candidate is never a plain ask', () => {
    expect(isPlainAsk('why is that wrong', { messageType: 'question', isDispute: true })).toBe(false);
    expect(isPlainAsk('what is 2+2', { messageType: 'question' }, '4')).toBe(false);
  });

  test('only questions and help requests qualify', () => {
    expect(isPlainAsk('2x+5=17', { messageType: 'general_math' })).toBe(false);
    expect(isPlainAsk('', { messageType: 'question' })).toBe(false);
    expect(isPlainAsk(null, { messageType: 'question' })).toBe(false);
  });
});

test('NOT_APPLICABLE injects no answer-check text into the tutor prompt', () => {
  expect(buildVerificationContext({ type: 'no_answer', verificationState: VERIFICATION_STATES.NOT_APPLICABLE })).toBeNull();
  // ...where UNVERIFIED does — the directive this change keeps off plain asks.
  expect(buildVerificationContext({ type: 'no_answer', verificationState: VERIFICATION_STATES.UNVERIFIED }))
    .toMatch(/ANSWER_PRE_CHECK: UNVERIFIED/);
});

test('the pipeline derives the state with the plain-ask exemption', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../utils/pipeline/index.js'), 'utf8');
  expect(src).toMatch(
    /deriveVerificationState\(\s*diagnosis,\s*hasMathematicalContent\(message\) && !isPlainAsk\(message, observation, verificationCandidate\)\s*\)/
  );
});
