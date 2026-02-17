// routes/demo.js
// Handles playground/demo account login and state reset.
// Demo accounts are one-click login (no password required) and reset on logout.

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { resetDemoAccount } = require('../utils/demoReset');
const { DEMO_PROFILES } = require('../utils/demoData');
const logger = require('../utils/logger');

// Map demoProfileId → username for login
const PROFILE_TO_USERNAME = {
  'teacher-rivera':  'demo-teacher',
  'parent-chen':     'demo-parent',
  'student-maya':    'demo-student-maya',
  'student-alex':    'demo-student-alex',
  'student-jordan':  'demo-student-jordan',
};

/**
 * GET /api/demo/profiles
 * Returns available demo profiles for the selection page.
 */
router.get('/profiles', (req, res) => {
  res.json({
    success: true,
    profiles: DEMO_PROFILES
  });
});

/**
 * POST /api/demo/login
 * One-click login as a demo account. Resets the account to initial state first.
 *
 * Body: { profileId: 'teacher-rivera' }
 */
router.post('/login', async (req, res) => {
  try {
    const { profileId } = req.body;

    if (!profileId || !DEMO_PROFILES[profileId]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid demo profile. Available profiles: ' + Object.keys(DEMO_PROFILES).join(', ')
      });
    }

    const username = PROFILE_TO_USERNAME[profileId];
    if (!username) {
      return res.status(400).json({ success: false, message: 'Demo profile not configured.' });
    }

    // 1. Reset the demo account to its initial state
    logger.info(`[Demo] Resetting playground account: ${profileId}`);
    const resetOk = await resetDemoAccount(profileId);
    if (!resetOk) {
      return res.status(500).json({
        success: false,
        message: 'Failed to reset demo account. Please try again or contact support.'
      });
    }

    // 2. Find the freshly-reset user
    const user = await User.findOne({ username, isDemo: true });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Demo account not found. Please run the playground seed script first.'
      });
    }

    // 3. If there's an existing session, destroy it first
    if (req.isAuthenticated()) {
      await new Promise((resolve, reject) => {
        req.logout((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    // 4. Log the user in
    await new Promise((resolve, reject) => {
      req.logIn(user, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Mark session as demo for the banner and logout reset
    req.session.isDemo = true;
    req.session.demoProfileId = profileId;

    // Update lastLogin
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    logger.info(`[Demo] Playground login successful: ${profileId} (${user.username})`);

    // Determine redirect
    const profile = DEMO_PROFILES[profileId];
    const dashboardMap = {
      teacher: '/teacher-dashboard.html',
      parent: '/parent-dashboard.html',
      student: '/chat.html',
    };
    const redirectUrl = dashboardMap[profile.role] || '/chat.html';

    res.json({
      success: true,
      message: `Welcome to the ${profile.label} demo!`,
      redirect: redirectUrl,
      profile: {
        profileId,
        name: profile.name,
        role: profile.role,
        label: profile.label
      }
    });

  } catch (error) {
    logger.error('[Demo] Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start demo. Please try again.'
    });
  }
});

/**
 * POST /api/demo/reset
 * Manually reset the current demo account (without logging out).
 * Useful for a "Start Over" button in the demo banner.
 */
router.post('/reset', async (req, res) => {
  try {
    if (!req.isAuthenticated() || !req.session.isDemo) {
      return res.status(403).json({
        success: false,
        message: 'Not in a demo session.'
      });
    }

    const profileId = req.session.demoProfileId;
    if (!profileId) {
      return res.status(400).json({ success: false, message: 'No demo profile in session.' });
    }

    logger.info(`[Demo] Manual reset requested for: ${profileId}`);
    const resetOk = await resetDemoAccount(profileId);

    if (!resetOk) {
      return res.status(500).json({ success: false, message: 'Reset failed.' });
    }

    res.json({
      success: true,
      message: 'Demo account has been reset to its initial state.',
      profileId
    });

  } catch (error) {
    logger.error('[Demo] Reset error:', error);
    res.status(500).json({ success: false, message: 'Reset failed.' });
  }
});

/**
 * GET /api/demo/status
 * Check if the current session is a demo session.
 */
router.get('/status', (req, res) => {
  const isDemo = !!(req.session && req.session.isDemo);
  const profileId = req.session?.demoProfileId || null;
  const profile = profileId ? DEMO_PROFILES[profileId] : null;

  res.json({
    isDemo,
    profileId,
    profile: profile ? {
      name: profile.name,
      role: profile.role,
      label: profile.label,
      description: profile.description
    } : null
  });
});

module.exports = router;
