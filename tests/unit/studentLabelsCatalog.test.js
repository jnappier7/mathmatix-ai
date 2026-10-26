// A skill id from a legacy kebab catalog with no unified crosswalk used to reach
// the student as its storage key prettified, prefix and all — "Emf Divide Word
// Problems" on a review nudge (owner session, 2026-10-25). Each seeds/skills-*.json
// carries the real displayName; studentLabel reads them, unified labels winning.

const { studentLabel, _reset } = require('../../utils/studentLabels');

describe('studentLabel — legacy catalog displayNames', () => {
  beforeEach(() => _reset());

  it('uses the seed displayName for a prefixed legacy id', () => {
    expect(studentLabel('emf-divide-word-problems')).toBe('Division Word Problems');
    expect(studentLabel('g6-place-value-decimals')).toBe('Place Value & Decimals');
  });

  it('never shows the catalog prefix', () => {
    expect(studentLabel('emf-divide-word-problems')).not.toMatch(/\bemf\b/i);
  });

  it('unified labels still win', () => {
    expect(studentLabel('MS_QNT_8')).toBe('Math with negatives and fractions');
  });

  it('falls back to prettifying an unknown id', () => {
    expect(studentLabel('not-a-skill-id')).toBe('Not A Skill Id');
  });
});
