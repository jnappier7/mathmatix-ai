// scripts/seedSatItems.js
// Seeds the Fable Digital SAT Math items (seeds/sat-items.generated.json,
// produced by scripts/ingestSatItems.py) into the Problem collection so the
// tutor and the SAT bootcamp rail can pull them from the bank. Both item types
// are auto-scored: MC by option letter, SPR (grid-in) by canonical value +
// equivalents — so, unlike the calc bank, there are no rubric-scored FRQs.
//
// Usage:
//   node scripts/seedSatItems.js            # upsert
//   node scripts/seedSatItems.js --fresh    # clear prior SAT items first (default via npm run sat:seed)
//
// Run the Python ingestion first if the JSON is stale:
//   python3 scripts/ingestSatItems.py

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ITEMS_FILE = path.join(__dirname, '..', 'seeds', 'sat-items.generated.json');

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set.');
    process.exit(1);
  }
  if (!fs.existsSync(ITEMS_FILE)) {
    console.error(`Missing ${path.relative(process.cwd(), ITEMS_FILE)} — run: python3 scripts/ingestSatItems.py`);
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
  const fresh = process.argv.includes('--fresh');

  await mongoose.connect(process.env.MONGO_URI);
  const Problem = require('../models/problem');

  if (fresh) {
    const del = await Problem.deleteMany({ source: 'sat-fable' });
    console.log(`Cleared ${del.deletedCount} prior SAT Math items (--fresh).`);
  }

  let up = 0;
  for (const it of items) {
    await Problem.updateOne({ problemId: it.problemId }, { $set: it }, { upsert: true });
    up += 1;
  }
  const mc = items.filter((i) => i.answerType === 'multiple-choice').length;
  console.log(`Upserted ${up} Digital SAT Math items into MongoDB (source: sat-fable).`);
  console.log(`  ${mc} MC + ${items.length - mc} grid-in; ${items.filter((i) => i.svg).length} carry a figure.`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('seedSatItems failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
