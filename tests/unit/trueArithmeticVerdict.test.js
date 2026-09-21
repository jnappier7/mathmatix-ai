// A student who states TRUE arithmetic must never be told they are wrong.
//
// Owner transcript, 2026-09-20 (ACT bootcamp, question 23 — a stock rising 25%
// then falling 20%). The tutor posed "0.8 × 1.25P — multiply those two numbers
// together". The student answered "1", then "0.8(1.25)=1", then "still 1". All
// three are correct. All three drew doubt:
//
//   "Hmm, it looks like we might have missed a step there!"
//   "It looks like there might be some confusion with that calculation."
//   "Let's break it down a bit more... 0.8 is 10/8 or 5/4."      ← and false
//   "That's close, but let's check the multiplication step again."
//
// Nothing in the pipeline had produced a verdict on any of the three turns, so
// every language guard in verify.js was disarmed and the model's own arithmetic
// — unreliable on gpt-4o-mini — was the only thing in the room. Three separate
// holes let that happen; each is pinned below, and the verdict → action chain
// each one feeds is pinned at the bottom.
//
// Every tier added here is AFFIRM-ONLY: it can rescue a correct student from an
// undecided turn, and can never manufacture a rejection.

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

const {
  detectPosedArithmetic,
  bareNumericAnswer,
  trueArithmeticStatement,
} = require('../../utils/pipeline/symbolicVerifier');
const { observe } = require('../../utils/pipeline/observe');
const { diagnose } = require('../../utils/pipeline/diagnose');
const { decide } = require('../../utils/pipeline/decide');

// The three tutor turns, verbatim in shape (LaTeX delimiters and all — the
// system prompt mandates LaTeX, so this is how the math actually arrives).
const POSED_WITH_VARIABLE =
  'Great start! So we have \\(0.8 \\times 1.25P\\). Now, can you show me how you '
  + 'would multiply those two numbers together? What do you think the final '
  + 'expression for the price after the decrease would be?';
const POSED_PLAIN =
  'It looks like there might be some confusion with that calculation. To multiply '
  + '\\(0.8\\) by \\(1.25\\): start with \\(1.25\\) and multiply it by \\(0.8\\): '
  + '\\(1.25 \\times 0.8 = ?\\) What do you get when you calculate that?';

describe('detectPosedArithmetic — a variable glued to the last number', () => {
  test('the strict scan still refuses the candidate (unchanged)', () => {
    expect(detectPosedArithmetic(POSED_WITH_VARIABLE)).toBeNull();
  });

  test('allowTrailingVariable recovers the coefficient product', () => {
    expect(detectPosedArithmetic(POSED_WITH_VARIABLE, { allowTrailingVariable: true }))
      .toBe('0.8*1.25');
  });

  test('still refuses to end mid-number', () => {
    // The relaxed lookahead drops \w but keeps digits and the decimal point, so
    // a candidate can never stop at "1.2" inside "1.25".
    const loose = detectPosedArithmetic('compute 0.8 * 1.25P', { allowTrailingVariable: true });
    expect(loose).toBe('0.8*1.25');
  });

  test('the relaxed read of algebra is why it is affirm-only at the call site', () => {
    // "2 + 3x" is not a posed computation, and the relaxed scan cannot tell.
    // Harmless because a mismatch is never allowed to become a rejection —
    // asserted directly in the pipeline tests below.
    expect(detectPosedArithmetic('what is 2 + 3x?', { allowTrailingVariable: true })).toBe('2+3');
    expect(detectPosedArithmetic('what is 2 + 3x?')).toBeNull();
  });
});

describe('bareNumericAnswer — a re-asserted answer', () => {
  test('reads a number through a short lead-in', () => {
    expect(bareNumericAnswer('still 1')).toBe('1');
    expect(bareNumericAnswer('I got 1')).toBe('1');
    expect(bareNumericAnswer("it's 1")).toBe('1');
    expect(bareNumericAnswer('the answer is 12')).toBe('12');
  });

  test('does not invent a number out of prose', () => {
    expect(bareNumericAnswer('no')).toBeNull();
    expect(bareNumericAnswer('x^2')).toBeNull();
    expect(bareNumericAnswer('50*3=150')).toBeNull();
  });

  test('keeps reading a trailing unit as one number', () => {
    expect(bareNumericAnswer('72 cm^3')).toBe('72');
  });
});

describe('trueArithmeticStatement — a closed claim the student wrote out', () => {
  test('accepts a true claim, including implicit multiplication', () => {
    expect(trueArithmeticStatement('0.8(1.25)=1')).toBe('1');
    expect(trueArithmeticStatement('0.8 * 1.25 = 1')).toBe('1');
    expect(trueArithmeticStatement('1.25 x 0.8 = 1')).toBe('1');
    expect(trueArithmeticStatement('1.25 times 0.8 is 1')).toBe('1');
    expect(trueArithmeticStatement('so 6/2 = 3')).toBe('3');
    expect(trueArithmeticStatement('10 divided by 2 is 5')).toBe('5');
  });

  test('a FALSE claim yields no verdict — never a rejection', () => {
    expect(trueArithmeticStatement('2+3=6')).toBeNull();
    // The tutor's own hallucination from the transcript. Not affirmable either.
    expect(trueArithmeticStatement('0.8 is 10/8')).toBeNull();
  });

  test('refuses anything that is not a closed numeric claim', () => {
    expect(trueArithmeticStatement('x + 2 = 7')).toBeNull();     // algebra
    expect(trueArithmeticStatement('1 = 1')).toBeNull();          // computes nothing
    expect(trueArithmeticStatement('12')).toBeNull();             // no claim
    expect(trueArithmeticStatement('still 1')).toBeNull();        // no claim
    expect(trueArithmeticStatement('1+1=2 but I am not sure about the rest')).toBeNull();
  });
});

describe('the transcript, end to end', () => {
  const run = async (studentMessage, lastTutorTurn) => {
    const ctx = { recentAssistantMessages: [{ role: 'assistant', content: lastTutorTurn }] };
    const observation = await observe(studentMessage, ctx);
    const diagnosis = await diagnose(observation, ctx);
    const decision = await decide(observation, diagnosis, {
      ...ctx,
      conversation: { messages: [{ role: 'assistant', content: lastTutorTurn }] },
    });
    return { observation, diagnosis, decision };
  };

  test('"1" against a coefficient product is verified correct', async () => {
    const { diagnosis, decision } = await run('1', POSED_WITH_VARIABLE);
    expect(diagnosis.isCorrect).toBe(true);
    expect(diagnosis.verificationSource).toBe('symbolic:arithmetic_coefficient');
    expect(decision.action).toBe('confirm_correct');
  });

  test('"0.8(1.25)=1" is verified correct on its own terms', async () => {
    const { diagnosis, decision } = await run('0.8(1.25)=1', POSED_PLAIN);
    expect(diagnosis.isCorrect).toBe(true);
    expect(diagnosis.verificationSource).toBe('symbolic:arithmetic_statement');
    // A step, not a final answer — nothing to reveal.
    expect(diagnosis.correctAnswer).toBeNull();
    expect(decision.action).toBe('confirm_correct');
  });

  test('"still 1" — the re-assertion after being doubted — is verified correct', async () => {
    const { diagnosis, decision } = await run('still 1', POSED_PLAIN);
    expect(diagnosis.isCorrect).toBe(true);
    expect(diagnosis.verificationSource).toBe('symbolic:arithmetic_restated');
    expect(decision.action).toBe('confirm_correct');
  });

  test('a WRONG answer to the same posed step is not affirmed', async () => {
    const { diagnosis } = await run('2', POSED_WITH_VARIABLE);
    expect(diagnosis.isCorrect).not.toBe(true);
  });

  test('a relaxed read of algebra cannot reject a student', async () => {
    // "2 + 3x" yields the bogus candidate "2+3" under the relaxed scan. The
    // student answering 14 (the value at x = 4) must come back undecided — NOT
    // wrong — because the affirm-only gate refuses to turn a mismatch into a
    // verdict.
    const { diagnosis } = await run('14', 'If x = 4, what is 2 + 3x?');
    expect(diagnosis.isCorrect).not.toBe(false);
  });
});

describe('verify.js still recognises the doubt these turns drew', () => {
  const { leadsWithDoubtOnCorrect } = require('../../utils/pipeline/verify');

  test.each([
    'Hmm, it looks like we might have missed a step there! When you multiply 0.8 by 1.25...',
    "It looks like there might be some confusion with that calculation. Let's work through it.",
    "Let's break it down a bit more. When multiplying decimals, you can think of it like this:",
    "I see you used a calculator and got 1. That's close, but let's check the multiplication again.",
  ])('doubt is detected: %s', (reply) => {
    // With a verdict now in hand and the action CONFIRM_CORRECT, §2d regenerates
    // each of these instead of shipping it.
    expect(leadsWithDoubtOnCorrect(reply)).toBe(true);
  });

  test('a genuine affirmation is left alone', () => {
    expect(leadsWithDoubtOnCorrect('Exactly! You got it — the price ends up the same.')).toBe(false);
  });
});
