// tests/unit/learningReport.test.js
// Unit tests for the Parent Learning Report endpoint logic
//
// Tests the data aggregation and insight generation that powers
// GET /api/parent/child/:childId/learning-report

const mongoose = require('mongoose');

// ---------------------------------------------------------------------------
// Mock dependencies before requiring the router
// ---------------------------------------------------------------------------

// Mock Conversation model with aggregate
const mockAggregate = jest.fn();
jest.mock('../../models/conversation', () => {
    const mock = function() {};
    mock.aggregate = mockAggregate;
    mock.findOne = jest.fn();
    mock.find = jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue([]) }) }) });
    return mock;
});

// Mock User model
// verifyParentChildAccess does:
//   1. User.findById(parentId)  → returns parent doc (no .lean())
//   2. User.findById(childId).lean()  → returns child doc
// So findById must return an object that has .lean() for the child lookup,
// but also works as a plain thenable for the parent lookup.
const mockFindById = jest.fn();
jest.mock('../../models/user', () => {
    const mock = function() {};
    mock.findById = (...args) => {
        const result = mockFindById(...args);
        // If the result is already a promise, wrap it so it also has .lean()
        if (result && typeof result.then === 'function') {
            result.lean = () => result;
            result.select = () => result;
            result.populate = () => result;
        }
        return result;
    };
    mock.findOne = jest.fn();
    mock.find = jest.fn();
    return mock;
});

// Mock Skill model
const mockSkillFind = jest.fn();
jest.mock('../../models/skill', () => {
    const mock = function() {};
    mock.find = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });
    return mock;
});

// Mock ScreenerSession
jest.mock('../../models/screenerSession', () => {
    const mock = function() {};
    mock.find = jest.fn();
    return mock;
});

// Mock middleware
jest.mock('../../middleware/auth', () => ({
    isAuthenticated: (req, res, next) => next(),
    isParent: (req, res, next) => next(),
    isAdmin: (req, res, next) => next(),
    isTeacher: (req, res, next) => next(),
    isStudent: (req, res, next) => next(),
}));
jest.mock('../../middleware/ferpaAccessLog', () => ({
    logRecordAccess: () => (req, res, next) => next(),
}));

// Mock services
jest.mock('../../services/sessionService', () => ({
    cleanupStaleSessions: jest.fn().mockResolvedValue(),
}));

// Mock fsrsScheduler
jest.mock('../../utils/fsrsScheduler', () => ({
    calculateRetrievability: jest.fn((elapsed, stability) => {
        if (stability === 0) return 0;
        return Math.pow(1 + elapsed / (9 * stability), -1);
    }),
}));

// Now require the router and set up express for testing
const express = require('express');
const request = require('supertest');

// Build a minimal Express app with the parent routes
function createApp() {
    const app = express();
    app.use(express.json());
    // Simulate the isAuthenticated + isParent middleware from config/routes.js
    app.use((req, res, next) => {
        req.isAuthenticated = () => true;
        req.user = { _id: new mongoose.Types.ObjectId(), role: 'parent', children: [] };
        next();
    });
    const parentRoutes = require('../../routes/parent');
    app.use('/api/parent', parentRoutes);
    return app;
}

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeChild(overrides = {}) {
    return {
        _id: new mongoose.Types.ObjectId(),
        firstName: 'Alex',
        lastName: 'Johnson',
        gradeLevel: '7',
        mathCourse: 'Pre-Algebra',
        level: 5,
        xp: 1200,
        totalActiveTutoringMinutes: 340,
        skillMastery: {},
        learningEngines: { bkt: {}, fsrs: {}, consistency: {}, cognitiveLoadHistory: [] },
        learningProfile: { currentTheta: 0.5, growthCheckHistory: [] },
        badges: [],
        strategyBadges: [],
        streak: { current: 3, longest: 12 },
        dailyQuests: { quests: [] },
        weeklyChallenges: { challenges: [] },
        factFluencyProgress: { stats: {}, factFamilies: {} },
        ...overrides,
    };
}

function makeParent(childId) {
    return {
        _id: new mongoose.Types.ObjectId(),
        role: 'parent',
        children: [childId],
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Parent Learning Report - GET /api/parent/child/:childId/learning-report', () => {
    let app;

    beforeAll(() => {
        app = createApp();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Default: aggregate returns empty results
        mockAggregate.mockResolvedValue([]);
    });

    test('returns 403 when parent does not have access to child', async () => {
        const childId = new mongoose.Types.ObjectId();
        // Parent.findById returns a parent with no children
        mockFindById.mockResolvedValueOnce({ _id: new mongoose.Types.ObjectId(), children: [] });

        const res = await request(app).get(`/api/parent/child/${childId}/learning-report`);
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/Not authorized/);
    });

    test('returns 403 when child is not found', async () => {
        const childId = new mongoose.Types.ObjectId();
        const parentId = new mongoose.Types.ObjectId();

        // First call: parent lookup - parent has the child ID
        mockFindById.mockResolvedValueOnce({ _id: parentId, children: [childId] });
        // Second call: child lookup - child not found
        mockFindById.mockResolvedValueOnce(null);

        const res = await request(app).get(`/api/parent/child/${childId}/learning-report`);
        expect(res.status).toBe(403);
    });

    test('returns a complete learning report for a child with no data', async () => {
        const child = makeChild();
        const parent = makeParent(child._id);

        // Parent lookup
        mockFindById.mockResolvedValueOnce(parent);
        // Child lookup (via verifyParentChildAccess -> User.findById(childId).lean())
        mockFindById.mockResolvedValueOnce(child);

        const res = await request(app).get(`/api/parent/child/${child._id}/learning-report`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        // Verify top-level structure
        expect(res.body).toHaveProperty('headline');
        expect(res.body).toHaveProperty('insights');
        expect(res.body).toHaveProperty('weeklySnapshot');
        expect(res.body).toHaveProperty('mastery');
        expect(res.body).toHaveProperty('memoryHealth');
        expect(res.body).toHaveProperty('cognitiveLoad');
        expect(res.body).toHaveProperty('growth');
        expect(res.body).toHaveProperty('milestones');
        expect(res.body).toHaveProperty('engagement');
        expect(res.body).toHaveProperty('factFluency');
        expect(res.body).toHaveProperty('reportDate');

        // Verify child info
        expect(res.body.child.firstName).toBe('Alex');
        expect(res.body.child.level).toBe(5);
    });

    test('generates correct headline for inactive child', async () => {
        const child = makeChild();
        const parent = makeParent(child._id);
        mockFindById.mockResolvedValueOnce(parent);
        mockFindById.mockResolvedValueOnce(child);

        // Both aggregates return empty (no sessions this week or last week)
        mockAggregate.mockResolvedValue([]);

        const res = await request(app).get(`/api/parent/child/${child._id}/learning-report`);
        expect(res.status).toBe(200);
        expect(res.body.headline.tone).toBe('needs-attention');
        expect(res.body.headline.text).toContain("hasn't practiced");
    });

    test('generates correct headline for excellent progress', async () => {
        const child = makeChild({
            learningEngines: {
                bkt: {
                    'fractions': { pLearned: 0.98, mastered: true, lastObservation: new Date().toISOString() },
                },
                fsrs: {},
                consistency: {},
                cognitiveLoadHistory: []
            }
        });
        const parent = makeParent(child._id);
        mockFindById.mockResolvedValueOnce(parent);
        mockFindById.mockResolvedValueOnce(child);

        // This week: active sessions with good accuracy
        mockAggregate
            .mockResolvedValueOnce([{ _id: null, totalProblems: 30, totalCorrect: 25, totalMinutes: 45, sessionCount: 5 }])
            .mockResolvedValueOnce([{ _id: null, totalProblems: 20, totalCorrect: 14, totalMinutes: 30, sessionCount: 3 }]);

        const res = await request(app).get(`/api/parent/child/${child._id}/learning-report`);
        expect(res.status).toBe(200);
        expect(res.body.headline.tone).toBe('excellent');
        expect(res.body.weeklySnapshot.thisWeek.accuracy).toBe(83);
        expect(res.body.weeklySnapshot.previousWeek.accuracy).toBe(70);
        expect(res.body.weeklySnapshot.trends.accuracyDelta).toBe(13);
    });

    test('includes memory health data from FSRS entries', async () => {
        const now = Date.now();
        const child = makeChild({
            learningEngines: {
                bkt: {},
                fsrs: {
                    'algebra-basics': { stability: 30, lastReview: new Date(now - 2 * 86400000).toISOString() },  // recent = strong
                    'fractions': { stability: 5, lastReview: new Date(now - 10 * 86400000).toISOString() },       // fading
                    'decimals': { stability: 1, lastReview: new Date(now - 20 * 86400000).toISOString() },         // needs review
                },
                consistency: {},
                cognitiveLoadHistory: []
            }
        });
        const parent = makeParent(child._id);
        mockFindById.mockResolvedValueOnce(parent);
        mockFindById.mockResolvedValueOnce(child);

        const res = await request(app).get(`/api/parent/child/${child._id}/learning-report`);
        expect(res.status).toBe(200);
        expect(res.body.memoryHealth.totalTracked).toBe(3);
        expect(res.body.memoryHealth.strong).toBeGreaterThanOrEqual(1);
        // Should have some fading skills listed
        expect(res.body.memoryHealth.fadingSkills.length).toBeGreaterThan(0);
    });

    test('includes mastery counts and categorization', async () => {
        const child = makeChild({
            skillMastery: {
                'fractions': { status: 'mastered', masteryScore: 95, currentTier: 'gold' },
                'decimals': { status: 'mastered', masteryScore: 88, currentTier: 'silver' },
                'algebra-basics': { status: 'learning', masteryScore: 45 },
                'geometry': { status: 'needs-review', masteryScore: 20 },
                'ratios': { status: 'practicing', masteryScore: 65 },
            }
        });
        const parent = makeParent(child._id);
        mockFindById.mockResolvedValueOnce(parent);
        mockFindById.mockResolvedValueOnce(child);

        const res = await request(app).get(`/api/parent/child/${child._id}/learning-report`);
        expect(res.status).toBe(200);
        expect(res.body.mastery.counts.mastered).toBe(2);
        expect(res.body.mastery.counts.learning).toBe(1);
        expect(res.body.mastery.counts.practicing).toBe(1);
        expect(res.body.mastery.counts.needsReview).toBe(1);
        expect(res.body.mastery.counts.total).toBe(5);
        expect(res.body.mastery.topStrengths.length).toBe(2);
        expect(res.body.mastery.growthAreas.length).toBe(1);
        expect(res.body.mastery.growthAreas[0].status).toBe('needs-review');
    });

    test('includes cognitive load trend', async () => {
        const now = new Date();
        const child = makeChild({
            learningEngines: {
                bkt: {},
                fsrs: {},
                consistency: {},
                cognitiveLoadHistory: [
                    { date: new Date(now.getTime() - 5 * 86400000), avgLoad: 0.7, peakLoad: 0.9, level: 'high', sessionMinutes: 20 },
                    { date: new Date(now.getTime() - 4 * 86400000), avgLoad: 0.65, peakLoad: 0.8, level: 'optimal', sessionMinutes: 25 },
                    { date: new Date(now.getTime() - 3 * 86400000), avgLoad: 0.5, peakLoad: 0.7, level: 'optimal', sessionMinutes: 30 },
                    { date: new Date(now.getTime() - 2 * 86400000), avgLoad: 0.45, peakLoad: 0.6, level: 'optimal', sessionMinutes: 25 },
                ]
            }
        });
        const parent = makeParent(child._id);
        mockFindById.mockResolvedValueOnce(parent);
        mockFindById.mockResolvedValueOnce(child);

        const res = await request(app).get(`/api/parent/child/${child._id}/learning-report`);
        expect(res.status).toBe(200);
        expect(res.body.cognitiveLoad.trend).toBe('improving');
        expect(res.body.cognitiveLoad.label).toBe('Getting easier');
        expect(res.body.cognitiveLoad.average).not.toBeNull();
    });

    test('includes growth trajectory data', async () => {
        const child = makeChild({
            learningProfile: {
                currentTheta: 0.8,
                growthCheckHistory: [
                    { date: new Date(Date.now() - 20 * 86400000), thetaChange: 0.1, growthStatus: 'some-growth', accuracy: 0.7, questionsAnswered: 10 },
                    { date: new Date(Date.now() - 10 * 86400000), thetaChange: 0.15, growthStatus: 'significant-growth', accuracy: 0.8, questionsAnswered: 12 },
                ]
            }
        });
        const parent = makeParent(child._id);
        mockFindById.mockResolvedValueOnce(parent);
        mockFindById.mockResolvedValueOnce(child);

        const res = await request(app).get(`/api/parent/child/${child._id}/learning-report`);
        expect(res.status).toBe(200);
        expect(res.body.growth.currentTheta).toBe(0.8);
        expect(res.body.growth.thetaGrowthThisMonth).toBe(0.25);
        expect(res.body.growth.recentChecks.length).toBe(2);
    });

    test('includes engagement and streak data', async () => {
        const child = makeChild({
            streak: { current: 7, longest: 15 },
            totalActiveTutoringMinutes: 500,
            dailyQuests: { quests: [{ completed: true }, { completed: true }, { completed: false }] },
            weeklyChallenges: { challenges: [{ completed: true }, { completed: false }] },
        });
        const parent = makeParent(child._id);
        mockFindById.mockResolvedValueOnce(parent);
        mockFindById.mockResolvedValueOnce(child);

        const res = await request(app).get(`/api/parent/child/${child._id}/learning-report`);
        expect(res.status).toBe(200);
        expect(res.body.engagement.currentStreak).toBe(7);
        expect(res.body.engagement.longestStreak).toBe(15);
        expect(res.body.engagement.totalTutoringMinutes).toBe(500);
        expect(res.body.engagement.questsCompleted).toBe(2);
        expect(res.body.engagement.challengesCompleted).toBe(1);
    });

    test('includes fact fluency summary', async () => {
        const child = makeChild({
            factFluencyProgress: {
                stats: { totalSessions: 15, overallAccuracy: 87.5 },
                factFamilies: {
                    'add-1': { mastered: true },
                    'add-2': { mastered: true },
                    'mult-1': { mastered: false },
                }
            }
        });
        const parent = makeParent(child._id);
        mockFindById.mockResolvedValueOnce(parent);
        mockFindById.mockResolvedValueOnce(child);

        const res = await request(app).get(`/api/parent/child/${child._id}/learning-report`);
        expect(res.status).toBe(200);
        expect(res.body.factFluency.mastered).toBe(2);
        expect(res.body.factFluency.total).toBe(3);
        expect(res.body.factFluency.totalSessions).toBe(15);
        expect(res.body.factFluency.overallAccuracy).toBe(88);
    });

    test('includes recent badges in milestones', async () => {
        const recentDate = new Date();
        const oldDate = new Date(Date.now() - 30 * 86400000);
        const child = makeChild({
            badges: [
                { key: 'first-correct', badgeId: 'first-correct', unlockedAt: recentDate },
                { key: 'streak-master', badgeId: 'streak-master', unlockedAt: oldDate },
            ],
            strategyBadges: [
                { badgeId: 'pattern-finder', badgeName: 'Pattern Finder', category: 'algebra', earnedDate: recentDate },
            ]
        });
        const parent = makeParent(child._id);
        mockFindById.mockResolvedValueOnce(parent);
        mockFindById.mockResolvedValueOnce(child);

        const res = await request(app).get(`/api/parent/child/${child._id}/learning-report`);
        expect(res.status).toBe(200);
        expect(res.body.milestones.badges.length).toBe(1);
        expect(res.body.milestones.badges[0].key).toBe('first-correct');
        expect(res.body.milestones.strategyBadges.length).toBe(1);
        expect(res.body.milestones.strategyBadges[0].badgeName).toBe('Pattern Finder');
    });

    test('generates accuracy improvement insight when accuracy goes up', async () => {
        const child = makeChild();
        const parent = makeParent(child._id);
        mockFindById.mockResolvedValueOnce(parent);
        mockFindById.mockResolvedValueOnce(child);

        // This week: 80% accuracy; last week: 60% accuracy
        mockAggregate
            .mockResolvedValueOnce([{ _id: null, totalProblems: 20, totalCorrect: 16, totalMinutes: 30, sessionCount: 3 }])
            .mockResolvedValueOnce([{ _id: null, totalProblems: 20, totalCorrect: 12, totalMinutes: 25, sessionCount: 3 }]);

        const res = await request(app).get(`/api/parent/child/${child._id}/learning-report`);
        expect(res.status).toBe(200);

        const accuracyInsight = res.body.insights.find(i => i.type === 'accuracy');
        expect(accuracyInsight).toBeDefined();
        expect(accuracyInsight.tone).toBe('positive');
        expect(accuracyInsight.message).toContain('improved');
    });

    test('generates memory fading insight when skills are fading', async () => {
        const now = Date.now();
        const child = makeChild({
            learningEngines: {
                bkt: {},
                fsrs: {
                    'skill-a': { stability: 2, lastReview: new Date(now - 15 * 86400000).toISOString() },
                    'skill-b': { stability: 1, lastReview: new Date(now - 20 * 86400000).toISOString() },
                },
                consistency: {},
                cognitiveLoadHistory: []
            }
        });
        const parent = makeParent(child._id);
        mockFindById.mockResolvedValueOnce(parent);
        mockFindById.mockResolvedValueOnce(child);

        // Need some sessions so we don't get the "hasn't practiced" headline
        mockAggregate
            .mockResolvedValueOnce([{ _id: null, totalProblems: 10, totalCorrect: 7, totalMinutes: 20, sessionCount: 2 }])
            .mockResolvedValueOnce([]);

        const res = await request(app).get(`/api/parent/child/${child._id}/learning-report`);
        expect(res.status).toBe(200);

        const memoryInsight = res.body.insights.find(i => i.type === 'memory');
        expect(memoryInsight).toBeDefined();
        expect(memoryInsight.tone).toBe('actionable');
        expect(memoryInsight.message).toContain('fade from memory');
    });

    test('weekly snapshot includes correct trend calculations', async () => {
        const child = makeChild();
        const parent = makeParent(child._id);
        mockFindById.mockResolvedValueOnce(parent);
        mockFindById.mockResolvedValueOnce(child);

        mockAggregate
            .mockResolvedValueOnce([{ _id: null, totalProblems: 30, totalCorrect: 24, totalMinutes: 60, sessionCount: 5 }])
            .mockResolvedValueOnce([{ _id: null, totalProblems: 20, totalCorrect: 14, totalMinutes: 40, sessionCount: 3 }]);

        const res = await request(app).get(`/api/parent/child/${child._id}/learning-report`);
        expect(res.status).toBe(200);

        const trends = res.body.weeklySnapshot.trends;
        expect(trends.sessionsDelta).toBe(2);    // 5 - 3
        expect(trends.minutesDelta).toBe(20);    // 60 - 40
        expect(trends.problemsDelta).toBe(10);    // 30 - 20
        expect(trends.accuracyDelta).toBe(10);    // 80% - 70%
    });

    test('knowledge by category groups BKT data correctly', async () => {
        const child = makeChild({
            learningEngines: {
                bkt: {
                    'add-fractions': { pLearned: 0.98, mastered: true },
                    'sub-fractions': { pLearned: 0.6, mastered: false },
                    'solve-linear': { pLearned: 0.1, mastered: false },
                },
                fsrs: {},
                consistency: {},
                cognitiveLoadHistory: []
            }
        });
        const parent = makeParent(child._id);
        mockFindById.mockResolvedValueOnce(parent);
        mockFindById.mockResolvedValueOnce(child);

        // Mock Skill.find to return category info
        const Skill = require('../../models/skill');
        Skill.find.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { skillId: 'add-fractions', displayName: 'Adding Fractions', category: 'Fractions' },
                    { skillId: 'sub-fractions', displayName: 'Subtracting Fractions', category: 'Fractions' },
                    { skillId: 'solve-linear', displayName: 'Solving Linear Equations', category: 'Algebra' },
                ])
            })
        });

        const res = await request(app).get(`/api/parent/child/${child._id}/learning-report`);
        expect(res.status).toBe(200);

        const cats = res.body.mastery.knowledgeByCategory;
        expect(cats['Fractions']).toBeDefined();
        expect(cats['Fractions'].mastered).toBe(1);
        expect(cats['Fractions'].learning).toBe(1);
        expect(cats['Algebra']).toBeDefined();
        expect(cats['Algebra'].needsWork).toBe(1);
    });
});
