// tests/unit/nextActionSuggestions.test.js
// Tests for the "What's Next?" suggestion engine

jest.mock('../../utils/fsrsScheduler', () => ({
    calculateRetrievability: jest.fn((elapsed, stability) => {
        if (stability === 0) return 0;
        return Math.pow(1 + elapsed / (9 * stability), -1);
    }),
}));

const { getNextActions } = require('../../utils/nextActionSuggestions');

function makeUser(overrides = {}) {
    return {
        level: 5,
        dailyQuests: {
            currentStreak: 3,
            longestStreak: 10,
            quests: [],
            ...(overrides.dailyQuests || {}),
        },
        learningEngines: {
            bkt: {},
            fsrs: {},
            consistency: {},
            cognitiveLoadHistory: [],
            ...(overrides.learningEngines || {}),
        },
        skillMastery: overrides.skillMastery || {},
        factFluencyProgress: overrides.factFluencyProgress || null,
        ...overrides,
    };
}

describe('Next Action Suggestions', () => {

    test('returns empty array for user with no data and no context', () => {
        const user = makeUser();
        const result = getNextActions(user);
        expect(Array.isArray(result)).toBe(true);
    });

    test('returns max 3 suggestions', () => {
        const now = Date.now();
        const user = makeUser({
            dailyQuests: {
                currentStreak: 6, // One day from milestone
                quests: [
                    { completed: false, target: 'problemsCorrect', progress: 2, goal: 3 },
                ],
            },
            learningEngines: {
                fsrs: {
                    'algebra': { stability: 1, lastReview: new Date(now - 30 * 86400000).toISOString() },
                    'fractions': { stability: 2, lastReview: new Date(now - 20 * 86400000).toISOString() },
                },
            },
            skillMastery: {
                'geometry': { masteryScore: 80, status: 'practicing' },
            },
            factFluencyProgress: {
                stats: { lastPracticeDate: new Date(now - 10 * 86400000) },
            },
        });

        const result = getNextActions(user);
        expect(result.length).toBeLessThanOrEqual(3);
    });

    test('suggests memory review when skills are fading', () => {
        const now = Date.now();
        const user = makeUser({
            learningEngines: {
                fsrs: {
                    'long-division': { stability: 1, lastReview: new Date(now - 30 * 86400000).toISOString() },
                },
            },
        });

        const result = getNextActions(user);
        const memoryAction = result.find(s => s.type === 'memory-review');
        expect(memoryAction).toBeDefined();
        expect(memoryAction.title).toBe('Quick Review');
        expect(memoryAction.message).toContain('Long Division');
    });

    test('suggests near-mastery skills', () => {
        const user = makeUser({
            skillMastery: {
                'adding-fractions': { masteryScore: 85, status: 'practicing' },
            },
        });

        const result = getNextActions(user);
        const nearMasteryAction = result.find(s => s.type === 'near-mastery');
        expect(nearMasteryAction).toBeDefined();
        expect(nearMasteryAction.message).toContain('10%');
        expect(nearMasteryAction.message).toContain('Adding Fractions');
    });

    test('does not suggest near-mastery for already mastered skills', () => {
        const user = makeUser({
            skillMastery: {
                'algebra-basics': { masteryScore: 98, status: 'mastered' },
            },
        });

        const result = getNextActions(user);
        const nearMasteryAction = result.find(s => s.type === 'near-mastery');
        expect(nearMasteryAction).toBeUndefined();
    });

    test('suggests completing daily quests when 1-2 remain', () => {
        const user = makeUser({
            dailyQuests: {
                currentStreak: 3,
                quests: [
                    { completed: true, target: 'problemsCorrect' },
                    { completed: false, target: 'skillPracticed' },
                ],
            },
        });

        const result = getNextActions(user);
        const questAction = result.find(s => s.type === 'daily-quests');
        expect(questAction).toBeDefined();
        expect(questAction.title).toBe('One Quest Left!');
    });

    test('does not suggest quests when all are complete', () => {
        const user = makeUser({
            dailyQuests: {
                currentStreak: 3,
                quests: [
                    { completed: true },
                    { completed: true },
                    { completed: true },
                ],
            },
        });

        const result = getNextActions(user);
        const questAction = result.find(s => s.type === 'daily-quests');
        expect(questAction).toBeUndefined();
    });

    test('shows streak freeze notification when context says it was used', () => {
        const user = makeUser({ dailyQuests: { currentStreak: 8 } });
        const result = getNextActions(user, { streakFreezeUsed: true });

        const freezeAction = result.find(s => s.type === 'streak-freeze');
        expect(freezeAction).toBeDefined();
        expect(freezeAction.message).toContain('8-day streak');
        expect(freezeAction.message).toContain('protected');
    });

    test('shows streak lost message for significant streaks', () => {
        const user = makeUser();
        const result = getNextActions(user, { streakLost: 15 });

        const lostAction = result.find(s => s.type === 'streak-lost');
        expect(lostAction).toBeDefined();
        expect(lostAction.message).toContain('15-day streak');
    });

    test('does not show streak lost for small streaks', () => {
        const user = makeUser();
        const result = getNextActions(user, { streakLost: 2 });

        const lostAction = result.find(s => s.type === 'streak-lost');
        expect(lostAction).toBeUndefined();
    });

    test('suggests mastery challenge on level-up when skills are near ready', () => {
        const user = makeUser({
            level: 5,
            skillMastery: {
                'fractions': { masteryScore: 80, status: 'practicing' },
            },
        });

        const result = getNextActions(user, { leveledUp: true });
        const masteryAction = result.find(s => s.type === 'try-mastery');
        expect(masteryAction).toBeDefined();
        expect(masteryAction.action.url).toBe('/badge-map.html');
    });

    test('suggests badge map after earning a badge', () => {
        const user = makeUser();
        const result = getNextActions(user, { badgeEarned: true });

        const badgeAction = result.find(s => s.type === 'next-badge');
        expect(badgeAction).toBeDefined();
    });

    test('suggests fact fluency when not practiced recently', () => {
        const user = makeUser({
            factFluencyProgress: {
                stats: { lastPracticeDate: new Date(Date.now() - 5 * 86400000) },
            },
        });

        const result = getNextActions(user);
        const fluencyAction = result.find(s => s.type === 'fact-fluency');
        expect(fluencyAction).toBeDefined();
        expect(fluencyAction.action.url).toBe('/fact-fluency.html');
    });

    test('does not suggest fact fluency when practiced recently', () => {
        const user = makeUser({
            factFluencyProgress: {
                stats: { lastPracticeDate: new Date() },
            },
        });

        const result = getNextActions(user);
        const fluencyAction = result.find(s => s.type === 'fact-fluency');
        expect(fluencyAction).toBeUndefined();
    });

    test('suggests streak milestone when one day away', () => {
        const user = makeUser({
            dailyQuests: { currentStreak: 6, quests: [] }, // 6 % 7 === 6
        });

        const result = getNextActions(user);
        const streakAction = result.find(s => s.type === 'streak-milestone');
        expect(streakAction).toBeDefined();
        expect(streakAction.message).toContain('7-day');
    });

    test('priorities are ordered correctly (highest first)', () => {
        const now = Date.now();
        const user = makeUser({
            dailyQuests: {
                currentStreak: 6,
                quests: [{ completed: false }],
            },
            learningEngines: {
                fsrs: {
                    'algebra': { stability: 1, lastReview: new Date(now - 30 * 86400000).toISOString() },
                },
            },
        });

        const result = getNextActions(user, { streakFreezeUsed: true });
        // Streak freeze (10) should be first
        expect(result[0].type).toBe('streak-freeze');
    });
});
