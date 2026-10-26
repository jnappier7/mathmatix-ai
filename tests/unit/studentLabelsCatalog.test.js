// A skill id from a legacy kebab catalog with no unified crosswalk used to reach
// the student as its storage key prettified, prefix and all — "Emf Divide Word
// Problems" on a review nudge (owner session, 2026-10-25). Each seeds/skills-*.json
// carries the real displayName; studentLabel reads them, unified labels winning.

const { studentLabel, _reset } = require('../../utils/studentLabels');

describe('studentLabel — legacy catalog displayNames', () => {
  beforeEach(() => _reset());

  // Exact wording is owned by seeds/unified-taxonomy/student-labels.json (a
  // student-voice label may override the seed's displayName); what this pins
  // is that the key never reaches the student.
  it('uses a catalog name for a prefixed legacy id, never the prettified key', () => {
    expect(studentLabel('emf-divide-word-problems')).not.toBe('Emf Divide Word Problems');
    expect(studentLabel('g6-place-value-decimals')).not.toBe('G6 Place Value Decimals');
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
