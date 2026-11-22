/**
 * A course's check must test the skill it names, at the course's level.
 *
 * The general crosswalk sent ~70 course skills to pools that do not test them
 * ("volume of a cylinder" → rectangular prisms, "ordering real numbers" →
 * "Order 14, 16, 6"). Those skills now have their own items
 * (scripts/buildCourseLevelItems.js) and the check draws on those ALONE
 * (utils/courseCheckSources.js). This file pins the three ways that can rot:
 * the committed seed files drifting from the templates, an override naming a
 * skill the course does not have, and the check quietly falling back to the
 * old pool.
 */
const fs = require('fs');
const path = require('path');

const { expand, validate, BANK_NAMES, SOURCE, PER_TIER } = require('../../scripts/buildCourseLevelItems');
const { checkSourcesFor, allCheckSources } = require('../../utils/courseCheckSources');
const { courseSkills } = require('../../utils/coursePreAssessment');
const { skillLookupCandidates } = require('../../utils/skillCanonicalizer');

const SEEDS = path.join(__dirname, '../../seeds');
const readSeed = (f) => JSON.parse(fs.readFileSync(path.join(SEEDS, f), 'utf8'));
const pathwayOf = (courseId) => JSON.parse(fs.readFileSync(
  path.join(__dirname, '../../public/resources', `${courseId}-pathway.json`), 'utf8'));

const banks = BANK_NAMES.map((n) => require(`../../scripts/lib/courseLevel${n}.js`));

describe('the committed seed files are what the templates build', () => {
  const built = banks.flatMap((b) => b.TEMPLATES.flatMap((t) => expand(t, b.GB)));

  test('course-level-items.generated.json is current (run npm run build:course-level)', () => {
    expect(readSeed('course-level-items.generated.json')).toEqual(JSON.parse(JSON.stringify(built)));
  });

  test('every item passes the builder\'s own gate — text-only, cleanly graded', () => {
    expect(validate(built)).toEqual([]);
  });

  test('every skill has three tiers of items, none below difficulty 2', () => {
    const bySkill = {};
    for (const it of built) (bySkill[it.skillId] = bySkill[it.skillId] || []).push(it);
    for (const [skill, items] of Object.entries(bySkill)) {
      expect({ skill, n: items.length }).toEqual({ skill, n: 3 * PER_TIER });
      expect({ skill, min: Math.min(...items.map((i) => i.difficulty)) }).toEqual({ skill, min: 2 });
      expect(items.every((i) => i.source === SOURCE)).toBe(true);
    }
  });

  test('the sources file names exactly the skills that have templates', () => {
    const expected = {};
    for (const b of banks) {
      for (const t of b.TEMPLATES) (expected[b.COURSE_ID] = expected[b.COURSE_ID] || {})[t.courseSkill] = [t.skillId];
    }
    expect(readSeed('course-level-sources.generated.json')).toEqual(expected);
  });
});

describe('every override points at a real course skill', () => {
  const all = allCheckSources();

  test.each(Object.keys(all))('%s', (courseId) => {
    const pathway = pathwayOf(courseId);
    const raw = new Set(courseSkills(pathway).flatMap((s) => [s.rawId, s.skillId]));
    for (const courseSkill of Object.keys(all[courseId])) {
      expect({ courseId, courseSkill, inCourse: raw.has(courseSkill) }).toEqual({ courseId, courseSkill, inCourse: true });
    }
  });
});

describe('an overridden skill is tested from its own items and nothing else', () => {
  test('8th grade cylinder volume no longer reaches the generic volume pool', () => {
    expect(checkSourcesFor('grade-8-math', 'volume-cylinders')).toEqual(['g8-volume-cylinders']);
    // What the crosswalk alone would have given the check.
    expect(skillLookupCandidates('volume-cylinders')).toContain('act-volume-surface-area');
  });

  test('the override is per course — the same raw id elsewhere keeps the crosswalk', () => {
    expect(checkSourcesFor('algebra-2', 'transformations')).toBeNull();
    expect(checkSourcesFor('grade-8-math', 'transformations')).toEqual(['g8-transformations']);
  });

  test('a skill with no override returns null (the crosswalk decides)', () => {
    expect(checkSourcesFor('grade-8-math', 'slope-rate-of-change')).toBeNull();
    expect(checkSourcesFor('no-such-course', 'anything')).toBeNull();
  });

  test('a hand-picked existing pool can be named too', () => {
    expect(checkSourcesFor('grade-8-math', 'write-linear-equations')).toEqual(['writing-linear-equations-slope-intercept']);
  });
});
