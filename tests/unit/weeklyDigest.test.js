// tests/unit/weeklyDigest.test.js
// Tests for the enhanced weekly parent email digest

jest.mock('../../utils/fsrsScheduler', () => ({
    calculateRetrievability: jest.fn((elapsed, stability) => {
        if (stability <= 0 || elapsed < 0) return 0;
        if (elapsed === 0) return 1;
        return Math.pow(1 + elapsed / (9 * stability), -1);
    }),
}));

jest.mock('../../models/user', () => ({}));
jest.mock('../../models/conversation', () => ({}));
jest.mock('../../utils/emailService', () => ({
    sendParentWeeklyReport: jest.fn().mockResolvedValue({ success: true }),
}));

const { shouldSendReport, buildDigestInsights } = require('../../scripts/weeklyDigest');

describe('Weekly Digest', () => {

    describe('shouldSendReport', () => {

        test('daily frequency always returns true', () => {
            expect(shouldSendReport({ reportFrequency: 'daily' })).toBe(true);
        });

        test('never frequency always returns false', () => {
            expect(shouldSendReport({ reportFrequency: 'never' })).toBe(false);
        });

        test('weekly sends on Sunday', () => {
            jest.spyOn(Date.prototype, 'getDay').mockReturnValue(0);
            expect(shouldSendReport({ reportFrequency: 'weekly' })).toBe(true);
            jest.restoreAllMocks();
        });

        test('weekly does not send on Monday', () => {
            jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1);
            expect(shouldSendReport({ reportFrequency: 'weekly' })).toBe(false);
            jest.restoreAllMocks();
        });

        test('defaults to weekly when no frequency set', () => {
            jest.spyOn(Date.prototype, 'getDay').mockReturnValue(0);
            expect(shouldSendReport({})).toBe(true);
            jest.restoreAllMocks();

            jest.spyOn(Date.prototype, 'getDay').mockReturnValue(3);
            expect(shouldSendReport({})).toBe(false);
            jest.restoreAllMocks();
        });

        test('monthly sends on 1st of month', () => {
            jest.spyOn(Date.prototype, 'getDate').mockReturnValue(1);
            expect(shouldSendReport({ reportFrequency: 'monthly' })).toBe(true);
            jest.restoreAllMocks();
        });

        test('monthly does not send on other days', () => {
            jest.spyOn(Date.prototype, 'getDate').mockReturnValue(15);
            expect(shouldSendReport({ reportFrequency: 'monthly' })).toBe(false);
            jest.restoreAllMocks();
        });
    });

    describe('buildDigestInsights', () => {

        test('generates engagement insight for active week', () => {
            const insights = buildDigestInsights({
                sessionCount: 7,
                accuracy: 80,
                masteryGained: 0,
                memoryHealth: { strong: 5, fading: 0, needsReview: 0 },
                avgCogLoad: 0.4,
                cognitiveLoadTrend: 'stable',
                achievements: [],
                currentStreak: 0,
            });
            const engagement = insights.find(i => i.type === 'engagement');
            expect(engagement).toBeTruthy();
            expect(engagement.tone).toBe('positive');
            expect(engagement.message).toContain('7 practice sessions');
        });

        test('generates actionable insight for no sessions', () => {
            const insights = buildDigestInsights({
                sessionCount: 0,
                accuracy: 0,
                masteryGained: 0,
                memoryHealth: { strong: 0, fading: 0, needsReview: 0 },
                avgCogLoad: 0,
                cognitiveLoadTrend: 'no-data',
                achievements: [],
                currentStreak: 0,
            });
            const engagement = insights.find(i => i.type === 'engagement');
            expect(engagement).toBeTruthy();
            expect(engagement.tone).toBe('actionable');
        });

        test('generates accuracy insight for high performance', () => {
            const insights = buildDigestInsights({
                sessionCount: 3,
                accuracy: 92,
                masteryGained: 0,
                memoryHealth: { strong: 5, fading: 0, needsReview: 0 },
                avgCogLoad: 0.3,
                cognitiveLoadTrend: 'stable',
                achievements: [],
                currentStreak: 0,
            });
            const acc = insights.find(i => i.type === 'accuracy');
            expect(acc).toBeTruthy();
            expect(acc.tone).toBe('positive');
            expect(acc.message).toContain('92%');
        });

        test('generates concern for low accuracy', () => {
            const insights = buildDigestInsights({
                sessionCount: 3,
                accuracy: 45,
                masteryGained: 0,
                memoryHealth: { strong: 0, fading: 0, needsReview: 0 },
                avgCogLoad: 0.5,
                cognitiveLoadTrend: 'stable',
                achievements: [],
                currentStreak: 0,
            });
            const acc = insights.find(i => i.type === 'accuracy');
            expect(acc.tone).toBe('concern');
        });

        test('generates memory insight when skills need review', () => {
            const insights = buildDigestInsights({
                sessionCount: 3,
                accuracy: 80,
                masteryGained: 0,
                memoryHealth: { strong: 2, fading: 1, needsReview: 3 },
                avgCogLoad: 0.4,
                cognitiveLoadTrend: 'stable',
                achievements: [],
                currentStreak: 0,
            });
            const mem = insights.find(i => i.type === 'memory');
            expect(mem).toBeTruthy();
            expect(mem.tone).toBe('actionable');
            expect(mem.message).toContain('3 skills');
        });

        test('generates positive memory insight for strong retention', () => {
            const insights = buildDigestInsights({
                sessionCount: 3,
                accuracy: 80,
                masteryGained: 0,
                memoryHealth: { strong: 8, fading: 0, needsReview: 0 },
                avgCogLoad: 0.4,
                cognitiveLoadTrend: 'stable',
                achievements: [],
                currentStreak: 0,
            });
            const mem = insights.find(i => i.type === 'memory');
            expect(mem).toBeTruthy();
            expect(mem.tone).toBe('positive');
            expect(mem.message).toContain('8 skills');
        });

        test('generates cognitive load concern when rising', () => {
            const insights = buildDigestInsights({
                sessionCount: 3,
                accuracy: 80,
                masteryGained: 0,
                memoryHealth: { strong: 5, fading: 0, needsReview: 0 },
                avgCogLoad: 0.75,
                cognitiveLoadTrend: 'rising',
                achievements: [],
                currentStreak: 0,
            });
            const cog = insights.find(i => i.type === 'cognitive');
            expect(cog).toBeTruthy();
            expect(cog.tone).toBe('concern');
        });

        test('generates mastery insight when skills mastered', () => {
            const insights = buildDigestInsights({
                sessionCount: 3,
                accuracy: 80,
                masteryGained: 4,
                memoryHealth: { strong: 5, fading: 0, needsReview: 0 },
                avgCogLoad: 0.4,
                cognitiveLoadTrend: 'stable',
                achievements: [],
                currentStreak: 0,
            });
            const mastery = insights.find(i => i.type === 'mastery');
            expect(mastery).toBeTruthy();
            expect(mastery.message).toContain('4 new skills');
        });

        test('generates streak insight for 7+ day streak', () => {
            const insights = buildDigestInsights({
                sessionCount: 7,
                accuracy: 80,
                masteryGained: 0,
                memoryHealth: { strong: 5, fading: 0, needsReview: 0 },
                avgCogLoad: 0.4,
                cognitiveLoadTrend: 'stable',
                achievements: [],
                currentStreak: 14,
            });
            const streak = insights.find(i => i.type === 'streak');
            expect(streak).toBeTruthy();
            expect(streak.message).toContain('14-day');
        });

        test('generates badge insight when badges earned', () => {
            const insights = buildDigestInsights({
                sessionCount: 3,
                accuracy: 80,
                masteryGained: 0,
                memoryHealth: { strong: 5, fading: 0, needsReview: 0 },
                avgCogLoad: 0.4,
                cognitiveLoadTrend: 'stable',
                achievements: [{ key: 'badge1' }, { key: 'badge2' }],
                currentStreak: 0,
            });
            const badges = insights.find(i => i.type === 'badges');
            expect(badges).toBeTruthy();
            expect(badges.message).toContain('2 new badges');
        });

        test('limits to top 4 insights', () => {
            const insights = buildDigestInsights({
                sessionCount: 8,
                accuracy: 92,
                masteryGained: 5,
                memoryHealth: { strong: 10, fading: 2, needsReview: 3 },
                avgCogLoad: 0.8,
                cognitiveLoadTrend: 'rising',
                achievements: [{ key: 'a' }, { key: 'b' }],
                currentStreak: 21,
            });
            expect(insights.length).toBeLessThanOrEqual(4);
        });
    });
});
