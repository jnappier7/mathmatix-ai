// tests/unit/strategyBadges.test.js
// Unit tests for utils/strategyBadges.js — pattern-based badge detection

const {
  STRATEGY_BADGES,
  detectStrategyBadge,
  getStrategyBadge,
  getAllStrategyBadges,
  getStrategyBadgesByCategory
} = require('../../utils/strategyBadges');

describe('STRATEGY_BADGES catalog', () => {
  test('contains a non-trivial number of badges', () => {
    expect(Object.keys(STRATEGY_BADGES).length).toBeGreaterThanOrEqual(8);
  });

  test('every badge has the required shape', () => {
    for (const [id, b] of Object.entries(STRATEGY_BADGES)) {
      expect(b.badgeId).toBe(id);
      expect(b.badgeName).toBeTruthy();
      expect(b.category).toBeTruthy();
      expect(b.triggerCriteria).toBeDefined();
      expect(b.triggerCriteria.detectionPattern).toBeTruthy();
      expect(typeof b.triggerCriteria.requiredInstances).toBe('number');
    }
  });
});

describe('getStrategyBadge / getAllStrategyBadges / byCategory', () => {
  test('looks up badge by id', () => {
    const b = getStrategyBadge('double-distribution-disciple');
    expect(b).toBeTruthy();
    expect(b.category).toBe('algebra');
  });

  test('returns null for unknown id', () => {
    expect(getStrategyBadge('not-a-badge')).toBeNull();
  });

  test('returns full list', () => {
    expect(getAllStrategyBadges()).toEqual(expect.arrayContaining([
      expect.objectContaining({ badgeId: 'double-distribution-disciple' })
    ]));
  });

  test('filters by category', () => {
    const algebra = getStrategyBadgesByCategory('algebra');
    expect(algebra.length).toBeGreaterThan(0);
    for (const b of algebra) expect(b.category).toBe('algebra');
  });
});

describe('detectStrategyBadge', () => {
  test('skips badges the user already owns', () => {
    const attempts = Array(10).fill({
      correct: true,
      problemType: 'expand-binomials',
      usedDistribution: true,
      skillId: 'expand-binomials'
    });
    const owned = [{ badgeId: 'double-distribution-disciple' }];
    const earned = detectStrategyBadge('u1', attempts, owned);
    expect(earned.find(b => b.badgeId === 'double-distribution-disciple')).toBeUndefined();
  });

  test('awards "double-distribution-disciple" after enough qualifying attempts', () => {
    const attempts = Array(5).fill({
      correct: true,
      problemType: 'expand-binomials',
      usedDistribution: true,
      skillId: 'expand-binomials',
      problemId: 'p'
    });
    const earned = detectStrategyBadge('u1', attempts, []);
    expect(earned.find(b => b.badgeId === 'double-distribution-disciple')).toBeTruthy();
  });

  test('does not award when attempts are wrong even if pattern matches', () => {
    const attempts = Array(5).fill({
      correct: false,
      problemType: 'expand-binomials',
      usedDistribution: true,
      skillId: 'expand-binomials'
    });
    const earned = detectStrategyBadge('u1', attempts, []);
    expect(earned.find(b => b.badgeId === 'double-distribution-disciple')).toBeUndefined();
  });

  test('attempts in unrelated skills do not count toward a badge', () => {
    const attempts = Array(10).fill({
      correct: true,
      problemType: 'expand-binomials',
      usedDistribution: true,
      skillId: 'unrelated-skill'
    });
    const earned = detectStrategyBadge('u1', attempts, []);
    expect(earned.find(b => b.badgeId === 'double-distribution-disciple')).toBeUndefined();
  });

  test('records triggerContext on earned badge', () => {
    const attempts = Array(5).fill(null).map((_, i) => ({
      correct: true,
      problemType: 'expand-binomials',
      usedDistribution: true,
      skillId: 'expand-binomials',
      problemId: `p${i}`
    }));
    const earned = detectStrategyBadge('u1', attempts, []);
    const found = earned.find(b => b.badgeId === 'double-distribution-disciple');
    expect(found.triggerContext.problemIds.length).toBe(3);
    expect(found.triggerContext.detectionReason).toBeDefined();
  });

  test('returns empty array on empty attempt history', () => {
    expect(detectStrategyBadge('u1', [], [])).toEqual([]);
  });
});
