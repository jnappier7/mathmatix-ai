// scripts/seedLowVolumeExpansion.js
// Idempotently upserts the July 2026 low-volume skill-bank expansion.
//
// Usage:
//   node scripts/seedLowVolumeExpansion.js
//   node scripts/seedLowVolumeExpansion.js --fresh
//
// --fresh removes only this expansion's prior items before inserting. It does
// not touch legacy, ACT Fable, SAT, Algebra 1, or Calculus banks.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const SEED_DIR = path.join(__dirname, '..', 'seeds', 'low-volume-expansion');
const FILES = [
  'act-items.generated.json',
  'calc3-items.generated.json',
  'general-items.generated.json',
];
const SOURCE = 'low-volume-expansion-2026-07';

function loadItems() {
  return FILES.flatMap((name) => {
    const file = path.join(SEED_DIR, name);
    if (!fs.existsSync(file)) {
      throw new Error(`Missing ${path.relative(process.cwd(), file)}`);
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  });
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set.');
    process.exit(1);
  }

  const items = loadItems();
  await mongoose.connect(process.env.MONGO_URI);
  const Problem = require('../models/problem');

  if (process.argv.includes('--fresh')) {
    const removed = await Problem.deleteMany({ source: SOURCE });
    console.log(`Removed ${removed.deletedCount} prior ${SOURCE} items.`);
  }

  const ops = items.map((item) => ({
    updateOne: {
      filter: { problemId: item.problemId },
      update: { $set: item },
      upsert: true,
    },
  }));
  const result = await Problem.bulkWrite(ops, { ordered: false });
  console.log(`Processed ${items.length} low-volume expansion items.`);
  console.log(`  upserted: ${result.upsertedCount}; modified: ${result.modifiedCount}; matched: ${result.matchedCount}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('seedLowVolumeExpansion failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
