/**
 * CONVERT CONSTRUCTED-RESPONSE TO MULTIPLE-CHOICE
 *
 * Converts all constructed-response problems to multiple-choice
 * by generating plausible wrong answers (distractors).
 *
 * Run: node scripts/convertToMC.js
 *
 * Options:
 *   --dry-run    Preview changes without writing to database
 *   --limit=N    Only process N problems (for testing)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : 0;

// Generate wrong answers based on the correct answer
function generateDistractors(correctAnswer, prompt) {
  const distractors = [];
  const answer = String(correctAnswer).trim();

  // Try to parse as number
  const num = parseFloat(answer.replace(/[,$%]/g, ''));

  if (!isNaN(num)) {
    // Numeric answer - generate numeric distractors
    distractors.push(...generateNumericDistractors(num, answer));
  } else if (answer.includes('/')) {
    // Fraction answer
    distractors.push(...generateFractionDistractors(answer));
  } else if (answer.match(/^-?\d+x/i) || answer.match(/x\s*[+\-]/)) {
    // Algebraic expression
    distractors.push(...generateAlgebraicDistractors(answer));
  } else {
    // Text/other answer
    distractors.push(...generateTextDistractors(answer, prompt));
  }

  // Ensure we have exactly 3 unique distractors
  const unique = [...new Set(distractors)].filter(d => d !== answer);
  while (unique.length < 3) {
    unique.push(`Option ${unique.length + 1}`);
  }

  return unique.slice(0, 3);
}

function generateNumericDistractors(num, originalAnswer) {
  const distractors = [];
  const isInteger = Number.isInteger(num);
  const hasPercent = originalAnswer.includes('%');
  const hasComma = originalAnswer.includes(',');
  const hasDollar = originalAnswer.includes('$');

  // Common error patterns
  const variations = [
    num + 1,
    num - 1,
    num + 2,
    num - 2,
    num * 2,
    Math.abs(num) * -1,
    num + 10,
    num - 10,
    num / 2,
    num * 10,
    num / 10,
    Math.round(num * 1.1),
    Math.round(num * 0.9),
  ];

  for (const v of variations) {
    if (v !== num && !distractors.includes(v)) {
      let formatted = isInteger ? Math.round(v).toString() : v.toFixed(2);
      if (hasPercent) formatted += '%';
      if (hasDollar) formatted = '$' + formatted;
      if (hasComma && Math.abs(v) >= 1000) {
        formatted = formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }
      distractors.push(formatted);
    }
    if (distractors.length >= 5) break;
  }

  return distractors;
}

function generateFractionDistractors(answer) {
  const distractors = [];
  const match = answer.match(/(-?\d+)\s*\/\s*(\d+)/);

  if (match) {
    const [, num, den] = match.map(Number);

    // Common fraction errors
    distractors.push(`${num + 1}/${den}`);
    distractors.push(`${num}/${den + 1}`);
    distractors.push(`${num - 1}/${den}`);
    distractors.push(`${den}/${num}`); // Inverted
    distractors.push(`${num + den}/${den}`); // Added instead of kept
  }

  return distractors.filter(d => d !== answer);
}

function generateAlgebraicDistractors(answer) {
  const distractors = [];

  // Try to modify coefficients
  const coeffMatch = answer.match(/(-?\d*)x/);
  if (coeffMatch) {
    const coeff = parseInt(coeffMatch[1]) || 1;
    const base = answer.replace(/(-?\d*)x/, '');
    distractors.push(answer.replace(/(-?\d*)x/, `${coeff + 1}x`));
    distractors.push(answer.replace(/(-?\d*)x/, `${coeff - 1}x`));
    distractors.push(answer.replace(/(-?\d*)x/, `${coeff * -1}x`));
  }

  // Modify constants
  const constMatch = answer.match(/([+\-]\s*\d+)$/);
  if (constMatch) {
    const constVal = parseInt(constMatch[1].replace(/\s/g, ''));
    distractors.push(answer.replace(/([+\-]\s*\d+)$/, ` + ${constVal + 1}`));
    distractors.push(answer.replace(/([+\-]\s*\d+)$/, ` - ${Math.abs(constVal)}`));
  }

  // Sign errors
  if (answer.includes('+')) {
    distractors.push(answer.replace('+', '-'));
  }
  if (answer.includes('-') && !answer.startsWith('-')) {
    distractors.push(answer.replace('-', '+'));
  }

  return distractors.filter(d => d !== answer);
}

function generateTextDistractors(answer, prompt) {
  const distractors = [];
  const lowerAnswer = answer.toLowerCase().trim();

  // For comparison operators (>, <, =, >=, <=)
  if (['>', '<', '=', '>=', '<=', '≥', '≤', '≠'].includes(lowerAnswer) ||
      prompt.toLowerCase().includes('compare')) {
    const comparisonOptions = ['>', '<', '='];
    distractors.push(...comparisonOptions.filter(c => c !== lowerAnswer));
    return distractors;
  }

  // For yes/no questions
  if (lowerAnswer === 'yes' || lowerAnswer === 'no') {
    distractors.push(lowerAnswer === 'yes' ? 'No' : 'Yes');
    distractors.push('Maybe');
    distractors.push('It depends');
    return distractors;
  }

  // For true/false
  if (lowerAnswer === 'true' || lowerAnswer === 'false') {
    distractors.push(lowerAnswer === 'true' ? 'False' : 'True');
    distractors.push('Sometimes true');
    distractors.push('Not always');
    return distractors;
  }

  // For shape names
  const shapes = ['triangle', 'square', 'rectangle', 'circle', 'pentagon', 'hexagon', 'octagon', 'parallelogram', 'trapezoid', 'rhombus'];
  if (shapes.some(s => lowerAnswer.includes(s))) {
    const otherShapes = shapes.filter(s => !lowerAnswer.includes(s));
    distractors.push(...otherShapes.slice(0, 3).map(s => s.charAt(0).toUpperCase() + s.slice(1)));
    return distractors;
  }

  // For place value answers (ones, tens, hundreds, etc.)
  const placeValues = ['ones', 'tens', 'hundreds', 'thousands', 'ten-thousands', 'tenths', 'hundredths'];
  if (placeValues.some(p => lowerAnswer.includes(p))) {
    const otherPlaces = placeValues.filter(p => !lowerAnswer.includes(p));
    distractors.push(...otherPlaces.slice(0, 3).map(p => p.charAt(0).toUpperCase() + p.slice(1)));
    return distractors;
  }

  // For operation keywords
  const operations = ['addition', 'subtraction', 'multiplication', 'division', 'add', 'subtract', 'multiply', 'divide'];
  if (operations.some(o => lowerAnswer.includes(o))) {
    const otherOps = operations.filter(o => !lowerAnswer.includes(o));
    distractors.push(...otherOps.slice(0, 3).map(o => o.charAt(0).toUpperCase() + o.slice(1)));
    return distractors;
  }

  // Generic fallback - try to make sensible alternatives
  // Avoid "Cannot be determined", "Not enough information" etc. for math
  distractors.push(`Not ${answer}`);
  distractors.push('Different answer');
  distractors.push('Other');

  return distractors;
}

async function main() {
  console.log('=== CONVERT TO MULTIPLE-CHOICE ===\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  if (LIMIT) console.log(`Limit: ${LIMIT} problems`);
  console.log();

  // Connect to database
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/mathmatix';
  console.log(`Connecting to: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB\n');

  // Find all constructed-response problems
  const query = { answerType: 'constructed-response' };
  const total = await Problem.countDocuments(query);
  console.log(`Found ${total} constructed-response problems\n`);

  if (total === 0) {
    console.log('No problems to convert!');
    await mongoose.disconnect();
    return;
  }

  // Process in batches
  const BATCH_SIZE = 100;
  let processed = 0;
  let converted = 0;
  let errors = 0;
  const limit = LIMIT || total;

  const cursor = Problem.find(query).limit(limit).cursor();

  for await (const problem of cursor) {
    try {
      const correctAnswer = problem.correctAnswer || problem.answer?.value || problem.answer;
      const prompt = problem.prompt || problem.problemText || '';

      if (!correctAnswer) {
        errors++;
        continue;
      }

      const distractors = generateDistractors(correctAnswer, prompt);

      // Create options array with correct answer and distractors
      const allOptions = [correctAnswer, ...distractors];
      // Shuffle options
      const shuffled = allOptions.sort(() => Math.random() - 0.5);

      const options = shuffled.map((text, idx) => ({
        id: String.fromCharCode(65 + idx), // A, B, C, D
        text: String(text),
        isCorrect: text === correctAnswer
      }));

      if (!DRY_RUN) {
        await Problem.updateOne(
          { _id: problem._id },
          {
            $set: {
              answerType: 'multiple-choice',
              problemType: 'multiple-choice',
              options: options,
              choices: options.map(o => o.text)
            }
          }
        );
      }

      converted++;
      processed++;

      if (processed % 500 === 0) {
        console.log(`  Processed: ${processed}/${limit}`);
      }
    } catch (err) {
      errors++;
      if (errors < 5) {
        console.error(`  Error processing ${problem.problemId}: ${err.message}`);
      }
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total processed: ${processed}`);
  console.log(`Converted: ${converted}`);
  console.log(`Errors: ${errors}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes were made to the database.');
  }

  // Verify
  if (!DRY_RUN) {
    const remainingCR = await Problem.countDocuments({ answerType: 'constructed-response' });
    const totalMC = await Problem.countDocuments({ answerType: 'multiple-choice' });
    console.log(`\nRemaining constructed-response: ${remainingCR}`);
    console.log(`Total multiple-choice: ${totalMC}`);
  }

  await mongoose.disconnect();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
