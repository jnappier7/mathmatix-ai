require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

async function fixMissingCorrectOption() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    // Find all multiple-choice problems
    const mcProblems = await Problem.find({ answerType: 'multiple-choice' });
    console.log(`Found ${mcProblems.length} multiple-choice problems\n`);

    let missingCount = 0;
    let fixedCount = 0;
    let errorCount = 0;

    for (const problem of mcProblems) {
      // Check if correctOption is missing or empty
      if (!problem.correctOption || problem.correctOption.trim() === '') {
        missingCount++;
        console.log(`❌ ${problem.problemId}: Missing correctOption`);
        console.log(`   Answer: ${problem.answer}`);
        console.log(`   Options: ${problem.options.map(o => `${o.label}=${o.text}`).join(', ')}`);

        // Try to find the correct option by matching answer text
        const matchingOption = problem.options.find(opt =>
          String(opt.text).trim() === String(problem.answer).trim()
        );

        if (matchingOption) {
          problem.correctOption = matchingOption.label;
          await problem.save();
          fixedCount++;
          console.log(`   ✅ Fixed: Set correctOption to "${matchingOption.label}"\n`);
        } else {
          errorCount++;
          console.log(`   ⚠️  Could not auto-fix: No option matches answer "${problem.answer}"\n`);
        }
      }
    }

    console.log('\n=== SUMMARY ===');
    console.log(`Total multiple-choice problems: ${mcProblems.length}`);
    console.log(`Missing correctOption: ${missingCount}`);
    console.log(`Fixed: ${fixedCount}`);
    console.log(`Could not fix: ${errorCount}`);
    console.log(`Already correct: ${mcProblems.length - missingCount}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixMissingCorrectOption();
