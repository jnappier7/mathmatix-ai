// tests/unit/smartReviewQueue.test.js
// Tests for the FSRS-driven smart review queue

jest.mock('../../utils/fsrsScheduler', () => ({
    calculateRetrievability: jest.fn((elapsed, stability) => {
        if (stability <= 0 || elapsed < 0) return 0;
        if (elapsed === 0) return 1;
        return Math.pow(1 + elapsed / (9 * stability), -1);
    }),
    calculateOptimalInterval: jest.fn((stability) => {
        return Math.max(1, Math.round(stability));
    }),
}));

const {
    buildSmartQueue,
    getReviewSummary,
    getAdaptiveSessionSize,
    interleaveDifficulty,
    SESSION_CONFIG,
} = require('../../utils/smartReviewQueue');

function makeUser(overrides = {}) {
    return {
        _id: 'student123',
        learningEngines: {
            bkt: {},
            fsrs: {},
            consistency: {},
            cognitiveLoadHistory: [],
            ...(overrides.learningEngines || {}),
        },
        ...overrides,
    };
}

function makeFsrsCard(daysAgo, stability, opts = {}) {
    return {
        lastReview: new Date(Date.now() - daysAgo * 86400000).toISOString(),
        stability,
        scheduledDays: opts.scheduledDays ?? stability,
        difficulty: opts.difficulty ?? 5,
        state: opts.state || 'review',
        reps: opts.reps ?? 3,
        lapses: opts.lapses ?? 0,
    };
}

describe('Smart Review Queue', () => {

    describe('buildSmartQueue', () => {

        test('returns empty queue for user with no FSRS data', () => {
            const user = makeUser();
            const result = buildSmartQueue(user);
            expect(result.queue).toEqual([]);
            expect(result.stats.totalTracked).toBe(0);
            expect(result.sessionPlan.skillCount).toBe(0);
        });

        test('returns due skills sorted by urgency', () => {
            const user = makeUser({
                learningEngines: {
                    fsrs: {
                        'skill-a': makeFsrsCard(10, 5),   // Very overdue (10 >> 5)
                        'skill-b': makeFsrsCard(6, 5),    // Just due (6 > 5)
                        'skill-c': makeFsrsCard(1, 10),   // Not yet due
                    },
                    cognitiveLoadHistory: [],
                },
            });

            const result = buildSmartQueue(user);
            expect(result.queue.length).toBeGreaterThanOrEqual(2);

            // skill-a should be most urgent (most overdue)
            const skillIds = result.queue.map(s => s.skillId);
            expect(skillIds[0]).toBe('skill-a');
        });

        test('includes upcoming skills within lookahead', () => {
            const user = makeUser({
                learningEngines: {
                    fsrs: {
                        // Due in 0.5 days (within default 1-day lookahead)
                        'skill-a': makeFsrsCard(4.5, 5, { scheduledDays: 5 }),
                    },
                    cognitiveLoadHistory: [],
                },
            });

            const result = buildSmartQueue(user, { lookaheadDays: 1 });
            expect(result.queue.length).toBe(1);
            expect(result.queue[0].skillId).toBe('skill-a');
        });

        test('reduces session size under cognitive overload', () => {
            const fsrs = {};
            for (let i = 0; i < 8; i++) {
                fsrs[`skill-${i}`] = makeFsrsCard(10, 3);
            }

            const user = makeUser({
                learningEngines: {
                    fsrs,
                    cognitiveLoadHistory: [{ avgLoad: 0.85 }],
                },
            });

            const result = buildSmartQueue(user);
            expect(result.queue.length).toBe(SESSION_CONFIG.MIN_SKILLS);
            expect(result.stats.recentCognitiveLoad).toBe(0.85);
        });

        test('returns full session under normal cognitive load', () => {
            const fsrs = {};
            for (let i = 0; i < 8; i++) {
                fsrs[`skill-${i}`] = makeFsrsCard(10, 3);
            }

            const user = makeUser({
                learningEngines: {
                    fsrs,
                    cognitiveLoadHistory: [{ avgLoad: 0.3 }],
                },
            });

            const result = buildSmartQueue(user);
            expect(result.queue.length).toBe(SESSION_CONFIG.DEFAULT_SKILLS);
        });

        test('provides session plan with time estimates', () => {
            const user = makeUser({
                learningEngines: {
                    fsrs: {
                        'easy-skill': makeFsrsCard(5, 3, { difficulty: 2 }),
                        'hard-skill': makeFsrsCard(5, 3, { difficulty: 9 }),
                    },
                    cognitiveLoadHistory: [],
                },
            });

            const result = buildSmartQueue(user);
            expect(result.sessionPlan.skillCount).toBe(2);
            expect(result.sessionPlan.estimatedMinutes).toBeGreaterThan(0);
            expect(result.sessionPlan.pacing).toBeTruthy();
            expect(result.sessionPlan.breakdown.length).toBe(2);
        });

        test('marks overdue skills correctly', () => {
            const user = makeUser({
                learningEngines: {
                    fsrs: {
                        // Overdue: elapsed (15) > scheduled (5) * 1.5 = 7.5
                        'skill-a': makeFsrsCard(15, 5, { scheduledDays: 5 }),
                    },
                    cognitiveLoadHistory: [],
                },
            });

            const result = buildSmartQueue(user);
            expect(result.queue[0].isOverdue).toBe(true);
            expect(result.stats.overdueCount).toBe(1);
        });

        test('overdue pacing message when overdue skills present', () => {
            const user = makeUser({
                learningEngines: {
                    fsrs: {
                        'skill-a': makeFsrsCard(15, 5, { scheduledDays: 5 }),
                    },
                    cognitiveLoadHistory: [{ avgLoad: 0.3 }],
                },
            });

            const result = buildSmartQueue(user);
            expect(result.sessionPlan.pacing).toContain('overdue');
        });

        test('high cognitive load pacing message', () => {
            const user = makeUser({
                learningEngines: {
                    fsrs: {
                        'skill-a': makeFsrsCard(10, 3),
                        'skill-b': makeFsrsCard(10, 3),
                    },
                    cognitiveLoadHistory: [{ avgLoad: 0.85 }],
                },
            });

            const result = buildSmartQueue(user);
            expect(result.sessionPlan.pacing).toContain('slow');
        });
    });

    describe('getReviewSummary', () => {

        test('returns no reviews message when no FSRS data', () => {
            const user = makeUser();
            const summary = getReviewSummary(user);
            expect(summary.dueNow).toBe(0);
            expect(summary.message).toContain('No reviews scheduled');
        });

        test('returns all caught up when nothing due', () => {
            const user = makeUser({
                learningEngines: {
                    fsrs: {
                        'skill-a': makeFsrsCard(1, 10, { scheduledDays: 10 }),
                    },
                },
            });

            const summary = getReviewSummary(user);
            expect(summary.dueNow).toBe(0);
            expect(summary.message).toContain('caught up');
            expect(summary.nextDueIn).toBeGreaterThan(0);
        });

        test('reports due skills', () => {
            const user = makeUser({
                learningEngines: {
                    fsrs: {
                        'skill-a': makeFsrsCard(10, 5, { scheduledDays: 5 }),
                        'skill-b': makeFsrsCard(10, 5, { scheduledDays: 5 }),
                    },
                },
            });

            const summary = getReviewSummary(user);
            expect(summary.dueNow).toBe(2);
            expect(summary.message).toContain('2 skills');
        });

        test('flags urgent skills (retrievability < 0.5)', () => {
            const user = makeUser({
                learningEngines: {
                    fsrs: {
                        // Very overdue — retrievability will be very low
                        'skill-a': makeFsrsCard(50, 2, { scheduledDays: 2 }),
                    },
                },
            });

            const summary = getReviewSummary(user);
            expect(summary.urgentCount).toBe(1);
            expect(summary.message).toContain('urgently');
        });
    });

    describe('getAdaptiveSessionSize', () => {

        test('returns MIN for high cognitive load', () => {
            expect(getAdaptiveSessionSize(0.85, 10, 10)).toBe(SESSION_CONFIG.MIN_SKILLS);
        });

        test('returns reduced size for moderate load', () => {
            const size = getAdaptiveSessionSize(0.65, 10, 10);
            expect(size).toBeLessThan(SESSION_CONFIG.DEFAULT_SKILLS);
            expect(size).toBeGreaterThanOrEqual(SESSION_CONFIG.MIN_SKILLS);
        });

        test('returns DEFAULT for low cognitive load', () => {
            expect(getAdaptiveSessionSize(0.3, 10, 10)).toBe(SESSION_CONFIG.DEFAULT_SKILLS);
        });

        test('caps at available skills', () => {
            expect(getAdaptiveSessionSize(0.3, 2, 10)).toBe(2);
        });

        test('caps at maxSkills', () => {
            expect(getAdaptiveSessionSize(0.3, 10, 3)).toBe(3);
        });
    });

    describe('interleaveDifficulty', () => {

        test('alternates easy and hard skills', () => {
            const skills = [
                { skillId: 'easy1', difficulty: 2 },
                { skillId: 'easy2', difficulty: 3 },
                { skillId: 'hard1', difficulty: 8 },
                { skillId: 'hard2', difficulty: 9 },
            ];

            const result = interleaveDifficulty(skills);
            expect(result.length).toBe(4);

            // Should alternate — first easy, then hard, etc.
            expect(result[0].difficulty).toBeLessThanOrEqual(3);
            expect(result[1].difficulty).toBeGreaterThanOrEqual(8);
        });

        test('preserves all skills', () => {
            const skills = [
                { skillId: 'a', difficulty: 1 },
                { skillId: 'b', difficulty: 5 },
                { skillId: 'c', difficulty: 10 },
                { skillId: 'd', difficulty: 3 },
                { skillId: 'e', difficulty: 7 },
            ];

            const result = interleaveDifficulty(skills);
            expect(result.length).toBe(5);
            const ids = result.map(s => s.skillId).sort();
            expect(ids).toEqual(['a', 'b', 'c', 'd', 'e']);
        });
    });
});
