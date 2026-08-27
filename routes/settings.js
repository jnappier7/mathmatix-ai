// routes/settings.js
// User account settings and profile management

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/user');
const { isAuthenticated } = require('../middleware/auth');
const logger = require('../utils/logger');
const { uploadRetentionAccess } = require('../utils/uploadRetentionAccess');

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

        logger.info('[SETTINGS] Password changed', { userId: user._id?.toString() });

        // Invalidate all other sessions for this user so stolen sessions can't persist
        try {
            const sessionCollection = mongoose.connection.collection('sessions');
            const currentSessionId = req.sessionID;
            await sessionCollection.deleteMany({
                'session.passport.user': user._id.toString(),
                _id: { $ne: currentSessionId }
            });
            logger.info('[SETTINGS] Other sessions invalidated after password change', { userId: user._id?.toString() });
        } catch (sessionErr) {
            logger.error('[SETTINGS] Failed to invalidate sessions', { error: sessionErr.message });
        }

        res.json({
            success: true,
            message: 'Password changed successfully.'
        });

    } catch (err) {
        logger.error('[SETTINGS] Error changing password', { error: err.message });
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
        logger.error('[SETTINGS] Error fetching account info', { error: err.message });
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

        // Authorization check — the rule lives in utils/uploadRetentionAccess.js
        // so this endpoint and the GET below cannot drift apart, and so it can
        // be tested without express. It matches on the roles the actor HOLDS
        // rather than `currentUser.role`, the dashboard they have open
        // (CLAUDE.md §12).
        const { allowed: isAuthorized, reason: authReason } =
            uploadRetentionAccess(currentUser, student, studentId);

        if (!isAuthorized) {
            logger.warn('[Upload Retention] Unauthorized attempt', { role: currentUser.role, userId: currentUser._id?.toString(), studentId });
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to modify upload retention for this student.'
            });
        }

        // Update retention setting
        student.retainUploadsIndefinitely = retainIndefinitely;
        await student.save();

        logger.info('[Upload Retention] Setting changed', { by: currentUser._id?.toString(), authReason, studentId, retainIndefinitely });

        res.json({
            success: true,
            message: `Upload retention ${retainIndefinitely ? 'enabled' : 'disabled'} for ${student.firstName} ${student.lastName}.`,
            studentName: `${student.firstName} ${student.lastName}`,
            retainIndefinitely: student.retainUploadsIndefinitely
        });

    } catch (err) {
        logger.error('[Upload Retention] Error updating', { error: err.message });
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

        // Authorization check — literally the same rule as the POST now, rather
        // than a second copy of it.
        const { allowed: isAuthorized } =
            uploadRetentionAccess(currentUser, student, studentId);

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
        logger.error('[Upload Retention] Error fetching', { error: err.message });
        res.status(500).json({
            success: false,
            message: 'Server error fetching upload retention.'
        });
    }
});

module.exports = router;
