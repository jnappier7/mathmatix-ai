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
  cleanupStaleSessions,
  destroyIdleExpressSessions
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

    // Run cleanup in background (throttled to once per 5 min)
    // This ensures stale sessions from other users get cleaned up
    throttledCleanup();

    res.json(result);
  } catch (error) {
    logger.error('Heartbeat error', { error, userId: req.user?._id });
    res.status(500).json({ error: 'Failed to record heartbeat' });
  }
});

/**
 * POST /api/session/end
 * End session and generate summary
 * Handles both regular JSON requests and sendBeacon (text/plain or application/json)
 * When destroySession=true, also destroys the express session (used by auto-logout and tab close)
 */
router.post('/end', async (req, res) => {
  try {
    // Handle sendBeacon which may send as text/plain
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        logger.warn('Failed to parse session end body as JSON');
        body = {};
      }
    }

    // Try to get user from session (regular requests) or passport session data
    let userId = req.user?._id?.toString();

    // If no authenticated user, try to extract from the session passport data
    if (!userId && req.session?.passport?.user) {
      userId = req.session.passport.user;
    }

    if (!userId) {
      // For sendBeacon without auth, just acknowledge
      return res.json({ success: true, message: 'Acknowledged' });
    }

    const sessionId = req.sessionID;
    const { reason, sessionData, destroySession } = body || {};

    const summary = await endSession(userId, sessionId, reason || 'unknown', sessionData || {});

    // If destroySession is requested (auto-logout, tab close, browser close),
    // destroy the express session to actually log the user out server-side.
    if (destroySession) {
      try {
        // Clear the session cookie
        res.clearCookie('connect.sid');

        // Destroy the session in MongoDB
        await new Promise((resolve, reject) => {
          req.session.destroy((err) => {
            if (err) {
              logger.error('Failed to destroy session on end', { error: err, userId });
              reject(err);
            } else {
              resolve();
            }
          });
        });

        logger.info('Express session destroyed on session end', { userId, reason });
      } catch (destroyError) {
        logger.error('Error destroying express session', { error: destroyError, userId });
        // Still return success for the session summary even if destroy fails
      }
    }

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
 * Handles both regular JSON requests and sendBeacon (CSRF-exempt).
 * Accepts either { progressData } or { masteryProgress } in the body.
 */
router.post('/save-mastery', async (req, res) => {
  try {
    let userId = req.user?._id?.toString();
    if (!userId && req.session?.passport?.user) {
      userId = req.session.passport.user;
    }

    if (!userId) {
      return res.json({ success: true, message: 'Acknowledged' });
    }

    // Accept both property names (progressData from csrfFetch, masteryProgress from sendBeacon)
    const progressData = req.body.progressData || req.body.masteryProgress;

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

    const cleaned = await cleanupStaleSessions(30); // 30 min threshold

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
    // Run both cleanup tasks in background, don't wait
    cleanupStaleSessions(30).catch(err => {
      logger.error('Background conversation cleanup failed', { error: err });
    });
    // Also destroy idle express sessions (auth sessions with no recent heartbeat).
    // Uses 35 min to give a small buffer beyond the 30-min client-side timeout.
    destroyIdleExpressSessions(35).catch(err => {
      logger.error('Background idle session destruction failed', { error: err });
    });
  }
}

// Export throttledCleanup for use in other routes
router.throttledCleanup = throttledCleanup;

module.exports = router;
