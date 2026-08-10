// scripts/purgeOnboardingIntentText.js
//
// Clears user.onboarding.intentText from every account that still carries one.
//
// Why this exists
// ---------------
// onboarding.html asks "what brings you to Mathmatix?" and captures the answer
// by voice or text. For months the raw answer was stored on the user document
// and read by nothing — no route, no prompt, no report. routes/onboarding.js
// now classifies the text into the intentCategory enum and discards it, so
// nothing new is written; this clears what was written before.
//
// It is up to 2000 characters of free-form voice input from a minor. Keeping
// data nobody looks at is a minimisation problem rather than a tidiness one,
// and "we stopped writing it" does not shrink what is already in the database.
//
// The CATEGORY is kept. That is the part with a consumer (utils/onboardingIntent.js)
// and it is a bounded schema enum, so it carries the signal without the text.
//
// Usage
// -----
//   node scripts/purgeOnboardingIntentText.js --dry     # count only, no writes
//   node scripts/purgeOnboardingIntentText.js           # unset the field
//
// Idempotent: re-running finds nothing because the filter is "field exists".

try {
  require('dotenv').config();
} catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND') throw err;
}

const mongoose = require('mongoose');
const User = require('../models/user');

const DRY = process.argv.includes('--dry');

async function purgeOnboardingIntentText() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set — refusing to run.');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(process.env.MONGO_URI);

  // $ne: null catches both a stored string and a legacy empty string; a user
  // who never answered has no field at all and is not touched.
  const filter = { 'onboarding.intentText': { $exists: true, $ne: null } };
  const count = await User.countDocuments(filter);

  if (count === 0) {
    console.log('purge: no stored onboarding intentText — nothing to do.');
    return;
  }

  if (DRY) {
    console.log(`purge (dry run): ${count} account(s) still carry onboarding.intentText.`);
    console.log('purge (dry run): intentCategory would be left in place on all of them.');
    return;
  }

  const result = await User.updateMany(filter, { $unset: { 'onboarding.intentText': '' } });
  console.log(`purge: cleared onboarding.intentText on ${result.modifiedCount} of ${count} account(s).`);

  const remaining = await User.countDocuments(filter);
  if (remaining > 0) {
    // Not a partial success to shrug at — say so loudly and exit non-zero so a
    // scheduled run cannot report green while data is still sitting there.
    console.error(`purge: ${remaining} account(s) STILL carry intentText after the update.`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  purgeOnboardingIntentText()
    .catch((err) => {
      console.error('purge: failed —', err);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { purgeOnboardingIntentText };
