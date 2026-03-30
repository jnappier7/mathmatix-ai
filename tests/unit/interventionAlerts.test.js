// tests/unit/interventionAlerts.test.js
// Tests for the teacher intervention alert system

jest.mock('../../utils/fsrsScheduler', () => ({
    calculateRetrievability: jest.fn((elapsed, stability) => {
        if (stability === 0) return 0;
        return Math.pow(1 + elapsed / (9 * stability), -1);
    }),
}));

jest.mock('../../utils/logger', () => ({
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const {
    computeRiskScore,
    getInterventionTier,
    generateRecommendation,
    checkForInterventionAlert,
    THRESHOLDS,
} = require('../../utils/interventionAlerts');

function makeUser(overrides = {}) {
    return {
        _id: 'student123',
        firstName: 'Test',
        lastName: 'Student',
        learningEngines: {
            bkt: {},
            fsrs: {},
            consistency: {},
            cognitiveLoadHistory: [],
            ...(overrides.learningEngines || {}),
        },
        lastInterventionAlert: overrides.lastInterventionAlert || null,
        ...overrides,
    };
}

describe('Intervention Alert System', () => {

    describe('computeRiskScore', () => {

        test('returns low risk for strong student', () => {
            const user = makeUser({
                learningEngines: {
                    bkt: {
                        'skill-a': { pLearned: 0.95 },
                        'skill-b': { pLearned: 0.9 },
                    },
                    fsrs: {
                        'skill-a': { stability: 30, lastReview: new Date().toISOString() },
                    },
                    consistency: {
                        'skill-a': { smartScore: 90 },
                    },
                    cognitiveLoadHistory: [{ avgLoad: 0.3, level: 'optimal' }],
                },
            });

            const result = computeRiskScore(user);
            expect(result.riskScore).toBeLessThan(THRESHOLDS.TIER_1);
            expect(result.atRisk).toBe(false);
        });

        test('returns high risk for struggling student', () => {
            const user = makeUser({
                learningEngines: {
                    bkt: {
                        'skill-a': { pLearned: 0.1 },
                        'skill-b': { pLearned: 0.2 },
                    },
                    fsrs: {},
                    consistency: {
                        'skill-a': { smartScore: 20 },
                    },
                    cognitiveLoadHistory: [{ avgLoad: 0.85, level: 'overload' }],
                },
            });

            const result = computeRiskScore(user);
            expect(result.riskScore).toBeGreaterThan(THRESHOLDS.TIER_2);
            expect(result.atRisk).toBe(true);
        });

        test('handles empty learning engines gracefully', () => {
            const user = makeUser();
            const result = computeRiskScore(user);
            expect(result).toHaveProperty('riskScore');
            expect(result).toHaveProperty('factors');
            expect(typeof result.riskScore).toBe('number');
        });
    });

    describe('getInterventionTier', () => {

        test('tier 0 for low risk', () => {
            expect(getInterventionTier(0.3).tier).toBe(0);
            expect(getInterventionTier(0.3).label).toBe('On Track');
        });

        test('tier 1 (Watch) at threshold', () => {
            expect(getInterventionTier(THRESHOLDS.TIER_1).tier).toBe(1);
            expect(getInterventionTier(THRESHOLDS.TIER_1).urgency).toBe('low');
        });

        test('tier 2 (Concern) at threshold', () => {
            expect(getInterventionTier(THRESHOLDS.TIER_2).tier).toBe(2);
            expect(getInterventionTier(THRESHOLDS.TIER_2).urgency).toBe('medium');
        });

        test('tier 3 (Urgent) at threshold', () => {
            expect(getInterventionTier(THRESHOLDS.TIER_3).tier).toBe(3);
            expect(getInterventionTier(THRESHOLDS.TIER_3).label).toBe('Urgent');
            expect(getInterventionTier(THRESHOLDS.TIER_3).urgency).toBe('high');
        });
    });

    describe('generateRecommendation', () => {

        test('generates recommendation for low mastery', () => {
            const rec = generateRecommendation(
                { avgPLearned: 0.3, recentCognitiveLoad: 0.4, avgSmartScore: 70, avgRetrievability: 0.8 },
                { tier: 1 }
            );
            expect(rec).toContain('struggling to grasp core concepts');
            expect(rec).toContain('check-in');
        });

        test('generates recommendation for cognitive overload', () => {
            const rec = generateRecommendation(
                { avgPLearned: 0.6, recentCognitiveLoad: 0.85, avgSmartScore: 70, avgRetrievability: 0.8 },
                { tier: 2 }
            );
            expect(rec).toContain('cognitive overload');
            expect(rec).toContain('one-on-one');
        });

        test('generates urgent recommendation for tier 3', () => {
            const rec = generateRecommendation(
                { avgPLearned: 0.2, recentCognitiveLoad: 0.9, avgSmartScore: 25, avgRetrievability: 0.3 },
                { tier: 3 }
            );
            expect(rec).toContain('Immediate intervention');
        });

        test('returns continue monitoring when no issues', () => {
            const rec = generateRecommendation(
                { avgPLearned: 0.8, recentCognitiveLoad: 0.3, avgSmartScore: 80, avgRetrievability: 0.9 },
                { tier: 1 }
            );
            expect(rec).toBe('Continue monitoring.');
        });
    });

    describe('checkForInterventionAlert', () => {

        test('returns null when student has no BKT data', () => {
            const user = makeUser();
            expect(checkForInterventionAlert(user)).toBeNull();
        });

        test('returns null for on-track student', () => {
            const user = makeUser({
                learningEngines: {
                    bkt: { 'skill-a': { pLearned: 0.9 } },
                    fsrs: {},
                    consistency: { 'skill-a': { smartScore: 90 } },
                    cognitiveLoadHistory: [{ avgLoad: 0.3 }],
                },
            });
            expect(checkForInterventionAlert(user)).toBeNull();
        });

        test('returns alert for at-risk student', () => {
            const user = makeUser({
                learningEngines: {
                    bkt: { 'skill-a': { pLearned: 0.1 } },
                    fsrs: {},
                    consistency: { 'skill-a': { smartScore: 20 } },
                    cognitiveLoadHistory: [{ avgLoad: 0.9 }],
                },
            });

            const alert = checkForInterventionAlert(user);
            expect(alert).not.toBeNull();
            expect(alert.tier).toBeGreaterThanOrEqual(2);
            expect(alert.recommendation).toBeTruthy();
            expect(alert.studentName).toBe('Test Student');
        });

        test('respects 24-hour cooldown for same tier', () => {
            const user = makeUser({
                learningEngines: {
                    bkt: { 'skill-a': { pLearned: 0.1 } },
                    fsrs: {},
                    consistency: { 'skill-a': { smartScore: 20 } },
                    cognitiveLoadHistory: [{ avgLoad: 0.9 }],
                },
                lastInterventionAlert: {
                    timestamp: new Date(), // Just now
                    tier: 3,
                    riskScore: 0.85,
                },
            });

            // Same or lower tier within cooldown = no alert
            expect(checkForInterventionAlert(user)).toBeNull();
        });

        test('allows escalation to higher tier after 1 hour', () => {
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            const user = makeUser({
                learningEngines: {
                    bkt: { 'skill-a': { pLearned: 0.05 } },
                    fsrs: {},
                    consistency: { 'skill-a': { smartScore: 10 } },
                    cognitiveLoadHistory: [{ avgLoad: 0.95 }],
                },
                lastInterventionAlert: {
                    timestamp: twoHoursAgo,
                    tier: 1, // Was tier 1, now should be higher
                    riskScore: 0.56,
                },
            });

            const alert = checkForInterventionAlert(user);
            expect(alert).not.toBeNull();
            expect(alert.tier).toBeGreaterThan(1);
        });

        test('alert includes all required fields', () => {
            const user = makeUser({
                learningEngines: {
                    bkt: { 'skill-a': { pLearned: 0.15 } },
                    fsrs: {},
                    consistency: { 'skill-a': { smartScore: 25 } },
                    cognitiveLoadHistory: [{ avgLoad: 0.8 }],
                },
            });

            const alert = checkForInterventionAlert(user);
            expect(alert).toHaveProperty('studentId');
            expect(alert).toHaveProperty('studentName');
            expect(alert).toHaveProperty('timestamp');
            expect(alert).toHaveProperty('tier');
            expect(alert).toHaveProperty('label');
            expect(alert).toHaveProperty('urgency');
            expect(alert).toHaveProperty('riskScore');
            expect(alert).toHaveProperty('factors');
            expect(alert).toHaveProperty('recommendation');
        });
    });
});
