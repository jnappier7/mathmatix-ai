// routes/student.js - PHASE 1: Backend Routing & Core Setup - Batch 2
// Handles student-specific API actions.

const express = require('express');
const router = express.Router();
const path = require('path');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const StudentUpload = require('../models/studentUpload');
const GradingResult = require('../models/gradingResult');
const { isAuthenticated, isStudent } = require('../middleware/auth'); // Import isStudent middleware
const crypto = require('crypto'); // Node.js built-in module for cryptography
const mongoose = require('mongoose');
const { computeWeeklyAccuracy } = require('../utils/weeklyAccuracy');
const { resolveSkillDisplayNames } = require('../utils/skillDisplayNames');
const { deriveProgressCardState } = require('../utils/progressCardState');
const { getReviewSummary } = require('../utils/smartReviewQueue');
const { resolveMasteryKey, getSkillMasteryEntry, setSkillMasteryEntry } = require('../utils/masteryGuard');

// Helper function to generate a unique short code for student-to-parent linking
async function generateUniqueStudentLinkCode() {
    let code;
    let isUnique = false;
    while (!isUnique) {
        // Generate a random 3-byte hex string (6 characters) for uniqueness
        code = crypto.randomBytes(3).toString('hex').toUpperCase();
        // Check if this code already exists for any user's studentToParentLinkCode
        const existingUser = await User.findOne({ 'studentToParentLinkCode.code': `MATH-${code}` });
        if (!existingUser) {
            isUnique = true;
        }
    }
    return `MATH-${code}`; // Prefix for readability (e.g., MATH-A1B2C3)
}

// POST /api/student/generate-link-code
// Allows a student to generate a code for their parent to link.
router.post('/generate-link-code', isAuthenticated, isStudent, async (req, res) => {
    // Middleware ensures only authenticated students can access this.
    const studentId = req.user._id;

    try {
        const student = await User.findById(studentId);
        if (!student) { // Should not happen if isAuthenticated works, but defensive check
            return res.status(404).json({ success: false, message: 'Student account not found.' });
        }

        // Check if an active, unused link code already exists for this student
        // Also checks if parentLinked is false, meaning it hasn't been used yet.
        if (student.studentToParentLinkCode && student.studentToParentLinkCode.code && !student.studentToParentLinkCode.parentLinked) {
            console.log(`LOG: Returning existing student link code for student ${student.username}`);
            return res.json({
                success: true,
                code: student.studentToParentLinkCode.code,
                message: 'An active link code already exists.'
            });
        }

        const newLinkCode = await generateUniqueStudentLinkCode();
        
        // Store the new link code on the student's user object
        student.studentToParentLinkCode = {
            code: newLinkCode,
            parentLinked: false // Reset this flag for a new code
        };
        await student.save();

        console.log(`LOG: Generated new student link code: ${newLinkCode} for student ${student.username}`);
        res.json({ success: true, code: newLinkCode, message: 'New link code generated successfully.' });

    } catch (err) {
        console.error('ERROR: Failed to generate student link code:', err);
        res.status(500).json({ success: false, message: 'Server error generating link code.' });
    }
});

// GET /api/student/linked-parent
// Allows a student to check if they are linked to a parent.
router.get('/linked-parent', isAuthenticated, isStudent, async (req, res) => {
    try {
        const student = await User.findById(req.user._id).select('parentIds hasParentalConsent').populate('parentIds', 'firstName lastName username role').lean();
        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }

        // Check if student has any linked parents
        if (student.parentIds && student.parentIds.length > 0) {
            // Return first parent (could be enhanced to return all parents)
            const parent = student.parentIds[0];
            res.json({
                isLinked: true,
                hasParentalConsent: student.hasParentalConsent || false,
                parentId: parent._id,
                parentName: `${parent.firstName} ${parent.lastName}`,
                totalParents: student.parentIds.length
            });
        } else {
            res.json({ isLinked: false, hasParentalConsent: student.hasParentalConsent || false, message: 'Not linked to a parent account.' });
        }
    } catch (error) {
        console.error("ERROR: Failed to check linked parent status:", error);
        res.status(500).json({ message: "Server error checking link status." });
    }
});

// POST /api/student/link-to-parent
// Allows a student to link to a parent using the parent's invite code
router.post('/link-to-parent', isAuthenticated, isStudent, async (req, res) => {
    const { parentInviteCode } = req.body;

    if (!parentInviteCode || parentInviteCode.trim() === '') {
        return res.status(400).json({ message: "Parent invite code is required." });
    }

    try {
        const student = await User.findById(req.user._id);
        if (!student) {
            return res.status(404).json({ message: "Student not found." });
        }

        // Find a parent with a matching, valid invite code
        const parent = await User.findOne({
            'parentToChildInviteCode.code': parentInviteCode.trim().toUpperCase(),
            'parentToChildInviteCode.childLinked': false,
            'parentToChildInviteCode.expiresAt': { $gt: new Date() },
            role: 'parent'
        });

        if (!parent) {
            return res.status(400).json({ message: "Invalid, expired, or already used parent invite code." });
        }

        // Check if already linked to this parent
        if (student.parentIds && student.parentIds.some(pid => pid.equals(parent._id))) {
            return res.status(400).json({ message: "Already linked to this parent." });
        }

        // Link the student to the parent
        parent.children = parent.children || [];
        if (!parent.children.some(childId => childId.equals(student._id))) {
            parent.children.push(student._id);
        }
        parent.parentToChildInviteCode.childLinked = true;

        // Add parent to student's parentIds array
        student.parentIds = student.parentIds || [];
        if (!student.parentIds.some(parentId => parentId.equals(parent._id))) {
            student.parentIds.push(parent._id);
        }

        // Grant parental consent (COPPA compliance)
        student.hasParentalConsent = true;

        await parent.save();
        await student.save();

        console.log(`LOG: Student ${student.username} linked to parent ${parent.username} via parent invite code.`);
        res.status(200).json({
            success: true,
            message: `Successfully linked to parent ${parent.firstName} ${parent.lastName}!`,
            hasParentalConsent: true
        });

    } catch (error) {
        console.error("ERROR: Failed to link to parent:", error);
        res.status(500).json({ message: "Could not link to parent." });
    }
});

// POST /api/student/invite-parent
// Student submits a parent's email; we email the parent a signup link that
// auto-links them to this student on account creation (see routes/signup.js).
// Captures the parent relationship without the kid having to share a code.
router.post('/invite-parent', isAuthenticated, isStudent, async (req, res) => {
    const email = (req.body.parentEmail || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: 'Please enter a valid parent email address.' });
    }
    try {
        const student = await User.findById(req.user._id);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found.' });
        }
        // No-op if a parent with this email is already linked to this student.
        const existingParent = await User.findOne({ email, role: 'parent' });
        if (existingParent && (student.parentIds || []).some(pid => pid.equals(existingParent._id))) {
            return res.status(400).json({ success: false, message: 'That parent is already linked to your account.' });
        }

        const token = crypto.randomBytes(24).toString('hex');
        student.parentInvite = { email, token, sentAt: new Date() };
        await student.save();

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        // Existing parent account → confirm-link into the dashboard; new parent → signup link.
        const actionUrl = existingParent
            ? `${baseUrl}/parent-dashboard.html?acceptInvite=${token}`
            : `${baseUrl}/signup.html?role=parent&parentInvite=${token}&email=${encodeURIComponent(email)}`;
        const { sendParentInvite } = require('../utils/emailService');
        const result = await sendParentInvite(email, student.firstName, actionUrl, !!existingParent);

        if (!result.success) {
            return res.json({ success: true, emailed: false, message: "Invite saved, but the email couldn't be sent right now. You can also share your code with your parent." });
        }
        res.json({ success: true, emailed: true, message: `Invite sent to ${email}. They'll get a link to set up a free parent account.` });
    } catch (error) {
        console.error('ERROR: Failed to invite parent:', error);
        res.status(500).json({ success: false, message: 'Could not send the parent invite.' });
    }
});

// POST /api/student/request-parent-upgrade
// Student hits the paywall and asks a linked parent to unlock Mathmatix+.
//   - Linked parent(s): notify each (in-app notification + trial-framed email).
//   - No linked parent: return linked:false so the client can prompt for a
//     parent email, which flows into POST /invite-parent.
router.post('/request-parent-upgrade', isAuthenticated, isStudent, async (req, res) => {
    try {
        const student = await User.findById(req.user._id);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found.' });
        }

        const parentIds = student.parentIds || [];
        if (parentIds.length === 0) {
            return res.json({ success: true, linked: false, message: 'No parent is linked yet.' });
        }

        // Throttle — at most one nudge per 12 hours so a kid re-hitting the wall
        // can't spam their parent's inbox.
        const THROTTLE_MS = 12 * 60 * 60 * 1000;
        const last = student.lastParentUpgradeRequestAt ? new Date(student.lastParentUpgradeRequestAt).getTime() : 0;
        if (Date.now() - last < THROTTLE_MS) {
            return res.json({ success: true, linked: true, alreadySent: true, message: "We already let your parent know — hang tight!" });
        }

        const parents = await User.find({ _id: { $in: parentIds } })
            .select('email firstName subscriptionTier').lean();

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const actionUrl = `${baseUrl}/parent-dashboard.html?upgrade=1&child=${student._id}`;
        const Notification = require('../models/notification');
        const { sendParentUpgradeRequest } = require('../utils/emailService');

        let notified = 0;
        for (const parent of parents) {
            // Skip parents who already have unlimited — the child is already covered.
            if (parent.subscriptionTier === 'unlimited') continue;
            try {
                await Notification.create({
                    recipientId: parent._id,
                    recipientRole: 'parent',
                    subjectUserId: student._id,
                    type: 'help_request',
                    data: {
                        kind: 'upgrade_request',
                        childId: student._id.toString(),
                        childName: student.firstName,
                        title: `${student.firstName} wants to keep learning`,
                        message: `${student.firstName} hit their free tutoring limit and asked you to unlock Mathmatix+.`,
                        actionUrl
                    }
                });
            } catch (nErr) {
                console.error('Failed to create parent upgrade notification:', nErr.message);
            }
            if (parent.email) {
                try { await sendParentUpgradeRequest(parent.email, student.firstName, actionUrl); }
                catch (mErr) { console.error('Failed to email parent upgrade request:', mErr.message); }
            }
            notified++;
        }

        student.lastParentUpgradeRequestAt = new Date();
        await student.save();

        if (notified === 0) {
            // Every linked parent already has unlimited → child should already have access.
            return res.json({ success: true, linked: true, alreadyCovered: true, message: "Good news — you're already covered by a parent's plan. Try reloading!" });
        }
        return res.json({ success: true, linked: true, notified, message: "We let your parent know! They'll get an email to unlock unlimited tutoring." });
    } catch (error) {
        console.error('ERROR: request-parent-upgrade failed:', error);
        res.status(500).json({ success: false, message: 'Could not reach your parent right now.' });
    }
});

// GET /api/student/progress
// Returns student's learning progress (mastered, learning, ready skills)
router.get('/progress', isAuthenticated, isStudent, async (req, res) => {
    try {
        const student = await User.findById(req.user._id).lean();
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Check if assessment completed
        if (!student.learningProfile?.assessmentCompleted) {
            return res.json({
                assessmentCompleted: false,
                message: 'Assessment not yet completed'
            });
        }

        // Parse skill mastery data (.lean() returns plain object instead of Map)
        const mastered = [];
        const learning = [];
        const ready = [];

        const skillEntries = student.skillMastery ? Object.entries(student.skillMastery) : [];
        // Resolve names from the Skill catalog by canonical id, NOT from the storage
        // key — canonical keys are dot-encoded ("MS_QNT_8") and would render "Ms Qnt 8".
        const skillNames = await resolveSkillDisplayNames(skillEntries.map(([k]) => k));
        if (skillEntries.length > 0) {
            for (const [skillId, data] of skillEntries) {
                const displayName = skillNames[skillId];

                const skillData = {
                    skillId,
                    displayName,
                    status: data.status,
                    masteryScore: data.masteryScore,
                    lastPracticed: data.lastPracticed,
                    notes: data.notes
                };

                if (data.status === 'mastered') {
                    skillData.masteredDate = data.masteredDate;
                    mastered.push(skillData);
                } else if (data.status === 'learning') {
                    skillData.learningStarted = data.learningStarted;
                    skillData.consecutiveCorrect = data.consecutiveCorrect;
                    learning.push(skillData);
                } else if (data.status === 'ready') {
                    ready.push(skillData);
                }
            }
        }

        // Sort mastered by date (most recent first)
        mastered.sort((a, b) => new Date(b.masteredDate) - new Date(a.masteredDate));

        res.json({
            assessmentCompleted: true,
            assessmentDate: student.assessmentDate,
            progress: {
                mastered,
                learning,
                ready
            },
            stats: {
                totalMastered: mastered.length,
                currentlyLearning: learning.length,
                readyToLearn: ready.length
            }
        });

    } catch (error) {
        console.error('ERROR: Failed to get student progress:', error);
        res.status(500).json({ error: 'Failed to retrieve progress' });
    }
});

// GET /api/student/progress/summary
// Returns a quick summary for dashboard cards
router.get('/progress/summary', isAuthenticated, isStudent, async (req, res) => {
    try {
        const student = await User.findById(req.user._id).lean();
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        if (!student.learningProfile?.assessmentCompleted) {
            return res.json({
                assessmentCompleted: false,
                canTakeAssessment: true
            });
        }

        // Get most recent mastered skill
        let recentMastery = null;
        let currentLearning = null;
        let nextReady = null;

        const skillEntries = student.skillMastery ? Object.entries(student.skillMastery) : [];
        if (skillEntries.length > 0) {
            const mastered = [];
            const learning = [];
            const ready = [];

            const skillNames = await resolveSkillDisplayNames(skillEntries.map(([k]) => k));
            for (const [skillId, data] of skillEntries) {
                const displayName = skillNames[skillId];

                if (data.status === 'mastered' && data.masteredDate) {
                    mastered.push({ skillId, displayName, date: data.masteredDate });
                } else if (data.status === 'learning') {
                    // masteryScore is dual-scale: placement seeds it 0-1, the
                    // pillar engine writes it 0-100. Blindly *100 turned a 40
                    // into 4000 → clamped to a fake "100% mastered". Normalize.
                    const raw = Number(data.masteryScore) || 0;
                    const progress = Math.round(raw <= 1 ? raw * 100 : raw);
                    learning.push({
                        skillId, displayName, progress,
                        // For picking the CURRENT skill below — the one the
                        // student is actually working, not map-order-first.
                        lastTouched: data.lastPracticed || data.learningStarted || null,
                    });
                } else if (data.status === 'ready') {
                    ready.push({ skillId, displayName });
                }
            }

            // Most recent mastered
            if (mastered.length > 0) {
                mastered.sort((a, b) => new Date(b.date) - new Date(a.date));
                recentMastery = mastered[0];
            }

            // Current learning: the skill the student most recently WORKED,
            // not whichever entry happens to iterate first. Map-order-first
            // could pin an untouched placement seed on the card forever while
            // live work updated a different entry (owner-hit: the What's Next
            // bar "was at 78% the entire time" through five clean answers).
            if (learning.length > 0) {
                learning.sort((a, b) => new Date(b.lastTouched || 0) - new Date(a.lastTouched || 0));
                currentLearning = learning[0];
            }

            // Next ready skill
            if (ready.length > 0) {
                nextReady = ready[0];
            }
        }

        // Recent wins from learning profile
        const recentWins = student.learningProfile?.recentWins?.slice(0, 3) || [];

        // Streak from daily quests
        const streak = student.dailyQuests?.currentStreak || 0;

        // Daily quests (top 2 for the strip)
        const dailyQuests = (student.dailyQuests?.quests || []).map(q => ({
            name: q.name || q.description,
            description: q.description,
            progress: q.progress || 0,
            total: q.total || 1,
            completed: q.completed || false
        }));

        // Weekly stats: problems, accuracy, XP, skills mastered
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const studentObjectId = new mongoose.Types.ObjectId(student._id);

        // Prefer the first-try counters (one slot per problem, retries excluded).
        // Legacy conversations predate these fields, so fall back to the older
        // per-attempt counters until they age out of the 7-day window.
        const weeklyAgg = await Conversation.aggregate([
            { $match: { userId: studentObjectId, lastActivity: { $gte: oneWeekAgo } } },
            {
                $group: {
                    _id: null,
                    totalProblems: { $sum: { $ifNull: ['$firstTryAttempted', { $ifNull: ['$problemsAttempted', 0] }] } },
                    totalCorrect: { $sum: { $ifNull: ['$firstTryCorrect', { $ifNull: ['$problemsCorrect', 0] }] } }
                }
            }
        ]);
        const weeklyConvStats = weeklyAgg[0] || { totalProblems: 0, totalCorrect: 0 };

        // Fold in "Show Your Work" grading — the cleanest correctness signal we have
        // (structured, per-problem right/wrong), which the chat pipeline path never
        // saw. Only first attempts (previousAttemptId null; also matches legacy docs
        // missing the field) so resubmissions of the same worksheet don't double-count.
        const gradeWorkAgg = await GradingResult.aggregate([
            { $match: { userId: studentObjectId, previousAttemptId: null, createdAt: { $gte: oneWeekAgo } } },
            {
                $group: {
                    _id: null,
                    totalProblems: { $sum: { $ifNull: ['$problemCount', 0] } },
                    totalCorrect: { $sum: { $ifNull: ['$correctCount', 0] } }
                }
            }
        ]);
        const gradeWorkStats = gradeWorkAgg[0] || { totalProblems: 0, totalCorrect: 0 };

        const weeklyXp = (student.xpHistory || [])
            .filter(e => e.date && new Date(e.date) >= oneWeekAgo)
            .reduce((sum, e) => sum + (e.amount || 0), 0);

        const skillsMasteredThisWeek = skillEntries
            .filter(([, d]) => d.status === 'mastered' && d.masteredDate && new Date(d.masteredDate) >= oneWeekAgo)
            .length;

        // computeWeeklyAccuracy combines both correctness sources and gates the
        // percentage on a minimum sample (see utils/weeklyAccuracy.js). Below the
        // threshold accuracy is null and the client shows a raw fraction instead.
        const weeklyStats = {
            ...computeWeeklyAccuracy({
                convProblems: weeklyConvStats.totalProblems,
                convCorrect: weeklyConvStats.totalCorrect,
                gwProblems: gradeWorkStats.totalProblems,
                gwCorrect: gradeWorkStats.totalCorrect,
            }),
            xpEarned: weeklyXp,
            skillsMastered: skillsMasteredThisWeek
        };

        // Review-due count (FSRS) powers the card's "N skills ready to review" CTA.
        const reviewDue = getReviewSummary(student).dueNow;

        // Server-derived lifecycle state so the card's framing stays honest and
        // the client stays dumb (see utils/progressCardState.js).
        const cardState = deriveProgressCardState({ currentLearning, recentMastery, weeklyStats });

        res.json({
            assessmentCompleted: true,
            recentMastery,
            currentLearning,
            nextReady,
            streak,
            dailyQuests,
            weeklyStats,
            reviewDue,
            cardState,
            recentWins: recentWins.map(w => ({
                description: w.description,
                date: w.date
            }))
        });

    } catch (error) {
        console.error('ERROR: Failed to get progress summary:', error);
        res.status(500).json({ error: 'Failed to retrieve summary' });
    }
});

// GET /api/student/growth
// Returns growth deltas — progress trajectory over time (not just absolutes)
// Psychology: The Progress Principle (Amabile & Kramer) + Growth Mindset (Dweck)
router.get('/growth', isAuthenticated, isStudent, async (req, res) => {
    try {
        const student = await User.findById(req.user._id).lean();
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const now = new Date();
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

        // ── XP growth deltas ──
        const xpHistory = student.xpHistory || [];
        const weeklyXp = xpHistory
            .filter(e => new Date(e.date) >= weekAgo)
            .reduce((sum, e) => sum + (e.amount || 0), 0);
        const monthlyXp = xpHistory
            .filter(e => new Date(e.date) >= monthAgo)
            .reduce((sum, e) => sum + (e.amount || 0), 0);
        // Previous week for comparison
        const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);
        const prevWeekXp = xpHistory
            .filter(e => new Date(e.date) >= twoWeeksAgo && new Date(e.date) < weekAgo)
            .reduce((sum, e) => sum + (e.amount || 0), 0);
        const xpTrend = prevWeekXp > 0 ? Math.round(((weeklyXp - prevWeekXp) / prevWeekXp) * 100) : (weeklyXp > 0 ? 100 : 0);

        // ── Accuracy growth ──
        const recentSessions = await Conversation.find({
            userId: student._id,
            lastActivity: { $gte: monthAgo },
            problemsAttempted: { $gt: 0 }
        }).sort({ lastActivity: -1 }).select('problemsAttempted problemsCorrect lastActivity').lean();

        let accuracyDelta = null;
        if (recentSessions.length >= 4) {
            const mid = Math.floor(recentSessions.length / 2);
            const recentHalf = recentSessions.slice(0, mid);
            const olderHalf = recentSessions.slice(mid);
            const recentAcc = recentHalf.reduce((s, c) => s + c.problemsCorrect, 0) / Math.max(1, recentHalf.reduce((s, c) => s + c.problemsAttempted, 0));
            const olderAcc = olderHalf.reduce((s, c) => s + c.problemsCorrect, 0) / Math.max(1, olderHalf.reduce((s, c) => s + c.problemsAttempted, 0));
            accuracyDelta = Math.round((recentAcc - olderAcc) * 100);
        }

        // ── Skills mastered this month ──
        const skillEntries = student.skillMastery ? Object.entries(student.skillMastery) : [];
        const skillsMasteredThisMonth = skillEntries
            .filter(([, d]) => d.status === 'mastered' && d.masteredDate && new Date(d.masteredDate) >= monthAgo)
            .length;
        const skillsMasteredPrevMonth = skillEntries
            .filter(([, d]) => {
                if (d.status !== 'mastered' || !d.masteredDate) return false;
                const date = new Date(d.masteredDate);
                const twoMonthsAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);
                return date >= twoMonthsAgo && date < monthAgo;
            }).length;

        // ── Level growth ──
        const startLevel = Math.max(1, (student.level || 1) - Math.floor(monthlyXp / (student.level > 1 ? 100 * (1 + 0.1 * (student.level - 2)) : 100)));
        const levelsGained = (student.level || 1) - startLevel;

        // ── Streak ──
        const streak = student.dailyQuests?.currentStreak || 0;
        const longestStreak = student.dailyQuests?.longestStreak || 0;

        // ── Tier 3 behavior count (learning identity) ──
        const tier3Count = (student.xpLadderStats?.tier3Behaviors || [])
            .reduce((sum, b) => sum + (b.count || 0), 0);

        res.json({
            xp: {
                thisWeek: weeklyXp,
                weekOverWeekTrend: xpTrend,       // e.g. +23 means "up 23% from last week"
                thisMonth: monthlyXp,
            },
            accuracy: {
                delta: accuracyDelta,               // e.g. +15 means "up 15 percentage points"
                trend: accuracyDelta === null ? null : (accuracyDelta > 0 ? 'improving' : accuracyDelta < 0 ? 'declining' : 'stable'),
            },
            skills: {
                masteredThisMonth: skillsMasteredThisMonth,
                masteredPrevMonth: skillsMasteredPrevMonth,
            },
            levels: {
                current: student.level || 1,
                gainedThisMonth: levelsGained,
            },
            streak: {
                current: streak,
                longest: longestStreak,
            },
            learningIdentity: {
                tier3BehaviorCount: tier3Count,      // "You've shown X learning behaviors"
            },
        });

    } catch (error) {
        console.error('ERROR: Failed to get growth data:', error);
        res.status(500).json({ error: 'Failed to retrieve growth data' });
    }
});

// POST /api/student/start-skill
// Mark a skill as "learning" when student starts it
router.post('/start-skill', isAuthenticated, isStudent, async (req, res) => {
    try {
        const { skillId } = req.body;
        if (!skillId) {
            return res.status(400).json({ error: 'Skill ID required' });
        }

        const student = await User.findById(req.user._id);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Initialize skillMastery if needed
        if (!student.skillMastery) {
            student.skillMastery = new Map();
        }

        // Check current status (canonical unified key, legacy fallback)
        const masteryKey = resolveMasteryKey(student, skillId);
        const currentStatus = getSkillMasteryEntry(student, masteryKey);

        if (currentStatus?.status === 'mastered') {
            return res.json({
                message: 'Skill already mastered',
                status: 'mastered'
            });
        }

        // Set to learning
        setSkillMasteryEntry(student, masteryKey, {
            status: 'learning',
            rung: currentStatus?.rung || 'learned',
            masteryScore: currentStatus?.masteryScore || 0.1,
            learningStarted: currentStatus?.learningStarted || new Date(),
            lastPracticed: new Date()
        });
        await student.save();

        res.json({
            success: true,
            skillId,
            status: 'learning'
        });

    } catch (error) {
        console.error('ERROR: Failed to start skill:', error);
        res.status(500).json({ error: 'Failed to start skill' });
    }
});

// GET /api/student/uploads
// Retrieve student's uploaded files for their personal resource library
router.get('/uploads', isAuthenticated, isStudent, async (req, res) => {
    try {
        const studentId = req.user._id;
        const limit = parseInt(req.query.limit) || 50;

        // Get recent uploads
        const uploads = await StudentUpload.getRecentUploads(studentId, limit);

        res.json({
            success: true,
            uploads: uploads.map(upload => ({
                _id: upload._id,
                originalFilename: upload.originalFilename,
                fileType: upload.fileType,
                fileSize: upload.fileSize,
                uploadedAt: upload.uploadedAt,
                notes: upload.notes,
                tags: upload.tags
            }))
        });

    } catch (error) {
        console.error('[Student Uploads] Error fetching uploads:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve uploads'
        });
    }
});

// GET /api/student/uploads/:uploadId
// Get full details of a specific upload including extracted text
router.get('/uploads/:uploadId', isAuthenticated, isStudent, async (req, res) => {
    try {
        const studentId = req.user._id;
        const { uploadId } = req.params;

        const upload = await StudentUpload.getUploadDetails(uploadId, studentId);

        if (!upload) {
            return res.status(404).json({
                success: false,
                message: 'Upload not found'
            });
        }

        res.json({
            success: true,
            upload: upload
        });

    } catch (error) {
        console.error('[Student Uploads] Error fetching upload details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve upload details'
        });
    }
});

// GET /api/student/uploads/:uploadId/file
// Serve the actual file (for viewing/downloading)
router.get('/uploads/:uploadId/file', isAuthenticated, isStudent, async (req, res) => {
    try {
        const studentId = req.user._id;
        const { uploadId } = req.params;

        const upload = await StudentUpload.getUploadDetails(uploadId, studentId);

        if (!upload) {
            return res.status(404).json({
                success: false,
                message: 'Upload not found'
            });
        }

        // Send the file
        res.sendFile(upload.filePath, (err) => {
            if (err) {
                console.error('[Student Uploads] Error sending file:', err);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve file'
                });
            }
        });

    } catch (error) {
        console.error('[Student Uploads] Error serving file:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to serve file'
        });
    }
});

// GET /api/student/my-calculator-access
// Get calculator access setting for the current student based on teacher's settings
router.get('/my-calculator-access', isAuthenticated, isStudent, async (req, res) => {
    try {
        // Check if student has a teacher
        if (!req.user.teacherId) {
            return res.json({
                success: true,
                calculatorAccess: 'always', // No teacher = no restrictions
                message: 'No assigned teacher'
            });
        }

        // Get teacher's calculator settings
        const teacher = await User.findById(req.user.teacherId)
            .select('classAISettings.calculatorAccess classAISettings.calculatorNote firstName lastName')
            .lean();

        if (!teacher || !teacher.classAISettings) {
            return res.json({
                success: true,
                calculatorAccess: 'skill-based', // Default
                message: 'Teacher has not configured settings'
            });
        }

        const calcAccess = teacher.classAISettings.calculatorAccess || 'skill-based';
        const calcNote = teacher.classAISettings.calculatorNote || '';

        console.log(`[Calculator] ${req.user.firstName} checked access: ${calcAccess} (Teacher: ${teacher.firstName})`);

        res.json({
            success: true,
            calculatorAccess: calcAccess,
            calculatorNote: calcNote,
            teacherName: `${teacher.firstName} ${teacher.lastName}`
        });

    } catch (error) {
        console.error('Error fetching calculator access:', error);
        res.status(500).json({
            success: false,
            calculatorAccess: 'skill-based', // Default on error
            message: 'Error fetching settings'
        });
    }
});

// ============================================
// JOIN CLASS - Allow existing student to join a class via enrollment code
// POST /api/student/join-class
// ============================================
const EnrollmentCode = require('../models/enrollmentCode');

router.post('/join-class', isAuthenticated, isStudent, async (req, res) => {
    try {
        const studentId = req.user._id;
        const { code } = req.body;

        if (!code || typeof code !== 'string') {
            return res.status(400).json({ success: false, message: 'Class code is required.' });
        }

        const trimmedCode = code.trim().toUpperCase();

        // Find the enrollment code
        const enrollmentCode = await EnrollmentCode.findOne({ code: trimmedCode });
        if (!enrollmentCode) {
            return res.status(404).json({ success: false, message: 'Class code not found. Please check the code and try again.' });
        }

        // Validate code is usable
        const validation = enrollmentCode.isValidForUse();
        if (!validation.valid) {
            return res.status(400).json({ success: false, message: validation.reason });
        }

        // Check if already enrolled in this specific code
        const alreadyEnrolled = enrollmentCode.enrolledStudents.some(
            e => e.studentId.toString() === studentId.toString()
        );
        if (alreadyEnrolled) {
            return res.status(400).json({ success: false, message: 'You are already enrolled in this class.' });
        }

        // Get teacher info for preview/confirmation
        const teacher = await User.findById(enrollmentCode.teacherId, 'firstName lastName').lean();
        const teacherName = teacher
            ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim()
            : 'Your teacher';

        // Enroll the student
        const enrollResult = await enrollmentCode.enrollStudent(studentId, 'self-signup');
        if (!enrollResult.success) {
            return res.status(400).json({ success: false, message: enrollResult.reason });
        }

        // Update student's teacherId, class info, and subscription tier
        const updateFields = { teacherId: enrollmentCode.teacherId };
        if (enrollmentCode.mathCourse) updateFields.mathCourse = enrollmentCode.mathCourse;
        if (enrollmentCode.gradeLevel) updateFields.gradeLevel = enrollmentCode.gradeLevel;
        if (enrollmentCode.defaultSubscriptionTier && enrollmentCode.defaultSubscriptionTier !== 'free') {
            updateFields.subscriptionTier = enrollmentCode.defaultSubscriptionTier;
        }

        // Auto-propagate school license: if this teacher has a school license, give it to the student
        try {
            const teacherDoc = await User.findById(enrollmentCode.teacherId).select('schoolLicenseId').lean();
            if (teacherDoc && teacherDoc.schoolLicenseId) {
                const SchoolLicense = require('../models/schoolLicense');
                const license = await SchoolLicense.findById(teacherDoc.schoolLicenseId);
                if (license && license.isValid() && license.currentStudentCount < license.maxStudents) {
                    updateFields.schoolLicenseId = teacherDoc.schoolLicenseId;
                    license.currentStudentCount = (license.currentStudentCount || 0) + 1;
                    await license.save();
                    console.log(`[SchoolLicense] Auto-propagated to student ${studentId} via enrollment (${license.schoolName})`);
                }
            }
        } catch (licenseErr) {
            console.error('[SchoolLicense] Auto-propagation error:', licenseErr.message);
        }

        await User.findByIdAndUpdate(studentId, { $set: updateFields });

        res.json({
            success: true,
            message: `You've joined ${enrollmentCode.className || 'the class'}!`,
            className: enrollmentCode.className,
            teacherName,
            mathCourse: enrollmentCode.mathCourse || null
        });

    } catch (error) {
        console.error('Error joining class:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
});

// ============================================
// PREVIEW CLASS - Look up a class code without joining
// GET /api/student/preview-class/:code
// ============================================
router.get('/preview-class/:code', isAuthenticated, isStudent, async (req, res) => {
    try {
        const code = req.params.code.trim().toUpperCase();

        const enrollmentCode = await EnrollmentCode.findOne({ code });
        if (!enrollmentCode) {
            return res.status(404).json({ success: false, message: 'Class code not found.' });
        }

        const validation = enrollmentCode.isValidForUse();
        if (!validation.valid) {
            return res.status(400).json({ success: false, message: validation.reason });
        }

        const teacher = await User.findById(enrollmentCode.teacherId, 'firstName lastName').lean();
        const teacherName = teacher
            ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim()
            : 'Teacher';

        // Check if student is already enrolled
        const alreadyEnrolled = enrollmentCode.enrolledStudents.some(
            e => e.studentId.toString() === req.user._id.toString()
        );

        res.json({
            success: true,
            className: enrollmentCode.className,
            teacherName,
            mathCourse: enrollmentCode.mathCourse || null,
            gradeLevel: enrollmentCode.gradeLevel || null,
            alreadyEnrolled
        });

    } catch (error) {
        console.error('Error previewing class:', error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = {
    router,
    generateUniqueStudentLinkCode
};