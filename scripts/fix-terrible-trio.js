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
  placeValue: ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands', 'hundred thousands'],
  comparison: ['>', '<', '='],
  coordinates: (x, y) => [`(${-x}, ${y})`, `(${x}, ${-y})`, `(${-x}, ${-y})`, `(${y}, ${x})`],
  transformations: ['up', 'down', 'left', 'right'].map(d => `${d} 3 units`),
  yesNo: ['Yes', 'No', 'Sometimes', 'It depends'],
  trueFalse: ['True', 'False', 'Sometimes true', 'Not always'],
  shapes: ['Triangle', 'Square', 'Rectangle', 'Circle', 'Pentagon', 'Hexagon', 'Octagon', 'Parallelogram', 'Trapezoid', 'Rhombus'],
  operations: ['Addition', 'Subtraction', 'Multiplication', 'Division'],
  fractionTypes: ['Proper fraction', 'Improper fraction', 'Mixed number', 'Whole number'],
  angles: ['Acute', 'Right', 'Obtuse', 'Straight', 'Reflex'],
  lines: ['Parallel', 'Perpendicular', 'Intersecting', 'Skew'],
  polygonTypes: ['Regular', 'Irregular', 'Convex', 'Concave'],
  primeComposite: ['Prime', 'Composite', 'Neither'],
  evenOdd: ['Even', 'Odd'],
  positiveNegative: ['Positive', 'Negative', 'Zero'],
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
  const skillId = (problem.skillId || '').toLowerCase();
  const answer = (problem.answer?.value || problem.answer || '').toString();
  const answerLower = answer.toLowerCase().trim();

  // Coordinate pairs - (x, y)
  if (/\(\s*-?\d+\s*,\s*-?\d+\s*\)/.test(answer)) return 'coordinates';
  if (prompt.includes('coordinate') || prompt.includes('quadrant') || prompt.includes('ordered pair')) return 'coordinates';
  if (skillId.includes('coordinate')) return 'coordinates';

  // Transformations/shifts
  if (prompt.includes('shift') || prompt.includes('f(x)') || prompt.includes('graph') || prompt.includes('translate')) return 'transformations';

  // Place value
  if (prompt.includes('place') || prompt.includes('digit') || skillId.includes('place-value') || skillId.includes('place_value')) return 'placeValue';
  if (['ones', 'tens', 'hundreds', 'thousands', 'ten thousands', 'tenths', 'hundredths'].some(p => answerLower.includes(p))) return 'placeValue';

  // Comparison operators
  if (prompt.includes('compare') || ['>', '<', '=', '>=', '<=', '≥', '≤', '≠'].includes(answer.trim())) return 'comparison';

  // Yes/No
  if (['yes', 'no'].includes(answerLower)) return 'yesNo';

  // True/False
  if (['true', 'false'].includes(answerLower)) return 'trueFalse';

  // Shapes
  const shapeWords = ['triangle', 'square', 'rectangle', 'circle', 'pentagon', 'hexagon', 'octagon', 'parallelogram', 'trapezoid', 'rhombus', 'quadrilateral', 'polygon'];
  if (shapeWords.some(s => answerLower.includes(s))) return 'shapes';
  if (prompt.includes('shape') || prompt.includes('polygon') || skillId.includes('shape')) return 'shapes';

  // Angle types
  const angleTypes = ['acute', 'right', 'obtuse', 'straight', 'reflex'];
  if (angleTypes.some(a => answerLower === a)) return 'angles';
  if ((prompt.includes('angle') || prompt.includes('degrees')) && angleTypes.some(a => answerLower.includes(a))) return 'angles';

  // Line relationships
  const lineTypes = ['parallel', 'perpendicular', 'intersecting'];
  if (lineTypes.some(l => answerLower === l)) return 'lines';

  // Operations
  const opWords = ['addition', 'subtraction', 'multiplication', 'division', 'add', 'subtract', 'multiply', 'divide'];
  if (opWords.some(o => answerLower === o || answerLower === o.replace('ion', ''))) return 'operations';

  // Fraction types
  if (['proper', 'improper', 'mixed'].some(f => answerLower.includes(f))) return 'fractionTypes';

  // Prime/Composite
  if (['prime', 'composite'].includes(answerLower)) return 'primeComposite';

  // Even/Odd
  if (['even', 'odd'].includes(answerLower)) return 'evenOdd';

  // Positive/Negative
  if (['positive', 'negative', 'zero'].includes(answerLower)) return 'positiveNegative';

  // Simple fractions like 1/2, 3/4, 2/5
  if (/^\d+\/\d+$/.test(answer)) return 'fraction';

  // Mixed numbers like 2 1/2, 3 3/4
  if (/^\d+\s+\d+\/\d+$/.test(answer)) return 'mixedNumber';

  // Decimals like 0.5, 3.14, -2.5
  if (/^-?\d+\.\d+$/.test(answer)) return 'decimal';

  // Percentages like 25%, 100%, 50%
  if (/^\d+(\.\d+)?%$/.test(answer)) return 'percentage';

  // Simple integers (most common!)
  if (/^-?\d+$/.test(answer)) return 'integer';

  // Money like $5.00, $12.50
  if (/^\$\d+(\.\d{2})?$/.test(answer)) return 'money';

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

  if (type === 'shapes') {
    return DISTRACTORS.shapes.filter(d => d.toLowerCase() !== answerLower).slice(0, 4);
  }

  if (type === 'angles') {
    return DISTRACTORS.angles.filter(d => d.toLowerCase() !== answerLower);
  }

  if (type === 'lines') {
    return DISTRACTORS.lines.filter(d => d.toLowerCase() !== answerLower);
  }

  if (type === 'operations') {
    return DISTRACTORS.operations.filter(d => d.toLowerCase() !== answerLower);
  }

  if (type === 'fractionTypes') {
    return DISTRACTORS.fractionTypes.filter(d => d.toLowerCase() !== answerLower);
  }

  if (type === 'primeComposite') {
    return DISTRACTORS.primeComposite.filter(d => d.toLowerCase() !== answerLower);
  }

  if (type === 'evenOdd') {
    // Need at least 3 distractors, but even/odd only has 2 options
    const others = DISTRACTORS.evenOdd.filter(d => d.toLowerCase() !== answerLower);
    return [...others, 'Neither', 'Both'];
  }

  if (type === 'positiveNegative') {
    return DISTRACTORS.positiveNegative.filter(d => d.toLowerCase() !== answerLower);
  }

  // INTEGER: Generate nearby numbers
  if (type === 'integer') {
    const num = parseInt(answer);
    if (!isNaN(num)) {
      const distractors = new Set();
      // Add nearby numbers
      distractors.add(String(num + 1));
      distractors.add(String(num - 1));
      distractors.add(String(num + 10));
      distractors.add(String(num - 10));
      distractors.add(String(num * 2));
      if (num !== 0) distractors.add(String(Math.floor(num / 2)));
      distractors.add(String(-num));
      // Remove the correct answer if it's in there
      distractors.delete(answer);
      return [...distractors].slice(0, 4);
    }
  }

  // FRACTION: Generate related fractions
  if (type === 'fraction') {
    const match = answer.match(/^(\d+)\/(\d+)$/);
    if (match) {
      const num = parseInt(match[1]);
      const den = parseInt(match[2]);
      const distractors = new Set();
      // Flip numerator and denominator
      distractors.add(`${den}/${num}`);
      // Adjacent fractions
      distractors.add(`${num + 1}/${den}`);
      distractors.add(`${num}/${den + 1}`);
      distractors.add(`${num - 1}/${den}`);
      distractors.add(`${num}/${den - 1}`);
      // Double/half
      distractors.add(`${num * 2}/${den}`);
      distractors.add(`${num}/${den * 2}`);
      distractors.delete(answer);
      distractors.delete(`0/${den}`); // Remove invalid fractions
      return [...distractors].filter(d => !d.includes('/0') && !d.startsWith('-')).slice(0, 4);
    }
  }

  // MIXED NUMBER: Generate related mixed numbers
  if (type === 'mixedNumber') {
    const match = answer.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (match) {
      const whole = parseInt(match[1]);
      const num = parseInt(match[2]);
      const den = parseInt(match[3]);
      const distractors = [
        `${whole + 1} ${num}/${den}`,
        `${whole - 1} ${num}/${den}`,
        `${whole} ${num + 1}/${den}`,
        `${whole} ${num}/${den + 1}`,
      ].filter(d => d !== answer && !d.startsWith('-1 ') && !d.startsWith('0 '));
      return distractors.slice(0, 4);
    }
  }

  // DECIMAL: Generate nearby decimals
  if (type === 'decimal') {
    const num = parseFloat(answer);
    if (!isNaN(num)) {
      const distractors = new Set();
      distractors.add((num + 0.1).toFixed(2).replace(/\.?0+$/, ''));
      distractors.add((num - 0.1).toFixed(2).replace(/\.?0+$/, ''));
      distractors.add((num + 1).toFixed(2).replace(/\.?0+$/, ''));
      distractors.add((num - 1).toFixed(2).replace(/\.?0+$/, ''));
      distractors.add((num * 10).toFixed(2).replace(/\.?0+$/, ''));
      distractors.add((num / 10).toFixed(2).replace(/\.?0+$/, ''));
      distractors.delete(answer);
      return [...distractors].slice(0, 4);
    }
  }

  // PERCENTAGE: Generate nearby percentages
  if (type === 'percentage') {
    const match = answer.match(/^(\d+(?:\.\d+)?)%$/);
    if (match) {
      const num = parseFloat(match[1]);
      const distractors = [
        `${num + 10}%`,
        `${num - 10}%`,
        `${num + 5}%`,
        `${num - 5}%`,
        `${100 - num}%`,
      ].filter(d => d !== answer && !d.startsWith('-'));
      return distractors.slice(0, 4);
    }
  }

  // MONEY: Generate nearby money amounts
  if (type === 'money') {
    const match = answer.match(/^\$(\d+(?:\.\d{2})?)$/);
    if (match) {
      const num = parseFloat(match[1]);
      const distractors = [
        `$${(num + 1).toFixed(2)}`,
        `$${(num - 1).toFixed(2)}`,
        `$${(num + 0.10).toFixed(2)}`,
        `$${(num - 0.10).toFixed(2)}`,
        `$${(num * 2).toFixed(2)}`,
      ].filter(d => d !== answer && !d.startsWith('$-'));
      return distractors.slice(0, 4);
    }
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

  // If there are still unknowns, analyze them
  if (byType['unknown'] > 0) {
    console.log('\n=== UNKNOWN TYPE ANALYSIS ===');
    const unknownProblems = terribleProblems.filter(p => detectType(p) === 'unknown');

    // Group by skill
    const unknownBySkill = {};
    for (const p of unknownProblems) {
      unknownBySkill[p.skillId] = unknownBySkill[p.skillId] || [];
      unknownBySkill[p.skillId].push(p);
    }

    console.log('\nTop unknown skills:');
    const sortedUnknownSkills = Object.entries(unknownBySkill).sort((a, b) => b[1].length - a[1].length);
    for (const [skillId, problems] of sortedUnknownSkills.slice(0, 15)) {
      console.log(`\n  ${skillId}: ${problems.length} problems`);
      // Show sample answer patterns
      const answers = problems.slice(0, 3).map(p => p.answer?.value || p.answer || '');
      console.log(`    Sample answers: ${answers.join(', ')}`);
    }

    // Analyze answer patterns
    console.log('\n\nUnknown answer patterns:');
    const patterns = {
      algebraic: 0,    // x, 2x, x+3, etc.
      expression: 0,   // 2+3, 5*4, etc.
      word: 0,         // simple words
      latex: 0,        // contains \ or { or }
      complex: 0,      // everything else
    };

    for (const p of unknownProblems) {
      const ans = (p.answer?.value || p.answer || '').toString();
      if (/[a-z]/i.test(ans) && /\d/.test(ans)) patterns.algebraic++;
      else if (/^[a-zA-Z\s]+$/.test(ans)) patterns.word++;
      else if (/[\\{}]/.test(ans)) patterns.latex++;
      else if (/[\+\-\*\/\^]/.test(ans)) patterns.expression++;
      else patterns.complex++;
    }

    for (const [pattern, count] of Object.entries(patterns)) {
      if (count > 0) console.log(`  ${pattern}: ${count}`);
    }
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
