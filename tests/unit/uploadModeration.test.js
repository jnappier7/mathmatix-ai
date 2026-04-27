/**
 * Upload moderation policy — isStrictlyFlagged
 *
 * The middleware is stricter than OpenAI's default `flagged` boolean for K-12
 * safety: any STRICT_CATEGORIES hit (or score above threshold) blocks the
 * upload, even when OpenAI says the content overall isn't flagged.
 */

const {
  isStrictlyFlagged,
  STRICT_CATEGORIES,
  STRICT_SCORE_THRESHOLD
} = require('../../middleware/uploadSecurity');

describe('isStrictlyFlagged', () => {
  test('passes clean content', () => {
    expect(isStrictlyFlagged({
      flagged: false,
      categories: { sexual: false, violence: false },
      scores: { sexual: 0.01, violence: 0.02 }
    })).toBe(false);
  });

  test('blocks when OpenAI top-level flagged is true', () => {
    expect(isStrictlyFlagged({
      flagged: true,
      categories: {},
      scores: {}
    })).toBe(true);
  });

  test('blocks when a strict category boolean is true even if overall not flagged', () => {
    expect(isStrictlyFlagged({
      flagged: false,
      categories: { sexual: true },
      scores: {}
    })).toBe(true);
  });

  test('blocks when a strict category score crosses the threshold', () => {
    expect(isStrictlyFlagged({
      flagged: false,
      categories: { violence: false, 'violence/graphic': false },
      scores: { 'violence/graphic': STRICT_SCORE_THRESHOLD + 0.01 }
    })).toBe(true);
  });

  test('does not block when scores stay under threshold', () => {
    expect(isStrictlyFlagged({
      flagged: false,
      categories: {},
      scores: { 'violence/graphic': STRICT_SCORE_THRESHOLD - 0.01 }
    })).toBe(false);
  });

  test('STRICT_CATEGORIES covers minor-protection categories', () => {
    expect(STRICT_CATEGORIES).toEqual(expect.arrayContaining(['sexual', 'sexual/minors']));
  });
});
