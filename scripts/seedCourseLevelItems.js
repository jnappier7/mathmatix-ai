// scripts/seedCourseLevelItems.js
// Seeds the at-level course check items (seeds/course-level-items.generated.json,
// written by scripts/buildCourseLevelItems.js) into the Problem collection.
//
// These are the items a course's quick check and its "I think I already know
// this!" button draw on for the skills listed in
// seeds/course-level-sources.generated.json. Until they are seeded those skills
// read as untestable and the check stops at them — so a deploy that carries the
// sources file but not this seed is safe, just shorter.
//
//   node scripts/seedCourseLevelItems.js            # upsert (idempotent)
//   node scripts/seedCourseLevelItems.js --fresh    # clear this bank's prior rows first
//   node scripts/seedCourseLevelItems.js --dry-run  # validate only, no writes

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ITEMS_FILE = path.join(__dirname, '..', 'seeds', 'course-level-items.generated.json');
const SOURCE = 'course-level-2026-11';

async function main() {
  if (!fs.existsSync(ITEMS_FILE)) {
    console.error(`Missing ${path.relative(process.cwd(), ITEMS_FILE)} — run: node scripts/buildCourseLevelItems.js`);
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
  const bad = items.filter((it) => !it.problemId || !it.skillId || !it.prompt || it.source !== SOURCE);
  if (bad.length) {
    console.error(`${bad.length} rows are missing an id, a skill, a prompt or the ${SOURCE} source — rebuild the file.`);
    process.exit(1);
  }
  if (process.argv.includes('--dry-run')) {
    console.log(`${items.length} items valid (dry run — nothing written).`);
    return;
  }
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const Problem = require('../models/problem');

  if (process.argv.includes('--fresh')) {
    const del = await Problem.deleteMany({ source: SOURCE });
    console.log(`Cleared ${del.deletedCount} prior course-level items (--fresh).`);
  }

  const ops = items.map((it) => ({
    updateOne: { filter: { problemId: it.problemId }, update: { $set: it }, upsert: true },
  }));
  await Problem.bulkWrite(ops, { ordered: false });
  // A rebuild that drops or renumbers a template would otherwise leave its old
  // rows live under the same skill.
  const keep = items.map((it) => it.problemId);
  const stale = await Problem.deleteMany({ source: SOURCE, problemId: { $nin: keep } });
  console.log(`Upserted ${items.length} course-level items (source: ${SOURCE})${stale.deletedCount ? `; removed ${stale.deletedCount} stale` : ''}.`);

  await mongoose.disconnect();
}

main().then(() => process.exit(0)).catch(async (err) => {
  console.error('seedCourseLevelItems failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
