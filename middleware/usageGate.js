// middleware/usageGate.js — Usage enforcement for minute packs & unlimited tier
//
// OPTION D — School License Model:
//   Teachers: always free unlimited (drives adoption)
//   Students: 20 free AI-minutes per week
//   Students with school license: unlimited (school purchased access)
//   Unlimited individual subscribers: always pass
//   Parents/admins: always pass (free unlimited)
//
// MASTER SWITCH: Set BILLING_ENABLED=true in .env to activate.
// When disabled, all users get unlimited access (pre-launch mode).
//
// Usage: app.use('/api/chat', isAuthenticated, usageGate, chatRoutes);

const User = require('../models/user');
const SchoolLicense = require('../models/schoolLicense');

const BILLING_ENABLED = process.env.BILLING_ENABLED === 'true';
const FREE_WEEKLY_SECONDS = 20 * 60; // 20 minutes per week for ALL students

// In-memory cache for school license validity (avoids DB hit on every request)
// Key: licenseId.toString(), Value: { valid: boolean, checkedAt: Date }
const licenseCache = new Map();
const LICENSE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a school license is currently valid (with caching).
 */
async function isLicenseValid(licenseId) {
  if (!licenseId) return false;

  const key = licenseId.toString();
  const cached = licenseCache.get(key);
  if (cached && (Date.now() - cached.checkedAt) < LICENSE_CACHE_TTL_MS) {
    return cached.valid;
  }

  try {
    const license = await SchoolLicense.findById(licenseId).lean();
    const valid = license ? license.isValid ? license.isValid() : (
      (license.status === 'active' || license.status === 'trial') &&
      (!license.expiresAt || new Date() <= license.expiresAt)
    ) : false;
    licenseCache.set(key, { valid, checkedAt: Date.now() });
    return valid;
  } catch (err) {
    console.error('[UsageGate] License check error:', err.message);
    // On error, allow access (don't block students due to lookup failure)
    return true;
  }
}

/**
 * Middleware that gates AI-powered endpoints behind pack/subscription limits.
 * - If BILLING_ENABLED is false: everyone passes (pre-launch mode)
 * - Teachers, parents, admins: always pass (free unlimited)
 * - Students with active school license: always pass (school purchased access)
 * - Unlimited individual subscribers: always pass
 * - Any student with free weekly minutes remaining: pass (free minutes first)
 * - Pack users with pack balance remaining: pass (pack used after free minutes)
 * - Otherwise: 402 Payment Required
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

    // Students covered by a school license get unlimited access
    if (user.schoolLicenseId) {
      const valid = await isLicenseValid(user.schoolLicenseId);
      if (valid) return next();
      // License expired/invalid — fall through to free tier
    }

    // Unlimited individual subscribers pass unconditionally
    if (user.subscriptionTier === 'unlimited') return next();

    // --- Weekly reset check (applies to all students) ---
    let weeklyAIUsed = user.weeklyAISeconds || 0;
    const now = new Date();
    const lastReset = user.lastWeeklyReset ? new Date(user.lastWeeklyReset) : new Date(0);
    if ((now - lastReset) / (1000 * 60 * 60 * 24) >= 7) {
      weeklyAIUsed = 0;
      User.findByIdAndUpdate(user._id, {
        weeklyAISeconds: 0,
        weeklyActiveSeconds: 0,
        weeklyActiveTutoringMinutes: 0,
        lastWeeklyReset: now
      }).catch(err => console.error('[UsageGate] Weekly reset error:', err));
    }

    // --- Free weekly minutes (every student gets these first) ---
    const freeRemaining = FREE_WEEKLY_SECONDS - weeklyAIUsed;

    if (freeRemaining > 0) {
      // Still have free minutes — let them through regardless of tier
      res.setHeader('X-Free-Remaining-Seconds', Math.max(0, freeRemaining).toString());
      if (freeRemaining <= 120) {
        res.setHeader('X-Usage-Warning', 'low');
      }
      return next();
    }

    // --- Free minutes exhausted — check pack balance ---
    if (user.subscriptionTier === 'pack_60' || user.subscriptionTier === 'pack_120') {
      const expired = user.packExpiresAt && now > user.packExpiresAt;
      const packRemaining = expired ? 0 : (user.packSecondsRemaining || 0);

      if (packRemaining > 0) {
        // Pack has balance — let them through
        if (packRemaining <= 120) {
          res.setHeader('X-Usage-Warning', 'low');
          res.setHeader('X-Usage-Remaining-Seconds', packRemaining.toString());
        }
        return next();
      }

      // Pack empty or expired — auto-downgrade
      User.findByIdAndUpdate(user._id, { subscriptionTier: 'free' })
        .catch(err => console.error('[UsageGate] Downgrade error:', err.message));

      return res.status(402).json({
        message: "Your free minutes and minute pack are both used up. Purchase a new pack, ask your school about a Mathmatix license, or come back next week!",
        usageLimitReached: true,
        tier: 'free',
        freeSecondsRemaining: 0,
        expired,
        upgradeRequired: true
      });
    }

    // --- Free-tier student, no pack, free minutes exhausted ---
    return res.status(402).json({
      message: "You've used your 20 free minutes this week. Ask your teacher about a school license for unlimited access, or come back next week!",
      usageLimitReached: true,
      tier: 'free',
      freeMinutesUsed: Math.floor(weeklyAIUsed / 60),
      freeMinutesTotal: 20,
      freeSecondsRemaining: 0,
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
 * School-licensed students and unlimited subscribers get access.
 */
function premiumFeatureGate(featureName) {
  return async (req, res, next) => {
    if (!BILLING_ENABLED) return next(); // Master switch off — all features open

    const user = req.user;
    if (!user) return next();

    // Teachers, parents, admins always get premium features
    if (user.role === 'teacher' || user.role === 'parent' || user.role === 'admin') {
      return next();
    }

    // Unlimited individual subscribers
    if (user.subscriptionTier === 'unlimited') {
      return next();
    }

    // Students covered by a school license get premium features
    if (user.schoolLicenseId) {
      const valid = await isLicenseValid(user.schoolLicenseId);
      if (valid) return next();
    }

    return res.status(402).json({
      message: `${featureName} requires the Unlimited plan ($19.95/month) or a school license.`,
      premiumFeatureBlocked: true,
      feature: featureName,
      tier: user.subscriptionTier || 'free',
      upgradeRequired: true
    });
  };
}

module.exports = { usageGate, premiumFeatureGate, FREE_WEEKLY_SECONDS, isLicenseValid };
