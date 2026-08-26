/**
 * CONSENT MANAGEMENT ROUTES
 *
 * API endpoints for managing privacy consent:
 * - GET /api/consent/status/:studentId - Check consent status
 * - POST /api/consent/grant/parent - Parent grants consent for child
 * - POST /api/consent/grant/school - Admin grants school DPA consent
 * - POST /api/consent/grant/self - Student 13+ self-consents
 * - POST /api/consent/revoke - Revoke consent
 * - POST /api/consent/grant/batch - Batch school consent for enrollment
 * - GET /api/consent/history/:studentId - View consent audit trail
 *
 * @module routes/consent
 */

const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin, isParent } = require('../middleware/auth');
const { userHasRole } = require('../utils/roleQuery');

// Every role test in this file goes through userHasRole() — the canonical
// roles-HELD check (CLAUDE.md §12). It replaces a hand-rolled
// `user.roles?.includes(x) || user.role === x`, which reaches the same answer
// for a well-formed account but ALSO accepts a stale `role` string that roles[]
// no longer backs. roleSwitch.js validates `role` against roles[] before
// writing it, so nothing legitimate loses access; what closes is the gap where
// the two fields disagree.
const {
    grantParentConsent,
    issueParentConsentRequest,
    grantSchoolConsent,
    grantSelfConsent,
    revokeConsent,
    checkConsent,
    grantBatchSchoolConsent
} = require('../utils/consentManager');
const User = require('../models/user');
const EnrollmentCode = require('../models/enrollmentCode');
const logger = require('../utils/logger');
const { sendTeenConsentRequest } = require('../utils/emailService');

// ============================================================================
// CONSENT STATUS
// ============================================================================

/**
 * GET /api/consent/status/:studentId
 * Check consent status for a student.
 * Accessible by: admin, parent (of linked child), teacher (of enrolled student), the student themselves
 */
router.get('/status/:studentId', isAuthenticated, async (req, res) => {
    try {
        const { studentId } = req.params;
        const requestor = req.user;

        // Authorization check
        const isAdminUser = userHasRole(requestor, 'admin');
        const isParentOfChild = requestor.children?.some(id => id.toString() === studentId);
        const isSelf = requestor._id.toString() === studentId;

        if (!isAdminUser && !isParentOfChild && !isSelf) {
            // Check teacher-student relationship
            const enrollment = await EnrollmentCode.findOne({
                teacherId: requestor._id,
                'enrolledStudents.studentId': studentId
            });
            if (!enrollment) {
                return res.status(403).json({ success: false, message: 'Not authorized to view this student\'s consent status' });
            }
        }

        const student = await User.findById(studentId).select('privacyConsent hasParentalConsent dateOfBirth firstName');
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const status = checkConsent(student);

        res.json({
            success: true,
            studentId,
            consent: {
                ...status,
                studentName: student.firstName,
                dateOfBirth: student.dateOfBirth ? 'provided' : 'not provided'  // Don't expose DOB
            }
        });
    } catch (error) {
        logger.error('[Consent] Status check failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Failed to check consent status' });
    }
});

/**
 * GET /api/consent/history/:studentId
 * View full consent audit trail.
 * Admin only.
 */
router.get('/history/:studentId', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { studentId } = req.params;

        const student = await User.findById(studentId).select('privacyConsent hasParentalConsent firstName lastName');
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        res.json({
            success: true,
            studentId,
            studentName: `${student.firstName} ${student.lastName}`,
            consentPathway: student.privacyConsent?.consentPathway || 'none',
            currentStatus: student.privacyConsent?.status || (student.hasParentalConsent ? 'active (legacy)' : 'pending'),
            history: student.privacyConsent?.history || [],
            legacyConsent: student.hasParentalConsent
        });
    } catch (error) {
        logger.error('[Consent] History retrieval failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Failed to retrieve consent history' });
    }
});

// ============================================================================
// GRANT CONSENT
// ============================================================================

/**
 * POST /api/consent/grant/parent
 * Parent grants consent for their linked child.
 */
router.post('/grant/parent', isAuthenticated, isParent, async (req, res) => {
    try {
        const { studentId } = req.body;

        if (!studentId) {
            return res.status(400).json({ success: false, message: 'studentId is required' });
        }

        // Verify parent-child link
        const isLinked = req.user.children?.some(id => id.toString() === studentId);
        if (!isLinked) {
            return res.status(403).json({ success: false, message: 'You can only grant consent for your linked children' });
        }

        const result = await grantParentConsent(studentId, {
            parentId: req.user._id,
            parentName: `${req.user.firstName} ${req.user.lastName}`
        }, {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ success: true, message: 'Consent granted successfully', consent: result });
    } catch (error) {
        logger.error('[Consent] Parent consent grant failed', { error: error.message });
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/consent/grant/school
 * Admin grants school/district DPA-based consent for a student.
 */
router.post('/grant/school', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { studentId, schoolName, districtName, dpaReferenceId, schoolId, districtId, dpaExpiresAt } = req.body;

        if (!studentId || !schoolName) {
            return res.status(400).json({ success: false, message: 'studentId and schoolName are required' });
        }

        const result = await grantSchoolConsent(studentId, {
            schoolName,
            districtName,
            dpaReferenceId,
            schoolId,
            districtId,
            dpaExpiresAt: dpaExpiresAt ? new Date(dpaExpiresAt) : null,
            grantedBy: req.user._id,
            grantedByRole: 'admin',
            grantedByName: `${req.user.firstName} ${req.user.lastName}`
        }, {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ success: true, message: 'School consent granted successfully', consent: result });
    } catch (error) {
        logger.error('[Consent] School consent grant failed', { error: error.message });
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/consent/grant/self
 * Student 13+ grants their own consent.
 */
router.post('/grant/self', isAuthenticated, async (req, res) => {
    try {
        const studentId = req.user._id.toString();

        // Must be a student role
        const isStudent = userHasRole(req.user, 'student');
        if (!isStudent) {
            return res.status(403).json({ success: false, message: 'Self-consent is only available for students' });
        }

        const result = await grantSelfConsent(studentId, {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ success: true, message: 'Consent granted successfully', consent: result });
    } catch (error) {
        logger.error('[Consent] Self-consent grant failed', { error: error.message });
        const status = error.message.includes('13 or older') ? 403 : 500;
        res.status(status).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/consent/grant/batch
 * Admin grants school consent for multiple students at once.
 * Typically used when a district signs a DPA and enrolls a class.
 */
router.post('/grant/batch', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { studentIds, schoolName, districtName, dpaReferenceId, schoolId, districtId, dpaExpiresAt } = req.body;

        if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({ success: false, message: 'studentIds array is required' });
        }

        if (!schoolName) {
            return res.status(400).json({ success: false, message: 'schoolName is required' });
        }

        const result = await grantBatchSchoolConsent(studentIds, {
            schoolName,
            districtName,
            dpaReferenceId,
            schoolId,
            districtId,
            dpaExpiresAt: dpaExpiresAt ? new Date(dpaExpiresAt) : null,
            grantedBy: req.user._id,
            grantedByRole: 'admin',
            grantedByName: `${req.user.firstName} ${req.user.lastName}`
        }, {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({
            success: true,
            message: `Consent granted for ${result.success} students`,
            results: result
        });
    } catch (error) {
        logger.error('[Consent] Batch consent grant failed', { error: error.message });
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================================
// REVOKE CONSENT
// ============================================================================

/**
 * POST /api/consent/revoke
 * Revoke consent for a student. Admin or parent (of linked child).
 */
router.post('/revoke', isAuthenticated, async (req, res) => {
    try {
        const { studentId, reason } = req.body;

        if (!studentId) {
            return res.status(400).json({ success: false, message: 'studentId is required' });
        }

        const isAdminUser = userHasRole(req.user, 'admin');
        const isParentOfChild = req.user.children?.some(id => id.toString() === studentId);

        if (!isAdminUser && !isParentOfChild) {
            return res.status(403).json({ success: false, message: 'Only admins or linked parents can revoke consent' });
        }

        const result = await revokeConsent(studentId, {
            revokerId: req.user._id,
            revokerRole: isAdminUser ? 'admin' : 'parent',
            reason: reason || 'Consent revoked by request'
        });

        res.json({
            success: true,
            message: 'Consent revoked successfully. Student data will be retained per retention policy unless explicit deletion is requested.',
            consent: result
        });
    } catch (error) {
        logger.error('[Consent] Consent revocation failed', { error: error.message });
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/consent/request-parent-email
 * Student 13-17: Request parent email verification for consent.
 * Records the parent email and sets consent to pending.
 * In production, this would send an actual verification email.
 */
router.post('/request-parent-email', isAuthenticated, async (req, res) => {
    try {
        const { parentEmail } = req.body;

        if (!parentEmail) {
            return res.status(400).json({ success: false, message: 'parentEmail is required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(parentEmail)) {
            return res.status(400).json({ success: false, message: 'Invalid email format' });
        }

        const student = await User.findById(req.user._id);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        // Issue the request. Status stays 'pending' and hasParentalConsent is
        // left alone — setting it here would let a student self-consent by
        // typing any address. Deliberately no history record either: history is
        // the COPPA audit trail of consent ACTS, and the only actor so far is
        // the child. Writing a 'parent_individual' grant record at request time
        // (as this route used to) put a full-scope grant, stamped with the
        // student's own IP, into the trail for a parent who had not yet been
        // asked. The real record is written when the parent responds, by
        // grantParentConsentByEmail in routes/consentVerify.js.
        const consentToken = await issueParentConsentRequest(student, parentEmail);

        // Send the consent email to the parent
        const studentName = student.firstName || student.name || 'Your child';
        const emailResult = await sendTeenConsentRequest(
            parentEmail,
            studentName,
            consentToken,
            student._id.toString()
        );

        logger.info('[Consent] Parent email consent requested', {
            studentId: req.user._id.toString(),
            emailSent: emailResult.success,
            pathway: 'email_verification'
        });

        res.json({
            success: true,
            consentPending: true,
            message: emailResult.success
                ? 'Verification email sent to your parent. Some features will be available once they confirm.'
                : 'Your consent request has been recorded. If your parent didn\'t receive the email, they can approve from their parent dashboard.'
        });
    } catch (error) {
        logger.error('[Consent] Parent email consent request failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Failed to process consent request' });
    }
});

// ============================================================================
// FERPA DIRECTORY INFORMATION OPT-OUT (34 CFR § 99.37)
// ============================================================================

/**
 * GET /api/consent/directory-info/:studentId
 * Check directory information opt-out status.
 */
router.get('/directory-info/:studentId', isAuthenticated, async (req, res) => {
    try {
        const { studentId } = req.params;
        const isAdminUser = userHasRole(req.user, 'admin');
        const isParentOfChild = req.user.children?.some(id => id.toString() === studentId);
        const isSelf = req.user._id.toString() === studentId;

        if (!isAdminUser && !isParentOfChild && !isSelf) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const student = await User.findById(studentId).select('ferpaSettings firstName');
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        res.json({
            success: true,
            studentId,
            studentName: student.firstName,
            directoryInfoOptOut: student.ferpaSettings?.directoryInfoOptOut || false,
            optOutDate: student.ferpaSettings?.directoryInfoOptOutDate || null,
            directoryInfoFields: ['First Name', 'Grade Level', 'Math Course', 'Gamification Level', 'Badge Names']
        });
    } catch (error) {
        logger.error('[Consent] Directory info check failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Failed to check directory information status' });
    }
});

/**
 * PUT /api/consent/directory-info/:studentId
 * Toggle directory information opt-out for a student.
 * Available to: parent (for linked child), admin.
 */
router.put('/directory-info/:studentId', isAuthenticated, async (req, res) => {
    try {
        const { studentId } = req.params;
        const { optOut } = req.body;

        if (typeof optOut !== 'boolean') {
            return res.status(400).json({ success: false, message: 'optOut (boolean) is required' });
        }

        const isAdminUser = userHasRole(req.user, 'admin');
        const isParentOfChild = req.user.children?.some(id => id.toString() === studentId);

        if (!isAdminUser && !isParentOfChild) {
            return res.status(403).json({
                success: false,
                message: 'Only parents and admins can change directory information settings'
            });
        }

        const update = {
            'ferpaSettings.directoryInfoOptOut': optOut
        };
        if (optOut) {
            update['ferpaSettings.directoryInfoOptOutDate'] = new Date();
        }

        const student = await User.findByIdAndUpdate(studentId, { $set: update }, { new: true });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        logger.info('[Consent] Directory info opt-out updated', {
            studentId,
            optOut,
            updatedBy: req.user._id.toString(),
            role: isAdminUser ? 'admin' : 'parent'
        });

        res.json({
            success: true,
            message: optOut
                ? 'Directory information opt-out enabled. Your child\'s name and details will be hidden from leaderboards and public displays.'
                : 'Directory information opt-out disabled. Your child\'s name and details may appear on leaderboards.',
            directoryInfoOptOut: optOut
        });
    } catch (error) {
        logger.error('[Consent] Directory info update failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Failed to update directory information settings' });
    }
});

module.exports = router;
