// middleware/usageGate.js — Free tier usage enforcement
//
// Blocks chat/voice/upload requests when a free-tier user has exceeded
// their weekly allotment. Premium users pass through unconditionally.
//
// MASTER SWITCH: Set BILLING_ENABLED=true in .env to activate.
// When disabled, all users get unlimited access (pre-launch mode).
//
// Usage: app.use('/api/chat', isAuthenticated, usageGate, chatRoutes);

const User = require('../models/user');

const FREE_WEEKLY_SECONDS = 20 * 60; // 20 minutes per week
const BILLING_ENABLED = process.env.BILLING_ENABLED === 'true';

/**
 * Middleware that gates AI-powered endpoints behind the free tier limit.
 * - If BILLING_ENABLED is false: everyone passes (pre-launch mode)
 * - Premium users: always pass
 * - Free users under limit: pass, with remaining time in response header
 * - Free users over limit: 402 Payment Required with upgrade prompt
 */
async function usageGate(req, res, next) {
  // Master switch — when billing is off, everyone gets unlimited access
  if (!BILLING_ENABLED) return next();

  try {
    // Only gate POST requests (actual AI usage), not GETs
    if (req.method !== 'POST') return next();

    const user = req.user;
    if (!user) return next(); // Let auth middleware handle this

    // Premium users pass unconditionally
    if (user.subscriptionTier === 'premium') return next();

    // Teachers and admins are exempt from usage limits
    if (user.role === 'teacher' || user.role === 'admin') return next();

    // Check for weekly reset
    const now = new Date();
    const lastReset = user.lastWeeklyReset ? new Date(user.lastWeeklyReset) : new Date(0);
    const daysSinceReset = (now - lastReset) / (1000 * 60 * 60 * 24);

    let weeklySeconds = user.weeklyActiveSeconds || 0;
    if (daysSinceReset >= 7) {
      // Reset inline — don't block the request to save
      weeklySeconds = 0;
      User.findByIdAndUpdate(user._id, {
        weeklyActiveSeconds: 0,
        weeklyActiveTutoringMinutes: 0,
        lastWeeklyReset: now
      }).catch(err => console.error('[UsageGate] Reset error:', err.message));
    }

    const remaining = FREE_WEEKLY_SECONDS - weeklySeconds;

    if (remaining <= 0) {
      return res.status(402).json({
        message: "You've used your free tutoring time this week! Upgrade to Premium for unlimited access.",
        usageLimitReached: true,
        tier: 'free',
        weeklySecondsUsed: weeklySeconds,
        weeklyLimitSeconds: FREE_WEEKLY_SECONDS,
        upgradeRequired: true
      });
    }

    // Warn when under 2 minutes remaining
    if (remaining <= 120) {
      res.setHeader('X-Usage-Warning', 'low');
      res.setHeader('X-Usage-Remaining-Seconds', remaining.toString());
    }

    next();
  } catch (error) {
    console.error('[UsageGate] Error:', error.message);
    // Don't block the user on gate errors — let them through
    next();
  }
}

/**
 * Feature gate for premium-only features (voice, OCR, uploads).
 * Returns 402 if free-tier user tries to access a premium feature.
 */
function premiumFeatureGate(featureName) {
  return (req, res, next) => {
    if (!BILLING_ENABLED) return next(); // Master switch off — all features open

    const user = req.user;
    if (!user) return next();

    if (user.subscriptionTier === 'premium' || user.role === 'teacher' || user.role === 'admin') {
      return next();
    }

    return res.status(402).json({
      message: `${featureName} is a Premium feature. Upgrade for $19.95/month to unlock it.`,
      premiumFeatureBlocked: true,
      feature: featureName,
      tier: 'free',
      upgradeRequired: true
    });
  };
}

module.exports = { usageGate, premiumFeatureGate };
