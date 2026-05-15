// tests/unit/unlockTutors.test.js
const { getTutorsToUnlock } = require('../../utils/unlockTutors');

describe('getTutorsToUnlock', () => {
  test('returns [] for an invalid userLevel', () => {
    expect(getTutorsToUnlock(0)).toEqual([]);
    expect(getTutorsToUnlock(-5)).toEqual([]);
    expect(getTutorsToUnlock('7')).toEqual([]);
    expect(getTutorsToUnlock(undefined)).toEqual([]);
  });

  test('returns [] at level 1 (below every unlock threshold)', () => {
    expect(getTutorsToUnlock(1, [])).toEqual([]);
  });

  test('always returns an array of string tutor IDs', () => {
    const result = getTutorsToUnlock(15, []);
    expect(Array.isArray(result)).toBe(true);
    result.forEach((id) => expect(typeof id).toBe('string'));
  });

  test('is deterministic for identical inputs', () => {
    expect(getTutorsToUnlock(6, [])).toEqual(getTutorsToUnlock(6, []));
  });

  test('guarantees unlocks at a very high level', () => {
    const result = getTutorsToUnlock(99, []);
    expect(result.length).toBeGreaterThan(0);
  });

  test('never returns a tutor that is already unlocked', () => {
    const all = getTutorsToUnlock(99, []);
    const result = getTutorsToUnlock(99, [all[0]]);
    expect(result).not.toContain(all[0]);
  });

  test('a met behavior trigger produces an early unlock', () => {
    const behaviorStats = [{ behavior: 'persistence', count: 50 }];
    const result = getTutorsToUnlock(6, [], behaviorStats);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});
