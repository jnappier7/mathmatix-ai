/**
 * FIND FRACTION TO DECIMAL CONVERSION PROBLEMS WITH WRONG ANSWERS
 *
 * Checks problems that ask to convert fractions to decimals
 * and verifies the answer is mathematically correct.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

function parseFraction(str) {
  const match = String(str).match(/(-?\d+)\/(\d+)/);
  if (!match) return null;

  const numerator = parseInt(match[1], 10);
  const denominator = parseInt(match[2], 10);

  if (denominator === 0) return null;

  return { numerator, denominator, decimal: numerator / denominator };
}

async function findWrongDecimalConversions() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected\n');

    // Find problems about converting fractions to decimals
    const problems = await Problem.find({
      $or: [
        { content: { $regex: /convert.*to.*decimal/i } },
        { content: { $regex: /write.*as.*decimal/i } },
        { content: { $regex: /fraction.*decimal/i } }
      ]
    }).lean();

    console.log(`Found ${problems.length} fraction-to-decimal conversion problems\n`);

    console.log('═══════════════════════════════════════════════════════');
    console.log('CHECKING ANSWERS');
    console.log('═══════════════════════════════════════════════════════\n');

    const wrongAnswers = [];

    for (const problem of problems) {
      console.log(`\nProblem ${problem.problemId} (${problem.skillId}):`);
      console.log(`Content: "${problem.content}"`);
      console.log(`Answer: ${problem.answer}`);
      console.log(`Answer Type: ${problem.answerType}`);

      // Try to extract fraction from content
      const fractionMatch = parseFraction(problem.content);

      if (fractionMatch) {
        const expectedDecimal = fractionMatch.decimal;
        const givenAnswer = parseFloat(problem.answer);

        console.log(`Fraction: ${fractionMatch.numerator}/${fractionMatch.denominator}`);
        console.log(`Expected decimal: ${expectedDecimal}`);
        console.log(`Given answer: ${givenAnswer}`);

        // Check if answers match (with small epsilon for floating point)
        if (Math.abs(expectedDecimal - givenAnswer) > 0.0001) {
          console.log('❌ WRONG ANSWER!');
          wrongAnswers.push({
            problemId: problem.problemId,
            skillId: problem.skillId,
            content: problem.content,
            fraction: `${fractionMatch.numerator}/${fractionMatch.denominator}`,
            expectedAnswer: expectedDecimal,
            givenAnswer: problem.answer,
            options: problem.options
          });
        } else {
          console.log('✅ Correct');
        }
      } else {
        console.log('⚠️  Could not parse fraction from content');
      }

      if (problem.options && problem.options.length > 0) {
        console.log(`Options: ${problem.options.map(o => o.text).join(', ')}`);
      }
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');

    if (wrongAnswers.length > 0) {
      console.log(`❌ Found ${wrongAnswers.length} problems with WRONG answers:\n`);

      wrongAnswers.forEach(p => {
        console.log(`Problem ${p.problemId} (${p.skillId}):`);
        console.log(`  Content: "${p.content}"`);
        console.log(`  Fraction: ${p.fraction}`);
        console.log(`  Expected: ${p.expectedAnswer}`);
        console.log(`  Given: ${p.givenAnswer}`);
        if (p.options && p.options.length > 0) {
          console.log(`  Options: ${p.options.map(o => o.text).join(', ')}`);
        }
        console.log('');
      });
    } else {
      console.log('✅ All fraction-to-decimal conversions have correct answers!');
    }

    console.log('═══════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

  } catch (error) {
    console.error('Error checking decimal conversions:', error);
    process.exit(1);
  }
}

findWrongDecimalConversions();
