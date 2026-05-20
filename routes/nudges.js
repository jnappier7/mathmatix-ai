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
const { computeNudges, NUDGE_TYPES, SNOOZE_DAYS } = require('../utils/userNudges');

const VALID_TYPES = new Set(Object.values(NUDGE_TYPES));
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Cap on how long a single snooze can hide a nudge. We don't want a 30-day
// snooze to silently bury an overdue growth check forever; one week max,
// which means a real escalation cycle continues even if the user keeps
// hitting "Skip for today" daily.
const MAX_SNOOZE_HOURS = 24 * 7;

function stateKeyForType(type) {
  return type === NUDGE_TYPES.STARTING_POINT ? 'screener' : 'growthCheck';
}

function ensureNudgeState(user, key) {
  if (!user.nudgeState) user.nudgeState = {};
  if (!user.nudgeState[key]) user.nudgeState[key] = {};
  return user.nudgeState[key];
}

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
      const now = new Date();
      for (const nudge of nudges) {
        const state = ensureNudgeState(user, stateKeyForType(nudge.type));
        state.promptedAt = now;
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
 * Standard dismissal. Snoozes the nudge for the default SNOOZE_DAYS window.
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

    const now = new Date();
    const state = ensureNudgeState(user, stateKeyForType(type));
    state.dismissedAt = now;
    state.snoozedUntil = new Date(now.getTime() + SNOOZE_DAYS * DAY_MS);
    state.dismissCount = (state.dismissCount || 0) + 1;
    user.markModified('nudgeState');
    await user.save();

    res.json({
      success: true,
      type,
      dismissCount: state.dismissCount,
      snoozedUntil: state.snoozedUntil,
    });
  } catch (err) {
    console.error('[nudges] dismiss error:', err);
    res.status(500).json({ error: 'Failed to dismiss nudge' });
  }
});

/**
 * POST /api/nudges/:type/snooze
 * Body or query: { hours }. Hide the nudge for a user-specified window.
 * Used by the "Skip for today" button on overdue nudges (24h). Clamped
 * to [1, MAX_SNOOZE_HOURS] so a runaway client can't park a nudge for a year.
 */
router.post('/:type/snooze', async (req, res) => {
  try {
    const { type } = req.params;
    if (!VALID_TYPES.has(type)) {
      return res.status(400).json({
        error: 'Unknown nudge type',
        validTypes: [...VALID_TYPES],
      });
    }

    const rawHours = Number(req.body?.hours ?? req.query?.hours ?? 24);
    if (!Number.isFinite(rawHours) || rawHours <= 0) {
      return res.status(400).json({ error: 'hours must be a positive number' });
    }
    const hours = Math.min(MAX_SNOOZE_HOURS, Math.max(1, Math.floor(rawHours)));

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = new Date();
    const state = ensureNudgeState(user, stateKeyForType(type));
    state.dismissedAt = now;
    state.snoozedUntil = new Date(now.getTime() + hours * HOUR_MS);
    state.dismissCount = (state.dismissCount || 0) + 1;
    user.markModified('nudgeState');
    await user.save();

    res.json({
      success: true,
      type,
      hours,
      dismissCount: state.dismissCount,
      snoozedUntil: state.snoozedUntil,
    });
  } catch (err) {
    console.error('[nudges] snooze error:', err);
    res.status(500).json({ error: 'Failed to snooze nudge' });
  }
});

module.exports = router;
