/**
 * REPRODUCTION — a wrong answer confirmed as correct.
 *
 * Production incident (logs 2026-07-21T03:29):
 *   Student photographs homework:  x/5 + 6 = 10, and writes x = 4/5
 *   (the classic inverse-operation slip: from x/5 = 4 they divided by 5
 *   instead of multiplying, so the real answer is 20).
 *
 *   03:29:36  Diagnose: incorrect (answer: 4/5, correct: 20)   <- right call
 *   03:29:59  Diagnose: correct   (answer: 0.8, correct: 0.8)  <- WRONG
 *   03:30:00  LLMVerify: incorrect (confidence 0.98, modelAnswer: 20)
 *
 * 0.8 IS 4/5 — the same wrong answer restated as a decimal — and the tutor
 * congratulated the student for it, cementing the misconception. The LLM
 * verifier knew the answer was 20 and said so at 0.98 confidence, ~750ms after
 * the decision had already committed.
 *
 * Mechanism: the recent-assistant-message scan in diagnose() takes the LAST
 * message that parses as a solvable problem. While discussing the student's
 * wrong answer the tutor wrote arithmetic containing 4/5, that parsed to 0.8,
 * and it became `problemInfo.correctAnswer` — so the student was graded against
 * an intermediate the tutor had just written rather than against their own
 * problem. diagnose.js:166 documents this exact failure mode ("can latch onto an
 * INTERMEDIATE the tutor wrote"), but the guard built for it is gated to
 * multi-root root-set answers and does not cover a single-value answer.
 */

const { diagnose } = require('../../utils/pipeline/diagnose');

const answerAttempt = (raw, value) => ({
  type: 'answer_attempt',
  raw,
  answer: { value, confidence: 1 }
});

// The tutor walking through the student's incorrect work — note it contains
// the incidental arithmetic "4/5 = 0.8".
const TUTOR_DISCUSSING_THE_SLIP = {
  role: 'assistant',
  content: "Let's look at your last step. You had x/5 = 4, and then you wrote 4/5 = 0.8. What operation undoes dividing by 5?"
};

const TUTOR_POSED_THE_PROBLEM = {
  role: 'assistant',
  content: 'Solve x/5 + 6 = 10'
};

describe('the pinned problem must outrank an intermediate the tutor wrote', () => {
  test('the first turn correctly rejects 4/5', async () => {
    const result = await diagnose(answerAttempt('x = 4/5', '4/5'), {
      recentAssistantMessages: [TUTOR_POSED_THE_PROBLEM],
      pinnedProblemTex: 'x/5 + 6 = 10'
    });
    expect(result.isCorrect).toBe(false);
  });

  test('restating the same wrong answer as a decimal is still wrong', async () => {
    // THE BUG. 0.8 === 4/5, and the real answer is 20.
    const result = await diagnose(answerAttempt('0.8', '0.8'), {
      recentAssistantMessages: [TUTOR_POSED_THE_PROBLEM, TUTOR_DISCUSSING_THE_SLIP],
      pinnedProblemTex: 'x/5 + 6 = 10'
    });
    expect(result.isCorrect).not.toBe(true);
  });

  test('the expected answer is never manufactured from the student answer', async () => {
    // "correct: 0.8" for a student who answered 0.8 means they were graded
    // against themselves — a verdict that can only ever say "correct".
    const result = await diagnose(answerAttempt('0.8', '0.8'), {
      recentAssistantMessages: [TUTOR_POSED_THE_PROBLEM, TUTOR_DISCUSSING_THE_SLIP],
      pinnedProblemTex: 'x/5 + 6 = 10'
    });
    if (result.isCorrect === true) {
      expect(String(result.correctAnswer)).not.toBe('0.8');
    }
  });

  test('a genuinely posed sub-question is still verified', async () => {
    // The guard must reject QUOTED arithmetic without breaking arithmetic the
    // tutor actually asks for. Multiplication is the case that matters: an
    // earlier version of the guard built a RegExp out of the expression and
    // threw "Nothing to repeat" on the `*`.
    const { detectPosedArithmetic } = require('../../utils/pipeline/symbolicVerifier');
    expect(detectPosedArithmetic('What is 50 * 3?')).toBe('50*3');
    expect(detectPosedArithmetic('Compute 8 * 7')).toBe('8*7');
    expect(detectPosedArithmetic('then you wrote 4/5 = 0.8')).toBeNull();
  });

  test('the genuinely correct answer is still accepted', async () => {
    // The fix must not make the tutor reject 20.
    const result = await diagnose(answerAttempt('x = 20', '20'), {
      recentAssistantMessages: [TUTOR_POSED_THE_PROBLEM, TUTOR_DISCUSSING_THE_SLIP],
      pinnedProblemTex: 'x/5 + 6 = 10'
    });
    expect(result.isCorrect).toBe(true);
  });
});
