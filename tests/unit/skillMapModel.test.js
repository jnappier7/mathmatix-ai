/**
 * Skill map view model.
 *
 * These pin what the board TELLS a student — which rung it offers, how close a
 * band claims to be — because those are the parts that can quietly lie. The
 * rung options in particular must mirror utils/skillRung.canAdvance, or the
 * board offers actions the server then refuses.
 */

const M = require('../../public/js/skillMapModel');

const skill = (over) => Object.assign(
  { skillId: 'ALG1.PRP.2', label: 'Slope as a rate', strand: 'PRP', courseLevel: 'ALG1', state: 'open' },
  over
);

describe('rungOptions mirrors the server-side ladder', () => {
  test('an open skill can be learned or proved — the test-out path', () => {
    const keys = M.rungOptions(skill({ state: 'open' })).map((o) => o.key);
    expect(keys).toEqual(['learn', 'challenge']);
  });

  test('a learned skill can still be proved', () => {
    expect(M.rungOptions(skill({ state: 'learned' })).map((o) => o.key)).toContain('challenge');
  });

  test('a proved skill is offered teaching, and only teaching', () => {
    expect(M.rungOptions(skill({ state: 'proved' })).map((o) => o.key)).toEqual(['teach']);
  });

  test('a skill cleared from above must be proved directly before teaching', () => {
    // skillRung.canAdvance refuses teachback on an inferred rung. The board must
    // not offer it, or the student gets a 409 for something the UI invited.
    const keys = M.rungOptions(skill({ state: 'above' })).map((o) => o.key);
    expect(keys).toEqual(['challenge']);
    expect(keys).not.toContain('teach');
  });

  test('a taught skill offers nothing — it is the top rung', () => {
    expect(M.rungOptions(skill({ state: 'taught' }))).toEqual([]);
  });

  test('a locked skill offers nothing', () => {
    expect(M.rungOptions(skill({ state: 'locked' }))).toEqual([]);
  });
});

describe('ownership', () => {
  test('proved, taught and cleared-from-above all count as owned', () => {
    ['proved', 'taught', 'above'].forEach((s) => expect(M.isOwned(s)).toBe(true));
  });

  test('learning something is not owning it', () => {
    ['open', 'learned', 'locked'].forEach((s) => expect(M.isOwned(s)).toBe(false));
  });
});

describe('the grid', () => {
  const skills = [
    skill({ skillId: 'A', strand: 'PRP', courseLevel: 'ALG1' }),
    skill({ skillId: 'B', strand: 'PRP', courseLevel: 'ALG1' }),
    skill({ skillId: 'C', strand: 'QNT', courseLevel: 'MS' })
  ];

  test('groups by level and strand', () => {
    const grid = M.buildGrid(skills);
    expect(grid.get('ALG1|PRP')).toHaveLength(2);
    expect(grid.get('MS|QNT')).toHaveLength(1);
  });

  test('only renders levels that actually have skills', () => {
    expect(M.activeLevels(skills)).toEqual(['MS', 'ALG1']);
  });

  test('levels come back bottom-up, not in payload order', () => {
    const jumbled = [skill({ courseLevel: 'CALC' }), skill({ courseLevel: 'ELEM' })];
    expect(M.activeLevels(jumbled)).toEqual(['ELEM', 'CALC']);
  });

  test('skills missing a strand or level are skipped, not crashed on', () => {
    const grid = M.buildGrid([{ skillId: 'X' }, null, skill({})]);
    expect(grid.size).toBe(1);
  });
});

describe('strand totals', () => {
  test('counts owned against total per strand', () => {
    const totals = M.strandTotals([
      skill({ strand: 'PRP', state: 'proved' }),
      skill({ strand: 'PRP', state: 'open' }),
      skill({ strand: 'QNT', state: 'taught' })
    ]);
    expect(totals.PRP).toEqual({ total: 2, owned: 1 });
    expect(totals.QNT).toEqual({ total: 1, owned: 1 });
  });

  test('every strand is present even with no skills', () => {
    expect(Object.keys(M.strandTotals([]))).toHaveLength(6);
  });
});

describe('the proximity hook', () => {
  test('names the band and what to do next', () => {
    const text = M.hookText({
      strand: 'PRP', courseLevel: 'ALG1', remaining: 2,
      nextSkillId: 'ALG1.PRP.3', nextLabel: 'Direct variation'
    });
    expect(text).toBe('2 skills from closing Proportional Reasoning at ALG1. Next up: Direct variation.');
  });

  test('says "1 skill", not "1 skills"', () => {
    const text = M.hookText({ strand: 'PRP', courseLevel: 'ALG1', remaining: 1, nextSkillId: 'x' });
    expect(text).toMatch(/^1 skill from/);
  });

  test('says nothing when there is no attackable next skill', () => {
    // Dangling "2 away!" at locked work is a wall dressed as a nudge.
    expect(M.hookText({ strand: 'PRP', courseLevel: 'ALG1', remaining: 2, nextSkillId: null })).toBeNull();
    expect(M.hookText(null)).toBeNull();
  });
});

describe('summarize', () => {
  test('reads the counts the endpoint returns', () => {
    expect(M.summarize({ counts: { proved: 12, taught: 3, open: 7, total: 348 } }))
      .toEqual({ proved: 12, taught: 3, open: 7, total: 348 });
  });

  test('degrades to zeros rather than NaN on a malformed payload', () => {
    expect(M.summarize({})).toEqual({ proved: 0, taught: 0, open: 0, total: 0 });
    expect(M.summarize(null)).toEqual({ proved: 0, taught: 0, open: 0, total: 0 });
  });
});
