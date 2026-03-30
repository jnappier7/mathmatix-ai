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
const { calculateRetrievability } = require('../utils/fsrsScheduler');

// Constants
const BATCH_SIZE = 50; // Process parents in batches
const DELAY_BETWEEN_EMAILS = 1000; // 1 second delay between emails to avoid rate limits

/**
 * Determine if a parent should receive a report today
 * @param {Object} parent - Parent user object
 * @returns {boolean} - Whether to send report
 */
function shouldSendReport(parent) {
    const frequency = parent.reportFrequency || 'weekly';
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
        { $match: { userId: student._id, lastActivity: { $gte: oneWeekAgo } } },
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

    // ── Memory health (FSRS) ──
    const memoryHealth = { strong: 0, fading: 0, needsReview: 0, fadingSkills: [] };
    const engines = student.learningEngines || {};
    const fsrs = engines.fsrs;
    if (fsrs) {
        const fsrsEntries = typeof fsrs.entries === 'function'
            ? Array.from(fsrs.entries()) : Object.entries(fsrs);
        for (const [skillId, card] of fsrsEntries) {
            if (!card || !card.lastReview) continue;
            const elapsed = (Date.now() - new Date(card.lastReview).getTime()) / 86400000;
            const r = calculateRetrievability(elapsed, card.stability ?? 0);
            if (r >= 0.85) memoryHealth.strong++;
            else if (r >= 0.50) { memoryHealth.fading++; memoryHealth.fadingSkills.push(skillId); }
            else { memoryHealth.needsReview++; memoryHealth.fadingSkills.push(skillId); }
        }
    }
    memoryHealth.fadingSkills = memoryHealth.fadingSkills.slice(0, 5);

    // ── Cognitive load trend ──
    const cogHistory = engines.cognitiveLoadHistory || [];
    let cognitiveLoadTrend = 'no-data';
    let avgCogLoad = 0;
    if (cogHistory.length >= 2) {
        const recent = cogHistory.slice(-3).map(h => h.avgLoad ?? 0);
        const earlier = cogHistory.slice(-6, -3).map(h => h.avgLoad ?? 0);
        avgCogLoad = recent.reduce((s, v) => s + v, 0) / recent.length;
        if (earlier.length > 0) {
            const earlierAvg = earlier.reduce((s, v) => s + v, 0) / earlier.length;
            cognitiveLoadTrend = avgCogLoad > earlierAvg + 0.1 ? 'rising' : avgCogLoad < earlierAvg - 0.1 ? 'improving' : 'stable';
        }
    } else if (cogHistory.length === 1) {
        avgCogLoad = cogHistory[0].avgLoad ?? 0;
        cognitiveLoadTrend = 'stable';
    }

    // ── Mastery breakdown ──
    let masteredCount = 0, practicingCount = 0, learningCount = 0;
    if (student.skillMastery) {
        for (const [, m] of student.skillMastery) {
            if (m.status === 'mastered') masteredCount++;
            else if (m.status === 'practicing') practicingCount++;
            else learningCount++;
        }
    }

    // ── Streak ──
    const currentStreak = student.dailyQuests?.currentStreak || 0;

    // ── Plain-language insights ──
    const insights = buildDigestInsights({
        stats, accuracy: stats.totalProblems > 0 ? Math.round((stats.totalCorrect / stats.totalProblems) * 100) : 0,
        masteryGained, memoryHealth, avgCogLoad, cognitiveLoadTrend,
        achievements, currentStreak, sessionCount: stats.sessionCount,
    });

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
        strugglingSkills: strugglingSkills.slice(0, 5),
        achievements,
        growthChecks,
        // Enriched data for the enhanced digest
        memoryHealth,
        cognitiveLoad: { average: Math.round(avgCogLoad * 100), trend: cognitiveLoadTrend },
        mastery: { mastered: masteredCount, practicing: practicingCount, learning: learningCount },
        currentStreak,
        insights,
    };
}

/**
 * Build plain-language insights for the email digest.
 * @param {Object} data - Aggregated progress data
 * @returns {Object[]} Array of { type, tone, message }
 */
function buildDigestInsights(data) {
    const insights = [];

    // Engagement
    if (data.sessionCount >= 5) {
        insights.push({ type: 'engagement', tone: 'positive', message: `Great week! ${data.sessionCount} practice sessions completed.` });
    } else if (data.sessionCount === 0) {
        insights.push({ type: 'engagement', tone: 'actionable', message: 'No practice sessions this week. Even 10 minutes a day makes a big difference!' });
    }

    // Accuracy
    if (data.accuracy >= 85) {
        insights.push({ type: 'accuracy', tone: 'positive', message: `${data.accuracy}% accuracy — showing strong understanding of the material.` });
    } else if (data.accuracy > 0 && data.accuracy < 60) {
        insights.push({ type: 'accuracy', tone: 'concern', message: `Accuracy was ${data.accuracy}% this week. The AI tutor is adjusting difficulty to help build confidence.` });
    }

    // Memory
    if (data.memoryHealth.needsReview > 0) {
        insights.push({ type: 'memory', tone: 'actionable', message: `${data.memoryHealth.needsReview} skill${data.memoryHealth.needsReview > 1 ? 's are' : ' is'} starting to fade. Quick review sessions will help lock them in.` });
    } else if (data.memoryHealth.strong > 3) {
        insights.push({ type: 'memory', tone: 'positive', message: `${data.memoryHealth.strong} skills stored in long-term memory — great retention!` });
    }

    // Cognitive load
    if (data.cognitiveLoadTrend === 'rising') {
        insights.push({ type: 'cognitive', tone: 'concern', message: 'Cognitive load is trending up. The tutor is adjusting to prevent overwhelm.' });
    }

    // Mastery
    if (data.masteryGained > 0) {
        insights.push({ type: 'mastery', tone: 'positive', message: `${data.masteryGained} new skill${data.masteryGained > 1 ? 's' : ''} mastered this week!` });
    }

    // Streak
    if (data.currentStreak >= 7) {
        insights.push({ type: 'streak', tone: 'positive', message: `${data.currentStreak}-day practice streak — consistency builds mastery!` });
    }

    // Badges
    if (data.achievements.length > 0) {
        insights.push({ type: 'badges', tone: 'positive', message: `Earned ${data.achievements.length} new badge${data.achievements.length > 1 ? 's' : ''} this week.` });
    }

    return insights.slice(0, 4); // Top 4 most relevant
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
        await mongoose.connect(process.env.MONGO_URI);
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

module.exports = { main, calculateStudentProgress, shouldSendReport, buildDigestInsights };
