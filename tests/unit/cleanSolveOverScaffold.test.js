/**
 * Clean-solve over-scaffolding + \div leak (owner screenshot, 2026-07-26).
 *
 * Production message, verbatim: the student wrote "120/4 = 30 miles per
 * gallon. and 10 gallons at 30 mpg is 300 miles" — a correct first-try solve
 * WITH the reasoning shown — and the tutor replied:
 *
 *   "Great job on your calculations, Jason! … Can you walk me through how
 *    you got from 120 \div 4 to 30, and then how you multiplied that by 10
 *    to get your final result? Let's work through it together to ensure we
 *    understand each step clearly!"
 *
 * Three defects in one reply:
 *  1. Re-justification of verified, already-shown work (over-scaffolding —
 *     decide.js forbids it in a directive, but nothing enforced it).
 *  2. Literal "\div" shown to the student — normalizeLatex converts ÷ to
 *     \div but never wrapped bare operator math in \( \).
 *  3. "Let's work through it together" slipped the canned-transition ban,
 *     which only knew "work through this".
 */
jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
  callLLMStructured: jest.fn(),
}));

const { callLLM } = require('../../utils/llmGateway');
const { verify, normalizeLatex, stripCannedTransitions } = require('../../utils/pipeline/verify');
const { ACTIONS } = require('../../utils/pipeline/decide');

const SCREENSHOT_REPLY =
  "Great job on your calculations, Jason! I see you found the unit rate and then scaled it up. " +
  "Can you walk me through how you got from 120 \\div 4 to 30, and then how you multiplied that by 10 to get your final result? " +
  "Let's work through it together to ensure we understand each step clearly!";

beforeEach(() => callLLM.mockReset());

describe('re-justification guard on demonstrated reasoning', () => {
  test('the screenshot reply regenerates into affirm-and-advance', async () => {
    callLLM.mockResolvedValueOnce({
      choices: [{ message: { content: 'Perfect solve — unit rate, then scale. Ready for a tougher one: how far on 7.5 gallons?' } }],
    });
    const v = await verify(SCREENSHOT_REPLY, {
      action: ACTIONS.CONFIRM_CORRECT,
      demonstratedReasoning: true,
      firstName: 'Jason',
    });
    expect(v.flags).toContain('rejustification_detected');
    expect(v.flags).toContain('rejustification_regenerated');
    expect(v.text).not.toMatch(/walk me through/i);
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  test('bare-answer turns (no demonstrated reasoning) may still ask for thinking', async () => {
    const v = await verify('Nice work! How did you get 30 there?', {
      action: ACTIONS.CONFIRM_CORRECT,
      demonstratedReasoning: false,
    });
    expect(v.flags).not.toContain('rejustification_detected');
    expect(v.text).toContain('How did you get 30 there?');
    expect(callLLM).not.toHaveBeenCalled();
  });

  test('non-CONFIRM_CORRECT turns are untouched', async () => {
    const v = await verify('Walk me through what you tried so far.', {
      action: ACTIONS.HINT,
      demonstratedReasoning: true,
    });
    expect(v.flags).not.toContain('rejustification_detected');
    expect(callLLM).not.toHaveBeenCalled();
  });

  test('regen failure keeps the original text and flags it', async () => {
    callLLM.mockRejectedValueOnce(new Error('LLM unavailable'));
    const v = await verify(SCREENSHOT_REPLY, {
      action: ACTIONS.CONFIRM_CORRECT,
      demonstratedReasoning: true,
      firstName: 'Jason',
    });
    expect(v.flags).toContain('rejustification_regeneration_failed');
    expect(v.text.length).toBeGreaterThan(10);
  });
});

describe('bare operator math gets wrapped (the \\div leak)', () => {
  test('unicode ÷ ends up delimited, not as literal \\div text', () => {
    const out = normalizeLatex('Can you walk me through how you got from 120 ÷ 4 to 30?');
    expect(out).toMatch(/\\\(120\s*\\div\s+4\\\)/);
  });

  test('× with a result: "3 × 4 = 12" wraps whole equation', () => {
    expect(normalizeLatex('So 3 × 4 = 12 here.')).toMatch(/\\\(3\s*\\times\s+4\s*=\s*12\\\)/);
  });

  test('already-delimited math is not double-wrapped', () => {
    const out = normalizeLatex('Try \\(120 \\div 4\\) first.');
    expect(out).toBe('Try \\(120 \\div 4\\) first.');
  });
});

describe('"work through it together" is now a banned transition', () => {
  test('the screenshot closing sentence drops whole, purpose clause included', () => {
    const { text, changed } = stripCannedTransitions(
      "Great thinking on the setup! Let's work through it together to ensure we understand each step clearly!",
      'Jason'
    );
    expect(changed).toBe(true);
    expect(text).toBe('Great thinking on the setup!');
  });

  test('"tackle that" and "break it down" variants match too', () => {
    expect(stripCannedTransitions("Let's tackle that together. What is 6 times 7?", null).text)
      .toBe('What is 6 times 7?');
    expect(stripCannedTransitions("Let's break it down. What is the first factor?", null).text)
      .toBe('What is the first factor?');
  });
});
