// tests/unit/actTestAssembler.test.js
// Unit tests for the ACT practice-test assembler's pure logic (slot planning,
// skill pool, scaled scoring). assembleForm() hits the DB and is covered by
// integration tests; requiring this module does NOT load mongoose because the
// Problem model is required lazily inside assembleForm.

const A = require('../../utils/actTestAssembler');

const bp = A.getBlueprint();
const fixedRng = () => 0.5; // deterministic

describe('actTestAssembler.buildSlots', () => {
  test('produces exactly totalItems slots', () => {
    const slots = A.buildSlots(bp, fixedRng);
    expect(slots).toHaveLength(bp.totalItems);
    expect(slots).toHaveLength(60);
  });

  test('category counts match the blueprint weights exactly', () => {
    const slots = A.buildSlots(bp, fixedRng);
    const counts = {};
    slots.forEach(s => { counts[s.category] = (counts[s.category] || 0) + 1; });
    expect(counts).toEqual(bp.categoryWeights);
  });

  test('assigns a skill to every slot', () => {
    const slots = A.buildSlots(bp, fixedRng);
    expect(slots.every(s => typeof s.skillId === 'string' && s.skillId.startsWith('act-'))).toBe(true);
  });

  test('positions are 1..60 in order', () => {
    const slots = A.buildSlots(bp, fixedRng);
    expect(slots.map(s => s.position)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
  });

  test('applies the difficulty ramp by position', () => {
    const slots = A.buildSlots(bp, fixedRng);
    expect(slots[0].targetDifficulty).toBe(2);   // pos 1
    expect(slots[19].targetDifficulty).toBe(2);  // pos 20
    expect(slots[20].targetDifficulty).toBe(3);  // pos 21
    expect(slots[39].targetDifficulty).toBe(3);  // pos 40
    expect(slots[40].targetDifficulty).toBe(4);  // pos 41
    expect(slots[59].targetDifficulty).toBe(4);  // pos 60
  });

  test('interleaves categories rather than blocking them', () => {
    const slots = A.buildSlots(bp, fixedRng);
    // No category should occupy a long contiguous run; check the first 6 slots
    // touch several categories (real ACT mixes domains).
    const firstSix = new Set(slots.slice(0, 6).map(s => s.category));
    expect(firstSix.size).toBeGreaterThanOrEqual(4);
  });

  test('is deterministic for a fixed rng and varies skills across seeds', () => {
    const a1 = A.buildSlots(bp, () => 0.5).map(s => s.skillId);
    const a2 = A.buildSlots(bp, () => 0.5).map(s => s.skillId);
    expect(a1).toEqual(a2);
    // A different rng stream should change at least some skill assignments
    let i = 0;
    const varyRng = () => { i += 1; return (i % 7) / 7; };
    const b = A.buildSlots(bp, varyRng).map(s => s.skillId);
    expect(b).not.toEqual(a1);
  });
});

describe('actTestAssembler.skillPool', () => {
  test('returns the 31 ACT content skills, all act- prefixed', () => {
    const pool = A.skillPool();
    expect(pool).toHaveLength(31);
    expect(pool.every(s => s.startsWith('act-'))).toBe(true);
    // excludes test-strategy / modeling skills
    expect(pool).not.toContain('act-pacing-strategy');
    expect(pool).not.toContain('act-model-interpretation');
  });
});

describe('actTestAssembler.rawToScaled', () => {
  test('maps the endpoints and is monotonic non-decreasing', () => {
    expect(A.rawToScaled(60).scaled).toBe(36);
    expect(A.rawToScaled(0).scaled).toBe(1);
    let prev = 0;
    for (let raw = 0; raw <= 60; raw++) {
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
    expect(A.rawToScaled(40).approximate).toBe(true);
  });
});

describe('actTestAssembler.difficultyForPosition', () => {
  test('returns ramped difficulty per band', () => {
    expect(A.difficultyForPosition(bp, 1)).toBe(2);
    expect(A.difficultyForPosition(bp, 30)).toBe(3);
    expect(A.difficultyForPosition(bp, 55)).toBe(4);
  });
});

describe('actTestAssembler diversity (no look-alike problems in one form)', () => {
  test('promptSignature blanks numbers so same-wording items collapse', () => {
    const a = A.promptSignature('A cyclist rides at 5 mph for 3 hours');
    const b = A.promptSignature('A cyclist rides at 8 mph for 2 hours');
    expect(a).toBe(b); // same shape, different numbers
    const c = A.promptSignature('A printer prints at 5 ppm for 3 minutes');
    expect(c).not.toBe(a); // different shape
  });

  test('pickDiverse avoids a shape already used in the form', () => {
    const pool = [
      { problemId: '1', prompt: 'A cyclist rides at 5 mph for 3 hours' },
      { problemId: '2', prompt: 'A printer prints at 5 ppm for 3 minutes' },
    ];
    const used = new Map([[A.promptSignature(pool[0].prompt), 1]]);
    expect(A.pickDiverse(pool, used).problemId).toBe('2');
  });

  test('four draws of one skill spread across four distinct shapes', () => {
    const pool = [
      { problemId: '1', prompt: 'A cyclist rides at 5 mph for 3 hours, then 6 for 3' },
      { problemId: '2', prompt: 'A cyclist rides at 8 mph for 2 hours, then 4 for 3' },
      { problemId: '3', prompt: 'A delivery van drives at 5 mph for 3 hours, then 6 for 2' },
      { problemId: '4', prompt: 'A printer prints at 5 ppm for 3 minutes, then 6 for 2' },
      { problemId: '5', prompt: 'An assembly line produces at 5 uph for 3 hours, then 6 for 2' },
    ];
    const used = new Map();
    const picks = [];
    for (let i = 0; i < 4; i++) {
      const avail = pool.filter(p => !picks.includes(p.problemId));
      const p = A.pickDiverse(avail, used);
      picks.push(p.problemId);
      const sig = A.promptSignature(p.prompt);
      used.set(sig, (used.get(sig) || 0) + 1);
    }
    const shapes = new Set(picks.map(id => A.promptSignature(pool.find(p => p.problemId === id).prompt)));
    expect(shapes.size).toBe(4); // no look-alikes
  });

  test('pickDiverse returns null on an empty pool', () => {
    expect(A.pickDiverse([], new Map())).toBeNull();
  });
});
