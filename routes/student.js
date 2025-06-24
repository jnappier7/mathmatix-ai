// routes/student.js - MODIFIED (ENSURE JSON RESPONSE CONSISTENCY)
const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { isAuthenticated } = require('../middleware/auth');
const crypto = require('crypto'); // Node.js built-in module for cryptography

// Helper function to generate a unique code
async function generateUniqueCode() {
    let code;
    let isUnique = false;
    while (!isUnique) {
        // Generate a random 3-byte hex string (6 characters)
        code = crypto.randomBytes(3).toString('hex').toUpperCase();
        // Check if this code already exists for any user as an inviteCode
        const existingUser = await User.findOne({ 'inviteCode.code': `MATH-${code}` });
        if (!existingUser) {
            isUnique = true;
        }
    }
    return `MATH-${code}`; // Prefix for readability
}

// POST /api/student/generate-invite-code
// Only students can generate an invite code for their parents.
router.post('/generate-invite-code', isAuthenticated, async (req, res) => {
    // Ensure the logged-in user is a student
    if (!req.user || req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Forbidden: Only students can generate invite codes.' }); // [FIXED] Consistent JSON response
    }

    try {
        const student = await User.findById(req.user._id);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student account not found.' }); // [FIXED] Consistent JSON response
        }

        // Check if an active invite code already exists for this student
        if (student.inviteCode && student.inviteCode.code && student.inviteCode.expiresAt > Date.now()) {
            console.log(`LOG: Returning existing invite code for student ${student.username}`);
            // [FIXED] Ensure success: true is always present
            return res.json({ success: true, code: student.inviteCode.code, message: 'An active code already exists.', expiresAt: student.inviteCode.expiresAt });
        }

        const newInviteCode = await generateUniqueCode();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Valid for 24 hours from now

        // Store the new invite code on the student's user object
        student.inviteCode = {
            code: newInviteCode,
            expiresAt: expiresAt,
            parentLinked: false // Reset this flag for a new code
        };
        await student.save();

        console.log(`LOG: Generated new invite code: ${newInviteCode} for student ${student.username}`);
        res.json({ success: true, code: newInviteCode, expiresAt: expiresAt, message: 'New invite code generated.' });

    } catch (err) {
        console.error('ERROR: Failed to generate invite code:', err);
        res.status(500).json({ success: false, message: 'Server error generating invite code.' }); // [FIXED] Consistent JSON response
    }
});

module.exports = router;