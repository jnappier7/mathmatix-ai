/**
 * DATA RETENTION POLICY ENGINE
 *
 * Manages configurable retention periods for student data.
 * Supports both automatic TTL-based cleanup and manual sweep jobs.
 *
 * RETENTION TIERS:
 * 1. Active data: No retention limit while student account is active
 * 2. Inactive conversations: Archived after 12 months of inactivity
 * 3. Completed assessments: Retained for 3 years (educational records requirement)
 * 4. Student uploads (photos): Deleted after 30 days (already exists partially)
 * 5. Deleted accounts: All data purged immediately via cascade delete
 * 6. Session/auth data: 7 days (already configured via express-session TTL)
 *
 * COMPLIANCE NOTES:
 * - FERPA requires educational records to be available for parent inspection
 *   for as long as the student is enrolled. Post-enrollment, schools set policy.
 * - COPPA requires deletion when parental consent is revoked.
 * - State laws vary: some require deletion within 45 days of request.
 *
 * @module utils/dataRetention
 */

const mongoose = require('mongoose');
const logger = require('./logger');

// ============================================================================
// RETENTION CONFIGURATION
// ============================================================================

/**
 * Default retention periods (in days).
 * These can be overridden per-district via school DPA agreements.
 */
const DEFAULT_RETENTION_POLICY = {
    // Conversation history for inactive students
    inactiveConversations: {
        days: 365,           // 12 months
        description: 'Conversations from students inactive for 12+ months'
    },

    // Student file uploads (homework photos, etc.)
    studentUploads: {
        days: 30,            // 30 days
        description: 'Uploaded files (homework photos, documents)'
    },

    // Completed screener/assessment sessions
    completedAssessments: {
        days: 1095,          // 3 years (standard educational record retention)
        description: 'Completed placement tests and assessments'
    },

    // Grading results
    gradingResults: {
        days: 1095,          // 3 years
        description: 'AI-graded homework results'
    },

    // Feedback submissions
    feedback: {
        days: 365,           // 1 year
        description: 'Student feedback and bug reports'
    },

    // Impersonation audit logs
    impersonationLogs: {
        days: 1095,          // 3 years (compliance audit trail)
        description: 'Admin/teacher impersonation audit logs'
    },

    // Direct messages
    messages: {
        days: 365,           // 1 year
        description: 'Teacher-parent and system messages'
    }
};

// ============================================================================
// RETENTION SWEEP - Scheduled cleanup job
// ============================================================================

/**
 * Run the data retention sweep.
 * Identifies and removes data that has exceeded its retention period.
 *
 * @param {Object} [customPolicy] - Override default retention periods
 * @param {boolean} [dryRun=false] - If true, report what would be deleted without deleting
 * @returns {Object} Summary of what was (or would be) deleted
 */
async function runRetentionSweep(customPolicy = null, dryRun = false) {
    const policy = customPolicy || DEFAULT_RETENTION_POLICY;
    const now = new Date();
    const summary = {
        startedAt: now,
        dryRun,
        collections: {},
        totalDocumentsAffected: 0,
        errors: []
    };

    logger.info(`[DataRetention] Starting retention sweep (dryRun: ${dryRun})`);

    // --- 1. Inactive conversations ---
    try {
        const cutoffDate = new Date(now - policy.inactiveConversations.days * 24 * 60 * 60 * 1000);
        const Conversation = mongoose.model('Conversation');

        if (dryRun) {
            const count = await Conversation.countDocuments({
                lastActivity: { $lt: cutoffDate },
                isActive: false
            });
            summary.collections.inactiveConversations = { wouldDelete: count };
        } else {
            const result = await Conversation.deleteMany({
                lastActivity: { $lt: cutoffDate },
                isActive: false
            });
            summary.collections.inactiveConversations = { deleted: result.deletedCount };
            summary.totalDocumentsAffected += result.deletedCount;
        }
    } catch (err) {
        summary.errors.push({ collection: 'inactiveConversations', error: err.message });
    }

    // --- 2. Student uploads ---
    try {
        const cutoffDate = new Date(now - policy.studentUploads.days * 24 * 60 * 60 * 1000);
        const StudentUpload = mongoose.model('StudentUpload');

        if (dryRun) {
            const count = await StudentUpload.countDocuments({
                createdAt: { $lt: cutoffDate }
            });
            summary.collections.studentUploads = { wouldDelete: count };
        } else {
            const result = await StudentUpload.deleteMany({
                createdAt: { $lt: cutoffDate }
            });
            summary.collections.studentUploads = { deleted: result.deletedCount };
            summary.totalDocumentsAffected += result.deletedCount;
        }
    } catch (err) {
        summary.errors.push({ collection: 'studentUploads', error: err.message });
    }

    // --- 3. Old feedback ---
    try {
        const cutoffDate = new Date(now - policy.feedback.days * 24 * 60 * 60 * 1000);
        const Feedback = mongoose.model('Feedback');

        if (dryRun) {
            const count = await Feedback.countDocuments({
                createdAt: { $lt: cutoffDate }
            });
            summary.collections.feedback = { wouldDelete: count };
        } else {
            const result = await Feedback.deleteMany({
                createdAt: { $lt: cutoffDate }
            });
            summary.collections.feedback = { deleted: result.deletedCount };
            summary.totalDocumentsAffected += result.deletedCount;
        }
    } catch (err) {
        summary.errors.push({ collection: 'feedback', error: err.message });
    }

    // --- 4. Old messages ---
    try {
        const cutoffDate = new Date(now - policy.messages.days * 24 * 60 * 60 * 1000);
        const Message = mongoose.model('Message');

        if (dryRun) {
            const count = await Message.countDocuments({
                createdAt: { $lt: cutoffDate }
            });
            summary.collections.messages = { wouldDelete: count };
        } else {
            const result = await Message.deleteMany({
                createdAt: { $lt: cutoffDate }
            });
            summary.collections.messages = { deleted: result.deletedCount };
            summary.totalDocumentsAffected += result.deletedCount;
        }
    } catch (err) {
        summary.errors.push({ collection: 'messages', error: err.message });
    }

    summary.completedAt = new Date();
    summary.durationMs = summary.completedAt - summary.startedAt;

    logger.info('[DataRetention] Sweep completed', {
        dryRun,
        totalAffected: summary.totalDocumentsAffected,
        durationMs: summary.durationMs,
        errors: summary.errors.length
    });

    return summary;
}

// ============================================================================
// SCHEDULED JOB SETUP
// ============================================================================

let retentionInterval = null;

/**
 * Start the scheduled retention sweep.
 * Runs daily at a configurable time.
 *
 * @param {number} [intervalMs] - How often to run (default: 24 hours)
 */
function startRetentionSchedule(intervalMs = 24 * 60 * 60 * 1000) {
    if (retentionInterval) {
        clearInterval(retentionInterval);
    }

    // Run first sweep after a delay (don't block startup)
    setTimeout(async () => {
        try {
            await runRetentionSweep();
        } catch (err) {
            logger.error('[DataRetention] Scheduled sweep failed', { error: err.message });
        }
    }, 60 * 1000); // 1 minute after startup

    // Schedule recurring sweeps
    retentionInterval = setInterval(async () => {
        try {
            await runRetentionSweep();
        } catch (err) {
            logger.error('[DataRetention] Scheduled sweep failed', { error: err.message });
        }
    }, intervalMs);

    logger.info(`[DataRetention] Scheduled sweep every ${intervalMs / (60 * 60 * 1000)} hours`);
}

/**
 * Stop the scheduled retention sweep.
 */
function stopRetentionSchedule() {
    if (retentionInterval) {
        clearInterval(retentionInterval);
        retentionInterval = null;
        logger.info('[DataRetention] Scheduled sweep stopped');
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    DEFAULT_RETENTION_POLICY,
    runRetentionSweep,
    startRetentionSchedule,
    stopRetentionSchedule
};
