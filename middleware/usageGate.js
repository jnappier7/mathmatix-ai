// middleware/usageGate.js — Usage enforcement for unlimited tier & school licenses
//
// OPTION D — School License Model:
//   Teachers: always free unlimited (drives adoption)
//   Students: 30 free AI-minutes per week
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
const FREE_WEEKLY_SECONDS = 30 * 60; // 30 minutes per week for ALL students

// Freemium taste limits — free users get a sample before upgrade prompt
const FREE_UPLOAD_LIMIT  = 1;    // 1 free upload, then Mathmatix+ required
const FREE_GRADE_LIMIT   = 1;    // 1 free Show My Work, then Mathmatix+ required
const FREE_COURSE_LIMIT  = 1;    // 1 free course enrollment, then Mathmatix+ required

// In-memory cache for school license lookups (avoids DB hit on every request)
// Key: licenseId.toString(), Value: { license: object|null, checkedAt: number }
const licenseCache = new Map();
const LICENSE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached school license (single DB query covers both validity and capacity).
 */
async function getCachedLicense(licenseId) {
  if (!licenseId) return null;

  const key = licenseId.toString();
  const cached = licenseCache.get(key);
  if (cached && (Date.now() - cached.checkedAt) < LICENSE_CACHE_TTL_MS) {
    return cached.license;
  }

  try {
    const license = await SchoolLicense.findById(licenseId).lean();
    licenseCache.set(key, { license: license || null, checkedAt: Date.now() });
    return license || null;
  } catch (err) {
    console.error('[UsageGate] License fetch error:', err.message);
    return null;
  }
}

/**
 * Check if a school license is currently valid (with caching).
 */
async function isLicenseValid(licenseId) {
  const license = await getCachedLicense(licenseId);
  if (!license) return false;
  return (license.status === 'active' || license.status === 'trial') &&
    (!license.expiresAt || new Date() <= license.expiresAt);
}

/**
 * Middleware that gates AI-powered endpoints behind subscription limits.
 * - If BILLING_ENABLED is false: everyone passes (pre-launch mode)
 * - Teachers, parents, admins: always pass (free unlimited)
 * - Students with active school license: always pass (school purchased access)
 * - Unlimited individual subscribers: always pass
 * - Any student with free weekly minutes remaining: pass (free minutes first)
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
      const license = await getCachedLicense(user.schoolLicenseId);
      if (license) {
        const valid = (license.status === 'active' || license.status === 'trial') &&
          (!license.expiresAt || new Date() <= license.expiresAt);
        if (valid) {
          // Capacity check: verify school hasn't exceeded student limit
          if (license.currentStudentCount > license.maxStudents) {
            console.warn(`[UsageGate] School "${license.schoolName}" over capacity (${license.currentStudentCount}/${license.maxStudents})`);
            // Over capacity — fall through to free tier instead of blocking entirely
          } else {
            return next();
          }
        }
      }
      // License expired/invalid/over-capacity — fall through to free tier
    }

    // Unlimited individual subscribers pass unconditionally
    if (user.subscriptionTier === 'unlimited') return next();

    // Check if a linked parent has an active Mathmatix+ subscription
    // (parent pays → child gets unlimited access)
    if (user.parentIds && user.parentIds.length > 0) {
      const subscribedParent = await User.findOne({
        _id: { $in: user.parentIds },
        subscriptionTier: 'unlimited'
      }).lean();
      if (subscribedParent) return next();
    }

    // --- Weekly reset check (applies to all students) ---
    let weeklyAIUsed = user.weeklyAISeconds || 0;
    const now = new Date();
    const lastReset = user.lastWeeklyReset ? new Date(user.lastWeeklyReset) : new Date(0);
    if ((now - lastReset) / (1000 * 60 * 60 * 24) >= 7) {
      weeklyAIUsed = 0;
      // Atomic reset: only resets if lastWeeklyReset hasn't changed (prevents race condition)
      await User.findOneAndUpdate(
        { _id: user._id, lastWeeklyReset: user.lastWeeklyReset },
        { $set: { weeklyAISeconds: 0, weeklyActiveSeconds: 0, weeklyActiveTutoringMinutes: 0, lastWeeklyReset: now } }
      );
    }

    // --- Free weekly minutes (every student gets these first) ---
    const freeRemaining = FREE_WEEKLY_SECONDS - weeklyAIUsed;

    if (freeRemaining > 0) {
      // Still have free minutes — let them through regardless of tier
      res.setHeader('X-Free-Remaining-Seconds', Math.max(0, freeRemaining).toString());
      res.setHeader('Access-Control-Expose-Headers', 'X-Free-Remaining-Seconds, X-Usage-Warning');
      if (freeRemaining <= 120) {
        res.setHeader('X-Usage-Warning', 'low');
      }
      return next();
    }

    // --- Free minutes exhausted — calculate when they reset ---
    const resetDate = new Date(lastReset.getTime() + 7 * 24 * 60 * 60 * 1000);
    const msUntilReset = resetDate - now;
    const daysUntilReset = Math.max(0, Math.ceil(msUntilReset / (1000 * 60 * 60 * 24)));

    return res.status(402).json({
      message: `You've used your 30 free minutes this week. Your minutes reset in ${daysUntilReset} day${daysUntilReset !== 1 ? 's' : ''}. Upgrade to Unlimited for non-stop tutoring, or ask your teacher about a school license!`,
      usageLimitReached: true,
      tier: 'free',
      freeMinutesUsed: Math.floor(weeklyAIUsed / 60),
      freeMinutesTotal: 30,
      freeSecondsRemaining: 0,
      nextResetAt: resetDate.toISOString(),
      upgradeRequired: true
    });
  } catch (error) {
    console.error('[UsageGate] Error:', error.message);
    // Don't block the user on gate errors — let them through
    next();
  }
}

/**
 * Feature gate for premium-only features (voice, uploads, Show My Work).
 * School-licensed students and unlimited subscribers get full access.
 * Free users get a limited taste: 1 free upload and 1 free Show My Work,
 * then they see an upgrade prompt. Voice chat has no free taste (too expensive).
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

    // Check if a linked parent has an active Mathmatix+ subscription
    if (user.parentIds && user.parentIds.length > 0) {
      const subscribedParent = await User.findOne({
        _id: { $in: user.parentIds },
        subscriptionTier: 'unlimited'
      }).lean();
      if (subscribedParent) return next();
    }

    // --- Freemium taste: allow limited free uses of uploads and Show My Work ---
    if (featureName === 'File uploads' && (user.freeUploadsUsed || 0) < FREE_UPLOAD_LIMIT) {
      // Allow this upload, increment counter
      await User.findByIdAndUpdate(user._id, { $inc: { freeUploadsUsed: 1 } });
      return next();
    }

    if (featureName === 'Work grading' && (user.freeGradesUsed || 0) < FREE_GRADE_LIMIT) {
      // Allow this grading, increment counter
      await User.findByIdAndUpdate(user._id, { $inc: { freeGradesUsed: 1 } });
      return next();
    }

    if (featureName === 'Courses' && (user.freeCoursesUsed || 0) < FREE_COURSE_LIMIT) {
      // Allow this course enrollment, increment counter
      await User.findByIdAndUpdate(user._id, { $inc: { freeCoursesUsed: 1 } });
      return next();
    }

    // Determine the message based on whether user already used their free taste
    const usedFreeTaste = (featureName === 'File uploads' && (user.freeUploadsUsed || 0) >= FREE_UPLOAD_LIMIT) ||
                          (featureName === 'Work grading' && (user.freeGradesUsed || 0) >= FREE_GRADE_LIMIT) ||
                          (featureName === 'Courses' && (user.freeCoursesUsed || 0) >= FREE_COURSE_LIMIT);

    const message = usedFreeTaste
      ? `You've used your free ${featureName.toLowerCase()} trial! Upgrade to Mathmatix+ ($9.95/month) for unlimited access.`
      : `${featureName} requires Mathmatix+ ($9.95/month) or a school license.`;

    return res.status(402).json({
      message,
      premiumFeatureBlocked: true,
      feature: featureName,
      tier: user.subscriptionTier || 'free',
      upgradeRequired: true,
      freeTrialUsed: usedFreeTaste
    });
  };
}

/**
 * Feature gate for paid-only features (courses, Show My Work).
 * Unlimited subscribers or school-licensed students get access.
 */
function paidFeatureGate(featureName) {
  return async (req, res, next) => {
    if (!BILLING_ENABLED) return next(); // Master switch off — all features open

    const user = req.user;
    if (!user) return next();

    // Teachers, parents, admins always get access
    if (user.role === 'teacher' || user.role === 'parent' || user.role === 'admin') {
      return next();
    }

    // Unlimited subscribers
    if (user.subscriptionTier === 'unlimited') {
      return next();
    }

    // Students covered by a school license
    if (user.schoolLicenseId) {
      const valid = await isLicenseValid(user.schoolLicenseId);
      if (valid) return next();
    }

    // Check if a linked parent has an active Mathmatix+ subscription
    if (user.parentIds && user.parentIds.length > 0) {
      const subscribedParent = await User.findOne({
        _id: { $in: user.parentIds },
        subscriptionTier: 'unlimited'
      }).lean();
      if (subscribedParent) return next();
    }

    return res.status(402).json({
      message: `${featureName} requires Mathmatix+ or a school license.`,
      premiumFeatureBlocked: true,
      feature: featureName,
      tier: user.subscriptionTier || 'free',
      upgradeRequired: true
    });
  };
}

module.exports = { usageGate, premiumFeatureGate, paidFeatureGate, FREE_WEEKLY_SECONDS, isLicenseValid };
