/**
 * FIX OTHER BAD DISTRACTOR PATTERNS
 *
 * Catches problems that weren't fixed by terrible-trio script:
 * - "All of these", "None of these", "All of the above", etc.
 * - Problems where answer is a shape name but has generic distractors
 *
 * Run: node scripts/fix-other-bad-distractors.js --dry-run
 * Run: node scripts/fix-other-bad-distractors.js --confirm
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

const DRY_RUN = process.argv.includes('--dry-run');
const CONFIRM = process.argv.includes('--confirm');

// Other bad distractor patterns
const BAD_PATTERNS = [
  'all of these',
  'none of these',
  'all of the above',
  'none of the above',
  'cannot be determined',
  'not enough information',
  'all are correct',
  'none are correct',
];

// Shape distractors
const SHAPES_2D = ['Circle', 'Square', 'Triangle', 'Rectangle', 'Pentagon', 'Hexagon', 'Oval', 'Diamond', 'Star'];
const SHAPES_3D = ['Sphere', 'Cube', 'Cone', 'Cylinder', 'Pyramid', 'Prism', 'Rectangular prism'];

function hasBadDistractors(options) {
  if (!options || !Array.isArray(options)) return false;

  let badCount = 0;
  for (const opt of options) {
    const text = (opt.text || opt || '').toString().toLowerCase().trim();
    if (BAD_PATTERNS.some(bad => text.includes(bad))) {
      badCount++;
    }
  }
  return badCount >= 2; // At least 2 bad distractors
}

function isBadDistractor(text) {
  const lower = text.toLowerCase().trim();
  return BAD_PATTERNS.some(bad => lower.includes(bad));
}

function detectShapeType(problem) {
  const prompt = (problem.prompt || '').toLowerCase();
  const answer = (problem.answer?.value || problem.answer || '').toString().toLowerCase();
  const skillId = (problem.skillId || '').toLowerCase();

  // Check if it's a 3D shape question
  if (prompt.includes('3d') || prompt.includes('solid') || skillId.includes('3d')) {
    if (SHAPES_3D.some(s => answer.includes(s.toLowerCase()))) return '3d';
  }

  // Check if answer is a 3D shape
  if (SHAPES_3D.some(s => answer === s.toLowerCase())) return '3d';

  // Check if it's a 2D shape question
  if (SHAPES_2D.some(s => answer === s.toLowerCase())) return '2d';

  return null;
}

function generateShapeDistractors(answer, type) {
  const answerLower = answer.toLowerCase().trim();
  const shapes = type === '3d' ? SHAPES_3D : SHAPES_2D;
  return shapes.filter(s => s.toLowerCase() !== answerLower).slice(0, 4);
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
  console.log('=== FIX OTHER BAD DISTRACTOR PATTERNS ===\n');
  console.log('Looking for problems with patterns like:');
  console.log('  - "All of these" / "None of these"');
  console.log('  - "All of the above" / "None of the above"');
  console.log('  - Other generic unhelpful options\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : 'LIVE'}`);

  if (!DRY_RUN && !CONFIRM) {
    console.log('\nERROR: Live mode requires --confirm flag');
    console.log('Run: node scripts/fix-other-bad-distractors.js --confirm');
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

  // Filter to those with bad distractors
  const badProblems = allMCProblems.filter(p => hasBadDistractors(p.options));

  console.log(`\nFound ${badProblems.length} problems with bad distractor patterns\n`);

  if (badProblems.length === 0) {
    console.log('No problems found with bad distractors!');
    await mongoose.disconnect();
    return;
  }

  // Count by skill
  const skillCounts = {};
  for (const p of badProblems) {
    skillCounts[p.skillId] = (skillCounts[p.skillId] || 0) + 1;
  }

  console.log('Impact by skill (top 20):');
  const sorted = Object.entries(skillCounts).sort((a, b) => b[1] - a[1]);
  for (const [skillId, count] of sorted.slice(0, 20)) {
    console.log(`  ${skillId}: ${count}`);
  }

  // Process each problem
  let fixed = 0;
  let deactivated = 0;
  let byType = {};

  console.log('\n--- Processing problems ---\n');

  for (const problem of badProblems) {
    const shapeType = detectShapeType(problem);
    const type = shapeType ? `shape-${shapeType}` : 'unknown';
    byType[type] = (byType[type] || 0) + 1;

    const correctOpt = findCorrectOption(problem);
    const answer = correctOpt ? (correctOpt.text || correctOpt) : (problem.answer?.value || problem.answer);

    if (!answer) {
      if (!DRY_RUN) {
        await Problem.updateOne({ _id: problem._id }, { $set: { isActive: false } });
      }
      deactivated++;
      continue;
    }

    let distractors = null;
    if (shapeType) {
      distractors = generateShapeDistractors(answer.toString(), shapeType);
    }

    if (!distractors || distractors.length < 3) {
      console.log(`[DEACTIVATE] ${problem.problemId} (${type}) - can't generate distractors`);
      console.log(`      Answer: ${answer}`);
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
    const correctLabel = newOptions.find(o => o.text.toLowerCase() === answer.toString().toLowerCase())?.label || 'A';

    console.log(`[FIX] ${problem.problemId} (${type})`);
    console.log(`      Answer: ${answer}`);
    console.log(`      Old: ${(problem.options || []).map(o => o.text || o).join(' | ')}`);
    console.log(`      New: ${newOptions.map(o => `${o.label}) ${o.text}`).join(' | ')}`);
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
  console.log(`Total with bad patterns: ${badProblems.length}`);
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
