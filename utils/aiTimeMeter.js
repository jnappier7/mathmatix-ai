// utils/aiTimeMeter.js — the ONE place AI time is charged to a user.
//
// Every AI-spending surface (text tutor turns, voice sessions, read-aloud)
// debits the same monthly pool: `weeklyAISeconds` (the name is legacy — the
// quota resets MONTHLY, see FREE_QUOTA_RESET_DAYS). Before this module the
// arithmetic lived inline in utils/pipeline/persist.js and utils/voiceSession.js,
// and the two had already drifted: the voice copy never drew down
// `packSecondsRemaining`, so a pack subscriber's voice minutes inflated the
// meter without ever consuming the minutes they paid for.
//
// Three jobs, all of which have to happen together to stay correct:
//   1. Roll the monthly window when it has lapsed. middleware/usageGate.js does
//      this on the HTTP path, but a voice WebSocket upgrade never runs the
//      Express chain, so the meter has to be able to roll it itself.
//   2. $inc weeklyAISeconds / totalAISeconds atomically.
//   3. Draw down a legacy minute pack for whatever spills past the free tier.
//
// Pure read helpers (remainingAiSeconds etc.) take a user doc and do no I/O, so
// gates can call them on an already-hydrated req.user without another query.

const User = require('../models/user');

// Free AI seconds per reset window, for students the quota actually meters.
const FREE_WEEKLY_SECONDS = 30 * 60;
// Length of the quota window in days (monthly, despite the "weekly" field names).
const FREE_QUOTA_RESET_DAYS = 30;

const PACK_TIERS = new Set(['pack_60', 'pack_120']);

/**
 * True when the user's quota window has lapsed and their used-seconds should be
 * treated as zero (and reset on the next write).
 */
function isResetPending(user, now = new Date()) {
  const lastReset = user.lastAIQuotaReset ? new Date(user.lastAIQuotaReset) : new Date(0);
  return (now - lastReset) / (1000 * 60 * 60 * 24) >= FREE_QUOTA_RESET_DAYS;
}

/**
 * Seconds charged against the CURRENT window — 0 if the window has lapsed but
 * nothing has written the reset yet.
 */
function usedAiSeconds(user, now = new Date()) {
  if (!user) return 0;
  if (isResetPending(user, now)) return 0;
  return user.weeklyAISeconds || 0;
}

/** Unspent balance on a legacy minute pack (0 when absent or expired). */
function packSecondsRemaining(user, now = new Date()) {
  if (!user || !PACK_TIERS.has(user.subscriptionTier)) return 0;
  if (user.packExpiresAt && now > new Date(user.packExpiresAt)) return 0;
  return Math.max(0, user.packSecondsRemaining || 0);
}

/**
 * Total AI seconds this user may still spend: free-window remainder plus any
 * pack balance. Meaningless for unmetered users (school license, unlimited,
 * staff roles) — check hasUnmeteredAiAccess first.
 */
function remainingAiSeconds(user, now = new Date()) {
  const free = Math.max(0, FREE_WEEKLY_SECONDS - usedAiSeconds(user, now));
  return free + packSecondsRemaining(user, now);
}

/**
 * Charge `seconds` of AI time to a user.
 *
 * Mutates the passed user object's counters in place as well as writing to the
 * DB, so a long-lived caller (a voice session charging every 30s) keeps reading
 * accurate remaining-balance numbers without re-fetching.
 *
 * @param {Object} user     - user doc (mongoose or lean); needs _id and counters
 * @param {number} seconds  - seconds to charge; <=0 is a no-op
 * @param {Date}   [now]
 * @returns {Promise<{billedSeconds:number, usedSeconds:number, remainingSeconds:number}>}
 */
async function meterAiSeconds(user, seconds, now = new Date()) {
  const billedSeconds = Math.round(seconds);
  if (!user || !user._id || !(billedSeconds > 0)) {
    return {
      billedSeconds: 0,
      usedSeconds: usedAiSeconds(user || {}, now),
      remainingSeconds: user ? remainingAiSeconds(user, now) : 0,
    };
  }

  const resetPending = isResetPending(user, now);
  const previousUsed = usedAiSeconds(user, now); // 0 when a reset is pending
  const updatedUsed = previousUsed + billedSeconds;

  // A lapsed window is rolled and charged in one write: $set the window's
  // seconds to just this charge rather than $inc-ing onto a stale total.
  const update = resetPending
    ? { $set: { weeklyAISeconds: billedSeconds, lastAIQuotaReset: now }, $inc: { totalAISeconds: billedSeconds } }
    : { $inc: { weeklyAISeconds: billedSeconds, totalAISeconds: billedSeconds } };

  // Pack drawdown: only the portion that spills past the free tier is paid
  // minutes, so the deduction is the growth in the paid-side total.
  if (packSecondsRemaining(user, now) > 0) {
    const previousPaid = Math.max(0, previousUsed - FREE_WEEKLY_SECONDS);
    const updatedPaid = Math.max(0, updatedUsed - FREE_WEEKLY_SECONDS);
    const deduction = updatedPaid - previousPaid;
    if (deduction > 0) {
      update.$inc = update.$inc || {};
      update.$inc.packSecondsRemaining = -deduction;
      user.packSecondsRemaining = Math.max(0, (user.packSecondsRemaining || 0) - deduction);
    }
  }

  try {
    await User.findByIdAndUpdate(user._id, update);
  } catch (err) {
    console.error('[AiTimeMeter] write failed:', err.message);
  }

  // Mirror locally so repeat callers in one session stay consistent.
  user.weeklyAISeconds = updatedUsed;
  if (resetPending) user.lastAIQuotaReset = now;

  return {
    billedSeconds,
    usedSeconds: updatedUsed,
    remainingSeconds: remainingAiSeconds(user, now),
  };
}

module.exports = {
  FREE_WEEKLY_SECONDS,
  FREE_QUOTA_RESET_DAYS,
  isResetPending,
  usedAiSeconds,
  packSecondsRemaining,
  remainingAiSeconds,
  meterAiSeconds,
};
