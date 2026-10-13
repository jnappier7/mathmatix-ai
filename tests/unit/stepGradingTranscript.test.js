/**
 * Step grading in a long-division review — owner transcript + logs, 2026-10-13.
 *
 * Three seams, one session (SAT review, p(x) = x³ − 4x² − 7x + 10):
 *  1. OBSERVE never read the step answers. "(x+2)(x-5)", "subtract which is
 *     -3x^2" and "My quotient is x^2-3x-10 …" classified general_math /
 *     proposed_step, so diagnose never graded them; with no verdict the
 *     invariant forbade affirming, and correct work got "let's take a closer
 *     look" / "you're on the right track, show me".
 *  2. DECIDE's review directive opened every turn with "solve it all before you
 *     call ANY answer right or wrong", so the first draft hedged on all 7
 *     verified-correct steps (7/7 tripped the false-rejection guard).
 *  3. VERIFY never re-checked the invariant's own rewrite; "bring down the −7x"
 *     shipped as "it looks like you might have missed that…".
 */
jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));

const { callLLM } = require('../../utils/llmGateway');
const { observe } = require('../../utils/pipeline/observe');
const { decide } = require('../../utils/pipeline/decide');
const { verify, invariantFallbackText } = require('../../utils/pipeline/verify');
const { VERIFICATION_STATES, classifyAssertionFast, ASSERTIONS } = require('../../utils/pipeline/verificationState');

const ask = (q) => ({ recentAssistantMessages: [{ role: 'assistant', content: q }] });

describe('1. observe reads step answers', () => {
  test.each([
    ['(x+2)(x-5)', '(x+2)(x-5)'],
    ['(x-1)(x+2)(x-5)', '(x-1)(x+2)(x-5)'],
    ['2(x+3)', '2(x+3)'],
    ['subtract which is -3x^2', '-3x^2'],
    ['multiply to get x^3 - x^2', 'x^3-x^2'],
    ['that leaves -10x + 10', '-10x+10'],
    ['My quotient is x^2-3x-10 so I can factor that right?', 'x^2-3x-10'],
  ])('%s → answer %s', (msg, value) => {
    const o = observe(msg, ask('What do you get?'));
    expect(o.messageType).toBe('answer_attempt');
    expect(o.answer.value).toBe(value);
  });

  test.each([
    ['(3)(4)'],            // arithmetic grouping, no variable
    ['bring down the -7x'], // an operation with no result — stays a proposed step
    ['i get it'],
    ['the factors are 2 and 5'],
  ])('%s is not minted into an algebraic answer', (msg) => {
    const o = observe(msg, ask('What would you do next?'));
    expect(o.answer && /[a-z(]/i.test(o.answer.value)).toBeFalsy();
  });
});

describe('2. the review key check does not prime doubt on a verified step', () => {
  const miss = { position: 18, testId: 'psat-math', problemId: 'sat-math-p3q66', theirAnswer: 'D', correctOption: 'C', hasPrompt: true };
  const run = (correct) => decide(
    { messageType: 'answer_attempt', raw: 'x^3-x^2', answer: { value: 'x^3-x^2' }, confidence: 1,
      streaks: { giveUpCount: 0, recentCorrectCount: 0, recentWrongCount: 0 } },
    correct ? { type: 'correct', isCorrect: true, correctAnswer: 'x^3-x^2', studentAnswer: 'x^3-x^2' }
      : { type: 'unknown' },
    { phaseState: null, activeSkill: null, isCourseMode: true, actReviewMiss: miss },
  );

  test('verified-correct step: affirm first, key check scoped to the final choice', () => {
    const d = run(true);
    const all = d.directives.join('\n');
    expect(all).toMatch(/THIS TURN'S STEP IS VERIFIED CORRECT/);
    expect(all).toMatch(/for their final answer choice/);
    expect(all).not.toMatch(/before you call any answer right or wrong/);
  });

  test('no verdict: the key rule stands without the affirmation', () => {
    const all = run(false).directives.join('\n');
    expect(all).toMatch(/VERIFY THE KEY BEFORE YOU USE IT/);
    expect(all).not.toMatch(/VERIFIED CORRECT by the answer engine/);
  });
});

describe('3. the invariant re-checks its own rewrite', () => {
  const LEAKED = 'Great effort! When you brought down the −7x, it looks like you might have missed that it was already part of your expression. Can you tell me what you would divide −3x² by?';

  test('hedged rejections are on the fast list', () => {
    expect(classifyAssertionFast(LEAKED)).toBe(ASSERTIONS.INCORRECT);
    expect(classifyAssertionFast('It looks like there was a small mistake when combining the terms.')).toBe(ASSERTIONS.INCORRECT);
    expect(classifyAssertionFast('I see where we might have a little mix-up.')).toBe(ASSERTIONS.INCORRECT);
  });

  test('a rewrite that still rejects unverified work gets the deterministic fallback', async () => {
    callLLM.mockImplementation(async (_m, messages) => {
      const system = messages?.[0]?.content || '';
      if (system.includes('You classify a math tutor')) {
        return { choices: [{ message: { content: JSON.stringify({ verdict: 'incorrect', confidence: 0.95 }) } }] };
      }
      return { choices: [{ message: { content: LEAKED } }] };   // the rewrite repeats the claim
    });
    const out = await verify("Not quite, you made a mistake bringing that down. What's next?", {
      userId: 'u1', userMessage: 'bring down the -7x', studentAnswer: null, isStreaming: false, res: null,
      action: 'acknowledge_progress', messageType: 'proposed_step', diagnosisType: 'unverifiable',
      verificationState: VERIFICATION_STATES.UNVERIFIED, llmVerdict: null,
    });
    expect(out.flags).toContain('assertion_invariant_regenerated');
    expect(out.flags).toContain('assertion_invariant_fallback');
    expect(out.text).not.toMatch(/missed|mistake/i);
    expect(out.text).toMatch(/divide/);
  });

  test('fallback text matches the verdict it holds', () => {
    expect(invariantFallbackText('Close, but not quite. What is next?', VERIFICATION_STATES.VERIFIED_CORRECT))
      .toBe("That's right. What is next?");
    expect(invariantFallbackText('You are wrong.', VERIFICATION_STATES.UNVERIFIED))
      .toMatch(/^Walk me through that step/);
    expect(invariantFallbackText('Not quite — is that wrong?', VERIFICATION_STATES.UNVERIFIED))
      .toMatch(/^Walk me through that step/);
  });
});
