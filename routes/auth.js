// routes/auth.js
// Authentication routes: email verification, resend verification, OAuth enrollment

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/user');
const EnrollmentCode = require('../models/enrollmentCode');
const { sendEmailVerification } = require('../utils/emailService');
const { generateUniqueStudentLinkCode } = require('./student');
const logger = require('../utils/logger').child({ route: 'auth' });

// Cooldown between successive verification-email resends to the same address.
// Prevents abuse / accidental double-clicks from blasting users' inboxes.
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

/**
 * GET /api/auth/verify-email
 * Verify user's email address via token
 */
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.redirect('/email-verification.html?status=missing_token');
    }

    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with matching token that hasn't expired
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.redirect('/email-verification.html?status=invalid');
    }

    // Mark email as verified
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    logger.info('Email verified', { userId: user._id.toString() });

    // Redirect to success page
    return res.redirect('/email-verification.html?status=success');

  } catch (error) {
    logger.error('Email verification failed', { error: error.message });
    return res.redirect('/email-verification.html?status=error');
  }
});

/**
 * POST /api/auth/resend-verification
 * Resend verification email to user
 */
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Don't reveal if user exists - always return success
      return res.json({ success: true, message: 'If this email exists, a verification email has been sent.' });
    }

    if (user.emailVerified) {
      return res.json({ success: true, message: 'Email is already verified. You can log in.' });
    }

    // Per-user cooldown — prevent users (or bots) from spamming the inbox.
    // We infer the last-send time from the existing token's expiry: every
    // resend bumps emailVerificationExpires to now + 24h, so anything within
    // (24h - cooldown) of that is too soon.
    const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
    if (user.emailVerificationExpires) {
      const lastSentAt = user.emailVerificationExpires.getTime() - TOKEN_TTL_MS;
      const elapsed = Date.now() - lastSentAt;
      if (elapsed >= 0 && elapsed < RESEND_COOLDOWN_MS) {
        const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({
          success: false,
          message: `Please wait ${retryAfter} second${retryAfter === 1 ? '' : 's'} before requesting another verification email.`,
          retryAfter
        });
      }
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpires = new Date(Date.now() + TOKEN_TTL_MS);
    await user.save();

    // Send verification email
    const result = await sendEmailVerification(user.email, user.firstName, verificationToken);

    if (result.success) {
      logger.info('Verification email resent', { userId: user._id.toString() });
      return res.json({ success: true, message: 'Verification email sent. Please check your inbox.' });
    } else {
      logger.error('Failed to resend verification email', { userId: user._id.toString(), error: result.error });
      return res.status(500).json({ success: false, message: 'Failed to send verification email. Please try again.' });
    }

  } catch (error) {
    logger.error('Resend verification failed', { error: error.message });
    return res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
  }
});

/**
 * GET /api/auth/verification-status
 * Check if current user's email is verified (for logged in users)
 */
router.get('/verification-status', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  return res.json({
    success: true,
    emailVerified: req.user.emailVerified || false,
    email: req.user.email
  });
});

/**
 * GET /api/auth/pending-oauth
 * Get pending OAuth profile info (for enrollment page)
 */
router.get('/pending-oauth', (req, res) => {
  if (!req.session.pendingOAuthProfile) {
    return res.status(404).json({ success: false, message: 'No pending OAuth signup' });
  }

  const { provider, email, firstName, lastName } = req.session.pendingOAuthProfile;
  return res.json({
    success: true,
    provider,
    email,
    firstName,
    lastName
  });
});

/**
 * POST /api/auth/complete-oauth-enrollment
 * Complete OAuth signup with enrollment code
 */
router.post('/complete-oauth-enrollment', async (req, res) => {
  try {
    const { enrollmentCode } = req.body;
    const pendingProfile = req.session.pendingOAuthProfile;

    if (!pendingProfile) {
      return res.status(400).json({
        success: false,
        message: 'No pending OAuth signup. Please start over.'
      });
    }

    if (!enrollmentCode) {
      return res.status(400).json({
        success: false,
        message: 'Enrollment code is required.'
      });
    }

    // Validate enrollment code
    const enrollmentCodeDoc = await EnrollmentCode.findOne({
      code: enrollmentCode.toUpperCase().trim()
    });

    // Check ENROLLMENT_CODES env var as fallback for open registration codes
    const envCodes = process.env.ENROLLMENT_CODES;
    const isEnvCode = envCodes && envCodes.split(',').map(c => c.trim().toUpperCase()).includes(enrollmentCode.toUpperCase().trim());

    if (!enrollmentCodeDoc && !isEnvCode) {
      return res.status(400).json({
        success: false,
        message: 'Invalid enrollment code. Please check with your teacher.'
      });
    }

    if (enrollmentCodeDoc) {
      const validation = enrollmentCodeDoc.isValidForUse();
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.reason
        });
      }
    }

    // Generate unique username
    const baseUsername = pendingProfile.displayName.replace(/\s+/g, '').toLowerCase();
    let username = baseUsername;
    let existingUser = await User.findOne({ username });
    if (existingUser) {
      const suffix = pendingProfile.providerId.substring(0, 6);
      username = `${baseUsername}_${suffix}`;
    }

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

    // Create new user
    const newUser = new User({
      username,
      email: pendingProfile.email,
      [pendingProfile.provider === 'google' ? 'googleId' : pendingProfile.provider === 'microsoft' ? 'microsoftId' : 'cleverId']: pendingProfile.providerId,
      role: pendingProfile.role || 'student',
      firstName: pendingProfile.firstName,
      lastName: pendingProfile.lastName,
      needsProfileCompletion: pendingProfile.needsFix,
      avatar: pendingProfile.avatar,
      // Email verification
      emailVerified: true, // OAuth emails are pre-verified by the provider
      // Teacher assignment and tier from enrollment code (only if DB code, not env code)
      ...(enrollmentCodeDoc ? {
        teacherId: enrollmentCodeDoc.teacherId,
        gradeLevel: enrollmentCodeDoc.gradeLevel,
        mathCourse: enrollmentCodeDoc.mathCourse,
        ...(enrollmentCodeDoc.defaultSubscriptionTier && enrollmentCodeDoc.defaultSubscriptionTier !== 'free'
          ? { subscriptionTier: enrollmentCodeDoc.defaultSubscriptionTier } : {}),
      } : {}),
      linkCode: await generateUniqueStudentLinkCode()
    });

    await newUser.save();
    logger.info('OAuth user created with enrollment code', { userId: newUser._id.toString() });

    // Record enrollment (only for DB-based codes, not env-based)
    if (enrollmentCodeDoc) {
      try {
        await enrollmentCodeDoc.enrollStudent(newUser._id, 'oauth-signup');
        logger.info('Student enrolled via code', { userId: newUser._id.toString(), enrollmentCodeId: enrollmentCodeDoc._id.toString() });
      } catch (enrollError) {
        logger.error('Failed to record enrollment', { userId: newUser._id.toString(), error: enrollError.message });
      }
    }

    // Trigger Clever roster sync for new Clever users (non-blocking)
    if (pendingProfile.provider === 'clever' && pendingProfile.accessToken) {
      try {
        const { syncOnLogin } = require('../services/cleverSync');
        const syncResult = await syncOnLogin(pendingProfile.accessToken, newUser);
        logger.info('Post-enrollment Clever sync complete', { userId: newUser._id.toString(), sectionsProcessed: syncResult.stats.sectionsProcessed });
      } catch (syncErr) {
        logger.warn('Post-enrollment Clever sync failed (non-fatal)', { userId: newUser._id.toString(), error: syncErr.message });
      }
    }

    // Set lastLogin on first OAuth signup auto-login
    try {
      await User.findByIdAndUpdate(newUser._id, { lastLogin: new Date() });
    } catch (updateErr) {
      logger.error('Failed to update lastLogin on OAuth signup', { userId: newUser._id.toString(), error: updateErr.message });
    }

    // Clear pending profile from session
    delete req.session.pendingOAuthProfile;

    // Log the user in
    req.logIn(newUser, (err) => {
      if (err) {
        logger.error('Failed to log in OAuth user after enrollment', { userId: newUser._id.toString(), error: err.message });
        return res.status(500).json({
          success: false,
          message: 'Account created but login failed. Please try logging in.'
        });
      }

      // Determine redirect
      let redirect = '/complete-profile.html';
      if (!newUser.needsProfileCompletion) {
        redirect = '/pick-tutor.html';
      }

      logger.info('OAuth user logged in after enrollment', { userId: newUser._id.toString(), redirect });

      // Persist session to MongoDB before responding to prevent race condition
      req.session.save((saveErr) => {
        if (saveErr) {
          logger.error('Failed to save session after OAuth enrollment', { userId: newUser._id.toString(), error: saveErr.message });
          return res.status(500).json({
            success: false,
            message: 'Account created but session save failed. Please try logging in.'
          });
        }
        return res.json({
          success: true,
          message: 'Account created successfully!',
          redirect
        });
      });
    });

  } catch (error) {
    logger.error('Complete OAuth enrollment failed', { error: error.message });

    // Handle duplicate key errors
    if (error.code === 11000) {
      if (error.keyPattern?.username) {
        return res.status(409).json({ success: false, message: 'Username already taken.' });
      }
      if (error.keyPattern?.email) {
        return res.status(409).json({ success: false, message: 'Email already registered.' });
      }
    }

    return res.status(500).json({
      success: false,
      message: 'An error occurred. Please try again.'
    });
  }
});

/**
 * POST /api/auth/cancel-oauth-enrollment
 * Cancel pending OAuth signup
 */
router.post('/cancel-oauth-enrollment', (req, res) => {
  if (req.session.pendingOAuthProfile) {
    delete req.session.pendingOAuthProfile;
  }
  return res.json({ success: true, message: 'OAuth signup cancelled.' });
});

module.exports = router;
