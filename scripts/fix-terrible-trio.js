/**
 * FIND AND FIX PROBLEMS WITH THE "TERRIBLE TRIO"
 *
 * Finds problems where options contain ALL THREE of:
 * - "Cannot be determined"
 * - "Not enough information"
 * - "None of the above"
 *
 * These are the worst offenders - 3 garbage options + 1 correct answer.
 *
 * Run: node scripts/fix-terrible-trio.js --dry-run  (preview)
 * Run: node scripts/fix-terrible-trio.js --confirm  (apply - deactivates them)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

const DRY_RUN = process.argv.includes('--dry-run');
const CONFIRM = process.argv.includes('--confirm');

// The terrible trio - if ALL THREE appear, it's definitely broken
const TERRIBLE_TRIO = [
  'cannot be determined',
  'not enough information',
  'none of the above',
];

function hasTerribleTrio(options) {
  if (!options || !Array.isArray(options)) return false;

  const optionTexts = options.map(opt =>
    (opt.text || opt || '').toString().toLowerCase().trim()
  );

  // Check if ALL THREE bad distractors are present
  return TERRIBLE_TRIO.every(bad =>
    optionTexts.some(text => text.includes(bad))
  );
}

async function main() {
  console.log('=== FIND PROBLEMS WITH THE TERRIBLE TRIO ===\n');
  console.log('Looking for problems with ALL THREE of:');
  console.log('  - "Cannot be determined"');
  console.log('  - "Not enough information"');
  console.log('  - "None of the above"\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : 'LIVE'}`);

  if (!DRY_RUN && !CONFIRM) {
    console.log('\nERROR: Live mode requires --confirm flag');
    console.log('Run: node scripts/fix-terrible-trio.js --confirm');
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

  // Filter to those with the terrible trio
  const terribleProblems = allMCProblems.filter(p => hasTerribleTrio(p.options));

  console.log(`\nFound ${terribleProblems.length} problems with the TERRIBLE TRIO\n`);

  if (terribleProblems.length === 0) {
    console.log('No problems found with all three bad distractors!');
    await mongoose.disconnect();
    return;
  }

  // Count by skill
  const skillCounts = {};
  for (const p of terribleProblems) {
    skillCounts[p.skillId] = (skillCounts[p.skillId] || 0) + 1;
  }

  console.log('Impact by skill:');
  const sorted = Object.entries(skillCounts).sort((a, b) => b[1] - a[1]);
  for (const [skillId, count] of sorted) {
    console.log(`  ${skillId}: ${count}`);
  }

  // Show some examples
  console.log('\n--- Sample problems ---\n');
  for (const problem of terribleProblems.slice(0, 5)) {
    console.log(`${problem.problemId}`);
    console.log(`  Skill: ${problem.skillId}`);
    console.log(`  Prompt: ${(problem.prompt || '').substring(0, 60)}...`);
    console.log(`  Answer: ${problem.answer?.value || problem.answer}`);
    console.log(`  Options: ${(problem.options || []).map(o => o.text || o).join(' | ')}`);
    console.log();
  }

  if (!DRY_RUN) {
    // Deactivate all of them
    const result = await Problem.updateMany(
      { _id: { $in: terribleProblems.map(p => p._id) } },
      { $set: { isActive: false } }
    );
    console.log(`\nDeactivated ${result.modifiedCount} problems`);
  } else {
    console.log(`\n[DRY RUN] Would deactivate ${terribleProblems.length} problems`);
    console.log('Run with --confirm to apply.');
  }

  await mongoose.disconnect();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
