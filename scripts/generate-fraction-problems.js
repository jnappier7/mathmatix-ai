/**
 * GENERATE FRACTION AND DECIMAL PROBLEMS
 *
 * Creates properly formatted fraction/decimal problems with String() wrapped options
 * to prevent date interpretation issues
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

function simplifyFraction(num, denom) {
  const divisor = gcd(Math.abs(num), Math.abs(denom));
  return { num: num / divisor, denom: denom / divisor };
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateFractionAddition(difficulty) {
  const level = difficulty < -0.5 ? 'easy' : difficulty < 0.5 ? 'medium' : 'hard';

  let num1, denom1, num2, denom2;

  if (level === 'easy') {
    // Same denominator
    denom1 = denom2 = randomInt(3, 8);
    num1 = randomInt(1, denom1 - 1);
    num2 = randomInt(1, denom1 - num1 - 1);
  } else if (level === 'medium') {
    // Related denominators
    const base = randomInt(2, 5);
    denom1 = base;
    denom2 = base * 2;
    num1 = randomInt(1, denom1 - 1);
    num2 = randomInt(1, denom2 - 1);
  } else {
    // Unrelated denominators
    denom1 = randomInt(3, 9);
    denom2 = randomInt(3, 9);
    while (denom2 === denom1) denom2 = randomInt(3, 9);
    num1 = randomInt(1, denom1 - 1);
    num2 = randomInt(1, denom2 - 1);
  }

  // Calculate answer
  const commonDenom = (denom1 * denom2) / gcd(denom1, denom2);
  const adjustedNum1 = num1 * (commonDenom / denom1);
  const adjustedNum2 = num2 * (commonDenom / denom2);
  const resultNum = adjustedNum1 + adjustedNum2;

  const simplified = simplifyFraction(resultNum, commonDenom);
  const answerStr = `${simplified.num}/${simplified.denom}`;

  // Generate wrong answers (distractors)
  const wrong1 = `${num1 + num2}/${denom1}`; // Common mistake: add numerators and use first denominator
  const wrong2 = `${num1 + num2}/${denom1 + denom2}`; // Add both
  const wrong3 = `${resultNum}/${commonDenom}`; // Unsimplified

  const options = [
    { label: 'A', text: String(answerStr) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ].sort(() => Math.random() - 0.5);

  const correctLabel = options.find(o => o.text === answerStr).label;

  return {
    problemId: `prob_frac_add_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'add-fractions',
    content: `Add: ${num1}/${denom1} + ${num2}/${denom2}`,
    answer: answerStr,
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['fractions', 'addition']
    },
    isActive: true
  };
}

function generateFractionSubtraction(difficulty) {
  const level = difficulty < -0.5 ? 'easy' : difficulty < 0.5 ? 'medium' : 'hard';

  let num1, denom1, num2, denom2;

  if (level === 'easy') {
    denom1 = denom2 = randomInt(4, 10);
    num2 = randomInt(1, denom1 - 2);
    num1 = randomInt(num2 + 1, denom1 - 1);
  } else {
    denom1 = randomInt(3, 8);
    denom2 = randomInt(3, 8);
    while (denom2 === denom1) denom2 = randomInt(3, 8);

    const commonDenom = (denom1 * denom2) / gcd(denom1, denom2);
    num1 = randomInt(1, denom1 - 1);
    num2 = randomInt(1, denom2 - 1);

    // Ensure num1/denom1 > num2/denom2
    if (num1 * denom2 < num2 * denom1) {
      [num1, num2, denom1, denom2] = [num2, num1, denom2, denom1];
    }
  }

  const commonDenom = (denom1 * denom2) / gcd(denom1, denom2);
  const adjustedNum1 = num1 * (commonDenom / denom1);
  const adjustedNum2 = num2 * (commonDenom / denom2);
  const resultNum = adjustedNum1 - adjustedNum2;

  const simplified = simplifyFraction(resultNum, commonDenom);
  const answerStr = `${simplified.num}/${simplified.denom}`;

  const wrong1 = `${num1 - num2}/${denom1}`;
  const wrong2 = `${Math.abs(num1 - num2)}/${denom1 + denom2}`;
  const wrong3 = `${resultNum}/${commonDenom}`;

  const options = [
    { label: 'A', text: String(answerStr) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ].sort(() => Math.random() - 0.5);

  const correctLabel = options.find(o => o.text === answerStr).label;

  return {
    problemId: `prob_frac_sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'subtract-fractions',
    content: `Subtract: ${num1}/${denom1} - ${num2}/${denom2}`,
    answer: answerStr,
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['fractions', 'subtraction']
    },
    isActive: true
  };
}

function generateFractionMultiplication(difficulty) {
  const maxNumerator = difficulty < 0 ? 5 : difficulty < 1 ? 8 : 12;
  const maxDenominator = difficulty < 0 ? 6 : difficulty < 1 ? 10 : 15;

  const num1 = randomInt(1, maxNumerator);
  const denom1 = randomInt(2, maxDenominator);
  const num2 = randomInt(1, maxNumerator);
  const denom2 = randomInt(2, maxDenominator);

  const resultNum = num1 * num2;
  const resultDenom = denom1 * denom2;

  const simplified = simplifyFraction(resultNum, resultDenom);
  const answerStr = `${simplified.num}/${simplified.denom}`;

  const wrong1 = `${resultNum}/${resultDenom}`; // Unsimplified
  const wrong2 = `${num1 + num2}/${denom1 + denom2}`; // Add instead
  const wrong3 = `${num1 * denom2}/${denom1 * num2}`; // Cross multiply wrong

  const options = [
    { label: 'A', text: String(answerStr) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ].sort(() => Math.random() - 0.5);

  const correctLabel = options.find(o => o.text === answerStr).label;

  return {
    problemId: `prob_frac_mult_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'multiply-fractions',
    content: `Multiply: ${num1}/${denom1} × ${num2}/${denom2}`,
    answer: answerStr,
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['fractions', 'multiplication']
    },
    isActive: true
  };
}

async function generateProblems() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected\n');

    const problems = [];
    const difficulties = [-1, -0.5, 0, 0.5, 1, 1.5];

    console.log('Generating fraction problems...\n');

    // Generate 30 addition problems (5 at each difficulty)
    for (const diff of difficulties) {
      for (let i = 0; i < 5; i++) {
        problems.push(generateFractionAddition(diff));
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay for unique IDs
      }
    }

    // Generate 30 subtraction problems
    for (const diff of difficulties) {
      for (let i = 0; i < 5; i++) {
        problems.push(generateFractionSubtraction(diff));
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    // Generate 24 multiplication problems (4 at each difficulty)
    for (const diff of difficulties) {
      for (let i = 0; i < 4; i++) {
        problems.push(generateFractionMultiplication(diff));
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    console.log(`Generated ${problems.length} problems total:\n`);
    console.log(`  - add-fractions: 30 problems`);
    console.log(`  - subtract-fractions: 30 problems`);
    console.log(`  - multiply-fractions: 24 problems\n`);

    console.log('Saving to database...\n');

    const result = await Problem.insertMany(problems);

    console.log(`✅ Successfully saved ${result.length} problems to database!\n`);

    // Show samples
    console.log('Sample problems:\n');
    const sample = problems.slice(0, 3);
    sample.forEach(p => {
      console.log(`${p.content}`);
      console.log(`Options: ${p.options.map(o => `${o.label}: ${o.text}`).join(', ')}`);
      console.log(`Answer: ${p.answer} (${p.correctOption})\n`);
    });

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

  } catch (error) {
    console.error('Error generating problems:', error);
    process.exit(1);
  }
}

generateProblems();
