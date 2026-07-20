/**
 * Prerequisite closure and the inference cascade, exercised against the REAL
 * 315-skill taxonomy rather than a toy graph — the behaviours that matter here
 * (how far a cascade reaches, whether a placement leaves a student with a wall
 * of locked work) only show up at real scale and real shape.
 */

const fs = require('fs');
const path = require('path');

const {
  buildGraph,
  prerequisiteClosure,
  applyProofCascade,
  availability,
  invalidateFrom,
  bandProgress,
  nearestClosableBand
} = require('../../utils/skillClosure');
const { advanceRung, currentRung, isInferred } = require('../../utils/skillRung');

const SKILLS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../seeds/skills-unified.json'), 'utf8')
);
const graph = buildGraph(SKILLS);

const emptyMastery = () => new Map();
const prove = (mastery, id, via = 'challenge') => {
  const entry = mastery.get(id) || {};
  advanceRung(entry, 'proved', {
    via,
    evidence: via === 'challenge' ? { correct: 5, total: 5, hintsUsed: 0 } : {}
  });
  delete entry.__rungResult;
  mastery.set(id, entry);
  return entry;
};

describe('buildGraph', () => {
  test('indexes every skill and both kinds of prerequisite edge', () => {
    expect(graph.ids()).toHaveLength(SKILLS.length);
    const slope = SKILLS.find((s) => s.skillId === 'ALG1.PRP.2');
    expect(graph.parentsOf('ALG1.PRP.2')).toEqual(
      expect.arrayContaining([...slope.prerequisites, ...slope.crossPrereqs])
    );
  });

  test('children are derived, not read from the stored enables field', () => {
    // Any database seeded before enables was populated has it empty; deriving
    // means the closure is correct regardless of what is in Mongo.
    const withoutEnables = buildGraph(SKILLS.map((s) => ({ ...s, enables: [] })));
    expect(withoutEnables.childrenOf('MS.PRP.3')).toEqual(graph.childrenOf('MS.PRP.3'));
    expect(graph.childrenOf('MS.PRP.3').length).toBeGreaterThan(0);
  });
});

describe('prerequisiteClosure', () => {
  test('reaches all the way down a real chain', () => {
    // The deepest chain in the taxonomy: separation of variables back to
    // third-grade multiplication facts.
    const closure = prerequisiteClosure(graph, 'CALC.FNC.28');
    expect(closure).toContain('ELEM.QNT.4');
    expect(closure).toContain('ALG1.EQV.16');
    expect(closure.length).toBeGreaterThan(20);
  });

  test('a root skill has nothing beneath it', () => {
    const roots = SKILLS.filter((s) => graph.parentsOf(s.skillId).length === 0);
    expect(roots.length).toBeGreaterThan(0);
    expect(prerequisiteClosure(graph, roots[0].skillId)).toEqual([]);
  });

  test('excludes the skill itself unless asked', () => {
    expect(prerequisiteClosure(graph, 'ALG1.PRP.2')).not.toContain('ALG1.PRP.2');
  });
});

describe('applyProofCascade — cleared from above', () => {
  test('proving slope clears unit rates beneath it', () => {
    // The product thesis made mechanical: the taxonomy routes ALG1.PRP.2 back to
    // MS.PRP.5 and MS.PRP.3, so a student who owns slope should never be walked
    // through unit rate again.
    const mastery = emptyMastery();
    prove(mastery, 'ALG1.PRP.2');
    const result = applyProofCascade(graph, mastery, 'ALG1.PRP.2');

    expect(result.cleared).toContain('MS.PRP.3');
    expect(currentRung(mastery.get('MS.PRP.3'))).toBe('proved');
    expect(isInferred(mastery.get('MS.PRP.3'))).toBe(true);
    expect(mastery.get('MS.PRP.3').inferredFrom).toBe('ALG1.PRP.2');
  });

  test('a deep proof cascades a long way down', () => {
    const mastery = emptyMastery();
    prove(mastery, 'CALC.FNC.28');
    const result = applyProofCascade(graph, mastery, 'CALC.FNC.28');
    expect(result.cleared.length).toBeGreaterThan(20);
    expect(result.cleared).toContain('ELEM.QNT.4');
  });

  test('skills the student already proved are left alone, not overwritten', () => {
    const mastery = emptyMastery();
    prove(mastery, 'MS.PRP.3');              // earned it honestly
    prove(mastery, 'ALG1.PRP.2');
    const result = applyProofCascade(graph, mastery, 'ALG1.PRP.2');

    expect(result.cleared).not.toContain('MS.PRP.3');
    expect(result.skipped).toContainEqual({ skillId: 'MS.PRP.3', why: 'already owned' });
    expect(isInferred(mastery.get('MS.PRP.3'))).toBe(false);
    expect(mastery.get('MS.PRP.3').provenBy).toBe('challenge');
  });

  test('a skill the student explicitly missed is never re-granted', () => {
    // We watched them fail it. The graph implying it is not stronger evidence
    // than having seen it go wrong.
    const mastery = emptyMastery();
    mastery.set('MS.PRP.3', { explicitlyFailed: true, failureDate: new Date() });
    prove(mastery, 'ALG1.PRP.2');
    const result = applyProofCascade(graph, mastery, 'ALG1.PRP.2');

    expect(result.cleared).not.toContain('MS.PRP.3');
    expect(result.skipped).toContainEqual({ skillId: 'MS.PRP.3', why: 'explicitly failed' });
    expect(currentRung(mastery.get('MS.PRP.3'))).toBe('none');
  });

  test('cascading twice clears nothing new', () => {
    const mastery = emptyMastery();
    prove(mastery, 'ALG1.PRP.2');
    const first = applyProofCascade(graph, mastery, 'ALG1.PRP.2');
    const second = applyProofCascade(graph, mastery, 'ALG1.PRP.2');
    expect(first.cleared.length).toBeGreaterThan(0);
    expect(second.cleared).toEqual([]);
  });

  test('cleared skills carry a receipt naming what granted them', () => {
    const mastery = emptyMastery();
    prove(mastery, 'ALG1.PRP.2');
    applyProofCascade(graph, mastery, 'ALG1.PRP.2');
    const entry = mastery.get('MS.PRP.3');
    expect(entry.rungHistory.at(-1)).toMatchObject({
      to: 'proved',
      via: 'inference',
      evidence: { sourceSkillId: 'ALG1.PRP.2' }
    });
  });

  test('an inference-cleared skill still opens what sits above it', () => {
    const mastery = emptyMastery();
    const before = availability(graph, mastery).open;
    prove(mastery, 'ALG1.PRP.2');
    const { cleared } = applyProofCascade(graph, mastery, 'ALG1.PRP.2');
    const after = availability(graph, mastery).open;

    const newlyOpen = after.filter((id) => !before.includes(id));
    expect(newlyOpen.length).toBeGreaterThan(0);

    // Each newly-opened skill must sit directly above either the proved skill or
    // something the cascade cleared — inference genuinely unlocks, it does not
    // merely colour cells.
    const nowOwned = new Set([...cleared, 'ALG1.PRP.2']);
    newlyOpen.forEach((id) => {
      expect(graph.parentsOf(id).some((p) => nowOwned.has(p))).toBe(true);
    });
  });

  test('a skill whose other prerequisite is untouched stays locked', () => {
    // MS.PRP.4 needs MS.PRP.2 (which slope's ancestry clears) AND ELEM.PRP.4
    // (which it does not). Partial ancestry must not open it.
    const mastery = emptyMastery();
    prove(mastery, 'ALG1.PRP.2');
    applyProofCascade(graph, mastery, 'ALG1.PRP.2');
    expect(availability(graph, mastery).open).not.toContain('MS.PRP.4');
  });
});

describe('availability', () => {
  test('a brand-new student can only start the roots', () => {
    const { open, locked } = availability(graph, emptyMastery());
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((id) => graph.parentsOf(id).length === 0)).toBe(true);
    expect(locked.length).toBe(SKILLS.length - open.length);
  });

  test('learning a skill does not open what follows it', () => {
    const mastery = emptyMastery();
    const entry = {};
    advanceRung(entry, 'learned', { via: 'lesson' });
    delete entry.__rungResult;
    mastery.set('ELEM.QNT.4', entry);

    const { open, inProgress } = availability(graph, mastery);
    expect(inProgress).toContain('ELEM.QNT.4');
    expect(open).not.toContain('ELEM.QNT.5');   // needs QNT.4 proved, not merely met
  });

  test('placement plus closure leaves a real frontier, not a wall', () => {
    // The first-impression test. A student placed at Algebra 1 should open the
    // board owning most of what is beneath them, with work they can start now —
    // not 200 locked cells and a backlog to grind.
    const mastery = emptyMastery();
    ['ALG1.EQV.1', 'ALG1.PRP.2', 'ALG1.FNC.1', 'ALG1.QNT.1'].forEach((id) => {
      prove(mastery, id);
      applyProofCascade(graph, mastery, id);
    });

    const { open, owned, locked } = availability(graph, mastery);
    expect(owned.length).toBeGreaterThan(30);
    expect(open.length).toBeGreaterThan(5);
    expect(locked.length).toBeLessThan(SKILLS.length - owned.length);
  });
});

describe('invalidateFrom — contradiction travels upward', () => {
  test('an inferred skill above a contradicted one is withdrawn', () => {
    const mastery = emptyMastery();
    prove(mastery, 'ALG1.PRP.2');
    applyProofCascade(graph, mastery, 'ALG1.PRP.2');
    // MS.PRP.5 was cleared from above; now the student misses MS.PRP.3 beneath it.
    expect(isInferred(mastery.get('MS.PRP.5'))).toBe(true);

    const result = invalidateFrom(graph, mastery, 'MS.PRP.3');
    expect(result.invalidated).toContain('MS.PRP.5');
  });

  test('a skill the student proved themselves survives a contradiction below it', () => {
    // Their demonstration outranks our bookkeeping.
    const mastery = emptyMastery();
    prove(mastery, 'ALG1.PRP.2');
    applyProofCascade(graph, mastery, 'ALG1.PRP.2');

    const result = invalidateFrom(graph, mastery, 'MS.PRP.3');
    expect(result.invalidated).not.toContain('ALG1.PRP.2');
    expect(currentRung(mastery.get('ALG1.PRP.2'))).toBe('proved');
    expect(mastery.get('ALG1.PRP.2').provenBy).toBe('challenge');
  });

  test('invalidation stops rather than running the whole graph', () => {
    const mastery = emptyMastery();
    prove(mastery, 'ALG1.PRP.2');
    applyProofCascade(graph, mastery, 'ALG1.PRP.2');
    const result = invalidateFrom(graph, mastery, 'MS.PRP.3');
    expect(result.invalidated.length).toBeLessThan(SKILLS.length / 2);
  });
});

describe('boardStates — what the student sees', () => {
  const { boardStates } = require('../../utils/skillClosure');

  test('a fresh student sees open roots and everything else locked', () => {
    const states = boardStates(graph, emptyMastery());
    const counts = [...states.values()].reduce((acc, s) => ({ ...acc, [s]: (acc[s] || 0) + 1 }), {});
    expect(counts.open).toBeGreaterThan(0);
    expect(counts.locked).toBeGreaterThan(0);
    expect(counts.proved || 0).toBe(0);
    expect(counts.taught || 0).toBe(0);
  });

  test('demonstrated and cleared-from-above are different states', () => {
    // The distinction the old UI could not draw, and the reason a student was
    // shown "100% mastered" for something they had never been tested on.
    const mastery = emptyMastery();
    prove(mastery, 'ALG1.PRP.2');
    applyProofCascade(graph, mastery, 'ALG1.PRP.2');
    const states = boardStates(graph, mastery);

    expect(states.get('ALG1.PRP.2')).toBe('proved');
    expect(states.get('MS.PRP.3')).toBe('above');
  });

  test('learned is distinct from proved and does not read as owned', () => {
    const mastery = emptyMastery();
    const entry = {};
    advanceRung(entry, 'learned', { via: 'lesson' });
    delete entry.__rungResult;
    mastery.set('ELEM.QNT.4', entry);

    expect(boardStates(graph, mastery).get('ELEM.QNT.4')).toBe('learned');
  });

  test('taught outranks proved on the board', () => {
    const mastery = emptyMastery();
    const entry = prove(mastery, 'ELEM.QNT.1');
    advanceRung(entry, 'taught', { via: 'teachback', evidence: { rubricScore: 4 } });
    delete entry.__rungResult;

    expect(boardStates(graph, mastery).get('ELEM.QNT.1')).toBe('taught');
  });

  test('every skill gets exactly one state', () => {
    const mastery = emptyMastery();
    prove(mastery, 'ALG1.PRP.2');
    applyProofCascade(graph, mastery, 'ALG1.PRP.2');
    const states = boardStates(graph, mastery);

    expect(states.size).toBe(SKILLS.length);
    const valid = ['taught', 'proved', 'above', 'learned', 'open', 'locked'];
    [...states.values()].forEach((s) => expect(valid).toContain(s));
  });
});

describe('band progress — the proximity hook', () => {
  test('reports every populated strand-band with a completion fraction', () => {
    const bands = bandProgress(graph, emptyMastery());
    expect(bands.length).toBeGreaterThan(20);
    bands.forEach((b) => {
      expect(b.total).toBeGreaterThan(0);
      expect(b.pct).toBeGreaterThanOrEqual(0);
      expect(b.pct).toBeLessThanOrEqual(1);
    });
  });

  test('a band one skill from done is surfaced as the nearest', () => {
    const mastery = emptyMastery();
    const band = SKILLS.filter((s) => s.courseLevel === 'ELEM' && s.strand === 'PRP');
    const last = band[band.length - 1];
    band.slice(0, band.length - 1).forEach((s) => prove(mastery, s.skillId));
    // The final skill must be genuinely startable, so clear its own prerequisites
    // too — otherwise the band is correctly NOT a hook (see the test below).
    prerequisiteClosure(graph, last.skillId).forEach((id) => prove(mastery, id));

    const nearest = nearestClosableBand(graph, mastery);
    expect(nearest).not.toBeNull();
    expect(nearest.remaining).toHaveLength(1);
    expect(nearest.attackable).toContain(last.skillId);
  });

  test('one skill remaining is NOT a hook when the student cannot start it', () => {
    // Dangling "1 away!" at work that is still locked is a wall dressed as a
    // nudge. The band must be excluded until the remainder is attackable.
    const mastery = emptyMastery();
    const band = SKILLS.filter((s) => s.courseLevel === 'ELEM' && s.strand === 'PRP');
    band.slice(0, band.length - 1).forEach((s) => prove(mastery, s.skillId));

    const nearest = nearestClosableBand(graph, mastery);
    if (nearest) expect(`${nearest.courseLevel}|${nearest.strand}`).not.toBe('ELEM|PRP');
  });

  test('a band whose remainder is all locked is not offered as a hook', () => {
    // Dangling "2 skills away!" at a student who cannot legally start either one
    // is a wall, not a nudge.
    const nearest = nearestClosableBand(graph, emptyMastery());
    if (nearest) expect(nearest.attackable.length).toBeGreaterThan(0);
  });

  test('a fully owned band is never the hook', () => {
    const mastery = emptyMastery();
    SKILLS.filter((s) => s.courseLevel === 'ELEM' && s.strand === 'PRP').forEach((s) =>
      prove(mastery, s.skillId)
    );
    const nearest = nearestClosableBand(graph, mastery);
    if (nearest) expect(`${nearest.courseLevel}|${nearest.strand}`).not.toBe('ELEM|PRP');
  });
});
