// scripts/normalizeMasteryScoreScale.js
//
// One-time migration: put every skillMastery.masteryScore on the canonical
// 0-100 scale (utils/masteryScore.js; models/user.js `max: 100`).
//
// Placement and lesson-start writers used to seed 0-1 values (1.0 / 0.5 / 0.3 /
// 0.1) while the pillar engine writes 0-100. Prod 2026-10-13, one roster: 451
// scores on 0-1, 12 on 0-100 — and a teacher tile showing "Avg Mastery 287%".
// Readers already normalize on read, so nothing is broken without this; what
// it buys is stored data that means one thing, so the next reader that forgets
// to normalize is not wrong.
//
// The 0/1 ambiguity resolves exactly as normalizedMasteryScore() does: a value
// in (0, 1] is the placement scale (1.0 = placement-mastered → 100). 0 stays 0.
// Integers ≥ 2 are already canonical and are never touched.
//
// Usage:
//   node scripts/normalizeMasteryScoreScale.js            # DRY RUN — reports, writes nothing
//   node scripts/normalizeMasteryScoreScale.js --apply
//   node scripts/normalizeMasteryScoreScale.js --limit 50  # sample

const { normalizedMasteryScore } = require('../utils/masteryScore');

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 0;

/** The $set for one user's skillMastery map, or null. Exported for tests. */
function planUser(skillMastery) {
  const set = {};
  const entries = skillMastery instanceof Map ? [...skillMastery.entries()] : Object.entries(skillMastery || {});
  for (const [skillId, entry] of entries) {
    const raw = entry && entry.masteryScore;
    if (typeof raw !== 'number' || !(raw > 0 && raw <= 1)) continue;
    // Map keys may contain dots in theory; ours are slug ids. Guard anyway.
    if (skillId.includes('.') || skillId.startsWith('$')) continue;
    set[`skillMastery.${skillId}.masteryScore`] = normalizedMasteryScore(raw);
  }
  return Object.keys(set).length ? set : null;
}

async function main() {
  require('dotenv').config();
  const mongoose = require('mongoose');
  const User = require('../models/user');
  await mongoose.connect(process.env.MONGO_URI);

  let query = User.find({ skillMastery: { $exists: true, $ne: {} } }).select('_id skillMastery').lean();
  if (LIMIT) query = query.limit(LIMIT);
  const cursor = query.cursor();

  let users = 0, changedUsers = 0, changedScores = 0;
  const histogram = {};
  for await (const u of cursor) {
    users++;
    const set = planUser(u.skillMastery);
    if (!set) continue;
    changedUsers++;
    for (const [k, v] of Object.entries(set)) {
      changedScores++;
      const before = u.skillMastery[k.split('.')[1]].masteryScore;
      const key = `${before} → ${v}`;
      histogram[key] = (histogram[key] || 0) + 1;
    }
    if (APPLY) await User.updateOne({ _id: u._id }, { $set: set });
  }

  console.log(`${APPLY ? 'APPLIED' : 'DRY RUN'}: scanned ${users} users; ${changedScores} scores on ${changedUsers} users ${APPLY ? 'rescaled' : 'would be rescaled'}.`);
  console.log(histogram);
  if (!APPLY) console.log('\n  re-run with --apply to write.');
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { planUser };
