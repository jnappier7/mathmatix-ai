// tests/unit/consentGate.test.js
// Unit tests for the requireActiveConsent middleware.

jest.mock('../../models/user', () => ({
    findById: jest.fn(),
}));

const User = require('../../models/user');
const {
    requireActiveConsent,
    requireOwnConsent,
    evaluateOwnConsent,
    getEnforcementMode,
} = require('../../middleware/consentGate');

function yearsAgo(n) {
    return new Date(Date.now() - n * 365.25 * 24 * 60 * 60 * 1000);
}

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

// ============================================================================
// evaluateOwnConsent — the requesting user's own consent (decision table)
// ============================================================================

describe('evaluateOwnConsent', () => {
    const student = (over = {}) => ({ _id: 's1', role: 'student', ...over });

    test('no user passes (unauthenticated surfaces are not this gate\'s job)', () => {
        expect(evaluateOwnConsent(null)).toMatchObject({ allow: true, bucket: 'no_user' });
    });

    test('adult roles pass, including multi-role accounts by roles HELD', () => {
        expect(evaluateOwnConsent({ role: 'teacher' })).toMatchObject({ allow: true, bucket: 'non_student' });
        // Active role says student (dashboard view), but the account holds parent.
        expect(evaluateOwnConsent({ role: 'student', roles: ['student', 'parent'] }))
            .toMatchObject({ allow: true, bucket: 'non_student' });
    });

    test('active consent passes on any pathway', () => {
        expect(evaluateOwnConsent(student({
            privacyConsent: { status: 'active', consentPathway: 'school_dpa', history: [{}] },
        }))).toMatchObject({ allow: true, bucket: 'active' });
    });

    test('legacy .lean() shape (no privacyConsent at all) passes via checkConsent fallback', () => {
        expect(evaluateOwnConsent(student({ hasParentalConsent: true })))
            .toMatchObject({ allow: true });
    });

    test('legacy HYDRATED shape (schema-defaulted pending + flag + empty history) passes', () => {
        // A hydrated mongoose doc defaults privacyConsent.status to 'pending',
        // masking checkConsent's legacy branch. The gate must catch this shape
        // or every legacy-consented student misclassifies as pending.
        expect(evaluateOwnConsent(student({
            hasParentalConsent: true,
            privacyConsent: { status: 'pending', history: [] },
        }))).toMatchObject({ allow: true, bucket: 'legacy' });
    });

    test('revoked blocks with CONSENT_REVOKED', () => {
        expect(evaluateOwnConsent(student({
            privacyConsent: { status: 'revoked', consentPathway: 'individual_parent', history: [] },
        }))).toMatchObject({ allow: false, code: 'CONSENT_REVOKED' });
    });

    test('expired DPA blocks with CONSENT_EXPIRED', () => {
        expect(evaluateOwnConsent(student({
            privacyConsent: {
                status: 'active',
                consentPathway: 'school_dpa',
                history: [{ consentType: 'school_official', grantedAt: yearsAgo(2), expiresAt: yearsAgo(1) }],
            },
        }))).toMatchObject({ allow: false, code: 'CONSENT_EXPIRED' });
    });

    test('pending under-13 blocks with CONSENT_REQUIRED_PARENT', () => {
        expect(evaluateOwnConsent(student({
            dateOfBirth: yearsAgo(10),
            privacyConsent: { status: 'pending', history: [{ consentType: 'parent_individual' }] },
        }))).toMatchObject({ allow: false, code: 'CONSENT_REQUIRED_PARENT', bucket: 'under13_pending' });
    });

    test('pending teen (13-17) passes, tagged for telemetry', () => {
        expect(evaluateOwnConsent(student({
            dateOfBirth: yearsAgo(15),
            privacyConsent: { status: 'pending', history: [{ consentType: 'parent_individual' }] },
        }))).toMatchObject({ allow: true, code: 'CONSENT_SELF_CERT_PENDING', bucket: 'teen_pending' });
    });

    test('pending with null DOB passes on the grace path, tagged', () => {
        expect(evaluateOwnConsent(student({
            privacyConsent: { status: 'pending', history: [{ consentType: 'parent_individual' }] },
        }))).toMatchObject({ allow: true, code: 'CONSENT_UNKNOWN_DOB', bucket: 'null_dob' });
    });
});

// ============================================================================
// requireOwnConsent — mode behavior (off | log | enforce)
// ============================================================================

describe('requireOwnConsent middleware', () => {
    const ORIGINAL_MODE = process.env.CONSENT_ENFORCEMENT;
    afterEach(() => {
        if (ORIGINAL_MODE === undefined) delete process.env.CONSENT_ENFORCEMENT;
        else process.env.CONSENT_ENFORCEMENT = ORIGINAL_MODE;
    });

    const blockedUser = {
        _id: 'u1',
        role: 'student',
        dateOfBirth: yearsAgo(10),
        privacyConsent: { status: 'pending', history: [{ consentType: 'parent_individual' }] },
    };

    function ownCtx(user) {
        const req = { user, path: '/api/chat' };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
        const next = jest.fn();
        return { req, res, next };
    }

    // The default is 'enforce'. It was 'log' during the staged rollout, which
    // meant the gate was mounted everywhere and blocked nothing. A typo'd env
    // var must fail closed for the same reason.
    test('defaults to enforce mode, and unknown values fall back to enforce', () => {
        delete process.env.CONSENT_ENFORCEMENT;
        expect(getEnforcementMode()).toBe('enforce');
        process.env.CONSENT_ENFORCEMENT = 'bogus';
        expect(getEnforcementMode()).toBe('enforce');
    });

    test('an unconsented under-13 is blocked with no env var set at all', () => {
        delete process.env.CONSENT_ENFORCEMENT;
        const { req, res, next } = ownCtx(blockedUser);
        requireOwnConsent()(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('CONSENT_ENFORCEMENT=log is still an available rollback', () => {
        process.env.CONSENT_ENFORCEMENT = 'log';
        const { req, res, next } = ownCtx(blockedUser);
        requireOwnConsent()(req, res, next);
        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    });

    test('log mode never blocks, even an unconsented under-13', () => {
        process.env.CONSENT_ENFORCEMENT = 'log';
        const { req, res, next } = ownCtx(blockedUser);
        requireOwnConsent()(req, res, next);
        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    });

    test('enforce mode blocks the unconsented under-13 with a routable code', () => {
        process.env.CONSENT_ENFORCEMENT = 'enforce';
        const { req, res, next } = ownCtx(blockedUser);
        requireOwnConsent()(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            consentRequired: true,
            consentCode: 'CONSENT_REQUIRED_PARENT',
        }));
        expect(next).not.toHaveBeenCalled();
    });

    test('enforce mode passes an actively consented student', () => {
        process.env.CONSENT_ENFORCEMENT = 'enforce';
        const { req, res, next } = ownCtx({
            _id: 'u2', role: 'student',
            privacyConsent: { status: 'active', consentPathway: 'individual_parent', history: [{}] },
        });
        requireOwnConsent()(req, res, next);
        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    });

    test('off mode is a no-op', () => {
        process.env.CONSENT_ENFORCEMENT = 'off';
        const { req, res, next } = ownCtx(blockedUser);
        requireOwnConsent()(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    test('fails open when evaluation throws', () => {
        process.env.CONSENT_ENFORCEMENT = 'enforce';
        // rolesOf tolerates junk, so poison privacyConsent access instead.
        const poisoned = { role: 'student' };
        Object.defineProperty(poisoned, 'privacyConsent', {
            get() { throw new Error('boom'); },
        });
        const { req, res, next } = ownCtx(poisoned);
        requireOwnConsent()(req, res, next);
        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    });
});
