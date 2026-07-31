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
const zlib = require('zlib');
const mongoose = require('mongoose');

const SEED_DIR = path.join(__dirname, '..', 'seeds', 'low-volume-expansion');
// The payloads are committed gzipped. Read the same filenames the audit script
// and the unit test read, so all three agree on what "the bank" is.
const FILES = [
  'act-items.generated.json.gz',
  'calc3-items.generated.json.gz',
  'general-items.generated.json.gz',
];
const SOURCE = 'low-volume-expansion-2026-07';
const EXPECTED_COUNT = 820;

function loadItems() {
  return FILES.flatMap((name) => {
    const file = path.join(SEED_DIR, name);
    if (!fs.existsSync(file)) {
      throw new Error(`Missing ${path.relative(process.cwd(), file)}`);
    }
    const raw = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
    const items = JSON.parse(raw);
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(`${name} did not contain a non-empty array of items.`);
    }
    return items;
  });
}

// Guard against seeding a bank that a bad regeneration has quietly hollowed
// out. Cheap to run, and it fails before touching the database.
function assertBankIsSane(items) {
  if (items.length !== EXPECTED_COUNT) {
    throw new Error(`Expected ${EXPECTED_COUNT} items, found ${items.length}.`);
  }
  const ids = new Set();
  const prompts = new Set();
  const bySkill = new Map();
  for (const item of items) {
    if (item.source !== SOURCE) {
      throw new Error(`${item.problemId} has source "${item.source}", expected "${SOURCE}".`);
    }
    if (ids.has(item.problemId)) {
      throw new Error(`Duplicate problemId: ${item.problemId}`);
    }
    ids.add(item.problemId);

    const prompt = String(item.prompt || '').trim().toLowerCase();
    if (!prompt) throw new Error(`${item.problemId} has an empty prompt.`);
    if (prompts.has(prompt)) {
      throw new Error(`Duplicate prompt on ${item.problemId}: ${item.prompt}`);
    }
    prompts.add(prompt);

    const keyed = (item.options || []).find((o) => o.label === item.correctOption);
    if (!keyed || String(keyed.text) !== String(item.answer && item.answer.value)) {
      throw new Error(`${item.problemId}: correctOption does not match answer.value.`);
    }
    if (!item.explanation || item.explanation.length < 12) {
      throw new Error(`${item.problemId} is missing a usable explanation.`);
    }

    bySkill.set(item.skillId, (bySkill.get(item.skillId) || 0) + 1);
  }
  const thin = [...bySkill.entries()].filter(([, n]) => n !== 10);
  if (thin.length) {
    throw new Error(`Skills without exactly 10 items: ${thin.map(([s, n]) => `${s}=${n}`).join(', ')}`);
  }
  return bySkill;
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set.');
    process.exit(1);
  }

  const items = loadItems();
  const bySkill = assertBankIsSane(items);

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
  console.log(`Processed ${items.length} low-volume expansion items across ${bySkill.size} skills.`);
  console.log(`  upserted: ${result.upsertedCount}; modified: ${result.modifiedCount}; matched: ${result.matchedCount}`);

  // Confirm what actually landed, rather than trusting the write result.
  const stored = await Problem.countDocuments({ source: SOURCE });
  console.log(`  ${SOURCE} now has ${stored} items in the database.`);
  if (stored !== EXPECTED_COUNT) {
    console.warn(`  WARNING: expected ${EXPECTED_COUNT}, found ${stored}.`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('seedLowVolumeExpansion failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
