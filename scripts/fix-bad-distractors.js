/**
 * FIX BAD DISTRACTORS IN ALL PROBLEMS
 *
 * Finds and fixes problems with nonsensical distractors like
 * "Cannot be determined", "Not enough information", "None of the above".
 *
 * Handles:
 * - Comparison problems (>, <, =)
 * - Place value problems (ones, tens, hundreds, thousands)
 * - Other problem types
 *
 * Run: node scripts/fix-bad-distractors.js --dry-run  (preview)
 * Run: node scripts/fix-bad-distractors.js --confirm  (apply)
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
  'not applicable',
  'n/a',
];

// Good options for different problem types
const PLACE_VALUE_OPTIONS = ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands', 'hundred thousands'];
const COMPARISON_OPTIONS = ['>', '<', '='];

function hasBadDistractors(options) {
  if (!options || !Array.isArray(options)) return false;
  return options.some(opt => {
    const text = (opt.text || opt || '').toString().toLowerCase().trim();
    return BAD_DISTRACTORS.some(bad => text.includes(bad));
  });
}

function detectProblemType(problem) {
  const prompt = (problem.prompt || problem.content || '').toLowerCase();
  const skillId = (problem.skillId || '').toLowerCase();
  const answer = (problem.answer?.value || problem.answer || '').toString();
  const answerLower = answer.toLowerCase();

  // Coordinate pair detection - answers like (5, -6) or (-3, 4)
  if (/\(\s*-?\d+\s*,\s*-?\d+\s*\)/.test(answer) ||
      prompt.includes('coordinate') || prompt.includes('quadrant') ||
      prompt.includes('ordered pair') || skillId.includes('coordinate')) {
    return 'coordinates';
  }

  // Place value detection
  if (prompt.includes('place') || prompt.includes('digit') ||
      skillId.includes('place-value') || skillId.includes('place_value') ||
      PLACE_VALUE_OPTIONS.some(p => answerLower.includes(p))) {
    return 'place-value';
  }

  // Comparison detection
  if (prompt.includes('compare') || prompt.includes('___') ||
      skillId.includes('compar') ||
      ['>', '<', '=', '>=', '<='].includes(answer.trim())) {
    return 'comparison';
  }

  // Shape detection
  const shapes = ['triangle', 'square', 'rectangle', 'circle', 'pentagon', 'hexagon'];
  if (shapes.some(s => prompt.includes(s) || answerLower.includes(s))) {
    return 'shapes';
  }

  return 'unknown';
}

function generateGoodOptions(problem, problemType) {
  const answer = (problem.answer?.value || problem.answer || '').toString();
  const answerLower = answer.toLowerCase().trim();

  if (problemType === 'coordinates') {
    // Parse the coordinate pair (x, y)
    const match = answer.match(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/);
    if (match) {
      const x = parseInt(match[1]);
      const y = parseInt(match[2]);
      // Generate wrong answers by flipping signs
      const distractors = [
        `(${-x}, ${y})`,    // flip x
        `(${x}, ${-y})`,    // flip y (if not already negative this is different)
        `(${-x}, ${-y})`,   // flip both
        `(${y}, ${x})`,     // swap x and y
      ].filter(d => d !== answer);

      const allOptions = [answer, ...distractors.slice(0, 3)];
      const shuffled = allOptions.sort(() => Math.random() - 0.5);
      return shuffled.map((text, idx) => ({
        label: String.fromCharCode(65 + idx),
        text
      }));
    }
  }

  if (problemType === 'place-value') {
    // For place value, use place value terms as options
    const options = PLACE_VALUE_OPTIONS.filter(p => p !== answerLower);
    const shuffled = [answer, ...options.slice(0, 3)].sort(() => Math.random() - 0.5);
    return shuffled.map((text, idx) => ({
      label: String.fromCharCode(65 + idx),
      text: text.charAt(0).toUpperCase() + text.slice(1)
    }));
  }

  if (problemType === 'comparison') {
    const options = COMPARISON_OPTIONS.map((text, idx) => ({
      label: String.fromCharCode(65 + idx),
      text
    }));
    return options;
  }

  if (problemType === 'shapes') {
    const shapes = ['Triangle', 'Square', 'Rectangle', 'Circle', 'Pentagon', 'Hexagon'];
    const correctCapitalized = answer.charAt(0).toUpperCase() + answer.slice(1).toLowerCase();
    const options = shapes.filter(s => s.toLowerCase() !== answerLower);
    const shuffled = [correctCapitalized, ...options.slice(0, 3)].sort(() => Math.random() - 0.5);
    return shuffled.map((text, idx) => ({
      label: String.fromCharCode(65 + idx),
      text
    }));
  }

  // For unknown types, return null (don't auto-fix)
  return null;
}

function findCorrectLabel(options, answer) {
  const answerLower = answer.toLowerCase().trim();
  for (const opt of options) {
    if ((opt.text || '').toLowerCase().trim() === answerLower) {
      return opt.label;
    }
  }
  return 'A'; // fallback
}

async function main() {
  console.log('=== FIX BAD DISTRACTORS ===\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : 'LIVE'}`);

  if (!DRY_RUN && !CONFIRM) {
    console.log('\nERROR: Live mode requires --confirm flag');
    console.log('Run: node scripts/fix-bad-distractors.js --confirm');
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  console.log(`\nConnecting to MongoDB...`);
  await mongoose.connect(mongoUri);
  console.log('Connected\n');

  // Find ALL multiple choice problems
  const allMCProblems = await Problem.find({ answerType: 'multiple-choice' });
  console.log(`Found ${allMCProblems.length} multiple-choice problems\n`);

  // Filter to those with bad distractors
  const problemsWithBadDistractors = allMCProblems.filter(p => hasBadDistractors(p.options));
  console.log(`Found ${problemsWithBadDistractors.length} problems with bad distractors\n`);

  let fixed = 0;
  let skipped = 0;
  let byType = { 'coordinates': 0, 'place-value': 0, 'comparison': 0, 'shapes': 0, 'unknown': 0 };

  for (const problem of problemsWithBadDistractors) {
    const problemType = detectProblemType(problem);
    byType[problemType]++;

    const newOptions = generateGoodOptions(problem, problemType);

    if (!newOptions) {
      console.log(`[SKIP] ${problem.problemId} (${problemType}) - no auto-fix available`);
      console.log(`       Prompt: ${(problem.prompt || '').substring(0, 60)}`);
      console.log(`       Answer: ${problem.answer?.value || problem.answer}`);
      console.log(`       Options: ${(problem.options || []).map(o => o.text || o).join(' | ')}`);
      console.log();
      skipped++;
      continue;
    }

    const answer = (problem.answer?.value || problem.answer || '').toString();
    const correctLabel = findCorrectLabel(newOptions, answer);

    console.log(`[FIX] ${problem.problemId} (${problemType})`);
    console.log(`      Prompt: ${(problem.prompt || '').substring(0, 60)}`);
    console.log(`      Old: ${(problem.options || []).map(o => o.text || o).join(' | ')}`);
    console.log(`      New: ${newOptions.map(o => o.text).join(' | ')}`);
    console.log(`      Correct: ${answer} → ${correctLabel}`);
    console.log();

    if (!DRY_RUN) {
      await Problem.updateOne(
        { _id: problem._id },
        {
          $set: {
            options: newOptions,
            correctOption: correctLabel
          }
        }
      );
    }

    fixed++;
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total with bad distractors: ${problemsWithBadDistractors.length}`);
  console.log(`Fixed: ${fixed}`);
  console.log(`Skipped (need manual review): ${skipped}`);
  console.log(`\nBy type:`);
  console.log(`  Coordinates: ${byType['coordinates']}`);
  console.log(`  Place value: ${byType['place-value']}`);
  console.log(`  Comparison: ${byType['comparison']}`);
  console.log(`  Shapes: ${byType['shapes']}`);
  console.log(`  Unknown: ${byType['unknown']}`);

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
