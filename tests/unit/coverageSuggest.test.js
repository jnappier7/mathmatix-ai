/**
 * The coverage audit's --suggest matcher: separates naming mismatches (course
 * skill id ≈ existing bank skill) from true content gaps, so the fix is a
 * canonicalizer alias instead of generating duplicate problems.
 */
const { tokens, similarity, suggestFor } = require('../../scripts/auditCourseProblemCoverage');

const bankEntry = (skillId, count, displayName) => ({
  skillId, count, displayName,
  idTokens: tokens(skillId), nameTokens: tokens(displayName),
});

const BANK = [
  bankEntry('linear-equations-two-step', 40, 'Two-Step Linear Equations'),
  bankEntry('solving-systems-substitution', 12, 'Systems of Equations: Substitution'),
  bankEntry('quadratic-factoring', 25, 'Factoring Quadratics'),
  bankEntry('act-statistics-probability', 60, 'Statistics & Probability'),
];

describe('suggestFor — naming mismatches surface, true gaps stay empty', () => {
  test('reworded ids find their bank twin at the top', () => {
    const m = suggestFor('solving-two-step-equations', BANK);
    expect(m[0].skillId).toBe('linear-equations-two-step');
  });

  test('noise words (intro/basics/review) do not block a match', () => {
    const m = suggestFor('factoring-quadratics-intro', BANK);
    expect(m[0].skillId).toBe('quadratic-factoring');
  });

  test('a genuinely missing topic returns no candidates', () => {
    expect(suggestFor('limits-intuitive', BANK)).toEqual([]);
    expect(suggestFor('series-sigma-notation', BANK)).toEqual([]);
  });

  test('display names count as match surface, not just ids', () => {
    const m = suggestFor('systems-of-equations', BANK);
    expect(m.some((x) => x.skillId === 'solving-systems-substitution')).toBe(true);
  });
});

describe('similarity mechanics', () => {
  test('subset relationships get the bonus', () => {
    const a = tokens('two-step-equations');
    const b = tokens('linear-equations-two-step');
    expect(similarity(a, b)).toBeGreaterThan(similarity(a, tokens('quadratic-factoring')));
  });
  test('empty token sets never match', () => {
    expect(similarity(tokens(''), tokens('anything'))).toBe(0);
  });
});
