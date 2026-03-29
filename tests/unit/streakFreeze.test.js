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
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(12, 0, 0, 0); // Noon to avoid edge cases
    return d;
}

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
        // Set freeze used at a time that's guaranteed to be in the current week
        // (1 hour ago is always within this calendar week)
        const recentFreezeTime = new Date(Date.now() - 60 * 60 * 1000);
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
