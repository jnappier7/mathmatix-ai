/**
 * Tests for verifyWithEscalation — the tiered answer verifier.
 *
 * Tier 1 (gpt-4o-mini) handles the common case; when it can't produce a usable
 * verdict (low confidence, parse failure, error) we escalate to Tier 2 (gpt-4o)
 * instead of giving up. These tests drive the tier transitions by scripting the
 * mocked LLM gateway, asserting both the resulting verdict and the call counts
 * (so we don't escalate when we shouldn't, or skip escalation when we should).
 */

jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));

const { callLLM } = require('../../utils/llmGateway');
const {
  verifyWithEscalation,
  VERIFIER_MODEL,
  ESCALATION_MODEL,
} = require('../../utils/pipeline/llmVerifier');

// Helpers: shape callLLM's return like the OpenAI SDK does.
const wrap = (obj) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });
const computeReply = (answer) => wrap({ answer, form: 'simplified' });
const judgeReply = (matches, confidence) => wrap({ matches, confidence, rationale: 'r' });
const isJudgeCall = (messages) => /equivalence judge/i.test(messages[0].content);

beforeEach(() => callLLM.mockReset());

test('tier 1 resolves a confident answer — no escalation', async () => {
  callLLM.mockImplementation((model, messages) =>
    Promise.resolve(isJudgeCall(messages) ? judgeReply(true, 0.95) : computeReply('7'))
  );

  const v = await verifyWithEscalation('Solve 2x + 3 = 13', '7');

  expect(v.isCorrect).toBe(true);
  expect(v.escalated).toBe(false);
  expect(v.tier).toBe(VERIFIER_MODEL);
  expect(callLLM).toHaveBeenCalledTimes(2); // compute + judge, mini only
  expect(callLLM.mock.calls.every(([model]) => model === VERIFIER_MODEL)).toBe(true);
});

test('low-confidence tier 1 escalates and the stronger judge resolves it', async () => {
  callLLM.mockImplementation((model, messages) => {
    const judging = isJudgeCall(messages);
    if (model === VERIFIER_MODEL) return Promise.resolve(judging ? judgeReply(true, 0.4) : computeReply('7'));
    return Promise.resolve(judging ? judgeReply(true, 0.95) : computeReply('7')); // ESCALATION_MODEL
  });

  const v = await verifyWithEscalation('Find the derivative of x^2', '2x');

  expect(v.escalated).toBe(true);
  expect(v.escalationResolved).toBe(true);
  expect(v.isCorrect).toBe(true);
  expect(v.tier).toBe(ESCALATION_MODEL);
  expect(callLLM).toHaveBeenCalledTimes(4); // mini (2) + gpt-4o (2)
  expect(callLLM.mock.calls.some(([model]) => model === ESCALATION_MODEL)).toBe(true);
});

test('a tier-1 parse failure escalates (and tier 2 can return incorrect)', async () => {
  callLLM.mockImplementation((model, messages) => {
    if (model === VERIFIER_MODEL) {
      return Promise.resolve({ choices: [{ message: { content: 'not json at all' } }] }); // step1 parse fail
    }
    return Promise.resolve(isJudgeCall(messages) ? judgeReply(false, 0.9) : computeReply('8'));
  });

  const v = await verifyWithEscalation('A word problem', '7');

  expect(v.escalated).toBe(true);
  expect(v.isCorrect).toBe(false);
  expect(v.tier).toBe(ESCALATION_MODEL);
  // tier 1 bails after the failed compute (1 call); tier 2 runs compute + judge (2).
  expect(callLLM).toHaveBeenCalledTimes(3);
});

test('when both tiers are uncertain, the result stays unverifiable', async () => {
  callLLM.mockImplementation((model, messages) =>
    Promise.resolve(isJudgeCall(messages) ? judgeReply(true, 0.3) : computeReply('7'))
  );

  const v = await verifyWithEscalation('A hard proof', '7');

  expect(v.escalated).toBe(true);
  expect(v.escalationResolved).toBe(false);
  expect(v.isCorrect).toBeNull();
  expect(callLLM).toHaveBeenCalledTimes(4);
});

test('missing input never escalates — nothing to verify', async () => {
  const v = await verifyWithEscalation('', '7');

  expect(v.escalated).toBe(false);
  expect(v.error).toBe('missing_input');
  expect(callLLM).not.toHaveBeenCalled();
});
