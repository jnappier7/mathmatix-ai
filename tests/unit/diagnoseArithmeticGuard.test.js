// Unit tests for diagnose.js `arithmeticMatchesAnswer` — the guard that decides
// whether a self-contained arithmetic result may override a solver "wrong"
// verdict. It exists to stop an INCIDENTAL true calculation buried in a longer
// explanation ("...and 4×2 is 8...") from flipping a genuinely wrong final
// answer to "correct". Mis-grading here mis-teaches students, so it's part of
// the critical-path coverage ratchet.

const {
  arithmeticMatchesAnswer,
  extractBareExpression,
  resolveProblemExpression,
} = require('../../utils/pipeline/diagnose');

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

// The two helpers below feed the "student rewrote the problem" verification path
// (a checkable submission that isn't a plain answer). Mis-reading one costs a
// verdict or, worse, affirms work the student never did — so they're part of the
// critical-path coverage ratchet.
describe('extractBareExpression', () => {
  test('accepts a whole-message arithmetic rewrite', () => {
    expect(extractBareExpression('24-3+3')).toBe('24-3+3');
    expect(extractBareExpression('2x+1')).toBe('2x+1'); // single-letter variable ok
  });

  test('normalizes unicode math operators to ASCII', () => {
    expect(extractBareExpression('24 − 6 ÷ 2')).toBe('24 - 6 / 2');
  });

  test('strips trailing sentence punctuation', () => {
    expect(extractBareExpression('24-3+3.')).toBe('24-3+3');
  });

  test('rejects a bare number (an answer, not a rewrite)', () => {
    expect(extractBareExpression('5')).toBeNull();
  });

  test('rejects prose, even with an incidental number or a word', () => {
    expect(extractBareExpression('so it is')).toBeNull(); // no digit
    expect(extractBareExpression('cat+5')).toBeNull();    // a 2+ letter run is a word
  });

  test('returns null for empty / non-string input', () => {
    expect(extractBareExpression('')).toBeNull();
    expect(extractBareExpression(null)).toBeNull();
    expect(extractBareExpression(42)).toBeNull();
  });
});

describe('resolveProblemExpression', () => {
  test('prefers the pinned board problem', () => {
    expect(resolveProblemExpression({ pinnedProblemTex: '24-6/2+3' })).toBe('24-6/2+3');
    expect(resolveProblemExpression({
      pinnedProblemTex: '7*8',
      recentAssistantMessages: [{ content: '12+1' }],
    })).toBe('7*8');
  });

  test('strips trailing punctuation swept up by the scan', () => {
    expect(resolveProblemExpression({ pinnedProblemTex: '24-6/2+3.' })).toBe('24-6/2+3');
  });

  test('skips equations (not value-equivalent to a solving step)', () => {
    expect(resolveProblemExpression({ pinnedProblemTex: '2x+3=13' })).toBeNull();
  });

  test('recovers a posed expression from the tutor\'s prose, longest match first', () => {
    expect(resolveProblemExpression({
      recentAssistantMessages: [{ content: 'the 6/2 part of 24-6/2+3' }],
    })).toBe('24-6/2+3');
  });

  test('returns null when nothing math-like is present', () => {
    expect(resolveProblemExpression({})).toBeNull();
    expect(resolveProblemExpression({ recentAssistantMessages: [{ content: 'Great work!' }] })).toBeNull();
    expect(resolveProblemExpression({ recentAssistantMessages: [{ content: null }] })).toBeNull();
  });
});
