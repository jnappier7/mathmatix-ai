// scripts/seedActItems.js
// Seeds the Fable-authored ACT items (seeds/act-fable-items.generated.json,
// produced by scripts/ingestFableActItems.py) into the Problem collection.
//
// Usage:
//   node scripts/seedActItems.js            # upsert
//   node scripts/seedActItems.js --fresh    # clear prior ACT items first (default via npm run act:seed)
//
// Run the Python ingestion first if the JSON is stale:
//   python3 scripts/ingestFableActItems.py

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ITEMS_FILE = path.join(__dirname, '..', 'seeds', 'act-fable-items.generated.json');

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set.');
    process.exit(1);
  }
  if (!fs.existsSync(ITEMS_FILE)) {
    console.error(`Missing ${path.relative(process.cwd(), ITEMS_FILE)} — run: python3 scripts/ingestFableActItems.py`);
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
  const fresh = process.argv.includes('--fresh');

  await mongoose.connect(process.env.MONGO_URI);
  const Problem = require('../models/problem');

  if (fresh) {
    // Clear any prior generated ACT items (Fable + legacy templates) so a
    // re-seed cleanly replaces the bank.
    const del = await Problem.deleteMany({ source: { $in: ['act-fable', 'act-template-gen'] } });
    console.log(`Cleared ${del.deletedCount} prior ACT items (--fresh).`);
  }

  let up = 0;
  for (const it of items) {
    await Problem.updateOne({ problemId: it.problemId }, { $set: it }, { upsert: true });
    up += 1;
  }
  console.log(`Upserted ${up} ACT items into MongoDB (source: act-fable).`);

  const withFig = items.filter(i => i.svg).length;
  console.log(`  ${withFig} carry an SVG figure; ${items.filter(i => i.explanation).length} carry an explanation.`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('seedActItems failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
