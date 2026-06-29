// tests/unit/bumpDailyStreak.test.js
// Tests for the bumpDailyStreak helper. Streak updates must NOT depend on
// problem classification — reaching this code means the student engaged in
// a substantive session turn. Prior bug: streak was gated behind a flaky
// turn-classifier and stuck at 2 days for months of active use.

jest.mock('../../utils/logger', () => ({
    child: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

const { bumpDailyStreak } = require('../../utils/gamificationEvents');

function daysAgo(n) {
    // UTC-anchored to match the production day-boundary diff (UTC fallback for
    // users with no timezone). Local setDate/setHours would drift a day whenever
    // the process TZ's calendar date differs from UTC.
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    d.setUTCHours(12, 0, 0, 0);
    return d;
}

// Freeze "now" to a fixed instant so the suite is deterministic regardless of
// when (wall-clock) it runs. Combined with the UTC-anchored daysAgo above, the
// streak math is identical under any process timezone — previously this suite
// failed nondeterministically under parallel runs when it landed in a worker
// during the window where process-local date trailed UTC. super(FIXED_NOW)
// (not a returned RealDate) keeps `new Date()` an instanceof Date.
const RealDate = Date;
const FIXED_NOW = RealDate.UTC(2026, 5, 17, 17, 0, 0); // Wed 2026-06-17 17:00 UTC
class FixedDate extends RealDate {
    constructor(...args) {
        if (args.length === 0) { super(FIXED_NOW); } else { super(...args); }
    }
    static now() { return FIXED_NOW; }
}
beforeEach(() => { global.Date = FixedDate; });
afterEach(() => { global.Date = RealDate; });

describe('bumpDailyStreak', () => {

    test('initializes dailyQuests when missing', () => {
        const user = {};
        bumpDailyStreak(user);
        expect(user.dailyQuests).toBeDefined();
        expect(user.dailyQuests.currentStreak).toBe(1);
        expect(user.dailyQuests.lastPracticeDate).toBeInstanceOf(Date);
    });

    test('first-ever practice starts streak at 1', () => {
        const user = { dailyQuests: { currentStreak: 0, longestStreak: 0, lastPracticeDate: null } };
        bumpDailyStreak(user);
        expect(user.dailyQuests.currentStreak).toBe(1);
        expect(user.dailyQuests.longestStreak).toBe(1);
    });

    test('same-day repeat does not change streak', () => {
        const user = { dailyQuests: { currentStreak: 7, longestStreak: 10, lastPracticeDate: new Date() } };
        bumpDailyStreak(user);
        expect(user.dailyQuests.currentStreak).toBe(7);
    });

    test('consecutive day increments streak', () => {
        const user = { dailyQuests: { currentStreak: 4, longestStreak: 4, lastPracticeDate: daysAgo(1) } };
        bumpDailyStreak(user);
        expect(user.dailyQuests.currentStreak).toBe(5);
        expect(user.dailyQuests.longestStreak).toBe(5);
    });

    test('one missed day consumes weekly freeze and increments', () => {
        const user = { dailyQuests: { currentStreak: 6, longestStreak: 6, lastPracticeDate: daysAgo(2), streakFreezeUsedAt: null } };
        const result = bumpDailyStreak(user);
        expect(user.dailyQuests.currentStreak).toBe(7);
        expect(result.streakFreezeUsed).toBe(true);
        expect(user.dailyQuests.streakFreezeUsedAt).toBeInstanceOf(Date);
    });

    test('one missed day with freeze already used this week resets streak', () => {
        const now = new Date();
        const weekStartMs = Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - now.getUTCDay()
        );
        const recentFreezeTime = new Date(Math.max(
            weekStartMs + 1000,
            Date.now() - 60 * 60 * 1000
        ));
        const user = { dailyQuests: { currentStreak: 9, longestStreak: 9, lastPracticeDate: daysAgo(2), streakFreezeUsedAt: recentFreezeTime } };
        const result = bumpDailyStreak(user);
        expect(user.dailyQuests.currentStreak).toBe(1);
        expect(result.streakLost).toBe(9);
        expect(result.streakFreezeUsed).toBeUndefined();
    });

    test('two-plus missed days always resets streak', () => {
        const user = { dailyQuests: { currentStreak: 20, longestStreak: 25, lastPracticeDate: daysAgo(3), streakFreezeUsedAt: null } };
        const result = bumpDailyStreak(user);
        expect(user.dailyQuests.currentStreak).toBe(1);
        expect(result.streakLost).toBe(20);
        expect(user.dailyQuests.longestStreak).toBe(25);
    });

    test('updates lastPracticeDate to now on every call', () => {
        const old = daysAgo(1);
        const user = { dailyQuests: { currentStreak: 3, lastPracticeDate: old } };
        bumpDailyStreak(user);
        expect(user.dailyQuests.lastPracticeDate.getTime()).toBeGreaterThan(old.getTime());
    });

    test('does not require a problem classification or quest data', () => {
        // Regression: prior bug gated streak on problemAnswered + quests.length > 0.
        // This helper must work on a bare engagement signal.
        const user = { dailyQuests: { currentStreak: 2, lastPracticeDate: daysAgo(1) } };
        bumpDailyStreak(user);
        expect(user.dailyQuests.currentStreak).toBe(3);
    });

    test('longestStreak only updates when surpassed', () => {
        const user = { dailyQuests: { currentStreak: 4, longestStreak: 50, lastPracticeDate: daysAgo(1) } };
        bumpDailyStreak(user);
        expect(user.dailyQuests.currentStreak).toBe(5);
        expect(user.dailyQuests.longestStreak).toBe(50);
    });
});
