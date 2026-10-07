// tests/unit/actTestAssembler.test.js
// Unit tests for the ACT assembler's pure logic against the current 45-question
// blueprint (2025+ ACT Math: 45 items, 4 choices, 6 reporting categories).
// assembleForm() hits the DB and is covered by integration tests; requiring
// this module does not load mongoose (Problem is required lazily).

const A = require('../../utils/actTestAssembler');

const bp = A.getBlueprint();
const fixedRng = () => 0.5; // deterministic

describe('actTestAssembler.buildSlots', () => {
  test('produces exactly totalItems (45) slots', () => {
    const slots = A.buildSlots(bp, fixedRng);
    expect(slots).toHaveLength(bp.totalItems);
    expect(slots).toHaveLength(45);
  });

  test('category counts match the blueprint weights exactly', () => {
    const slots = A.buildSlots(bp, fixedRng);
    const counts = {};
    slots.forEach(s => { counts[s.category] = (counts[s.category] || 0) + 1; });
    expect(counts).toEqual(bp.categoryWeights);
  });

  test('assigns an act- skill to every slot', () => {
    const slots = A.buildSlots(bp, fixedRng);
    expect(slots.every(s => typeof s.skillId === 'string' && s.skillId.startsWith('act-'))).toBe(true);
  });

  test('positions are 1..45 in order', () => {
    const slots = A.buildSlots(bp, fixedRng);
    expect(slots.map(s => s.position)).toEqual(Array.from({ length: 45 }, (_, i) => i + 1));
  });

  test('every slot carries the ramp target for its position', () => {
    const slots = A.buildSlots(bp, fixedRng);
    slots.forEach((slot) => {
      expect(slot.targetDifficulty).toBe(A.difficultyForPosition(bp, slot.position));
    });
  });

  test('interleaves categories rather than blocking them', () => {
    const slots = A.buildSlots(bp, fixedRng);
    const firstSix = new Set(slots.slice(0, 6).map(s => s.category));
    expect(firstSix.size).toBeGreaterThanOrEqual(4);
  });

  test('is deterministic for a fixed rng', () => {
    const a1 = A.buildSlots(bp, () => 0.5).map(s => s.skillId);
    const a2 = A.buildSlots(bp, () => 0.5).map(s => s.skillId);
    expect(a1).toEqual(a2);
  });
});

describe('actTestAssembler.skillPool', () => {
  test('returns the fine-grained ACT skills (one per sub-skill), all act- prefixed', () => {
    const pool = A.skillPool();
    // Fable bank tags every item with a fine sub-skill (e.g. act-quadratic-equations);
    // the pool is the union across all six categories.
    const expected = Object.values(bp.skillsByCategory).reduce((n, arr) => n + arr.length, 0);
    expect(pool).toHaveLength(expected);
    expect(pool.length).toBeGreaterThan(6);         // finer than the 6 categories
    expect(pool.every(s => s.startsWith('act-'))).toBe(true);
    expect(new Set(pool).size).toBe(pool.length);   // no duplicate skillIds
  });
});

describe('actTestAssembler.rawToScaled', () => {
  test('maps the endpoints (45->36, 0->1) and is monotonic non-decreasing', () => {
    expect(A.rawToScaled(45).scaled).toBe(36);
    expect(A.rawToScaled(0).scaled).toBe(1);
    let prev = 0;
    for (let raw = 0; raw <= 45; raw++) {
      const s = A.rawToScaled(raw).scaled;
      expect(s).toBeGreaterThanOrEqual(prev);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(36);
      prev = s;
    }
  });

  test('clamps out-of-range raw scores', () => {
    expect(A.rawToScaled(999).scaled).toBe(36);
    expect(A.rawToScaled(-5).scaled).toBe(1);
  });

  test('flags the estimate as approximate', () => {
    expect(A.rawToScaled(30).approximate).toBe(true);
  });
});

describe('actTestAssembler.difficultyForPosition', () => {
  const ramp = Array.from({ length: bp.totalItems }, (_, i) => A.difficultyForPosition(bp, i + 1));

  test('hits the blueprint anchors exactly', () => {
    bp.difficultyRamp.forEach((anchor) => {
      expect(A.difficultyForPosition(bp, anchor.position)).toBe(anchor.targetDifficulty);
    });
  });

  test('ascends across the whole form, and strictly — no flat plateaus', () => {
    // The plateau ramp this replaced sat flat for 15 questions at a time, so a
    // student met one full difficulty step at Q15→Q16 and nothing either side.
    for (let i = 1; i < ramp.length; i++) {
      expect(ramp[i]).toBeGreaterThan(ramp[i - 1]);
    }
    expect(ramp[0]).toBeLessThan(2);        // Q1 is a gimme on a real form
    expect(ramp[ramp.length - 1]).toBe(5);  // Q45 is the hardest item we can ask
  });

  test('the tail climbs faster than the body', () => {
    // On a real ACT the last ~5 items are markedly harder than items 31-40 —
    // that is where students run out of clock, and a flat 4 through Q45 let a
    // strong student coast to an inflated baseline.
    const perItem = (from, to) => (A.difficultyForPosition(bp, to) - A.difficultyForPosition(bp, from)) / (to - from);
    expect(perItem(41, 45)).toBeGreaterThan(perItem(31, 40));
  });

  test('holds the mean the raw→scaled table is calibrated to', () => {
    // scaledScore.scaledByRaw maps a form of ~this average difficulty. Reshape
    // the curve freely; move its mean and every practice score silently shifts.
    const mean = ramp.reduce((a, b) => a + b, 0) / ramp.length;
    expect(mean).toBeCloseTo(3.0, 1);
  });

  test('clamps outside the anchor range instead of extrapolating', () => {
    expect(A.difficultyForPosition(bp, 0)).toBe(bp.difficultyRamp[0].targetDifficulty);
    expect(A.difficultyForPosition(bp, 999)).toBe(5);
  });

  test('still reads the legacy flat-band shape (blueprint overrides)', () => {
    const banded = { difficultyRamp: [{ fromPosition: 1, toPosition: 45, targetDifficulty: 3 }] };
    expect(A.difficultyForPosition(banded, 1)).toBe(3);
    expect(A.difficultyForPosition(banded, 45)).toBe(3);
    expect(A.difficultyForPosition({}, 20)).toBe(3);   // no ramp at all
  });
});

describe('actTestAssembler diversity (no look-alike problems in one form)', () => {
  test('promptSignature blanks numbers so same-wording items collapse', () => {
    const a = A.promptSignature('A cyclist rides at 5 mph for 3 hours');
    const b = A.promptSignature('A cyclist rides at 8 mph for 2 hours');
    expect(a).toBe(b);
    const c = A.promptSignature('A printer prints at 5 ppm for 3 minutes');
    expect(c).not.toBe(a);
  });

  test('pickDiverse avoids a shape already used in the form', () => {
    const pool = [
      { problemId: '1', prompt: 'A cyclist rides at 5 mph for 3 hours' },
      { problemId: '2', prompt: 'A printer prints at 5 ppm for 3 minutes' },
    ];
    const used = new Map([[A.promptSignature(pool[0].prompt), 1]]);
    expect(A.pickDiverse(pool, used).problemId).toBe('2');
  });

  test('pickDiverse returns null on an empty pool', () => {
    expect(A.pickDiverse([], new Map())).toBeNull();
  });

  test('pickDiverse breaks shape ties by nearness to the fractional target', () => {
    // The query window is a ±1 band of integers, so a 2.2 slot and a 2.8 slot
    // see the same pool. Without this the curve collapses into a step function.
    const pool = [
      { problemId: 'd2', prompt: 'Wholly distinct wording alpha', difficulty: 2 },
      { problemId: 'd3', prompt: 'Wholly distinct wording beta', difficulty: 3 },
    ];
    expect(A.pickDiverse(pool, new Map(), 2.2).problemId).toBe('d2');
    expect(A.pickDiverse(pool, new Map(), 2.8).problemId).toBe('d3');
  });

  test('pickDiverse still puts shape novelty ahead of difficulty', () => {
    const pool = [
      { problemId: 'onTarget', prompt: 'A cyclist rides at 5 mph for 3 hours', difficulty: 3 },
      { problemId: 'freshShape', prompt: 'A printer prints at 5 ppm for 3 minutes', difficulty: 5 },
    ];
    const used = new Map([[A.promptSignature(pool[0].prompt), 1]]);
    expect(A.pickDiverse(pool, used, 3).problemId).toBe('freshShape');
  });

  test('pickDiverse without a target keeps the old first-wins tie-break', () => {
    const pool = [
      { problemId: 'first', prompt: 'Wholly distinct wording alpha', difficulty: 5 },
      { problemId: 'second', prompt: 'Wholly distinct wording beta', difficulty: 1 },
    ];
    expect(A.pickDiverse(pool, new Map()).problemId).toBe('first');
  });
});

describe('actTestAssembler.orderByDifficulty', () => {
  // The ramp only steers which pool a slot draws from, so the assembled order
  // still read as random — "3 notebooks cost $12" in the final third between a
  // matrix sum and a distance-to-a-line item (owner report, 2026-09-09). The
  // real ACT ramps, and pacing strategy is taught on that assumption.
  const items = [
    { position: 1, category: 'algebra', difficulty: 4, problemId: 'hard-a' },
    { position: 2, category: 'geometry', difficulty: 1, problemId: 'easy-g' },
    { position: 3, category: 'algebra', difficulty: 2, problemId: 'mid-a' },
    { position: 4, category: 'functions', problemId: 'unknown-f' },          // no difficulty → treated as 3
    { position: 5, category: 'geometry', difficulty: 2, problemId: 'mid-g' },
    { position: 6, category: 'algebra', difficulty: 4, problemId: 'hard-a2' },
  ];

  test('sequences easiest-first and renumbers positions 1..n', () => {
    const out = A.orderByDifficulty(items);
    expect(out.map((it) => it.problemId)).toEqual(['easy-g', 'mid-a', 'mid-g', 'unknown-f', 'hard-a', 'hard-a2']);
    expect(out.map((it) => it.position)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('is stable — ties keep the category interleave', () => {
    const out = A.orderByDifficulty(items);
    const twos = out.filter((it) => it.difficulty === 2).map((it) => it.problemId);
    expect(twos).toEqual(['mid-a', 'mid-g']);
    const fours = out.filter((it) => it.difficulty === 4).map((it) => it.problemId);
    expect(fours).toEqual(['hard-a', 'hard-a2']);
  });

  test('does not mutate its input and tolerates an empty form', () => {
    A.orderByDifficulty(items);
    expect(items[0].position).toBe(1);
    expect(items[0].problemId).toBe('hard-a');
    expect(A.orderByDifficulty([])).toEqual([]);
    expect(A.orderByDifficulty(null)).toEqual([]);
  });
});

describe('a measured difficulty orders the form more finely than the integer', () => {
  const { preciseDifficulty, orderByDifficulty } = require('../../utils/actTestAssembler');
  const { difficultyToTheta } = require('../../utils/itemCalibration');
  const measured = (d, exact) => ({ difficulty: d, calibration: { calibratedAt: new Date(), theta: difficultyToTheta(exact) } });

  test('a measured item reads its estimate, an authored one its integer', () => {
    expect(preciseDifficulty(measured(3, 3.4))).toBeCloseTo(3.4, 2);
    expect(preciseDifficulty({ difficulty: 3 })).toBe(3);
    expect(preciseDifficulty({ difficulty: 3, calibration: { theta: 1 } })).toBe(3);   // never applied
  });

  test('two items stored as 3 come out in the order students found them', () => {
    const items = [{ problemId: 'hard3', difficulty: 3 }, { problemId: 'easy3', difficulty: 3 }];
    const exact = { hard3: 3.4, easy3: 2.6 };
    const out = orderByDifficulty(items, (it) => exact[it.problemId]);
    expect(out.map((i) => i.problemId)).toEqual(['easy3', 'hard3']);
    expect(out.map((i) => i.position)).toEqual([1, 2]);
  });

  test('without a key the integer order is unchanged', () => {
    const out = orderByDifficulty([{ problemId: 'a', difficulty: 4 }, { problemId: 'b', difficulty: 2 }]);
    expect(out.map((i) => i.problemId)).toEqual(['b', 'a']);
  });
});

// External audit 2026-10-05: garage pricing then taxi pricing, back to back.
describe('actTestAssembler.spreadFamilies', () => {
  const { spreadFamilies, familiesOf } = A;
  const item = (skillId, content = 'Q?') => ({ skillId, content });

  test('two dollar-rate scenarios are one family across skills', () => {
    const garage = item('act-multi-step-arithmetic', 'A parking garage charges $6.00 for the first hour and $2.50 for each additional hour.');
    const taxi = item('act-linear-equations', 'A taxi ride costs $3 plus $2 for each mile traveled.');
    expect(familiesOf(garage)).toContain('money-rates');
    expect(familiesOf(taxi)).toContain('money-rates');
    expect(familiesOf(item('act-circles', 'A circle has radius $r$.'))).not.toContain('money-rates');
  });

  test('adjacent look-alikes are pulled apart and positions renumbered', () => {
    const garage = item('s1', 'A garage charges $6 for the first hour and $2.50 for each additional hour.');
    const taxi = item('s2', 'A taxi costs $3 plus $2 for each mile.');
    const out = spreadFamilies([item('a'), garage, taxi, item('b'), item('c')]);
    const at = (x) => out.findIndex((o) => o.content === x.content);
    expect(Math.abs(at(garage) - at(taxi))).toBeGreaterThan(1);
    expect(out.map((o) => o.position)).toEqual([1, 2, 3, 4, 5]);
  });

  test('same skill back to back is spread too; a clean form is untouched', () => {
    const out = spreadFamilies([item('x'), item('x'), item('y'), item('z')]);
    expect(out[0].skillId).not.toBe(out[1].skillId);
    const clean = [item('a'), item('b'), item('c')];
    expect(spreadFamilies(clean).map((o) => o.skillId)).toEqual(['a', 'b', 'c']);
  });

  test('moves stay within the short look-ahead (the ramp barely shifts)', () => {
    const out = spreadFamilies([item('x'), item('x'), item('x'), item('x'), item('y')]);
    expect(out).toHaveLength(5);
    expect(out[out.length - 1].position).toBe(5);
  });
});

describe('actTestAssembler.NOT_ON_FORMS', () => {
  test('the bulk low-volume expansions are kept off forms; ACT banks are not', () => {
    expect(A.NOT_ON_FORMS.test('low-volume-expansion-2026-07')).toBe(true);
    expect(A.NOT_ON_FORMS.test('low-volume-2026-08')).toBe(true);
    ['act-fable', 'act-ies-expansion', 'act-enhanced-2026-09'].forEach((s) => expect(A.NOT_ON_FORMS.test(s)).toBe(false));
  });
});

// External audit 2026-10-07: one form served the "DE ∥ BC" similarity setup
// twice in different words, and a retake re-served "product of the solutions
// of |2x − 5| = 11", which sits in two Fable practice tests under two ids.
describe('templates and near-copies', () => {
  const fable = require('../../seeds/act-fable-items.generated.json');
  const get = (id) => fable.find((p) => p.problemId === id);

  test('vertex names and numbers are not part of a template', () => {
    const t = A.templateTokens('In △ABC, D lies on AB and DE ∥ BC. If AD = 5, what is BC?');
    expect([...t]).toEqual(expect.arrayContaining(['triangle', 'parallel']));
    expect([...t].some((w) => /abc|^bc$|^ad$/.test(w))).toBe(false);
  });

  test('the three "DE ∥ BC" wordings are one template', () => {
    const [a, b, c] = ['act-fable-t2q43', 'act-fable-t5q19', 'act-fable-topup1q317'].map((id) => A.fingerprint(get(id)));
    expect(A.sameTemplate(a, b)).toBe(true);
    expect(A.sameTemplate(b, c)).toBe(true);
  });

  test('the |2x − 5| = 11 item in tests 3 and 4 is one question under two ids', () => {
    const a = A.fingerprint(get('act-fable-t3q32')), b = A.fingerprint(get('act-fable-t4q33'));
    expect(A.nearCopy(a, b)).toBe(true);
  });

  test('a different skill, different choices, or a different figure is not a copy', () => {
    const base = { skillId: 's', prompt: 'What is the slope of the line graphed below?', options: [{ text: '1' }, { text: '2' }, { text: '3' }, { text: '4' }], svg: '<svg>a</svg>' };
    const fp = A.fingerprint(base);
    expect(A.nearCopy(fp, A.fingerprint({ ...base, skillId: 't' }))).toBe(false);
    expect(A.nearCopy(fp, A.fingerprint({ ...base, options: [{ text: '1' }, { text: '2' }, { text: '3' }, { text: '5' }] }))).toBe(false);
    expect(A.nearCopy(fp, A.fingerprint({ ...base, svg: '<svg>b</svg>' }))).toBe(false);
    expect(A.nearCopy(fp, A.fingerprint({ ...base }))).toBe(true);
  });

  test('pickDiverse passes over a template the form already has', () => {
    const form = [A.fingerprint(get('act-fable-t2q43'))];
    const copy = { ...get('act-fable-t5q19'), difficulty: 3 };
    const other = { ...get('act-fable-topup1q311'), difficulty: 3 };
    expect(A.pickDiverse([copy, other], new Map(), 3, form).problemId).toBe(other.problemId);
  });
});

// "Treat its 1-36 score as a rough estimate" (external review, 2026-10-07):
// results show the likely band, not just a point.
describe('actTestAssembler.scaledRange', () => {
  test('a mid-range sitting gets a band around its score', () => {
    const r = A.scaledRange(26, 45);
    const s = A.rawToScaled(26, undefined, 45).scaled;
    expect(r.low).toBeLessThan(s);
    expect(r.high).toBeGreaterThan(s);
    expect(r.high - r.low).toBeLessThanOrEqual(8);
  });
  test('the band never leaves 1-36 and is ordered', () => {
    for (let raw = 0; raw <= 45; raw++) {
      const r = A.scaledRange(raw, 45);
      expect(r.low).toBeGreaterThanOrEqual(1);
      expect(r.high).toBeLessThanOrEqual(36);
      expect(r.low).toBeLessThanOrEqual(r.high);
    }
  });
  test('a bad input gives no band rather than a wrong one', () => {
    expect(A.scaledRange(10, 0)).toBeNull();
    expect(A.scaledRange(NaN, 45)).toBeNull();
  });
});
