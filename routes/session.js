// routes/session.js
// Session management endpoints

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const logger = require('../utils/logger').child({ service: 'session-routes' });
const {
  endSession,
  recordHeartbeat,
  saveMasteryProgress
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
 */
router.post('/end', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const sessionId = req.sessionID;
    const { reason, sessionData } = req.body;

    const summary = await endSession(userId, sessionId, reason, sessionData);

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

module.exports = router;
