/**
 * PARENTAL CONSENT VERIFICATION ROUTES (public — token authenticated)
 *
 * The landing point for the link emailed to a parent by
 * POST /api/consent/request-parent-email. The parent is NOT logged in — most
 * have no account at all — so these endpoints live outside the isAuthenticated
 * mount on /api/consent and are authenticated solely by the single-use token
 * from the emailed URL.
 *
 * Endpoints:
 *   GET  /api/consent-verify/:token   - validate link, describe the request
 *   POST /api/consent-verify/grant    - parent approves  → consent active
 *   POST /api/consent-verify/decline  - parent refuses   → consent revoked
 *
 * Security notes:
 * - The stored value is a SHA-256 hash of the token; the raw token exists only
 *   in the emailed link, so DB read access cannot mint a valid consent link.
 * - Tokens are single use and expire after 7 days (set at request time).
 * - Token comparison is a hashed-equality lookup, and the response for an
 *   invalid vs. expired token is identical, so this is not an oracle for
 *   guessing student ids.
 * - GET deliberately returns only the student's FIRST name. The recipient is
 *   an unauthenticated email address; enough to recognise their child, not a
 *   PII disclosure if the address was mistyped by the student.
 *
 * @module routes/consentVerify
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/user');
const logger = require('../utils/logger');
const {
    grantParentConsentByEmail,
    declineParentConsentByEmail,
    computeAge,
    COPPA_AGE
} = require('../utils/consentManager');

/**
 * Look up the student holding a live (unexpired, unconsumed) consent token.
 * Returns null for absent/invalid/expired — callers must not distinguish.
 */
async function findStudentByToken(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') return null;

    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    return User.findOne({
        'privacyConsent.consentToken': hashedToken,
        'privacyConsent.consentTokenExpires': { $gt: new Date() }
    });
}

const INVALID_LINK = {
    success: false,
    message: 'This consent link is invalid, has already been used, or has expired.'
};

/**
 * GET /api/consent-verify/:token
 * Validate the emailed link and describe what is being consented to.
 */
router.get('/:token', async (req, res) => {
    try {
        const student = await findStudentByToken(req.params.token);
        if (!student) return res.status(400).json(INVALID_LINK);

        const age = computeAge(student.dateOfBirth);

        res.json({
            success: true,
            studentFirstName: student.firstName || student.username || 'your child',
            parentEmail: student.privacyConsent?.pendingParentEmail || null,
            // Drives the wording on the page: under-13 is COPPA verifiable
            // parental consent; 13-17 is a parent countersigning a teen.
            requiresCoppaConsent: age !== null && age < COPPA_AGE,
            expiresAt: student.privacyConsent?.consentTokenExpires || null
        });
    } catch (error) {
        logger.error('[ConsentVerify] Token lookup failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Could not verify this link. Please try again.' });
    }
});

/**
 * POST /api/consent-verify/grant
 * Parent approves. Body: { token }
 */
router.post('/grant', async (req, res) => {
    try {
        const student = await findStudentByToken(req.body?.token);
        if (!student) return res.status(400).json(INVALID_LINK);

        const parentEmail = student.privacyConsent?.pendingParentEmail || null;

        const result = await grantParentConsentByEmail(
            student,
            { parentEmail },
            { ipAddress: req.ip, userAgent: req.get('User-Agent') }
        );

        res.json({
            success: true,
            message: 'Consent granted. Thank you!',
            studentFirstName: student.firstName || 'your child',
            consent: result
        });
    } catch (error) {
        logger.error('[ConsentVerify] Grant failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Could not save your response. Please try again.' });
    }
});

/**
 * POST /api/consent-verify/decline
 * Parent refuses. Body: { token }
 */
router.post('/decline', async (req, res) => {
    try {
        const student = await findStudentByToken(req.body?.token);
        if (!student) return res.status(400).json(INVALID_LINK);

        const parentEmail = student.privacyConsent?.pendingParentEmail || null;

        const result = await declineParentConsentByEmail(
            student,
            { parentEmail },
            { ipAddress: req.ip, userAgent: req.get('User-Agent') }
        );

        res.json({
            success: true,
            declined: true,
            message: 'Your decision has been recorded. Your child will not be able to use AI tutoring.',
            consent: result
        });
    } catch (error) {
        logger.error('[ConsentVerify] Decline failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Could not save your response. Please try again.' });
    }
});

module.exports = router;
