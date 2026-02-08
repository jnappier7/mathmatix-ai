// middleware/usageGate.js — Usage enforcement for minute packs & unlimited tier
//
// Blocks chat/voice/upload requests when a user has no active pack or subscription.
// Pack users: must have packSecondsRemaining > 0 and pack not expired.
// Unlimited users: always pass.
// Teachers/admins: always pass.
//
// MASTER SWITCH: Set BILLING_ENABLED=true in .env to activate.
// When disabled, all users get unlimited access (pre-launch mode).
//
// Usage: app.use('/api/chat', isAuthenticated, usageGate, chatRoutes);

const User = require('../models/user');

const BILLING_ENABLED = process.env.BILLING_ENABLED === 'true';

/**
 * Middleware that gates AI-powered endpoints behind pack/subscription limits.
 * - If BILLING_ENABLED is false: everyone passes (pre-launch mode)
 * - Unlimited users: always pass
 * - Pack users with balance: pass, with remaining time in response header
 * - Free users / expired packs: 402 Payment Required with upgrade prompt
 */
async function usageGate(req, res, next) {
  // Master switch — when billing is off, everyone gets unlimited access
  if (!BILLING_ENABLED) return next();

  try {
    // Only gate POST requests (actual AI usage), not GETs
    if (req.method !== 'POST') return next();

    const user = req.user;
    if (!user) return next(); // Let auth middleware handle this

    // Teachers and admins are exempt from usage limits
    if (user.role === 'teacher' || user.role === 'admin') return next();

    // Unlimited users pass unconditionally
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

    // Free users — no access
    return res.status(402).json({
      message: 'Purchase a tutoring pack to get started.',
      usageLimitReached: true,
      tier: 'free',
      upgradeRequired: true
    });
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

    if (user.subscriptionTier === 'unlimited' || user.role === 'teacher' || user.role === 'admin') {
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

module.exports = { usageGate, premiumFeatureGate };
