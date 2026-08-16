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
 * Default retention periods.
 *
 * This object is the SINGLE SOURCE OF TRUTH for three things that used to be
 * maintained separately and drifted apart:
 *
 *   1. what the sweep actually deletes  (runRetentionSweep iterates this object)
 *   2. what we publish in the privacy policy  (public/privacy.html §7)
 *   3. what the amended COPPA Rule requires us to be able to state — the
 *      categories collected, the business purpose for retaining each, and a
 *      specific deletion timeframe. Indefinite retention is prohibited.
 *
 * The sweep was previously hand-written per collection while this object was a
 * separate declaration, so three categories — completedAssessments,
 * gradingResults and impersonationLogs — were declared here with a stated
 * retention period and then never swept at all. They retained forever while the
 * policy claimed 3 years. Driving the sweep from this object makes that class
 * of bug structural rather than a matter of remembering: adding an entry adds
 * a sweep, and tests/unit/dataRetention.test.js fails on an entry that has no
 * model wired up.
 *
 * Per-entry fields:
 *   days        - retention period; the deletion timeframe we publish
 *   description - internal description
 *   publicLabel - the category name as published to parents
 *   purpose     - the business purpose for retaining it, as published
 *   model       - mongoose model name the sweep deletes from
 *   dateField   - the field compared against the cutoff
 *   filter      - extra query conditions ANDed with the cutoff (optional)
 *
 * These can be overridden per-district via school DPA agreements.
 */
const DEFAULT_RETENTION_POLICY = {
    // Conversation history for inactive students
    inactiveConversations: {
        days: 365,           // 12 months
        description: 'Conversations from students inactive for 12+ months',
        publicLabel: 'Tutoring conversations',
        purpose: 'Continuity of tutoring and progress review by the student, their parent and their teacher',
        model: 'Conversation',
        dateField: 'lastActivity',
        filter: { isActive: false }
    },

    // Student file uploads (homework photos, etc.)
    studentUploads: {
        days: 30,            // 30 days
        description: 'Uploaded files (homework photos, documents)',
        publicLabel: 'Uploaded photos and documents',
        purpose: 'Reading the student\'s written work so the tutor can respond to it',
        model: 'StudentUpload',
        dateField: 'createdAt'
    },

    // Completed screener/assessment sessions
    completedAssessments: {
        days: 1095,          // 3 years (standard educational record retention)
        description: 'Completed placement tests and assessments',
        publicLabel: 'Placement tests and growth checks',
        purpose: 'Measuring growth over time against a baseline; educational record retention',
        model: 'ScreenerSession',
        dateField: 'createdAt'
    },

    // Grading results
    gradingResults: {
        days: 1095,          // 3 years
        description: 'AI-graded homework results',
        publicLabel: 'Graded work',
        purpose: 'Showing progress on graded assignments to the student, parent and teacher',
        model: 'GradingResult',
        dateField: 'createdAt'
    },

    // Feedback submissions
    feedback: {
        days: 365,           // 1 year
        description: 'Student feedback and bug reports',
        publicLabel: 'Feedback and bug reports',
        purpose: 'Diagnosing and fixing reported problems with the service',
        model: 'Feedback',
        dateField: 'createdAt'
    },

    // Impersonation audit logs
    impersonationLogs: {
        days: 1095,          // 3 years (compliance audit trail)
        description: 'Admin/teacher impersonation audit logs',
        publicLabel: 'Staff account-access audit logs',
        purpose: 'Security and compliance audit trail of staff access to student accounts',
        model: 'ImpersonationLog',
        dateField: 'createdAt'
    },

    // Direct messages
    messages: {
        days: 365,           // 1 year
        description: 'Teacher-parent and system messages',
        publicLabel: 'Teacher and parent messages',
        purpose: 'Continuity of communication between teachers and parents',
        model: 'Message',
        dateField: 'createdAt'
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

    // Every declared category is swept. There is deliberately no hand-written
    // per-collection block here any more: the previous version implemented four
    // of the seven declared categories, and the three it skipped
    // (completedAssessments, gradingResults, impersonationLogs) retained
    // forever while the policy advertised a 3-year period. A category with no
    // `model` is a policy bug, so it is recorded as an error rather than
    // silently skipped.
    for (const [key, spec] of Object.entries(policy)) {
        if (!spec || !spec.model) {
            summary.errors.push({
                collection: key,
                error: 'Retention policy entry has no model — nothing was deleted for this category'
            });
            continue;
        }

        try {
            const cutoffDate = new Date(now - spec.days * 24 * 60 * 60 * 1000);
            const Model = mongoose.model(spec.model);
            const query = {
                [spec.dateField || 'createdAt']: { $lt: cutoffDate },
                ...(spec.filter || {})
            };

            if (dryRun) {
                summary.collections[key] = { wouldDelete: await Model.countDocuments(query) };
            } else {
                const result = await Model.deleteMany(query);
                summary.collections[key] = { deleted: result.deletedCount };
                summary.totalDocumentsAffected += result.deletedCount;
            }
        } catch (err) {
            summary.errors.push({ collection: key, error: err.message });
        }
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
let initialSweepTimeout = null;

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
    initialSweepTimeout = setTimeout(async () => {
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
    if (initialSweepTimeout) {
        clearTimeout(initialSweepTimeout);
        initialSweepTimeout = null;
    }
    if (retentionInterval) {
        clearInterval(retentionInterval);
        retentionInterval = null;
        logger.info('[DataRetention] Scheduled sweep stopped');
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * The retention policy as published to parents.
 *
 * The amended COPPA Rule requires the written retention policy to appear in the
 * online privacy notice, stating for each category what is retained, why, and
 * for how long. Deriving that table from the same object the sweep runs on is
 * what keeps the published promise and the actual behaviour in step —
 * tests/unit/retentionPolicyPublished.test.js fails if public/privacy.html
 * stops matching this.
 *
 * @param {Object} [policy] - defaults to DEFAULT_RETENTION_POLICY
 * @returns {Array<{key, category, purpose, days, humanPeriod}>}
 */
function getPublishedRetentionPolicy(policy = DEFAULT_RETENTION_POLICY) {
    return Object.entries(policy).map(([key, spec]) => ({
        key,
        category: spec.publicLabel || spec.description,
        purpose: spec.purpose || '',
        days: spec.days,
        humanPeriod: humanPeriod(spec.days)
    }));
}

/** "30 days" / "1 year" / "3 years" — the phrasing used in the notice. */
function humanPeriod(days) {
    if (days >= 365 && days % 365 === 0) {
        const years = days / 365;
        return years === 1 ? '1 year' : `${years} years`;
    }
    return `${days} days`;
}

module.exports = {
    DEFAULT_RETENTION_POLICY,
    getPublishedRetentionPolicy,
    runRetentionSweep,
    startRetentionSchedule,
    stopRetentionSchedule
};
