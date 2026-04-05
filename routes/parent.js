// routes/parent.js
// MODIFIED: Updated to query the 'Conversation' collection for child's progress.

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user');
const Conversation = require('../models/conversation'); // NEW: Import Conversation model
const Skill = require('../models/skill');
const { isParent, isAuthenticated } = require('../middleware/auth');
const { cleanupStaleSessions } = require('../services/sessionService');
const ScreenerSession = require('../models/screenerSession');
const { logRecordAccess } = require('../middleware/ferpaAccessLog');
const { calculateRetrievability } = require('../utils/fsrsScheduler');

// Helper: verify parent has access to child
async function verifyParentChildAccess(parentId, childId) {
    const parent = await User.findById(parentId);
    if (!parent || !parent.children.some(child => child._id.toString() === childId)) return null;
    const child = await User.findById(childId).lean();
    return child;
}

// Helper to generate a unique short code
function generateUniqueLinkCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Route for parents to generate an invite code for their children
router.post('/generate-invite-code', isAuthenticated, isParent, async (req, res) => {
    const parentId = req.user._id;
    try {
        const parent = await User.findById(parentId);
        if (!parent) {
            return res.status(404).json({ message: "Parent not found." });
        }
        if (parent.parentToChildInviteCode && parent.parentToChildInviteCode.code && !parent.parentToChildInviteCode.childLinked && parent.parentToChildInviteCode.expiresAt > new Date()) {
            return res.status(200).json({ success: true, message: "Active invite code already exists.", code: parent.parentToChildInviteCode.code, expiresAt: parent.parentToChildInviteCode.expiresAt });
        }
        let newCode;
        let codeExists = true;
        while (codeExists) {
            newCode = generateUniqueLinkCode();
            const existingUserWithCode = await User.findOne({ 'parentToChildInviteCode.code': newCode });
            if (!existingUserWithCode) {
                codeExists = false;
            }
        }
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        parent.parentToChildInviteCode = {
            code: newCode,
            expiresAt: expiresAt,
            childLinked: false
        };
        await parent.save();
        res.status(201).json({ success: true, message: "Invite code generated successfully!", code: newCode, expiresAt: expiresAt });
    } catch (error) {
        console.error("ERROR: Failed to generate invite code:", error);
        res.status(500).json({ message: "Could not generate invite code." });
    }
});

// Route for parents to link to an existing student using studentToParentLinkCode
router.post('/link-to-student', isAuthenticated, isParent, async (req, res) => {
    const parentId = req.user._id;
    const { studentLinkCode } = req.body;
    if (!studentLinkCode || studentLinkCode.trim() === '') {
        return res.status(400).json({ message: "Student link code is required." });
    }
    try {
        const parent = await User.findById(parentId);
        if (!parent) {
            return res.status(404).json({ message: "Parent not found." });
        }
        const student = await User.findOne({ 'studentToParentLinkCode.code': studentLinkCode.trim() });
        if (!student) {
            return res.status(400).json({ message: "Invalid student link code. Student not found." });
        }
        if (student.studentToParentLinkCode.parentLinked) {
            return res.status(400).json({ message: "This student account is already linked to a parent." });
        }
        if (student.role !== 'student') {
            return res.status(400).json({ message: "This code is not from a student account." });
        }

        // Add parent to student's parentIds array (supports multiple parents)
        student.parentIds = student.parentIds || [];
        if (!student.parentIds.some(parentId => parentId.equals(parent._id))) {
            student.parentIds.push(parent._id);
        }

        // Add student to parent's children array
        parent.children = parent.children || [];
        if (!parent.children.some(childId => childId.equals(student._id))) {
            parent.children.push(student._id);
        }
        student.studentToParentLinkCode.parentLinked = true;

        // Grant parental consent since student is now linked to a parent (COPPA compliance)
        student.hasParentalConsent = true;

        await student.save();
        await parent.save();
        res.status(200).json({ success: true, message: `Successfully linked to student ${student.firstName} ${student.lastName}!` });
    } catch (error) {
        console.error("ERROR: Failed to link to student:", error);
        res.status(500).json({ message: "Could not link to student." });
    }
});

// Route to get a parent's children
router.get('/children', isAuthenticated, isParent, async (req, res) => {
    const parentId = req.user._id;
    try {
        const parent = await User.findById(parentId).populate('children', 'firstName lastName username gradeLevel mathCourse totalActiveTutoringMinutes');
        if (!parent) {
            return res.status(404).json({ message: "Parent not found." });
        }
        res.json(parent.children);
    } catch (error) {
        console.error("ERROR: Failed to fetch children:", error);
        res.status(500).json({ message: "Error fetching children." });
    }
});

// Get a specific child's progress for parent dashboard
router.get('/child/:childId/progress', isAuthenticated, isParent, logRecordAccess('progress_data', 'parental_right_of_access', { getStudentId: req => req.params.childId }), async (req, res) => {
    const parentId = req.user._id;
    const { childId } = req.params;

    try {
        const parent = await User.findById(parentId);
        if (!parent || !parent.children.some(child => child._id.toString() === childId)) {
            return res.status(403).json({ message: "Forbidden: You are not authorized to view this child's progress." });
        }

        const child = await User.findById(childId).lean();
        if (!child) {
            return res.status(404).json({ message: "Child not found." });
        }

        // Clean up any stale sessions for this child (runs in background)
        // This ensures sessions that weren't properly ended get summaries
        cleanupStaleSessions(30).catch(err => {
            console.error('Background cleanup failed:', err);
        });

        // Determine if there is a truly active session.
        // isActive stays true for sidebar visibility even after logout, so we
        // also check that lastActivity is recent (within the last 30 minutes).
        const ACTIVE_SESSION_THRESHOLD = 30 * 60 * 1000; // 30 minutes
        const activeThreshold = new Date(Date.now() - ACTIVE_SESSION_THRESHOLD);

        const activeConversation = await Conversation.findOne({
            userId: childId,
            isActive: true,
            lastActivity: { $gte: activeThreshold }
        }).select('currentTopic problemsAttempted problemsCorrect strugglingWith alerts lastActivity liveSummary startDate activeMinutes').lean();

        // Fetch recent sessions that have summaries (regardless of isActive flag,
        // since isActive controls sidebar archiving, not session completion).
        // Exclude the truly-active session if one exists.
        const completedFilter = {
            userId: childId,
            summary: { $exists: true, $nin: [null, ''] }
        };
        if (activeConversation) {
            completedFilter._id = { $ne: activeConversation._id };
        }
        const completedSessions = await Conversation.find(completedFilter)
            .sort({ lastActivity: -1 })
            .limit(6)  // Limit to 6 since active session might be added
            .select('summary lastActivity activeMinutes startDate problemsAttempted problemsCorrect currentTopic');

        // Build recent sessions array with active session at the top if it exists
        let recentSessions = [];

        // Add active session first (most recent) with a live summary
        if (activeConversation && activeConversation.lastActivity) {
            const activeSessionEntry = {
                date: activeConversation.lastActivity || activeConversation.startDate,
                summary: activeConversation.liveSummary ||
                    `Currently working on ${activeConversation.currentTopic || 'mathematics'}. ` +
                    (activeConversation.problemsAttempted > 0
                        ? `${activeConversation.problemsAttempted} problems attempted with ${activeConversation.problemsCorrect || 0} correct.`
                        : 'Session in progress.'),
                duration: activeConversation.activeMinutes || 0,
                isActive: true  // Flag to indicate this is a live session
            };
            recentSessions.push(activeSessionEntry);
        }

        // Add completed sessions
        recentSessions = recentSessions.concat(completedSessions.map(session => ({
            date: session.lastActivity || session.startDate,
            summary: session.summary,
            duration: session.activeMinutes,
            problemsAttempted: session.problemsAttempted,
            problemsCorrect: session.problemsCorrect,
            isActive: false
        })));

        // NEW: Build live stats object
        const liveStats = activeConversation ? {
            isActive: true,
            currentTopic: activeConversation.currentTopic || 'General Math',
            problemsAttempted: activeConversation.problemsAttempted || 0,
            problemsCorrect: activeConversation.problemsCorrect || 0,
            accuracy: activeConversation.problemsAttempted > 0
                ? Math.round((activeConversation.problemsCorrect / activeConversation.problemsAttempted) * 100)
                : 0,
            strugglingWith: activeConversation.strugglingWith || null,
            hasAlerts: activeConversation.alerts && activeConversation.alerts.some(a => !a.acknowledged),
            alerts: activeConversation.alerts?.filter(a => !a.acknowledged) || [],
            lastActivity: activeConversation.lastActivity,
            liveSummary: activeConversation.liveSummary || null
        } : {
            isActive: false
        };

        // ENHANCED: Get weekly stats from conversations
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        // Convert childId to ObjectId for aggregation (handles string from .lean())
        const childObjectId = new mongoose.Types.ObjectId(childId);

        const weeklyStats = await Conversation.aggregate([
            { $match: { userId: childObjectId, lastActivity: { $gte: oneWeekAgo } } },
            {
                $group: {
                    _id: null,
                    totalProblems: { $sum: { $ifNull: ['$problemsAttempted', 0] } },
                    totalCorrect: { $sum: { $ifNull: ['$problemsCorrect', 0] } },
                    totalMinutes: { $sum: { $ifNull: ['$activeMinutes', 0] } },
                    sessionCount: { $sum: 1 }
                }
            }
        ]);

        const stats = weeklyStats[0] || { totalProblems: 0, totalCorrect: 0, totalMinutes: 0, sessionCount: 0 };

        // Get badges earned this week
        const recentBadges = [];
        if (child.badges && Array.isArray(child.badges)) {
            for (const badge of child.badges) {
                if (badge.unlockedAt && new Date(badge.unlockedAt) >= oneWeekAgo) {
                    recentBadges.push({
                        key: badge.key,
                        badgeId: badge.badgeId,
                        unlockedAt: badge.unlockedAt
                    });
                }
            }
        }

        // Get skill mastery summary
        let skillsSummary = { mastered: 0, learning: 0, needsReview: 0 };
        if (child.skillMastery && child.skillMastery instanceof Map) {
            for (const [skillId, mastery] of child.skillMastery) {
                if (mastery.status === 'mastered') skillsSummary.mastered++;
                else if (mastery.status === 'learning' || mastery.status === 'practicing') skillsSummary.learning++;
                else if (mastery.status === 'needs-review' || mastery.status === 're-fragile') skillsSummary.needsReview++;
            }
        } else if (child.skillMastery && typeof child.skillMastery === 'object') {
            // Handle if skillMastery is a plain object (from .lean())
            for (const skillId in child.skillMastery) {
                const mastery = child.skillMastery[skillId];
                if (mastery.status === 'mastered') skillsSummary.mastered++;
                else if (mastery.status === 'learning' || mastery.status === 'practicing') skillsSummary.learning++;
                else if (mastery.status === 'needs-review' || mastery.status === 're-fragile') skillsSummary.needsReview++;
            }
        }

        const progressData = {
            _id: child._id,
            firstName: child.firstName,
            lastName: child.lastName,
            level: child.level || 1,
            xp: child.xp || 0,
            gradeLevel: child.gradeLevel,
            mathCourse: child.mathCourse,
            totalActiveTutoringMinutes: child.totalActiveTutoringMinutes || 0,
            weeklyActiveTutoringMinutes: child.weeklyActiveTutoringMinutes || 0,
            // Weekly performance stats
            weeklyStats: {
                problemsAttempted: stats.totalProblems,
                problemsCorrect: stats.totalCorrect,
                accuracy: stats.totalProblems > 0 ? Math.round((stats.totalCorrect / stats.totalProblems) * 100) : 0,
                activeMinutes: stats.totalMinutes,
                sessionCount: stats.sessionCount
            },
            // Skills summary
            skillsSummary: skillsSummary,
            // Recent badges
            recentBadges: recentBadges,
            // Live activity
            liveStats: liveStats,
            recentSessions: recentSessions, // Already formatted with active session first
            iepPlan: child.iepPlan || null,
        };

        res.json(progressData);

    } catch (error) {
        console.error("ERROR: Failed to fetch child's progress:", error);
        res.status(500).json({ message: "Could not fetch child's progress." });
    }
});

// Get a child's growth check history for parent dashboard
router.get('/child/:childId/growth-history', isAuthenticated, isParent, logRecordAccess('assessment_results', 'parental_right_of_access', { getStudentId: req => req.params.childId }), async (req, res) => {
    const parentId = req.user._id;
    const { childId } = req.params;

    try {
        const parent = await User.findById(parentId);
        if (!parent || !parent.children.some(child => child._id.toString() === childId)) {
            return res.status(403).json({ message: "Forbidden: You are not authorized to view this child's data." });
        }

        const child = await User.findById(childId).lean();
        if (!child) {
            return res.status(404).json({ message: "Child not found." });
        }

        const growthHistory = child.learningProfile?.growthCheckHistory || [];
        const currentTheta = child.learningProfile?.currentTheta || 0;

        // Calculate growth trajectory
        let totalGrowth = 0;
        let checksCompleted = growthHistory.length;
        if (checksCompleted > 0) {
            const firstTheta = growthHistory[0].previousTheta || 0;
            const latestTheta = growthHistory[checksCompleted - 1].newTheta || currentTheta;
            totalGrowth = latestTheta - firstTheta;
        }

        // Format growth status into parent-friendly messages
        const statusMessages = {
            'significant-growth': 'Great Progress!',
            'some-growth': 'Nice Growth!',
            'stable': 'Holding Steady',
            'review-needed': 'Needs Practice'
        };

        res.json({
            childName: `${child.firstName} ${child.lastName}`,
            currentTheta,
            totalGrowth: Math.round(totalGrowth * 100) / 100,
            checksCompleted,
            history: growthHistory.map(check => ({
                date: check.date,
                thetaChange: check.thetaChange,
                growthStatus: check.growthStatus,
                growthMessage: statusMessages[check.growthStatus] || check.growthStatus,
                accuracy: check.accuracy,
                questionsAnswered: check.questionsAnswered
            }))
        });

    } catch (error) {
        console.error("ERROR: Failed to fetch child's growth history:", error);
        res.status(500).json({ message: "Could not fetch growth history." });
    }
});

// Get parent settings
router.get('/settings', isAuthenticated, isParent, async (req, res) => {
    const parentId = req.user._id;
    try {
        const parent = await User.findById(parentId).select('reportFrequency goalViewPreference parentTone parentLanguage');
        if (!parent) {
            return res.status(404).json({ message: "Parent not found." });
        }
        res.json({
            reportFrequency: parent.reportFrequency || 'weekly',
            goalViewPreference: parent.goalViewPreference || 'progress',
            parentTone: parent.parentTone || '',
            parentLanguage: parent.parentLanguage || 'English'
        });
    } catch (error) {
        console.error("ERROR: Failed to fetch parent settings:", error);
        res.status(500).json({ message: "Could not fetch settings." });
    }
});

// Update parent settings
router.put('/settings', isAuthenticated, isParent, async (req, res) => {
    const parentId = req.user._id;
    const { reportFrequency, goalViewPreference, parentTone, parentLanguage } = req.body;

    try {
        const parent = await User.findById(parentId);
        if (!parent) {
            return res.status(404).json({ message: "Parent not found." });
        }

        // Update fields if provided
        if (reportFrequency) parent.reportFrequency = reportFrequency;
        if (goalViewPreference) parent.goalViewPreference = goalViewPreference;
        if (parentTone !== undefined) parent.parentTone = parentTone; // Allow empty string
        if (parentLanguage) parent.parentLanguage = parentLanguage;

        await parent.save();

        res.json({
            success: true,
            message: "Settings updated successfully!",
            settings: {
                reportFrequency: parent.reportFrequency,
                goalViewPreference: parent.goalViewPreference,
                parentTone: parent.parentTone,
                parentLanguage: parent.parentLanguage
            }
        });
    } catch (error) {
        console.error("ERROR: Failed to update parent settings:", error);
        res.status(500).json({ message: "Could not update settings." });
    }
});

// =====================================================
// PLACEMENT RESULTS: View child's screener/placement details
// =====================================================
router.get('/child/:childId/placement-results', isAuthenticated, isParent, logRecordAccess('assessment_results', 'parental_right_of_access', { getStudentId: req => req.params.childId }), async (req, res) => {
    try {
        const child = await verifyParentChildAccess(req.user._id, req.params.childId);
        if (!child) return res.status(403).json({ message: 'Not authorized to view this child.' });

        let theta = null, percentile = null;
        if (child.initialPlacement) {
            const match = child.initialPlacement.match(/Theta:\s*([-\d.]+)\s*\((\d+)th percentile\)/);
            if (match) { theta = parseFloat(match[1]); percentile = parseInt(match[2]); }
        }

        const screenerSessions = await ScreenerSession.find({ userId: child._id })
            .sort({ startTime: -1 }).limit(5).lean();

        const growthHistory = child.learningProfile?.growthCheckHistory || [];

        res.json({
            success: true,
            child: { id: child._id, name: `${child.firstName} ${child.lastName}`, gradeLevel: child.gradeLevel, mathCourse: child.mathCourse },
            initialPlacement: {
                completed: child.learningProfile?.assessmentCompleted || false,
                date: child.learningProfile?.assessmentDate,
                theta, percentile,
                raw: child.initialPlacement
            },
            screenerSessions: screenerSessions.map(s => ({
                type: s.mode || 'starting-point',
                startTime: s.startTime,
                endTime: s.endTime,
                questionsAnswered: s.questionCount || 0,
                finalTheta: s.theta,
                completed: !!s.endTime
            })),
            growthHistory: growthHistory.map(g => ({
                date: g.date,
                theta: g.theta,
                growth: g.thetaChange,
                status: g.growthStatus
            }))
        });
    } catch (error) {
        console.error('Error fetching child placement results:', error);
        res.status(500).json({ message: 'Error fetching placement results' });
    }
});

// =====================================================
// LEARNING CURVE: View child's skill progression over time
// =====================================================
router.get('/child/:childId/learning-curve', isAuthenticated, isParent, async (req, res) => {
    try {
        const child = await verifyParentChildAccess(req.user._id, req.params.childId);
        if (!child) return res.status(403).json({ message: 'Not authorized to view this child.' });

        const skillsOverview = [];
        for (const [skillId, skillData] of Object.entries(child.skillMastery || {})) {
            const practiceCount = (skillData.practiceHistory || []).length;
            if (practiceCount === 0) continue;

            const firstTheta = skillData.practiceHistory[0]?.theta || 0;
            const currentTheta = skillData.theta || 0;

            skillsOverview.push({
                skillId,
                displayName: skillId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                currentTheta,
                growth: currentTheta - firstTheta,
                practiceCount,
                masteryScore: skillData.masteryScore || 0,
                status: skillData.status || 'learning',
                lastPracticed: skillData.lastPracticed
            });
        }

        skillsOverview.sort((a, b) => {
            const dateA = a.lastPracticed ? new Date(a.lastPracticed) : new Date(0);
            const dateB = b.lastPracticed ? new Date(b.lastPracticed) : new Date(0);
            return dateB - dateA;
        });

        res.json({
            success: true,
            child: { id: child._id, name: `${child.firstName} ${child.lastName}` },
            skills: skillsOverview,
            totalSkillsPracticed: skillsOverview.length
        });
    } catch (error) {
        console.error('Error fetching child learning curve:', error);
        res.status(500).json({ message: 'Error fetching learning curve data' });
    }
});

// CELERATION: Shelved — no real data to track (uncomment to re-enable)
// router.get('/child/:childId/celeration', ...);

// =====================================================
// LEARNING REPORT: Unified parent-friendly learning report
// Aggregates BKT, FSRS, 4-pillar mastery, sessions, badges,
// and gamification data into a single actionable report.
// =====================================================
router.get('/child/:childId/learning-report', isAuthenticated, isParent, logRecordAccess('progress_data', 'parental_right_of_access', { getStudentId: req => req.params.childId }), async (req, res) => {
    try {
        const child = await verifyParentChildAccess(req.user._id, req.params.childId);
        if (!child) return res.status(403).json({ message: 'Not authorized to view this child.' });

        const childId = child._id;
        const childObjectId = new mongoose.Types.ObjectId(childId);
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

        // ------------------------------------------------------------------
        // 1. SESSION DATA — this week and previous week for trend comparison
        // ------------------------------------------------------------------
        const [thisWeekStats, prevWeekStats] = await Promise.all([
            Conversation.aggregate([
                { $match: { userId: childObjectId, lastActivity: { $gte: oneWeekAgo } } },
                { $group: {
                    _id: null,
                    totalProblems: { $sum: { $ifNull: ['$problemsAttempted', 0] } },
                    totalCorrect: { $sum: { $ifNull: ['$problemsCorrect', 0] } },
                    totalMinutes: { $sum: { $ifNull: ['$activeMinutes', 0] } },
                    sessionCount: { $sum: 1 }
                }}
            ]),
            Conversation.aggregate([
                { $match: { userId: childObjectId, lastActivity: { $gte: twoWeeksAgo, $lt: oneWeekAgo } } },
                { $group: {
                    _id: null,
                    totalProblems: { $sum: { $ifNull: ['$problemsAttempted', 0] } },
                    totalCorrect: { $sum: { $ifNull: ['$problemsCorrect', 0] } },
                    totalMinutes: { $sum: { $ifNull: ['$activeMinutes', 0] } },
                    sessionCount: { $sum: 1 }
                }}
            ])
        ]);

        const thisWeek = thisWeekStats[0] || { totalProblems: 0, totalCorrect: 0, totalMinutes: 0, sessionCount: 0 };
        const prevWeek = prevWeekStats[0] || { totalProblems: 0, totalCorrect: 0, totalMinutes: 0, sessionCount: 0 };

        const thisWeekAccuracy = thisWeek.totalProblems > 0
            ? Math.round((thisWeek.totalCorrect / thisWeek.totalProblems) * 100)
            : null;
        const prevWeekAccuracy = prevWeek.totalProblems > 0
            ? Math.round((prevWeek.totalCorrect / prevWeek.totalProblems) * 100)
            : null;

        // ------------------------------------------------------------------
        // 2. SKILL MASTERY — 4-pillar breakdown and skill-level details
        // ------------------------------------------------------------------
        const skillMasteryEntries = Object.entries(child.skillMastery || {});
        const skillIds = skillMasteryEntries.map(([id]) => id);

        // Also collect BKT and FSRS skill IDs for lookup
        const engines = child.learningEngines || {};
        const bktEntries = engines.bkt ? Object.entries(engines.bkt) : [];
        const fsrsEntries = engines.fsrs ? Object.entries(engines.fsrs) : [];
        const _consistencyEntries = engines.consistency ? Object.entries(engines.consistency) : [];

        const allSkillIds = new Set([
            ...skillIds,
            ...bktEntries.map(([id]) => id),
            ...fsrsEntries.map(([id]) => id)
        ]);

        // Fetch display names for all skills in one query
        const skillInfoMap = {};
        if (allSkillIds.size > 0) {
            const skillDocs = await Skill.find({ skillId: { $in: Array.from(allSkillIds) } })
                .select('skillId displayName category')
                .lean();
            for (const s of skillDocs) {
                skillInfoMap[s.skillId] = { displayName: s.displayName || s.skillId, category: s.category || 'Uncategorized' };
            }
        }

        // Mastery status counts
        const masteryCounts = { mastered: 0, practicing: 0, learning: 0, needsReview: 0, total: 0 };
        const topStrengths = [];
        const growthAreas = [];

        for (const [skillId, data] of skillMasteryEntries) {
            masteryCounts.total++;
            const info = skillInfoMap[skillId] || { displayName: skillId, category: 'Uncategorized' };
            const score = data.masteryScore || 0;
            const status = data.status || 'learning';

            if (status === 'mastered') {
                masteryCounts.mastered++;
                topStrengths.push({ skillId, displayName: info.displayName, category: info.category, score, tier: data.currentTier || 'none' });
            } else if (status === 'practicing') {
                masteryCounts.practicing++;
            } else if (status === 'learning') {
                masteryCounts.learning++;
            } else if (status === 'needs-review' || status === 're-fragile') {
                masteryCounts.needsReview++;
                growthAreas.push({ skillId, displayName: info.displayName, category: info.category, score, status });
            }
        }

        // Sort strengths by score descending, growth areas by score ascending
        topStrengths.sort((a, b) => b.score - a.score);
        growthAreas.sort((a, b) => a.score - b.score);

        // ------------------------------------------------------------------
        // 3. MEMORY HEALTH — FSRS retrievability analysis
        // ------------------------------------------------------------------
        let memoryStrong = 0;
        let memoryFading = 0;
        let memoryNeedsReview = 0;
        const fadingSkills = [];

        for (const [skillId, data] of fsrsEntries) {
            const elapsed = data.lastReview
                ? (Date.now() - new Date(data.lastReview).getTime()) / 86400000
                : 0;
            const retrievability = calculateRetrievability(elapsed, data.stability ?? 0);
            const info = skillInfoMap[skillId] || { displayName: skillId };

            if (retrievability >= 0.85) {
                memoryStrong++;
            } else if (retrievability >= 0.5) {
                memoryFading++;
                fadingSkills.push({ skillId, displayName: info.displayName, retrievability: Math.round(retrievability * 100) });
            } else {
                memoryNeedsReview++;
                fadingSkills.push({ skillId, displayName: info.displayName, retrievability: Math.round(retrievability * 100) });
            }
        }

        // Sort fading skills by retrievability ascending (most urgent first)
        fadingSkills.sort((a, b) => a.retrievability - b.retrievability);

        // ------------------------------------------------------------------
        // 4. BKT — Knowledge state summary by category
        // ------------------------------------------------------------------
        const knowledgeByCategory = {};
        let bktMasteredThisWeek = 0;

        for (const [skillId, data] of bktEntries) {
            const info = skillInfoMap[skillId] || { displayName: skillId, category: 'Uncategorized' };
            const cat = info.category;
            if (!knowledgeByCategory[cat]) {
                knowledgeByCategory[cat] = { mastered: 0, learning: 0, needsWork: 0, total: 0 };
            }
            const pLearned = data.pLearned ?? 0;
            knowledgeByCategory[cat].total++;
            if (pLearned >= 0.95) knowledgeByCategory[cat].mastered++;
            else if (pLearned >= 0.3) knowledgeByCategory[cat].learning++;
            else knowledgeByCategory[cat].needsWork++;

            // Check if mastered this week
            if (data.mastered && data.lastObservation && new Date(data.lastObservation) >= oneWeekAgo) {
                bktMasteredThisWeek++;
            }
        }

        // ------------------------------------------------------------------
        // 5. COGNITIVE LOAD — Recent trend
        // ------------------------------------------------------------------
        const cogHistory = engines.cognitiveLoadHistory || [];
        const recentCogHistory = cogHistory.filter(h => h.date && new Date(h.date) >= oneWeekAgo);
        let cognitiveLoadTrend = 'no-data';
        let avgCognitiveLoad = null;

        if (recentCogHistory.length > 0) {
            avgCognitiveLoad = recentCogHistory.reduce((sum, h) => sum + (h.avgLoad ?? 0), 0) / recentCogHistory.length;
            avgCognitiveLoad = Math.round(avgCognitiveLoad * 1000) / 1000;

            if (recentCogHistory.length >= 2) {
                const mid = Math.floor(recentCogHistory.length / 2);
                const firstHalfAvg = recentCogHistory.slice(0, mid).reduce((s, h) => s + (h.avgLoad ?? 0), 0) / mid;
                const secondHalfAvg = recentCogHistory.slice(mid).reduce((s, h) => s + (h.avgLoad ?? 0), 0) / (recentCogHistory.length - mid);
                if (secondHalfAvg > firstHalfAvg + 0.05) cognitiveLoadTrend = 'rising';
                else if (secondHalfAvg < firstHalfAvg - 0.05) cognitiveLoadTrend = 'improving';
                else cognitiveLoadTrend = 'stable';
            } else {
                cognitiveLoadTrend = 'stable';
            }
        }

        // ------------------------------------------------------------------
        // 6. BADGES & MILESTONES — Recent achievements
        // ------------------------------------------------------------------
        const recentBadges = [];
        if (child.badges && Array.isArray(child.badges)) {
            for (const badge of child.badges) {
                if (badge.unlockedAt && new Date(badge.unlockedAt) >= oneWeekAgo) {
                    recentBadges.push({ key: badge.key, badgeId: badge.badgeId, unlockedAt: badge.unlockedAt });
                }
            }
        }
        // Strategy badges (Master Mode)
        const recentStrategyBadges = [];
        if (child.strategyBadges && Array.isArray(child.strategyBadges)) {
            for (const badge of child.strategyBadges) {
                if (badge.earnedDate && new Date(badge.earnedDate) >= oneWeekAgo) {
                    recentStrategyBadges.push({ badgeId: badge.badgeId, badgeName: badge.badgeName, category: badge.category, earnedDate: badge.earnedDate });
                }
            }
        }

        // ------------------------------------------------------------------
        // 7. GROWTH TRAJECTORY — Theta over time
        // ------------------------------------------------------------------
        const growthHistory = child.learningProfile?.growthCheckHistory || [];
        const currentTheta = child.learningProfile?.currentTheta || 0;
        let thetaGrowthThisMonth = null;

        if (growthHistory.length >= 2) {
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
            const recentChecks = growthHistory.filter(g => g.date && new Date(g.date) >= thirtyDaysAgo);
            if (recentChecks.length > 0) {
                thetaGrowthThisMonth = recentChecks.reduce((sum, g) => sum + (g.thetaChange || 0), 0);
                thetaGrowthThisMonth = Math.round(thetaGrowthThisMonth * 100) / 100;
            }
        }

        // ------------------------------------------------------------------
        // 8. STREAKS & ENGAGEMENT
        // ------------------------------------------------------------------
        const streak = child.streak || {};
        const dailyQuests = child.dailyQuests || {};
        const weeklyChallenges = child.weeklyChallenges || {};

        // ------------------------------------------------------------------
        // 9. FACT FLUENCY SUMMARY
        // ------------------------------------------------------------------
        const fluencyStats = child.factFluencyProgress?.stats || {};
        const fluencyFamilies = child.factFluencyProgress?.factFamilies || {};
        let fluencyMastered = 0;
        let fluencyTotal = 0;
        for (const [, familyData] of Object.entries(fluencyFamilies)) {
            fluencyTotal++;
            if (familyData.mastered) fluencyMastered++;
        }

        // ------------------------------------------------------------------
        // 10. GENERATE PLAIN-LANGUAGE INSIGHTS
        // ------------------------------------------------------------------
        const insights = [];

        // Activity insight
        if (thisWeek.sessionCount === 0) {
            insights.push({ type: 'engagement', tone: 'concern', message: `${child.firstName} hasn't had any sessions this week. Even 10 minutes a day makes a big difference.` });
        } else if (thisWeek.sessionCount >= 5) {
            insights.push({ type: 'engagement', tone: 'positive', message: `${child.firstName} has been very active this week with ${thisWeek.sessionCount} sessions and ${thisWeek.totalMinutes} minutes of practice!` });
        } else {
            insights.push({ type: 'engagement', tone: 'neutral', message: `${child.firstName} had ${thisWeek.sessionCount} session${thisWeek.sessionCount > 1 ? 's' : ''} this week (${thisWeek.totalMinutes} minutes total).` });
        }

        // Accuracy trend insight
        if (thisWeekAccuracy !== null && prevWeekAccuracy !== null) {
            const accuracyDelta = thisWeekAccuracy - prevWeekAccuracy;
            if (accuracyDelta > 5) {
                insights.push({ type: 'accuracy', tone: 'positive', message: `Accuracy improved from ${prevWeekAccuracy}% to ${thisWeekAccuracy}% — great progress!` });
            } else if (accuracyDelta < -10) {
                insights.push({ type: 'accuracy', tone: 'concern', message: `Accuracy dipped from ${prevWeekAccuracy}% to ${thisWeekAccuracy}%. This could mean ${child.firstName} is tackling harder material — which is a good thing.` });
            } else if (thisWeekAccuracy !== null) {
                insights.push({ type: 'accuracy', tone: 'neutral', message: `Accuracy this week: ${thisWeekAccuracy}% across ${thisWeek.totalProblems} problems.` });
            }
        } else if (thisWeekAccuracy !== null) {
            insights.push({ type: 'accuracy', tone: 'neutral', message: `Accuracy this week: ${thisWeekAccuracy}% across ${thisWeek.totalProblems} problems.` });
        }

        // Memory health insight
        if (fadingSkills.length > 0) {
            const topFading = fadingSkills.slice(0, 3).map(s => s.displayName);
            insights.push({ type: 'memory', tone: 'actionable', message: `${topFading.join(', ')} ${topFading.length === 1 ? 'is' : 'are'} starting to fade from memory. A quick review session would help lock ${topFading.length === 1 ? 'it' : 'them'} in.` });
        } else if (memoryStrong > 0) {
            insights.push({ type: 'memory', tone: 'positive', message: `${memoryStrong} skill${memoryStrong > 1 ? 's are' : ' is'} well-retained in long-term memory. The spaced practice is working!` });
        }

        // Cognitive load insight
        if (cognitiveLoadTrend === 'rising') {
            insights.push({ type: 'cognitive', tone: 'concern', message: `${child.firstName} seems to be working harder than usual. This is normal when learning new concepts — make sure they take breaks.` });
        } else if (cognitiveLoadTrend === 'improving') {
            insights.push({ type: 'cognitive', tone: 'positive', message: `The material is getting easier for ${child.firstName} — a sign that learning is sinking in.` });
        }

        // Mastery milestone insight
        if (bktMasteredThisWeek > 0) {
            insights.push({ type: 'milestone', tone: 'positive', message: `${child.firstName} mastered ${bktMasteredThisWeek} new skill${bktMasteredThisWeek > 1 ? 's' : ''} this week!` });
        }

        // Growth areas insight
        if (growthAreas.length > 0) {
            const topGrowth = growthAreas.slice(0, 3).map(s => s.displayName);
            insights.push({ type: 'growth', tone: 'actionable', message: `${topGrowth.join(', ')} could use more practice. Encourage ${child.firstName} to revisit ${topGrowth.length === 1 ? 'this topic' : 'these topics'}.` });
        }

        // ------------------------------------------------------------------
        // 11. DETERMINE OVERALL HEADLINE
        // ------------------------------------------------------------------
        let headline;
        let headlineTone;

        // Weight multiple signals for overall assessment
        const hasActivity = thisWeek.sessionCount > 0;
        const hasMasteryGrowth = bktMasteredThisWeek > 0 || (thetaGrowthThisMonth !== null && thetaGrowthThisMonth > 0);
        const hasStrongAccuracy = thisWeekAccuracy !== null && thisWeekAccuracy >= 70;
        const hasHighCogLoad = cognitiveLoadTrend === 'rising';

        if (!hasActivity) {
            headline = `${child.firstName} hasn't practiced this week`;
            headlineTone = 'needs-attention';
        } else if (hasMasteryGrowth && hasStrongAccuracy) {
            headline = `${child.firstName} is making excellent progress`;
            headlineTone = 'excellent';
        } else if (hasActivity && hasStrongAccuracy) {
            headline = `${child.firstName} is doing well — steady and consistent`;
            headlineTone = 'good';
        } else if (hasActivity && hasHighCogLoad) {
            headline = `${child.firstName} is working hard on new challenges`;
            headlineTone = 'growing';
        } else if (hasActivity) {
            headline = `${child.firstName} is putting in the work`;
            headlineTone = 'building';
        } else {
            headline = `${child.firstName}'s learning journey continues`;
            headlineTone = 'neutral';
        }

        // ------------------------------------------------------------------
        // BUILD RESPONSE
        // ------------------------------------------------------------------
        res.json({
            success: true,
            reportDate: now.toISOString(),
            child: {
                id: child._id,
                firstName: child.firstName,
                lastName: child.lastName,
                gradeLevel: child.gradeLevel,
                mathCourse: child.mathCourse,
                level: child.level || 1,
                xp: child.xp || 0
            },

            headline: { text: headline, tone: headlineTone },

            insights,

            weeklySnapshot: {
                thisWeek: {
                    sessions: thisWeek.sessionCount,
                    minutes: thisWeek.totalMinutes,
                    problemsAttempted: thisWeek.totalProblems,
                    problemsCorrect: thisWeek.totalCorrect,
                    accuracy: thisWeekAccuracy
                },
                previousWeek: {
                    sessions: prevWeek.sessionCount,
                    minutes: prevWeek.totalMinutes,
                    problemsAttempted: prevWeek.totalProblems,
                    problemsCorrect: prevWeek.totalCorrect,
                    accuracy: prevWeekAccuracy
                },
                trends: {
                    sessionsDelta: thisWeek.sessionCount - prevWeek.sessionCount,
                    minutesDelta: thisWeek.totalMinutes - prevWeek.totalMinutes,
                    accuracyDelta: (thisWeekAccuracy !== null && prevWeekAccuracy !== null) ? thisWeekAccuracy - prevWeekAccuracy : null,
                    problemsDelta: thisWeek.totalProblems - prevWeek.totalProblems
                }
            },

            mastery: {
                counts: masteryCounts,
                topStrengths: topStrengths.slice(0, 5),
                growthAreas: growthAreas.slice(0, 5),
                knowledgeByCategory
            },

            memoryHealth: {
                strong: memoryStrong,
                fading: memoryFading,
                needsReview: memoryNeedsReview,
                totalTracked: fsrsEntries.length,
                fadingSkills: fadingSkills.slice(0, 5)
            },

            cognitiveLoad: {
                average: avgCognitiveLoad,
                trend: cognitiveLoadTrend,
                label: cognitiveLoadTrend === 'improving' ? 'Getting easier'
                    : cognitiveLoadTrend === 'rising' ? 'Working harder'
                    : cognitiveLoadTrend === 'stable' ? 'Steady effort'
                    : 'Not enough data yet'
            },

            growth: {
                currentTheta,
                thetaGrowthThisMonth,
                recentChecks: growthHistory.slice(-5).map(g => ({
                    date: g.date,
                    thetaChange: g.thetaChange,
                    growthStatus: g.growthStatus,
                    accuracy: g.accuracy
                }))
            },

            milestones: {
                badges: recentBadges,
                strategyBadges: recentStrategyBadges,
                skillsMasteredThisWeek: bktMasteredThisWeek
            },

            engagement: {
                currentStreak: streak.current || 0,
                longestStreak: streak.longest || 0,
                totalTutoringMinutes: child.totalActiveTutoringMinutes || 0,
                questsCompleted: dailyQuests.quests ? dailyQuests.quests.filter(q => q.completed).length : 0,
                challengesCompleted: weeklyChallenges.challenges ? weeklyChallenges.challenges.filter(c => c.completed).length : 0
            },

            factFluency: {
                mastered: fluencyMastered,
                total: fluencyTotal,
                totalSessions: fluencyStats.totalSessions || 0,
                overallAccuracy: fluencyStats.overallAccuracy ? Math.round(fluencyStats.overallAccuracy) : null
            }
        });

    } catch (error) {
        console.error('Error generating learning report:', error);
        res.status(500).json({ message: 'Error generating learning report.' });
    }
});

module.exports = router;