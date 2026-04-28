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
  STRICT_SCORE_THRESHOLD,
  getRetentionDays,
  DEFAULT_UPLOAD_RETENTION_DAYS
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

describe('getRetentionDays', () => {
  const original = process.env.UPLOAD_RETENTION_DAYS;
  afterEach(() => {
    if (original === undefined) delete process.env.UPLOAD_RETENTION_DAYS;
    else process.env.UPLOAD_RETENTION_DAYS = original;
  });

  test('returns the default when env var unset', () => {
    delete process.env.UPLOAD_RETENTION_DAYS;
    expect(getRetentionDays()).toBe(DEFAULT_UPLOAD_RETENTION_DAYS);
    expect(DEFAULT_UPLOAD_RETENTION_DAYS).toBe(30);
  });

  test('honors a valid env override', () => {
    process.env.UPLOAD_RETENTION_DAYS = '90';
    expect(getRetentionDays()).toBe(90);
  });

  test('falls back to default for invalid values', () => {
    process.env.UPLOAD_RETENTION_DAYS = 'forever';
    expect(getRetentionDays()).toBe(DEFAULT_UPLOAD_RETENTION_DAYS);
    process.env.UPLOAD_RETENTION_DAYS = '0';
    expect(getRetentionDays()).toBe(DEFAULT_UPLOAD_RETENTION_DAYS);
    process.env.UPLOAD_RETENTION_DAYS = '-5';
    expect(getRetentionDays()).toBe(DEFAULT_UPLOAD_RETENTION_DAYS);
  });
});
