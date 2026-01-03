/**
 * Fix quadratic function answer format (x - -1) → (x + 1)
 */

const mongoose = require('mongoose');
const Problem = require('../models/problem');
require('dotenv').config();

async function fixQuadraticAnswers() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mathmatix_dev');
    console.log('Connected to MongoDB\n');

    // Find all quadratic problems with answer/option mismatch
    const problems = await Problem.find({
      skillId: 'quadratic-functions',
      answerType: 'multiple-choice'
    });

    console.log(`Found ${problems.length} quadratic function problems\n`);

    let fixed = 0;
    let skipped = 0;

    for (const problem of problems) {
      const { answer, options, correctOption } = problem;

      if (!answer || !options || !correctOption) {
        skipped++;
        continue;
      }

      // Find the correct option
      const correctOpt = options.find(opt => opt.label === correctOption);
      if (!correctOpt) {
        skipped++;
        continue;
      }

      // Check if there's a mismatch
      if (String(answer).trim() !== String(correctOpt.text).trim()) {
        // Simplify the answer field to match the option format
        let fixedAnswer = String(answer);

        // Fix: (x - -N) → (x + N)
        fixedAnswer = fixedAnswer.replace(/\(x\s*-\s*-(\d+)\)/g, '(x + $1)');

        // Fix: + -N → + -N (keep this format if it's what options use)
        // Actually, let's just set answer to match the correct option text exactly
        problem.answer = correctOpt.text;

        await problem.save();
        fixed++;

        if (fixed <= 5) {
          console.log(`Fixed ${problem.problemId}:`);
          console.log(`  Old: "${answer}"`);
          console.log(`  New: "${problem.answer}"`);
          console.log('');
        }
      }
    }

    console.log('============================================================');
    console.log(`✅ Fixed ${fixed} problems`);
    console.log(`   Skipped ${skipped} problems (no issues)`);
    console.log('============================================================\n');

    // Verify fix
    const remaining = await Problem.find({
      skillId: 'quadratic-functions',
      answerType: 'multiple-choice'
    });

    let stillMismatched = 0;
    for (const p of remaining) {
      const correctOpt = p.options?.find(opt => opt.label === p.correctOption);
      if (correctOpt && String(p.answer).trim() !== String(correctOpt.text).trim()) {
        stillMismatched++;
      }
    }

    console.log(`Remaining mismatches: ${stillMismatched}\n`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixQuadraticAnswers();
