/**
 * Verifier × multi-part questions (root cause of the 2026-07-29 transcript
 * slips): the tutor asked "what's 0.15 × 2, and then where does the decimal
 * land once you account for the 2000?" — the student answered both parts
 * ("0.3 … 300") and the verifier anchored on the FIRST sub-question
 * (expected 0.3, saw 300 → "incorrect"), so the tutor invented a phantom
 * "the decimal shift is where it slipped."
 *
 * These pin the fix's wiring with a mocked LLM: the step-1 prompt carries
 * the last-ask rule, step 2 receives the student's full reply as context,
 * and the pipeline threads fullStudentMessage through verifyWithEscalation.
 */

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
  callLLMStructured: jest.fn(),
}));

const { callLLM } = require('../../utils/llmGateway');
const { llmVerifyAnswer } = require('../../utils/pipeline/llmVerifier');

const TWO_PART_PROBLEM =
  "So walk it through for me: what's 0.15 × 2, and then where does the decimal land once you account for the 2000?";

function mockStep1(answer) {
  callLLM.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify({ answer, form: 'decimal' }) } }],
  });
}
function mockStep2(matches, confidence = 0.95) {
  callLLM.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify({ matches, confidence, rationale: 'mock' }) } }],
  });
}

beforeEach(() => callLLM.mockReset());

describe('llmVerifyAnswer — multi-part question handling', () => {
  test('step 1 instructs the answer engine to compute the LAST thing asked', async () => {
    mockStep1('300');
    // symbolic check resolves 300 vs 300 deterministically — no step 2 needed.
    const verdict = await llmVerifyAnswer(TWO_PART_PROBLEM, '300');

    expect(verdict.isCorrect).toBe(true);
    const step1System = callLLM.mock.calls[0][1][0].content;
    expect(step1System).toContain('LAST thing asked');
    expect(step1System).toContain('Never anchor on an intermediate sub-step');
  });

  test('step 2 receives the full student reply as shown-work context', async () => {
    // Force step 2 by making step 1 return a non-symbolic answer.
    mockStep1('the decimal moves three places to give 300');
    mockStep2(true);

    const verdict = await llmVerifyAnswer(TWO_PART_PROBLEM, '300', {
      fullStudentMessage: '0.3\n\n300',
    });

    expect(verdict.isCorrect).toBe(true);
    const step2User = callLLM.mock.calls[1][1][1].content;
    expect(step2User).toContain("Student's full reply");
    expect(step2User).toContain('0.3\n\n300');
    const step2System = callLLM.mock.calls[1][1][0].content;
    expect(step2System).toContain('shown work, not wrong answers');
  });

  test('no full reply (or identical to the candidate) → no context block', async () => {
    mockStep1('a value with words');
    mockStep2(true);
    await llmVerifyAnswer(TWO_PART_PROBLEM, '300', { fullStudentMessage: '300' });
    const step2User = callLLM.mock.calls[1][1][1].content;
    expect(step2User).not.toContain("Student's full reply");
  });
});
