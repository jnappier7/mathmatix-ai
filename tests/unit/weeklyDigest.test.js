// tests/unit/weeklyDigest.test.js
// The parent digest: cadence decisions, and that the email is the SAME Learning
// Report the dashboard shows (utils/parentReport), not a private copy.

const mockFindById = jest.fn();
const mockUpdate = jest.fn().mockReturnValue({ catch: () => undefined });
jest.mock('../../models/user', () => ({
    findById: (...a) => mockFindById(...a),
    findByIdAndUpdate: (...a) => mockUpdate(...a),
}));
jest.mock('../../utils/emailService', () => ({
    sendParentProgressReport: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../../utils/parentReport', () => ({ buildLearningReport: jest.fn() }));

const { shouldSendReport, processBatch } = require('../../scripts/weeklyDigest');
const { sendParentProgressReport } = require('../../utils/emailService');
const { buildLearningReport } = require('../../utils/parentReport');

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

    describe('processBatch', () => {
        beforeEach(() => jest.clearAllMocks());
        const report = (sessions) => ({ child: { firstName: 'Ana' }, insights: [], weeklySnapshot: { thisWeek: { sessions } } });

        test('emails the shared report, in the parent language, over the cadence window', async () => {
            mockFindById.mockReturnValue({ lean: () => Promise.resolve({ _id: 'k1', firstName: 'Ana' }) });
            const r = report(3);
            buildLearningReport.mockResolvedValue(r);
            const parent = { _id: 'p1', email: 'p@x.io', children: ['k1'], reportFrequency: 'daily', parentLanguage: 'Spanish' };

            const out = await processBatch([parent], { delayMs: 0 });

            expect(buildLearningReport).toHaveBeenCalledWith({ _id: 'k1', firstName: 'Ana' }, { language: 'Spanish', windowDays: 1 });
            expect(sendParentProgressReport).toHaveBeenCalledWith(parent, r);
            expect(out.sent).toBe(1);
            expect(mockUpdate).toHaveBeenCalled();
        });

        test('a child with no sessions in the window gets no email', async () => {
            mockFindById.mockReturnValue({ lean: () => Promise.resolve({ _id: 'k1', firstName: 'Ana' }) });
            buildLearningReport.mockResolvedValue(report(0));
            const out = await processBatch([{ _id: 'p1', email: 'p@x.io', children: ['k1'], reportFrequency: 'daily' }], { delayMs: 0 });
            expect(sendParentProgressReport).not.toHaveBeenCalled();
            expect(out.skipped).toBe(1);
        });

        test('reports turned off are never built', async () => {
            const out = await processBatch([{ _id: 'p1', email: 'p@x.io', children: ['k1'], reportFrequency: 'never' }], { delayMs: 0 });
            expect(buildLearningReport).not.toHaveBeenCalled();
            expect(out.skipped).toBe(1);
        });
    });
});
