// scripts/seedCalcItems.js
// Seeds the Fable AP Calculus AB MC items (seeds/calc-items.generated.json,
// produced by scripts/ingestCalcItems.py) into the Problem collection so the
// tutor and the bootcamp rail can pull them from the bank. The weekly FRQs live
// in seeds/calc-assessment-map.json (tutor-scored against a rubric), not here.
//
// Usage:
//   node scripts/seedCalcItems.js            # upsert
//   node scripts/seedCalcItems.js --fresh    # clear prior calc items first (default via npm run calc:seed)
//
// Run the Python ingestion first if the JSON is stale:
//   python3 scripts/ingestCalcItems.py

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ITEMS_FILE = path.join(__dirname, '..', 'seeds', 'calc-items.generated.json');

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set.');
    process.exit(1);
  }
  if (!fs.existsSync(ITEMS_FILE)) {
    console.error(`Missing ${path.relative(process.cwd(), ITEMS_FILE)} — run: python3 scripts/ingestCalcItems.py`);
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
  const fresh = process.argv.includes('--fresh');

  await mongoose.connect(process.env.MONGO_URI);
  const Problem = require('../models/problem');

  if (fresh) {
    const del = await Problem.deleteMany({ source: 'calc-fable' });
    console.log(`Cleared ${del.deletedCount} prior AP Calc items (--fresh).`);
  }

  let up = 0;
  for (const it of items) {
    await Problem.updateOne({ problemId: it.problemId }, { $set: it }, { upsert: true });
    up += 1;
  }
  console.log(`Upserted ${up} AP Calc AB MC items into MongoDB (source: calc-fable).`);
  console.log(`  ${items.filter(i => i.svg).length} carry a figure; ${items.filter(i => i.explanation).length} carry an explanation.`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('seedCalcItems failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
