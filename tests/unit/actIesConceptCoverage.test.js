/**
 * IES has to cover the concept areas ACT says IES covers.
 *
 * "Preparing for the ACT" ((c) 2026) names exactly five for Integrating
 * Essential Skills: rates and percentages; proportional relationships; area,
 * surface area and volume; average and median; and expressing numbers in
 * different ways.
 *
 * Our IES list covered three. "Average and median" and "expressing numbers in
 * different ways" had no skill and no items — while both official practice
 * forms score items on precisely those as IES (a "mean of 4 numbers is 45,
 * find the fourth" item, and a "where does a square root land on a number line
 * cut into equal segments" item). A student could work every IES question we
 * could generate and never meet two fifths of the category.
 *
 * This pins the mapping so a future skill rename or bank prune cannot silently
 * reopen the gap.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const blueprint = read('seeds/act-math-blueprint.json');
const names = read('seeds/act-skill-names.json');
const iesBank = read('seeds/act-ies-expansion/ies-items.generated.json');
const iesSkills = blueprint.skillsByCategory['integrating-essential-skills'];

// ACT's five named IES concept areas -> the skill(s) that carry each.
const ACT_CONCEPT_AREAS = {
  'rates and percentages': ['act-percentages', 'act-rates-unit-conversion'],
  'proportional relationships': ['act-ratios-proportions'],
  'area, surface area, and volume': ['act-basic-geometry-measures'],
  'average and median': ['act-average-median'],
  'expressing numbers in different ways': ['act-number-forms'],
};

describe('every IES concept area ACT names has a skill behind it', () => {
  Object.entries(ACT_CONCEPT_AREAS).forEach(([area, skills]) => {
    test(`"${area}" is in the IES skill list`, () => {
      skills.forEach((s) => expect(iesSkills).toContain(s));
    });
  });

  test('the two areas that were missing are the ones that got added', () => {
    expect(iesSkills).toContain('act-average-median');
    expect(iesSkills).toContain('act-number-forms');
  });

  test('every IES skill has a student-readable name for the review rail', () => {
    // The review list groups by skill and heads each group with this name;
    // without one it falls back to the category, which for IES reads
    // "Essential Skills" on every group — useless as a label.
    iesSkills.forEach((s) => {
      expect(typeof names[s]).toBe('string');
      expect(names[s].length).toBeGreaterThan(0);
    });
  });
});

describe('the new skills are actually stocked', () => {
  const bySkill = {};
  iesBank.forEach((p) => { (bySkill[p.skillId] = bySkill[p.skillId] || []).push(p); });

  ['act-average-median', 'act-number-forms'].forEach((skill) => {
    describe(skill, () => {
      const items = bySkill[skill] || [];

      test('has items', () => {
        expect(items.length).toBeGreaterThanOrEqual(12);
      });

      test('spans easy to hard, so the difficulty ramp can place them', () => {
        // assembleForm draws against a target difficulty per slot; a bank
        // clustered at one level leaves the rest of the ramp unfillable.
        const ds = new Set(items.map((i) => i.difficulty));
        expect(Math.min(...ds)).toBeLessThanOrEqual(2);
        expect(Math.max(...ds)).toBeGreaterThanOrEqual(4);
        expect(ds.size).toBeGreaterThanOrEqual(3);
      });

      test('every item is well formed and its key is real', () => {
        items.forEach((p) => {
          expect(p.options).toHaveLength(4);                      // ACT math is 4-choice
          expect(new Set(p.options.map((o) => o.text)).size).toBe(4);
          const key = p.options.find((o) => o.label === p.correctOption);
          expect(key).toBeTruthy();
          expect(key.text).toBe(p.answer.value);                  // key text === answer.value
          expect(p.isActive).toBe(true);
          expect(p.skillId).toBe(skill);
        });
      });

      test('every item explains itself — the review flow reads this aloud', () => {
        items.forEach((p) => {
          expect(p.explanation.length).toBeGreaterThan(80);
          // A good ACT explanation names what a wrong choice rewards, not just
          // the right answer. Every one of these cites at least one distractor.
          expect(p.explanation).toMatch(/choice|comes from|instead of|stops at|assumes/i);
        });
      });
    });
  });

  test('problemIds are unique across the whole IES bank', () => {
    const ids = iesBank.map((p) => p.problemId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
