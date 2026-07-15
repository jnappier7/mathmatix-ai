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

  test('applies the difficulty ramp (Q1-15 / 16-30 / 31-45)', () => {
    const slots = A.buildSlots(bp, fixedRng);
    expect(slots[0].targetDifficulty).toBe(2);   // pos 1
    expect(slots[14].targetDifficulty).toBe(2);  // pos 15
    expect(slots[15].targetDifficulty).toBe(3);  // pos 16
    expect(slots[29].targetDifficulty).toBe(3);  // pos 30
    expect(slots[30].targetDifficulty).toBe(4);  // pos 31
    expect(slots[44].targetDifficulty).toBe(4);  // pos 45
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
  test('returns the 6 ACT category skills, all act- prefixed', () => {
    const pool = A.skillPool();
    expect(pool).toHaveLength(6);
    expect(pool.every(s => s.startsWith('act-'))).toBe(true);
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
  test('returns ramped difficulty per band', () => {
    expect(A.difficultyForPosition(bp, 1)).toBe(2);
    expect(A.difficultyForPosition(bp, 20)).toBe(3);
    expect(A.difficultyForPosition(bp, 40)).toBe(4);
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
});
