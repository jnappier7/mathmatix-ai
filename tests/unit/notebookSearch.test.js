/**
 * Notebook search clause (routes/notebook.js, spec §15).
 *
 * Student-typed queries become escaped regexes over their own cards —
 * regex metacharacters must be literals, and an empty query means no clause.
 */
const router = require('../../routes/notebook');
const { escapeRegex, buildSearchClause } = router.__helpers;

describe('escapeRegex', () => {
  test('regex metacharacters become literals', () => {
    expect(new RegExp(escapeRegex('2x+5=13 (step?)'), 'i').test('does 2x+5=13 (step?) work')).toBe(true);
    expect(escapeRegex('a.b*c')).toBe('a\\.b\\*c');
  });
});

describe('buildSearchClause', () => {
  test('empty / whitespace queries produce no clause', () => {
    expect(buildSearchClause('')).toBeNull();
    expect(buildSearchClause('   ')).toBeNull();
    expect(buildSearchClause(null)).toBeNull();
  });

  test('a real query ORs across the student-visible fields', () => {
    const clause = buildSearchClause('negative sign');
    const fields = clause.$or.map(o => Object.keys(o)[0]);
    expect(fields).toEqual(['title', 'body', 'quote', 'skillId', 'problemTex']);
    expect(clause.$or[0].title.test('Watch for This: losing a NEGATIVE SIGN')).toBe(true);
  });

  test('queries cap at 120 chars (no regex DoS via huge input)', () => {
    const clause = buildSearchClause('x'.repeat(500));
    expect(clause.$or[0].title.source.length).toBeLessThanOrEqual(120);
  });
});
