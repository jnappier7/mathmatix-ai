/**
 * FIND AND FIX PROBLEMS WITH THE "TERRIBLE TRIO"
 *
 * Finds problems where options contain ALL THREE of:
 * - "Cannot be determined"
 * - "Not enough information"
 * - "None of the above"
 *
 * These are the worst offenders - 3 garbage options + 1 correct answer.
 * This script FIXES them by keeping the correct answer and generating
 * appropriate distractors based on problem type.
 *
 * Run: node scripts/fix-terrible-trio.js --dry-run  (preview)
 * Run: node scripts/fix-terrible-trio.js --confirm  (apply fixes)
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

// Distractor generators by problem type
const DISTRACTORS = {
  placeValue: ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands'],
  comparison: ['>', '<', '='],
  coordinates: (x, y) => [`(${-x}, ${y})`, `(${x}, ${-y})`, `(${-x}, ${-y})`, `(${y}, ${x})`],
  transformations: ['up', 'down', 'left', 'right'].map(d => `${d} 3 units`),
  yesNo: ['Yes', 'No', 'Sometimes', 'It depends'],
  trueFalse: ['True', 'False', 'Sometimes true', 'Not always'],
};

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

function isBadDistractor(text) {
  const lower = text.toLowerCase().trim();
  return TERRIBLE_TRIO.some(bad => lower.includes(bad));
}

function detectType(problem) {
  const prompt = (problem.prompt || '').toLowerCase();
  const answer = (problem.answer?.value || problem.answer || '').toString();
  const answerLower = answer.toLowerCase();

  // Coordinate pairs
  if (/\(\s*-?\d+\s*,\s*-?\d+\s*\)/.test(answer)) return 'coordinates';
  if (prompt.includes('coordinate') || prompt.includes('quadrant')) return 'coordinates';

  // Transformations/shifts
  if (prompt.includes('shift') || prompt.includes('f(x)') || prompt.includes('graph')) return 'transformations';

  // Place value
  if (prompt.includes('place') || prompt.includes('digit')) return 'placeValue';
  if (['ones', 'tens', 'hundreds', 'thousands'].some(p => answerLower.includes(p))) return 'placeValue';

  // Comparison
  if (prompt.includes('compare') || ['>', '<', '='].includes(answer.trim())) return 'comparison';

  // Yes/No
  if (['yes', 'no'].includes(answerLower)) return 'yesNo';

  // True/False
  if (['true', 'false'].includes(answerLower)) return 'trueFalse';

  return 'unknown';
}

function generateDistractors(answer, type) {
  const answerLower = answer.toLowerCase().trim();

  if (type === 'placeValue') {
    return DISTRACTORS.placeValue.filter(d => d.toLowerCase() !== answerLower);
  }

  if (type === 'comparison') {
    return DISTRACTORS.comparison.filter(d => d !== answer.trim());
  }

  if (type === 'coordinates') {
    const match = answer.match(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/);
    if (match) {
      const x = parseInt(match[1]);
      const y = parseInt(match[2]);
      return DISTRACTORS.coordinates(x, y).filter(d => d !== answer);
    }
  }

  if (type === 'transformations') {
    return DISTRACTORS.transformations.filter(d => d.toLowerCase() !== answerLower);
  }

  if (type === 'yesNo') {
    return DISTRACTORS.yesNo.filter(d => d.toLowerCase() !== answerLower);
  }

  if (type === 'trueFalse') {
    return DISTRACTORS.trueFalse.filter(d => d.toLowerCase() !== answerLower);
  }

  return null; // Can't auto-generate
}

function findCorrectOption(problem) {
  const answer = (problem.answer?.value || problem.answer || '').toString().toLowerCase().trim();
  const options = problem.options || [];

  // First check correctOption field
  if (problem.correctOption) {
    const opt = options.find(o => (o.label || '').toUpperCase() === problem.correctOption.toUpperCase());
    if (opt) return opt;
  }

  // Find option matching answer
  for (const opt of options) {
    const text = (opt.text || opt || '').toString().toLowerCase().trim();
    if (text === answer || text.includes(answer) || answer.includes(text)) {
      return opt;
    }
  }

  // Find the one that's NOT a bad distractor
  for (const opt of options) {
    const text = (opt.text || opt || '').toString();
    if (!isBadDistractor(text)) {
      return opt;
    }
  }

  return null;
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

  // Process each problem
  let fixed = 0;
  let deactivated = 0;
  let byType = {};

  console.log('\n--- Processing problems ---\n');

  for (const problem of terribleProblems) {
    const type = detectType(problem);
    byType[type] = (byType[type] || 0) + 1;

    const correctOpt = findCorrectOption(problem);
    const answer = correctOpt ? (correctOpt.text || correctOpt) : (problem.answer?.value || problem.answer);

    if (!answer) {
      console.log(`[SKIP] ${problem.problemId} - can't find correct answer`);
      if (!DRY_RUN) {
        await Problem.updateOne({ _id: problem._id }, { $set: { isActive: false } });
      }
      deactivated++;
      continue;
    }

    const distractors = generateDistractors(answer.toString(), type);

    if (!distractors || distractors.length < 3) {
      console.log(`[DEACTIVATE] ${problem.problemId} (${type}) - can't generate distractors`);
      if (!DRY_RUN) {
        await Problem.updateOne({ _id: problem._id }, { $set: { isActive: false } });
      }
      deactivated++;
      continue;
    }

    // Build new options: correct answer + 3 distractors
    const allOptions = [answer.toString(), ...distractors.slice(0, 3)];
    const shuffled = allOptions.sort(() => Math.random() - 0.5);
    const newOptions = shuffled.map((text, idx) => ({
      label: String.fromCharCode(65 + idx),
      text
    }));

    // Find which label has the correct answer
    const correctLabel = newOptions.find(o => o.text === answer.toString())?.label || 'A';

    console.log(`[FIX] ${problem.problemId} (${type})`);
    console.log(`      Answer: ${answer}`);
    console.log(`      Old: ${(problem.options || []).map(o => o.text || o).join(' | ')}`);
    console.log(`      New: ${newOptions.map(o => `${o.label}) ${o.text}`).join(' | ')}`);
    console.log(`      Correct: ${correctLabel}`);
    console.log();

    if (!DRY_RUN) {
      await Problem.updateOne(
        { _id: problem._id },
        { $set: { options: newOptions, correctOption: correctLabel } }
      );
    }
    fixed++;
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total with terrible trio: ${terribleProblems.length}`);
  console.log(`Fixed: ${fixed}`);
  console.log(`Deactivated (couldn't fix): ${deactivated}`);
  console.log(`\nBy type:`);
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
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
