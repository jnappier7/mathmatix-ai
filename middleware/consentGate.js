/**
 * CONSENT GATE MIDDLEWARE
 *
 * Rejects requests for a specific student's records when that student's
 * privacy consent is revoked or expired. Pending-with-legacy consent is
 * allowed through, matching the convention already used on the transcript
 * endpoints (a student mid-onboarding should not be blocked from IEP setup).
 *
 * Usage:
 *   const { requireActiveConsent } = require('../middleware/consentGate');
 *   router.get(
 *     '/students/:studentId/iep',
 *     isTeacher,
 *     requireActiveConsent(),
 *     logRecordAccess('iep_plan', 'teaching_instruction'),
 *     handler
 *   );
 *
 * For routes where the student ID isn't at req.params.studentId, pass a
 * getStudentId accessor:
 *
 *   requireActiveConsent({ getStudentId: (req) => req.params.childId })
 *
 * If the student doesn't exist, this middleware passes through (next()) and
 * lets the downstream handler own the 404 — so error messages stay consistent
 * with the handler's existing contract.
 */

const { checkConsent } = require('../utils/consentManager');
const User = require('../models/user');

function requireActiveConsent(options = {}) {
    const getStudentId = options.getStudentId || ((req) => req.params.studentId);

    return async (req, res, next) => {
        try {
            const studentId = getStudentId(req);
            if (!studentId) return next();

            const student = await User.findById(
                studentId,
                'privacyConsent hasParentalConsent role'
            ).lean();

            // Let the handler decide the 404 semantics (some endpoints wrap
            // "not found" with extra context). Only block here when we have a
            // student AND that student's consent is revoked/expired.
            if (!student) return next();

            const consent = checkConsent(student);
            if (!consent.hasConsent && consent.status !== 'pending') {
                return res.status(403).json({
                    message: 'Consent required to access this student record.',
                    consentStatus: { status: consent.status, pathway: consent.pathway },
                });
            }

            req.consentStatus = consent;
            return next();
        } catch (err) {
            console.error('[consentGate] error checking consent:', err);
            return next(err);
        }
    };
}

module.exports = { requireActiveConsent };
