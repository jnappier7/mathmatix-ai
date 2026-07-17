// tests/unit/calcBootcamp.test.js
// Unit tests for the AP Calc bootcamp scoring core (pure, DB-free).

const B = require('../../utils/calcBootcamp');

describe('weeklyComposite', () => {
  test('MC + FRQ each weighted 50%', () => {
    // 12/15 MC = 80%, 6/9 FRQ = 66.67% → (80 + 66.67)/2 = 73.3
    expect(B.weeklyComposite(12, 15, 6, 9)).toBeCloseTo(73.3, 1);
  });
  test('falls back to MC-only when the FRQ is not scored yet', () => {
    expect(B.weeklyComposite(9, 15, 0, 0)).toBeCloseTo(60, 1);
  });
  test('perfect and zero', () => {
    expect(B.weeklyComposite(15, 15, 9, 9)).toBe(100);
    expect(B.weeklyComposite(0, 15, 0, 9)).toBe(0);
  });
});

describe('projectBand', () => {
  test('maps composites into 1–5 monotonically', () => {
    expect(B.projectBand(90).band).toBe(5);
    expect(B.projectBand(60).band).toBe(4);
    expect(B.projectBand(50).band).toBe(3);
    expect(B.projectBand(35).band).toBe(2);
    expect(B.projectBand(10).band).toBe(1);
  });
  test('is flagged approximate and never leaves 1–5', () => {
    for (let c = 0; c <= 100; c += 5) {
      const { band, approximate } = B.projectBand(c);
      expect(approximate).toBe(true);
      expect(band).toBeGreaterThanOrEqual(1);
      expect(band).toBeLessThanOrEqual(5);
    }
  });
});

describe('priorityScore', () => {
  test('rises with lower accuracy and higher exam weight', () => {
    expect(B.priorityScore(0.5, 18)).toBeGreaterThan(B.priorityScore(0.5, 6));
    expect(B.priorityScore(0.2, 10)).toBeGreaterThan(B.priorityScore(0.8, 10));
  });
  test('a mastered skill has zero priority', () => {
    expect(B.priorityScore(1, 18)).toBe(0);
  });
});

describe('rankWeakSkills', () => {
  const bySkill = {
    'chain-rule': { correct: 1, total: 3, unit: 'U3', name: 'Chain rule' },       // acc .33, w 11
    ftc: { correct: 3, total: 4, unit: 'U6', name: 'FTC' },                        // acc .75, w 18
    optimization: { correct: 2, total: 2, unit: 'U5', name: 'Optimization' },      // mastered → dropped
    'related-rates': { correct: 0, total: 2, unit: 'U4', name: 'Related rates' },  // acc 0, w 12
  };
  test('drops mastered skills and ranks by priority', () => {
    const ranked = B.rankWeakSkills(bySkill);
    expect(ranked.map(s => s.skillId)).not.toContain('optimization');
    // related-rates: (1-0)*12 = 12 is the top priority here
    expect(ranked[0].skillId).toBe('related-rates');
    expect(ranked.every(s => s.accuracy < 1)).toBe(true);
  });
});

describe('buildWeeklyPlan', () => {
  const ranked = [
    { skillId: 'related-rates', priority: 12 },
    { skillId: 'chain-rule', priority: 7.3 },
    { skillId: 'ftc', priority: 4.5 },
    { skillId: 'u-substitution', priority: 3 },
  ];
  test('takes ≤3 targets plus one retrospective from prior weeks', () => {
    const prior = [{ skillId: 'limits-at-infinity', priority: 5 }];
    const plan = B.buildWeeklyPlan(ranked, prior, 3);
    expect(plan.filter(p => p.kind === 'target')).toHaveLength(3);
    const retro = plan.filter(p => p.kind === 'retrospective');
    expect(retro).toHaveLength(1);
    expect(retro[0].skillId).toBe('limits-at-infinity');
  });
  test('retrospective never duplicates a chosen target', () => {
    const prior = [{ skillId: 'related-rates', priority: 9 }, { skillId: 'mvt-evt', priority: 4 }];
    const plan = B.buildWeeklyPlan(ranked, prior, 3);
    expect(plan.filter(p => p.skillId === 'related-rates')).toHaveLength(1);
    expect(plan.find(p => p.kind === 'retrospective').skillId).toBe('mvt-evt');
  });
});
