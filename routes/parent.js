// routes/parent.js
// MODIFIED: Updated to query the 'Conversation' collection for child's progress.

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Conversation = require('../models/conversation'); // NEW: Import Conversation model
const { isParent, isAuthenticated } = require('../middleware/auth');

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

        // --- MODIFICATION START ---
        // Fetch recent conversation summaries from the new 'Conversation' collection.
        const recentSessions = await Conversation.find({ userId: childId })
            .sort({ lastActivity: -1 })
            .limit(5)
            .select('summary date activeMinutes');
        // --- MODIFICATION END ---

        const progressData = {
            _id: child._id,
            firstName: child.firstName,
            lastName: child.lastName,
            level: child.level,
            xp: child.xp,
            gradeLevel: child.gradeLevel,
            mathCourse: child.mathCourse,
            totalActiveTutoringMinutes: child.totalActiveTutoringMinutes,
            recentSessions: recentSessions.map(session => ({
                date: session.date,
                summary: session.summary,
                duration: session.activeMinutes
            })),
            iepPlan: child.iepPlan || null,
        };

        res.json(progressData);

    } catch (error) {
        console.error("ERROR: Failed to fetch child's progress:", error);
        res.status(500).json({ message: "Could not fetch child's progress." });
    }
});

module.exports = router;