/**
 * QA P1-6 — XP progress must reconcile.
 *
 * The Progress card showed "577 / 140" (current > next) with Total XP 528:
 * a total-XP value was paired with a next-level threshold (and a stale
 * level). xpProgress derives everything from levelForXp so within-level XP
 * is ALWAYS in [0, xpForNextLevel).
 */

const BRAND = require('../../utils/brand');
const { levelForXp, xpProgress, cumulativeXpForLevel, xpRequiredForLevel } = BRAND;

describe('levelForXp', () => {
  test('xp 0 → level 1', () => expect(levelForXp(0)).toBe(1));
  test('reaches the next level exactly at the cumulative threshold', () => {
    for (let lvl = 1; lvl <= 20; lvl++) {
      const atThreshold = cumulativeXpForLevel(lvl);
      expect(levelForXp(atThreshold)).toBe(lvl);
      if (lvl > 1) expect(levelForXp(atThreshold - 1)).toBe(lvl - 1);
    }
  });
  test('528 XP → level 5 (the report account)', () => {
    // cumulative: L5=460, L6=600 → 528 is level 5.
    expect(levelForXp(528)).toBe(5);
  });
  test('handles null/undefined/negative safely', () => {
    expect(levelForXp(undefined)).toBe(1);
    expect(levelForXp(null)).toBe(1);
    expect(levelForXp(-50)).toBe(1);
  });
});

describe('xpProgress — the broken-fraction guard', () => {
  test('528 XP → level 5, 68 / 140 (not 577 / 140)', () => {
    expect(xpProgress(528)).toEqual({ level: 5, xpForCurrentLevel: 68, xpForNextLevel: 140 });
  });

  test('xpForCurrentLevel is ALWAYS in [0, xpForNextLevel) across a wide range', () => {
    for (let xp = 0; xp <= 20000; xp += 37) {
      const p = xpProgress(xp);
      expect(p.xpForCurrentLevel).toBeGreaterThanOrEqual(0);
      expect(p.xpForCurrentLevel).toBeLessThan(p.xpForNextLevel);
      // current level XP + cumulative-to-level reconstructs total exactly
      expect(cumulativeXpForLevel(p.level) + p.xpForCurrentLevel).toBe(xp);
    }
  });

  test('exactly at a level boundary → 0 progress into the new level', () => {
    const p = xpProgress(cumulativeXpForLevel(6)); // 600
    expect(p.level).toBe(6);
    expect(p.xpForCurrentLevel).toBe(0);
    expect(p.xpForNextLevel).toBe(xpRequiredForLevel(6));
  });

  test('xp 0 → level 1, 0 / 100', () => {
    expect(xpProgress(0)).toEqual({ level: 1, xpForCurrentLevel: 0, xpForNextLevel: 100 });
  });
});
