/**
 * Tests that emitGamificationEvent is the SINGLE canonical path for quest
 * progress updates. Before this branch, routes/chat.js had a parallel
 * updateQuestProgress that fired alongside the pipeline's
 * emitGamificationEvent — every problem-correct turn double-incremented
 * the progress counter. We deleted the chat.js path. These tests lock in
 * the canonical behavior so it can't regress.
 */

jest.mock('../../utils/logger', () => ({
    child: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

const { emitGamificationEvent } = require('../../utils/gamificationEvents');

function makeUser({ questOverrides = {}, ...rest } = {}) {
    return {
        xp: 0,
        dailyQuests: {
            currentStreak: 5,
            longestStreak: 10,
            lastPracticeDate: new Date(),       // same day → no streak change
            lastRefreshDate: new Date(),        // prevent quest refresh
            streakFreezeUsedAt: null,
            quests: [
                {
                    id: 'q1',
                    target: 'problemsCorrect',
                    progress: 0,
                    targetCount: 3,
                    completed: false,
                    xpReward: 20,
                    ...questOverrides,
                },
            ],
            todayProgress: {},
            totalQuestsCompleted: 0,
            ...rest,
        },
    };
}

describe('emitGamificationEvent — quest progress increment', () => {
    test('a single problemSolved+correct event increments progress by exactly 1', () => {
        const user = makeUser();
        emitGamificationEvent(user, 'problemSolved', { correct: true });
        expect(user.dailyQuests.quests[0].progress).toBe(1);
    });

    test('three calls reach target and complete the quest exactly once', () => {
        const user = makeUser();
        emitGamificationEvent(user, 'problemSolved', { correct: true });
        emitGamificationEvent(user, 'problemSolved', { correct: true });
        const result = emitGamificationEvent(user, 'problemSolved', { correct: true });

        expect(user.dailyQuests.quests[0].progress).toBe(3);
        expect(user.dailyQuests.quests[0].completed).toBe(true);
        expect(user.dailyQuests.totalQuestsCompleted).toBe(1);
        expect(result.questsCompleted).toHaveLength(1);
        expect(result.xpAwarded).toBe(20);
    });

    test('incorrect answer does not advance problemsCorrect quest', () => {
        const user = makeUser();
        emitGamificationEvent(user, 'problemSolved', { correct: false });
        expect(user.dailyQuests.quests[0].progress).toBe(0);
    });

    test('progress does not exceed targetCount', () => {
        const user = makeUser({ questOverrides: { progress: 2 } });
        emitGamificationEvent(user, 'problemSolved', { correct: true });
        emitGamificationEvent(user, 'problemSolved', { correct: true });  // would overshoot
        expect(user.dailyQuests.quests[0].progress).toBe(3);
    });

    test('XP is awarded once on completion, not on subsequent calls', () => {
        const user = makeUser({ questOverrides: { progress: 2 } });
        emitGamificationEvent(user, 'problemSolved', { correct: true });  // completes
        const xpAfterFirst = user.xp;
        emitGamificationEvent(user, 'problemSolved', { correct: true });  // already completed
        expect(user.xp).toBe(xpAfterFirst);
    });

    test('skillsPracticed quest tracks unique skills only', () => {
        const user = makeUser({
            questOverrides: { id: 'q2', target: 'skillsPracticed', progress: 0, targetCount: 3 },
        });
        emitGamificationEvent(user, 'skillPracticed', { skillId: 'algebra' });
        emitGamificationEvent(user, 'skillPracticed', { skillId: 'algebra' });  // dup
        emitGamificationEvent(user, 'skillPracticed', { skillId: 'geometry' });
        expect(user.dailyQuests.quests[0].progress).toBe(2);  // 2 unique skills
    });

    test('dailyPractice quest auto-completes on any problemSolved event', () => {
        const user = makeUser({
            questOverrides: { id: 'q3', target: 'dailyPractice', progress: 0, targetCount: 1 },
        });
        emitGamificationEvent(user, 'problemSolved', { correct: false });
        expect(user.dailyQuests.quests[0].progress).toBe(1);
        expect(user.dailyQuests.quests[0].completed).toBe(true);
    });
});
