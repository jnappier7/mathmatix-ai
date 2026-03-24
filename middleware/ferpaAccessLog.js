/**
 * FERPA EDUCATION RECORD ACCESS LOGGING MIDDLEWARE
 *
 * Automatically logs access to student education records per FERPA 34 CFR § 99.32.
 * Attach to routes that serve student data to teachers, parents, or admins.
 *
 * Usage:
 *   const { logRecordAccess } = require('../middleware/ferpaAccessLog');
 *   router.get('/students/:studentId/iep', logRecordAccess('iep_plan', 'teaching_instruction'), handler);
 *
 * @module middleware/ferpaAccessLog
 */

const EducationRecordAccessLog = require('../models/educationRecordAccessLog');
const logger = require('../utils/logger');

/**
 * Creates middleware that logs education record access after the response is sent.
 * Non-blocking: failures are logged but do not affect the request.
 *
 * @param {string} recordType - Type of record being accessed
 * @param {string} legitimateInterest - Why the access is justified
 * @param {Object} [options] - Additional options
 * @param {string} [options.accessType] - 'view', 'export', 'api_read', etc.
 * @param {Function} [options.getStudentId] - Custom function to extract studentId from req
 * @returns {Function} Express middleware
 */
function logRecordAccess(recordType, legitimateInterest, options = {}) {
    return (req, res, next) => {
        // Log after response completes (non-blocking)
        res.on('finish', () => {
            // Only log successful access (2xx status codes)
            if (res.statusCode < 200 || res.statusCode >= 300) return;

            const studentId = options.getStudentId
                ? options.getStudentId(req)
                : req.params.studentId || req.params.childId || req.body?.studentId;

            if (!studentId || !req.user) return;

            const accessedByRole = req.user.role || 'student';

            // Determine FERPA exemption status
            const isSelfAccess = req.user._id.toString() === studentId.toString();
            const ferpaExempt = isSelfAccess;
            const exemptionReason = isSelfAccess ? 'Student self-access' : undefined;

            EducationRecordAccessLog.create({
                studentId,
                accessedBy: req.user._id,
                accessedByRole,
                recordType,
                accessType: options.accessType || 'api_read',
                legitimateInterest: isSelfAccess ? 'student_self_access' : legitimateInterest,
                endpoint: `${req.method} ${req.baseUrl}${req.route?.path || req.path}`,
                ferpaExempt,
                exemptionReason,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            }).catch(err => {
                logger.error('[FERPAAccessLog] Failed to log record access', {
                    error: err.message,
                    studentId,
                    accessedBy: req.user._id.toString(),
                    recordType
                });
            });
        });

        next();
    };
}

/**
 * Log a record access event directly (for use outside middleware context).
 *
 * @param {Object} params - Access details
 * @param {string} params.studentId - Student whose records were accessed
 * @param {string} params.accessedBy - User ID of accessor
 * @param {string} params.accessedByRole - Role of accessor
 * @param {string} params.recordType - Type of record accessed
 * @param {string} params.legitimateInterest - Justification
 * @param {Object} [params.metadata] - Optional metadata (endpoint, ip, userAgent)
 */
async function logAccess(params) {
    try {
        await EducationRecordAccessLog.create({
            studentId: params.studentId,
            accessedBy: params.accessedBy,
            accessedByRole: params.accessedByRole,
            recordType: params.recordType,
            accessType: params.accessType || 'api_read',
            legitimateInterest: params.legitimateInterest,
            endpoint: params.metadata?.endpoint,
            ferpaExempt: params.ferpaExempt || false,
            exemptionReason: params.exemptionReason,
            ipAddress: params.metadata?.ipAddress,
            userAgent: params.metadata?.userAgent
        });
    } catch (err) {
        logger.error('[FERPAAccessLog] Failed to log record access', {
            error: err.message,
            studentId: params.studentId
        });
    }
}

module.exports = { logRecordAccess, logAccess };
