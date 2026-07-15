// scripts/seedAlg1Items.js
// Seeds the Fable-authored Algebra 1 assessment items
// (seeds/alg1-items.generated.json, produced by scripts/ingestAlg1Items.py)
// into the Problem collection so the tutor can pull them from the bank.
//
// Usage:
//   node scripts/seedAlg1Items.js            # upsert
//   node scripts/seedAlg1Items.js --fresh    # clear prior Algebra 1 items first (default via npm run alg1:seed)
//
// Run the Python ingestion first if the JSON is stale:
//   python3 scripts/ingestAlg1Items.py

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ITEMS_FILE = path.join(__dirname, '..', 'seeds', 'alg1-items.generated.json');

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set.');
    process.exit(1);
  }
  if (!fs.existsSync(ITEMS_FILE)) {
    console.error(`Missing ${path.relative(process.cwd(), ITEMS_FILE)} — run: python3 scripts/ingestAlg1Items.py`);
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
  const fresh = process.argv.includes('--fresh');

  await mongoose.connect(process.env.MONGO_URI);
  const Problem = require('../models/problem');

  if (fresh) {
    // Clear any prior generated Algebra 1 items so a re-seed cleanly replaces the bank.
    const del = await Problem.deleteMany({ source: 'alg1-fable' });
    console.log(`Cleared ${del.deletedCount} prior Algebra 1 items (--fresh).`);
  }

  let up = 0;
  for (const it of items) {
    await Problem.updateOne({ problemId: it.problemId }, { $set: it }, { upsert: true });
    up += 1;
  }
  console.log(`Upserted ${up} Algebra 1 items into MongoDB (source: alg1-fable).`);

  const withFig = items.filter(i => i.figure).length;
  const withExpl = items.filter(i => i.explanation).length;
  const mc = items.filter(i => i.answerType === 'multiple-choice').length;
  console.log(`  ${withFig} carry a declarative figure; ${withExpl} carry a worked explanation; ${mc} are multiple-choice.`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('seedAlg1Items failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
