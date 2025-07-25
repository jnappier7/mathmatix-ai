// routes/student.js - PHASE 1: Backend Routing & Core Setup - Batch 2
// Handles student-specific API actions.

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { isAuthenticated, isStudent } = require('../middleware/auth'); // Import isStudent middleware
const crypto = require('crypto'); // Node.js built-in module for cryptography

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
        const student = await User.findById(req.user._id).select('teacherId').populate('teacherId', 'firstName lastName username role');
        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }

        if (student.teacherId && student.teacherId.role === 'parent') {
            res.json({
                isLinked: true,
                parentId: student.teacherId._id,
                parentName: `${student.teacherId.firstName} ${student.teacherId.lastName}`
            });
        } else {
            res.json({ isLinked: false, message: 'Not linked to a parent account.' });
        }
    } catch (error) {
        console.error("ERROR: Failed to check linked parent status:", error);
        res.status(500).json({ message: "Server error checking link status." });
    }
});

module.exports = router;