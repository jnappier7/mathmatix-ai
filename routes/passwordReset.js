// routes/passwordReset.js
// Password reset functionality

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/user');
const { sendPasswordResetEmail } = require('../utils/emailService');
const logger = require('../utils/logger');

/**
 * POST /api/password-reset/request
 * Request a password reset - sends email with reset token
 */
router.post('/request', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return success to prevent email enumeration
    // Even if user doesn't exist, we return success but don't send email
    if (!user) {
      logger.debug('[PasswordReset] Requested for non-existent email');
      return res.json({
        success: true,
        message: 'If an account exists with that email, a password reset link has been sent.'
      });
    }

    // Check if user has a password (not OAuth-only account)
    if (!user.passwordHash && (user.googleId || user.microsoftId)) {
      logger.debug('[PasswordReset] Requested for OAuth-only account');
      return res.json({
        success: true,
        message: 'If an account exists with that email, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Save hashed token and expiry (1 hour from now)
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send reset email
    const emailResult = await sendPasswordResetEmail(user.email, resetToken);

    if (!emailResult.success) {
      logger.error('[PasswordReset] Failed to send email', { error: emailResult.error });
      return res.status(500).json({
        success: false,
        message: 'Failed to send password reset email. Please try again later.'
      });
    }

    logger.info('[PasswordReset] Email sent', { userId: user._id?.toString() });

    res.json({
      success: true,
      message: 'If an account exists with that email, a password reset link has been sent.'
    });
  } catch (error) {
    logger.error('[PasswordReset] Error requesting reset', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'An error occurred. Please try again later.'
    });
  }
});

/**
 * GET /api/password-reset/verify/:token
 * Verify if a reset token is valid
 */
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Reset token is required'
      });
    }

    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Password reset token is invalid or has expired'
      });
    }

    res.json({
      success: true,
      message: 'Token is valid',
      email: user.email
    });
  } catch (error) {
    logger.error('[PasswordReset] Error verifying token', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'An error occurred. Please try again later.'
    });
  }
});

/**
 * POST /api/password-reset/reset
 * Reset password with valid token
 */
router.post('/reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Password reset token is invalid or has expired'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password and clear reset token
    user.passwordHash = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Invalidate all sessions for this user (password was reset, old sessions are suspect)
    try {
        const sessionCollection = mongoose.connection.collection('sessions');
        await sessionCollection.deleteMany({
            'session.passport.user': user._id.toString()
        });
        logger.info('[PasswordReset] All sessions invalidated', { userId: user._id?.toString() });
    } catch (sessionErr) {
        logger.error('[PasswordReset] Failed to invalidate sessions', { error: sessionErr.message });
    }

    logger.info('[PasswordReset] Password reset successful', { userId: user._id?.toString() });

    res.json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.'
    });
  } catch (error) {
    logger.error('[PasswordReset] Error resetting password', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'An error occurred. Please try again later.'
    });
  }
});

module.exports = router;
