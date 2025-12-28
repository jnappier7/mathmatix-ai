// scripts/fixFractionDateBug.js
// Fix fractions that were imported as dates

const mongoose = require('mongoose');
const Problem = require('../models/problem');

async function fixFractionDates() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mathmatix');

  console.log('Finding problems with date-formatted fraction answers...');

  const problems = await Problem.find({
    answerType: 'multiple-choice',
    'options.text': { $regex: /^\d{1,2}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i }
  });

  console.log(`Found ${problems.length} problems with date-formatted options`);

  for (const problem of problems) {
    console.log(`\nProblem ${problem.problemId}: ${problem.content}`);
    console.log('Before:', problem.options.map(o => o.text));

    // Convert date formats back to fractions
    problem.options = problem.options.map(opt => {
      const match = opt.text.match(/^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i);
      if (match) {
        const numerator = match[1];
        const monthMap = {
          Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
          Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
        };
        const denominator = monthMap[match[2]];
        opt.text = `${numerator}/${denominator}`;
      }
      return opt;
    });

    console.log('After:', problem.options.map(o => o.text));

    await problem.save();
    console.log('✓ Fixed');
  }

  console.log(`\n✓ Fixed ${problems.length} problems`);
  process.exit(0);
}

fixFractionDates().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
