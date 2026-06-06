// tests/unit/streakFreeze.test.js
// Tests for the weekly streak freeze mechanic in gamificationEvents

// Mock logger before importing
jest.mock('../../utils/logger', () => ({
    child: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

const { emitGamificationEvent } = require('../../utils/gamificationEvents');

function makeUser(overrides = {}) {
    return {
        dailyQuests: {
            currentStreak: 5,
            longestStreak: 10,
            lastPracticeDate: null,
            lastRefreshDate: new Date(), // Prevent quest refresh
            streakFreezeUsedAt: null,
            quests: [
                { target: 'problemsCorrect', progress: 0, goal: 3, completed: false, xpReward: 20 },
            ],
            todayProgress: {},
            totalQuestsCompleted: 0,
            ...overrides,
        },
    };
}

function daysAgo(n) {
    // UTC-anchored on purpose: the production day-boundary diff uses UTC (the
    // no-timezone fallback). Local setDate/setHours would land n+1 UTC-days back
    // whenever the process TZ's calendar date differs from UTC, shifting every
    // expectation by one — the bug below.
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    d.setUTCHours(12, 0, 0, 0); // Noon UTC, far from any day boundary
    return d;
}

// Freeze "now" to a fixed instant so the suite is deterministic regardless of
// when (wall-clock) it runs. Combined with the UTC-anchored daysAgo above, this
// makes the streak math identical under any process timezone — previously these
// date-based tests failed nondeterministically when the file happened to run in
// a parallel worker during the window where process-local date trailed UTC.
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

describe('Streak Freeze Mechanic', () => {

    test('consecutive day practice increments streak normally', () => {
        const user = makeUser({ lastPracticeDate: daysAgo(1), currentStreak: 5 });
        const result = emitGamificationEvent(user, 'problemSolved', { correct: true });

        expect(user.dailyQuests.currentStreak).toBe(6);
        expect(result.streakFreezeUsed).toBeUndefined();
    });

    test('same day practice keeps streak unchanged', () => {
        const user = makeUser({ lastPracticeDate: new Date(), currentStreak: 5 });
        emitGamificationEvent(user, 'problemSolved', { correct: true });

        expect(user.dailyQuests.currentStreak).toBe(5);
    });

    test('missing 1 day auto-applies streak freeze (first use)', () => {
        const user = makeUser({
            lastPracticeDate: daysAgo(2),
            currentStreak: 7,
            streakFreezeUsedAt: null,
        });
        const result = emitGamificationEvent(user, 'problemSolved', { correct: true });

        expect(user.dailyQuests.currentStreak).toBe(8); // Streak preserved + incremented
        expect(result.streakFreezeUsed).toBe(true);
        expect(user.dailyQuests.streakFreezeUsedAt).toBeTruthy();
    });

    test('missing 1 day with freeze already used this week resets streak', () => {
        // Pick a timestamp "recently in the current week", computed against
        // production's week boundary (Sunday 00:00 UTC, matching
        // canUseStreakFreeze in utils/gamificationEvents.js). The naive
        // "1 hour ago" lands in last week if CI runs in the first hour of
        // a new calendar week — May 24 2026 Sunday tripped this assertion.
        const now = new Date();
        const weekStartMs = Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - now.getUTCDay()
        );
        const recentFreezeTime = new Date(Math.max(
            weekStartMs + 1000,           // safely inside this week
            Date.now() - 60 * 60 * 1000   // or 1 hour ago, whichever is later
        ));
        const user = makeUser({
            lastPracticeDate: daysAgo(2),
            currentStreak: 7,
            streakFreezeUsedAt: recentFreezeTime,
        });
        const result = emitGamificationEvent(user, 'problemSolved', { correct: true });

        expect(user.dailyQuests.currentStreak).toBe(1); // Streak reset
        expect(result.streakFreezeUsed).toBeUndefined();
        expect(result.streakLost).toBe(7);
    });

    test('missing 2+ days always resets streak (no freeze)', () => {
        const user = makeUser({
            lastPracticeDate: daysAgo(3),
            currentStreak: 10,
            streakFreezeUsedAt: null,
        });
        const result = emitGamificationEvent(user, 'problemSolved', { correct: true });

        expect(user.dailyQuests.currentStreak).toBe(1);
        expect(result.streakLost).toBe(10);
        expect(result.streakFreezeUsed).toBeUndefined();
    });

    test('missing 5 days resets streak even with freeze available', () => {
        const user = makeUser({
            lastPracticeDate: daysAgo(6),
            currentStreak: 15,
            streakFreezeUsedAt: null,
        });
        emitGamificationEvent(user, 'problemSolved', { correct: true });

        expect(user.dailyQuests.currentStreak).toBe(1);
    });

    test('streak freeze resets after a new week', () => {
        // Freeze used last week (8 days ago — guaranteed to be in a previous week)
        const user = makeUser({
            lastPracticeDate: daysAgo(2),
            currentStreak: 5,
            streakFreezeUsedAt: daysAgo(8),
        });
        const result = emitGamificationEvent(user, 'problemSolved', { correct: true });

        expect(user.dailyQuests.currentStreak).toBe(6); // Freeze available again
        expect(result.streakFreezeUsed).toBe(true);
    });

    test('first practice ever starts streak at 1', () => {
        const user = makeUser({
            lastPracticeDate: null,
            currentStreak: 0,
        });
        emitGamificationEvent(user, 'problemSolved', { correct: true });

        expect(user.dailyQuests.currentStreak).toBe(1);
    });

    test('streak freeze preserves longestStreak update', () => {
        const user = makeUser({
            lastPracticeDate: daysAgo(2),
            currentStreak: 10,
            longestStreak: 10,
            streakFreezeUsedAt: null,
        });
        emitGamificationEvent(user, 'problemSolved', { correct: true });

        expect(user.dailyQuests.currentStreak).toBe(11);
        expect(user.dailyQuests.longestStreak).toBe(11);
    });

    test('streakLost reports the lost streak value', () => {
        const user = makeUser({
            lastPracticeDate: daysAgo(4),
            currentStreak: 25,
        });
        const result = emitGamificationEvent(user, 'problemSolved', { correct: true });

        expect(result.streakLost).toBe(25);
        expect(user.dailyQuests.currentStreak).toBe(1);
    });
});
