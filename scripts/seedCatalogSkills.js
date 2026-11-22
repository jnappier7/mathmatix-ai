// scripts/seedCatalogSkills.js
// Fill in the skills that the two big catalogs (unified, pattern) do not carry:
// the per-course curriculum files and the legacy catalog.
//
// WHY. `npm run seed:all` seeded only the unified and pattern catalogs, then
// the item banks — and seedBankTopupItems refuses to seed an item whose skill is
// not in the Skill collection. Production has those skills (they were seeded
// by hand, long ago, from the files below), so the plan worked there and
// nowhere else: on an empty database it stopped at the bank top-up with
// "15 skillId(s) not found" and seeded nothing after it. 268 of production's
// 807 skills came from outside the plan.
//
// INSERT-ONLY, on purpose. Each skill is written with $setOnInsert: a skill
// that already exists — from an earlier step of this run, or edited in
// production — is left exactly as it is. So this is a no-op on a database
// that already has the catalog, and it can never overwrite a prerequisite
// graph or teaching guidance someone tuned. (scripts/seed-curriculum.js writes
// the same course files with $set and DOES overwrite; it is not in the plan.)
//
//   node scripts/seedCatalogSkills.js            # insert what is missing
//   node scripts/seedCatalogSkills.js --dry-run  # validate the files, no writes

try { require('dotenv').config(); } catch { /* env comes from the shell (seedAll --list works with no node_modules) */ }
const fs = require('fs');
const path = require('path');

const SEEDS = path.join(__dirname, '..', 'seeds');

// K → Calculus 3, then test prep, then the legacy catalog. Order only matters
// where two files name the same skill: the first one wins.
const FILES = [
  'skills-kindergarten.json',
  'skills-grade-1.json',
  'skills-grade-2.json',
  'skills-grade-3.json',
  'skills-grade-4.json',
  'skills-grade-5.json',
  'skills-grade-6.json',
  'skills-ready-for-algebra.json',
  'skills-grade-7.json',
  'skills-grade-8.json',
  'skills-algebra-1.json',
  'skills-algebra-1-fable.json',
  'skills-geometry.json',
  'skills-algebra-2.json',
  'skills-precalculus.json',
  'skills-ap-calculus-ab.json',
  'skills-calculus-1.json',
  'skills-calculus-2.json',
  'skills-calculus-3.json',
  'skills-act-math-prep.json',
  // Skills production carries that no other seed file does (calc3-*, the
  // trig laws, a handful of K-8 skills). Without them the bank top-up aborts.
  'skills-legacy-catalog.json',
];

/** Every skill in the files, first mention wins. */
function loadSkills() {
  const byId = new Map();
  for (const file of FILES) {
    const rows = JSON.parse(fs.readFileSync(path.join(SEEDS, file), 'utf8'));
    for (const row of rows) {
      if (row && row.skillId && !byId.has(row.skillId)) byId.set(row.skillId, row);
    }
  }
  return [...byId.values()];
}

async function main() {
  const skills = loadSkills();
  const bad = skills.filter((s) => !s.displayName || !s.description || !s.category);
  if (bad.length) {
    console.error(`${bad.length} skills are missing a displayName, description or category:`);
    bad.slice(0, 20).forEach((s) => console.error(`  ${s.skillId}`));
    process.exit(1);
  }
  if (process.argv.includes('--dry-run')) {
    console.log(`${skills.length} catalog skills valid across ${FILES.length} files (dry run — nothing written).`);
    return;
  }
  if (!process.env.MONGO_URI) { console.error('MONGO_URI not set.'); process.exit(1); }

  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGO_URI);
  // Written the way production got them (scripts/seed-curriculum.js): cast by
  // the schema but NOT enum-validated. About a hundred course skills carry a
  // category the Skill enum does not list ("applications-derivatives",
  // "polygons"), and production holds them that way; validating here would
  // leave an empty database a hundred skills short of production, and their
  // items orphaned. The count is printed so the drift stays visible.
  const Skill = require('../models/skill');
  const allowed = new Set(Skill.schema.path('category').enumValues || []);
  const offEnum = skills.filter((s) => allowed.size && !allowed.has(s.category)).length;

  const res = await Skill.bulkWrite(
    skills.map((skill) => ({
      updateOne: { filter: { skillId: skill.skillId }, update: { $setOnInsert: skill }, upsert: true },
    })),
    { ordered: false }
  );
  const inserted = res.upsertedCount || 0;
  console.log(`Catalog skills: ${inserted} inserted, ${skills.length - inserted} already present (left untouched).`);
  if (offEnum) console.log(`  (${offEnum} of the ${skills.length} carry a category outside the Skill enum, as in production.)`);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => { console.error('seedCatalogSkills failed:', err.message); process.exit(1); });
}

module.exports = { FILES, loadSkills };
