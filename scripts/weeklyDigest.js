#!/usr/bin/env node
/**
 * Weekly Digest - Automated Parent Report Scheduler
 *
 * Run this script via cron or as a scheduled task:
 * - Sends weekly progress reports to parents based on their preferences
 * - Can be run daily (checks reportFrequency setting)
 *
 * Usage: node scripts/weeklyDigest.js
 *        npm run cron:weekly-digest
 *
 * @module weeklyDigest
 */

// Load .env for local runs. In production (Render) env vars are injected directly
// and there is no .env file, so a missing dotenv module must not crash the cron.
try {
  require('dotenv').config();
} catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND') throw err;
}
const mongoose = require('mongoose');
const User = require('../models/user');
const { sendParentProgressReport } = require('../utils/emailService');
const { buildLearningReport } = require('../utils/parentReport');
const { anyRole } = require('../utils/roleQuery');
const { shouldSendDigest, windowDaysFor } = require('../utils/reportFrequency');

// Constants
const BATCH_SIZE = 50; // Process parents in batches
const DELAY_BETWEEN_EMAILS = 1000; // 1 second delay between emails to avoid rate limits
// Cadence + idempotency (same-day dedup, biweekly 14-day gap) live in
// utils/reportFrequency.js — shouldSendDigest().

/**
 * Determine if a parent should receive a report now — every reportFrequency
 * value is honored ('never' = off), and the last-sent stamp enforces both the
 * same-day dedup guard and the biweekly 14-day cadence.
 * @param {Object} parent - Parent user object
 * @param {Date} [now]
 * @returns {boolean} - Whether to send report
 */
function shouldSendReport(parent, now = new Date()) {
    return shouldSendDigest(parent && parent.reportFrequency, now, parent && parent.lastWeeklyReportSentAt);
}

/**
 * The parent-digest audience: users who HOLD the parent role (roles[] or the
 * legacy role string — CLAUDE.md §12), not just those whose active dashboard
 * is parent right now, with linked children and an email address.
 */
function digestParentFilter() {
    return {
        ...anyRole('parent'),
        children: { $exists: true, $ne: [] },
        email: { $exists: true, $ne: null }
    };
}

/**
 * Process a batch of parents
 * @param {Array} parents - Array of parent users
 * @returns {Promise<Object>} - Results summary
 */
async function processBatch(parents, { delayMs = DELAY_BETWEEN_EMAILS } = {}) {
    const results = {
        sent: 0,
        skipped: 0,
        failed: 0,
        errors: []
    };

    for (const parent of parents) {
        try {
            // Check if parent should receive a report now (cadence + dedup)
            if (!shouldSendReport(parent)) {
                results.skipped++;
                continue;
            }

            // Process each child
            if (!parent.children || parent.children.length === 0) {
                results.skipped++;
                continue;
            }

            const windowDays = windowDaysFor(parent.reportFrequency);
            let sentForParent = false;
            for (const childId of parent.children) {
                const child = await User.findById(childId).lean();
                if (!child) {
                    console.log(`  ⚠️ Student ${childId} not found, skipping`);
                    continue;
                }

                // The SAME report the dashboard shows (utils/parentReport), over the
                // parent's cadence window, in the parent's language.
                const report = await buildLearningReport(child, { language: parent.parentLanguage, windowDays });

                // Don't email about a child who did nothing in the window — that reads
                // as spam and gets parents to unsubscribe. Deliberate re-engagement is
                // the reactivation campaign's job, not the digest's.
                if (report.weeklySnapshot.thisWeek.sessions === 0) {
                    console.log(`  ⏭️ ${child.firstName}: no activity in the window — skipping email`);
                    results.skipped++;
                    continue;
                }

                const result = await sendParentProgressReport(parent, report);

                if (result.success) {
                    console.log(`  ✅ Sent report for ${child.firstName} to ${parent.email}`);
                    results.sent++;
                    sentForParent = true;
                } else {
                    console.log(`  ❌ Failed to send report to ${parent.email}: ${result.error}`);
                    results.failed++;
                    results.errors.push({ email: parent.email, error: result.error });
                }

                // Delay between emails
                if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
            }

            // Stamp the dedup guard once at least one report went out.
            if (sentForParent) {
                await User.findByIdAndUpdate(parent._id, { lastWeeklyReportSentAt: new Date() }).catch(() => {});
            }
        } catch (error) {
            console.error(`  ❌ Error processing parent ${parent.email}:`, error.message);
            results.failed++;
            results.errors.push({ email: parent.email, error: error.message });
        }
    }

    return results;
}

/**
 * Main function - runs the weekly digest
 */
async function main() {
    console.log('🚀 Starting Weekly Digest - Automated Parent Reports');
    console.log(`📅 Date: ${new Date().toISOString()}`);
    console.log('');

    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Get all parents who have children linked
        const totalParents = await User.countDocuments(digestParentFilter());

        console.log(`📊 Found ${totalParents} parents with linked children`);
        console.log('');

        // Process in batches
        let processed = 0;
        const results = { sent: 0, skipped: 0, failed: 0, errors: [] };

        while (processed < totalParents) {
            const parents = await User.find(digestParentFilter())
            .sort({ _id: 1 })
            .skip(processed)
            .limit(BATCH_SIZE)
            .lean();

            if (parents.length === 0) break;

            console.log(`📦 Processing batch ${Math.floor(processed / BATCH_SIZE) + 1} (${parents.length} parents)`);

            const batchResults = await processBatch(parents);
            results.sent += batchResults.sent;
            results.skipped += batchResults.skipped;
            results.failed += batchResults.failed;
            results.errors.push(...batchResults.errors);

            processed += parents.length;
        }

        // Summary
        console.log('');
        console.log('📊 Summary:');
        console.log(`   ✅ Reports sent: ${results.sent}`);
        console.log(`   ⏭️ Skipped: ${results.skipped}`);
        console.log(`   ❌ Failed: ${results.failed}`);

        if (results.errors.length > 0) {
            console.log('');
            console.log('❌ Errors:');
            results.errors.forEach(e => console.log(`   - ${e.email}: ${e.error}`));
        }

        console.log('');
        console.log('✅ Weekly Digest completed');

    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    main, shouldSendReport, processBatch,
    digestParentFilter, shouldSendDigest, windowDaysFor,
};
