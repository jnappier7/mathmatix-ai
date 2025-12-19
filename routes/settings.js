// routes/settings.js
// User account settings and profile management

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const { isAuthenticated } = require('../middleware/auth');

/**
 * @route   POST /api/settings/change-password
 * @desc    Change user password (for non-OAuth users only)
 * @access  Private (Authenticated users)
 */
router.post('/change-password', isAuthenticated, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user._id;

        // Validation
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required.'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters long.'
            });
        }

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        // Check if user is OAuth-based (no password)
        if (!user.passwordHash) {
            return res.status(400).json({
                success: false,
                message: 'You signed up with Google/Microsoft. Password changes are not available for OAuth accounts.'
            });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect.'
            });
        }

        // Update password (the pre-save hook will hash it)
        user.passwordHash = newPassword;
        await user.save();

        console.log(`[SETTINGS] Password changed for user: ${user.email}`);

        res.json({
            success: true,
            message: 'Password changed successfully.'
        });

    } catch (err) {
        console.error('Error changing password:', err);
        res.status(500).json({
            success: false,
            message: 'Server error changing password.'
        });
    }
});

/**
 * @route   GET /api/settings/account-info
 * @desc    Get basic account info (check if OAuth, etc.)
 * @access  Private (Authenticated users)
 */
router.get('/account-info', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('email googleId microsoftId passwordHash').lean();

        res.json({
            success: true,
            email: user.email,
            isOAuthAccount: !!(user.googleId || user.microsoftId),
            canChangePassword: !!user.passwordHash
        });

    } catch (err) {
        console.error('Error fetching account info:', err);
        res.status(500).json({
            success: false,
            message: 'Server error fetching account info.'
        });
    }
});

/**
 * @route   POST /api/settings/upload-retention
 * @desc    Toggle upload retention for a student
 *          Can be called by: parent (for their children), teacher (for their students), admin (for any user)
 * @access  Private (Parent/Teacher/Admin)
 */
router.post('/upload-retention', isAuthenticated, async (req, res) => {
    try {
        const { studentId, retainIndefinitely } = req.body;
        const currentUser = await User.findById(req.user._id);

        if (!currentUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        // Validation
        if (!studentId || typeof retainIndefinitely !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'Student ID and retention preference (boolean) are required.'
            });
        }

        // Get student
        const student = await User.findById(studentId);
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found.'
            });
        }

        // Authorization check
        let isAuthorized = false;
        let authReason = '';

        // Admin can set for anyone
        if (currentUser.role === 'admin') {
            isAuthorized = true;
            authReason = 'admin';
        }
        // Parent can set for their children
        else if (currentUser.role === 'parent') {
            const isParentOfStudent = currentUser.children &&
                                     currentUser.children.some(childId =>
                                         childId.toString() === studentId);
            if (isParentOfStudent) {
                isAuthorized = true;
                authReason = 'parent';
            }
        }
        // Teacher can set for their students
        else if (currentUser.role === 'teacher') {
            const isTeacherOfStudent = student.teacherId &&
                                       student.teacherId.toString() === currentUser._id.toString();
            if (isTeacherOfStudent) {
                isAuthorized = true;
                authReason = 'teacher';
            }
        }
        // Student can set for themselves (optional - remove if you don't want this)
        else if (currentUser.role === 'student' && currentUser._id.toString() === studentId) {
            isAuthorized = true;
            authReason = 'self';
        }

        if (!isAuthorized) {
            console.log(`[Upload Retention] Unauthorized attempt by ${currentUser.role} ${currentUser._id} to modify retention for student ${studentId}`);
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to modify upload retention for this student.'
            });
        }

        // Update retention setting
        student.retainUploadsIndefinitely = retainIndefinitely;
        await student.save();

        console.log(`[Upload Retention] ${currentUser.firstName} ${currentUser.lastName} (${authReason}) ${retainIndefinitely ? 'enabled' : 'disabled'} upload retention for ${student.firstName} ${student.lastName}`);

        res.json({
            success: true,
            message: `Upload retention ${retainIndefinitely ? 'enabled' : 'disabled'} for ${student.firstName} ${student.lastName}.`,
            studentName: `${student.firstName} ${student.lastName}`,
            retainIndefinitely: student.retainUploadsIndefinitely
        });

    } catch (err) {
        console.error('Error updating upload retention:', err);
        res.status(500).json({
            success: false,
            message: 'Server error updating upload retention.'
        });
    }
});

/**
 * @route   GET /api/settings/upload-retention/:studentId
 * @desc    Get upload retention status for a student
 * @access  Private (Parent/Teacher/Admin)
 */
router.get('/upload-retention/:studentId', isAuthenticated, async (req, res) => {
    try {
        const { studentId } = req.params;
        const currentUser = await User.findById(req.user._id);

        if (!currentUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        // Get student
        const student = await User.findById(studentId);
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found.'
            });
        }

        // Authorization check (same as POST)
        let isAuthorized = false;

        if (currentUser.role === 'admin') {
            isAuthorized = true;
        } else if (currentUser.role === 'parent') {
            const isParentOfStudent = currentUser.children &&
                                     currentUser.children.some(childId =>
                                         childId.toString() === studentId);
            isAuthorized = isParentOfStudent;
        } else if (currentUser.role === 'teacher') {
            const isTeacherOfStudent = student.teacherId &&
                                       student.teacherId.toString() === currentUser._id.toString();
            isAuthorized = isTeacherOfStudent;
        } else if (currentUser.role === 'student' && currentUser._id.toString() === studentId) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to view upload retention for this student.'
            });
        }

        res.json({
            success: true,
            studentName: `${student.firstName} ${student.lastName}`,
            retainIndefinitely: student.retainUploadsIndefinitely || false
        });

    } catch (err) {
        console.error('Error fetching upload retention:', err);
        res.status(500).json({
            success: false,
            message: 'Server error fetching upload retention.'
        });
    }
});

module.exports = router;
