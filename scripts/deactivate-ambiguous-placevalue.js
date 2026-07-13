#!/usr/bin/env node
/**
 * Deactivate ambiguous place-value problems.
 *
 * Problems shaped "In the number N, what place is the digit D?" are ambiguous
 * when D appears more than once in N (e.g. 277 → the 7 is in BOTH the tens and
 * ones place). These have no single correct answer and must not be served.
 *
 * The generator (scripts/generate-all-pattern-problems.js :: generatePlaceValue)
 * has been fixed to only ever pick a unique target digit, but pre-existing rows
 * in the DB still need cleanup. This sets isActive:false (non-destructive — the
 * docs are preserved for audit and can be reactivated/regenerated later).
 *
 * USAGE:
 *   node scripts/deactivate-ambiguous-placevalue.js            # dry run (default)
 *   node scripts/deactivate-ambiguous-placevalue.js --apply    # actually update
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Problem = require('../models/problem');

const APPLY = process.argv.includes('--apply');
const PROMPT_RE = /^In the number (\d+), what place is the digit (\d)\?/;

function isAmbiguous(prompt) {
  const m = String(prompt || '').match(PROMPT_RE);
  if (!m) return false;
  const [, num, digit] = m;
  return num.split('').filter(c => c === digit).length > 1;
}

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('No MONGODB_URI / MONGO_URI in environment. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (will update)' : 'DRY RUN (no writes)'}`);

  // Narrow the scan with a prefix query, then verify ambiguity in JS.
  const candidates = await Problem.find({
    prompt: { $regex: /^In the number \d+, what place is the digit \d\?/ },
    isActive: { $ne: false }
  }).select('problemId prompt isActive').lean();

  const ambiguous = candidates.filter(p => isAmbiguous(p.prompt));

  console.log(`Scanned ${candidates.length} active place-value problems.`);
  console.log(`Found ${ambiguous.length} ambiguous (repeated target digit).`);
  ambiguous.slice(0, 20).forEach(p => console.log(`  - ${p.problemId}: ${p.prompt}`));
  if (ambiguous.length > 20) console.log(`  ... and ${ambiguous.length - 20} more`);

  if (APPLY && ambiguous.length > 0) {
    const ids = ambiguous.map(p => p.problemId);
    const result = await Problem.updateMany(
      { problemId: { $in: ids } },
      { $set: { isActive: false } }
    );
    console.log(`Deactivated ${result.modifiedCount} problems.`);
  } else if (!APPLY) {
    console.log('Dry run complete. Re-run with --apply to deactivate.');
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
