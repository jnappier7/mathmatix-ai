// utils/unlockTutors.js
// Variable-ratio tutor unlock system with behavior-linked triggers.
//
// Each locked tutor has:
//   unlockLevel    — minimum level required
//   unlockLevelMax — maximum level (guaranteed unlock at this level)
//   unlockTrigger  — tier3 behavior that can trigger early unlock
//   unlockTriggerCount — how many times the behavior must be demonstrated
//
// A tutor unlocks when ALL conditions are met:
//   1. userLevel >= unlockLevel (minimum threshold)
//   2. tutorId is NOT already in unlockedItems
//   3. ONE of:
//      a. The student has demonstrated the trigger behavior enough times
//         (behavior-linked early unlock — variable ratio)
//      b. userLevel >= unlockLevelMax (guaranteed unlock — safety net)
//      c. Random chance increases as level approaches unlockLevelMax
//         (variable ratio — keeps them guessing)

const TUTOR_CONFIG = require('./tutorConfig');

/**
 * Determine which tutors should unlock for this user.
 *
 * @param {number} userLevel - Current user level
 * @param {string[]} unlockedItems - Already-unlocked tutor IDs
 * @param {Object} [behaviorStats] - User's tier3Behaviors array from xpLadderStats
 * @returns {string[]} Array of newly unlocked tutor IDs
 */
function getTutorsToUnlock(userLevel, unlockedItems = [], behaviorStats = []) {
  if (typeof userLevel !== 'number' || userLevel < 1) return [];

  return Object.entries(TUTOR_CONFIG)
    .filter(([tutorId, tutor]) => {
      // Must have unlock config and not already be unlocked
      if (!tutor.unlockLevel) return false;
      if (unlockedItems.includes(tutorId)) return false;
      if (userLevel < tutor.unlockLevel) return false;

      const maxLevel = tutor.unlockLevelMax || tutor.unlockLevel;

      // Guaranteed unlock at max level (safety net)
      if (userLevel >= maxLevel) return true;

      // Check behavior trigger (early unlock)
      if (tutor.unlockTrigger && tutor.unlockTriggerCount) {
        const behaviorEntry = behaviorStats.find(b => b.behavior === tutor.unlockTrigger);
        if (behaviorEntry && behaviorEntry.count >= tutor.unlockTriggerCount) {
          return true;
        }
      }

      // Variable ratio: random chance that increases as level approaches max
      // At unlockLevel: 15% chance. At unlockLevelMax-1: 70% chance.
      const range = maxLevel - tutor.unlockLevel;
      const progress = userLevel - tutor.unlockLevel;
      const probability = range > 0
        ? 0.15 + (0.55 * (progress / range))
        : 1; // No range = unlock immediately

      // Use a deterministic-ish seed so the same level doesn't flip-flop
      // between requests. Hash the tutorId + level for consistency.
      const seed = hashCode(tutorId + userLevel);
      const roll = (seed % 100) / 100;

      return roll < probability;
    })
    .map(([tutorId]) => tutorId);
}

/**
 * Simple string hash for deterministic random rolls.
 * Same tutorId + level always produces the same result.
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

module.exports = { getTutorsToUnlock };
