// tests/unit/consentGate.test.js
// Unit tests for the requireActiveConsent middleware.

jest.mock('../../models/user', () => ({
    findById: jest.fn(),
}));

const User = require('../../models/user');
const { requireActiveConsent } = require('../../middleware/consentGate');

function makeCtx({ params = {}, body = {} } = {}) {
    const req = { params, body };
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();
    return { req, res, next };
}

describe('requireActiveConsent middleware', () => {
    const STUDENT_ID = '650000000000000000000001';

    beforeEach(() => jest.clearAllMocks());

    test('allows active consent through', async () => {
        User.findById.mockReturnValueOnce({
            lean: jest.fn().mockResolvedValue({
                _id: STUDENT_ID,
                hasParentalConsent: true,
                privacyConsent: { status: 'active', consentPathway: 'school_dpa' },
            }),
        });

        const { req, res, next } = makeCtx({ params: { studentId: STUDENT_ID } });
        await requireActiveConsent()(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
        expect(req.consentStatus.hasConsent).toBe(true);
    });

    test('blocks with 403 on revoked consent', async () => {
        User.findById.mockReturnValueOnce({
            lean: jest.fn().mockResolvedValue({
                _id: STUDENT_ID,
                hasParentalConsent: false,
                privacyConsent: { status: 'revoked', consentPathway: 'individual_parent' },
            }),
        });

        const { req, res, next } = makeCtx({ params: { studentId: STUDENT_ID } });
        await requireActiveConsent()(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            consentStatus: expect.objectContaining({ status: 'revoked' }),
        }));
        expect(next).not.toHaveBeenCalled();
    });

    test('allows pending-with-legacy consent through', async () => {
        // A student mid-onboarding: no privacyConsent set yet, but the legacy
        // hasParentalConsent field is true. checkConsent surfaces that as
        // status=active/pathway=legacy. Middleware must not block.
        User.findById.mockReturnValueOnce({
            lean: jest.fn().mockResolvedValue({
                _id: STUDENT_ID,
                hasParentalConsent: true,
                // no privacyConsent field
            }),
        });

        const { req, res, next } = makeCtx({ params: { studentId: STUDENT_ID } });
        await requireActiveConsent()(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    });

    test('passes through when student does not exist (handler owns 404)', async () => {
        User.findById.mockReturnValueOnce({
            lean: jest.fn().mockResolvedValue(null),
        });

        const { req, res, next } = makeCtx({ params: { studentId: STUDENT_ID } });
        await requireActiveConsent()(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    });

    test('respects custom getStudentId accessor', async () => {
        User.findById.mockReturnValueOnce({
            lean: jest.fn().mockResolvedValue({
                _id: STUDENT_ID,
                hasParentalConsent: true,
                privacyConsent: { status: 'active', consentPathway: 'school_dpa' },
            }),
        });

        const { req, res, next } = makeCtx({ params: { childId: STUDENT_ID } });
        await requireActiveConsent({ getStudentId: (r) => r.params.childId })(req, res, next);

        expect(User.findById).toHaveBeenCalledWith(STUDENT_ID, expect.any(String));
        expect(next).toHaveBeenCalledWith();
    });
});
