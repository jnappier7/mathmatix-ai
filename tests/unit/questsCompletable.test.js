/**
 * Every quest and challenge we deal must be finishable through the events the
 * tutoring pipeline actually sends (utils/pipeline/persist.js → 'problemSolved',
 * 'skillMastered', 'newSkillStarted', 'skillPracticed'; plus the daily
 * 'dailyQuestCompleted' roll-up).
 *
 * Before 2026-10-24, Speedster (needs `timeTaken`), Accuracy Ace (needs a
 * 'sessionComplete' event), Weekly Speedster, Growth Mindset and Helpful Helper
 * were dealt to students but nothing ever sent the event they wait for: the
 * QA audit saw "Accuracy Ace 0/95" and "Speedster 0/20" sitting there all day.
 */

jest.mock('../../utils/logger', () => {
    const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    return Object.assign(l, { child: () => l });
});

const { emitGamificationEvent } = require('../../utils/gamificationEvents');
const { QUEST_TEMPLATES, generateDailyQuests } = require('../../routes/dailyQuests');
const { WEEKLY_CHALLENGE_TEMPLATES, generateWeeklyChallenges } = require('../../routes/weeklyChallenges');

// Targets the pipeline can move, and how.
const DAILY_DRIVERS = {
    problemsCorrect: { correct: true },
    skillsPracticed: { correct: true, skillId: () => `skill-${Math.random()}` },
    dailyPractice: { correct: true },
    consecutiveCorrect: { correct: true },
    firstTryCorrect: { correct: true, firstTry: true },
    comebacks: { correct: true, comeback: true },
    masteryGained: 'skillMastered',
    newSkill: 'newSkillStarted',
};

const WEEKLY_DRIVERS = {
    skillsMastered: 'skillMastered',
    weeklyAccuracy: { correct: true },
    problemsSolved: { correct: true },
    dailyQuestStreak: 'roll-up',
    domainsPracticed: { correct: true, domain: () => `domain-${Math.random()}` },
    weeklyComebacks: { correct: true, comeback: true },
};

function freshUser() {
    return {
        xp: 0,
        level: 30, // highest count tier
        wallet: { coins: 0, lifetimeEarned: 0, dailyEarned: 0, lastCoinReset: new Date() },
        dailyQuests: {
            quests: [], lastRefreshDate: new Date(), currentStreak: 1, longestStreak: 1,
            lastPracticeDate: new Date(), totalQuestsCompleted: 0, todayProgress: {},
        },
        weeklyChallenges: {
            challenges: [], weekStartDate: new Date(), completedChallengesAllTime: 0, weeklyProgress: {},
        },
    };
}

function drive(user, driver) {
    if (typeof driver === 'string') {
        emitGamificationEvent(user, driver, { skillId: `skill-${Math.random()}`, masteryGained: 10 });
        return;
    }
    const data = {};
    for (const [k, v] of Object.entries(driver)) data[k] = typeof v === 'function' ? v() : v;
    emitGamificationEvent(user, 'problemSolved', data);
}

describe('daily quests are all finishable', () => {
    const dealt = Object.values(QUEST_TEMPLATES);

    test.each(dealt.map(t => [t.id, t]))('%s can complete from pipeline events', (_id, template) => {
        const driver = DAILY_DRIVERS[template.target];
        expect(driver).toBeDefined(); // a new target needs a pipeline event behind it
        const user = freshUser();
        const target = template.countOptions[template.countOptions.length - 1];
        user.dailyQuests.quests = [{
            id: 'q', target: template.target, targetCount: target, progress: 0,
            completed: false, xpReward: template.xpReward, bonusMultiplier: 1,
        }];
        for (let i = 0; i < 60 && !user.dailyQuests.quests[0].completed; i++) drive(user, driver);
        expect(user.dailyQuests.quests[0].completed).toBe(true);
    });

    test('Speedster and Accuracy Ace are no longer dealt', () => {
        const ids = new Set();
        for (let i = 0; i < 300; i++) generateDailyQuests({ level: 12 }).forEach(q => ids.add(q.templateId));
        expect(ids.has('speedster')).toBe(false);
        expect(ids.has('accuracyAce')).toBe(false);
        expect(ids.has('bounceBack')).toBe(true);
        expect(ids.has('firstTry')).toBe(true);
    });

    test('a count of one reads in the singular', () => {
        let bounce;
        for (let i = 0; i < 300 && !bounce; i++) {
            bounce = generateDailyQuests({ level: 1 }).find(q => q.templateId === 'bounceBack');
        }
        expect(bounce.description).toBe('Fix 1 problem you got wrong at first');
    });
});

describe('weekly challenges are all finishable', () => {
    test('every dealt template has a pipeline event behind it', () => {
        const ids = new Set();
        for (let i = 0; i < 300; i++) generateWeeklyChallenges({ level: 5 }).forEach(c => ids.add(c.templateId));
        for (const id of ids) {
            expect(WEEKLY_DRIVERS[WEEKLY_CHALLENGE_TEMPLATES[id].targetType]).toBeDefined();
        }
        for (const dead of ['speedster', 'growthMindset', 'helpfulHelper']) expect(ids.has(dead)).toBe(false);
        expect(ids.has('comebackKid')).toBe(true);
    });

    test('a week always still gets one hard challenge', () => {
        for (let i = 0; i < 100; i++) {
            const deal = generateWeeklyChallenges({ level: 5 });
            expect(deal).toHaveLength(3);
            expect(deal.some(c => c.difficulty === 'hard')).toBe(true);
        }
    });

    test('Comeback Kid counts comebacks only', () => {
        const user = freshUser();
        user.weeklyChallenges.challenges = [{
            id: 'c', targetType: 'weeklyComebacks', targetCount: 2, progress: 0,
            completed: false, xpReward: 400,
        }];
        emitGamificationEvent(user, 'problemSolved', { correct: true });
        emitGamificationEvent(user, 'problemSolved', { correct: false, comeback: false });
        expect(user.weeklyChallenges.challenges[0].progress).toBe(0);
        emitGamificationEvent(user, 'problemSolved', { correct: true, comeback: true });
        emitGamificationEvent(user, 'problemSolved', { correct: true, comeback: true });
        expect(user.weeklyChallenges.challenges[0].completed).toBe(true);
    });
});

describe('completions pay coins in chat, like the quest route does', () => {
    test('a quest finished through the pipeline awards questComplete coins', () => {
        const BRAND = require('../../utils/brand');
        const user = freshUser();
        user.dailyQuests.quests = [{
            id: 'q', name: 'Bounce Back', icon: '💪', target: 'comebacks', targetCount: 1,
            progress: 0, completed: false, xpReward: 60, bonusMultiplier: 1,
        }];
        const out = emitGamificationEvent(user, 'problemSolved', { correct: true, comeback: true });
        expect(out.questsCompleted).toHaveLength(1);
        expect(out.questsCompleted[0].coinsEarned).toBe(BRAND.coinRewards.questComplete);
        expect(user.wallet.coins).toBe(BRAND.coinRewards.questComplete);
    });

    test('a first-try quest ignores a retry', () => {
        const user = freshUser();
        user.dailyQuests.quests = [{
            id: 'q', target: 'firstTryCorrect', targetCount: 3, progress: 0,
            completed: false, xpReward: 75, bonusMultiplier: 1,
        }];
        emitGamificationEvent(user, 'problemSolved', { correct: true, firstTry: false, comeback: true });
        emitGamificationEvent(user, 'problemSolved', { correct: false, firstTry: true });
        expect(user.dailyQuests.quests[0].progress).toBe(0);
        emitGamificationEvent(user, 'problemSolved', { correct: true, firstTry: true });
        expect(user.dailyQuests.quests[0].progress).toBe(1);
    });
});
