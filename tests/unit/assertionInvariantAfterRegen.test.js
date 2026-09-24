/**
 * The assertion invariant (verify §2f) checks the reply AFTER an earlier guard
 * rewrote it — not only when nothing was rewritten.
 *
 * Every earlier guard rewrites through the model, and the self-contradiction
 * guard asks the model to re-decide the verdict on its own. §2f used to be
 * gated on !regeneratedThisPass, so exactly that fresh, unchecked output shipped
 * unguarded. That gate is how a correct x = 8 on 2(x - 3) = 10 reached a student
 * as "there might be a mistake in your steps" — twice (2026-09-07, 2026-09-24).
 */

jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));

const { callLLM } = require('../../utils/llmGateway');
const { verify } = require('../../utils/pipeline/verify');
const { VERIFICATION_STATES } = require('../../utils/pipeline/verificationState');

// Opens with a rejection, ends by confirming: trips the §2e-sc
// self-contradiction guard, which regenerates.
const SELF_CONTRADICTING =
  "Close, but not quite! Let's check: 2(8 - 3) = 2(5) = 10. So you were right!";
// What the self-contradiction rewrite "decides": wrong, against the verdict.
const WRONG_REDECISION =
  "Not quite. Take another look at your steps and see where it slipped.";
// The invariant's rewrite. No em dash (the dash normaliser would alter it).
const INVARIANT_REWRITE = 'Yes, x = 8 is right, nice work. Ready for the next one?';

function mockLLM() {
  callLLM.mockImplementation(async (_model, messages) => {
    const system = messages?.[0]?.content || '';
    if (system.includes('Re-examine the math in your own response')) {
      return { choices: [{ message: { content: WRONG_REDECISION } }] };
    }
    if (system.includes('You classify a math tutor')) {
      return { choices: [{ message: { content: JSON.stringify({ verdict: 'incorrect', confidence: 0.95 }) } }] };
    }
    return { choices: [{ message: { content: INVARIANT_REWRITE } }] };
  });
}

function ctx(overrides = {}) {
  return {
    userId: 'u1',
    userMessage: 'x=8',
    studentAnswer: '8',
    firstName: 'Sam',
    isStreaming: false,
    res: null,
    action: 'continue_conversation',
    messageType: 'answer_attempt',
    correctAnswer: '8',
    diagnosisType: 'correct',
    verificationState: VERIFICATION_STATES.VERIFIED_CORRECT,
    llmVerdict: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ASSERTION_GUARD;
  mockLLM();
});

test('a rewrite that rejects verified-CORRECT work is caught and rewritten again', async () => {
  const out = await verify(SELF_CONTRADICTING, ctx());

  expect(out.flags).toContain('self_contradiction_regenerated');
  expect(out.flags).toContain('assertion_invariant_violated');
  expect(out.flags).toContain('assertion_invariant_regenerated');
  expect(out.text).toBe(INVARIANT_REWRITE);
  expect(out.text).not.toMatch(/not quite|slipped/i);
});

test('a rewrite that agrees with the verdict passes untouched', async () => {
  callLLM.mockImplementation(async () => ({
    choices: [{ message: { content: "You're right, x = 8. Nice work, ready for the next one?" } }],
  }));
  const out = await verify(SELF_CONTRADICTING, ctx());

  expect(out.flags).toContain('self_contradiction_regenerated');
  expect(out.flags).not.toContain('assertion_invariant_violated');
  expect(out.text).toMatch(/x = 8/);
});
