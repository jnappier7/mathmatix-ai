// scripts/seedActEnhancedItems.js
// Seeds the `act-enhanced-2026-09` drop
// (seeds/act-enhanced/act-items.generated.json) into the Problem collection.
//
// The drop arrives with its own 84-skill taxonomy, none of which appears in
// seeds/act-math-blueprint.json — so every item would be undrawable by
// assembleForm. scripts/ingestActEnhancedItems.js maps it onto the blueprint's
// skills and normalizes the payload (options as {label,text}, correctOption as
// a LETTER, not the drop's 0-based index); this only writes the result.
//
// It roughly doubles how many fully-fresh forms a student can sit before the
// no-repeat ledger runs them out: 18 -> 37 at the current weights.
//
// Usage:
//   node scripts/seedActEnhancedItems.js            # upsert (idempotent)
//   node scripts/seedActEnhancedItems.js --fresh    # clear THIS bank's prior rows first
//
// Prefer `npm run seed:all` — it runs this in the one order that works and then
// re-runs the answer.equivalents backfill, which this seeder's re-upsert of
// `answer.value` would otherwise strip.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ITEMS_FILE = path.join(__dirname, '..', 'seeds', 'act-enhanced', 'act-items.generated.json');
const SOURCE = 'act-enhanced-2026-09';

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
