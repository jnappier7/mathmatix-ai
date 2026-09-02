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
const { rolesOf } = require('../utils/roleQuery');
const logger = require('../utils/logger');

// Most-privileged first: an account holding several roles is recorded by the
// strongest access it could have used, which is the honest answer to "who read
// this record". Matches the accessedByRole enum on the model.
const ROLE_PRECEDENCE = ['admin', 'teacher', 'parent', 'student'];

/**
 * The role to attribute an access to, chosen from the roles the user HOLDS.
 * Falls back to 'student' so the required field is always populated.
 */
function mostPrivilegedRole(user) {
    const held = rolesOf(user);
    return ROLE_PRECEDENCE.find((r) => held.includes(r)) || 'student';
}

/**
 * Creates middleware that logs education record access after the response is sent.
 * Non-blocking: failures are logged but do not affect the request.
 *
 * @param {string} recordType - Type of record being accessed
 * @param {string} legitimateInterest - Why the access is justified
 * @param {Object} [options] - Additional options
 * @param {string} [options.accessType] - 'view', 'export', 'api_read', etc.
 * @param {Function} [options.getStudentId] - Custom function to extract studentId from req
 * @param {Function} [options.getStudentIds] - Custom function returning EVERY studentId the
 *   request touched (a roster-wide read). One entry is written per student; the handler
 *   usually sets these on req once it knows who was read.
 * @returns {Function} Express middleware
 */
function logRecordAccess(recordType, legitimateInterest, options = {}) {
    return (req, res, next) => {
        // Log after response completes (non-blocking)
        res.on('finish', () => {
            // Only log successful access (2xx status codes)
            if (res.statusCode < 200 || res.statusCode >= 300) return;
            if (!req.user) return;

            let studentIds;
            if (options.getStudentIds) {
                studentIds = options.getStudentIds(req) || [];
            } else {
                const one = options.getStudentId
                    ? options.getStudentId(req)
                    : req.params.studentId || req.params.childId || req.body?.studentId;
                studentIds = one ? [one] : [];
            }
            studentIds = studentIds.filter(Boolean);
            if (studentIds.length === 0) return;

            // Label the accessor by the most privileged role they HOLD, not by
            // req.user.role — that is the dashboard they happen to be viewing.
            // An admin who had switched to their parent view logged as 'parent',
            // so the audit trail understated who actually read the record. See
            // the role vs roles[] note in CLAUDE.md.
            const accessedByRole = mostPrivilegedRole(req.user);
            const endpoint = `${req.method} ${req.baseUrl}${req.route?.path || req.path}`;

            const docs = studentIds.map((studentId) => {
                // Determine FERPA exemption status
                const isSelfAccess = req.user._id.toString() === studentId.toString();
                return {
                    studentId,
                    accessedBy: req.user._id,
                    accessedByRole,
                    recordType,
                    accessType: options.accessType || 'api_read',
                    legitimateInterest: isSelfAccess ? 'student_self_access' : legitimateInterest,
                    endpoint,
                    ferpaExempt: isSelfAccess,
                    exemptionReason: isSelfAccess ? 'Student self-access' : undefined,
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent')
                };
            });

            const write = docs.length === 1
                ? EducationRecordAccessLog.create(docs[0])
                : EducationRecordAccessLog.insertMany(docs, { ordered: false });

            write.catch(err => {
                logger.error('[FERPAAccessLog] Failed to log record access', {
                    error: err.message,
                    studentId: docs.length === 1 ? docs[0].studentId : undefined,
                    studentCount: docs.length,
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

module.exports = { logRecordAccess, logAccess, mostPrivilegedRole };
