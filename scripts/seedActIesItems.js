// scripts/seedActIesItems.js
// Seeds the ACT "Integrating Essential Skills" expansion bank
// (seeds/act-ies-expansion/ies-items.generated.json) into the Problem collection.
//
// WHY THIS BANK EXISTS
// The real ACT devotes 40–43% of its math section to Integrating Essential
// Skills — the multi-step problems that synthesize arithmetic, percentages,
// rates, ratios, and basic geometry in context. Our bank held only 105 IES
// items, which forced seeds/act-math-blueprint.json to under-weight IES at
// 9 of 45 slots (20%) just to keep enough depth for non-repeating forms.
// These 300 items (50 across each of the 6 IES skills) are what let the
// blueprint move to the authentic weight without running the bank dry.
//
// Usage:
//   node scripts/seedActIesItems.js            # upsert (idempotent)
//   node scripts/seedActIesItems.js --fresh    # clear THIS bank's prior rows first
//
// Prefer `npm run seed:all` — it runs this in the one order that works and then
// re-runs the answer.equivalents backfill, which this seeder's re-upsert of
// `answer.value` would otherwise strip.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ITEMS_FILE = path.join(__dirname, '..', 'seeds', 'act-ies-expansion', 'ies-items.generated.json');
const SOURCE = 'act-ies-expansion';

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set.');
    process.exit(1);
  }
  if (!fs.existsSync(ITEMS_FILE)) {
    console.error(`Missing ${path.relative(process.cwd(), ITEMS_FILE)}`);
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
  const fresh = process.argv.includes('--fresh');

  await mongoose.connect(process.env.MONGO_URI);
  const Problem = require('../models/problem');

  if (fresh) {
    // Scoped to THIS bank's source — never a blanket delete.
    const del = await Problem.deleteMany({ source: SOURCE });
    console.log(`Cleared ${del.deletedCount} prior ${SOURCE} items (--fresh).`);
  }

  let up = 0;
  for (const it of items) {
    await Problem.updateOne({ problemId: it.problemId }, { $set: it }, { upsert: true });
    up += 1;
  }

  const bySkill = items.reduce((acc, i) => { acc[i.skillId] = (acc[i.skillId] || 0) + 1; return acc; }, {});
  console.log(`Processed ${up} ACT IES expansion items across ${Object.keys(bySkill).length} skills.`);
  Object.entries(bySkill).sort().forEach(([s, n]) => console.log(`  ${s}: ${n}`));

  const inDb = await Problem.countDocuments({ source: SOURCE });
  console.log(`${SOURCE} now has ${inDb} items in the database.`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('seedActIesItems failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
