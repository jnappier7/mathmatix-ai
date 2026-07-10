// Unit tests for diagnose.js `arithmeticMatchesAnswer` — the guard that decides
// whether a self-contained arithmetic result may override a solver "wrong"
// verdict. It exists to stop an INCIDENTAL true calculation buried in a longer
// explanation ("...and 4×2 is 8...") from flipping a genuinely wrong final
// answer to "correct". Mis-grading here mis-teaches students, so it's part of
// the critical-path coverage ratchet.

const { arithmeticMatchesAnswer } = require('../../utils/pipeline/diagnose');

describe('arithmeticMatchesAnswer', () => {
  test('returns false when there is no arithmetic result', () => {
    expect(arithmeticMatchesAnswer(null, '5')).toBe(false);
    expect(arithmeticMatchesAnswer(undefined, '5')).toBe(false);
  });

  test('returns true when the arithmetic result IS the student answer', () => {
    expect(arithmeticMatchesAnswer(5, '5')).toBe(true);
    expect(arithmeticMatchesAnswer(5, 5)).toBe(true);      // numeric answer
    expect(arithmeticMatchesAnswer(5, ' 5 ')).toBe(true);  // trims whitespace
  });

  test('returns false when the true calculation is incidental (result ≠ answer)', () => {
    // The anti-mis-grade case: "13 - 8 is 5" is a true statement, but the
    // student's final answer was 8 — a wrong answer must NOT be flipped correct.
    expect(arithmeticMatchesAnswer(8, '5')).toBe(false);
  });

  test('respects the 0.001 tolerance band', () => {
    expect(arithmeticMatchesAnswer(5, '5.0005')).toBe(true);  // inside band
    expect(arithmeticMatchesAnswer(5, '5.01')).toBe(false);   // outside band
  });

  test('returns false for non-numeric / unparseable answers', () => {
    expect(arithmeticMatchesAnswer(5, 'x = 5')).toBe(false); // NaN → not finite
    expect(arithmeticMatchesAnswer(-2.3333, '-7/3')).toBe(false); // fractions aren't Number()-parseable
  });
});
