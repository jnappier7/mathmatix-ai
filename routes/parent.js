// routes/parent.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { isParent, isAuthenticated } = require('../middleware/auth');

// Helper to generate a unique short code
function generateUniqueLinkCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) { // Generate a 6-character code
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

        // Check if an active, unused parentToChildInviteCode already exists
        if (parent.parentToChildInviteCode && parent.parentToChildInviteCode.code && !parent.parentToChildInviteCode.childLinked && parent.parentToChildInviteCode.expiresAt > new Date()) {
            return res.status(200).json({ success: true, message: "Active invite code already exists.", code: parent.parentToChildInviteCode.code, expiresAt: parent.parentToChildInviteCode.expiresAt });
        }

        let newCode;
        let codeExists = true;
        // Ensure the generated code is unique across parentToChildInviteCode fields
        while (codeExists) {
            newCode = generateUniqueLinkCode();
            const existingUserWithCode = await User.findOne({ 'parentToChildInviteCode.code': newCode });
            if (!existingUserWithCode) {
                codeExists = false;
            }
        }

        // Set code to expire in 7 days
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        parent.parentToChildInviteCode = {
            code: newCode,
            expiresAt: expiresAt,
            childLinked: false // Ensure it's marked as not yet used
        };

        await parent.save();

        res.status(201).json({ success: true, message: "Invite code generated successfully!", code: newCode, expiresAt: expiresAt });

    } catch (error) {
        console.error("ERROR: Failed to generate invite code:", error);
        res.status(500).json({ message: "Could not generate invite code." });
    }
});

// NEW Route for parents to link to an existing student using studentToParentLinkCode
router.post('/link-to-student', isAuthenticated, isParent, async (req, res) => {
    const parentId = req.user._id;
    const { studentLinkCode } = req.body; // Student's code from the frontend

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

        // Link student to parent
        student.teacherId = parent._id; // Link student's parentId to parent's _id
        parent.children = parent.children || [];
        // Ensure the child is not already in the children array to prevent duplicates
        if (!parent.children.includes(student._id)) {
            parent.children.push(student._id); // Add student to parent's children array
        }
        student.studentToParentLinkCode.parentLinked = true; // Mark code as used on the student's record
        await student.save();
        await parent.save(); // Save parent to update children array

        res.status(200).json({ success: true, message: `Successfully linked to student ${student.firstName} ${student.lastName}!` });

    } catch (error) {
        console.error("ERROR: Failed to link to student:", error);
        res.status(500).json({ message: "Could not link to student." });
    }
});


// Route to get a parent's children (existing in your old code)
router.get('/children', isAuthenticated, isParent, async (req, res) => {
    const parentId = req.user._id;
    try {
        const parent = await User.findById(parentId).populate('children');
        if (!parent) {
            return res.status(404).json({ message: "Parent not found." });
        }
        // Ensure children are populated before mapping
        const childrenData = parent.children.map(child => ({
            _id: child._id,
            firstName: child.firstName,
            lastName: child.lastName,
            username: child.username,
            gradeLevel: child.gradeLevel,
            mathCourse: child.mathCourse,
            totalActiveTutoringMinutes: child.totalActiveTutoringMinutes,
            // Only include basic fields here, detailed progress is fetched by /child/:childId/progress
        }));
        res.json(childrenData);
    } catch (error) {
        console.error("ERROR: Failed to fetch children:", error);
        res.status(500).json({ message: "Error fetching children." });
    }
});

// NEW ROUTE: Get a specific child's progress for parent dashboard
router.get('/child/:childId/progress', isAuthenticated, isParent, async (req, res) => {
    const parentId = req.user._id;
    const { childId } = req.params;

    try {
        // First, verify that the childId actually belongs to this parent
        const parent = await User.findById(parentId).populate('children');
        if (!parent || !parent.children.some(child => child._id.toString() === childId)) {
            return res.status(403).json({ message: "Forbidden: You are not authorized to view this child's progress." });
        }

        const child = await User.findById(childId);
        if (!child) {
            return res.status(404).json({ message: "Child not found." });
        }

        // Extract relevant progress data
        const progressData = {
            _id: child._id,
            firstName: child.firstName,
            lastName: child.lastName,
            level: child.level,
            xp: child.xp,
            gradeLevel: child.gradeLevel,
            mathCourse: child.mathCourse,
            totalActiveTutoringMinutes: child.totalActiveTutoringMinutes,
            // You might want to send a recent summary or a list of recent sessions
            recentSessions: child.conversations
                .filter(session => session.summary && session.messages?.length > 1) // Only sessions with summaries and actual messages
                .sort((a, b) => b.date - a.date) // Sort by most recent
                .slice(0, 5) // Get up to 5 most recent sessions
                .map(session => ({
                    date: session.date,
                    summary: session.summary,
                    duration: session.activeMinutes // Assuming activeMinutes is stored on session (from User.js)
                })),
            iepPlan: child.iepPlan || null, // Include IEP plan details
            // Add any other metrics you want to display for the child's progress
        };

        res.json(progressData);

    } catch (error) {
        console.error("ERROR: Failed to fetch child's progress:", error);
        res.status(500).json({ message: "Could not fetch child's progress." });
    }
});

module.exports = router;