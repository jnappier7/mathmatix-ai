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

module.exports = router;
