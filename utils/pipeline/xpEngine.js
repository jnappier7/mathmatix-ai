/**
 * XP ENGINE — Shared XP calculation for all routes
 *
 * Eliminates duplication between persist.js (pipeline path) and
 * courseChat.js (standalone course path). Both now call the same
 * pure functions for tier calculation, totals, and level-up logic.
 *
 * @module pipeline/xpEngine
 */

const BRAND_CONFIG = require('../brand');
const { calculateXpBoostFactor } = require('../promptCompressor');

const HINT_REGEX = /\b(hint|help|stuck|don'?t know|idk|confused)\b/i;

/**
 * Compute the full XP breakdown for a single turn.
 *
 * @param {Object} params
 * @param {boolean} params.wasCorrect - Whether the student answered correctly
 * @param {Array}   params.recentMessages - Last ~6 conversation messages (for hint detection)
 * @param {Object}  [params.extracted] - Verified extracted data (coreBehaviorXp, legacyXp)
 * @param {number}  [params.userLevel] - Current user level (for boost factor)
 * @param {boolean} [params.isCourseSession] - Whether this is a course session (1.5x boost)
 * @returns {Object} XP breakdown { tier1, tier2, tier2Type, tier3, tier3Behavior, total, courseBoost? }
 */
function computeXpBreakdown({ wasCorrect, recentMessages, extracted, userLevel, isCourseSession }) {
  const xpLadder = BRAND_CONFIG.xpLadder;
  const breakdown = { tier1: 0, tier2: 0, tier2Type: null, tier3: 0, tier3Behavior: null, total: 0 };

  // Tier 1: silent turn XP — always awarded
  breakdown.tier1 = xpLadder.tier1.amount;

  // Tier 2: performance XP — correct answers only
  if (wasCorrect) {
    const askedForHint = (recentMessages || []).some(msg =>
      msg.role === 'user' && HINT_REGEX.test(msg.content)
    );
    breakdown.tier2 = askedForHint ? xpLadder.tier2.correct : xpLadder.tier2.clean;
    breakdown.tier2Type = askedForHint ? 'correct' : 'clean';
  }

  // Tier 3: core behavior XP — AI-awarded for learning behaviors
  if (extracted?.coreBehaviorXp) {
    const boost = calculateXpBoostFactor(userLevel);
    const boosted = Math.round(extracted.coreBehaviorXp.amount * boost.factor);
    const maxAllowed = Math.round(xpLadder.maxTier3PerTurn * boost.factor);
    breakdown.tier3 = Math.min(boosted, maxAllowed);
    breakdown.tier3Behavior = extracted.coreBehaviorXp.behavior;
  } else if (extracted?.legacyXp) {
    // Legacy fallback for older AI model outputs
    breakdown.tier2 = Math.min(extracted.legacyXp.amount, xpLadder.maxTier2PerTurn);
    breakdown.tier2Type = 'legacy';
  }

  // Total
  breakdown.total = breakdown.tier1 + breakdown.tier2 + breakdown.tier3;

  // Course boost: 1.5x for structured course sessions
  if (isCourseSession) {
    breakdown.courseBoost = 1.5;
    breakdown.total = Math.round(breakdown.total * 1.5);
  }

  return breakdown;
}

/**
 * Apply an XP breakdown to a user document.
 * Updates xp, xpLadderStats, level, and unlockedItems.
 * Does NOT save — caller is responsible for user.save().
 *
 * @param {Object} user - Mongoose user document (mutated in place)
 * @param {Object} breakdown - XP breakdown from computeXpBreakdown
 * @returns {Object} { leveledUp: boolean, tutorsUnlocked: string[] }
 */
function applyXpToUser(user, breakdown) {
  user.xp = (user.xp || 0) + breakdown.total;

  // XP ladder analytics
  if (!user.xpLadderStats) {
    user.xpLadderStats = { lifetimeTier1: 0, lifetimeTier2: 0, lifetimeTier3: 0, tier3Behaviors: [] };
  }
  user.xpLadderStats.lifetimeTier1 = (user.xpLadderStats.lifetimeTier1 || 0) + breakdown.tier1;
  user.xpLadderStats.lifetimeTier2 = (user.xpLadderStats.lifetimeTier2 || 0) + breakdown.tier2;
  user.xpLadderStats.lifetimeTier3 = (user.xpLadderStats.lifetimeTier3 || 0) + breakdown.tier3;

  if (breakdown.tier3 > 0 && breakdown.tier3Behavior) {
    const existing = user.xpLadderStats.tier3Behaviors.find(b => b.behavior === breakdown.tier3Behavior);
    if (existing) {
      existing.count += 1;
      existing.lastEarned = new Date();
    } else {
      user.xpLadderStats.tier3Behaviors.push({
        behavior: breakdown.tier3Behavior,
        count: 1,
        lastEarned: new Date(),
      });
    }
  }
  user.markModified('xpLadderStats');

  // Level up check
  let leveledUp = false;
  while (user.xp >= BRAND_CONFIG.cumulativeXpForLevel((user.level || 1) + 1)) {
    user.level += 1;
    leveledUp = true;
  }

  // Tutor unlocks (variable ratio with behavior triggers)
  const { getTutorsToUnlock } = require('../unlockTutors');
  const behaviorStats = user.xpLadderStats?.tier3Behaviors || [];
  const tutorsUnlocked = getTutorsToUnlock(user.level, user.unlockedItems || [], behaviorStats);
  if (tutorsUnlocked.length > 0) {
    user.unlockedItems = user.unlockedItems || [];
    user.unlockedItems.push(...tutorsUnlocked);
    user.markModified('unlockedItems');
  }

  // Avatar builder unlock at Level 2
  let avatarBuilderUnlocked = false;
  if (leveledUp && user.level >= 2 && !user.avatarBuilderUnlocked) {
    user.avatarBuilderUnlocked = true;
    avatarBuilderUnlocked = true;
  }

  return { leveledUp, tutorsUnlocked, avatarBuilderUnlocked };
}

module.exports = { computeXpBreakdown, applyXpToUser, HINT_REGEX };
