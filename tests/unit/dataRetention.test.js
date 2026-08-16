/**
 * Tests for Data Retention Policy Engine
 */

const { DEFAULT_RETENTION_POLICY, runRetentionSweep, startRetentionSchedule, stopRetentionSchedule } = require('../../utils/dataRetention');

// Mock mongoose to return mock models
jest.mock('mongoose', () => {
    const mockModels = {};
    return {
        model: jest.fn((name) => {
            if (!mockModels[name]) {
                mockModels[name] = {
                    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
                    countDocuments: jest.fn().mockResolvedValue(0)
                };
            }
            return mockModels[name];
        }),
        _mockModels: mockModels
    };
});

const mongoose = require('mongoose');

describe('Data Retention Policy Engine', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset mock models
        Object.keys(mongoose._mockModels).forEach(key => {
            delete mongoose._mockModels[key];
        });
    });

    afterEach(() => {
        stopRetentionSchedule();
    });

    // ========================================================================
    // DEFAULT_RETENTION_POLICY
    // ========================================================================
    describe('DEFAULT_RETENTION_POLICY', () => {
        test('has all required collection policies', () => {
            expect(DEFAULT_RETENTION_POLICY.inactiveConversations).toBeDefined();
            expect(DEFAULT_RETENTION_POLICY.studentUploads).toBeDefined();
            expect(DEFAULT_RETENTION_POLICY.completedAssessments).toBeDefined();
            expect(DEFAULT_RETENTION_POLICY.gradingResults).toBeDefined();
            expect(DEFAULT_RETENTION_POLICY.feedback).toBeDefined();
            expect(DEFAULT_RETENTION_POLICY.messages).toBeDefined();
        });

        test('each policy has days and description', () => {
            for (const [key, policy] of Object.entries(DEFAULT_RETENTION_POLICY)) {
                expect(policy.days).toBeGreaterThan(0);
                expect(typeof policy.description).toBe('string');
            }
        });

        test('student uploads have shortest retention (30 days)', () => {
            expect(DEFAULT_RETENTION_POLICY.studentUploads.days).toBe(30);
        });

        test('educational records have 3-year retention', () => {
            expect(DEFAULT_RETENTION_POLICY.completedAssessments.days).toBe(1095);
            expect(DEFAULT_RETENTION_POLICY.gradingResults.days).toBe(1095);
        });
    });

    // ========================================================================
    // runRetentionSweep
    // ========================================================================
    describe('runRetentionSweep', () => {
        test('dry run counts without deleting', async () => {
            // Setup mock model to return counts
            mongoose.model.mockImplementation((name) => ({
                countDocuments: jest.fn().mockResolvedValue(5),
                deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 })
            }));

            const summary = await runRetentionSweep(null, true);

            expect(summary.dryRun).toBe(true);
            expect(summary.totalDocumentsAffected).toBe(0); // Dry run doesn't affect
        });

        test('actual sweep deletes expired data', async () => {
            mongoose.model.mockImplementation((name) => ({
                deleteMany: jest.fn().mockResolvedValue({ deletedCount: 3 }),
                countDocuments: jest.fn().mockResolvedValue(3)
            }));

            const summary = await runRetentionSweep(null, false);

            expect(summary.dryRun).toBe(false);
            expect(summary.totalDocumentsAffected).toBeGreaterThan(0);
        });

        test('returns timing metadata', async () => {
            mongoose.model.mockImplementation(() => ({
                deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 })
            }));

            const summary = await runRetentionSweep();

            expect(summary.startedAt).toBeInstanceOf(Date);
            expect(summary.completedAt).toBeInstanceOf(Date);
            expect(summary.durationMs).toBeGreaterThanOrEqual(0);
        });

        test('handles collection errors gracefully', async () => {
            mongoose.model.mockImplementation((name) => {
                if (name === 'Conversation') {
                    return { deleteMany: jest.fn().mockRejectedValue(new Error('DB error')) };
                }
                return { deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }) };
            });

            const summary = await runRetentionSweep();

            expect(summary.errors.length).toBeGreaterThan(0);
            expect(summary.errors[0].collection).toBe('inactiveConversations');
        });

        test('accepts custom retention policy', async () => {
            mongoose.model.mockImplementation(() => ({
                deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 })
            }));

            // Override the period, keep the rest of the spec. The sweep is
            // driven by this object, so an override that drops `model` would
            // mean that category stops being swept — see the next test.
            const customPolicy = {
                ...DEFAULT_RETENTION_POLICY,
                studentUploads: { ...DEFAULT_RETENTION_POLICY.studentUploads, days: 7 }
            };

            const summary = await runRetentionSweep(customPolicy);
            expect(summary.errors.length).toBe(0);
        });

        test('a category with no model is reported as an error, never silently skipped', async () => {
            mongoose.model.mockImplementation(() => ({
                deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
                countDocuments: jest.fn().mockResolvedValue(0)
            }));

            // This is the shape that caused completedAssessments, gradingResults
            // and impersonationLogs to retain forever: declared with a period,
            // wired to nothing. It must surface, not pass quietly.
            const brokenPolicy = {
                orphanCategory: { days: 30, description: 'Declared but not wired up' }
            };

            const summary = await runRetentionSweep(brokenPolicy);
            expect(summary.errors).toHaveLength(1);
            expect(summary.errors[0].collection).toBe('orphanCategory');
            expect(summary.errors[0].error).toMatch(/no model/i);
        });

        test('sweeps every declared category, not a hand-picked subset', async () => {
            const swept = [];
            mongoose.model.mockImplementation((name) => {
                swept.push(name);
                return {
                    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
                    countDocuments: jest.fn().mockResolvedValue(0)
                };
            });

            await runRetentionSweep();

            // The old implementation touched only 4 of the 7 declared categories.
            expect(swept).toEqual(expect.arrayContaining([
                'Conversation', 'StudentUpload', 'ScreenerSession',
                'GradingResult', 'Feedback', 'ImpersonationLog', 'Message'
            ]));
            expect(swept).toHaveLength(Object.keys(DEFAULT_RETENTION_POLICY).length);
        });
    });

    // ========================================================================
    // Schedule management
    // ========================================================================
    describe('Schedule management', () => {
        test('startRetentionSchedule and stopRetentionSchedule work', () => {
            // Should not throw
            expect(() => startRetentionSchedule(999999999)).not.toThrow();
            expect(() => stopRetentionSchedule()).not.toThrow();
        });

        test('calling stop without start is safe', () => {
            expect(() => stopRetentionSchedule()).not.toThrow();
        });
    });
});
