/**
 * Tests that bumpDailyStreak (via emitGamificationEvent) uses the user's
 * IANA timezone for day-boundary math, not UTC or server-local. This
 * fixes the bug where students whose local-day boundary doesn't line up
 * with UTC midnight could either lose their streak unfairly or have it
 * advance twice in one local day.
 */

jest.mock('../../utils/logger', () => ({
    child: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

const { emitGamificationEvent } = require('../../utils/gamificationEvents');

function makeUser({ timezone, lastPracticeDate, currentStreak = 5, longestStreak = 10 } = {}) {
    return {
        timezone: timezone || null,
        xp: 0,
        dailyQuests: {
            currentStreak,
            longestStreak,
            lastPracticeDate,
            lastRefreshDate: new Date(),
            streakFreezeUsedAt: null,
            quests: [],
            todayProgress: {},
            totalQuestsCompleted: 0,
        },
    };
}

describe('Streak timezone awareness', () => {
    test('two PT sessions on consecutive local days both at 11pm PT increment by 1, not 2 or 0', () => {
        // Set "now" to 11:30pm PT Tuesday 2026-05-26 = 06:30 UTC Wednesday 2026-05-27
        const originalDate = Date;
        const fixedNow = new originalDate('2026-05-27T06:30:00Z');
        global.Date = class extends originalDate {
            constructor(...args) {
                if (args.length === 0) return new originalDate(fixedNow);
                return new originalDate(...args);
            }
            static now() { return fixedNow.getTime(); }
        };

        try {
            // Last session was 11:30pm PT Monday 2026-05-25 = 06:30 UTC Tuesday 2026-05-26
            const lastPracticeDate = new originalDate('2026-05-26T06:30:00Z');

            const user = makeUser({
                timezone: 'America/Los_Angeles',
                lastPracticeDate,
                currentStreak: 5,
            });

            emitGamificationEvent(user, 'problemSolved', { correct: true });

            // Consecutive PT days → streak +1
            expect(user.dailyQuests.currentStreak).toBe(6);
        } finally {
            global.Date = originalDate;
        }
    });

    test('UTC fallback when user.timezone is null preserves existing behavior', () => {
        // Two sessions ~24h apart, no TZ set → should still increment
        const originalDate = Date;
        const fixedNow = new originalDate('2026-05-26T12:00:00Z');
        global.Date = class extends originalDate {
            constructor(...args) {
                if (args.length === 0) return new originalDate(fixedNow);
                return new originalDate(...args);
            }
            static now() { return fixedNow.getTime(); }
        };

        try {
            const lastPracticeDate = new originalDate('2026-05-25T12:00:00Z');
            const user = makeUser({
                timezone: null,  // fall back to UTC
                lastPracticeDate,
                currentStreak: 3,
            });

            emitGamificationEvent(user, 'problemSolved', { correct: true });
            expect(user.dailyQuests.currentStreak).toBe(4);
        } finally {
            global.Date = originalDate;
        }
    });

    test('same-day repeat in user TZ keeps streak unchanged (not double-incremented)', () => {
        const originalDate = Date;
        // 8pm PT same day as last session at 9am PT
        const fixedNow = new originalDate('2026-05-26T03:00:00Z'); // 8pm PT Mon
        global.Date = class extends originalDate {
            constructor(...args) {
                if (args.length === 0) return new originalDate(fixedNow);
                return new originalDate(...args);
            }
            static now() { return fixedNow.getTime(); }
        };

        try {
            // Last session: 9am PT Mon = 4pm UTC Mon
            const lastPracticeDate = new originalDate('2026-05-25T16:00:00Z');
            const user = makeUser({
                timezone: 'America/Los_Angeles',
                lastPracticeDate,
                currentStreak: 7,
            });

            emitGamificationEvent(user, 'problemSolved', { correct: true });
            expect(user.dailyQuests.currentStreak).toBe(7); // unchanged
        } finally {
            global.Date = originalDate;
        }
    });

    test('two-plus calendar days in user TZ still resets streak', () => {
        const originalDate = Date;
        const fixedNow = new originalDate('2026-05-28T20:00:00Z'); // Thu UTC
        global.Date = class extends originalDate {
            constructor(...args) {
                if (args.length === 0) return new originalDate(fixedNow);
                return new originalDate(...args);
            }
            static now() { return fixedNow.getTime(); }
        };

        try {
            // 3 days ago in PT
            const lastPracticeDate = new originalDate('2026-05-25T16:00:00Z');
            const user = makeUser({
                timezone: 'America/Los_Angeles',
                lastPracticeDate,
                currentStreak: 12,
                longestStreak: 12,
            });

            const result = emitGamificationEvent(user, 'problemSolved', { correct: true });
            expect(user.dailyQuests.currentStreak).toBe(1);
            expect(result.streakLost).toBe(12);
            expect(user.dailyQuests.longestStreak).toBe(12); // preserved
        } finally {
            global.Date = originalDate;
        }
    });
});
