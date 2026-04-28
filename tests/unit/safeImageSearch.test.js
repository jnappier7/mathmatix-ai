// tests/unit/safeImageSearch.test.js
// Unit tests for utils/safeImageSearch.js (COPPA-critical query sanitization)

const {
  sanitizeQuery,
  isValidCategory,
  getStaticConceptImage,
  ALLOWED_DOMAINS,
  VALID_CATEGORIES
} = require('../../utils/safeImageSearch');

describe('sanitizeQuery', () => {
  test('returns safe:false for empty/non-string input', () => {
    expect(sanitizeQuery('').safe).toBe(false);
    expect(sanitizeQuery(null).safe).toBe(false);
    expect(sanitizeQuery(undefined).safe).toBe(false);
    expect(sanitizeQuery(123).safe).toBe(false);
  });

  test('blocks queries with violence keywords', () => {
    const r = sanitizeQuery('how to make a weapon');
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/Blocked/);
  });

  test('blocks queries with sexual content keywords', () => {
    expect(sanitizeQuery('nude photos').safe).toBe(false);
  });

  test('blocks queries with drug keywords', () => {
    expect(sanitizeQuery('cocaine math problem').safe).toBe(false);
    expect(sanitizeQuery('how to make alcohol').safe).toBe(false);
  });

  test('blocks queries with profanity', () => {
    expect(sanitizeQuery('shit happens').safe).toBe(false);
  });

  test('blocks queries with self-harm keywords', () => {
    expect(sanitizeQuery('suicide hotline number').safe).toBe(false);
  });

  test('blocks queries that contain SSN/email/phone PII patterns', () => {
    expect(sanitizeQuery('my SSN is 123-45-6789').safe).toBe(false);
    expect(sanitizeQuery('email me at jane@example.com').safe).toBe(false);
    expect(sanitizeQuery('call 555-123-4567').safe).toBe(false);
  });

  test('strips full-name patterns from clean queries', () => {
    const r = sanitizeQuery('John Smith Pythagorean');
    expect(r.safe).toBe(true);
    expect(r.sanitized).not.toMatch(/John\s+Smith/);
  });

  test('truncates queries longer than 100 chars', () => {
    const r = sanitizeQuery('a'.repeat(200));
    // After truncation it lacks "math" keyword and gets prefixed → length ~ 105
    expect(r.sanitized.length).toBeLessThanOrEqual(110);
  });

  test('prepends "math" when query lacks any educational keyword', () => {
    const r = sanitizeQuery('triangle');
    expect(r.sanitized.startsWith('math')).toBe(true);
  });

  test('does not duplicate "math" prefix when already present', () => {
    const r = sanitizeQuery('math triangle');
    expect((r.sanitized.match(/math/g) || []).length).toBe(1);
  });

  test('preserves clean educational queries', () => {
    const r = sanitizeQuery('quadratic formula diagram');
    expect(r.safe).toBe(true);
    expect(r.sanitized).toContain('diagram');
  });
});

describe('isValidCategory', () => {
  test('returns true when category is empty/null (optional)', () => {
    expect(isValidCategory(null)).toBe(true);
    expect(isValidCategory('')).toBe(true);
    expect(isValidCategory(undefined)).toBe(true);
  });

  test.each(['geometry', 'algebra', 'fractions', 'word_problems', 'integers'])(
    'accepts valid educational category: %s',
    (cat) => expect(isValidCategory(cat)).toBe(true)
  );

  test('accepts categories with spaces converted to underscores', () => {
    expect(isValidCategory('word problems')).toBe(true);
  });

  test('rejects categories outside the allow-list', () => {
    expect(isValidCategory('weapons')).toBe(false);
    expect(isValidCategory('history')).toBe(false);
    expect(isValidCategory('chemistry')).toBe(false);
  });

  test('exports a non-empty VALID_CATEGORIES list', () => {
    expect(VALID_CATEGORIES.length).toBeGreaterThan(10);
  });
});

describe('getStaticConceptImage', () => {
  test('matches concepts case-insensitively', () => {
    expect(getStaticConceptImage('Pythagorean Theorem')).toMatchObject({
      url: expect.stringContaining('pythagorean'),
      source: 'Mathmatix'
    });
  });

  test('matches partial keywords (slope, factoring, etc.)', () => {
    expect(getStaticConceptImage('slope-intercept form')).not.toBeNull();
    expect(getStaticConceptImage('factoring quadratics')).not.toBeNull();
  });

  test('returns null when no concept matches', () => {
    expect(getStaticConceptImage('some unrelated topic')).toBeNull();
  });

  test('handles empty/null input', () => {
    expect(getStaticConceptImage('')).toBeNull();
    expect(getStaticConceptImage(null)).toBeNull();
  });
});

describe('ALLOWED_DOMAINS', () => {
  test('includes well-known education sites', () => {
    expect(ALLOWED_DOMAINS).toEqual(expect.arrayContaining([
      'khanacademy.org', 'desmos.com', 'wikipedia.org'
    ]));
  });

  test('does not include non-educational/social domains', () => {
    expect(ALLOWED_DOMAINS).not.toContain('facebook.com');
    expect(ALLOWED_DOMAINS).not.toContain('youtube.com');
    expect(ALLOWED_DOMAINS).not.toContain('twitter.com');
  });
});
