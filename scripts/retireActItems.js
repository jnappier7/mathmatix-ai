// scripts/retireActItems.js
//
// Deactivate specific ACT bank items in the database — the one-off that
// carries a seed-side `isActive: false` into a database that was seeded before
// the flag was set. The seeds are authoritative on re-seed (seedActItems.js
// upserts `$set: item`), so this only closes the gap until the next
// `npm run act:seed`. Idempotent; prints what it changed.
//
//   node scripts/retireActItems.js            # apply
//   node scripts/retireActItems.js --dry-run  # report only
//
// Run from Render's Shell tab (it has MONGO_URI and Atlas access).

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

// problemId → why. Keep the reason with the id so the list explains itself.
const RETIRED = {
  // Point-to-line distance formula is not ACT Mathematics content; the item is
  // sound but belongs in a precalculus set (owner evaluation, 2026-09-09).
  'act-fable-topup1q79': 'out-of-scope: point-to-line distance formula is not ACT Mathematics content',
};

async function main() {
  const dry = process.argv.includes('--dry-run');
  await mongoose.connect(process.env.MONGO_URI);
  const ids = Object.keys(RETIRED);
  const docs = await Problem.find({ problemId: { $in: ids } }).select('problemId isActive skillId').lean();
  for (const id of ids) {
    const doc = docs.find((d) => d.problemId === id);
    if (!doc) { console.log(`- ${id}: not in the database (nothing to do)`); continue; }
    if (doc.isActive === false) { console.log(`- ${id}: already inactive`); continue; }
    console.log(`- ${id} (${doc.skillId}): ${dry ? 'would deactivate' : 'deactivating'} — ${RETIRED[id]}`);
    if (!dry) {
      await Problem.updateOne({ problemId: id }, { $set: { isActive: false, inactiveReason: RETIRED[id] } });
    }
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
