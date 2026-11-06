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

  // Every unlockable tutor is now a shop tutor (purchasable:true) and shop
  // tutors are coins-only (owner decision 2026-11-05), so the earned unlock is
  // dormant: nothing unlocks free regardless of level or behavior. If a tutor
  // is ever made earnable again these fail and should move with that change.
  test('returns [] even at a very high level — shop tutors are coins-only', () => {
    expect(getTutorsToUnlock(99, [])).toEqual([]);
  });

  test('returns [] even when a behavior trigger is fully met', () => {
    const behaviorStats = [{ behavior: 'persistence', count: 50 }];
    expect(getTutorsToUnlock(6, [], behaviorStats)).toEqual([]);
  });
});
