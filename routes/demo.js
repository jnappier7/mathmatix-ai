// routes/demo.js
// Handles playground/demo account login and state reset.
// Each visitor gets an isolated clone — concurrent users never interfere.

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { createDemoClone, cleanupDemoClone, resetDemoClone } = require('../utils/demoClone');
const { DEMO_PROFILES } = require('../utils/demoData');
const logger = require('../utils/logger');

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
 * One-click login as a demo account.
 * Creates a per-session clone so concurrent visitors never conflict.
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

    // If already in a demo session, clean up the previous clone first
    if (req.isAuthenticated() && req.session.isDemo && req.session.cloneSessionId) {
      const oldSessionId = req.session.cloneSessionId;
      await new Promise((resolve, reject) => {
        req.logout((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      // Clean up old clone in background
      cleanupDemoClone(oldSessionId).catch(err =>
        logger.error('[Demo] Old clone cleanup error:', err)
      );
    } else if (req.isAuthenticated()) {
      // Non-demo session — just log out
      await new Promise((resolve, reject) => {
        req.logout((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    // Create an isolated clone for this session
    logger.info(`[Demo] Creating clone for profile: ${profileId}`);
    const { user, cloneSessionId } = await createDemoClone(profileId);

    // Log the cloned user in
    await new Promise((resolve, reject) => {
      req.logIn(user, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Mark session as demo with clone tracking
    req.session.isDemo = true;
    req.session.demoProfileId = profileId;
    req.session.cloneSessionId = cloneSessionId;

    // Update lastLogin
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    logger.info(`[Demo] Clone login successful: ${profileId} (session ${cloneSessionId})`);

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
 * Manually reset the current demo session (without logging out).
 * Deletes the old clone and creates a fresh one — "Start Over" button.
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
    const oldCloneSessionId = req.session.cloneSessionId;
    if (!profileId) {
      return res.status(400).json({ success: false, message: 'No demo profile in session.' });
    }

    logger.info(`[Demo] Reset requested for: ${profileId} (session ${oldCloneSessionId})`);

    // Create fresh clone (this also cleans up the old one)
    const { user, cloneSessionId } = await resetDemoClone(oldCloneSessionId, profileId);

    // Re-login as the new clone
    await new Promise((resolve, reject) => {
      req.logIn(user, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Update session with new clone ID
    req.session.cloneSessionId = cloneSessionId;

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
