/**
 * Course pre-assessment blueprint and scoring.
 *
 * Every course should open by finding out what the student already knows, so it
 * teaches only what is left. The rules that matter here are the ones that keep
 * that honest: a skill is only credited on a clean run (crediting on a coin flip
 * SKIPS content the student cannot do), coverage is reported rather than implied,
 * and the recommended start is the first real gap.
 */

const P = require('../../utils/coursePreAssessment');

const pathway = {
  courseId: 'test-course',
  modules: [
    { moduleId: 'm1', title: 'Foundations', skills: ['a', 'b'] },
    { moduleId: 'm2', title: 'Building', skills: ['c', 'd'] },
    { moduleId: 'm3', title: 'Applying', skills: ['e'] }
  ]
};

const plenty = { a: 9, b: 9, c: 9, d: 9, e: 9 };

describe('courseSkills', () => {
  test('collects every skill in module order', () => {
    expect(P.courseSkills(pathway).map((s) => s.skillId)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('de-duplicates a skill that appears in two modules', () => {
    const repeated = { modules: [{ moduleId: 'm1', skills: ['a'] }, { moduleId: 'm2', skills: ['a', 'b'] }] };
    expect(P.courseSkills(repeated).map((s) => s.skillId)).toEqual(['a', 'b']);
  });

  test('keeps the module each skill came from', () => {
    expect(P.courseSkills(pathway)[2]).toMatchObject({ skillId: 'c', moduleId: 'm2' });
  });

  test('survives a malformed pathway', () => {
    expect(P.courseSkills(null)).toEqual([]);
    expect(P.courseSkills({ modules: [{ moduleId: 'm', skills: [null, ''] }] })).toEqual([]);
  });
});

describe('buildBlueprint', () => {
  test('tests every skill when the bank supports it', () => {
    const bp = P.buildBlueprint(pathway, plenty);
    expect(bp.skills.map((s) => s.skillId)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(bp.totalItems).toBe(10);
    expect(bp.coverage).toBe(1);
  });

  test('reports skills it could not test rather than silently dropping them', () => {
    // A pre-assessment that quietly omits half a course misreports readiness.
    const bp = P.buildBlueprint(pathway, { a: 9, b: 0, c: 9, d: 1, e: 9 });
    expect(bp.skills.map((s) => s.skillId)).toEqual(['a', 'c', 'e']);
    expect(bp.skippedForNoItems.map((s) => s.skillId).sort()).toEqual(['b', 'd']);
    expect(bp.coverage).toBeCloseTo(3 / 5);
  });

  test('spreads across the course instead of exhausting module 1', () => {
    // Sampling only the beginning cannot tell you a student could skip to the end.
    const big = { modules: [{ moduleId: 'm', skills: ['s1','s2','s3','s4','s5','s6','s7','s8'] }] };
    const avail = {}; big.modules[0].skills.forEach((s) => { avail[s] = 9; });
    const bp = P.buildBlueprint(big, avail, { maxItems: 6, itemsPerSkill: 2 });
    expect(bp.skills).toHaveLength(3);
    expect(bp.skills[0].skillId).toBe('s1');
    expect(bp.skills[bp.skills.length - 1].skillId).toBe('s8');
  });

  test('stays a warm-up, not an exam', () => {
    const big = { modules: [{ moduleId: 'm', skills: Array.from({ length: 60 }, (_, i) => 's' + i) }] };
    const avail = {}; big.modules[0].skills.forEach((s) => { avail[s] = 9; });
    const bp = P.buildBlueprint(big, avail);
    expect(bp.totalItems).toBeLessThanOrEqual(P.MAX_ITEMS);
  });

  test('an empty bank yields no items and zero coverage, not a crash', () => {
    const bp = P.buildBlueprint(pathway, {});
    expect(bp.skills).toEqual([]);
    expect(bp.coverage).toBe(0);
    expect(bp.skippedForNoItems).toHaveLength(5);
  });
});

describe('scoreBySkill', () => {
  test('credits a skill answered cleanly', () => {
    const r = P.scoreBySkill([{ skillId: 'a', correct: true }, { skillId: 'a', correct: true }]);
    expect(r.credited).toEqual(['a']);
  });

  test('does NOT credit a skill on a partial run', () => {
    // Crediting half-right skips content the student cannot actually do.
    const r = P.scoreBySkill([{ skillId: 'a', correct: true }, { skillId: 'a', correct: false }]);
    expect(r.credited).toEqual([]);
    expect(r.notCredited).toEqual(['a']);
    expect(r.bySkill.a.accuracy).toBe(0.5);
  });

  test('separates skills independently', () => {
    const r = P.scoreBySkill([
      { skillId: 'a', correct: true }, { skillId: 'a', correct: true },
      { skillId: 'b', correct: false }, { skillId: 'b', correct: true }
    ]);
    expect(r.credited).toEqual(['a']);
    expect(r.notCredited).toEqual(['b']);
  });

  test('an unanswered skill is never credited', () => {
    expect(P.scoreBySkill([]).credited).toEqual([]);
  });
});

describe('recommendedStart', () => {
  test('is the first module with a gap', () => {
    expect(P.recommendedStart(pathway, ['a', 'b'])).toMatchObject({ moduleId: 'm2', index: 1 });
  });

  test('is module 1 when nothing was demonstrated', () => {
    expect(P.recommendedStart(pathway, [])).toMatchObject({ moduleId: 'm1', index: 0 });
  });

  test('is null when the student cleared everything tested', () => {
    // The caller decides what to say about a course they may not need.
    expect(P.recommendedStart(pathway, ['a', 'b', 'c', 'd', 'e'])).toBeNull();
  });

  test('a partially-credited module is still where the course starts', () => {
    // Owning one of two skills in a module does not mean skipping the module.
    expect(P.recommendedStart(pathway, ['a'])).toMatchObject({ moduleId: 'm1' });
  });
});
