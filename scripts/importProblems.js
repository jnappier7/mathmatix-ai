/**
 * PROBLEM IMPORT SCRIPT
 *
 * Imports generated MC problems into MongoDB database.
 * Also removes duplicate problems identified by deduplication.
 *
 * Run: node scripts/importProblems.js
 *
 * Options:
 *   --dry-run    Preview changes without writing to database
 *   --skip-dupes Skip duplicate removal
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');

// Import Problem model
const Problem = require('../models/problem');

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_DUPES = process.argv.includes('--skip-dupes');

async function main() {
  console.log('=== PROBLEM IMPORT ===\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}\n`);

  // Connect to database
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mathmatix';
  console.log(`Connecting to: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB\n');

  // Step 1: Remove duplicates
  if (!SKIP_DUPES) {
    await removeDuplicates();
  }

  // Step 2: Import new problems
  await importNewProblems();

  // Step 3: Summary
  await printSummary();

  await mongoose.disconnect();
  console.log('\nDone!');
}

async function removeDuplicates() {
  console.log('--- Removing Duplicates ---');

  const dupeIdsFile = './docs/duplicate-ids-to-remove.json';
  if (!fs.existsSync(dupeIdsFile)) {
    console.log('  No duplicate IDs file found, skipping\n');
    return;
  }

  const dupeIds = JSON.parse(fs.readFileSync(dupeIdsFile, 'utf8'));
  console.log(`  Found ${dupeIds.length} duplicate problem IDs to remove`);

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would delete these duplicates\n');
    return;
  }

  const result = await Problem.deleteMany({ problemId: { $in: dupeIds } });
  console.log(`  Deleted ${result.deletedCount} duplicate problems\n`);
}

async function importNewProblems() {
  console.log('--- Importing New Problems ---');

  const generatedFile = './docs/generated-problems.json';
  if (!fs.existsSync(generatedFile)) {
    console.log('  No generated problems file found, skipping\n');
    return;
  }

  const newProblems = JSON.parse(fs.readFileSync(generatedFile, 'utf8'));
  console.log(`  Found ${newProblems.length} new problems to import`);

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would import these problems\n');

    // Show breakdown by skill
    const bySkill = {};
    newProblems.forEach(p => {
      bySkill[p.skillId] = (bySkill[p.skillId] || 0) + 1;
    });
    console.log('  Problems by skill:');
    Object.entries(bySkill)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .forEach(([skill, count]) => {
        console.log(`    ${skill}: ${count}`);
      });
    if (Object.keys(bySkill).length > 15) {
      console.log(`    ... and ${Object.keys(bySkill).length - 15} more skills`);
    }
    return;
  }

  // Convert generated format to DB format
  const docsToInsert = newProblems.map(p => ({
    problemId: p.problemId,
    skillId: p.skillId,
    secondarySkillIds: p.secondarySkillIds || [],
    prompt: p.prompt,
    problemText: p.prompt, // alias
    answer: p.answer,
    correctAnswer: p.answer.value,
    answerType: p.answerType,
    problemType: p.answerType,
    difficulty: p.difficulty,
    gradeBand: p.gradeBand,
    ohioDomain: p.ohioDomain,
    tags: p.tags || [],
    isActive: true,
    source: p.source || 'generated-2026-02',
    choices: p.options ? p.options.map(o => o.text) : [],
    options: p.options || [],
  }));

  // Batch insert
  const BATCH_SIZE = 500;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < docsToInsert.length; i += BATCH_SIZE) {
    const batch = docsToInsert.slice(i, i + BATCH_SIZE);

    try {
      const result = await Problem.insertMany(batch, { ordered: false });
      inserted += result.length;
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate key - some already exist
        inserted += err.insertedDocs?.length || 0;
        skipped += batch.length - (err.insertedDocs?.length || 0);
      } else {
        console.error('  Insert error:', err.message);
      }
    }

    process.stdout.write(`\r  Imported: ${inserted}, Skipped: ${skipped}`);
  }

  console.log(`\n  Imported ${inserted} new problems (${skipped} already existed)\n`);
}

async function printSummary() {
  console.log('--- Final Summary ---');

  const totalCount = await Problem.countDocuments({ isActive: true });
  console.log(`  Total active problems: ${totalCount}`);

  // Count by grade band
  const byBand = await Problem.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$gradeBand', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  console.log('\n  By grade band:');
  byBand.forEach(b => {
    console.log(`    ${b._id || 'unknown'}: ${b.count}`);
  });

  // Count MC vs constructed
  const byType = await Problem.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$answerType', count: { $sum: 1 } } },
  ]);

  console.log('\n  By answer type:');
  byType.forEach(t => {
    console.log(`    ${t._id || 'unknown'}: ${t.count}`);
  });

  // Skills with <10 problems
  const skillCounts = await Problem.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$skillId', count: { $sum: 1 } } },
    { $match: { count: { $lt: 10 } } },
    { $count: 'lowCoverage' },
  ]);

  console.log(`\n  Skills with <10 problems: ${skillCounts[0]?.lowCoverage || 0}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
