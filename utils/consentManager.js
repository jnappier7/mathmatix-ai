/**
 * CONSENT MANAGER - COPPA/FERPA Consent Lifecycle Management
 *
 * Handles granting, revoking, and verifying privacy consent for students.
 * Supports two consent pathways:
 *
 * 1. INDIVIDUAL PARENT CONSENT (COPPA direct)
 *    - Parent signs up, links to child, grants consent
 *    - Required for under-13 students not enrolled via school
 *
 * 2. SCHOOL/DISTRICT CONSENT (COPPA school exception + FERPA)
 *    - School signs DPA with Mathmatix
 *    - Teacher enrolls students via enrollment code
 *    - School acts as parent's agent for consent
 *    - Data use limited to educational purpose defined in DPA
 *
 * @module utils/consentManager
 */

const logger = require('./logger');
const User = require('../models/user');

// ============================================================================
// FULL CONSENT SCOPE (all permissions when fully consented)
// ============================================================================

const FULL_CONSENT_SCOPE = [
    'data_collection',
    'ai_processing',
    'progress_tracking',
    'teacher_visibility',
    'parent_visibility',
    'iep_data_processing'
];

// ============================================================================
// GRANT CONSENT
// ============================================================================

/**
 * Grant consent for a student via individual parent.
 *
 * @param {string} studentId - The student's user ID
 * @param {Object} parentInfo - { parentId, parentName }
 * @param {Object} [metadata] - { ipAddress, userAgent }
 * @returns {Object} Updated consent status
 */
async function grantParentConsent(studentId, parentInfo, metadata = {}) {
    const student = await User.findById(studentId);
    if (!student) throw new Error('Student not found');

    const consentRecord = {
        consentType: 'parent_individual',
        grantedBy: parentInfo.parentId,
        grantedByRole: 'parent',
        grantedByName: parentInfo.parentName,
        grantedAt: new Date(),
        scope: FULL_CONSENT_SCOPE,
        verificationMethod: 'email_link',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
    };

    // Initialize privacyConsent if needed
    if (!student.privacyConsent) {
        student.privacyConsent = {};
    }
    if (!student.privacyConsent.history) {
        student.privacyConsent.history = [];
    }

    student.privacyConsent.status = 'active';
    student.privacyConsent.consentPathway = 'individual_parent';
    student.privacyConsent.activeConsentDate = new Date();
    student.privacyConsent.history.push(consentRecord);

    // Also update the legacy field for backwards compatibility
    student.hasParentalConsent = true;

    await student.save();

    logger.info('[ConsentManager] Parent consent granted', {
        studentId,
        parentId: parentInfo.parentId,
        pathway: 'individual_parent'
    });

    return { status: 'active', pathway: 'individual_parent', grantedAt: consentRecord.grantedAt };
}

/**
 * Grant consent for a student via school/district DPA.
 *
 * @param {string} studentId - The student's user ID
 * @param {Object} schoolInfo - { schoolName, districtName, dpaReferenceId, grantedBy, grantedByRole }
 * @param {Object} [metadata] - { ipAddress, userAgent }
 * @returns {Object} Updated consent status
 */
async function grantSchoolConsent(studentId, schoolInfo, metadata = {}) {
    const student = await User.findById(studentId);
    if (!student) throw new Error('Student not found');

    const consentRecord = {
        consentType: 'school_official',
        grantedBy: schoolInfo.grantedBy,
        grantedByRole: schoolInfo.grantedByRole || 'admin',
        grantedByName: schoolInfo.grantedByName,
        schoolName: schoolInfo.schoolName,
        districtName: schoolInfo.districtName,
        dpaReferenceId: schoolInfo.dpaReferenceId,
        grantedAt: new Date(),
        expiresAt: schoolInfo.dpaExpiresAt || null,
        scope: FULL_CONSENT_SCOPE,
        verificationMethod: 'dpa_signature',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
    };

    if (!student.privacyConsent) {
        student.privacyConsent = {};
    }
    if (!student.privacyConsent.history) {
        student.privacyConsent.history = [];
    }

    student.privacyConsent.status = 'active';
    student.privacyConsent.consentPathway = 'school_dpa';
    student.privacyConsent.activeConsentDate = new Date();
    student.privacyConsent.schoolId = schoolInfo.schoolId;
    student.privacyConsent.districtId = schoolInfo.districtId;
    student.privacyConsent.history.push(consentRecord);

    // Legacy field
    student.hasParentalConsent = true;

    await student.save();

    logger.info('[ConsentManager] School consent granted', {
        studentId,
        schoolName: schoolInfo.schoolName,
        dpaReferenceId: schoolInfo.dpaReferenceId,
        pathway: 'school_dpa'
    });

    return { status: 'active', pathway: 'school_dpa', grantedAt: consentRecord.grantedAt };
}

/**
 * Grant self-consent for students 13 and older.
 *
 * @param {string} studentId - The student's user ID
 * @param {Object} [metadata] - { ipAddress, userAgent }
 * @returns {Object} Updated consent status
 */
async function grantSelfConsent(studentId, metadata = {}) {
    const student = await User.findById(studentId);
    if (!student) throw new Error('Student not found');

    // Verify age >= 13
    if (student.dateOfBirth) {
        const age = Math.floor((new Date() - new Date(student.dateOfBirth)) / (365.25 * 24 * 60 * 60 * 1000));
        if (age < 13) {
            throw new Error('Student must be 13 or older for self-consent');
        }
    }

    const consentRecord = {
        consentType: 'student_self',
        grantedBy: studentId,
        grantedByRole: 'student',
        grantedAt: new Date(),
        scope: FULL_CONSENT_SCOPE,
        verificationMethod: 'age_self_certification',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
    };

    if (!student.privacyConsent) {
        student.privacyConsent = {};
    }
    if (!student.privacyConsent.history) {
        student.privacyConsent.history = [];
    }

    student.privacyConsent.status = 'active';
    student.privacyConsent.consentPathway = 'self_13_plus';
    student.privacyConsent.activeConsentDate = new Date();
    student.privacyConsent.history.push(consentRecord);
    student.hasParentalConsent = true;

    await student.save();

    logger.info('[ConsentManager] Self-consent granted', {
        studentId,
        pathway: 'self_13_plus'
    });

    return { status: 'active', pathway: 'self_13_plus', grantedAt: consentRecord.grantedAt };
}

// ============================================================================
// REVOKE CONSENT
// ============================================================================

/**
 * Revoke consent for a student.
 * Does NOT delete data — that's a separate step via the data deletion pipeline.
 *
 * @param {string} studentId - The student's user ID
 * @param {Object} revokerInfo - { revokerId, revokerRole, reason }
 * @returns {Object} Updated consent status
 */
async function revokeConsent(studentId, revokerInfo) {
    const student = await User.findById(studentId);
    if (!student) throw new Error('Student not found');

    const isParentRevocation = revokerInfo.revokerRole === 'parent';
    const consentRecord = {
        consentType: isParentRevocation ? 'parent_revoked' : 'school_revoked',
        grantedBy: revokerInfo.revokerId,
        grantedByRole: revokerInfo.revokerRole,
        grantedAt: new Date(),
        revokedAt: new Date(),
        scope: [],
        verificationMethod: 'admin_override'
    };

    if (!student.privacyConsent) {
        student.privacyConsent = {};
    }
    if (!student.privacyConsent.history) {
        student.privacyConsent.history = [];
    }

    student.privacyConsent.status = 'revoked';
    student.privacyConsent.history.push(consentRecord);
    student.hasParentalConsent = false;

    await student.save();

    logger.info('[ConsentManager] Consent revoked', {
        studentId,
        revokedBy: revokerInfo.revokerId,
        revokerRole: revokerInfo.revokerRole,
        reason: revokerInfo.reason
    });

    return { status: 'revoked', revokedAt: consentRecord.revokedAt };
}

// ============================================================================
// CHECK CONSENT
// ============================================================================

/**
 * Check whether a student has active consent.
 *
 * @param {Object} user - The user document (or user object with privacyConsent)
 * @returns {Object} { hasConsent, pathway, status, details }
 */
function checkConsent(user) {
    if (!user) return { hasConsent: false, pathway: 'none', status: 'pending', details: 'No user provided' };

    const consent = user.privacyConsent;

    // Fallback to legacy field
    if (!consent || !consent.status) {
        return {
            hasConsent: !!user.hasParentalConsent,
            pathway: user.hasParentalConsent ? 'legacy' : 'none',
            status: user.hasParentalConsent ? 'active' : 'pending',
            details: 'Using legacy hasParentalConsent field'
        };
    }

    // Check for expiration (DPA-based consent can expire)
    if (consent.status === 'active' && consent.history && consent.history.length > 0) {
        const latestActive = consent.history
            .filter(r => r.consentType !== 'parent_revoked' && r.consentType !== 'school_revoked')
            .sort((a, b) => new Date(b.grantedAt) - new Date(a.grantedAt))[0];

        if (latestActive && latestActive.expiresAt && new Date() > new Date(latestActive.expiresAt)) {
            return {
                hasConsent: false,
                pathway: consent.consentPathway,
                status: 'expired',
                details: `DPA expired on ${latestActive.expiresAt}`
            };
        }
    }

    return {
        hasConsent: consent.status === 'active',
        pathway: consent.consentPathway || 'none',
        status: consent.status,
        details: consent.status === 'active'
            ? `Active via ${consent.consentPathway}`
            : `Consent ${consent.status}`
    };
}

/**
 * Check if a specific consent scope is granted.
 *
 * @param {Object} user - The user document
 * @param {string} scopeName - e.g., 'ai_processing', 'iep_data_processing'
 * @returns {boolean} Whether the scope is consented
 */
function hasConsentScope(user, scopeName) {
    const consentStatus = checkConsent(user);
    if (!consentStatus.hasConsent) return false;

    // If using legacy consent, assume full scope
    if (consentStatus.pathway === 'legacy') return true;

    const consent = user.privacyConsent;
    if (!consent || !consent.history || consent.history.length === 0) return false;

    // Find the most recent active consent record
    const latestActive = consent.history
        .filter(r => r.consentType !== 'parent_revoked' && r.consentType !== 'school_revoked')
        .sort((a, b) => new Date(b.grantedAt) - new Date(a.grantedAt))[0];

    if (!latestActive || !latestActive.scope) return false;

    return latestActive.scope.includes(scopeName);
}

/**
 * Grant consent for a batch of students (e.g., when a school signs a DPA).
 *
 * @param {Array<string>} studentIds - Array of student user IDs
 * @param {Object} schoolInfo - Same as grantSchoolConsent
 * @param {Object} [metadata] - { ipAddress, userAgent }
 * @returns {Object} Summary of results
 */
async function grantBatchSchoolConsent(studentIds, schoolInfo, metadata = {}) {
    const results = { success: 0, failed: 0, errors: [] };

    for (const studentId of studentIds) {
        try {
            await grantSchoolConsent(studentId, schoolInfo, metadata);
            results.success++;
        } catch (err) {
            results.failed++;
            results.errors.push({ studentId, error: err.message });
        }
    }

    logger.info('[ConsentManager] Batch school consent completed', {
        total: studentIds.length,
        success: results.success,
        failed: results.failed,
        schoolName: schoolInfo.schoolName
    });

    return results;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Consent lifecycle
    grantParentConsent,
    grantSchoolConsent,
    grantSelfConsent,
    revokeConsent,

    // Checking
    checkConsent,
    hasConsentScope,

    // Batch operations
    grantBatchSchoolConsent,

    // Constants
    FULL_CONSENT_SCOPE
};
