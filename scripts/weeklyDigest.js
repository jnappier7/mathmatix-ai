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

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const { sendParentWeeklyReport } = require('../utils/emailService');

// Constants
const BATCH_SIZE = 50; // Process parents in batches
const DELAY_BETWEEN_EMAILS = 1000; // 1 second delay between emails to avoid rate limits

/**
 * Determine if a parent should receive a report today
 * @param {Object} parent - Parent user object
 * @returns {boolean} - Whether to send report
 */
function shouldSendReport(parent) {
    const frequency = parent.parentSettings?.reportFrequency || 'weekly';
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.

    switch (frequency) {
        case 'daily':
            return true;
        case 'weekly':
            // Send on Sundays
            return dayOfWeek === 0;
        case 'biweekly':
            // Send on 1st and 3rd Sundays
            const weekOfMonth = Math.ceil(today.getDate() / 7);
            return dayOfWeek === 0 && (weekOfMonth === 1 || weekOfMonth === 3);
        case 'monthly':
            // Send on 1st of each month
            return today.getDate() === 1;
        case 'never':
            return false;
        default:
            return dayOfWeek === 0; // Default to weekly
    }
}

/**
 * Calculate student progress data for report
 * @param {string} studentId - Student's MongoDB ID
 * @returns {Promise<Object>} - Student progress data
 */
async function calculateStudentProgress(studentId) {
    const student = await User.findById(studentId);
    if (!student) return null;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Get conversation stats
    const conversationStats = await Conversation.aggregate([
        { $match: { userId: student._id, updatedAt: { $gte: oneWeekAgo } } },
        {
            $group: {
                _id: null,
                totalProblems: { $sum: '$problemsAttempted' },
                totalCorrect: { $sum: '$problemsCorrect' },
                totalMinutes: { $sum: '$activeMinutes' },
                sessionCount: { $sum: 1 }
            }
        }
    ]);

    const stats = conversationStats[0] || { totalProblems: 0, totalCorrect: 0, totalMinutes: 0, sessionCount: 0 };

    // Get recently mastered skills
    let masteryGained = 0;
    const strugglingSkills = [];

    if (student.skillMastery) {
        for (const [skillId, mastery] of student.skillMastery) {
            if (mastery.status === 'mastered' && mastery.masteredDate >= oneWeekAgo) {
                masteryGained++;
            }
            if (mastery.status === 'needs-review' || mastery.status === 're-fragile') {
                strugglingSkills.push(skillId);
            }
        }
    }

    // Get recent badges
    const achievements = [];
    if (student.badges) {
        for (const badge of student.badges) {
            if (badge.unlockedAt >= oneWeekAgo) {
                achievements.push({
                    key: badge.key,
                    badgeId: badge.badgeId,
                    unlockedAt: badge.unlockedAt
                });
            }
        }
    }

    // Get recent growth checks
    const growthChecks = [];
    if (student.learningProfile?.growthCheckHistory) {
        for (const check of student.learningProfile.growthCheckHistory) {
            if (check.date >= oneWeekAgo) {
                growthChecks.push({
                    date: check.date,
                    thetaChange: check.thetaChange,
                    growthStatus: check.growthStatus,
                    accuracy: check.accuracy,
                    questionsAnswered: check.questionsAnswered
                });
            }
        }
    }

    return {
        studentName: `${student.firstName} ${student.lastName}`,
        problemsCompleted: stats.totalCorrect,
        problemsAttempted: stats.totalProblems,
        accuracy: stats.totalProblems > 0 ? Math.round((stats.totalCorrect / stats.totalProblems) * 100) : 0,
        currentLevel: student.level || 1,
        xpEarned: student.xp || 0,
        activeMinutes: stats.totalMinutes,
        weeklyActiveMinutes: student.weeklyActiveTutoringMinutes || 0,
        sessionCount: stats.sessionCount,
        masteryGained,
        strugglingSkills: strugglingSkills.slice(0, 5), // Limit to top 5
        achievements,
        growthChecks // NEW: Include growth check results for parent report
    };
}

/**
 * Process a batch of parents
 * @param {Array} parents - Array of parent users
 * @returns {Promise<Object>} - Results summary
 */
async function processBatch(parents) {
    const results = {
        sent: 0,
        skipped: 0,
        failed: 0,
        errors: []
    };

    for (const parent of parents) {
        try {
            // Check if parent should receive report today
            if (!shouldSendReport(parent)) {
                results.skipped++;
                continue;
            }

            // Process each child
            if (!parent.children || parent.children.length === 0) {
                results.skipped++;
                continue;
            }

            for (const childId of parent.children) {
                const studentData = await calculateStudentProgress(childId);
                if (!studentData) {
                    console.log(`  ⚠️ Student ${childId} not found, skipping`);
                    continue;
                }

                // Send report
                const result = await sendParentWeeklyReport(parent, studentData);

                if (result.success) {
                    console.log(`  ✅ Sent report for ${studentData.studentName} to ${parent.email}`);
                    results.sent++;
                } else {
                    console.log(`  ❌ Failed to send report to ${parent.email}: ${result.error}`);
                    results.failed++;
                    results.errors.push({ email: parent.email, error: result.error });
                }

                // Delay between emails
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_EMAILS));
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
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Get all parents who have children linked
        const totalParents = await User.countDocuments({
            role: 'parent',
            children: { $exists: true, $ne: [] },
            email: { $exists: true, $ne: null }
        });

        console.log(`📊 Found ${totalParents} parents with linked children`);
        console.log('');

        // Process in batches
        let processed = 0;
        const results = { sent: 0, skipped: 0, failed: 0, errors: [] };

        while (processed < totalParents) {
            const parents = await User.find({
                role: 'parent',
                children: { $exists: true, $ne: [] },
                email: { $exists: true, $ne: null }
            })
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

module.exports = { main, calculateStudentProgress, shouldSendReport };
