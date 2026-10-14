/**
 * utils/studentActivity.js — the one answer to "how active is this student?"
 *
 * Pinned because both failure modes are silent and flattering: a stale weekly
 * counter summed a roster to 1,898 "minutes this week" (true: ~98), and
 * lastLogin-only "last seen" told teachers real students had "Never" logged in.
 */
const {
  WEEK_MS, getEffectiveWeeklyMinutes, resolveLastActiveAt, bucketConversations, applyActivity,
} = require('../../utils/studentActivity');

const NOW = new Date('2026-10-14T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

describe('getEffectiveWeeklyMinutes', () => {
  test('zeroes a counter whose 7-day window lapsed (the inactive-student case)', () => {
    expect(getEffectiveWeeklyMinutes({ weeklyActiveTutoringMinutes: 400, lastWeeklyReset: new Date(NOW - 200 * DAY) }, NOW)).toBe(0);
  });
  test('keeps a counter inside its window', () => {
    expect(getEffectiveWeeklyMinutes({ weeklyActiveTutoringMinutes: 25, lastWeeklyReset: new Date(NOW - 2 * DAY) }, NOW)).toBe(25);
  });
  test('no reset anchor at all counts as lapsed', () => {
    expect(getEffectiveWeeklyMinutes({ weeklyActiveTutoringMinutes: 30 }, NOW)).toBe(0);
  });
  test('falls back to weeklyActiveSeconds', () => {
    expect(getEffectiveWeeklyMinutes({ weeklyActiveSeconds: 610, lastWeeklyReset: new Date(NOW - DAY) }, NOW)).toBe(10);
  });
});

describe('resolveLastActiveAt', () => {
  test('tutoring activity beats a missing lastLogin', () => {
    const t = new Date(NOW - 3 * DAY);
    expect(resolveLastActiveAt({ lastLogin: null }, t).getTime()).toBe(t.getTime());
  });
  test('takes the later of the two', () => {
    const login = new Date(NOW - DAY);
    expect(resolveLastActiveAt({ lastLogin: login }, new Date(NOW - 9 * DAY)).getTime()).toBe(login.getTime());
  });
  test('null when there is no evidence at all', () => {
    expect(resolveLastActiveAt({}, null)).toBeNull();
  });
});

describe('bucketConversations', () => {
  const rows = [
    { userId: 'a', lastActivity: new Date(NOW - 1 * DAY), activeMinutes: 12 },
    { userId: 'a', lastActivity: new Date(NOW - 2 * DAY), activeMinutes: 8 },
    { userId: 'a', lastActivity: new Date(NOW - 8 * DAY), activeMinutes: 5 },
    { userId: 'a', lastActivity: new Date(NOW - 40 * DAY), activeMinutes: 99 }, // beyond 4 weeks
    { userId: 'b', lastActivity: new Date(NOW - 15 * DAY), activeMinutes: 7 },
  ];
  test('rolling weeks, newest first, out-of-range dropped from buckets', () => {
    const idx = bucketConversations(rows, { now: NOW });
    expect(idx.get('a').weeks).toEqual([20, 5, 0, 0]);
    expect(idx.get('a').sessionsThisWeek).toBe(2);
    expect(idx.get('b').weeks).toEqual([0, 0, 7, 0]);
  });
  test('lastActivity is the newest row seen', () => {
    const idx = bucketConversations(rows, { now: NOW });
    expect(idx.get('a').lastActivity.getTime()).toBe(NOW - DAY);
  });
  test('week edge: exactly 7 days old lands in last week', () => {
    const idx = bucketConversations([{ userId: 'c', lastActivity: new Date(NOW - WEEK_MS), activeMinutes: 3 }], { now: NOW });
    expect(idx.get('c').weeks).toEqual([0, 3, 0, 0]);
  });
});

describe('applyActivity', () => {
  test('decorates students and corrects the legacy counter in place', () => {
    const students = [{ _id: 'a', weeklyActiveTutoringMinutes: 74, lastWeeklyReset: new Date(NOW - 90 * DAY), lastLogin: null }];
    const idx = bucketConversations([{ userId: 'a', lastActivity: new Date(NOW - 60 * DAY), activeMinutes: 4 }], { now: NOW });
    applyActivity(students, idx, NOW);
    expect(students[0].weeklyActiveTutoringMinutes).toBe(0);
    expect(students[0].activity.weeklyMinutes).toEqual([0, 0, 0, 0]);
    expect(students[0].activity.lastActiveAt.getTime()).toBe(NOW - 60 * DAY);
  });
  test('a student with no conversations still gets a zeroed block', () => {
    const students = [{ _id: 'z' }];
    applyActivity(students, new Map(), NOW);
    expect(students[0].activity).toEqual({ lastActiveAt: null, weeklyMinutes: [0, 0, 0, 0], sessionsThisWeek: 0 });
  });
});
