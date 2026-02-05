/**
 * FIX COMPARISON PROBLEM DISTRACTORS
 *
 * Fixes comparison problems (>, <, =) that have nonsensical distractors like
 * "Cannot be determined", "Not enough information", "None of the above".
 *
 * Run: node scripts/fix-comparison-distractors.js
 *
 * Options:
 *   --dry-run    Preview changes without writing to database
 *   --confirm    Required for live run (safety check)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

const DRY_RUN = process.argv.includes('--dry-run');
const CONFIRM = process.argv.includes('--confirm');

// Bad distractors that should never appear in math problems
const BAD_DISTRACTORS = [
  'cannot be determined',
  'not enough information',
  'none of the above',
  'none of these',
  'all of these',
  'all of the above',
  'cannot compare',
];

// Good comparison options
const COMPARISON_OPTIONS = [
  { label: 'A', text: '>' },
  { label: 'B', text: '<' },
  { label: 'C', text: '=' },
];

async function main() {
  console.log('=== FIX COMPARISON PROBLEM DISTRACTORS ===\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : 'LIVE'}`);

  if (!DRY_RUN && !CONFIRM) {
    console.log('\nERROR: Live mode requires --confirm flag');
    console.log('Run: node scripts/fix-comparison-distractors.js --confirm');
    process.exit(1);
  }

  // Connect to database
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/mathmatix';
  console.log(`\nConnecting to: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB\n');

  // Find comparison problems with bad distractors
  // Match problems where prompt contains "compare" or "___" (comparison format)
  const comparisonProblems = await Problem.find({
    $or: [
      { prompt: { $regex: /compare/i } },
      { prompt: { $regex: /___/ } },
      { content: { $regex: /compare/i } },
      { content: { $regex: /___/ } },
      { skillId: { $regex: /compar/i } }
    ],
    answerType: 'multiple-choice'
  });

  console.log(`Found ${comparisonProblems.length} potential comparison problems\n`);

  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const problem of comparisonProblems) {
    try {
      const options = problem.options || [];
      const answer = (problem.answer?.value || problem.answer || '').toString().trim();

      // Check if this problem has bad distractors
      const hasBadDistractors = options.some(opt => {
        const text = (opt.text || opt || '').toString().toLowerCase().trim();
        return BAD_DISTRACTORS.some(bad => text.includes(bad));
      });

      if (!hasBadDistractors) {
        skipped++;
        continue;
      }

      // Determine correct answer
      let correctAnswer = answer;
      if (!['>', '<', '=', '>=', '<='].includes(correctAnswer)) {
        // Try to find it in existing options
        const correctOpt = options.find(o => o.isCorrect);
        if (correctOpt) {
          correctAnswer = correctOpt.text;
        }
      }

      // Create fixed options
      const newOptions = COMPARISON_OPTIONS.map(opt => ({
        label: opt.label,
        text: opt.text
      }));

      // Find correct label
      const correctLabel = newOptions.find(o => o.text === correctAnswer)?.label || 'A';

      console.log(`Fixing: ${problem.problemId}`);
      console.log(`  Prompt: ${(problem.prompt || problem.content || '').substring(0, 60)}`);
      console.log(`  Old options: ${options.map(o => o.text || o).join(', ')}`);
      console.log(`  New options: ${newOptions.map(o => o.text).join(', ')}`);
      console.log(`  Correct: ${correctAnswer} (${correctLabel})`);
      console.log();

      if (!DRY_RUN) {
        await Problem.updateOne(
          { _id: problem._id },
          {
            $set: {
              options: newOptions,
              correctOption: correctLabel,
              answer: { value: correctAnswer }
            }
          }
        );
      }

      fixed++;
    } catch (err) {
      errors++;
      console.error(`Error processing ${problem.problemId}: ${err.message}`);
    }
  }

  // Also fix problems that have these bad distractors regardless of type
  console.log('\n--- Checking all problems for bad distractors ---\n');

  const allBadProblems = await Problem.find({
    'options.text': { $in: BAD_DISTRACTORS.map(b => new RegExp(b, 'i')) },
    answerType: 'multiple-choice'
  });

  console.log(`Found ${allBadProblems.length} additional problems with bad distractors\n`);

  for (const problem of allBadProblems) {
    // Skip if already processed as comparison
    if (comparisonProblems.some(p => p._id.equals(problem._id))) continue;

    const options = problem.options || [];
    const answer = (problem.answer?.value || problem.answer || '').toString().trim();
    const prompt = problem.prompt || problem.content || '';

    // Determine what type of problem this is and fix accordingly
    const hasBadDistractors = options.some(opt => {
      const text = (opt.text || opt || '').toString().toLowerCase().trim();
      return BAD_DISTRACTORS.some(bad => text.includes(bad));
    });

    if (hasBadDistractors) {
      console.log(`Problem with bad distractors: ${problem.problemId}`);
      console.log(`  Skill: ${problem.skillId}`);
      console.log(`  Prompt: ${prompt.substring(0, 80)}`);
      console.log(`  Answer: ${answer}`);
      console.log(`  Options: ${options.map(o => o.text || o).join(' | ')}`);
      console.log(`  [Manual review needed - not auto-fixing]`);
      console.log();
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Comparison problems fixed: ${fixed}`);
  console.log(`Skipped (already OK): ${skipped}`);
  console.log(`Errors: ${errors}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes made. Run with --confirm for live update.');
  }

  await mongoose.disconnect();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
