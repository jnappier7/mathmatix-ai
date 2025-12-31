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

function generateDivision(difficulty) {
  const divisor = difficulty < -1 ? randomInt(2, 5) : difficulty < 0 ? randomInt(2, 10) : randomInt(2, 12);
  const quotient = randomInt(2, 20);
  const dividend = divisor * quotient; // Ensure clean division
  const answer = quotient;

  const wrong1 = answer + randomInt(1, 5);
  const wrong2 = answer - randomInt(1, 3);
  const wrong3 = divisor; // Common mistake: confusing divisor with quotient

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_div_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'division-basics',
    content: `${dividend} ÷ ${divisor} = ?`,
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
      estimatedTime: 30,
      source: 'template',
      tags: ['division', 'basic-operations']
    },
    isActive: true
  };
}

function generateDecimals(difficulty) {
  const a = (randomInt(10, 99) / 10).toFixed(1);
  const b = (randomInt(10, 99) / 10).toFixed(1);
  const answer = (parseFloat(a) + parseFloat(b)).toFixed(1);

  const wrong1 = (parseFloat(a) + parseFloat(b) + 0.1).toFixed(1);
  const wrong2 = (parseFloat(a) + parseFloat(b) - 0.1).toFixed(1);
  const wrong3 = (parseInt(a) + parseInt(b)).toString(); // Ignore decimals mistake

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_dec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'decimals',
    content: `${a} + ${b} = ?`,
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
    dokLevel: 2,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['decimals', 'addition']
    },
    isActive: true
  };
}

function generateOrderOfOperations(difficulty) {
  const a = randomInt(2, 10);
  const b = randomInt(2, 10);
  const c = randomInt(1, 10);
  const answer = a * b + c; // Correct: multiply first, then add

  const wrong1 = (a + b) * c; // Wrong: add first
  const wrong2 = a * (b + c); // Wrong: parentheses in wrong place
  const wrong3 = a + b * c; // Different expression

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'order-of-operations',
    content: `${a} × ${b} + ${c} = ?`,
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
      tags: ['order-of-operations', 'expressions']
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
  let x2 = randomInt(-5, 5);
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

function generateExponents(difficulty) {
  const base = randomInt(2, 10);
  const exponent = difficulty < 0 ? 2 : randomInt(2, 4);
  const answer = Math.pow(base, exponent);

  const wrong1 = base * exponent; // Common mistake: multiply instead
  const wrong2 = base + exponent;
  const wrong3 = Math.pow(base, exponent - 1);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'exponents',
    content: `${base}^${exponent} = ?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty, discrimination: 1.3, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 2,
    metadata: { estimatedTime: 35, source: 'template', tags: ['exponents', 'powers'] },
    isActive: true
  };
}

function generateIntegers(difficulty) {
  const a = randomInt(-20, 20);
  const b = randomInt(-20, 20);
  const answer = a + b;

  const wrong1 = Math.abs(a) + Math.abs(b);  // Forgot negative signs
  const wrong2 = a - b;  // Subtracted instead
  const wrong3 = answer + randomInt(1, 10);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'integers',
    content: `${a} + (${b}) = ?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty, discrimination: 1.2, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 2,
    metadata: { estimatedTime: 35, source: 'template', tags: ['integers', 'negative-numbers'] },
    isActive: true
  };
}

function generateProportions(difficulty) {
  const a = randomInt(2, 10);
  const b = randomInt(2, 10);
  const k = randomInt(2, 5);
  const c = a * k;
  const x = b * k;  // This is the answer

  const wrong1 = c + b;
  const wrong2 = c - b;
  const wrong3 = (a * b) / c;

  const options = shuffle([
    { label: 'A', text: String(x) },
    { label: 'B', text: String(Math.round(wrong1)) },
    { label: 'C', text: String(Math.round(wrong2)) },
    { label: 'D', text: String(Math.round(wrong3)) }
  ]);

  const correctLabel = options.find(o => o.text === String(x)).label;

  return {
    problemId: `prob_prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'proportions',
    content: `Solve for x: ${a}/${b} = ${c}/x`,
    answer: String(x),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty, discrimination: 1.4, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 2,
    metadata: { estimatedTime: 50, source: 'template', tags: ['proportions', 'ratios'] },
    isActive: true
  };
}

function generatePythagorean(difficulty) {
  const a = randomInt(3, 12);
  const b = randomInt(3, 12);
  const c = Math.sqrt(a * a + b * b);
  const answer = c % 1 === 0 ? c : c.toFixed(1);

  const wrong1 = (a + b).toFixed(1);
  const wrong2 = Math.sqrt(a + b).toFixed(1);
  const wrong3 = (c + 1).toFixed(1);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_pyth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'pythagorean-theorem',
    content: `Find the hypotenuse: a = ${a}, b = ${b}`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty, discrimination: 1.3, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 2,
    metadata: { estimatedTime: 45, source: 'template', tags: ['geometry', 'pythagorean-theorem'] },
    isActive: true
  };
}

// ============================================================================
// TIER 3 (9-12) - HIGH SCHOOL GENERATORS
// ============================================================================

function generateSystemsOfEquations(difficulty) {
  const x = randomInt(1, 10);
  const y = randomInt(1, 10);
  const a1 = randomInt(1, 5);
  const b1 = randomInt(1, 5);
  const c1 = a1 * x + b1 * y;

  const answer = `(${x}, ${y})`;
  const wrong1 = `(${y}, ${x})`; // Swapped
  const wrong2 = `(${x + 1}, ${y})`;
  const wrong3 = `(${x}, ${y + 1})`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_sys_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'systems-of-equations',
    content: `Solution to: ${a1}x + ${b1}y = ${c1}, x = ${x}`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty + 0.5, discrimination: 1.5, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 3,
    metadata: { estimatedTime: 60, source: 'template', tags: ['systems', 'linear-equations'] },
    isActive: true
  };
}

function generatePolynomials(difficulty) {
  const a = randomInt(1, 5);
  const b = randomInt(1, 5);
  const answer = `${a + b}x`;

  const wrong1 = `${a * b}x`;
  const wrong2 = `${a}x + ${b}`;
  const wrong3 = `${a + b}x^2`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_poly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'polynomials',
    content: `Simplify: ${a}x + ${b}x`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty, discrimination: 1.3, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 2,
    metadata: { estimatedTime: 40, source: 'template', tags: ['polynomials', 'algebra'] },
    isActive: true
  };
}

function generateExponentialFunctions(difficulty) {
  const a = randomChoice([2, 3, 5]);
  const b = randomInt(0, 3);
  const answer = Math.pow(a, b);

  const wrong1 = a * b;
  const wrong2 = Math.pow(a, b + 1);
  const wrong3 = Math.pow(a, b - 1);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_expfn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'exponential-functions',
    content: `Evaluate: f(x) = ${a}^x when x = ${b}`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty, discrimination: 1.4, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 3,
    metadata: { estimatedTime: 45, source: 'template', tags: ['exponential', 'functions'] },
    isActive: true
  };
}

function generateLogarithms(difficulty) {
  const base = randomChoice([2, 3, 10]);
  const answer = randomInt(1, 3);
  const value = Math.pow(base, answer);

  const wrong1 = answer + 1;
  const wrong2 = answer - 1;
  const wrong3 = base;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(Math.max(0, wrong2)) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'logarithms',
    content: `log_${base}(${value}) = ?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty + 0.6, discrimination: 1.5, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 3,
    metadata: { estimatedTime: 50, source: 'template', tags: ['logarithms', 'functions'] },
    isActive: true
  };
}

function generateTrigonometry(difficulty) {
  const angles = [0, 30, 45, 60, 90];
  const angle = randomChoice(angles);
  const sinValues = { 0: '0', 30: '1/2', 45: '√2/2', 60: '√3/2', 90: '1' };
  const answer = sinValues[angle];

  const wrong1 = sinValues[angles[(angles.indexOf(angle) + 1) % angles.length]];
  const wrong2 = sinValues[angles[(angles.indexOf(angle) + 2) % angles.length]];
  const wrong3 = sinValues[angles[(angles.indexOf(angle) - 1 + angles.length) % angles.length]];

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_trig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'trigonometry',
    content: `sin(${angle}°) = ?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty + 0.7, discrimination: 1.5, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 3,
    metadata: { estimatedTime: 50, source: 'template', tags: ['trigonometry', 'unit-circle'] },
    isActive: true
  };
}

// ============================================================================
// CALCULUS (Calc 1-3) GENERATORS
// ============================================================================

function generateLimits(difficulty) {
  const a = randomInt(1, 5);
  const c = randomInt(1, 10);
  const answer = a * c + c;  // Simple polynomial limit

  const wrong1 = a * c;
  const wrong2 = c;
  const wrong3 = 'DNE';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_lim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'limits',
    content: `lim(x→${c}) [${a}x + ${c}] = ?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty + 1.0, discrimination: 1.6, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 4,
    metadata: { estimatedTime: 60, source: 'template', tags: ['calculus', 'limits'] },
    isActive: true
  };
}

function generateDerivatives(difficulty) {
  const a = randomInt(2, 8);
  const n = randomInt(2, 4);
  const answer = `${a * n}x^${n - 1}`;

  const wrong1 = `${a}x^${n}`;  // Forgot to take derivative
  const wrong2 = `${a}x^${n - 1}`;  // Forgot coefficient
  const wrong3 = `${a * n}x^${n}`;  // Forgot to reduce power

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_deriv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'derivatives',
    content: `d/dx [${a}x^${n}] = ?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty + 1.2, discrimination: 1.7, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 4,
    metadata: { estimatedTime: 55, source: 'template', tags: ['calculus', 'derivatives'] },
    isActive: true
  };
}

function generateIntegrals(difficulty) {
  const a = randomInt(1, 6);
  const n = randomInt(1, 3);
  const newN = n + 1;
  const newCoeff = a / newN;
  const answer = newCoeff % 1 === 0 ? `${newCoeff}x^${newN}` : `(${a}/${newN})x^${newN}`;

  const wrong1 = `${a}x^${n}`;  // Didn't integrate
  const wrong2 = `${a}x^${newN}`;  // Forgot to divide
  const wrong3 = `${a * newN}x^${newN}`;  // Multiplied instead

  const options = shuffle([
    { label: 'A', text: String(answer) + ' + C' },
    { label: 'B', text: String(wrong1) + ' + C' },
    { label: 'C', text: String(wrong2) + ' + C' },
    { label: 'D', text: String(wrong3) + ' + C' }
  ]);

  const correctLabel = options.find(o => o.text === String(answer) + ' + C').label;

  return {
    problemId: `prob_int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'integrals',
    content: `∫ ${a}x^${n} dx = ?`,
    answer: String(answer) + ' + C',
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: { difficulty: difficulty + 1.3, discrimination: 1.7, calibrationConfidence: 'expert', attemptsCount: 0 },
    dokLevel: 4,
    metadata: { estimatedTime: 65, source: 'template', tags: ['calculus', 'integrals'] },
    isActive: true
  };
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

const GENERATORS = {
  // K-5 (Tier 1) - Elementary
  'addition': generateAddition,
  'subtraction': generateSubtraction,
  'multiplication-basics': generateMultiplicationBasics,
  'division-basics': generateDivision,
  'place-value': generatePlaceValue,
  'decimals': generateDecimals,
  'order-of-operations': generateOrderOfOperations,

  // 6-8 (Tier 2) - Middle School
  'one-step-equations': generateOneStepEquation,
  'two-step-equations': generateTwoStepEquations,
  'combining-like-terms': generateCombiningLikeTerms,
  'ratios': generateRatios,
  'percent-of-a-number': generatePercentOfNumber,
  'area-rectangles': generateAreaRectangles,
  'exponents': generateExponents,
  'integers': generateIntegers,
  'proportions': generateProportions,
  'pythagorean-theorem': generatePythagorean,

  // 9-12 (Tier 3) - High School
  'slope': generateSlope,
  'quadratic-functions': generateQuadraticFunctions,
  'systems-of-equations': generateSystemsOfEquations,
  'polynomials': generatePolynomials,
  'exponential-functions': generateExponentialFunctions,
  'logarithms': generateLogarithms,
  'trigonometry': generateTrigonometry,

  // Calculus (Calc 1-3)
  'limits': generateLimits,
  'derivatives': generateDerivatives,
  'integrals': generateIntegrals
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
