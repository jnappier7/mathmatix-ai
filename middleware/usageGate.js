// middleware/usageGate.js — Usage enforcement for unlimited tier & school licenses
//
// The consumer ladder is PREVIEW -> TRIAL -> FREE, and the three are distinct
// on purpose; collapsing any two of them is what produced a funnel nobody ever
// reached the end of:
//   PREVIEW  anonymous, no account, 8 volleys on the landing page. Not gated
//            here at all — routes/trialChat.js owns its own turn cap.
//   TRIAL    14 days of full Mathmatix+ from signup, no card. Granted in code
//            (utils/trialGrant.js), honoured below via isInTrial().
//   FREE     what a lapsed trial drops to: a metered taste, deliberately not a
//            usable substitute for Mathmatix+. FREE_WEEKLY_SECONDS.
//
// Everything else passes unconditionally:
//   Teachers/parents/admins: always free unlimited (drives adoption)
//   Students with school license: unlimited (school purchased access)
//   Founding-school domains: unlimited (utils/foundingSchool.js)
//   Unlimited individual subscribers: always pass
//
// MASTER SWITCH: Set BILLING_ENABLED=true in .env to activate.
// When disabled, all users get unlimited access (pre-launch mode).
//
// Usage: app.use('/api/chat', isAuthenticated, usageGate, chatRoutes);

const User = require('../models/user');
const SchoolLicense = require('../models/schoolLicense');
const { recordConversionEvent } = require('../utils/conversionEvents');
const { userHasRole } = require('../utils/roleQuery');
const { isFoundingSchoolUser } = require('../utils/foundingSchool');
const { isInTrial } = require('../utils/trialGrant');

const BILLING_ENABLED = process.env.BILLING_ENABLED === 'true';
// NOTE: constant/field names keep the "weekly" prefix for backward compatibility
// (no DB migration), but the free AI quota now resets MONTHLY (see FREE_QUOTA_RESET_DAYS).
// The quota arithmetic itself lives in utils/aiTimeMeter.js — the one place AI
// time is charged — so the gate and the meter can never disagree about how many
// seconds a student has left.
const {
  FREE_WEEKLY_SECONDS,
  FREE_QUOTA_RESET_DAYS,
  remainingAiSeconds,
} = require('../utils/aiTimeMeter');

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
 * The staff bypass: teachers, parents and admins are never metered or
 * paywalled (Option D — free unlimited drives adoption).
 *
 * Reads the roles a user HOLDS, not `user.role` — the dashboard they happen to
 * have open (CLAUDE.md §12). On the active role the bypass was BOTH too narrow
 * and too loose at once: a teacher who also holds parent started being metered
 * against the 30-minute student quota the moment they opened a student view,
 * while the same account could flip back to parent and have the meter stop —
 * so the quota was decided by a dashboard toggle rather than by who they are.
 *
 * All four gates below share this so the meter, the paywall and the display
 * surfaces can never disagree about who is exempt.
 */
function hasStaffRoleBypass(user) {
  return userHasRole(user, 'teacher') || userHasRole(user, 'parent') || userHasRole(user, 'admin');
}

/**
 * True when the user's AI usage is NOT metered against the free monthly
 * quota: role bypass (teacher/parent/admin), unlimited subscriber, valid
 * in-capacity school license, or a linked parent with Mathmatix+.
 *
 * This is the single source of truth for "does the free-minute quota apply
 * to this user" — usageGate uses it to decide whether to enforce, and the
 * display surfaces (GET /api/billing/status, the pipeline's
 * freeWeeklySecondsRemaining) MUST use it too. They previously tested
 * `subscriptionTier === 'free'` alone, which is true for school-licensed
 * and parent-covered students, so those students saw a "No AI time left"
 * wall while the gate (correctly) kept letting tutor turns through.
 *
 * @param {Object} user - req.user / hydrated user doc (mongoose or lean)
 * @returns {Promise<boolean>}
 */
async function hasUnmeteredAiAccess(user) {
  if (!BILLING_ENABLED) return true;
  if (!user) return false;

  // Teachers, parents, and admins are always free unlimited
  if (hasStaffRoleBypass(user)) return true;

  // Founding-school accounts (matched by email domain — FOUNDING_SCHOOL_DOMAINS)
  // are treated as Unlimited subscribers. Because this lives in the single
  // source of truth, the gate, GET /api/billing/status, courseChat, the
  // pipeline's metering flag and voice sessions all inherit it together.
  if (isFoundingSchoolUser(user)) return true;

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
          return true;
        }
      }
    }
    // License expired/invalid/over-capacity — fall through to free tier
  }

  // Unlimited individual subscribers pass unconditionally
  if (user.subscriptionTier === 'unlimited') return true;

  // Inside a free trial. The CARD trial rode in on subscriptionTier (Stripe's
  // webhooks set 'unlimited' for its duration), so this check is what the
  // no-card trial granted at signup depends on entirely — without it the trial
  // sets a date, promises 14 days and grants nothing. See utils/trialGrant.js.
  if (isInTrial(user)) return true;

  // Check if a linked parent has an active Mathmatix+ subscription
  // (parent pays → child gets unlimited access)
  if (user.parentIds && user.parentIds.length > 0) {
    const subscribedParent = await User.findOne({
      _id: { $in: user.parentIds },
      subscriptionTier: 'unlimited'
    }).lean();
    if (subscribedParent) return true;
  }

  return false;
}

/**
 * Middleware that gates AI-powered endpoints behind subscription limits.
 * - If BILLING_ENABLED is false: everyone passes (pre-launch mode)
 * - Teachers, parents, admins: always pass (free unlimited)
 * - Students with active school license: always pass (school purchased access)
 * - Unlimited individual subscribers: always pass
 * - Any student with free monthly minutes remaining: pass (free minutes first)
 * - Otherwise: 402 Payment Required
 */
async function runUsageGate(req, res, next, { allMethods = false } = {}) {
  // Master switch — when billing is off, everyone gets unlimited access
  if (!BILLING_ENABLED) return next();

  try {
    // Only gate POST requests (actual AI usage), not GETs — unless the
    // mount opts into allMethods because its GETs spend AI (usageGateAllMethods).
    if (!allMethods && req.method !== 'POST') return next();

    const user = req.user;
    if (!user) return next(); // Let auth middleware handle this

    if (await hasUnmeteredAiAccess(user)) return next();

    const now = new Date();

    // --- WEEKLY engagement-metric reset (every 7 days) ---
    // weeklyActive* feed the teacher/parent "min/wk" dashboards and the
    // struggling heuristic, so they stay weekly even though the free-AI quota
    // below is monthly. (Decoupled from the quota anchor on purpose.)
    const lastWeeklyReset = user.lastWeeklyReset ? new Date(user.lastWeeklyReset) : new Date(0);
    if ((now - lastWeeklyReset) / (1000 * 60 * 60 * 24) >= 7) {
      // Atomic reset: only resets if lastWeeklyReset hasn't changed (prevents race condition)
      await User.findOneAndUpdate(
        { _id: user._id, lastWeeklyReset: user.lastWeeklyReset },
        { $set: { weeklyActiveSeconds: 0, weeklyActiveTutoringMinutes: 0, lastWeeklyReset: now } }
      );
    }

    // --- MONTHLY free-AI-minute quota reset (rolling 30-day window) ---
    let aiUsed = user.weeklyAISeconds || 0;
    const lastQuotaReset = user.lastAIQuotaReset ? new Date(user.lastAIQuotaReset) : new Date(0);
    if ((now - lastQuotaReset) / (1000 * 60 * 60 * 24) >= FREE_QUOTA_RESET_DAYS) {
      aiUsed = 0;
      // Atomic reset: only resets if lastAIQuotaReset hasn't changed (prevents race condition)
      await User.findOneAndUpdate(
        { _id: user._id, lastAIQuotaReset: user.lastAIQuotaReset },
        { $set: { weeklyAISeconds: 0, lastAIQuotaReset: now } }
      );
    }

    // --- Free monthly minutes (every student gets these first) ---
    const freeRemaining = FREE_WEEKLY_SECONDS - aiUsed;

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
    const resetDate = new Date(lastQuotaReset.getTime() + FREE_QUOTA_RESET_DAYS * 24 * 60 * 60 * 1000);
    const msUntilReset = resetDate - now;
    const daysUntilReset = Math.max(0, Math.ceil(msUntilReset / (1000 * 60 * 60 * 24)));

    // Course-aware upgrade nudge: if the student is mid-course, hitting the cap is the
    // conversion moment — keep it warm and in-context instead of a generic paywall.
    const inCourse = !!user.activeCourseSessionId;
    const upgradeLine = inCourse
      ? `Upgrade to Mathmatix+ to keep going in your course without waiting, or ask your teacher about a school license!`
      : `Upgrade to Unlimited for non-stop tutoring, or ask your teacher about a school license!`;

    // Funnel telemetry — the free wall is the primary conversion moment. Throttle
    // to once/hour per session so a user retrying a blocked action doesn't inflate
    // counts; distinct-user totals come from userId at analysis time.
    const nowMs = Date.now();
    const lastEvt = (req.session && req.session.__quotaEvtAt) || 0;
    if (nowMs - lastEvt > 60 * 60 * 1000) {
      if (req.session) req.session.__quotaEvtAt = nowMs;
      recordConversionEvent('free_quota_exhausted', {
        userId: user._id,
        context: { inCourse, daysUntilReset, tier: user.subscriptionTier || 'free' },
      });
    }

    return res.status(402).json({
      message: `You've used your 30 free minutes this month. Your minutes reset in ${daysUntilReset} day${daysUntilReset !== 1 ? 's' : ''}. ${upgradeLine}`,
      usageLimitReached: true,
      tier: 'free',
      inCourse,
      freeMinutesUsed: Math.floor(aiUsed / 60),
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

function usageGate(req, res, next) {
  return runUsageGate(req, res, next);
}

/**
 * Variant for mounts whose GET endpoints spend AI (e.g. /api/welcome-message
 * generates an LLM greeting on GET). The default usageGate skips non-POSTs,
 * which lets those endpoints keep firing tutor responses after the free
 * quota is exhausted.
 */
function usageGateAllMethods(req, res, next) {
  return runUsageGate(req, res, next, { allMethods: true });
}

/**
 * Pure access check — does this user qualify for premium features?
 * Mirrors the gating logic of paidFeatureGate / premiumFeatureGate but
 * exposed as a function so non-Express callers (e.g. WebSocket upgrades
 * in utils/voiceUpgrade.js) can enforce the same paywall. Without this,
 * the WS endpoints leak past the HTTP-level premiumFeatureGate.
 *
 * @param {Object} user - req.user / hydrated user doc (mongoose or lean)
 * @returns {Promise<boolean>} true if the user should be allowed in
 */
async function hasPremiumAccess(user) {
  // Master switch — pre-launch mode opens everything
  if (!BILLING_ENABLED) return true;
  if (!user) return false;

  // Role bypasses (drive adoption; teachers/parents/admins never paywalled)
  if (hasStaffRoleBypass(user)) {
    return true;
  }

  // Unlimited individual subscribers
  if (user.subscriptionTier === 'unlimited') return true;

  // Free trial — a trial that withheld the premium features would not be a
  // Mathmatix+ trial, just a longer free tier.
  if (isInTrial(user)) return true;

  // Active school license
  if (user.schoolLicenseId) {
    const valid = await isLicenseValid(user.schoolLicenseId);
    if (valid) return true;
  }

  // Linked parent with active Mathmatix+ subscription (parent pays → child gets in)
  if (user.parentIds && user.parentIds.length > 0) {
    const subscribedParent = await User.findOne({
      _id: { $in: user.parentIds },
      subscriptionTier: 'unlimited'
    }).lean();
    if (subscribedParent) return true;
  }

  return false;
}

/**
 * Can this user open a voice session?
 *
 * Voice used to be premium-only (hasPremiumAccess). It is now available to
 * every 13+ student and metered against the same monthly AI-second pool as
 * text tutoring — a voice second and a text second cost the same quota, voice
 * just spends them continuously, so it drains the pool faster in wall-clock
 * terms. See utils/aiTimeMeter.js for the arithmetic.
 *
 * Used by BOTH the HTTP mounts and the WebSocket upgrade
 * (utils/voiceUpgrade.js), which never runs the Express chain and so needs the
 * predicate rather than the middleware.
 *
 * NOTE: this answers "may they START a session". A session already in flight is
 * cut off mid-call by utils/voiceSession.js, which re-checks the balance every
 * time it flushes the meter — without that a student could connect with ten
 * seconds left and talk for an hour, because nothing debits until hang-up.
 *
 * @param {Object} user - req.user / hydrated user doc (mongoose or lean)
 * @returns {Promise<boolean>}
 */
async function hasVoiceAccess(user) {
  if (!BILLING_ENABLED) return true;
  if (!user) return false;
  if (await hasUnmeteredAiAccess(user)) return true;
  return remainingAiSeconds(user) > 0;
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
    if (hasStaffRoleBypass(user)) {
      return next();
    }

    // Unlimited individual subscribers
    if (user.subscriptionTier === 'unlimited') {
      return next();
    }

    // Founding-school accounts get the full Mathmatix+ feature set
    if (isFoundingSchoolUser(user)) {
      return next();
    }

    // Free trial — full Mathmatix+ feature set for its duration.
    if (isInTrial(user)) {
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
    if (hasStaffRoleBypass(user)) {
      return next();
    }

    // Unlimited subscribers
    if (user.subscriptionTier === 'unlimited') {
      return next();
    }

    // Free trial
    if (isInTrial(user)) {
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

module.exports = { usageGate, usageGateAllMethods, premiumFeatureGate, paidFeatureGate, hasPremiumAccess, hasVoiceAccess, hasUnmeteredAiAccess, hasStaffRoleBypass, FREE_WEEKLY_SECONDS, FREE_QUOTA_RESET_DAYS, isLicenseValid };
