/**
 * Regression tests for SPOKEN negatives from speech-to-text (Deepgram / Whisper).
 *
 * THE BUG: when a student says "negative six" for a correct answer of -6, STT
 * transcribes the WORDS ("negative 6" / "negative six"), not "-6". The main pipeline
 * only understood digits, so:
 *   - verifyAnswer("negative 6", -6) returned FALSE → a correct answer graded wrong.
 *   - observe("negative 6") classified it as general_math with answer=null → the
 *     answer wasn't even recognized as an attempt.
 * This is the same trust-killing failure as a dropped Unicode minus, on the voice
 * surface. (The worded-negative logic already existed in the voice ORCHESTRATOR's
 * answerEvaluator, but the main observe→diagnose→verifyAnswer path never got it.)
 *
 * THE FIX: a shared normalizeSpokenNumbers() converts a LEADING unary sign word
 * (negative / neg / minus) and standalone spoken number words to signed digits,
 * applied in verifyAnswer and in observe's answer extraction. Binary "5 minus 6"
 * (subtraction, not a sign) is deliberately left untouched.
 */
const { verifyAnswer } = require('../../utils/mathSolver');
const { normalizeSpokenNumbers } = require('../../utils/mathUnicodeNormalizer');
const { observe } = require('../../utils/pipeline/observe');

const ctx = { recentUserMessages: [], recentAssistantMessages: [], hasRecentUpload: false };

describe('normalizeSpokenNumbers — leading sign words + number words → signed digits', () => {
  it.each([
    ['negative six', '-6'],
    ['negative 6', '-6'],
    ['minus six', '-6'],
    ['minus 6', '-6'],
    ['neg 6', '-6'],
    ['twenty', '20'],
    ['seven', '7'],
    ['-6', '-6'],       // already normalized
    ['6', '6'],
  ])('normalizes %j → %j', (input, expected) => {
    expect(normalizeSpokenNumbers(input)).toBe(expected);
  });

  it('leaves a binary "minus" (subtraction, not a sign) untouched', () => {
    expect(normalizeSpokenNumbers('5 minus 6')).toBe('5 minus 6');
  });
});

describe('verifyAnswer accepts a spoken negative against the correct value', () => {
  it.each(['negative 6', 'negative six', 'minus 6', 'minus six', 'neg 6', '-6'])(
    'accepts %j as -6',
    (spoken) => {
      expect(verifyAnswer(spoken, -6).isCorrect).toBe(true);
    }
  );

  it('accepts a spoken positive word ("six" = 6)', () => {
    expect(verifyAnswer('six', 6).isCorrect).toBe(true);
  });

  it('still rejects a genuinely wrong spoken answer', () => {
    expect(verifyAnswer('negative 6', 6).isCorrect).toBe(false);   // wrong sign
    expect(verifyAnswer('6', -6).isCorrect).toBe(false);           // wrong sign
    expect(verifyAnswer('negative seven', -6).isCorrect).toBe(false); // wrong value
  });
});

describe('observe recognizes a spoken negative as an answer attempt', () => {
  it.each([
    ['negative 6', '-6'],
    ['negative six', '-6'],
    ['minus 6', '-6'],
    ['neg 6', '-6'],
    ['-6', '-6'],
    ['twenty', '20'],
  ])('observe(%j) → answer_attempt value %j', (msg, value) => {
    const o = observe(msg, ctx);
    expect(o.messageType).toBe('answer_attempt');
    expect(o.answer && o.answer.value).toBe(value);
  });

  it('does NOT hijack non-answers or binary subtraction as a number answer', () => {
    for (const m of ['5 minus 6', 'one sec', 'no']) {
      const o = observe(m, ctx);
      expect(o.answer && o.answer.value).toBeFalsy();
    }
  });
});
