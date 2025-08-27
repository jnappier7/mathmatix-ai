// utils/unlockTutors.js  –  FULL FILE (paste-ready)
const TUTOR_CONFIG = require('./tutorConfig');

/**
 * Given the user's current level (number) and a list of already-unlocked tutor IDs,
 * return an array of tutor IDs that just became unlocked.
 * A tutor unlocks when:
 *   • it defines tutor.unlockLevel (number)  AND
 *   • userLevel >= tutor.unlockLevel         AND
 *   • tutorId is NOT already in unlockedItems
 */
function getTutorsToUnlock(userLevel, unlockedItems = []) {
  if (typeof userLevel !== 'number' || userLevel < 1) return [];

  return Object.entries(TUTOR_CONFIG)
    .filter(([tutorId, tutor]) =>
      tutor.unlockLevel &&
      userLevel >= tutor.unlockLevel &&
      !unlockedItems.includes(tutorId)
    )
    .map(([tutorId]) => tutorId);
}

module.exports = { getTutorsToUnlock };
