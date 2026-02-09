// middleware/usageGate.js — Usage enforcement for minute packs & unlimited tier
//
// Free students: 20 free minutes per week (resets weekly).
// Students connected to a class (teacherId): unlimited free access.
// Pack users: must have packSecondsRemaining > 0 and pack not expired.
// Unlimited users: always pass.
// Teachers/parents/admins: always pass (free unlimited).
//
// MASTER SWITCH: Set BILLING_ENABLED=true in .env to activate.
// When disabled, all users get unlimited access (pre-launch mode).
//
// Usage: app.use('/api/chat', isAuthenticated, usageGate, chatRoutes);

const User = require('../models/user');

const BILLING_ENABLED = process.env.BILLING_ENABLED === 'true';
const FREE_WEEKLY_SECONDS = 20 * 60; // 20 minutes per week for free students

/**
 * Middleware that gates AI-powered endpoints behind pack/subscription limits.
 * - If BILLING_ENABLED is false: everyone passes (pre-launch mode)
 * - Teachers, parents, admins: always pass (free unlimited)
 * - Students connected to a class (teacherId): always pass (free unlimited)
 * - Unlimited subscribers: always pass
 * - Pack users with balance: pass, with remaining time in response header
 * - Free students: 20 free minutes per week, then 402
 */
async function usageGate(req, res, next) {
  // Master switch — when billing is off, everyone gets unlimited access
  if (!BILLING_ENABLED) return next();

  try {
    // Only gate POST requests (actual AI usage), not GETs
    if (req.method !== 'POST') return next();

    const user = req.user;
    if (!user) return next(); // Let auth middleware handle this

    // Teachers, parents, and admins are always free unlimited
    if (user.role === 'teacher' || user.role === 'parent' || user.role === 'admin') return next();

    // Students connected to a class get free unlimited access
    if (user.teacherId) return next();

    // Unlimited subscribers pass unconditionally
    if (user.subscriptionTier === 'unlimited') return next();

    // Pack users — check balance and expiry
    if (user.subscriptionTier === 'pack_60' || user.subscriptionTier === 'pack_120') {
      const now = new Date();
      const expired = user.packExpiresAt && now > user.packExpiresAt;
      const remaining = expired ? 0 : (user.packSecondsRemaining || 0);

      if (remaining <= 0) {
        // Auto-downgrade
        User.findByIdAndUpdate(user._id, { subscriptionTier: 'free' })
          .catch(err => console.error('[UsageGate] Downgrade error:', err.message));

        return res.status(402).json({
          message: expired
            ? 'Your minute pack has expired. Purchase a new pack to continue.'
            : 'Your minutes are used up. Purchase a new pack to continue.',
          usageLimitReached: true,
          tier: 'free',
          expired,
          upgradeRequired: true
        });
      }

      // Warn when under 2 minutes remaining
      if (remaining <= 120) {
        res.setHeader('X-Usage-Warning', 'low');
        res.setHeader('X-Usage-Remaining-Seconds', remaining.toString());
      }

      return next();
    }

    // Free students — 20 minutes of AI time per week
    // Uses weeklyAISeconds (server-measured AI processing time only)
    // so reading, thinking, and paper work don't count against the limit
    let weeklyAIUsed = user.weeklyAISeconds || 0;

    // Weekly reset check: if 7+ days since last reset, clear the counter
    const now = new Date();
    const lastReset = user.lastWeeklyReset ? new Date(user.lastWeeklyReset) : new Date(0);
    if ((now - lastReset) / (1000 * 60 * 60 * 24) >= 7) {
      weeklyAIUsed = 0;
      // Reset in background
      User.findByIdAndUpdate(user._id, {
        weeklyAISeconds: 0,
        weeklyActiveSeconds: 0,
        weeklyActiveTutoringMinutes: 0,
        lastWeeklyReset: now
      }).catch(err => console.error('[UsageGate] Weekly reset error:', err));
    }

    const freeRemaining = FREE_WEEKLY_SECONDS - weeklyAIUsed;

    if (freeRemaining <= 0) {
      return res.status(402).json({
        message: "You've used your 20 free minutes this week. Upgrade for unlimited tutoring, or come back next week!",
        usageLimitReached: true,
        tier: 'free',
        freeMinutesUsed: Math.floor(weeklyAIUsed / 60),
        freeMinutesTotal: 20,
        freeSecondsRemaining: 0,
        upgradeRequired: true
      });
    }

    // Set remaining time headers so frontend can show countdown
    res.setHeader('X-Free-Remaining-Seconds', Math.max(0, freeRemaining).toString());

    // Warn when under 2 minutes remaining
    if (freeRemaining <= 120) {
      res.setHeader('X-Usage-Warning', 'low');
    }

    return next();
  } catch (error) {
    console.error('[UsageGate] Error:', error.message);
    // Don't block the user on gate errors — let them through
    next();
  }
}

/**
 * Feature gate for premium-only features (voice, OCR, uploads).
 * Only unlimited subscribers get access.
 */
function premiumFeatureGate(featureName) {
  return (req, res, next) => {
    if (!BILLING_ENABLED) return next(); // Master switch off — all features open

    const user = req.user;
    if (!user) return next();

    if (user.subscriptionTier === 'unlimited' || user.role === 'teacher' || user.role === 'parent' || user.role === 'admin') {
      return next();
    }

    return res.status(402).json({
      message: `${featureName} requires the Unlimited plan ($19.95/month).`,
      premiumFeatureBlocked: true,
      feature: featureName,
      tier: user.subscriptionTier || 'free',
      upgradeRequired: true
    });
  };
}

module.exports = { usageGate, premiumFeatureGate, FREE_WEEKLY_SECONDS };
