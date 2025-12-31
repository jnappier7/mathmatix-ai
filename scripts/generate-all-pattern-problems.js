/**
 * COMPREHENSIVE PROBLEM GENERATOR FOR ALL PATTERN-BASED SKILLS
 *
 * Generates properly formatted multiple-choice problems for pattern-based curriculum
 * All options use String() to prevent date interpretation issues
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const Skill = require('../models/skill');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ============================================================================
// TIER 1 (K-5) GENERATORS
// ============================================================================

function generateAddition(difficulty) {
  const maxNum = difficulty < -1 ? 20 : difficulty < 0 ? 50 : 100;
  const a = randomInt(1, maxNum);
  const b = randomInt(1, maxNum);
  const answer = a + b;

  const wrong1 = answer + randomInt(1, 10);
  const wrong2 = answer - randomInt(1, 10);
  const wrong3 = Math.abs(a - b);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_add_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'addition',
    content: `${a} + ${b} = ?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 20,
      source: 'template',
      tags: ['addition', 'basic-operations']
    },
    isActive: true
  };
}

function generateSubtraction(difficulty) {
  const maxNum = difficulty < -1 ? 20 : difficulty < 0 ? 50 : 100;
  const a = randomInt(10, maxNum);
  const b = randomInt(1, a - 1);
  const answer = a - b;

  const wrong1 = answer + randomInt(1, 10);
  const wrong2 = answer - randomInt(1, 5);
  const wrong3 = a + b;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'subtraction',
    content: `${a} - ${b} = ?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 20,
      source: 'template',
      tags: ['subtraction', 'basic-operations']
    },
    isActive: true
  };
}

function generateMultiplicationBasics(difficulty) {
  const maxFactor = difficulty < -1 ? 5 : difficulty < 0 ? 10 : 12;
  const a = randomInt(2, maxFactor);
  const b = randomInt(2, maxFactor);
  const answer = a * b;

  const wrong1 = answer + a;
  const wrong2 = answer - b;
  const wrong3 = a + b;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_mult_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'multiplication-basics',
    content: `${a} × ${b} = ?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 25,
      source: 'template',
      tags: ['multiplication', 'basic-operations']
    },
    isActive: true
  };
}

function generatePlaceValue(difficulty) {
  const num = difficulty < -1 ? randomInt(10, 99) :
               difficulty < 0 ? randomInt(100, 999) :
               randomInt(1000, 9999);

  const numStr = String(num);
  const digitIndex = randomInt(0, numStr.length - 1);
  const digit = numStr[digitIndex];

  const placeNames = ['ones', 'tens', 'hundreds', 'thousands'];
  const placeIndex = numStr.length - 1 - digitIndex;
  const answer = placeNames[placeIndex];

  const wrongPlaces = placeNames.filter((_, i) => i !== placeIndex).slice(0, 3);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrongPlaces[0]) },
    { label: 'C', text: String(wrongPlaces[1]) },
    { label: 'D', text: String(wrongPlaces[2] || 'ten-thousands') }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_pv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'place-value',
    content: `In the number ${num}, what place is the digit ${digit}?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['place-value', 'number-sense']
    },
    isActive: true
  };
}

// ============================================================================
// TIER 2 (6-8) GENERATORS
// ============================================================================

function generateOneStepEquation(difficulty) {
  const operations = ['+', '-', '×', '÷'];
  const op = randomChoice(operations);

  let a, b, x;

  if (op === '+') {
    b = randomInt(1, 20);
    x = randomInt(1, 30);
    a = x + b;
  } else if (op === '-') {
    b = randomInt(1, 20);
    x = randomInt(b + 1, 30);
    a = x - b;
  } else if (op === '×') {
    b = randomInt(2, 12);
    x = randomInt(2, 10);
    a = x * b;
  } else { // ÷
    b = randomInt(2, 12);
    x = randomInt(2, 10);
    a = x * b; // ensure clean division
  }

  const answer = x;
  const wrong1 = answer + randomInt(1, 5);
  const wrong2 = answer - randomInt(1, 5);
  const wrong3 = op === '+' ? a - b : op === '-' ? a + b : op === '×' ? a / b : a * b;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(Math.round(wrong3)) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  const opSymbol = op === '×' ? '×' : op === '÷' ? '÷' : op;
  const equation = op === '+' ? `x + ${b} = ${a}` :
                   op === '-' ? `x - ${b} = ${a}` :
                   op === '×' ? `${b}x = ${a}` :
                   `x ÷ ${b} = ${x}`;

  return {
    problemId: `prob_1step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'one-step-equations',
    content: `Solve for x: ${equation}`,
    answer: String(answer),
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
      tags: ['equations', 'algebra']
    },
    isActive: true
  };
}

function generateCombiningLikeTerms(difficulty) {
  const a = randomInt(2, 10);
  const b = randomInt(2, 10);
  const answer = a + b;

  const wrong1 = a * b;
  const wrong2 = answer + 1;
  const wrong3 = Math.abs(a - b);

  const options = shuffle([
    { label: 'A', text: String(`${answer}x`) },
    { label: 'B', text: String(`${wrong1}x`) },
    { label: 'C', text: String(`${wrong2}x`) },
    { label: 'D', text: String(`${wrong3}x`) }
  ]);

  const correctLabel = options.find(o => o.text === String(`${answer}x`)).label;

  return {
    problemId: `prob_combine_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'combining-like-terms',
    content: `Simplify: ${a}x + ${b}x`,
    answer: String(`${answer}x`),
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
      estimatedTime: 35,
      source: 'template',
      tags: ['expressions', 'algebra']
    },
    isActive: true
  };
}

function generateTwoStepEquations(difficulty) {
  const a = randomInt(2, 10);
  const b = randomInt(1, 20);
  const x = randomInt(2, 15);
  const result = a * x + b;

  const answer = x;
  const wrong1 = (result - b);  // Forgot to divide
  const wrong2 = (result / a);   // Forgot to subtract
  const wrong3 = answer + randomInt(1, 5);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_2step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'two-step-equations',
    content: `Solve for x: ${a}x + ${b} = ${result}`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty + 0.3, discrimination: 1.4, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 2,
    metadata: { estimatedTime: 50, source: 'template', tags: ['equations', 'algebra'] },
    isActive: true
  };
}

function generateSlope(difficulty) {
  const x1 = randomInt(-5, 5);
  const y1 = randomInt(-5, 5);
  const x2 = randomInt(-5, 5);
  const y2 = randomInt(-5, 5);

  if (x2 === x1) { x2 = x1 + 1; } // Avoid undefined slope

  const rise = y2 - y1;
  const run = x2 - x1;
  const gcdVal = Math.abs(gcd(rise, run));
  const simplifiedRise = rise / gcdVal;
  const simplifiedRun = run / gcdVal;

  const answer = simplifiedRun === 1 ? String(simplifiedRise) : `${simplifiedRise}/${simplifiedRun}`;

  const wrong1 = `${y2}/${x2}`;
  const wrong2 = `${run}/${rise}`;  // Inverted
  const wrong3 = String(simplifiedRise + simplifiedRun);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_slope_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'slope',
    content: `Find the slope between (${x1}, ${y1}) and (${x2}, ${y2})`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty, discrimination: 1.3, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 2,
    metadata: { estimatedTime: 45, source: 'template', tags: ['graphing', 'linear-equations'] },
    isActive: true
  };
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

function generateRatios(difficulty) {
  const a = randomInt(1, 12);
  const b = randomInt(1, 12);
  const gcdVal = gcd(a, b);
  const simplified_a = a / gcdVal;
  const simplified_b = b / gcdVal;

  const answer = `${simplified_a}:${simplified_b}`;
  const wrong1 = `${a}:${b}`;
  const wrong2 = `${b}:${a}`;
  const wrong3 = `${simplified_b}:${simplified_a}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_ratio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'ratios',
    content: `Simplify the ratio: ${a}:${b}`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty, discrimination: 1.2, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 2,
    metadata: { estimatedTime: 35, source: 'template', tags: ['ratios', 'proportional-reasoning'] },
    isActive: true
  };
}

function generatePercentOfNumber(difficulty) {
  const percent = randomChoice([10, 20, 25, 50, 75]);
  const number = randomInt(20, 200);
  const answer = (percent / 100) * number;

  const wrong1 = number + percent;
  const wrong2 = answer * 2;
  const wrong3 = number - percent;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_pct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'percent-of-a-number',
    content: `What is ${percent}% of ${number}?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty, discrimination: 1.2, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 2,
    metadata: { estimatedTime: 40, source: 'template', tags: ['percent', 'proportional-reasoning'] },
    isActive: true
  };
}

function generateAreaRectangles(difficulty) {
  const length = randomInt(3, 20);
  const width = randomInt(2, 15);
  const answer = length * width;

  const wrong1 = 2 * (length + width); // Perimeter
  const wrong2 = length + width;
  const wrong3 = answer + randomInt(5, 15);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_area_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'area-rectangles',
    content: `Find the area of a rectangle with length ${length} and width ${width}`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty, discrimination: 1.1, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 1,
    metadata: { estimatedTime: 30, source: 'template', tags: ['geometry', 'area'] },
    isActive: true
  };
}

function generateQuadraticFunctions(difficulty) {
  const a = randomChoice([1, 2, -1, -2]);
  const h = randomInt(-3, 3);
  const k = randomInt(-5, 5);

  const answer = `y = ${a}(x - ${h})² + ${k}`;
  const wrong1 = `y = ${a}(x + ${h})² + ${k}`;
  const wrong2 = `y = ${a}(x - ${h})² - ${k}`;
  const wrong3 = `y = ${-a}(x - ${h})² + ${k}`;

  const options = shuffle([
    { label: 'A', text: String(answer).replace('--', '+').replace('- -', '+ ') },
    { label: 'B', text: String(wrong1).replace('--', '+').replace('- -', '+ ') },
    { label: 'C', text: String(wrong2).replace('--', '+').replace('- -', '+ ') },
    { label: 'D', text: String(wrong3).replace('--', '+').replace('- -', '+ ') }
  ]);

  const correctLabel = options.find(o => o.text === String(answer).replace('--', '+').replace('- -', '+ ')).label;

  return {
    problemId: `prob_quad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'quadratic-functions',
    content: `Vertex form of parabola with vertex (${h}, ${k}) and a = ${a}`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty + 0.8, discrimination: 1.5, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 3,
    metadata: { estimatedTime: 60, source: 'template', tags: ['quadratics', 'functions'] },
    isActive: true
  };
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

const GENERATORS = {
  // K-5 (Tier 1)
  'addition': generateAddition,
  'subtraction': generateSubtraction,
  'multiplication-basics': generateMultiplicationBasics,
  'place-value': generatePlaceValue,

  // 6-8 (Tier 2)
  'one-step-equations': generateOneStepEquation,
  'two-step-equations': generateTwoStepEquations,
  'combining-like-terms': generateCombiningLikeTerms,
  'ratios': generateRatios,
  'percent-of-a-number': generatePercentOfNumber,
  'area-rectangles': generateAreaRectangles,

  // 9-12 (Tier 3)
  'slope': generateSlope,
  'quadratic-functions': generateQuadraticFunctions
};

async function generateAllProblems() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected\n');

    // Get all pattern-based skills
    const patternSkills = await Skill.find({ unit: { $regex: 'Pattern' } })
      .select('skillId displayName unit')
      .lean();

    console.log(`Found ${patternSkills.length} pattern-based skills\n`);

    // Check which skills have generators
    const skillsWithGenerators = patternSkills.filter(s => GENERATORS[s.skillId]);
    const skillsWithoutGenerators = patternSkills.filter(s => !GENERATORS[s.skillId]);

    console.log(`Skills with generators: ${skillsWithGenerators.length}`);
    console.log(`Skills needing generators: ${skillsWithoutGenerators.length}\n`);

    // Generate problems for skills that have generators
    const problems = [];
    const difficulties = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5];
    const problemsPerDifficulty = 11; // Increased to reach ~1000 total problems

    console.log('Generating problems...\n');

    for (const skill of skillsWithGenerators) {
      const generator = GENERATORS[skill.skillId];
      let count = 0;

      for (const diff of difficulties) {
        for (let i = 0; i < problemsPerDifficulty; i++) {
          problems.push(generator(diff));
          count++;
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }

      console.log(`✓ ${skill.skillId}: ${count} problems`);
    }

    console.log(`\n📊 Total: ${problems.length} problems generated\n`);

    console.log('Saving to database...\n');
    const result = await Problem.insertMany(problems);
    console.log(`✅ Successfully saved ${result.length} problems!\n`);

    // Show sample
    console.log('Sample problems:\n');
    problems.slice(0, 3).forEach(p => {
      console.log(`${p.content}`);
      console.log(`Options: ${p.options.map(o => `${o.label}: ${o.text}`).join(', ')}`);
      console.log(`Answer: ${p.answer} (${p.correctOption})\n`);
    });

    console.log('Skills still needing generators:\n');
    skillsWithoutGenerators.slice(0, 20).forEach(s => {
      console.log(`  - ${s.skillId}`);
    });
    if (skillsWithoutGenerators.length > 20) {
      console.log(`  ... and ${skillsWithoutGenerators.length - 20} more\n`);
    }

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');

  } catch (error) {
    console.error('Error generating problems:', error);
    process.exit(1);
  }
}

generateAllProblems();
