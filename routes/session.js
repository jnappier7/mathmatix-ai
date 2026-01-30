// routes/session.js
// Session management endpoints

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const logger = require('../utils/logger').child({ service: 'session-routes' });
const {
  endSession,
  recordHeartbeat,
  saveMasteryProgress,
  cleanupStaleSessions
} = require('../services/sessionService');

/**
 * POST /api/session/heartbeat
 * Record session activity (called every 30 seconds from frontend)
 */
router.post('/heartbeat', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const sessionId = req.sessionID;
    const { metrics } = req.body;

    const result = await recordHeartbeat(userId, sessionId, metrics);

    res.json(result);
  } catch (error) {
    logger.error('Heartbeat error', { error, userId: req.user?._id });
    res.status(500).json({ error: 'Failed to record heartbeat' });
  }
});

/**
 * POST /api/session/end
 * End session and generate summary
 * Handles both regular JSON requests and sendBeacon (text/plain)
 */
router.post('/end', async (req, res) => {
  try {
    // Handle sendBeacon which sends as text/plain
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        logger.warn('Failed to parse session end body as JSON');
      }
    }

    // Try to get user from session (regular requests) or skip if sendBeacon
    let userId = req.user?._id?.toString();

    // If no authenticated user, try to extract from the request or session
    if (!userId && req.session?.passport?.user) {
      userId = req.session.passport.user;
    }

    if (!userId) {
      // For sendBeacon without auth, just acknowledge
      return res.json({ success: true, message: 'Acknowledged' });
    }

    const sessionId = req.sessionID;
    const { reason, sessionData } = body || {};

    const summary = await endSession(userId, sessionId, reason || 'unknown', sessionData || {});

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    logger.error('Session end error', { error, userId: req.user?._id });
    res.status(500).json({ error: 'Failed to end session' });
  }
});

/**
 * POST /api/session/save-mastery
 * Save mastery progress (called on logout/timeout)
 */
router.post('/save-mastery', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { progressData } = req.body;

    const success = await saveMasteryProgress(userId, progressData);

    res.json({ success });
  } catch (error) {
    logger.error('Save mastery error', { error, userId: req.user?._id });
    res.status(500).json({ error: 'Failed to save mastery progress' });
  }
});

/**
 * POST /api/session/cleanup-stale
 * Clean up stale sessions (can be called manually or by cron)
 */
router.post('/cleanup-stale', isAuthenticated, async (req, res) => {
  try {
    // Only allow admins or run as system task
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const cleaned = await cleanupStaleSessions(60); // 1 hour threshold

    res.json({
      success: true,
      cleanedSessions: cleaned
    });
  } catch (error) {
    logger.error('Cleanup stale sessions error', { error });
    res.status(500).json({ error: 'Failed to cleanup stale sessions' });
  }
});

// Throttled cleanup - runs at most once every 5 minutes
let lastCleanupTime = 0;
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function throttledCleanup() {
  const now = Date.now();
  if (now - lastCleanupTime > CLEANUP_INTERVAL) {
    lastCleanupTime = now;
    // Run cleanup in background, don't wait
    cleanupStaleSessions(60).catch(err => {
      logger.error('Background cleanup failed', { error: err });
    });
  }
}

// Export throttledCleanup for use in other routes
router.throttledCleanup = throttledCleanup;

module.exports = router;
