/**
 * FIND PROBLEM WITH 2/3 CONVERSION
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

async function findProblem() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected\n');

    const problems = await Problem.find({
      content: { $regex: /2\/3/i }
    }).select('problemId skillId content answer options answerType').lean();

    console.log(`Found ${problems.length} problems with "2/3":\n`);

    problems.forEach(p => {
      const correctAnswer = 2/3;
      const givenAnswer = parseFloat(p.answer);
      const isWrong = Math.abs(correctAnswer - givenAnswer) > 0.01;

      console.log('═══════════════════════════════════════════════════════');
      console.log(`Problem ${p.problemId} (${p.skillId})`);
      console.log(`Content: "${p.content}"`);
      console.log(`Answer: ${p.answer}`);
      console.log(`Expected: ${correctAnswer} (0.666...)`);
      console.log(`Answer Type: ${p.answerType}`);

      if (p.options && p.options.length > 0) {
        console.log(`Options: ${p.options.map(o => o.text).join(', ')}`);
      }

      if (isWrong) {
        console.log('❌ WRONG ANSWER - Should be 0.666... or 0.67');
      } else {
        console.log('✅ Correct');
      }
      console.log('');
    });

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findProblem();
