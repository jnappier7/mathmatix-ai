// utils/unlockTutors.js
const TUTOR_CONFIG = require('./tutorConfig');

function getTutorsToUnlock(level, currentUnlocked = []) {
  return Object.entries(TUTOR_CONFIG)
    .filter(([id, tutor]) =>
      tutor.unlockLevel &&
      level >= tutor.unlockLevel &&
      !currentUnlocked.includes(id)
    )
    .map(([id]) => id);
}

module.exports = { getTutorsToUnlock };
// JavaScript Document