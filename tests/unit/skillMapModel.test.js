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

describe('strandProgress — the climb, in grades', () => {
  // Grades 3 and 4 fully owned in QNT, grade 5 untouched. This is exactly the
  // sentence the columns have to be able to say: "I finished all of the 4th
  // grade skills, now I am moving up to 5th."
  const skills = [];
  [[3, 3], [4, 3], [5, 0]].forEach(([g, owned]) => {
    for (let i = 0; i < 3; i++) {
      skills.push({
        skillId: `q${g}${i}`, strand: 'QNT', courseLevel: 'ELEM',
        grade: String(g), state: i < owned ? 'proved' : 'open',
      });
    }
  });
  for (let i = 0; i < 3; i++) {
    skills.push({ skillId: `p${i}`, strand: 'PRP', courseLevel: 'ELEM', grade: '3', state: 'open' });
  }

  test('finishing a grade moves you to the next one', () => {
    const qnt = M.strandProgress(skills).find((c) => c.key === 'QNT');
    expect(qnt.reachedGrade).toBe(4);
    expect(qnt.clearedReached).toBe(true);
    expect(qnt.workingGrade).toBe(5);
    expect(qnt.workingLabel).toBe('5th');
  });

  test('a partly-done grade keeps you IN it', () => {
    const partial = skills.map((s) => (s.skillId === 'q41' ? { ...s, state: 'open' } : s));
    const qnt = M.strandProgress(partial).find((c) => c.key === 'QNT');
    expect(qnt.clearedReached).toBe(false);
    expect(qnt.workingGrade).toBe(4);
  });

  test('nothing owned is 0 fill, never negative', () => {
    // reachedIndex is -1 with nothing owned, and (-1 + 0)/n is NEGATIVE — a
    // below-zero column for the student who has done the least.
    const prp = M.strandProgress(skills).find((c) => c.key === 'PRP');
    expect(prp.reachedGrade).toBeNull();
    expect(prp.workingLabel).toBeNull();
    expect(prp.fill).toBe(0);
  });

  test('fill never exceeds a full column', () => {
    const all = skills.map((s) => ({ ...s, state: 'proved' }));
    M.strandProgress(all).forEach((c) => {
      expect(c.fill).toBeGreaterThanOrEqual(0);
      expect(c.fill).toBeLessThanOrEqual(1);
    });
  });

  test('every strand gets a column, in board order', () => {
    const cols = M.strandProgress(skills);
    expect(cols).toHaveLength(M.STRANDS.length);
    expect(cols.map((c) => c.key)).toEqual(M.STRANDS.map((s) => s.key));
  });

  test('grade ranges parse, both dash characters', () => {
    const ranged = [
      { skillId: 'a', strand: 'QNT', grade: '6–7', state: 'proved' },
      { skillId: 'b', strand: 'QNT', grade: '10-11', state: 'open' },
    ];
    const qnt = M.strandProgress(ranged).find((c) => c.key === 'QNT');
    expect(qnt.reachedGrade).toBe(6); // low end
  });

  test('skills with no grade are skipped, not crashed on', () => {
    const messy = [{ skillId: 'x', strand: 'QNT', state: 'proved' }, { skillId: 'y', strand: 'QNT', grade: 'K', state: 'proved' }];
    expect(() => M.strandProgress(messy)).not.toThrow();
    expect(M.strandProgress(messy).find((c) => c.key === 'QNT').fill).toBe(0);
  });
});

describe('availableNow', () => {
  const skills = [
    { skillId: 'locked-1', state: 'locked' },
    { skillId: 'open-1', state: 'open' },
    { skillId: 'proved-1', state: 'proved' },
    { skillId: 'open-2', state: 'open' },
    { skillId: 'open-3', state: 'open' },
    { skillId: 'learned-1', state: 'learned' },
  ];

  test('offers only what every prerequisite already clears', () => {
    // Nothing aspirational: each row must be startable right now.
    const ids = M.availableNow(skills, null).map((s) => s.skillId);
    expect(ids).toEqual(['open-1', 'open-2', 'open-3']);
  });

  test('leads with the engine-recommended next skill', () => {
    expect(M.availableNow(skills, 'open-3').map((s) => s.skillId))
      .toEqual(['open-3', 'open-1', 'open-2']);
  });

  test('shows the next FEW, not the whole map', () => {
    // The question is "what do I do next", not "what exists".
    const many = Array.from({ length: 40 }, (_, i) => ({ skillId: 's' + i, state: 'open' }));
    expect(M.availableNow(many, null)).toHaveLength(5);
    expect(M.availableNow(many, null, 3)).toHaveLength(3);
  });

  test('a student with nothing open gets an empty list, not a crash', () => {
    expect(M.availableNow([{ skillId: 'x', state: 'locked' }], null)).toEqual([]);
    expect(M.availableNow(null, null)).toEqual([]);
  });

  test('a stale nearestId that is no longer open does not resurrect it', () => {
    // The engine's pick can go stale between renders — it must not smuggle a
    // non-open skill into a list whose entire promise is "startable now".
    expect(M.availableNow(skills, 'proved-1').map((s) => s.skillId))
      .toEqual(['open-1', 'open-2', 'open-3']);
  });
});

describe('ladderRungs', () => {
  const ladder = (state) => M.ladderRungs({ state });
  const statuses = (state) => ladder(state).map((r) => r.status);

  test('always three rungs, learn -> prove -> teach', () => {
    expect(ladder('open').map((r) => r.key)).toEqual(['learn', 'challenge', 'teach']);
    expect(ladder('taught')).toHaveLength(3);
    expect(ladder(undefined)).toHaveLength(3);
  });

  test('walks the climb as the student earns it', () => {
    expect(statuses('open')).toEqual(['current', 'current', 'locked']);
    expect(statuses('learned')).toEqual(['done', 'current', 'locked']);
    expect(statuses('proved')).toEqual(['done', 'done', 'current']);
    expect(statuses('taught')).toEqual(['done', 'done', 'done']);
  });

  test('cleared-from-above is GRANTED, never done', () => {
    // The board must not imply evidence that does not exist: closure filled
    // this rung, the student did not demonstrate it.
    const [, prove] = ladder('above');
    expect(prove.status).toBe('granted');
    expect(prove.status).not.toBe('done');
    expect(prove.hint).toMatch(/not shown this one yet/i);
  });

  test('granted is still actionable — proving directly is the point', () => {
    expect(ladder('above')[1].action).toBe('challenge');
  });

  test('teaching stays locked on a granted rung, with the reason', () => {
    const teach = ladder('above')[2];
    expect(teach.status).toBe('locked');
    expect(teach.action).toBeNull();
    expect(teach.hint).toMatch(/prove this one directly first/i);
  });

  test('only actionable rungs carry an action', () => {
    ['locked', 'open', 'learned', 'above', 'proved', 'taught'].forEach((state) => {
      ladder(state).forEach((r) => {
        if (r.action) expect(['current', 'granted']).toContain(r.status);
        else expect(['done', 'locked']).toContain(r.status);
      });
    });
  });

  test('a locked skill offers nothing', () => {
    expect(statuses('locked')).toEqual(['locked', 'locked', 'locked']);
    expect(ladder('locked').every((r) => r.action === null)).toBe(true);
  });

  test('the first rung reads as continuing once work has started', () => {
    expect(ladder('open')[0].label).toBe('Learn it');
    expect(ladder('learned')[0].label).toBe('Keep working');
  });
});
