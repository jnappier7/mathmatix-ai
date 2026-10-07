// scripts/seedActReasoningItems.js
// Seeds the ACT reasoning bank (seeds/act-reasoning/act-reasoning-items.generated.json,
// source `act-reasoning-2026-10`) into the Problem collection: questions that
// take two or three connected steps, written by
// scripts/generateActReasoningItems.js.
//
// Usage:
//   node scripts/seedActReasoningItems.js            # upsert (idempotent)
//   node scripts/seedActReasoningItems.js --fresh    # clear THIS bank's prior rows first
//
// Prefer `npm run seed:all` — it runs this in order and then re-runs the
// answer.equivalents backfill, which a re-upsert of `answer.value` would strip.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ITEMS_FILE = path.join(__dirname, '..', 'seeds', 'act-reasoning', 'act-reasoning-items.generated.json');
const SOURCE = 'act-reasoning-2026-10';

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
  const { upsertSeedProblems } = require('../utils/seedProblemUpsert');

  if (fresh) {
    // Scoped to THIS bank's source — never a blanket delete.
    const del = await Problem.deleteMany({ source: SOURCE });
    console.log(`Cleared ${del.deletedCount} prior ${SOURCE} items (--fresh).`);
  }

  // Keeps a measured difficulty measured (utils/seedProblemUpsert.js).
  const up = await upsertSeedProblems(Problem, items);

  const bySkill = items.reduce((acc, i) => { acc[i.skillId] = (acc[i.skillId] || 0) + 1; return acc; }, {});
  console.log(`Processed ${up} ${SOURCE} items across ${Object.keys(bySkill).length} skills.`);
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
