// routes/auth.js
// Authentication routes: email verification, resend verification, OAuth enrollment

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/user');
const EnrollmentCode = require('../models/enrollmentCode');
const { sendEmailVerification } = require('../utils/emailService');
const { generateUniqueStudentLinkCode } = require('./student');

/**
 * GET /api/auth/verify-email
 * Verify user's email address via token
 */
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.redirect('/email-verification.html?status=error&message=Missing verification token');
    }

    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with matching token that hasn't expired
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.redirect('/email-verification.html?status=error&message=Invalid or expired verification link');
    }

    // Mark email as verified
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    console.log(`LOG: Email verified for user ${user.username}`);

    // Redirect to success page
    return res.redirect('/email-verification.html?status=success');

  } catch (error) {
    console.error('ERROR: Email verification failed:', error);
    return res.redirect('/email-verification.html?status=error&message=Verification failed. Please try again.');
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

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await user.save();

    // Send verification email
    const result = await sendEmailVerification(user.email, user.firstName, verificationToken);

    if (result.success) {
      console.log(`LOG: Verification email resent to ${user.email}`);
      return res.json({ success: true, message: 'Verification email sent. Please check your inbox.' });
    } else {
      console.error('ERROR: Failed to resend verification email:', result.error);
      return res.status(500).json({ success: false, message: 'Failed to send verification email. Please try again.' });
    }

  } catch (error) {
    console.error('ERROR: Resend verification failed:', error);
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

    if (!enrollmentCodeDoc) {
      return res.status(400).json({
        success: false,
        message: 'Invalid enrollment code. Please check with your teacher.'
      });
    }

    const validation = enrollmentCodeDoc.isValidForUse();
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.reason
      });
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
      [pendingProfile.provider === 'google' ? 'googleId' : 'microsoftId']: pendingProfile.providerId,
      role: 'student',
      firstName: pendingProfile.firstName,
      lastName: pendingProfile.lastName,
      needsProfileCompletion: pendingProfile.needsFix,
      avatar: pendingProfile.avatar,
      // Email verification
      emailVerified: true, // OAuth emails are pre-verified by the provider
      // Teacher assignment from enrollment code
      teacherId: enrollmentCodeDoc.teacherId,
      gradeLevel: enrollmentCodeDoc.gradeLevel,
      mathCourse: enrollmentCodeDoc.mathCourse,
      linkCode: await generateUniqueStudentLinkCode()
    });

    await newUser.save();
    console.log(`LOG: OAuth user ${newUser.username} created with enrollment code ${enrollmentCode}`);

    // Record enrollment
    try {
      await enrollmentCodeDoc.enrollStudent(newUser._id, 'oauth-signup');
      console.log(`LOG: Student ${newUser.username} enrolled via code ${enrollmentCodeDoc.code}`);
    } catch (enrollError) {
      console.error('ERROR: Failed to record enrollment:', enrollError);
    }

    // Clear pending profile from session
    delete req.session.pendingOAuthProfile;

    // Log the user in
    req.logIn(newUser, (err) => {
      if (err) {
        console.error('ERROR: Failed to log in OAuth user after enrollment:', err);
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

      console.log(`LOG: OAuth user ${newUser.username} logged in, redirecting to ${redirect}`);
      return res.json({
        success: true,
        message: 'Account created successfully!',
        redirect
      });
    });

  } catch (error) {
    console.error('ERROR: Complete OAuth enrollment failed:', error);

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
