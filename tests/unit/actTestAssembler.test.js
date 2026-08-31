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
