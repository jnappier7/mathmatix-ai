/**
 * FIX BROKEN DISTRACTORS (backfill) — QA P0-3
 *
 * Deactivates (isActive=false) every problem the shared detector
 * (utils/distractorQuality.js) flags as broken — un-authored
 * placeholders ("Wrong 1/2/3"), blanks/duplicates, too few options,
 * or wrong-type distractors. Deactivating is the safe, reversible
 * remediation: the question stops reaching students immediately, and
 * a human can re-author real distractors and reactivate it. We do NOT
 * auto-generate replacement distractors — that needs authoring review.
 *
 * DRY RUN BY DEFAULT. Live mode requires --confirm. This script is
 * written to be reviewed and run by a human against a known database;
 * it is NOT run automatically. Point it at prod only deliberately.
 *
 * Run: node scripts/fixPlaceholderDistractors.js            (dry-run preview)
 *      node scripts/fixPlaceholderDistractors.js --confirm  (apply)
 *      node scripts/fixPlaceholderDistractors.js --confirm --tag  (also add a tag)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const { assessOptions } = require('../utils/distractorQuality');

const CONFIRM = process.argv.includes('--confirm');
const ADD_TAG = process.argv.includes('--tag');
const DRY_RUN = !CONFIRM;

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGO_URI not set.');
    process.exit(2);
  }

  const masked = mongoUri.replace(/(mongodb(\+srv)?:\/\/)[^@]*@/, '$1***@');
  console.log('=== FIX BROKEN DISTRACTORS ===');
  console.log(`Mode:     ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (--confirm)'}`);
  console.log(`Database: ${masked}\n`);

  await mongoose.connect(mongoUri);

  const problems = await Problem.find({
    isActive: true,
    $or: [{ answerType: 'multiple-choice' }, { 'options.0': { $exists: true } }],
  });

  const toFix = [];
  for (const p of problems) {
    const { ok, issues } = assessOptions(p);
    if (!ok) toFix.push({ p, issues });
  }

  console.log(`Active MC problems scanned: ${problems.length}`);
  console.log(`Broken (will deactivate):   ${toFix.length}\n`);

  for (const { p, issues } of toFix.slice(0, 40)) {
    console.log(`  [${p.problemId}] ${p.skillId} — ${issues.map((i) => i.code).join(', ')}`);
  }
  if (toFix.length > 40) console.log(`  … and ${toFix.length - 40} more.`);

  if (DRY_RUN) {
    console.log('\nDRY RUN — nothing written. Re-run with --confirm to deactivate these.');
    await mongoose.disconnect();
    process.exit(0);
  }

  let updated = 0;
  for (const { p, issues } of toFix) {
    p.isActive = false;
    if (ADD_TAG) {
      const tag = 'bad-distractors';
      p.tags = Array.isArray(p.tags) ? p.tags : [];
      if (!p.tags.includes(tag)) p.tags.push(tag);
      const codeTag = 'distractor:' + issues.map((i) => i.code).join('+');
      if (!p.tags.includes(codeTag)) p.tags.push(codeTag);
    }
    await p.save();
    updated += 1;
  }

  console.log(`\n✅ Deactivated ${updated} problem(s).`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fix failed:', err);
  process.exit(2);
});
