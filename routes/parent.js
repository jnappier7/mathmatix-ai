// routes/parent.js
// MODIFIED: Updated to query the 'Conversation' collection for child's progress.

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user');
const Conversation = require('../models/conversation'); // NEW: Import Conversation model
const { isParent, isAuthenticated } = require('../middleware/auth');
const { cleanupStaleSessions } = require('../services/sessionService');
const ScreenerSession = require('../models/screenerSession');

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
router.get('/child/:childId/progress', isAuthenticated, isParent, async (req, res) => {
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
            summary: { $exists: true, $ne: null, $ne: '' }
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
router.get('/child/:childId/growth-history', isAuthenticated, isParent, async (req, res) => {
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
router.get('/child/:childId/placement-results', isAuthenticated, isParent, async (req, res) => {
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

// =====================================================
// CELERATION: View child's fact fluency progress
// =====================================================
router.get('/child/:childId/celeration', isAuthenticated, isParent, async (req, res) => {
    try {
        const child = await verifyParentChildAccess(req.user._id, req.params.childId);
        if (!child) return res.status(403).json({ message: 'Not authorized to view this child.' });

        const grade = parseInt(child.gradeLevel);
        const aim = grade >= 9 ? 60 : grade >= 6 ? 50 : 40;
        const familiesData = [];

        for (const [familyKey, familyData] of Object.entries(child.factFluencyProgress?.factFamilies || {})) {
            if (!familyData.sessions || familyData.sessions.length === 0) continue;

            const sessions = familyData.sessions.map(s => ({
                date: s.date, rate: s.rate, accuracy: s.accuracy
            })).sort((a, b) => new Date(a.date) - new Date(b.date));

            const recentRates = sessions.slice(-3).map(s => s.rate).sort((a, b) => a - b);
            const currentRate = recentRates[Math.floor(recentRates.length / 2)];

            familiesData.push({
                familyKey,
                displayName: familyData.displayName,
                currentRate,
                bestRate: familyData.bestRate || 0,
                atAim: currentRate >= aim,
                mastered: familyData.mastered || false,
                sessionCount: sessions.length,
                lastPracticed: familyData.lastPracticed,
                sessions
            });
        }

        res.json({
            success: true,
            child: { id: child._id, name: `${child.firstName} ${child.lastName}` },
            aim,
            families: familiesData
        });
    } catch (error) {
        console.error('Error fetching child celeration:', error);
        res.status(500).json({ message: 'Error fetching celeration data' });
    }
});

module.exports = router;