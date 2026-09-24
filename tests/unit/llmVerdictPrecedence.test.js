/**
 * The pipeline's verdict outranks the parallel LLM verifier's.
 *
 * Production, 2026-09-24: "Solve 2(x - 3) = 10" → divide by two → x-3=5 →
 * add 3 → "x=8". The solver verified 8 against the pinned problem
 * (verified_correct → CONFIRM_CORRECT). The LLM verifier, handed the newest
 * mathy message ("…how would you isolate x from here?") as the problem, said
 * NO MATCH, and verify §2c-llm rewrote the confirmation into "there might be
 * a mistake in the steps you took". A correct student was told they were
 * wrong. The cross-check may fill a gap in the pipeline's knowledge; it may
 * never overturn a verdict the pipeline holds.
 */

jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));

const { callLLM } = require('../../utils/llmGateway');
const { verify } = require('../../utils/pipeline/verify');
const { ACTIONS } = require('../../utils/pipeline/decide');
const { VERIFICATION_STATES } = require('../../utils/pipeline/verificationState');

const ACCUSATION = "I see where you're coming from, but let's take another look at your answer of x=8. It seems like there might be a mistake in the steps you took.";
const PRAISE = "Great job! Adding 3 to both sides gives x = 8, and that's exactly right. Ready for a harder one?";

function ctx(overrides = {}) {
  return {
    userId: 'u1',
    userMessage: 'x=8',
    studentAnswer: '8',
    firstName: 'Sam',
    isStreaming: false,
    res: null,
    action: ACTIONS.CONFIRM_CORRECT,
    messageType: 'answer_attempt',
    correctAnswer: '8',
    diagnosisType: 'correct',
    verificationState: VERIFICATION_STATES.VERIFIED_CORRECT,
    llmVerdict: { isCorrect: false, confidence: 0.95, modelAnswer: 'Add 3 to both sides' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  callLLM.mockResolvedValue({ choices: [{ message: { content: ACCUSATION } }] });
});

test('an LLM "incorrect" cannot rewrite a solver-verified CORRECT answer into a correction', async () => {
  const out = await verify(PRAISE, ctx());
  expect(out.flags).not.toContain('llm_false_confirmation_detected');
  expect(out.text).not.toMatch(/mistake/i);
  expect(out.text).toMatch(/exactly right/);
});

test('an LLM "correct" cannot rewrite a solver-verified INCORRECT answer into a confirmation', async () => {
  const out = await verify(
    "Not quite. Let's check that step again: what is 10 divided by 2?",
    ctx({
      action: ACTIONS.GUIDE_INCORRECT,
      diagnosisType: 'incorrect',
      verificationState: VERIFICATION_STATES.VERIFIED_INCORRECT,
      studentAnswer: '13',
      llmVerdict: { isCorrect: true, confidence: 0.95, modelAnswer: '13' },
    })
  );
  expect(out.flags).not.toContain('llm_false_rejection_detected');
});

test('the cross-check still fills the gap when the pipeline has no verdict', async () => {
  const out = await verify(PRAISE, ctx({
    action: 'continue_conversation',
    diagnosisType: 'unverifiable',
    verificationState: VERIFICATION_STATES.UNVERIFIED,
  }));
  expect(out.flags).toContain('llm_false_confirmation_detected');
});
