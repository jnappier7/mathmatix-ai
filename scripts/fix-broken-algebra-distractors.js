/**
 * FIX BROKEN ALGEBRA DISTRACTORS
 *
 * Finds and deactivates problems with mathematically nonsensical distractors like:
 * - "-1x", "0x", "2x" in vertex form (should just be "x")
 * - "+ -4" instead of "- 4"
 * - Other malformed algebraic expressions
 *
 * Run: node scripts/fix-broken-algebra-distractors.js --dry-run
 * Run: node scripts/fix-broken-algebra-distractors.js --confirm
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

const DRY_RUN = process.argv.includes('--dry-run');
const CONFIRM = process.argv.includes('--confirm');

// Patterns that indicate broken algebra distractors
const BROKEN_PATTERNS = [
  /\b0x\b/,           // "0x" - coefficient of 0 on x makes no sense
  /\b-1x\b/,          // "-1x" - should just be "-x"
  /\b1x\b/,           // "1x" - should just be "x"
  /\b2x\b.*\^2/,      // "2x" in a squared term like "(2x + 2)^2" - wrong coefficient
  /\+ -\d/,           // "+ -4" - should be "- 4"
  /\+\s*-/,           // "+ -" with or without spaces
  /=\s*1\(/,          // "= 1(" - unnecessary coefficient of 1
  /\(-\d+x/,          // "(-2x" - negative coefficient on x in vertex form
];

// Skills that commonly have these issues
const ALGEBRA_SKILLS = [
  'vertex-form',
  'parabola',
  'quadratic',
  'completing-square',
  'transformations',
  'parent-functions',
];

function hasBrokenAlgebra(options) {
  if (!options || !Array.isArray(options)) return false;

  for (const opt of options) {
    const text = (opt.text || opt || '').toString();
    for (const pattern of BROKEN_PATTERNS) {
      if (pattern.test(text)) {
        return true;
      }
    }
  }
  return false;
}

function findBrokenPatterns(options) {
  const found = [];
  for (const opt of options) {
    const text = (opt.text || opt || '').toString();
    for (const pattern of BROKEN_PATTERNS) {
      if (pattern.test(text)) {
        found.push({ text, pattern: pattern.toString() });
        break;
      }
    }
  }
  return found;
}

async function main() {
  console.log('=== FIX BROKEN ALGEBRA DISTRACTORS ===\n');
  console.log('Looking for problems with patterns like:');
  console.log('  - "0x", "-1x", "1x" (bad coefficients)');
  console.log('  - "+ -4" (should be "- 4")');
  console.log('  - "= 1(" (unnecessary coefficient)');
  console.log('  - "(2x + 2)^2" in vertex form\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : 'LIVE'}`);

  if (!DRY_RUN && !CONFIRM) {
    console.log('\nERROR: Live mode requires --confirm flag');
    console.log('Run: node scripts/fix-broken-algebra-distractors.js --confirm');
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  console.log(`\nConnecting to MongoDB...`);
  await mongoose.connect(mongoUri);
  console.log('Connected\n');

  // Find all active MC problems
  const allMCProblems = await Problem.find({
    isActive: true,
    answerType: 'multiple-choice'
  });

  console.log(`Total active MC problems: ${allMCProblems.length}`);

  // Filter to those with broken algebra
  const brokenProblems = allMCProblems.filter(p => hasBrokenAlgebra(p.options));

  console.log(`\nFound ${brokenProblems.length} problems with broken algebra distractors\n`);

  if (brokenProblems.length === 0) {
    console.log('No problems found with broken algebra!');
    await mongoose.disconnect();
    return;
  }

  // Count by skill
  const skillCounts = {};
  for (const p of brokenProblems) {
    skillCounts[p.skillId] = (skillCounts[p.skillId] || 0) + 1;
  }

  console.log('Impact by skill:');
  const sorted = Object.entries(skillCounts).sort((a, b) => b[1] - a[1]);
  for (const [skillId, count] of sorted) {
    console.log(`  ${skillId}: ${count}`);
  }

  // Process each problem - deactivate them since we can't auto-fix algebra
  let deactivated = 0;

  console.log('\n--- Processing problems ---\n');

  for (const problem of brokenProblems) {
    const brokenOpts = findBrokenPatterns(problem.options);
    const answer = problem.answer?.value || problem.answer || '';

    console.log(`[DEACTIVATE] ${problem.problemId} (${problem.skillId})`);
    console.log(`      Prompt: ${(problem.prompt || '').substring(0, 60)}...`);
    console.log(`      Answer: ${answer}`);
    console.log(`      Broken options:`);
    for (const opt of brokenOpts) {
      console.log(`        - "${opt.text}"`);
    }
    console.log();

    if (!DRY_RUN) {
      await Problem.updateOne({ _id: problem._id }, { $set: { isActive: false } });
    }
    deactivated++;
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total with broken algebra: ${brokenProblems.length}`);
  console.log(`Deactivated: ${deactivated}`);
  console.log(`\nBy skill:`);
  for (const [skillId, count] of sorted) {
    console.log(`  ${skillId}: ${count}`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes made. Run with --confirm to apply.');
  }

  await mongoose.disconnect();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
