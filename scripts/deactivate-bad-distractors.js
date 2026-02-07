/**
 * DEACTIVATE ALL PROBLEMS WITH BAD DISTRACTORS
 *
 * Nuclear option: Sets isActive=false for ANY problem containing
 * nonsensical distractors. They won't appear until manually fixed.
 *
 * Run: node scripts/deactivate-bad-distractors.js --dry-run  (preview)
 * Run: node scripts/deactivate-bad-distractors.js --confirm  (apply)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

const DRY_RUN = process.argv.includes('--dry-run');
const CONFIRM = process.argv.includes('--confirm');

// Bad distractors - if ANY option contains these, deactivate the problem
const BAD_DISTRACTORS = [
  'cannot be determined',
  'not enough information',
  'none of the above',
  'none of these',
  'all of these',
  'all of the above',
  'cannot compare',
  'not applicable',
];

async function main() {
  console.log('=== DEACTIVATE PROBLEMS WITH BAD DISTRACTORS ===\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : 'LIVE'}`);

  if (!DRY_RUN && !CONFIRM) {
    console.log('\nERROR: Live mode requires --confirm flag');
    console.log('Run: node scripts/deactivate-bad-distractors.js --confirm');
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  console.log(`\nConnecting to MongoDB...`);
  await mongoose.connect(mongoUri);
  console.log('Connected\n');

  // Build regex patterns for bad distractors
  const badPatterns = BAD_DISTRACTORS.map(bad => new RegExp(bad, 'i'));

  // Find all active MC problems with bad distractors
  const badProblems = await Problem.find({
    isActive: true,
    answerType: 'multiple-choice',
    $or: badPatterns.map(pattern => ({
      'options.text': { $regex: pattern }
    }))
  });

  console.log(`Found ${badProblems.length} active problems with bad distractors\n`);

  if (badProblems.length === 0) {
    console.log('No problems to deactivate!');
    await mongoose.disconnect();
    return;
  }

  // Show sample of what we're deactivating
  console.log('Sample problems to deactivate:\n');
  for (const problem of badProblems.slice(0, 10)) {
    console.log(`  ${problem.problemId}`);
    console.log(`    Skill: ${problem.skillId}`);
    console.log(`    Prompt: ${(problem.prompt || '').substring(0, 50)}...`);
    console.log(`    Options: ${(problem.options || []).map(o => o.text || o).join(' | ')}`);
    console.log();
  }

  if (badProblems.length > 10) {
    console.log(`  ... and ${badProblems.length - 10} more\n`);
  }

  if (!DRY_RUN) {
    // Deactivate all of them
    const result = await Problem.updateMany(
      {
        _id: { $in: badProblems.map(p => p._id) }
      },
      {
        $set: { isActive: false }
      }
    );

    console.log(`\nDeactivated ${result.modifiedCount} problems`);
  } else {
    console.log(`\n[DRY RUN] Would deactivate ${badProblems.length} problems`);
  }

  // Count by skill to see impact
  const skillCounts = {};
  for (const p of badProblems) {
    skillCounts[p.skillId] = (skillCounts[p.skillId] || 0) + 1;
  }

  console.log('\nImpact by skill:');
  const sorted = Object.entries(skillCounts).sort((a, b) => b[1] - a[1]);
  for (const [skillId, count] of sorted.slice(0, 20)) {
    console.log(`  ${skillId}: ${count}`);
  }
  if (sorted.length > 20) {
    console.log(`  ... and ${sorted.length - 20} more skills`);
  }

  await mongoose.disconnect();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
