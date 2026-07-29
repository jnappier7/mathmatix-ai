/**
 * Course mastery attribution (owner review, 2026-07-29).
 *
 * The pipeline attributes BKT/FSRS evidence to
 *   ctx.activeSkill?.skillId || tutorPlan.currentTarget.skillId
 * and that fallback was written for FREE chat. But /api/chat — the path
 * chat.html uses for every course message — set activeSkill only for
 * mastery-badge sessions, so course turns fell through to the free-tutoring
 * plan's target: a student grinding ACT exponents inside the course was
 * crediting whatever open tutoring last focused on. Both entry points now
 * share deriveCourseActiveSkill, and attribution follows the CURRENT SCAFFOLD
 * STEP rather than dumping a multi-skill module onto skills[0].
 */

const { deriveCourseActiveSkill } = require('../../utils/pipeline/courseAdapter');

// Mirrors public/modules/act-prep/number_quantity_module.json: four skills,
// each scaffold step tagged with the one it teaches.
const MODULE_DATA = {
  skills: ['act-real-complex-numbers', 'act-exponents-roots', 'act-ratios-proportions-percents'],
  scaffold: [
    { type: 'explanation', title: 'Real Number Operations', skill: 'act-real-complex-numbers' },
    { type: 'model', title: 'Worked Examples', skill: 'act-real-complex-numbers' },
    { type: 'explanation', title: 'Exponents & Roots', skill: 'act-exponents-roots' },
    { type: 'guided_practice', title: 'Practice', skill: 'act-exponents-roots' },
    { type: 'explanation', title: 'Ratios', skill: 'act-ratios-proportions-percents' },
  ],
};

describe('deriveCourseActiveSkill', () => {
  test('attribution follows the CURRENT step, not the module default', () => {
    expect(deriveCourseActiveSkill({ moduleData: MODULE_DATA, scaffoldIndex: 0 }).skillId)
      .toBe('act-real-complex-numbers');
    // Step 3 teaches exponents — the whole point: practice here must not credit
    // the module's first skill.
    expect(deriveCourseActiveSkill({ moduleData: MODULE_DATA, scaffoldIndex: 3 }).skillId)
      .toBe('act-exponents-roots');
    expect(deriveCourseActiveSkill({ moduleData: MODULE_DATA, scaffoldIndex: 4 }).skillId)
      .toBe('act-ratios-proportions-percents');
  });

  test('falls back to the module\'s first skill when the step is untagged', () => {
    const noStepSkills = { skills: ['algebra-basics'], scaffold: [{ type: 'explanation', title: 'Intro' }] };
    expect(deriveCourseActiveSkill({ moduleData: noStepSkills, scaffoldIndex: 0 }).skillId)
      .toBe('algebra-basics');
  });

  test('falls back to the pathway module when the module file has no skills', () => {
    const skill = deriveCourseActiveSkill({
      moduleData: { scaffold: [] },
      currentPathwayModule: { skills: ['geometry-angles'] },
    });
    expect(skill.skillId).toBe('geometry-angles');
  });

  test('handles object-shaped skills and prefers their display name', () => {
    const skill = deriveCourseActiveSkill({
      moduleData: {
        skills: [{ skillId: 'exp-rules', displayName: 'Exponent Rules' }],
        scaffold: [{ type: 'explanation', skill: 'exp-rules' }],
      },
      scaffoldIndex: 0,
    });
    expect(skill).toEqual({ skillId: 'exp-rules', displayName: 'Exponent Rules', teachingGuidance: null });
  });

  test('a step skill with no matching entry still attributes, using the id as the name', () => {
    const skill = deriveCourseActiveSkill({
      moduleData: { skills: ['other'], scaffold: [{ skill: 'act-matrices-vectors' }] },
      scaffoldIndex: 0,
    });
    expect(skill).toEqual({ skillId: 'act-matrices-vectors', displayName: 'act-matrices-vectors', teachingGuidance: null });
  });

  test('returns null rather than inventing a skill', () => {
    expect(deriveCourseActiveSkill({ moduleData: { scaffold: [] } })).toBeNull();
    expect(deriveCourseActiveSkill({})).toBeNull();
    expect(deriveCourseActiveSkill()).toBeNull();
    // Blank/whitespace step skill must not become a skill id.
    expect(deriveCourseActiveSkill({ moduleData: { scaffold: [{ skill: '   ' }] } })).toBeNull();
  });

  test('an out-of-range step index degrades to the module skill', () => {
    expect(deriveCourseActiveSkill({ moduleData: MODULE_DATA, scaffoldIndex: 99 }).skillId)
      .toBe('act-real-complex-numbers');
  });
});

describe('both entry points use the shared derivation', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

  test('/api/chat derives a course activeSkill and passes it to the pipeline', () => {
    const src = read('routes/chat.js');
    expect(src).toMatch(/courseActiveSkill = deriveCourseActiveSkill\(\{/);
    // Mastery badge still wins; a course turn no longer resolves to null.
    expect(src).toMatch(/\}\s*:\s*\(courseActiveSkill \|\| null\)/);
  });

  test('courseAdapter uses the same helper (no forked copy)', () => {
    const src = read('utils/pipeline/courseAdapter.js');
    expect(src).toMatch(/const activeSkill = deriveCourseActiveSkill\(\{/);
    // The old skills[0]-only derivation must not come back.
    expect(src).not.toMatch(/moduleSkills\[0\] \? \{/);
  });
});
