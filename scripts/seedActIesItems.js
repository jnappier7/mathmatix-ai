// scripts/seedActIesItems.js
// Seeds the ACT "Integrating Essential Skills" expansion bank
// (seeds/act-ies-expansion/ies-items.generated.json) into the Problem collection.
//
// WHY THIS BANK EXISTS
// Integrating Essential Skills is the multi-step half of ACT math — problems
// that synthesize arithmetic, percentages, rates, ratios, averages and basic
// geometry in context. This bank gives those skills enough depth that no two
// practice forms have to repeat an item.
//
// CORRECTION 2026-09-21. This header used to read "the real ACT devotes 40–43%
// of its math section to Integrating Essential Skills", and on that basis the
// blueprint was moved from 9 of 45 slots to 19. That figure is the LEGACY
// 60-question ACT's share. The enhanced (2025+) 45-question section is 80/20:
// ACT's own "Preparing for the ACT" ((c) 2026) states Integrating Essential
// Skills at 20%, and both official practice forms score it at exactly 8 of 41
// scored items. So 9 of 45 was never an under-weighting forced by a thin bank —
// it was correct, and the bank's depth was used to argue the exam into the wrong
// shape. Depth is a reason to stop generating, never a reason to re-weight.
//
// The bank now also carries act-average-median and act-number-forms, the two
// concept areas ACT names for IES that had no coverage at all. See
// scripts/generateIesConceptCoverage.js.
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
