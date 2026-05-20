/**
 * NUDGE ROUTES
 *
 * Surfaces system-driven prompts (starting-point screener, growth check)
 * to the client, and accepts dismissals so the cooldown can apply.
 *
 * Mounted at /api/nudges from config/routes.js, behind isAuthenticated.
 */

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { computeNudges, NUDGE_TYPES } = require('../utils/userNudges');

const VALID_TYPES = new Set(Object.values(NUDGE_TYPES));

/**
 * GET /api/nudges
 * Returns the set of nudges this user should see right now.
 */
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const nudges = computeNudges(user);

    // Stamp promptedAt so we have a record of when we showed each nudge.
    // Cheap to write — bounded set of nudge types, runs once per page load.
    if (nudges.length > 0) {
      if (!user.nudgeState) user.nudgeState = {};
      const now = new Date();
      for (const nudge of nudges) {
        const key = nudge.type === NUDGE_TYPES.STARTING_POINT ? 'screener' : 'growthCheck';
        if (!user.nudgeState[key]) user.nudgeState[key] = {};
        user.nudgeState[key].promptedAt = now;
      }
      user.markModified('nudgeState');
      await user.save();
    }

    res.json({ success: true, nudges });
  } catch (err) {
    console.error('[nudges] GET error:', err);
    res.status(500).json({ error: 'Failed to compute nudges' });
  }
});

/**
 * POST /api/nudges/:type/dismiss
 * Record a dismissal so the snooze cooldown applies on the next compute.
 */
router.post('/:type/dismiss', async (req, res) => {
  try {
    const { type } = req.params;
    if (!VALID_TYPES.has(type)) {
      return res.status(400).json({
        error: 'Unknown nudge type',
        validTypes: [...VALID_TYPES],
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.nudgeState) user.nudgeState = {};
    const key = type === NUDGE_TYPES.STARTING_POINT ? 'screener' : 'growthCheck';
    if (!user.nudgeState[key]) user.nudgeState[key] = {};

    user.nudgeState[key].dismissedAt = new Date();
    user.nudgeState[key].dismissCount = (user.nudgeState[key].dismissCount || 0) + 1;
    user.markModified('nudgeState');
    await user.save();

    res.json({
      success: true,
      type,
      dismissCount: user.nudgeState[key].dismissCount,
    });
  } catch (err) {
    console.error('[nudges] dismiss error:', err);
    res.status(500).json({ error: 'Failed to dismiss nudge' });
  }
});

module.exports = router;
