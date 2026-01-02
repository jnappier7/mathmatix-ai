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
// SVG HELPER FUNCTIONS FOR VISUAL DIAGRAMS
// ============================================================================

/**
 * Generate SVG for a labeled triangle
 * @param {number} base - Base length
 * @param {number} height - Height
 * @param {object} labels - {a, b, c} side labels or null
 */
function generateTriangleSVG(base, height, labels = null) {
  const scale = 15; // pixels per unit
  const padding = 40;
  const width = base * scale + padding * 2;
  const svgHeight = height * scale + padding * 2;

  // Triangle points (base on bottom)
  const x1 = padding;
  const y1 = svgHeight - padding;
  const x2 = padding + base * scale;
  const y2 = svgHeight - padding;
  const x3 = padding + (base * scale) / 2;
  const y3 = svgHeight - padding - height * scale;

  const labelA = labels?.a || base;
  const labelB = labels?.b || '';
  const labelC = labels?.c || '';

  return `<svg width="${width}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
    <!-- Triangle -->
    <polygon points="${x1},${y1} ${x2},${y2} ${x3},${y3}"
             fill="none" stroke="#667eea" stroke-width="3"/>

    <!-- Base label -->
    <text x="${(x1 + x2) / 2}" y="${y1 + 25}"
          text-anchor="middle" font-size="16" font-weight="600" fill="#333">
      ${labelA}
    </text>

    <!-- Height line (if showing height) -->
    ${height && labels?.showHeight ? `
      <line x1="${x3}" y1="${y3}" x2="${x3}" y2="${y1}"
            stroke="#764ba2" stroke-width="2" stroke-dasharray="5,5"/>
      <text x="${x3 - 25}" y="${(y1 + y3) / 2}"
            text-anchor="middle" font-size="16" font-weight="600" fill="#333">
        ${height}
      </text>
    ` : ''}

    <!-- Vertices -->
    <circle cx="${x1}" cy="${y1}" r="4" fill="#667eea"/>
    <circle cx="${x2}" cy="${y2}" r="4" fill="#667eea"/>
    <circle cx="${x3}" cy="${y3}" r="4" fill="#667eea"/>
  </svg>`;
}

/**
 * Generate SVG for a labeled rectangle
 * @param {number} length - Length
 * @param {number} width - Width
 */
function generateRectangleSVG(length, width) {
  const scale = 20;
  const padding = 50;
  const svgWidth = length * scale + padding * 2;
  const svgHeight = width * scale + padding * 2;

  const x = padding;
  const y = padding;
  const rectWidth = length * scale;
  const rectHeight = width * scale;

  return `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
    <!-- Rectangle -->
    <rect x="${x}" y="${y}" width="${rectWidth}" height="${rectHeight}"
          fill="#e6f2ff" stroke="#667eea" stroke-width="3"/>

    <!-- Length label (bottom) -->
    <text x="${x + rectWidth / 2}" y="${y + rectHeight + 30}"
          text-anchor="middle" font-size="16" font-weight="600" fill="#333">
      ${length}
    </text>

    <!-- Width label (right side) -->
    <text x="${x + rectWidth + 30}" y="${y + rectHeight / 2}"
          text-anchor="middle" font-size="16" font-weight="600" fill="#333"
          transform="rotate(90, ${x + rectWidth + 30}, ${y + rectHeight / 2})">
      ${width}
    </text>

    <!-- Corners -->
    <circle cx="${x}" cy="${y}" r="4" fill="#667eea"/>
    <circle cx="${x + rectWidth}" cy="${y}" r="4" fill="#667eea"/>
    <circle cx="${x}" cy="${y + rectHeight}" r="4" fill="#667eea"/>
    <circle cx="${x + rectWidth}" cy="${y + rectHeight}" r="4" fill="#667eea"/>
  </svg>`;
}

/**
 * Generate SVG for coordinate plane with a point
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
function generateCoordinatePlaneSVG(x, y) {
  const scale = 30;
  const padding = 60;
  const gridSize = 10;
  const svgWidth = gridSize * scale + padding * 2;
  const svgHeight = gridSize * scale + padding * 2;

  const originX = padding + (gridSize / 2) * scale;
  const originY = padding + (gridSize / 2) * scale;

  const pointX = originX + x * scale;
  const pointY = originY - y * scale;

  return `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
    <!-- Grid lines -->
    ${Array.from({length: gridSize + 1}, (_, i) => {
      const pos = padding + i * scale;
      return `<line x1="${pos}" y1="${padding}" x2="${pos}" y2="${svgHeight - padding}"
                    stroke="#e2e8f0" stroke-width="1"/>
              <line x1="${padding}" y1="${pos}" x2="${svgWidth - padding}" y2="${pos}"
                    stroke="#e2e8f0" stroke-width="1"/>`;
    }).join('')}

    <!-- Axes -->
    <line x1="${padding}" y1="${originY}" x2="${svgWidth - padding}" y2="${originY}"
          stroke="#333" stroke-width="2"/>
    <line x1="${originX}" y1="${padding}" x2="${originX}" y2="${svgHeight - padding}"
          stroke="#333" stroke-width="2"/>

    <!-- Axis labels -->
    <text x="${svgWidth - padding + 15}" y="${originY + 5}" font-size="14" font-weight="600">x</text>
    <text x="${originX - 5}" y="${padding - 10}" font-size="14" font-weight="600">y</text>

    <!-- Point -->
    <circle cx="${pointX}" cy="${pointY}" r="6" fill="#667eea" stroke="white" stroke-width="2"/>
    <text x="${pointX + 12}" y="${pointY - 8}" font-size="14" font-weight="600" fill="#667eea">
      (${x}, ${y})
    </text>
  </svg>`;
}

/**
 * Generate SVG for an angle with arc
 * @param {number} degrees - Angle in degrees
 */
function generateAngleSVG(degrees) {
  const svgWidth = 300;
  const svgHeight = 250;
  const originX = 80;
  const originY = svgHeight - 60;
  const radius = 100;

  const radians = (degrees * Math.PI) / 180;
  const endX = originX + radius * Math.cos(radians);
  const endY = originY - radius * Math.sin(radians);

  return `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
    <!-- Angle rays -->
    <line x1="${originX}" y1="${originY}" x2="${originX + radius}" y2="${originY}"
          stroke="#667eea" stroke-width="3"/>
    <line x1="${originX}" y1="${originY}" x2="${endX}" y2="${endY}"
          stroke="#667eea" stroke-width="3"/>

    <!-- Arc -->
    <path d="M ${originX + 40} ${originY} A 40 40 0 0 1 ${originX + 40 * Math.cos(radians)} ${originY - 40 * Math.sin(radians)}"
          fill="none" stroke="#764ba2" stroke-width="2"/>

    <!-- Angle label -->
    <text x="${originX + 50}" y="${originY - 10}" font-size="18" font-weight="600" fill="#764ba2">
      ${degrees}°
    </text>

    <!-- Vertex -->
    <circle cx="${originX}" cy="${originY}" r="5" fill="#667eea"/>
  </svg>`;
}

// ============================================================================
// EARLY FOUNDATIONS (PreK-2) GENERATORS
// ============================================================================

function generateCounting(difficulty) {
  const start = randomInt(1, 20);
  const count = difficulty < 0 ? 3 : 5;
  const answer = start + count;

  const wrong1 = start + count - 1;
  const wrong2 = start + count + 1;
  const wrong3 = start + count + 2;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_count_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'counting',
    content: `Count from ${start}: ${start}, ${start + 1}, ${start + 2}, ...  What comes after ${start + count - 1}?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.5,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 15,
      source: 'template',
      tags: ['counting', 'number-sense']
    },
    isActive: true
  };
}

function generateSkipCounting(difficulty) {
  const skipBy = randomChoice([2, 5, 10]);
  const start = skipBy;
  const steps = difficulty < 0 ? 2 : 3;
  const answer = start + (skipBy * steps);

  const wrong1 = answer + skipBy;
  const wrong2 = answer - skipBy;
  const wrong3 = answer + 1;

  const sequence = [];
  for (let i = 0; i < steps; i++) {
    sequence.push(start + (skipBy * i));
  }

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_skip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'skip-counting',
    content: `Count by ${skipBy}s: ${sequence.join(', ')}, ... What comes next?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.3,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 20,
      source: 'template',
      tags: ['skip-counting', 'patterns']
    },
    isActive: true
  };
}

function generateCompareNumbers(difficulty) {
  const a = difficulty < 0 ? randomInt(1, 20) : randomInt(10, 100);
  const b = difficulty < 0 ? randomInt(1, 20) : randomInt(10, 100);

  const answer = a > b ? '>' : a < b ? '<' : '=';

  const options = shuffle([
    { label: 'A', text: String('>') },
    { label: 'B', text: String('<') },
    { label: 'C', text: String('=') }
  ]);

  // Add a fourth option
  options.push({ label: 'D', text: String('cannot compare') });

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'compare-numbers',
    content: `Compare: ${a} ___ ${b}`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.4,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 20,
      source: 'template',
      tags: ['comparing', 'number-sense']
    },
    isActive: true
  };
}

function generateOrderingNumbers(difficulty) {
  const nums = [];
  const range = difficulty < 0 ? 20 : 50;

  for (let i = 0; i < 3; i++) {
    nums.push(randomInt(1, range));
  }

  const sorted = [...nums].sort((a, b) => a - b);
  const answer = sorted.join(', ');

  // Generate wrong orderings
  const reversed = [...sorted].reverse().join(', ');
  const shuffled1 = [sorted[1], sorted[0], sorted[2]].join(', ');
  const shuffled2 = [sorted[2], sorted[1], sorted[0]].join(', ');

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(reversed) },
    { label: 'C', text: String(shuffled1) },
    { label: 'D', text: String(shuffled2) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'ordering-numbers',
    content: `Order from least to greatest: ${nums.join(', ')}`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.2,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 25,
      source: 'template',
      tags: ['ordering', 'number-sense']
    },
    isActive: true
  };
}

function generateRounding(difficulty) {
  const num = difficulty < 0 ? randomInt(11, 99) : randomInt(101, 999);
  const roundTo = difficulty < 0 ? 10 : 100;
  const answer = Math.round(num / roundTo) * roundTo;

  const wrong1 = answer + roundTo;
  const wrong2 = answer - roundTo;
  const wrong3 = num;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_round_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'rounding',
    content: `Round ${num} to the nearest ${roundTo}`,
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
      estimatedTime: 30,
      source: 'template',
      tags: ['rounding', 'estimation']
    },
    isActive: true
  };
}

function generateFactFamilies(difficulty) {
  const a = randomInt(2, 10);
  const b = randomInt(2, 10);
  const sum = a + b;

  const question = randomChoice([
    { content: `${a} + ${b} = ${sum}. What is ${sum} - ${a}?`, answer: b },
    { content: `${sum} - ${a} = ${b}. What is ${a} + ${b}?`, answer: sum },
    { content: `${a} + ${b} = ${sum}. What is ${sum} - ${b}?`, answer: a }
  ]);

  const answer = question.answer;
  const wrong1 = answer + randomInt(1, 5);
  const wrong2 = answer - randomInt(1, 3);
  const wrong3 = sum;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_fact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'fact-families',
    content: question.content,
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
      tags: ['fact-families', 'inverse-operations']
    },
    isActive: true
  };
}

function generateMoneyMath(difficulty) {
  const dollars1 = randomInt(1, 10);
  const cents1 = randomChoice([0, 25, 50, 75]);
  const dollars2 = randomInt(1, 10);
  const cents2 = randomChoice([0, 25, 50, 75]);

  const total1 = dollars1 + (cents1 / 100);
  const total2 = dollars2 + (cents2 / 100);
  const answer = (total1 + total2).toFixed(2);

  const wrong1 = (parseFloat(answer) + 1).toFixed(2);
  const wrong2 = (parseFloat(answer) - 0.50).toFixed(2);
  const wrong3 = (dollars1 + dollars2).toFixed(2); // Forgot cents

  const options = shuffle([
    { label: 'A', text: String('$' + answer) },
    { label: 'B', text: String('$' + wrong1) },
    { label: 'C', text: String('$' + wrong2) },
    { label: 'D', text: String('$' + wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String('$' + answer)).label;

  return {
    problemId: `prob_money_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'money-math',
    content: `$${dollars1}.${cents1.toString().padStart(2, '0')} + $${dollars2}.${cents2.toString().padStart(2, '0')} = ?`,
    answer: String('$' + answer),
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
      tags: ['money', 'decimals', 'real-world']
    },
    isActive: true
  };
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

function generateSimplifyFractions(difficulty) {
  const num = randomInt(2, 20);
  const denom = randomInt(2, 20);
  const gcdVal = gcd(num, denom);
  const simplifiedNum = num / gcdVal;
  const simplifiedDenom = denom / gcdVal;

  const answer = gcdVal === 1 ? `${num}/${denom}` : `${simplifiedNum}/${simplifiedDenom}`;
  const wrong1 = `${num}/${denom}`; // Not simplified
  const wrong2 = `${simplifiedNum + 1}/${simplifiedDenom}`;
  const wrong3 = `${simplifiedNum}/${simplifiedDenom + 1}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_simpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'simplify-fractions',
    content: `Simplify: ${num}/${denom}`,
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
      estimatedTime: 40,
      source: 'template',
      tags: ['fractions', 'simplifying']
    },
    isActive: true
  };
}

function generateEquivalentFractions(difficulty) {
  const num = randomInt(1, 10);
  const denom = randomInt(2, 10);
  const multiplier = randomInt(2, 5);
  const newNum = num * multiplier;
  const newDenom = denom * multiplier;

  const answer = `${newNum}/${newDenom}`;
  const wrong1 = `${newNum + 1}/${newDenom}`;
  const wrong2 = `${newNum}/${newDenom + 1}`;
  const wrong3 = `${num + multiplier}/${denom + multiplier}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_equiv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'equivalent-fractions',
    content: `Which fraction is equivalent to ${num}/${denom}?`,
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
      tags: ['fractions', 'equivalent']
    },
    isActive: true
  };
}

function generateComparingFractions(difficulty) {
  const num1 = randomInt(1, 10);
  const denom1 = randomInt(2, 12);
  const num2 = randomInt(1, 10);
  const denom2 = randomInt(2, 12);

  const val1 = num1 / denom1;
  const val2 = num2 / denom2;
  const answer = val1 > val2 ? '>' : val1 < val2 ? '<' : '=';

  const options = shuffle([
    { label: 'A', text: String('>') },
    { label: 'B', text: String('<') },
    { label: 'C', text: String('=') }
  ]);

  options.push({ label: 'D', text: String('cannot compare') });

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_compfrac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'comparing-fractions',
    content: `Compare: ${num1}/${denom1} ___ ${num2}/${denom2}`,
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
      estimatedTime: 45,
      source: 'template',
      tags: ['fractions', 'comparing']
    },
    isActive: true
  };
}

function generateMixedNumbers(difficulty) {
  const whole = randomInt(1, 5);
  const num = randomInt(1, 8);
  const denom = randomInt(2, 10);

  const improperNum = whole * denom + num;
  const answer = `${improperNum}/${denom}`;

  const wrong1 = `${whole + num}/${denom}`;
  const wrong2 = `${improperNum}/${denom + 1}`;
  const wrong3 = `${whole}/${denom}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_mixed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'mixed-numbers',
    content: `Convert to a fraction greater than 1: ${whole} ${num}/${denom}`,
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
      tags: ['fractions', 'mixed-numbers']
    },
    isActive: true
  };
}

function generatePerimeter(difficulty) {
  const length = randomInt(3, 15);
  const width = randomInt(2, 10);
  const answer = 2 * (length + width);

  const wrong1 = length * width; // Area instead
  const wrong2 = length + width;
  const wrong3 = answer + randomInt(2, 8);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_perim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'perimeter',
    content: `Find the perimeter of a rectangle with length ${length} and width ${width}`,
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
      tags: ['geometry', 'perimeter']
    },
    isActive: true
  };
}

function generateAreaTriangles(difficulty) {
  const base = randomInt(4, 20);
  const height = randomInt(3, 15);
  const answer = (base * height) / 2;

  const wrong1 = base * height; // Forgot to divide by 2
  const wrong2 = base + height;
  const wrong3 = Math.round(answer / 2);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_areatri_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'area-triangles',
    content: `Find the area of a triangle with base ${base} and height ${height}`,
    svg: generateTriangleSVG(base, height, { showHeight: true }),
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
      estimatedTime: 40,
      source: 'template',
      tags: ['geometry', 'area', 'triangles']
    },
    isActive: true
  };
}

function generateVolume(difficulty) {
  const length = randomInt(2, 10);
  const width = randomInt(2, 10);
  const height = randomInt(2, 10);
  const answer = length * width * height;

  const wrong1 = 2 * (length + width + height); // Perimeter-like thinking
  const wrong2 = length * width; // Just area
  const wrong3 = answer + randomInt(5, 20);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_vol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'volume',
    content: `Find the volume of a rectangular prism: l=${length}, w=${width}, h=${height}`,
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
      estimatedTime: 45,
      source: 'template',
      tags: ['geometry', 'volume']
    },
    isActive: true
  };
}

function generateMean(difficulty) {
  const nums = [];
  const count = difficulty < 0 ? 3 : 5;
  let sum = 0;

  for (let i = 0; i < count; i++) {
    const n = randomInt(1, 20);
    nums.push(n);
    sum += n;
  }

  const answer = (sum / count).toFixed(1);
  const wrong1 = (sum / (count + 1)).toFixed(1);
  const wrong2 = String(Math.max(...nums));
  const wrong3 = String(sum);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_mean_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'mean',
    content: `Find the mean: ${nums.join(', ')}`,
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
      estimatedTime: 50,
      source: 'template',
      tags: ['statistics', 'mean', 'average']
    },
    isActive: true
  };
}

function generateMedian(difficulty) {
  const nums = [];
  const count = difficulty < 0 ? 3 : 5;

  for (let i = 0; i < count; i++) {
    nums.push(randomInt(1, 30));
  }

  const sorted = [...nums].sort((a, b) => a - b);
  const midIndex = Math.floor(sorted.length / 2);
  const answer = sorted.length % 2 === 0
    ? ((sorted[midIndex - 1] + sorted[midIndex]) / 2).toFixed(1)
    : String(sorted[midIndex]);

  const wrong1 = String(sorted[0]);
  const wrong2 = String(sorted[sorted.length - 1]);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const wrong3 = (sum / count).toFixed(1);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_median_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'median',
    content: `Find the median: ${nums.join(', ')}`,
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
      estimatedTime: 50,
      source: 'template',
      tags: ['statistics', 'median']
    },
    isActive: true
  };
}

function generateMode(difficulty) {
  const value = randomInt(1, 15);
  const nums = [value, value]; // Mode appears twice

  const count = difficulty < 0 ? 3 : 5;
  for (let i = 0; i < count - 2; i++) {
    let other = randomInt(1, 15);
    while (other === value) other = randomInt(1, 15);
    nums.push(other);
  }

  nums.sort(() => Math.random() - 0.5); // Shuffle

  const answer = String(value);
  const wrong1 = String(nums[0]);
  const wrong2 = String(Math.max(...nums));
  const wrong3 = String(Math.min(...nums));

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_mode_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'mode',
    content: `Find the mode: ${nums.join(', ')}`,
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
      estimatedTime: 45,
      source: 'template',
      tags: ['statistics', 'mode']
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
    dokLevel: 3,
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
    dokLevel: 3,
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
    dokLevel: 3,
    metadata: { estimatedTime: 65, source: 'template', tags: ['calculus', 'integrals'] },
    isActive: true
  };
}

// ============================================================================
// K-5 & TIER 2 (6-8) ADDITIONAL GEOMETRY GENERATORS
// ============================================================================

function generateAngleMeasurement(difficulty) {
  const angle = randomInt(10, 170);
  const answer = angle;

  const wrong1 = 180 - angle;
  const wrong2 = angle + randomInt(5, 20);
  const wrong3 = angle - randomInt(5, 20);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  const angleType = angle < 90 ? 'acute' : angle === 90 ? 'right' : angle < 180 ? 'obtuse' : 'straight';

  return {
    problemId: `prob_angle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'angle-measurement',
    content: `What is the measure of this angle?`,
    svg: generateAngleSVG(angle),
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
      estimatedTime: 30,
      source: 'template',
      tags: ['geometry', 'angles']
    },
    isActive: true
  };
}

function generateClassifyTriangles(difficulty) {
  const triangleTypes = [
    { sides: 'all equal', name: 'Equilateral' },
    { sides: 'two equal', name: 'Isosceles' },
    { sides: 'all different', name: 'Scalene' }
  ];

  const selected = randomChoice(triangleTypes);
  const answer = selected.name;

  const options = shuffle([
    { label: 'A', text: 'Equilateral' },
    { label: 'B', text: 'Isosceles' },
    { label: 'C', text: 'Scalene' },
    { label: 'D', text: 'Right' }
  ]);

  const correctLabel = options.find(o => o.text === answer).label;

  return {
    problemId: `prob_tri_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'classify-triangles',
    content: `A triangle has ${selected.sides} sides. What type of triangle is it?`,
    answer: answer,
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
      estimatedTime: 35,
      source: 'template',
      tags: ['geometry', 'triangles']
    },
    isActive: true
  };
}

function generateClassifyQuadrilaterals(difficulty) {
  const quadTypes = [
    { description: '4 equal sides and 4 right angles', name: 'Square' },
    { description: 'opposite sides parallel and equal', name: 'Parallelogram' },
    { description: '4 right angles and opposite sides equal', name: 'Rectangle' },
    { description: '4 equal sides but no right angles', name: 'Rhombus' }
  ];

  const selected = randomChoice(quadTypes);
  const answer = selected.name;

  const options = shuffle([
    { label: 'A', text: 'Square' },
    { label: 'B', text: 'Rectangle' },
    { label: 'C', text: 'Parallelogram' },
    { label: 'D', text: 'Rhombus' }
  ]);

  const correctLabel = options.find(o => o.text === answer).label;

  return {
    problemId: `prob_quad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'classify-quadrilaterals',
    content: `A quadrilateral has ${selected.description}. What is it?`,
    answer: answer,
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
      estimatedTime: 40,
      source: 'template',
      tags: ['geometry', 'quadrilaterals']
    },
    isActive: true
  };
}

function generateCircles(difficulty) {
  const radius = randomInt(2, 12);
  const isCircumference = randomChoice([true, false]);

  let answer, content;

  if (isCircumference) {
    answer = (2 * Math.PI * radius).toFixed(2);
    content = `Find the circumference of a circle with radius ${radius}. Use π ≈ 3.14`;
  } else {
    answer = (Math.PI * radius * radius).toFixed(2);
    content = `Find the area of a circle with radius ${radius}. Use π ≈ 3.14`;
  }

  const answerNum = parseFloat(answer);
  const wrong1 = (answerNum * 1.5).toFixed(2);
  const wrong2 = (answerNum * 0.5).toFixed(2);
  const wrong3 = (answerNum + 10).toFixed(2);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_circle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'circles',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['geometry', 'circles']
    },
    isActive: true
  };
}

function generateSurfaceArea(difficulty) {
  const length = randomInt(2, 10);
  const width = randomInt(2, 10);
  const height = randomInt(2, 10);

  const answer = 2 * (length * width + length * height + width * height);
  const wrong1 = length * width * height; // volume instead
  const wrong2 = answer - randomInt(10, 30);
  const wrong3 = answer + randomInt(10, 30);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_sa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'surface-area',
    content: `Find the surface area of a rectangular prism with length ${length}, width ${width}, and height ${height}.`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 55,
      source: 'template',
      tags: ['geometry', 'surface-area', '3d-shapes']
    },
    isActive: true
  };
}

function generateTransformations(difficulty) {
  const transformTypes = [
    { type: 'translation', description: 'slides a figure without rotating or flipping it', name: 'Translation' },
    { type: 'reflection', description: 'flips a figure over a line', name: 'Reflection' },
    { type: 'rotation', description: 'turns a figure around a point', name: 'Rotation' }
  ];

  const selected = randomChoice(transformTypes);
  const answer = selected.name;

  const options = shuffle([
    { label: 'A', text: 'Translation' },
    { label: 'B', text: 'Reflection' },
    { label: 'C', text: 'Rotation' },
    { label: 'D', text: 'Dilation' }
  ]);

  const correctLabel = options.find(o => o.text === answer).label;

  return {
    problemId: `prob_trans_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'transformations',
    content: `Which transformation ${selected.description}?`,
    answer: answer,
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
      estimatedTime: 40,
      source: 'template',
      tags: ['geometry', 'transformations']
    },
    isActive: true
  };
}

// ============================================================================
// DATA & GRAPHING GENERATORS (Tier 1-2)
// ============================================================================

function generateReadingGraphs(difficulty) {
  const x = randomInt(-5, 5);
  const y = randomInt(-5, 5);

  const answer = `(${x}, ${y})`;
  const wrong1 = `(${y}, ${x})`; // Reversed coordinates
  const wrong2 = `(${x + 1}, ${y})`;
  const wrong3 = `(${x}, ${y + 1})`;

  const options = shuffle([
    { label: 'A', text: answer },
    { label: 'B', text: wrong1 },
    { label: 'C', text: wrong2 },
    { label: 'D', text: wrong3 }
  ]);

  const correctLabel = options.find(o => o.text === answer).label;

  return {
    problemId: `prob_graph_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'reading-graphs',
    content: `What are the coordinates of the point shown on the graph?`,
    svg: generateCoordinatePlaneSVG(x, y),
    answer: answer,
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
      estimatedTime: 40,
      source: 'template',
      tags: ['graphing', 'coordinate-plane']
    },
    isActive: true
  };
}

function generateReadingTables(difficulty) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May'];
  const values = [randomInt(10, 50), randomInt(10, 50), randomInt(10, 50), randomInt(10, 50), randomInt(10, 50)];

  const targetMonth = randomChoice(months);
  const targetIndex = months.indexOf(targetMonth);
  const answer = values[targetIndex];

  const wrong1 = values[(targetIndex + 1) % 5];
  const wrong2 = values[(targetIndex + 2) % 5];
  const wrong3 = answer + randomInt(5, 15);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  const tableData = months.map((m, i) => `${m}: ${values[i]}`).join(', ');

  return {
    problemId: `prob_table_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'reading-tables',
    content: `The table shows monthly sales: ${tableData}. How many sales were in ${targetMonth}?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.2,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['data', 'tables']
    },
    isActive: true
  };
}

function generateScatterplots(difficulty) {
  const correlationTypes = [
    { type: 'positive', description: 'as x increases, y increases', answer: 'Positive correlation' },
    { type: 'negative', description: 'as x increases, y decreases', answer: 'Negative correlation' },
    { type: 'none', description: 'x and y have no clear relationship', answer: 'No correlation' }
  ];

  const selected = randomChoice(correlationTypes);
  const answer = selected.answer;

  const options = shuffle([
    { label: 'A', text: 'Positive correlation' },
    { label: 'B', text: 'Negative correlation' },
    { label: 'C', text: 'No correlation' },
    { label: 'D', text: 'Perfect correlation' }
  ]);

  const correctLabel = options.find(o => o.text === answer).label;

  return {
    problemId: `prob_scatter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'scatterplots',
    content: `A scatterplot shows that ${selected.description}. What type of correlation is this?`,
    answer: answer,
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
      estimatedTime: 45,
      source: 'template',
      tags: ['statistics', 'scatterplots', 'correlation']
    },
    isActive: true
  };
}

// ============================================================================
// WORD PROBLEM GENERATORS (Tier 2-3)
// ============================================================================

function generatePythagoreanWordProblems(difficulty) {
  const scenarios = [
    {
      context: 'ladder',
      setup: (a, c) => `A ${c}-foot ladder leans against a wall. The base is ${a} feet from the wall.`,
      question: 'How high up the wall does the ladder reach?'
    },
    {
      context: 'diagonal',
      setup: (a, b) => `A rectangle has length ${a} feet and width ${b} feet.`,
      question: 'What is the length of the diagonal?'
    },
    {
      context: 'distance',
      setup: (a, b) => `You walk ${a} blocks north and ${b} blocks east.`,
      question: 'How far are you from your starting point?'
    }
  ];

  const scenario = randomChoice(scenarios);
  const a = randomInt(3, 12);
  const b = randomInt(3, 12);
  const c = Math.sqrt(a * a + b * b);

  let answer, content;
  if (scenario.context === 'ladder') {
    const hyp = randomInt(13, 20);
    const base = randomInt(5, 12);
    const height = Math.sqrt(hyp * hyp - base * base);
    answer = height.toFixed(1);
    content = scenario.setup(base, hyp) + ' ' + scenario.question;
  } else {
    answer = c.toFixed(1);
    content = scenario.setup(a, b) + ' ' + scenario.question;
  }

  const answerNum = parseFloat(answer);
  const wrong1 = (a + b).toFixed(1);
  const wrong2 = (answerNum * 1.2).toFixed(1);
  const wrong3 = (answerNum * 0.8).toFixed(1);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_pythword_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'pythagorean-word-problems',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.5,
      discrimination: 1.5,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 60,
      source: 'template',
      tags: ['geometry', 'pythagorean-theorem', 'word-problems']
    },
    isActive: true
  };
}

function generateTrigWordProblems(difficulty) {
  const scenarios = [
    {
      type: 'angle-of-elevation',
      setup: (distance, height) => `You stand ${distance} meters from a building that is ${height} meters tall.`,
      question: 'What is the angle of elevation to the top?'
    },
    {
      type: 'shadow',
      setup: (height, angle) => `A ${height}-meter tree casts a shadow when the sun is at ${angle}°.`,
      question: 'How long is the shadow?'
    }
  ];

  const scenario = randomChoice(scenarios);

  if (scenario.type === 'angle-of-elevation') {
    const distance = randomInt(10, 30);
    const height = randomInt(20, 50);
    const angleRad = Math.atan(height / distance);
    const angleDeg = angleRad * (180 / Math.PI);
    const answer = angleDeg.toFixed(1);

    const wrong1 = (angleDeg + 10).toFixed(1);
    const wrong2 = (angleDeg - 10).toFixed(1);
    const wrong3 = (90 - angleDeg).toFixed(1);

    const options = shuffle([
      { label: 'A', text: String(answer) },
      { label: 'B', text: String(wrong1) },
      { label: 'C', text: String(wrong2) },
      { label: 'D', text: String(wrong3) }
    ]);

    const correctLabel = options.find(o => o.text === String(answer)).label;

    return {
      problemId: `prob_trigword_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      skillId: 'trig-word-problems',
      content: scenario.setup(distance, height) + ' ' + scenario.question,
      answer: String(answer),
      correctOption: correctLabel,
      answerType: 'multiple-choice',
      options: options,
      irtParameters: {
        difficulty: difficulty + 0.7,
        discrimination: 1.6,
        calibrationConfidence: 'expert',
        attemptsCount: 0
      },
      dokLevel: 3,
      metadata: {
        estimatedTime: 70,
        source: 'template',
        tags: ['trigonometry', 'word-problems', 'angle-of-elevation']
      },
      isActive: true
    };
  } else {
    // shadow problem
    const height = randomInt(5, 15);
    const angle = randomInt(30, 60);
    const angleRad = angle * (Math.PI / 180);
    const shadow = height / Math.tan(angleRad);
    const answer = shadow.toFixed(1);

    const wrong1 = (shadow * 1.3).toFixed(1);
    const wrong2 = (shadow * 0.7).toFixed(1);
    const wrong3 = height.toFixed(1);

    const options = shuffle([
      { label: 'A', text: String(answer) },
      { label: 'B', text: String(wrong1) },
      { label: 'C', text: String(wrong2) },
      { label: 'D', text: String(wrong3) }
    ]);

    const correctLabel = options.find(o => o.text === String(answer)).label;

    return {
      problemId: `prob_trigword_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      skillId: 'trig-word-problems',
      content: scenario.setup(height, angle) + ' ' + scenario.question,
      answer: String(answer),
      correctOption: correctLabel,
      answerType: 'multiple-choice',
      options: options,
      irtParameters: {
        difficulty: difficulty + 0.7,
        discrimination: 1.6,
        calibrationConfidence: 'expert',
        attemptsCount: 0
      },
      dokLevel: 3,
      metadata: {
        estimatedTime: 70,
        source: 'template',
        tags: ['trigonometry', 'word-problems']
      },
      isActive: true
    };
  }
}

// ============================================================================
// TIER 3 (9-12) PROOF & LOGIC GENERATORS
// ============================================================================

function generateConditionalStatements(difficulty) {
  const statements = [
    {
      if: 'a number is divisible by 10',
      then: 'it is divisible by 5',
      converse: 'If a number is divisible by 5, then it is divisible by 10',
      inverse: 'If a number is not divisible by 10, then it is not divisible by 5',
      contrapositive: 'If a number is not divisible by 5, then it is not divisible by 10'
    },
    {
      if: 'an angle is a right angle',
      then: 'it measures 90°',
      converse: 'If an angle measures 90°, then it is a right angle',
      inverse: 'If an angle is not a right angle, then it does not measure 90°',
      contrapositive: 'If an angle does not measure 90°, then it is not a right angle'
    }
  ];

  const selected = randomChoice(statements);
  const questionTypes = ['converse', 'inverse', 'contrapositive'];
  const questionType = randomChoice(questionTypes);

  const answer = selected[questionType];
  const originalStatement = `If ${selected.if}, then ${selected.then}`;

  const allOptions = [selected.converse, selected.inverse, selected.contrapositive, originalStatement];
  const options = shuffle([
    { label: 'A', text: allOptions[0] },
    { label: 'B', text: allOptions[1] },
    { label: 'C', text: allOptions[2] },
    { label: 'D', text: allOptions[3] }
  ]);

  const correctLabel = options.find(o => o.text === answer).label;

  return {
    problemId: `prob_cond_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'conditional-statements',
    content: `What is the ${questionType} of: "${originalStatement}"?`,
    answer: answer,
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.5,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 60,
      source: 'template',
      tags: ['logic', 'conditional-statements', 'proofs']
    },
    isActive: true
  };
}

function generateLogicalReasoning(difficulty) {
  const reasoningProblems = [
    {
      premises: 'All squares are rectangles. ABCD is a square.',
      conclusion: 'ABCD is a rectangle',
      wrongConclusions: ['ABCD is not a rectangle', 'All rectangles are squares', 'ABCD is a circle']
    },
    {
      premises: 'If two angles are vertical angles, they are equal. Angles 1 and 2 are vertical angles.',
      conclusion: 'Angles 1 and 2 are equal',
      wrongConclusions: ['Angles 1 and 2 are not equal', 'All angles are vertical angles', 'Vertical angles are not equal']
    }
  ];

  const selected = randomChoice(reasoningProblems);
  const answer = selected.conclusion;

  const options = shuffle([
    { label: 'A', text: selected.conclusion },
    { label: 'B', text: selected.wrongConclusions[0] },
    { label: 'C', text: selected.wrongConclusions[1] },
    { label: 'D', text: selected.wrongConclusions[2] }
  ]);

  const correctLabel = options.find(o => o.text === answer).label;

  return {
    problemId: `prob_logic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'logical-reasoning',
    content: `Given: ${selected.premises} What can you conclude?`,
    answer: answer,
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.5,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 55,
      source: 'template',
      tags: ['logic', 'deductive-reasoning', 'proofs']
    },
    isActive: true
  };
}

function generateGeometricProofs(difficulty) {
  const proofProblems = [
    {
      given: 'Triangle ABC with AB = BC',
      prove: 'Triangle ABC is isosceles',
      reason: 'A triangle with two equal sides is isosceles',
      wrongReasons: [
        'A triangle with all equal sides is isosceles',
        'All triangles are isosceles',
        'Triangles cannot be isosceles'
      ]
    },
    {
      given: 'Angles 1 and 2 are supplementary, angle 1 = 90°',
      prove: 'Angle 2 = 90°',
      reason: 'Supplementary angles sum to 180°, so 180° - 90° = 90°',
      wrongReasons: [
        'Supplementary angles are always equal',
        'All angles equal 90°',
        'Supplementary angles sum to 90°'
      ]
    }
  ];

  const selected = randomChoice(proofProblems);
  const answer = selected.reason;

  const options = shuffle([
    { label: 'A', text: selected.reason },
    { label: 'B', text: selected.wrongReasons[0] },
    { label: 'C', text: selected.wrongReasons[1] },
    { label: 'D', text: selected.wrongReasons[2] }
  ]);

  const correctLabel = options.find(o => o.text === answer).label;

  return {
    problemId: `prob_proof_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'geometric-proofs',
    content: `Given: ${selected.given}. Prove: ${selected.prove}. Which reason completes the proof?`,
    answer: answer,
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.6,
      discrimination: 1.6,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 70,
      source: 'template',
      tags: ['geometry', 'proofs', 'reasoning']
    },
    isActive: true
  };
}

// ============================================================================
// TIER 2 (6-8) ADDITIONAL GENERATORS - Inequalities & Absolute Value
// ============================================================================

function generateOneStepInequality(difficulty) {
  const operations = ['+', '-', '×', '÷'];
  const op = randomChoice(operations);
  const inequalities = ['<', '>', '≤', '≥'];
  const ineq = randomChoice(inequalities);

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
    a = x * b;
  }

  const answer = `x ${ineq} ${x}`;
  const wrong1 = `x ${ineq} ${x + randomInt(1, 5)}`;
  const wrong2 = `x ${ineq} ${x - randomInt(1, 5)}`;
  const wrongIneq = ineq === '<' ? '>' : ineq === '>' ? '<' : ineq === '≤' ? '≥' : '≤';
  const wrong3 = `x ${wrongIneq} ${x}`;

  const options = shuffle([
    { label: 'A', text: answer },
    { label: 'B', text: wrong1 },
    { label: 'C', text: wrong2 },
    { label: 'D', text: wrong3 }
  ]);

  const correctLabel = options.find(o => o.text === answer).label;

  const equation = op === '+' ? `x + ${b} ${ineq} ${a}` :
                   op === '-' ? `x - ${b} ${ineq} ${a}` :
                   op === '×' ? `${b}x ${ineq} ${a}` :
                   `x ÷ ${b} ${ineq} ${x}`;

  return {
    problemId: `prob_1stepineq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'one-step-inequalities',
    content: `Solve for x: ${equation}`,
    answer: answer,
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
      estimatedTime: 45,
      source: 'template',
      tags: ['inequalities', 'algebra']
    },
    isActive: true
  };
}

function generateTwoStepInequality(difficulty) {
  const a = randomInt(2, 8);
  const b = randomInt(1, 20);
  const x = randomInt(1, 15);
  const c = a * x + b;
  const inequalities = ['<', '>', '≤', '≥'];
  const ineq = randomChoice(inequalities);

  const answer = `x ${ineq} ${x}`;
  const wrong1 = `x ${ineq} ${x + randomInt(1, 5)}`;
  const wrong2 = `x ${ineq} ${Math.floor((c - b) / 2)}`;
  const wrongIneq = ineq === '<' ? '>' : ineq === '>' ? '<' : ineq === '≤' ? '≥' : '≤';
  const wrong3 = `x ${wrongIneq} ${x}`;

  const options = shuffle([
    { label: 'A', text: answer },
    { label: 'B', text: wrong1 },
    { label: 'C', text: wrong2 },
    { label: 'D', text: wrong3 }
  ]);

  const correctLabel = options.find(o => o.text === answer).label;

  return {
    problemId: `prob_2stepineq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'two-step-inequalities',
    content: `Solve for x: ${a}x + ${b} ${ineq} ${c}`,
    answer: answer,
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['inequalities', 'algebra']
    },
    isActive: true
  };
}

function generateAbsoluteValue(difficulty) {
  const c = randomInt(1, 20);
  const x1 = c;
  const x2 = -c;

  const answer = `x = ${x1} or x = ${x2}`;
  const wrong1 = `x = ${x1}`;
  const wrong2 = `x = ${x2}`;
  const wrong3 = `x = ${randomInt(1, 20)}`;

  const options = shuffle([
    { label: 'A', text: answer },
    { label: 'B', text: wrong1 },
    { label: 'C', text: wrong2 },
    { label: 'D', text: wrong3 }
  ]);

  const correctLabel = options.find(o => o.text === answer).label;

  return {
    problemId: `prob_absval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'absolute-value',
    content: `Solve for x: |x| = ${c}`,
    answer: answer,
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['absolute-value', 'algebra']
    },
    isActive: true
  };
}

// ============================================================================
// WORD PROBLEM GENERATORS (Elementary K-5)
// ============================================================================

function generateAdditionWordProblems(difficulty) {
  const scenarios = [
    { template: 'Sarah has {a} apples. She gets {b} more. How many does she have now?', operation: '+' },
    { template: 'There are {a} birds in a tree. {b} more birds land. How many birds are there?', operation: '+' },
    { template: 'Tom scores {a} points. Then he scores {b} more points. What is his total?', operation: '+' }
  ];

  const scenario = randomChoice(scenarios);
  const a = randomInt(5, 30);
  const b = randomInt(5, 25);
  const answer = a + b;

  const content = scenario.template.replace('{a}', a).replace('{b}', b);

  const wrong1 = Math.abs(a - b);
  const wrong2 = answer + randomInt(1, 5);
  const wrong3 = answer - randomInt(1, 5);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_addword_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'addition-subtraction-word-problems',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.5,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['word-problems', 'addition', 'application']
    },
    isActive: true
  };
}

// ============================================================================
// MISSING NUMBER / ALGEBRAIC THINKING GENERATORS
// ============================================================================

function generateMissingAddend(difficulty) {
  const sum = randomInt(10, 50);
  const known = randomInt(3, sum - 2);
  const answer = sum - known;

  const wrong1 = sum + known;
  const wrong2 = answer + randomInt(1, 5);
  const wrong3 = answer - randomInt(1, 5);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_missadd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'missing-addend',
    content: `${known} + ? = ${sum}`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.8,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['algebraic-thinking', 'missing-number', 'addition']
    },
    isActive: true
  };
}

function generateBalanceScales(difficulty) {
  const x = randomInt(3, 15);
  const a = randomInt(2, 10);
  const total = x + a;

  const answer = x;
  const wrong1 = total;
  const wrong2 = a;
  const wrong3 = total - a + randomInt(1, 3);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_balance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'balance-scales',
    content: `A balance scale shows ${a} blocks on one side and ${total} blocks total. How many blocks are on the other side?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.7,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['algebraic-thinking', 'equality', 'visual-models']
    },
    isActive: true
  };
}

// ============================================================================
// ADVANCED EQUATION GENERATORS (Middle/High School)
// ============================================================================

function generateMultiStepEquations(difficulty) {
  const a = randomInt(2, 8);
  const b = randomInt(1, 15);
  const c = randomInt(1, 10);
  const x = randomInt(2, 12);
  const result = a * x + b - c;

  const answer = x;
  const wrong1 = Math.round((result - b + c) / a);
  const wrong2 = Math.round((result - b) / a);
  const wrong3 = Math.round(result / a - b + c);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_multistep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'multi-step-equations',
    content: `Solve for x: ${a}x + ${b} - ${c} = ${result}`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.5,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 60,
      source: 'template',
      tags: ['equations', 'multi-step', 'algebra']
    },
    isActive: true
  };
}

function generateDistributiveProperty(difficulty) {
  const a = randomInt(2, 6);
  const b = randomInt(1, 10);
  const c = randomInt(1, 8);
  const x = randomInt(2, 10);
  const result = a * (x + b) + c;

  const answer = x;
  const wrong1 = Math.round((result - c) / a - b);
  const wrong2 = Math.round((result - a * b) / a - c);
  const wrong3 = Math.round(result / a - b - c);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_dist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'equations-with-distribution',
    content: `Solve for x: ${a}(x + ${b}) + ${c} = ${result}`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.7,
      discrimination: 1.5,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 70,
      source: 'template',
      tags: ['equations', 'distributive-property', 'algebra']
    },
    isActive: true
  };
}

function generateVariablesBothSides(difficulty) {
  const a = randomInt(3, 8);
  const b = randomInt(1, a - 1);
  const c = randomInt(5, 20);
  const d = randomInt(1, c - 1);

  // (a-b)x = d - c, so x = (d-c)/(a-b)
  const x = Math.round((d - c) / (a - b));
  const leftSide = a * x + c;

  const answer = x;
  const wrong1 = -x;
  const wrong2 = Math.round((c - d) / (a - b));
  const wrong3 = Math.round(leftSide / a);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_bothsides_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'equations-with-variables-both-sides',
    content: `Solve for x: ${a}x + ${c} = ${b}x + ${d}`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.6,
      discrimination: 1.5,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 65,
      source: 'template',
      tags: ['equations', 'variables-both-sides', 'algebra']
    },
    isActive: true
  };
}

// ============================================================================
// SYSTEMS OF EQUATIONS GENERATORS (High School)
// ============================================================================

function generateSystemsSubstitution(difficulty) {
  const x = randomInt(2, 8);
  const y = randomInt(2, 8);
  const a = randomInt(2, 5);
  const b = randomInt(2, 5);

  // y = ax + b format
  const eq1b = a * x + b;
  const c = randomInt(2, 4);
  const d = randomInt(2, 4);
  const eq2result = c * x + d * y;

  const answer = `x = ${x}, y = ${eq1b}`;
  const wrong1 = `x = ${eq1b}, y = ${x}`;
  const wrong2 = `x = ${x + 1}, y = ${eq1b}`;
  const wrong3 = `x = ${x}, y = ${eq1b + 1}`;

  const options = shuffle([
    { label: 'A', text: answer },
    { label: 'B', text: wrong1 },
    { label: 'C', text: wrong2 },
    { label: 'D', text: wrong3 }
  ]);

  const correctLabel = options.find(o => o.text === answer).label;

  return {
    problemId: `prob_syssub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'systems-substitution',
    content: `Solve using substitution: y = ${a}x + ${b}; ${c}x + ${d}y = ${eq2result}`,
    answer: answer,
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 1.0,
      discrimination: 1.6,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 90,
      source: 'template',
      tags: ['systems', 'substitution', 'algebra']
    },
    isActive: true
  };
}

function generateSystemsElimination(difficulty) {
  const x = randomInt(2, 8);
  const y = randomInt(2, 8);
  const a = randomInt(2, 5);
  const b = randomInt(2, 5);
  const c = randomInt(2, 5);
  const d = -b; // Set up for easy elimination

  const eq1 = a * x + b * y;
  const eq2 = c * x + d * y;

  const answer = `x = ${x}, y = ${y}`;
  const wrong1 = `x = ${y}, y = ${x}`;
  const wrong2 = `x = ${x + 1}, y = ${y}`;
  const wrong3 = `x = ${x}, y = ${y - 1}`;

  const options = shuffle([
    { label: 'A', text: answer },
    { label: 'B', text: wrong1 },
    { label: 'C', text: wrong2 },
    { label: 'D', text: wrong3 }
  ]);

  const correctLabel = options.find(o => o.text === answer).label;

  return {
    problemId: `prob_syselim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'systems-elimination',
    content: `Solve using elimination: ${a}x + ${b}y = ${eq1}; ${c}x - ${Math.abs(d)}y = ${eq2}`,
    answer: answer,
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 1.1,
      discrimination: 1.6,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 90,
      source: 'template',
      tags: ['systems', 'elimination', 'algebra']
    },
    isActive: true
  };
}

// ============================================================================
// COORDINATE PLANE GENERATOR
// ============================================================================

function generateCoordinatePlane(difficulty) {
  const x = randomInt(-8, 8);
  const y = randomInt(-8, 8);

  const answer = `(${x}, ${y})`;
  const wrong1 = `(${y}, ${x})`;
  const wrong2 = `(${-x}, ${y})`;
  const wrong3 = `(${x}, ${-y})`;

  const options = shuffle([
    { label: 'A', text: answer },
    { label: 'B', text: wrong1 },
    { label: 'C', text: wrong2 },
    { label: 'D', text: wrong3 }
  ]);

  const correctLabel = options.find(o => o.text === answer).label;

  const quadrant = x > 0 && y > 0 ? 'I' : x < 0 && y > 0 ? 'II' : x < 0 && y < 0 ? 'III' : 'IV';

  return {
    problemId: `prob_coord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'coordinate-plane',
    content: `A point is in quadrant ${quadrant}, ${Math.abs(x)} units ${x > 0 ? 'right' : 'left'} and ${Math.abs(y)} units ${y > 0 ? 'up' : 'down'} from origin. What are its coordinates?`,
    answer: answer,
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
      estimatedTime: 40,
      source: 'template',
      tags: ['coordinate-plane', 'graphing']
    },
    isActive: true
  };
}

// ============================================================================
// ONE-STEP OPERATION GENERATORS (Elementary algebra readiness)
// ============================================================================

function generateOneStepAddition(difficulty) {
  const x = randomInt(1, 20);
  const b = randomInt(1, 30);
  const answer = x + b;

  const wrong1 = answer + randomInt(1, 5);
  const wrong2 = answer - randomInt(1, 5);
  const wrong3 = x - b;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_1add_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'one-step-addition',
    content: `${x} + ${b} = ?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.0,
      discrimination: 1.0,
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

function generateOneStepSubtraction(difficulty) {
  const x = randomInt(10, 50);
  const b = randomInt(1, x - 1);
  const answer = x - b;

  const wrong1 = x + b;
  const wrong2 = answer + randomInt(1, 5);
  const wrong3 = answer - randomInt(1, 5);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_1sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'one-step-subtraction',
    content: `${x} - ${b} = ?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.9,
      discrimination: 1.0,
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

function generateOneStepMultiplication(difficulty) {
  const x = randomInt(2, 12);
  const b = randomInt(2, 12);
  const answer = x * b;

  const wrong1 = x + b;
  const wrong2 = answer + x;
  const wrong3 = answer - b;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_1mul_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'one-step-multiplication',
    content: `${x} × ${b} = ?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.7,
      discrimination: 1.0,
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

function generateOneStepDivision(difficulty) {
  const b = randomInt(2, 12);
  const x = randomInt(2, 10);
  const dividend = x * b;
  const answer = x;

  const wrong1 = b;
  const wrong2 = answer + randomInt(1, 3);
  const wrong3 = dividend;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_1div_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'one-step-division',
    content: `${dividend} ÷ ${b} = ?`,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.6,
      discrimination: 1.0,
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

// ============================================================================
// FRACTION OPERATIONS
// ============================================================================

function generateAddFractions(difficulty) {
  const denom = randomChoice([2, 3, 4, 5, 6, 8, 10, 12]);
  const num1 = randomInt(1, denom - 1);
  const num2 = randomInt(1, denom - num1);
  const answer = num1 + num2;

  const wrong1 = num1 * num2; // Common error: multiply numerators
  const wrong2 = answer + 1;
  const wrong3 = Math.abs(num1 - num2);

  const options = shuffle([
    { label: 'A', text: String(`${answer}/${denom}`) },
    { label: 'B', text: String(`${wrong1}/${denom}`) },
    { label: 'C', text: String(`${wrong2}/${denom}`) },
    { label: 'D', text: String(`${wrong3}/${denom}`) }
  ]);

  const correctLabel = options.find(o => o.text === String(`${answer}/${denom}`)).label;

  return {
    problemId: `prob_addfrac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'add-fractions',
    content: `${num1}/${denom} + ${num2}/${denom} = ?`,
    answer: String(`${answer}/${denom}`),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.3,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['fractions', 'addition', 'same-denominator']
    },
    isActive: true
  };
}

function generateSubtractFractions(difficulty) {
  const denom = randomChoice([2, 3, 4, 5, 6, 8, 10, 12]);
  const num1 = randomInt(3, denom);
  const num2 = randomInt(1, num1 - 1);
  const answer = num1 - num2;

  const wrong1 = num1 + num2; // Common error: add instead
  const wrong2 = answer + 1;
  const wrong3 = num2 - num1 < 0 ? num1 - num2 + 1 : num2 - num1;

  const options = shuffle([
    { label: 'A', text: String(`${answer}/${denom}`) },
    { label: 'B', text: String(`${wrong1}/${denom}`) },
    { label: 'C', text: String(`${wrong2}/${denom}`) },
    { label: 'D', text: String(`${wrong3}/${denom}`) }
  ]);

  const correctLabel = options.find(o => o.text === String(`${answer}/${denom}`)).label;

  return {
    problemId: `prob_subfrac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'subtract-fractions',
    content: `${num1}/${denom} - ${num2}/${denom} = ?`,
    answer: String(`${answer}/${denom}`),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.2,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['fractions', 'subtraction', 'same-denominator']
    },
    isActive: true
  };
}

function generateMultiplyFractions(difficulty) {
  const num1 = randomInt(1, 5);
  const denom1 = randomInt(num1 + 1, 8);
  const num2 = randomInt(1, 5);
  const denom2 = randomInt(num2 + 1, 8);

  const answerNum = num1 * num2;
  const answerDenom = denom1 * denom2;

  const wrong1Num = num1 + num2; // Common error: add numerators
  const wrong1Denom = denom1 + denom2;
  const wrong2Num = num1 * num2;
  const wrong2Denom = denom1; // Forgot to multiply denominator
  const wrong3Num = num1;
  const wrong3Denom = denom1 * denom2; // Only multiplied denominator

  const options = shuffle([
    { label: 'A', text: String(`${answerNum}/${answerDenom}`) },
    { label: 'B', text: String(`${wrong1Num}/${wrong1Denom}`) },
    { label: 'C', text: String(`${wrong2Num}/${wrong2Denom}`) },
    { label: 'D', text: String(`${wrong3Num}/${wrong3Denom}`) }
  ]);

  const correctLabel = options.find(o => o.text === String(`${answerNum}/${answerDenom}`)).label;

  return {
    problemId: `prob_mulfrac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'multiply-fractions',
    content: `${num1}/${denom1} × ${num2}/${denom2} = ?`,
    answer: String(`${answerNum}/${answerDenom}`),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
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

function generateDivideFractions(difficulty) {
  const num1 = randomInt(1, 4);
  const denom1 = randomInt(num1 + 1, 6);
  const num2 = randomInt(1, 4);
  const denom2 = randomInt(num2 + 1, 6);

  // Division = multiply by reciprocal
  const answerNum = num1 * denom2;
  const answerDenom = denom1 * num2;

  const wrong1Num = num1 * num2; // Multiplied instead of dividing
  const wrong1Denom = denom1 * denom2;
  const wrong2Num = num1;
  const wrong2Denom = denom1; // Didn't do anything
  const wrong3Num = denom1 * denom2; // Flipped everything
  const wrong3Denom = num1 * num2;

  const options = shuffle([
    { label: 'A', text: String(`${answerNum}/${answerDenom}`) },
    { label: 'B', text: String(`${wrong1Num}/${wrong1Denom}`) },
    { label: 'C', text: String(`${wrong2Num}/${wrong2Denom}`) },
    { label: 'D', text: String(`${wrong3Num}/${wrong3Denom}`) }
  ]);

  const correctLabel = options.find(o => o.text === String(`${answerNum}/${answerDenom}`)).label;

  return {
    problemId: `prob_divfrac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'divide-fractions',
    content: `${num1}/${denom1} ÷ ${num2}/${denom2} = ?`,
    answer: String(`${answerNum}/${answerDenom}`),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.5,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['fractions', 'division', 'reciprocal']
    },
    isActive: true
  };
}

// ============================================================================
// COUNTING VARIATIONS
// ============================================================================

function generateCountingUp(difficulty) {
  const start = randomInt(1, 50);
  const steps = randomInt(3, 6);
  const answer = start + steps;

  const sequence = [];
  for (let i = 0; i < steps; i++) {
    sequence.push(start + i);
  }

  const content = `Count up: ${sequence.join(', ')}, ___`;

  const wrong1 = answer - 1;
  const wrong2 = answer + 1;
  const wrong3 = start + steps * 2;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_countup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'counting-up',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.2,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 25,
      source: 'template',
      tags: ['counting', 'sequences', 'patterns']
    },
    isActive: true
  };
}

function generateCountingDown(difficulty) {
  const start = randomInt(20, 70);
  const steps = randomInt(3, 6);
  const answer = start - steps;

  const sequence = [];
  for (let i = 0; i < steps; i++) {
    sequence.push(start - i);
  }

  const content = `Count down: ${sequence.join(', ')}, ___`;

  const wrong1 = answer + 1;
  const wrong2 = answer - 1;
  const wrong3 = start - steps * 2;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_countdown_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'counting-down',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.1,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 25,
      source: 'template',
      tags: ['counting', 'sequences', 'patterns']
    },
    isActive: true
  };
}

function generateCountingByGroups(difficulty) {
  const groupSize = randomChoice([2, 3, 5, 10]);
  const numGroups = randomInt(3, 6);
  const answer = groupSize * numGroups;

  const content = `How many total? ${numGroups} groups of ${groupSize}`;

  const wrong1 = groupSize + numGroups; // Added instead
  const wrong2 = answer - groupSize;
  const wrong3 = answer + groupSize;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_countgroups_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'counting-by-groups',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.9,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['counting', 'multiplication-readiness', 'groups']
    },
    isActive: true
  };
}

// ============================================================================
// MULTIPLICATION CONCEPTS
// ============================================================================

function generateMultiplicationAsGroups(difficulty) {
  const groupSize = randomInt(2, 9);
  const numGroups = randomInt(2, 8);
  const answer = groupSize * numGroups;

  const content = `${numGroups} groups of ${groupSize} = ?`;

  const wrong1 = groupSize + numGroups;
  const wrong2 = answer - 1;
  const wrong3 = answer + groupSize;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_mulgroups_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'multiplication-as-groups',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.8,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['multiplication', 'conceptual', 'groups']
    },
    isActive: true
  };
}

function generateRepeatedAddition(difficulty) {
  const addend = randomInt(2, 10);
  const times = randomInt(3, 6);
  const answer = addend * times;

  const additionString = Array(times).fill(addend).join(' + ');
  const content = `${additionString} = ?`;

  const wrong1 = addend + times;
  const wrong2 = answer - addend;
  const wrong3 = answer + addend;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_repadd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'repeated-addition',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.7,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['multiplication', 'addition', 'patterns']
    },
    isActive: true
  };
}

// ============================================================================
// ADDITIONAL ALGEBRA CONCEPTS
// ============================================================================

function generateUnknownAddend(difficulty) {
  const total = randomInt(10, 30);
  const known = randomInt(3, total - 2);
  const answer = total - known;

  const content = `${known} + ? = ${total}`;

  const wrong1 = known + total;
  const wrong2 = answer + 1;
  const wrong3 = answer - 1;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_unknadd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'unknown-addend',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.6,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['algebra', 'missing-addend', 'subtraction']
    },
    isActive: true
  };
}

function generateSolvingInequalities(difficulty) {
  const a = randomInt(2, 8);
  const b = randomInt(5, 25);
  const answer = Math.floor(b / a);

  const content = `Solve: ${a}x < ${b}`;

  const wrong1 = answer + 1;
  const wrong2 = b - a;
  const wrong3 = answer - 1;

  const options = shuffle([
    { label: 'A', text: String(`x < ${answer}`) },
    { label: 'B', text: String(`x < ${wrong1}`) },
    { label: 'C', text: String(`x < ${wrong2}`) },
    { label: 'D', text: String(`x > ${answer}`) }
  ]);

  const correctLabel = options.find(o => o.text === String(`x < ${answer}`)).label;

  return {
    problemId: `prob_solveineq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'solving-inequalities',
    content: content,
    answer: String(`x < ${answer}`),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['inequalities', 'algebra']
    },
    isActive: true
  };
}

function generateRelatedFacts(difficulty) {
  const a = randomInt(3, 12);
  const b = randomInt(2, 12);
  const sum = a + b;

  const content = `If ${a} + ${b} = ${sum}, then ${sum} - ${a} = ?`;
  const answer = b;

  const wrong1 = a;
  const wrong2 = sum;
  const wrong3 = sum - b;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_relfact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'related-facts',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.8,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['fact-families', 'inverse-operations']
    },
    isActive: true
  };
}

function generateSystemsGraphing(difficulty) {
  // Simplified version: identify intersection point
  const x = randomInt(-5, 5);
  const y = randomInt(-5, 5);

  const content = `Two lines intersect at point (${x}, ${y}). What is the solution to the system?`;
  const answer = `(${x}, ${y})`;

  const wrong1 = `(${y}, ${x})`; // Swapped coordinates
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
    problemId: `prob_sysgraph_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'systems-graphing',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['systems', 'graphing', 'coordinate-plane']
    },
    isActive: true
  };
}

// ============================================================================
// MORE ELEMENTARY CONCEPTS
// ============================================================================

function generateEqualityConcept(difficulty) {
  const a = randomInt(5, 20);
  const b = randomInt(1, 10);

  const content = `Which symbol makes this true? ${a} ___ ${a}`;
  const answer = '=';

  const options = shuffle([
    { label: 'A', text: String('=') },
    { label: 'B', text: String('>') },
    { label: 'C', text: String('<') },
    { label: 'D', text: String('≠') }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_eqconcept_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'equality-concept',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.3,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 25,
      source: 'template',
      tags: ['equality', 'comparison', 'symbols']
    },
    isActive: true
  };
}

function generateMissingNumberProblems(difficulty) {
  const a = randomInt(5, 15);
  const b = randomInt(1, 10);
  const sum = a + b;

  const content = `___ + ${b} = ${sum}`;
  const answer = a;

  const wrong1 = sum - a;
  const wrong2 = a + 1;
  const wrong3 = sum + b;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_missnum_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'missing-number-problems',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.7,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['missing-number', 'algebra-readiness']
    },
    isActive: true
  };
}

function generateBlankAsVariable(difficulty) {
  const a = randomInt(3, 12);
  const b = randomInt(2, 10);
  const answer = a + b;

  const content = `If ☐ = ${a}, what is ☐ + ${b}?`;

  const wrong1 = a - b;
  const wrong2 = answer + 1;
  const wrong3 = b;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_blankvar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'blank-as-variable',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.5,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['variables', 'substitution', 'algebra-readiness']
    },
    isActive: true
  };
}

function generateMultiplicationConcepts(difficulty) {
  const a = randomInt(2, 9);
  const b = randomInt(2, 9);
  const answer = a * b;

  const content = `${a} × ${b} means ${a} groups of ${b}. What is the total?`;

  const wrong1 = a + b;
  const wrong2 = answer - 1;
  const wrong3 = answer + a;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_mulconcept_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'multiplication-concepts',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.8,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['multiplication', 'conceptual']
    },
    isActive: true
  };
}

function generateFractionConcepts(difficulty) {
  const denom = randomChoice([2, 3, 4, 5, 8]);
  const num = randomInt(1, denom - 1);

  const content = `What fraction is shaded if ${num} out of ${denom} parts are shaded?`;
  const answer = `${num}/${denom}`;

  const wrong1 = `${denom}/${num}`;
  const wrong2 = `${num + 1}/${denom}`;
  const wrong3 = `${num}/${denom + 1}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_fracconcept_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'fraction-concepts',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.5,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['fractions', 'conceptual', 'parts-whole']
    },
    isActive: true
  };
}

function generateFractionsAsParts(difficulty) {
  const total = randomChoice([4, 6, 8, 10, 12]);
  const shaded = randomInt(1, total - 1);

  const content = `A circle is divided into ${total} equal parts. ${shaded} parts are shaded. What fraction is shaded?`;
  const answer = `${shaded}/${total}`;

  const wrong1 = `${total - shaded}/${total}`;
  const wrong2 = `${shaded}/${total - shaded}`;
  const wrong3 = `${total}/${shaded}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_fracparts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'fractions-as-parts',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.4,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['fractions', 'parts-whole', 'visual']
    },
    isActive: true
  };
}

// ============================================================================
// ADVANCED SYSTEMS AND SPECIAL CASES
// ============================================================================

function generateSystemsSpecialCases(difficulty) {
  const type = randomChoice(['no-solution', 'infinite']);

  let content, answer;
  if (type === 'no-solution') {
    content = 'Two parallel lines form a system. How many solutions exist?';
    answer = '0 (no solution)';
  } else {
    content = 'Two identical lines form a system. How many solutions exist?';
    answer = 'Infinite';
  }

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String('1 solution') },
    { label: 'C', text: String(type === 'no-solution' ? 'Infinite' : '0 (no solution)') },
    { label: 'D', text: String('2 solutions') }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_sysspecial_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'systems-special-cases',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.6,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['systems', 'special-cases', 'parallel-lines']
    },
    isActive: true
  };
}

// ============================================================================
// WORD PROBLEMS - MORE TYPES
// ============================================================================

function generateMultiplicationWordProblems(difficulty) {
  const scenarios = [
    { template: 'A book has {a} pages. Sarah reads {b} books. How many total pages?', operation: '*' },
    { template: 'Each box has {a} apples. There are {b} boxes. How many apples total?', operation: '*' },
    { template: 'A ticket costs ${a}. How much for {b} tickets?', operation: '*' }
  ];

  const scenario = randomChoice(scenarios);
  const a = randomInt(3, 12);
  const b = randomInt(2, 10);
  const answer = a * b;

  const content = scenario.template.replace('{a}', a).replace('{b}', b);

  const wrong1 = a + b;
  const wrong2 = answer - a;
  const wrong3 = answer + b;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_mulword_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'multiplication-word-problems',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.4,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['word-problems', 'multiplication', 'application']
    },
    isActive: true
  };
}

function generateDivisionWordProblems(difficulty) {
  const scenarios = [
    { template: '{a} cookies divided equally among {b} friends. How many each?', operation: '/' },
    { template: 'A rope {a} feet long is cut into {b} equal pieces. How long is each piece?', operation: '/' },
    { template: '{a} students sit in {b} equal rows. How many per row?', operation: '/' }
  ];

  const scenario = randomChoice(scenarios);
  const b = randomInt(2, 8);
  const answer = randomInt(2, 10);
  const a = b * answer;

  const content = scenario.template.replace('{a}', a).replace('{b}', b);

  const wrong1 = a - b;
  const wrong2 = answer + 1;
  const wrong3 = b;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_divword_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'division-word-problems',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.3,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['word-problems', 'division', 'application']
    },
    isActive: true
  };
}

function generateFractionWordProblems(difficulty) {
  const scenarios = [
    { template: 'Sarah ate {num}/{denom} of a pizza. What fraction is left?', operation: 'subtract' },
    { template: 'A recipe uses {num}/{denom} cup of sugar. How much is that?', operation: 'identify' }
  ];

  const scenario = randomChoice(scenarios);
  const denom = randomChoice([2, 3, 4, 5, 8]);
  const num = randomInt(1, denom - 1);

  let content, answer;
  if (scenario.operation === 'subtract') {
    content = scenario.template.replace('{num}', num).replace('{denom}', denom);
    answer = `${denom - num}/${denom}`;
  } else {
    content = scenario.template.replace('{num}', num).replace('{denom}', denom);
    answer = `${num}/${denom}`;
  }

  const wrong1 = `${num + 1}/${denom}`;
  const wrong2 = `${num}/${denom + 1}`;
  const wrong3 = `${denom}/${num}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_fracword_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'fraction-word-problems',
    content: content,
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
      estimatedTime: 40,
      source: 'template',
      tags: ['word-problems', 'fractions', 'application']
    },
    isActive: true
  };
}

// ============================================================================
// GEOMETRY - MORE CONCEPTS
// ============================================================================

function generateLineSegments(difficulty) {
  const length = randomInt(5, 20);

  const content = `A line segment AB has length ${length} cm. What is the distance from A to B?`;
  const answer = length;

  const wrong1 = length * 2;
  const wrong2 = length - 1;
  const wrong3 = length / 2;

  const options = shuffle([
    { label: 'A', text: String(`${answer} cm`) },
    { label: 'B', text: String(`${wrong1} cm`) },
    { label: 'C', text: String(`${wrong2} cm`) },
    { label: 'D', text: String(`${Math.floor(wrong3)} cm`) }
  ]);

  const correctLabel = options.find(o => o.text === String(`${answer} cm`)).label;

  return {
    problemId: `prob_lineseg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'line-segments',
    content: content,
    answer: String(`${answer} cm`),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.9,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 25,
      source: 'template',
      tags: ['geometry', 'measurement', 'distance']
    },
    isActive: true
  };
}

function generateAngles(difficulty) {
  const angle = randomChoice([30, 45, 60, 90, 120, 135, 150]);

  let type;
  if (angle < 90) type = 'acute';
  else if (angle === 90) type = 'right';
  else type = 'obtuse';

  const content = `An angle measures ${angle}°. What type of angle is this?`;
  const answer = type;

  const allTypes = ['acute', 'right', 'obtuse', 'straight'];
  const wrong = allTypes.filter(t => t !== type).slice(0, 3);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong[0]) },
    { label: 'C', text: String(wrong[1]) },
    { label: 'D', text: String(wrong[2]) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_angles_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'angles',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.6,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['geometry', 'angles', 'classification']
    },
    isActive: true
  };
}

// ============================================================================
// DATA AND STATISTICS
// ============================================================================

function generateRange(difficulty) {
  const numbers = [randomInt(10, 50), randomInt(5, 40), randomInt(15, 60), randomInt(8, 45)];
  const answer = Math.max(...numbers) - Math.min(...numbers);

  const content = `Find the range of: ${numbers.join(', ')}`;

  const wrong1 = Math.max(...numbers);
  const wrong2 = Math.min(...numbers);
  const wrong3 = answer + randomInt(1, 5);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_range_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'range',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.3,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['statistics', 'range', 'data-analysis']
    },
    isActive: true
  };
}

function generateOutliers(difficulty) {
  const normalRange = randomInt(20, 30);
  const outlier = randomInt(80, 100);
  const numbers = [normalRange, normalRange + 2, normalRange + 5, outlier, normalRange + 3];

  const content = `Which number is an outlier? ${numbers.join(', ')}`;
  const answer = outlier;

  const wrong1 = normalRange;
  const wrong2 = normalRange + 5;
  const wrong3 = normalRange + 3;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_outlier_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'outliers',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['statistics', 'outliers', 'data-analysis']
    },
    isActive: true
  };
}

// ============================================================================
// DECIMALS AND PERCENTS
// ============================================================================

function generateDecimalAddition(difficulty) {
  const a = (randomInt(10, 99) / 10).toFixed(1);
  const b = (randomInt(10, 99) / 10).toFixed(1);
  const answer = (parseFloat(a) + parseFloat(b)).toFixed(1);

  const content = `${a} + ${b} = ?`;

  const wrong1 = (parseFloat(answer) + 0.1).toFixed(1);
  const wrong2 = (parseFloat(answer) - 0.1).toFixed(1);
  const wrong3 = (parseInt(a) + parseInt(b)).toFixed(1);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_decadd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'decimal-addition',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.2,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['decimals', 'addition']
    },
    isActive: true
  };
}

function generateDecimalSubtraction(difficulty) {
  const a = (randomInt(30, 99) / 10).toFixed(1);
  const b = (randomInt(10, 50) / 10).toFixed(1);
  const answer = (parseFloat(a) - parseFloat(b)).toFixed(1);

  const content = `${a} - ${b} = ?`;

  const wrong1 = (parseFloat(answer) + 0.1).toFixed(1);
  const wrong2 = (parseFloat(a) + parseFloat(b)).toFixed(1);
  const wrong3 = (parseFloat(answer) - 0.1).toFixed(1);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_decsub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'decimal-subtraction',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.1,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['decimals', 'subtraction']
    },
    isActive: true
  };
}

function generatePercentToDecimal(difficulty) {
  const percent = randomChoice([25, 50, 75, 10, 20, 30, 40, 60, 80, 90]);
  const answer = (percent / 100).toFixed(2);

  const content = `Convert ${percent}% to a decimal`;

  const wrong1 = String(percent);
  const wrong2 = (percent / 10).toFixed(1);
  const wrong3 = String(percent / 1000);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_pctdec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'percent-to-decimal',
    content: content,
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
      tags: ['percent', 'decimals', 'conversion']
    },
    isActive: true
  };
}

function generateDecimalToPercent(difficulty) {
  const decimal = randomChoice([0.25, 0.5, 0.75, 0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 0.9]);
  const answer = (decimal * 100).toFixed(0);

  const content = `Convert ${decimal} to a percent`;

  const wrong1 = decimal.toFixed(2);
  const wrong2 = (decimal * 10).toFixed(1);
  const wrong3 = (parseFloat(answer) / 10).toFixed(1);

  const options = shuffle([
    { label: 'A', text: String(`${answer}%`) },
    { label: 'B', text: String(`${wrong1}%`) },
    { label: 'C', text: String(`${wrong2}%`) },
    { label: 'D', text: String(`${wrong3}%`) }
  ]);

  const correctLabel = options.find(o => o.text === String(`${answer}%`)).label;

  return {
    problemId: `prob_decpct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'decimal-to-percent',
    content: content,
    answer: String(`${answer}%`),
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
      tags: ['percent', 'decimals', 'conversion']
    },
    isActive: true
  };
}

// ============================================================================
// ALGEBRA 2 AND POLYNOMIALS
// ============================================================================

function generateFactoringQuadratics(difficulty) {
  const a = randomInt(1, 5);
  const b = randomInt(1, 5);
  const sum = a + b;
  const product = a * b;

  const content = `Factor: x² + ${sum}x + ${product}`;
  const answer = `(x + ${a})(x + ${b})`;

  const wrong1 = `(x + ${sum})(x + ${product})`;
  const wrong2 = `(x + ${a + 1})(x + ${b - 1})`;
  const wrong3 = `x(x + ${sum})`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_factor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'factoring-quadratics',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.7,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['algebra', 'factoring', 'quadratics']
    },
    isActive: true
  };
}

function generatePolynomialAddition(difficulty) {
  const a1 = randomInt(2, 8);
  const b1 = randomInt(2, 8);
  const a2 = randomInt(2, 8);
  const b2 = randomInt(2, 8);

  const sumA = a1 + a2;
  const sumB = b1 + b2;

  const content = `Simplify: (${a1}x + ${b1}) + (${a2}x + ${b2})`;
  const answer = `${sumA}x + ${sumB}`;

  const wrong1 = `${a1 * a2}x + ${b1 * b2}`;
  const wrong2 = `${sumA}x`;
  const wrong3 = `${sumA}x² + ${sumB}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_polyadd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'polynomial-addition',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['algebra', 'polynomials', 'addition']
    },
    isActive: true
  };
}

function generatePolynomialSubtraction(difficulty) {
  const a1 = randomInt(5, 12);
  const b1 = randomInt(5, 12);
  const a2 = randomInt(2, 8);
  const b2 = randomInt(2, 8);

  const diffA = a1 - a2;
  const diffB = b1 - b2;

  const content = `Simplify: (${a1}x + ${b1}) - (${a2}x + ${b2})`;
  const answer = `${diffA}x + ${diffB}`;

  const wrong1 = `${a1 + a2}x + ${b1 + b2}`;
  const wrong2 = `${diffA}x - ${diffB}`;
  const wrong3 = `${diffA}x`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_polysub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'polynomial-subtraction',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['algebra', 'polynomials', 'subtraction']
    },
    isActive: true
  };
}

// ============================================================================
// NEGATIVE NUMBERS
// ============================================================================

function generateNegativeNumberAddition(difficulty) {
  const a = randomInt(-20, -1);
  const b = randomInt(-20, -1);
  const answer = a + b;

  const content = `${a} + (${b}) = ?`;

  const wrong1 = Math.abs(a) + Math.abs(b);
  const wrong2 = a - b;
  const wrong3 = answer + 1;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_negadd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'negative-number-addition',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.1,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['integers', 'negative-numbers', 'addition']
    },
    isActive: true
  };
}

function generateNegativeNumberSubtraction(difficulty) {
  const a = randomInt(5, 20);
  const b = randomInt(-20, -5);
  const answer = a - b;

  const content = `${a} - (${b}) = ?`;

  const wrong1 = a + b;
  const wrong2 = Math.abs(a - Math.abs(b));
  const wrong3 = answer - 2;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_negsub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'negative-number-subtraction',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['integers', 'negative-numbers', 'subtraction']
    },
    isActive: true
  };
}

function generateGCF(difficulty) {
  const a = randomInt(2, 6) * randomInt(2, 8);
  const b = randomInt(2, 6) * randomInt(2, 8);

  // Find GCF
  let gcf = 1;
  for (let i = Math.min(a, b); i > 0; i--) {
    if (a % i === 0 && b % i === 0) {
      gcf = i;
      break;
    }
  }

  const content = `Find the greatest common factor (GCF) of ${a} and ${b}`;
  const answer = gcf;

  const wrong1 = a * b;
  const wrong2 = gcf * 2;
  const wrong3 = Math.min(a, b);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_gcf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'gcf',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.1,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['number-theory', 'gcf', 'factors']
    },
    isActive: true
  };
}

function generateLCM(difficulty) {
  const a = randomInt(2, 12);
  const b = randomInt(2, 12);

  // Find LCM
  const max = a * b;
  let lcm = max;
  for (let i = Math.max(a, b); i <= max; i++) {
    if (i % a === 0 && i % b === 0) {
      lcm = i;
      break;
    }
  }

  const content = `Find the least common multiple (LCM) of ${a} and ${b}`;
  const answer = lcm;

  const wrong1 = a * b;
  const wrong2 = a + b;
  const wrong3 = Math.max(a, b);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_lcm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'lcm',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['number-theory', 'lcm', 'multiples']
    },
    isActive: true
  };
}

function generatePrimeFactorization(difficulty) {
  const primes = [2, 3, 5, 7];
  const num = primes[randomInt(0, primes.length - 1)] * primes[randomInt(0, primes.length - 1)];

  // Find prime factors
  const factors = [];
  let n = num;
  for (let i = 2; i <= n; i++) {
    while (n % i === 0) {
      factors.push(i);
      n /= i;
    }
  }

  const content = `What is the prime factorization of ${num}?`;
  const answer = factors.join(' × ');

  const wrong1 = factors.slice().reverse().join(' × ');
  const wrong2 = `${factors[0]} × ${num / factors[0]}`;
  const wrong3 = `${Math.sqrt(num)} × ${Math.sqrt(num)}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_primefact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'prime-factorization',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['number-theory', 'prime-factorization', 'factors']
    },
    isActive: true
  };
}

function generateSquareRoots(difficulty) {
  const perfectSquares = [4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144];
  const num = perfectSquares[randomInt(0, perfectSquares.length - 1)];
  const answer = Math.sqrt(num);

  const content = `What is √${num}?`;

  const wrong1 = answer + 1;
  const wrong2 = answer - 1;
  const wrong3 = num / 2;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_sqrt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'square-roots',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.1,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['radicals', 'square-roots']
    },
    isActive: true
  };
}

function generateSimplifyingRadicals(difficulty) {
  const bases = [2, 3, 5];
  const base = bases[randomInt(0, bases.length - 1)];
  const outside = randomInt(2, 5);
  const num = base * (outside * outside);

  const content = `Simplify √${num}`;
  const answer = `${outside}√${base}`;

  const wrong1 = `${outside}√${num}`;
  const wrong2 = `${base}√${outside}`;
  const wrong3 = `√${num}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_simprad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'simplifying-radicals',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['radicals', 'simplification', 'algebra']
    },
    isActive: true
  };
}

function generateBasicProbability(difficulty) {
  const total = randomInt(8, 20);
  const favorable = randomInt(2, total - 1);

  const content = `A bag contains ${total} marbles. ${favorable} are red. What is the probability of drawing a red marble?`;
  const answer = `${favorable}/${total}`;

  const wrong1 = `${total - favorable}/${total}`;
  const wrong2 = `${favorable}/${total - favorable}`;
  const wrong3 = `1/${total}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_prob_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'basic-probability',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.1,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['probability', 'fractions', 'statistics']
    },
    isActive: true
  };
}

function generateScientificNotation(difficulty) {
  const coefficient = (randomInt(10, 99) / 10).toFixed(1);
  const exponent = randomInt(2, 6);
  const value = parseFloat(coefficient) * Math.pow(10, exponent);

  const content = `Express ${value} in scientific notation`;
  const answer = `${coefficient} × 10^${exponent}`;

  const wrong1 = `${coefficient} × 10^${exponent - 1}`;
  const wrong2 = `${coefficient} × 10^${exponent + 1}`;
  const wrong3 = `${parseFloat(coefficient) * 10} × 10^${exponent - 1}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_scino_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'scientific-notation',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['scientific-notation', 'exponents', 'place-value']
    },
    isActive: true
  };
}

function generateParallelLines(difficulty) {
  const slope = randomInt(2, 5);
  const b1 = randomInt(-5, 5);
  const b2 = randomInt(-5, 5);

  const content = `Are the lines y = ${slope}x + ${b1} and y = ${slope}x + ${b2} parallel?`;
  const answer = 'Yes';

  const wrong1 = 'No';
  const wrong2 = 'Sometimes';
  const wrong3 = 'Cannot determine';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_para_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'parallel-lines',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['geometry', 'lines', 'slopes', 'algebra']
    },
    isActive: true
  };
}

function generatePerpendicularLines(difficulty) {
  const slope1 = randomInt(2, 5);
  const slope2 = -1 / slope1;
  const b1 = randomInt(-5, 5);
  const b2 = randomInt(-5, 5);

  const content = `Are the lines y = ${slope1}x + ${b1} and y = ${slope2.toFixed(2)}x + ${b2} perpendicular?`;
  const answer = 'Yes';

  const wrong1 = 'No';
  const wrong2 = 'Parallel';
  const wrong3 = 'Cannot determine';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_perp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'perpendicular-lines',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['geometry', 'lines', 'slopes', 'algebra']
    },
    isActive: true
  };
}

function generateRatioWordProblems(difficulty) {
  const a = randomInt(2, 8);
  const b = randomInt(2, 8);
  const multiplier = randomInt(3, 7);

  const content = `A recipe uses ${a} cups of flour for every ${b} cups of sugar. If you use ${a * multiplier} cups of flour, how many cups of sugar do you need?`;
  const answer = b * multiplier;

  const wrong1 = a * multiplier;
  const wrong2 = (a + b) * multiplier;
  const wrong3 = b * multiplier + a;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_ratiowp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'ratio-word-problems',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['ratios', 'word-problems', 'proportions']
    },
    isActive: true
  };
}

function generateProportionWordProblems(difficulty) {
  const a = randomInt(2, 6);
  const b = randomInt(3, 9);
  const c = randomInt(2, 6);
  const d = (b * c) / a;

  const content = `If ${a} pencils cost $${b}, how much do ${c} pencils cost?`;
  const answer = d.toFixed(2);

  const wrong1 = (b + c).toFixed(2);
  const wrong2 = (b * c).toFixed(2);
  const wrong3 = (c / a).toFixed(2);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_propwp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'proportion-word-problems',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 55,
      source: 'template',
      tags: ['proportions', 'word-problems', 'ratios']
    },
    isActive: true
  };
}

function generatePercentIncrease(difficulty) {
  const original = randomInt(20, 100);
  const percent = randomInt(10, 50);
  const increase = (original * percent) / 100;
  const answer = original + increase;

  const content = `A shirt costs $${original}. If the price increases by ${percent}%, what is the new price?`;

  const wrong1 = original + percent;
  const wrong2 = increase;
  const wrong3 = original - increase;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_pctinc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'percent-increase',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['percents', 'word-problems', 'increase']
    },
    isActive: true
  };
}

function generatePercentDecrease(difficulty) {
  const original = randomInt(50, 200);
  const percent = randomInt(10, 40);
  const decrease = (original * percent) / 100;
  const answer = original - decrease;

  const content = `A jacket costs $${original}. During a sale, it's ${percent}% off. What is the sale price?`;

  const wrong1 = original + decrease;
  const wrong2 = decrease;
  const wrong3 = original - percent;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_pctdec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'percent-decrease',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['percents', 'word-problems', 'decrease']
    },
    isActive: true
  };
}

function generateImproperFractions(difficulty) {
  const whole = randomInt(2, 5);
  const numerator = randomInt(1, 4);
  const denominator = randomInt(2, 6);
  const improper = (whole * denominator + numerator);

  const content = `Convert ${whole} ${numerator}/${denominator} to an improper fraction`;
  const answer = `${improper}/${denominator}`;

  const wrong1 = `${numerator}/${whole * denominator}`;
  const wrong2 = `${whole + numerator}/${denominator}`;
  const wrong3 = `${improper}/${denominator * 2}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_impfrac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'improper-fractions',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.1,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['fractions', 'conversion', 'improper-fractions']
    },
    isActive: true
  };
}

function generateUnitConversion(difficulty) {
  const conversions = [
    { from: 'feet', to: 'inches', factor: 12 },
    { from: 'yards', to: 'feet', factor: 3 },
    { from: 'meters', to: 'centimeters', factor: 100 },
    { from: 'kilometers', to: 'meters', factor: 1000 },
    { from: 'hours', to: 'minutes', factor: 60 }
  ];

  const conv = conversions[randomInt(0, conversions.length - 1)];
  const value = randomInt(2, 10);
  const answer = value * conv.factor;

  const content = `Convert ${value} ${conv.from} to ${conv.to}`;

  const wrong1 = value / conv.factor;
  const wrong2 = value + conv.factor;
  const wrong3 = answer / 2;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_unitconv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'unit-conversion',
    content: content,
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
      estimatedTime: 35,
      source: 'template',
      tags: ['measurement', 'conversion', 'units']
    },
    isActive: true
  };
}

function generateEstimation(difficulty) {
  const a = randomInt(18, 52);
  const b = randomInt(18, 52);
  const sum = a + b;
  const roundedA = Math.round(a / 10) * 10;
  const roundedB = Math.round(b / 10) * 10;
  const answer = roundedA + roundedB;

  const content = `Estimate ${a} + ${b} by rounding to the nearest 10`;

  const wrong1 = sum;
  const wrong2 = roundedA + b;
  const wrong3 = a + roundedB;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_est_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'estimation',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.2,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['estimation', 'rounding', 'mental-math']
    },
    isActive: true
  };
}

function generateComparingDecimals(difficulty) {
  const a = (randomInt(10, 99) / 10).toFixed(1);
  const b = (randomInt(10, 99) / 10).toFixed(1);

  const content = `Which is greater: ${a} or ${b}?`;
  const answer = parseFloat(a) > parseFloat(b) ? a : b;

  const wrong1 = parseFloat(a) < parseFloat(b) ? a : b;
  const wrong2 = 'They are equal';
  const wrong3 = (parseFloat(a) + parseFloat(b)).toFixed(1);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_compdec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'comparing-decimals',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.1,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 25,
      source: 'template',
      tags: ['decimals', 'comparison', 'number-sense']
    },
    isActive: true
  };
}

function generateDistanceRateTime(difficulty) {
  const rate = randomInt(30, 70);
  const time = randomInt(2, 5);
  const distance = rate * time;

  const content = `A car travels at ${rate} mph for ${time} hours. How far does it travel?`;
  const answer = distance;

  const wrong1 = rate + time;
  const wrong2 = rate / time;
  const wrong3 = distance + rate;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_drt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'distance-rate-time',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['word-problems', 'distance', 'rate', 'time']
    },
    isActive: true
  };
}

function generateInteriorAngles(difficulty) {
  const sides = randomInt(3, 8);
  const sumFormula = (sides - 2) * 180;

  const content = `What is the sum of interior angles of a ${sides}-sided polygon?`;
  const answer = sumFormula;

  const wrong1 = sides * 180;
  const wrong2 = (sides - 1) * 180;
  const wrong3 = (sides + 1) * 180;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_intang_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'interior-angles',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['geometry', 'polygons', 'angles']
    },
    isActive: true
  };
}

function generateSimilarTriangles(difficulty) {
  const scale = randomInt(2, 4);
  const side1 = randomInt(3, 8);
  const side2 = side1 * scale;

  const content = `Two triangles are similar. If one side is ${side1} cm and the corresponding side in the other triangle is ${side2} cm, what is the scale factor?`;
  const answer = scale;

  const wrong1 = side2 - side1;
  const wrong2 = side2 + side1;
  const wrong3 = side2 / 2;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_simtri_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'similar-triangles',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['geometry', 'triangles', 'similarity', 'scale-factor']
    },
    isActive: true
  };
}

function generateDomainRange(difficulty) {
  const inputs = [1, 2, 3, 4];
  const multiplier = randomInt(2, 5);
  const outputs = inputs.map(x => x * multiplier);

  const content = `For the function f(x) = ${multiplier}x, what is the range when the domain is {1, 2, 3, 4}?`;
  const answer = `{${outputs.join(', ')}}`;

  const wrong1 = `{${inputs.join(', ')}}`;
  const wrong2 = `{${outputs.map(x => x + 1).join(', ')}}`;
  const wrong3 = `{${outputs.map(x => x * 2).join(', ')}}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_domran_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'domain-range',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['functions', 'domain', 'range', 'algebra']
    },
    isActive: true
  };
}

function generateArithmeticSequences(difficulty) {
  const first = randomInt(2, 10);
  const diff = randomInt(2, 7);
  const n = randomInt(5, 8);
  const answer = first + (n - 1) * diff;

  const content = `In an arithmetic sequence where the first term is ${first} and the common difference is ${diff}, what is the ${n}th term?`;

  const wrong1 = first * n;
  const wrong2 = first + n * diff;
  const wrong3 = answer - diff;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_arithseq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'arithmetic-sequences',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['sequences', 'patterns', 'algebra']
    },
    isActive: true
  };
}

function generateMultiplyDecimals(difficulty) {
  const a = (randomInt(10, 50) / 10).toFixed(1);
  const b = (randomInt(10, 50) / 10).toFixed(1);
  const answer = (parseFloat(a) * parseFloat(b)).toFixed(2);

  const content = `${a} × ${b} = ?`;

  const wrong1 = (parseFloat(a) + parseFloat(b)).toFixed(2);
  const wrong2 = (parseFloat(answer) * 10).toFixed(2);
  const wrong3 = (parseFloat(answer) / 10).toFixed(2);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_decmult_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'multiply-decimals',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['decimals', 'multiplication']
    },
    isActive: true
  };
}

function generateDivideDecimals(difficulty) {
  const divisor = (randomInt(2, 9) / 10).toFixed(1);
  const quotient = randomInt(2, 9);
  const dividend = (parseFloat(divisor) * quotient).toFixed(1);
  const answer = quotient;

  const content = `${dividend} ÷ ${divisor} = ?`;

  const wrong1 = quotient * 10;
  const wrong2 = quotient / 10;
  const wrong3 = parseFloat(dividend) - parseFloat(divisor);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_decdiv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'divide-decimals',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['decimals', 'division']
    },
    isActive: true
  };
}

function generateCircumference(difficulty) {
  const radius = randomInt(3, 10);
  const answer = (2 * Math.PI * radius).toFixed(2);

  const content = `Find the circumference of a circle with radius ${radius} cm. Use π ≈ 3.14`;

  const wrong1 = (Math.PI * radius * radius).toFixed(2);
  const wrong2 = (2 * radius).toFixed(2);
  const wrong3 = (Math.PI * radius).toFixed(2);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_circum_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'circumference',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['geometry', 'circles', 'circumference']
    },
    isActive: true
  };
}

function generateAreaCircles(difficulty) {
  const radius = randomInt(3, 10);
  const answer = (Math.PI * radius * radius).toFixed(2);

  const content = `Find the area of a circle with radius ${radius} cm. Use π ≈ 3.14`;

  const wrong1 = (2 * Math.PI * radius).toFixed(2);
  const wrong2 = (Math.PI * radius).toFixed(2);
  const wrong3 = (radius * radius).toFixed(2);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_areacir_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'area-circles',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['geometry', 'circles', 'area']
    },
    isActive: true
  };
}

function generateEvaluateExpressions(difficulty) {
  const x = randomInt(2, 8);
  const coef = randomInt(2, 6);
  const constant = randomInt(1, 10);
  const answer = coef * x + constant;

  const content = `Evaluate ${coef}x + ${constant} when x = ${x}`;

  const wrong1 = coef + x + constant;
  const wrong2 = coef * (x + constant);
  const wrong3 = answer - constant;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_evalexp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'evaluate-expressions',
    content: content,
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
      estimatedTime: 35,
      source: 'template',
      tags: ['algebra', 'expressions', 'substitution']
    },
    isActive: true
  };
}

function generateSimplifyExpressions(difficulty) {
  const coef1 = randomInt(2, 7);
  const coef2 = randomInt(2, 7);
  const totalCoef = coef1 + coef2;

  const content = `Simplify: ${coef1}x + ${coef2}x`;
  const answer = `${totalCoef}x`;

  const wrong1 = `${coef1 * coef2}x`;
  const wrong2 = `${coef1}x${coef2}`;
  const wrong3 = `${totalCoef}x^2`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_simpexp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'simplify-expressions',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.1,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['algebra', 'expressions', 'simplification']
    },
    isActive: true
  };
}

function generatePlottingPoints(difficulty) {
  const x = randomInt(-5, 5);
  const y = randomInt(-5, 5);

  const content = `What are the coordinates of a point that is ${Math.abs(x)} units ${x >= 0 ? 'right' : 'left'} of the origin and ${Math.abs(y)} units ${y >= 0 ? 'up' : 'down'}?`;
  const answer = `(${x}, ${y})`;

  const wrong1 = `(${y}, ${x})`;
  const wrong2 = `(${-x}, ${y})`;
  const wrong3 = `(${x}, ${-y})`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_plotpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'plotting-points',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.1,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['coordinate-plane', 'graphing', 'points']
    },
    isActive: true
  };
}

function generateGraphLinearEquations(difficulty) {
  const slope = randomInt(1, 5);
  const yIntercept = randomInt(-5, 5);
  const x = randomInt(1, 4);
  const y = slope * x + yIntercept;

  const content = `For the line y = ${slope}x + ${yIntercept}, what is y when x = ${x}?`;
  const answer = y;

  const wrong1 = slope * x;
  const wrong2 = slope + x + yIntercept;
  const wrong3 = y + slope;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_graphlin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'graph-linear-equations',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.1,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['graphing', 'linear-equations', 'algebra']
    },
    isActive: true
  };
}

function generateQuartiles(difficulty) {
  const data = [12, 15, 18, 20, 22, 25, 28, 30, 32].sort((a, b) => a - b);
  const q1Index = Math.floor(data.length / 4);
  const q3Index = Math.floor((3 * data.length) / 4);
  const q1 = data[q1Index];
  const q3 = data[q3Index];

  const content = `For the data set {12, 15, 18, 20, 22, 25, 28, 30, 32}, what is Q1 (first quartile)?`;
  const answer = q1;

  const wrong1 = q3;
  const wrong2 = data[Math.floor(data.length / 2)];
  const wrong3 = data[0];

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_quart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'quartiles',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['statistics', 'quartiles', 'data-analysis']
    },
    isActive: true
  };
}

function generateDivisibilityRules(difficulty) {
  const divisors = [2, 3, 4, 5, 9, 10];
  const divisor = divisors[randomInt(0, divisors.length - 1)];
  const multiplier = randomInt(5, 20);
  const number = divisor * multiplier;

  const content = `Is ${number} divisible by ${divisor}?`;
  const answer = 'Yes';

  const wrong1 = 'No';
  const wrong2 = 'Sometimes';
  const wrong3 = 'Cannot determine';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_divrul_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'divisibility-rules',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.1,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 25,
      source: 'template',
      tags: ['number-theory', 'divisibility', 'integers']
    },
    isActive: true
  };
}

function generateGeometricSequences(difficulty) {
  const first = randomInt(2, 5);
  const ratio = randomInt(2, 4);
  const n = randomInt(4, 6);
  const answer = first * Math.pow(ratio, n - 1);

  const content = `In a geometric sequence where the first term is ${first} and the common ratio is ${ratio}, what is the ${n}th term?`;

  const wrong1 = first + ratio * (n - 1);
  const wrong2 = first * ratio * n;
  const wrong3 = answer / ratio;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_geomseq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'geometric-sequences',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['sequences', 'geometric', 'algebra']
    },
    isActive: true
  };
}

function generateFunctionNotation(difficulty) {
  const a = randomInt(2, 6);
  const b = randomInt(1, 9);
  const x = randomInt(2, 7);
  const answer = a * x + b;

  const content = `If f(x) = ${a}x + ${b}, find f(${x})`;

  const wrong1 = a * x;
  const wrong2 = a + x + b;
  const wrong3 = answer - b;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_funcnot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'function-notation',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.1,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['functions', 'function-notation', 'algebra']
    },
    isActive: true
  };
}

function generateCongruentTriangles(difficulty) {
  const side = randomInt(5, 12);

  const content = `Two triangles have all corresponding sides equal (${side} cm each). Are the triangles congruent?`;
  const answer = 'Yes';

  const wrong1 = 'No';
  const wrong2 = 'Only if angles match';
  const wrong3 = 'Cannot determine';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_congtri_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'congruent-triangles',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['geometry', 'triangles', 'congruence']
    },
    isActive: true
  };
}

function generateReciprocals(difficulty) {
  const numerator = randomInt(2, 9);
  const denominator = randomInt(2, 9);

  const content = `What is the reciprocal of ${numerator}/${denominator}?`;
  const answer = `${denominator}/${numerator}`;

  const wrong1 = `${numerator}/${denominator}`;
  const wrong2 = `${denominator * numerator}/${1}`;
  const wrong3 = `1/${numerator + denominator}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_recip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'reciprocals',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.1,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['fractions', 'reciprocals', 'number-sense']
    },
    isActive: true
  };
}

function generateInequalitiesOnNumberLine(difficulty) {
  const value = randomInt(-5, 10);
  const direction = randomInt(0, 1) === 0 ? 'greater' : 'less';
  const operator = direction === 'greater' ? '>' : '<';

  const content = `Which inequality represents "x is ${direction} than ${value}"?`;
  const answer = `x ${operator} ${value}`;

  const wrong1 = direction === 'greater' ? `x < ${value}` : `x > ${value}`;
  const wrong2 = `x = ${value}`;
  const wrong3 = direction === 'greater' ? `${value} > x` : `${value} < x`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_ineqnum_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'inequalities-on-number-line',
    content: content,
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
      tags: ['inequalities', 'number-line', 'algebra']
    },
    isActive: true
  };
}

function generateInterquartileRange(difficulty) {
  const data = [10, 15, 20, 25, 30, 35, 40];
  const q1 = data[Math.floor(data.length / 4)];
  const q3 = data[Math.floor((3 * data.length) / 4)];
  const iqr = q3 - q1;

  const content = `For the data set {10, 15, 20, 25, 30, 35, 40}, what is the interquartile range (IQR)?`;
  const answer = iqr;

  const wrong1 = q3;
  const wrong2 = q1;
  const wrong3 = data[data.length - 1] - data[0];

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_iqr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'interquartile-range',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['statistics', 'iqr', 'quartiles']
    },
    isActive: true
  };
}

function generateRoundingDecimals(difficulty) {
  const value = (randomInt(100, 999) / 10).toFixed(1);
  const rounded = Math.round(parseFloat(value));

  const content = `Round ${value} to the nearest whole number`;
  const answer = rounded;

  const wrong1 = Math.floor(parseFloat(value));
  const wrong2 = Math.ceil(parseFloat(value));
  const wrong3 = parseFloat(value).toFixed(0) === String(rounded) ? rounded + 1 : rounded - 1;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_rounddec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'rounding-decimals',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.2,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 25,
      source: 'template',
      tags: ['decimals', 'rounding', 'number-sense']
    },
    isActive: true
  };
}

function generateYIntercept(difficulty) {
  const slope = randomInt(1, 5);
  const yIntercept = randomInt(-10, 10);

  const content = `What is the y-intercept of the line y = ${slope}x + ${yIntercept}?`;
  const answer = yIntercept;

  const wrong1 = slope;
  const wrong2 = 0;
  const wrong3 = -yIntercept;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_yint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'y-intercept',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.1,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 25,
      source: 'template',
      tags: ['linear-equations', 'y-intercept', 'graphing']
    },
    isActive: true
  };
}

function generateXIntercept(difficulty) {
  const slope = randomInt(1, 5);
  const yIntercept = randomInt(5, 15);
  const xIntercept = -yIntercept / slope;

  const content = `What is the x-intercept of the line y = ${slope}x + ${yIntercept}?`;
  const answer = xIntercept.toFixed(2);

  const wrong1 = yIntercept;
  const wrong2 = slope;
  const wrong3 = (yIntercept / slope).toFixed(2);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_xint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'x-intercept',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['linear-equations', 'x-intercept', 'graphing']
    },
    isActive: true
  };
}

function generateCompositionOfFunctions(difficulty) {
  const a = randomInt(2, 5);
  const b = randomInt(1, 5);
  const x = randomInt(1, 4);

  const gx = a * x;
  const fogx = gx + b;

  const content = `If f(x) = x + ${b} and g(x) = ${a}x, find f(g(${x}))`;
  const answer = fogx;

  const wrong1 = a * (x + b);
  const wrong2 = gx;
  const wrong3 = x + b;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_compfunc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'composition-of-functions',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['functions', 'composition', 'algebra']
    },
    isActive: true
  };
}

function generateInverseFunctions(difficulty) {
  const slope = randomInt(2, 5);
  const invSlope = `1/${slope}`;

  const content = `If f(x) = ${slope}x, what is the inverse function f⁻¹(x)?`;
  const answer = `x/${slope}`;

  const wrong1 = `${slope}x`;
  const wrong2 = `-${slope}x`;
  const wrong3 = `${slope}/x`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_invfunc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'inverse-functions',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['functions', 'inverse', 'algebra']
    },
    isActive: true
  };
}

function generatePermutations(difficulty) {
  const n = randomInt(4, 6);
  const r = randomInt(2, 3);
  let answer = 1;
  for (let i = 0; i < r; i++) {
    answer *= (n - i);
  }

  const content = `How many ways can you arrange ${r} items from a set of ${n} items? (Order matters)`;

  const wrong1 = Math.pow(n, r);
  const wrong2 = n + r;
  const wrong3 = n * r;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'permutations',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['counting', 'permutations', 'combinatorics']
    },
    isActive: true
  };
}

function generateCombinations(difficulty) {
  const n = randomInt(5, 7);
  const r = randomInt(2, 3);

  let numerator = 1;
  for (let i = 0; i < r; i++) {
    numerator *= (n - i);
  }

  let denominator = 1;
  for (let i = 1; i <= r; i++) {
    denominator *= i;
  }

  const answer = numerator / denominator;

  const content = `How many ways can you choose ${r} items from a set of ${n} items? (Order doesn't matter)`;

  const wrong1 = numerator;
  const wrong2 = n * r;
  const wrong3 = Math.pow(n, r);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_comb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'combinations',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.5,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 55,
      source: 'template',
      tags: ['counting', 'combinations', 'combinatorics']
    },
    isActive: true
  };
}

function generateBoxPlots(difficulty) {
  const min = 10;
  const q1 = 20;
  const median = 30;
  const q3 = 40;
  const max = 50;

  const content = `In a box plot with Min=10, Q1=20, Median=30, Q3=40, Max=50, what is the median?`;
  const answer = median;

  const wrong1 = q1;
  const wrong2 = q3;
  const wrong3 = (q1 + q3) / 2;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_boxplot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'box-plots',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['statistics', 'box-plots', 'data-analysis']
    },
    isActive: true
  };
}

function generateVertexForm(difficulty) {
  const h = randomInt(1, 5);
  const k = randomInt(-5, 5);

  const content = `What is the vertex of the parabola y = (x - ${h})² + ${k}?`;
  const answer = `(${h}, ${k})`;

  const wrong1 = `(${-h}, ${k})`;
  const wrong2 = `(${h}, ${-k})`;
  const wrong3 = `(${k}, ${h})`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_vertex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'vertex-form',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['quadratics', 'vertex-form', 'algebra']
    },
    isActive: true
  };
}

function generateQuadraticFormula(difficulty) {
  const a = randomInt(1, 3);
  const b = randomInt(-6, 6);
  const c = randomInt(-5, 5);

  const discriminant = b * b - 4 * a * c;
  const x1 = (-b + Math.sqrt(discriminant)) / (2 * a);
  const x2 = (-b - Math.sqrt(discriminant)) / (2 * a);

  const content = `Use the quadratic formula to solve ${a}x² + ${b}x + ${c} = 0. What is one solution? (Round to 2 decimals if needed)`;
  const answer = x1.toFixed(2);

  const wrong1 = x2.toFixed(2);
  const wrong2 = (-b / (2 * a)).toFixed(2);
  const wrong3 = (Math.sqrt(discriminant)).toFixed(2);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_quadform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'quadratic-formula',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.5,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 60,
      source: 'template',
      tags: ['quadratics', 'quadratic-formula', 'algebra']
    },
    isActive: true
  };
}

function generateCompletingTheSquare(difficulty) {
  const b = randomInt(2, 10) * 2; // Even number for easier computation
  const halfB = b / 2;
  const constant = halfB * halfB;

  const content = `Complete the square for x² + ${b}x. What constant should be added?`;
  const answer = constant;

  const wrong1 = b;
  const wrong2 = halfB;
  const wrong3 = b * b;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_complete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'completing-the-square',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['quadratics', 'completing-the-square', 'algebra']
    },
    isActive: true
  };
}

function generateDiscriminant(difficulty) {
  const a = randomInt(1, 3);
  const b = randomInt(-6, 6);
  const c = randomInt(-5, 5);
  const discriminant = b * b - 4 * a * c;

  const content = `For the equation ${a}x² + ${b}x + ${c} = 0, what is the discriminant?`;
  const answer = discriminant;

  const wrong1 = b * b;
  const wrong2 = 4 * a * c;
  const wrong3 = -discriminant;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_disc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'discriminant',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['quadratics', 'discriminant', 'algebra']
    },
    isActive: true
  };
}

function generateUnitCircle(difficulty) {
  const angles = [
    { deg: 0, rad: '0', cos: '1', sin: '0' },
    { deg: 90, rad: 'π/2', cos: '0', sin: '1' },
    { deg: 180, rad: 'π', cos: '-1', sin: '0' },
    { deg: 270, rad: '3π/2', cos: '0', sin: '-1' }
  ];

  const angle = angles[randomInt(0, angles.length - 1)];
  const askFor = randomInt(0, 1) === 0 ? 'cos' : 'sin';
  const answer = angle[askFor];

  const content = `On the unit circle, what is ${askFor}(${angle.rad})?`;

  const wrong1 = angle[askFor === 'cos' ? 'sin' : 'cos'];
  const wrong2 = String(-parseFloat(answer));
  const wrong3 = '1/2';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_unitcir_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'unit-circle',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['trigonometry', 'unit-circle', 'special-angles']
    },
    isActive: true
  };
}

function generateRationalFunctions(difficulty) {
  const num = randomInt(2, 8);
  const denom = randomInt(2, 8);

  const content = `For f(x) = ${num}/(x + ${denom}), what value of x makes the denominator zero (vertical asymptote)?`;
  const answer = -denom;

  const wrong1 = denom;
  const wrong2 = num;
  const wrong3 = 0;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_ratfunc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'rational-functions',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['rational-functions', 'asymptotes', 'algebra']
    },
    isActive: true
  };
}

function generatePiecewiseFunctions(difficulty) {
  const a = randomInt(2, 5);
  const b = randomInt(1, 5);
  const x = randomInt(-3, -1);

  const content = `For f(x) = {${a}x if x < 0, ${b} if x ≥ 0}, what is f(${x})?`;
  const answer = a * x;

  const wrong1 = b;
  const wrong2 = a + x;
  const wrong3 = -answer;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_piecewise_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'piecewise-functions',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['piecewise-functions', 'functions', 'algebra']
    },
    isActive: true
  };
}

function generateSectorArea(difficulty) {
  const radius = randomInt(5, 12);
  const angleDeg = randomInt(30, 180);
  const angleRad = (angleDeg * Math.PI) / 180;
  const area = 0.5 * radius * radius * angleRad;

  const content = `Find the area of a sector with radius ${radius} cm and central angle ${angleDeg}°. Use π ≈ 3.14`;
  const answer = area.toFixed(2);

  const wrong1 = (Math.PI * radius * radius).toFixed(2);
  const wrong2 = (radius * angleRad).toFixed(2);
  const wrong3 = (0.5 * radius * angleDeg).toFixed(2);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_sector_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'sector-area',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['geometry', 'circles', 'sectors', 'area']
    },
    isActive: true
  };
}

function generateArcLength(difficulty) {
  const radius = randomInt(5, 15);
  const angleDeg = randomInt(60, 180);
  const angleRad = (angleDeg * Math.PI) / 180;
  const arcLength = radius * angleRad;

  const content = `Find the arc length of a circle with radius ${radius} cm and central angle ${angleDeg}°. Use π ≈ 3.14`;
  const answer = arcLength.toFixed(2);

  const wrong1 = (2 * Math.PI * radius).toFixed(2);
  const wrong2 = (radius + angleRad).toFixed(2);
  const wrong3 = (0.5 * radius * angleRad).toFixed(2);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_arclen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'arc-length',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['geometry', 'circles', 'arc-length']
    },
    isActive: true
  };
}

function generateChainRule(difficulty) {
  const outer = randomInt(2, 5);
  const inner = randomInt(2, 4);
  const x = randomInt(1, 3);

  const content = `If f(x) = (${inner}x)^${outer}, find f'(${x}) using the chain rule`;
  const answer = outer * Math.pow(inner * x, outer - 1) * inner;

  const wrong1 = outer * Math.pow(inner * x, outer - 1);
  const wrong2 = outer * Math.pow(inner * x, outer);
  const wrong3 = Math.pow(inner * x, outer - 1);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_chain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'chain-rule',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.6,
      discrimination: 1.5,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 55,
      source: 'template',
      tags: ['calculus', 'derivatives', 'chain-rule']
    },
    isActive: true
  };
}

function generateProductRule(difficulty) {
  const a = randomInt(2, 5);
  const b = randomInt(2, 5);

  const content = `If f(x) = ${a}x · x^${b}, find f'(x) using the product rule`;
  const answer = `${a}x^${b} + ${a * b}x^${b}`;

  const wrong1 = `${a}x^${b + 1}`;
  const wrong2 = `${a * b}x^${b - 1}`;
  const wrong3 = `${a}x^${b - 1}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'product-rule',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.6,
      discrimination: 1.5,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 55,
      source: 'template',
      tags: ['calculus', 'derivatives', 'product-rule']
    },
    isActive: true
  };
}

function generateQuotientRule(difficulty) {
  const a = randomInt(2, 5);
  const b = randomInt(2, 5);

  const content = `If f(x) = x^${a} / x^${b}, what is f'(x)?`;
  const answer = `${a - b}x^${a - b - 1}`;

  const wrong1 = `${a}x^${a - 1} / ${b}x^${b - 1}`;
  const wrong2 = `x^${a - b}`;
  const wrong3 = `x^${a - b - 1}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_quot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'quotient-rule',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.6,
      discrimination: 1.5,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 55,
      source: 'template',
      tags: ['calculus', 'derivatives', 'quotient-rule']
    },
    isActive: true
  };
}

function generateRecursiveSequences(difficulty) {
  const first = randomInt(2, 5);
  const add = randomInt(2, 5);

  const content = `A sequence is defined by a₁ = ${first} and aₙ = aₙ₋₁ + ${add}. What is a₃?`;
  const a2 = first + add;
  const a3 = a2 + add;
  const answer = a3;

  const wrong1 = first + add * 3;
  const wrong2 = a2;
  const wrong3 = first * 3;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_recseq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'recursive-sequences',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['sequences', 'recursive', 'algebra']
    },
    isActive: true
  };
}

function generateAbsoluteValueEquations(difficulty) {
  const value = randomInt(3, 10);

  const content = `Solve |x| = ${value}. What is one solution?`;
  const answer = value;

  const wrong1 = -value;
  const wrong2 = 0;
  const wrong3 = value * 2;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_abseq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'absolute-value-equations',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['absolute-value', 'equations', 'algebra']
    },
    isActive: true
  };
}

function generateStandardDeviation(difficulty) {
  const data = [10, 12, 14, 16, 18];
  const mean = data.reduce((a, b) => a + b) / data.length;
  const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
  const stdDev = Math.sqrt(variance);

  const content = `For the data set {10, 12, 14, 16, 18}, what is the standard deviation? (Round to 2 decimals)`;
  const answer = stdDev.toFixed(2);

  const wrong1 = variance.toFixed(2);
  const wrong2 = mean.toFixed(2);
  const wrong3 = (stdDev * 2).toFixed(2);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_stddev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'standard-deviation',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.5,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 60,
      source: 'template',
      tags: ['statistics', 'standard-deviation', 'data-analysis']
    },
    isActive: true
  };
}

function generateVariance(difficulty) {
  const data = [5, 10, 15];
  const mean = data.reduce((a, b) => a + b) / data.length;
  const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;

  const content = `For the data set {5, 10, 15}, what is the variance? (Round to 2 decimals)`;
  const answer = variance.toFixed(2);

  const wrong1 = Math.sqrt(variance).toFixed(2);
  const wrong2 = mean.toFixed(2);
  const wrong3 = (variance / 2).toFixed(2);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_var_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'variance',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.5,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 55,
      source: 'template',
      tags: ['statistics', 'variance', 'data-analysis']
    },
    isActive: true
  };
}

function generateMatrices(difficulty) {
  const a11 = randomInt(1, 5);
  const a12 = randomInt(1, 5);
  const b11 = randomInt(1, 5);
  const b12 = randomInt(1, 5);

  const content = `Add matrices [[${a11}, ${a12}]] + [[${b11}, ${b12}]]. What is the first element?`;
  const answer = a11 + b11;

  const wrong1 = a11 * b11;
  const wrong2 = a12 + b12;
  const wrong3 = a11 + b12;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_matrix_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'matrices',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['matrices', 'linear-algebra', 'matrix-addition']
    },
    isActive: true
  };
}

function generateVectors(difficulty) {
  const x1 = randomInt(1, 8);
  const y1 = randomInt(1, 8);
  const x2 = randomInt(1, 8);
  const y2 = randomInt(1, 8);

  const content = `Add vectors (${x1}, ${y1}) + (${x2}, ${y2}). What is the x-component?`;
  const answer = x1 + x2;

  const wrong1 = y1 + y2;
  const wrong2 = x1 * x2;
  const wrong3 = x1 + y1;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_vector_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'vectors',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['vectors', 'vector-addition', 'linear-algebra']
    },
    isActive: true
  };
}

function generateSlopeInterceptForm(difficulty) {
  const m = randomInt(1, 5);
  const b = randomInt(-8, 8);

  const content = `A line has slope ${m} and y-intercept ${b}. Write the equation in slope-intercept form`;
  const answer = `y = ${m}x + ${b}`;

  const wrong1 = `y = ${b}x + ${m}`;
  const wrong2 = `y = ${m}x - ${b}`;
  const wrong3 = `x = ${m}y + ${b}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_slopeint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'slope-intercept-form',
    content: content,
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
      tags: ['linear-equations', 'slope-intercept', 'algebra']
    },
    isActive: true
  };
}

function generatePointSlopeForm(difficulty) {
  const m = randomInt(2, 6);
  const x1 = randomInt(1, 5);
  const y1 = randomInt(1, 8);

  const content = `Write the equation of a line with slope ${m} passing through (${x1}, ${y1}) in point-slope form`;
  const answer = `y - ${y1} = ${m}(x - ${x1})`;

  const wrong1 = `y + ${y1} = ${m}(x + ${x1})`;
  const wrong2 = `y = ${m}x + ${y1}`;
  const wrong3 = `y - ${y1} = ${m}x - ${x1}`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_ptslope_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'point-slope-form',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['linear-equations', 'point-slope', 'algebra']
    },
    isActive: true
  };
}

function generateRadianConversion(difficulty) {
  const degrees = [30, 45, 60, 90, 180];
  const deg = degrees[randomInt(0, degrees.length - 1)];
  const rad = (deg * Math.PI / 180).toFixed(4);

  const content = `Convert ${deg}° to radians (use π ≈ 3.14)`;
  const answer = rad;

  const wrong1 = (deg / 180).toFixed(4);
  const wrong2 = (deg * 180 / Math.PI).toFixed(4);
  const wrong3 = (deg / Math.PI).toFixed(4);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_radconv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'radian-conversion',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.2,
      discrimination: 1.2,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['trigonometry', 'radians', 'conversion']
    },
    isActive: true
  };
}

function generateSineCosineLaw(difficulty) {
  const a = randomInt(5, 12);
  const b = randomInt(5, 12);
  const C = 90;

  const c = Math.sqrt(a * a + b * b);

  const content = `In a right triangle with sides a=${a}, b=${b}, and C=90°, find the hypotenuse c using the Pythagorean theorem`;
  const answer = c.toFixed(2);

  const wrong1 = (a + b).toFixed(2);
  const wrong2 = (a * b).toFixed(2);
  const wrong3 = Math.abs(a - b).toFixed(2);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_lawsine_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'sine-cosine-law',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['trigonometry', 'law-of-sines', 'triangles']
    },
    isActive: true
  };
}

function generateComplexNumbers(difficulty) {
  const a = randomInt(1, 8);
  const b = randomInt(1, 8);
  const c = randomInt(1, 8);
  const d = randomInt(1, 8);

  const content = `Add complex numbers (${a} + ${b}i) + (${c} + ${d}i). What is the real part?`;
  const answer = a + c;

  const wrong1 = b + d;
  const wrong2 = a * c;
  const wrong3 = a + b + c + d;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_complex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'complex-numbers',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['complex-numbers', 'algebra', 'imaginary']
    },
    isActive: true
  };
}

function generateLogarithmicEquations(difficulty) {
  const base = randomInt(2, 5);
  const power = randomInt(2, 4);
  const result = Math.pow(base, power);

  const content = `Solve for x: log_${base}(x) = ${power}`;
  const answer = result;

  const wrong1 = base * power;
  const wrong2 = base + power;
  const wrong3 = power;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_logeq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'logarithmic-equations',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.5,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['logarithms', 'equations', 'algebra']
    },
    isActive: true
  };
}

function generateExponentialEquations(difficulty) {
  const base = randomInt(2, 5);
  const power = randomInt(2, 4);
  const result = Math.pow(base, power);

  const content = `Solve for x: ${base}^x = ${result}`;
  const answer = power;

  const wrong1 = result;
  const wrong2 = base;
  const wrong3 = power + 1;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_expeq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'exponential-equations',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['exponential', 'equations', 'algebra']
    },
    isActive: true
  };
}

function generatePolynomialLongDivision(difficulty) {
  const divisor = randomInt(2, 5);
  const quotient = randomInt(2, 6);
  const dividend = divisor * quotient;

  const content = `Divide x² by x. What is the quotient?`;
  const answer = 'x';

  const wrong1 = 'x²';
  const wrong2 = '1';
  const wrong3 = '2x';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_polydiv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'polynomial-long-division',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.5,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 55,
      source: 'template',
      tags: ['polynomials', 'division', 'algebra']
    },
    isActive: true
  };
}

function generateIntegrationByParts(difficulty) {
  const content = `Which formula represents integration by parts?`;
  const answer = '∫udv = uv - ∫vdu';

  const wrong1 = '∫udv = uv + ∫vdu';
  const wrong2 = '∫udv = ∫vdu';
  const wrong3 = '∫udv = uv';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_intparts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'integration-by-parts',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.7,
      discrimination: 1.5,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 60,
      source: 'template',
      tags: ['calculus', 'integration', 'integration-by-parts']
    },
    isActive: true
  };
}

function generateTrigonometricIdentities(difficulty) {
  const content = `What is sin²(x) + cos²(x) equal to?`;
  const answer = '1';

  const wrong1 = '0';
  const wrong2 = 'sin(2x)';
  const wrong3 = '2';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_trigid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'trigonometric-identities',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.3,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['trigonometry', 'identities', 'pythagorean-identity']
    },
    isActive: true
  };
}

function generateParametricEquations(difficulty) {
  const t = randomInt(1, 5);
  const x = 2 * t;
  const y = 3 * t;

  const content = `For parametric equations x = 2t, y = 3t, what is x when t = ${t}?`;
  const answer = x;

  const wrong1 = y;
  const wrong2 = 2 + t;
  const wrong3 = 3 * x;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_param_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'parametric-equations',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['parametric-equations', 'algebra', 'calculus']
    },
    isActive: true
  };
}

function generatePolarCoordinates(difficulty) {
  const r = randomInt(3, 10);
  const theta = 0;

  const content = `Convert polar coordinates (r=${r}, θ=0°) to Cartesian. What is x?`;
  const answer = r;

  const wrong1 = 0;
  const wrong2 = -r;
  const wrong3 = r / 2;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_polar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'polar-coordinates',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.4,
      discrimination: 1.3,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['polar-coordinates', 'coordinate-systems', 'trigonometry']
    },
    isActive: true
  };
}

function generateDefiniteIntegrals(difficulty) {
  const content = `∫₀² 2x dx = ?`;
  const answer = '4';

  const wrong1 = '2';
  const wrong2 = 'x²';
  const wrong3 = '8';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_defint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'definite-integrals',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.6,
      discrimination: 1.5,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['calculus', 'integrals', 'definite-integrals']
    },
    isActive: true
  };
}

function generateIndefiniteIntegrals(difficulty) {
  const content = `∫3x² dx = ?`;
  const answer = 'x³ + C';

  const wrong1 = '3x²';
  const wrong2 = '6x';
  const wrong3 = 'x³';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_indefint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'indefinite-integrals',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.5,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['calculus', 'integrals', 'indefinite-integrals']
    },
    isActive: true
  };
}

function generateSeriesConvergence(difficulty) {
  const content = `Does the series ∑(1/n) from n=1 to ∞ converge?`;
  const answer = 'No';

  const wrong1 = 'Yes';
  const wrong2 = 'Sometimes';
  const wrong3 = 'Cannot determine';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_serconv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'series-convergence',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.7,
      discrimination: 1.5,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 55,
      source: 'template',
      tags: ['calculus', 'series', 'convergence']
    },
    isActive: true
  };
}

function generateTaylorSeries(difficulty) {
  const content = `What is the first term of the Taylor series for e^x centered at x=0?`;
  const answer = '1';

  const wrong1 = 'x';
  const wrong2 = 'e';
  const wrong3 = '0';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_taylor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'taylor-series',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.8,
      discrimination: 1.6,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 60,
      source: 'template',
      tags: ['calculus', 'series', 'taylor-series']
    },
    isActive: true
  };
}

function generateMultivariableCalculus(difficulty) {
  const content = `What is ∂/∂x(x²y)?`;
  const answer = '2xy';

  const wrong1 = 'x²';
  const wrong2 = '2x';
  const wrong3 = 'y';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_multivar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'multivariable-calculus',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.7,
      discrimination: 1.5,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 55,
      source: 'template',
      tags: ['calculus', 'multivariable', 'partial-derivatives']
    },
    isActive: true
  };
}

function generateDifferentialEquations(difficulty) {
  const content = `Solve dy/dx = 2x. What is y?`;
  const answer = 'x² + C';

  const wrong1 = '2x';
  const wrong2 = 'x²';
  const wrong3 = '2';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_diffeq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'differential-equations',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.7,
      discrimination: 1.5,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 55,
      source: 'template',
      tags: ['calculus', 'differential-equations', 'odes']
    },
    isActive: true
  };
}

function generateLimitsContinuity(difficulty) {
  const content = `lim(x→2) (x² - 4)/(x - 2) = ?`;
  const answer = '4';

  const wrong1 = '0';
  const wrong2 = '2';
  const wrong3 = 'undefined';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_limcont_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'limits-continuity',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.6,
      discrimination: 1.4,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['calculus', 'limits', 'continuity']
    },
    isActive: true
  };
}

function generateImplicitDifferentiation(difficulty) {
  const content = `For x² + y² = 25, find dy/dx using implicit differentiation`;
  const answer = '-x/y';

  const wrong1 = 'x/y';
  const wrong2 = '-y/x';
  const wrong3 = '2x';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_impldiff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'implicit-differentiation',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.6,
      discrimination: 1.5,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 55,
      source: 'template',
      tags: ['calculus', 'differentiation', 'implicit']
    },
    isActive: true
  };
}

function generateRelatedRates(difficulty) {
  const r = randomInt(3, 8);
  const drdt = randomInt(2, 5);
  const dAdt = 2 * Math.PI * r * drdt;

  const content = `A circle's radius grows at ${drdt} cm/s. When r=${r} cm, how fast is the area growing? (Use A=πr²)`;
  const answer = dAdt.toFixed(2);

  const wrong1 = (Math.PI * r * r).toFixed(2);
  const wrong2 = (2 * r * drdt).toFixed(2);
  const wrong3 = (Math.PI * drdt).toFixed(2);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_relrate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'related-rates',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty + 0.7,
      discrimination: 1.5,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 3,
    metadata: {
      estimatedTime: 60,
      source: 'template',
      tags: ['calculus', 'related-rates', 'applications']
    },
    isActive: true
  };
}

function generate2DShapes(difficulty) {
  const shapes = ['circle', 'square', 'triangle', 'rectangle'];
  const shape = randomChoice(shapes);

  const content = `Which shape is this? 🔵`;
  const answer = 'circle';

  const options = shuffle([
    { label: 'A', text: String('circle') },
    { label: 'B', text: String('square') },
    { label: 'C', text: String('triangle') },
    { label: 'D', text: String('rectangle') }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_2dshapes_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: '2d-shapes',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.5,
      discrimination: 0.8,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['geometry', '2d-shapes', 'identification']
    },
    isActive: true
  };
}

function generate3DShapes(difficulty) {
  const content = `Which 3D shape looks like a ball?`;
  const answer = 'sphere';

  const wrong1 = 'cube';
  const wrong2 = 'cylinder';
  const wrong3 = 'cone';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_3dshapes_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: '3d-shapes',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.5,
      discrimination: 0.8,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['geometry', '3d-shapes', 'identification']
    },
    isActive: true
  };
}

function generateAddingGroups(difficulty) {
  const groups = randomInt(2, 4);
  const perGroup = randomInt(2, 5);
  const total = groups * perGroup;

  const content = `There are ${groups} groups with ${perGroup} items in each group. How many items are there in total?`;
  const answer = total;

  const wrong1 = groups + perGroup;
  const wrong2 = total + 1;
  const wrong3 = total - 1;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_addgroups_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'adding-groups',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.0,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['multiplication', 'groups', 'early-math']
    },
    isActive: true
  };
}

function generateAdditionAsJoining(difficulty) {
  const a = randomInt(1, 5);
  const b = randomInt(1, 5);
  const sum = a + b;

  const content = `Sara has ${a} apples. She gets ${b} more apples. How many apples does she have now?`;
  const answer = sum;

  const wrong1 = a;
  const wrong2 = b;
  const wrong3 = sum + 1;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_addjoin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'addition-as-joining',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.5,
      discrimination: 0.9,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['addition', 'word-problems', 'joining']
    },
    isActive: true
  };
}

function generateChangeUnknown(difficulty) {
  const start = randomInt(5, 10);
  const end = randomInt(start + 1, start + 5);
  const change = end - start;

  const content = `Tim had ${start} toys. Now he has ${end} toys. How many toys did he get?`;
  const answer = change;

  const wrong1 = end;
  const wrong2 = start;
  const wrong3 = change + 1;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_changeunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'change-unknown',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.5,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['subtraction', 'word-problems', 'change']
    },
    isActive: true
  };
}

function generateCheckReasonableness(difficulty) {
  const a = randomInt(10, 20);
  const b = randomInt(1, 5);
  const correctAnswer = a + b;
  const wrongAnswer = a + b + 10;

  const content = `${a} + ${b} = ?. Which answer is more reasonable?`;
  const answer = correctAnswer;

  const wrong1 = wrongAnswer;
  const wrong2 = a;
  const wrong3 = b;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_checkreason_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'check-reasonableness',
    content: content,
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
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['reasoning', 'estimation', 'addition']
    },
    isActive: true
  };
}

function generateClassifyShapes(difficulty) {
  const content = `Which shapes have 4 sides?`;
  const answer = 'squares and rectangles';

  const wrong1 = 'circles and triangles';
  const wrong2 = 'only circles';
  const wrong3 = 'only triangles';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_classshapes_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'classify-shapes',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.0,
      discrimination: 0.9,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['geometry', 'classification', 'shapes']
    },
    isActive: true
  };
}

function generateComparingNumbers(difficulty) {
  const a = randomInt(1, 20);
  const b = randomInt(1, 20);
  while (b === a) b = randomInt(1, 20);

  const content = `Which number is greater: ${a} or ${b}?`;
  const answer = Math.max(a, b);

  const wrong1 = Math.min(a, b);
  const wrong2 = a + b;
  const wrong3 = Math.abs(a - b);

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_compnum_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'comparing-numbers',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.5,
      discrimination: 0.8,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['number-sense', 'comparison', 'ordering']
    },
    isActive: true
  };
}

function generateComposeNumbers(difficulty) {
  const target = randomInt(5, 10);
  const part1 = randomInt(1, target - 1);
  const part2 = target - part1;

  const content = `What two numbers make ${target}? ${part1} and ___`;
  const answer = part2;

  const wrong1 = part1;
  const wrong2 = target;
  const wrong3 = part2 + 1;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_compose_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'compose-numbers',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.0,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['number-sense', 'composition', 'part-whole']
    },
    isActive: true
  };
}

function generateCreateSymmetry(difficulty) {
  const content = `If you fold a heart shape in half, are both sides the same?`;
  const answer = 'yes';

  const wrong1 = 'no';
  const wrong2 = 'sometimes';
  const wrong3 = 'only the top';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_createsym_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'create-symmetry',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.5,
      discrimination: 0.9,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['geometry', 'symmetry', 'visual']
    },
    isActive: true
  };
}

function generateDecomposeNumbers(difficulty) {
  const whole = randomInt(5, 10);
  const part1 = randomInt(1, whole - 1);
  const part2 = whole - part1;

  const content = `Break apart ${whole} into two numbers: ${part1} and ___`;
  const answer = part2;

  const wrong1 = part1;
  const wrong2 = whole;
  const wrong3 = part2 + 1;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_decompose_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'decompose-numbers',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.0,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['number-sense', 'decomposition', 'part-whole']
    },
    isActive: true
  };
}

function generateDifferenceWordProblems(difficulty) {
  const bigger = randomInt(8, 15);
  const smaller = randomInt(3, bigger - 1);
  const diff = bigger - smaller;

  const content = `Jake has ${bigger} marbles. Emma has ${smaller} marbles. How many more marbles does Jake have?`;
  const answer = diff;

  const wrong1 = bigger;
  const wrong2 = smaller;
  const wrong3 = bigger + smaller;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_diffword_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'difference-word-problems',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.5,
      discrimination: 1.1,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 50,
      source: 'template',
      tags: ['subtraction', 'word-problems', 'comparison']
    },
    isActive: true
  };
}

function generateDoublesNearDoubles(difficulty) {
  const base = randomInt(3, 8);
  const double = base * 2;

  const content = `What is double ${base}?`;
  const answer = double;

  const wrong1 = base + 1;
  const wrong2 = base * 3;
  const wrong3 = double + 1;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_doubles_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'doubles-near-doubles',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.0,
      discrimination: 0.9,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['multiplication', 'doubles', 'mental-math']
    },
    isActive: true
  };
}

function generateEqualTo(difficulty) {
  const value = randomInt(5, 15);

  const content = `Which number is equal to ${value}?`;
  const answer = value;

  const wrong1 = value + 1;
  const wrong2 = value - 1;
  const wrong3 = value + 2;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_equalto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'equal-to',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.5,
      discrimination: 0.7,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 25,
      source: 'template',
      tags: ['equality', 'number-sense', 'comparison']
    },
    isActive: true
  };
}

function generateEstimateSums(difficulty) {
  const a = randomInt(15, 25);
  const b = randomInt(15, 25);
  const exactSum = a + b;
  const estimate = Math.round(exactSum / 10) * 10;

  const content = `About how much is ${a} + ${b}? (Round to nearest 10)`;
  const answer = estimate;

  const wrong1 = exactSum;
  const wrong2 = estimate + 10;
  const wrong3 = estimate - 10;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_estimatesums_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'estimate-sums',
    content: content,
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
    dokLevel: 2,
    metadata: {
      estimatedTime: 45,
      source: 'template',
      tags: ['estimation', 'addition', 'rounding']
    },
    isActive: true
  };
}

function generateExpandedForm(difficulty) {
  const num = randomInt(10, 99);
  const tens = Math.floor(num / 10) * 10;
  const ones = num % 10;

  const content = `What is ${num} in expanded form?`;
  const answer = `${tens} + ${ones}`;

  const wrong1 = `${tens} + ${tens}`;
  const wrong2 = `${ones} + ${ones}`;
  const wrong3 = `${num} + 0`;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_expanded_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'expanded-form',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 0.5,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['place-value', 'expanded-form', 'number-sense']
    },
    isActive: true
  };
}

function generateGreaterLessThan(difficulty) {
  const a = randomInt(1, 20);
  const b = randomInt(1, 20);
  while (b === a) b = randomInt(1, 20);

  const symbol = a > b ? '>' : '<';

  const content = `Which symbol goes between ${a} ___ ${b}?`;
  const answer = symbol;

  const wrong1 = symbol === '>' ? '<' : '>';
  const wrong2 = '=';
  const wrong3 = '+';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_greaterless_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'greater-less-than',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.0,
      discrimination: 0.9,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['comparison', 'inequality', 'number-sense']
    },
    isActive: true
  };
}

function generateIdentifyShapes(difficulty) {
  const content = `Which shape has 3 sides?`;
  const answer = 'triangle';

  const wrong1 = 'circle';
  const wrong2 = 'square';
  const wrong3 = 'rectangle';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_identshapes_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'identify-shapes',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.5,
      discrimination: 0.8,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 30,
      source: 'template',
      tags: ['geometry', 'shapes', 'identification']
    },
    isActive: true
  };
}

function generateLikelyUnlikely(difficulty) {
  const content = `Is it likely or unlikely that the sun will rise tomorrow?`;
  const answer = 'likely';

  const wrong1 = 'unlikely';
  const wrong2 = 'impossible';
  const wrong3 = 'never';

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_likelyunlikely_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'likely-unlikely',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.0,
      discrimination: 0.9,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 1,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['probability', 'likelihood', 'reasoning']
    },
    isActive: true
  };
}

function generateMakeTen(difficulty) {
  const part1 = randomInt(1, 9);
  const part2 = 10 - part1;

  const content = `What number makes 10 with ${part1}?`;
  const answer = part2;

  const wrong1 = part1;
  const wrong2 = 10;
  const wrong3 = part2 + 1;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrong1) },
    { label: 'C', text: String(wrong2) },
    { label: 'D', text: String(wrong3) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_maketen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'make-ten',
    content: content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options: options,
    irtParameters: {
      difficulty: difficulty - 1.0,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 35,
      source: 'template',
      tags: ['number-sense', 'make-ten', 'addition']
    },
    isActive: true
  };
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

const GENERATORS = {
  // Early Foundations (PreK-2)
  'counting': generateCounting,
  'skip-counting': generateSkipCounting,
  'counting-up': generateCountingUp,
  'counting-down': generateCountingDown,
  'counting-by-groups': generateCountingByGroups,
  'compare-numbers': generateCompareNumbers,
  'ordering-numbers': generateOrderingNumbers,
  'rounding': generateRounding,
  'fact-families': generateFactFamilies,
  'related-facts': generateRelatedFacts,
  'money-math': generateMoneyMath,
  'equality-concept': generateEqualityConcept,
  'missing-number-problems': generateMissingNumberProblems,
  'blank-as-variable': generateBlankAsVariable,
  '2d-shapes': generate2DShapes,
  '3d-shapes': generate3DShapes,
  'adding-groups': generateAddingGroups,
  'addition-as-joining': generateAdditionAsJoining,
  'change-unknown': generateChangeUnknown,
  'check-reasonableness': generateCheckReasonableness,
  'classify-shapes': generateClassifyShapes,
  'comparing-numbers': generateComparingNumbers,
  'compose-numbers': generateComposeNumbers,
  'create-symmetry': generateCreateSymmetry,
  'decompose-numbers': generateDecomposeNumbers,
  'difference-word-problems': generateDifferenceWordProblems,
  'doubles-near-doubles': generateDoublesNearDoubles,
  'equal-to': generateEqualTo,
  'estimate-sums': generateEstimateSums,
  'expanded-form': generateExpandedForm,
  'greater-less-than': generateGreaterLessThan,
  'identify-shapes': generateIdentifyShapes,
  'likely-unlikely': generateLikelyUnlikely,
  'make-ten': generateMakeTen,

  // K-5 (Tier 1) - Elementary
  'one-step-addition': generateOneStepAddition,
  'one-step-subtraction': generateOneStepSubtraction,
  'one-step-multiplication': generateOneStepMultiplication,
  'one-step-division': generateOneStepDivision,
  'addition': generateAddition,
  'subtraction': generateSubtraction,
  'multiplication-basics': generateMultiplicationBasics,
  'multiplication-concepts': generateMultiplicationConcepts,
  'multiplication-as-groups': generateMultiplicationAsGroups,
  'repeated-addition': generateRepeatedAddition,
  'division-basics': generateDivision,
  'addition-subtraction-word-problems': generateAdditionWordProblems,
  'multiplication-word-problems': generateMultiplicationWordProblems,
  'division-word-problems': generateDivisionWordProblems,
  'fraction-word-problems': generateFractionWordProblems,
  'missing-addend': generateMissingAddend,
  'unknown-addend': generateUnknownAddend,
  'balance-scales': generateBalanceScales,
  'place-value': generatePlaceValue,
  'decimals': generateDecimals,
  'decimal-addition': generateDecimalAddition,
  'decimal-subtraction': generateDecimalSubtraction,
  'percent-to-decimal': generatePercentToDecimal,
  'decimal-to-percent': generateDecimalToPercent,
  'order-of-operations': generateOrderOfOperations,
  'simplify-fractions': generateSimplifyFractions,
  'equivalent-fractions': generateEquivalentFractions,
  'comparing-fractions': generateComparingFractions,
  'fraction-concepts': generateFractionConcepts,
  'fractions-as-parts': generateFractionsAsParts,
  'add-fractions': generateAddFractions,
  'subtract-fractions': generateSubtractFractions,
  'multiply-fractions': generateMultiplyFractions,
  'divide-fractions': generateDivideFractions,
  'mixed-numbers': generateMixedNumbers,
  'perimeter': generatePerimeter,
  'area-triangles': generateAreaTriangles,
  'volume': generateVolume,
  'mean': generateMean,
  'median': generateMedian,
  'mode': generateMode,
  'range': generateRange,
  'outliers': generateOutliers,
  'angle-measurement': generateAngleMeasurement,
  'angles': generateAngles,
  'line-segments': generateLineSegments,
  'classify-triangles': generateClassifyTriangles,
  'classify-quadrilaterals': generateClassifyQuadrilaterals,
  'circles': generateCircles,
  'surface-area': generateSurfaceArea,
  'transformations': generateTransformations,
  'reading-graphs': generateReadingGraphs,
  'reading-tables': generateReadingTables,
  'scatterplots': generateScatterplots,
  'square-roots': generateSquareRoots,
  'estimation': generateEstimation,
  'comparing-decimals': generateComparingDecimals,
  'improper-fractions': generateImproperFractions,
  'unit-conversion': generateUnitConversion,
  'multiply-decimals': generateMultiplyDecimals,
  'divide-decimals': generateDivideDecimals,
  'circumference': generateCircumference,
  'area-circles': generateAreaCircles,
  'divisibility-rules': generateDivisibilityRules,
  'reciprocals': generateReciprocals,
  'rounding-decimals': generateRoundingDecimals,

  // 6-8 (Tier 2) - Middle School
  'one-step-equations': generateOneStepEquation,
  'two-step-equations': generateTwoStepEquations,
  'combining-like-terms': generateCombiningLikeTerms,
  'coordinate-plane': generateCoordinatePlane,
  'ratios': generateRatios,
  'percent-of-a-number': generatePercentOfNumber,
  'area-rectangles': generateAreaRectangles,
  'exponents': generateExponents,
  'integers': generateIntegers,
  'negative-number-addition': generateNegativeNumberAddition,
  'negative-number-subtraction': generateNegativeNumberSubtraction,
  'proportions': generateProportions,
  'pythagorean-theorem': generatePythagorean,
  'pythagorean-word-problems': generatePythagoreanWordProblems,
  'one-step-inequalities': generateOneStepInequality,
  'two-step-inequalities': generateTwoStepInequality,
  'absolute-value': generateAbsoluteValue,
  'gcf': generateGCF,
  'lcm': generateLCM,
  'prime-factorization': generatePrimeFactorization,
  'basic-probability': generateBasicProbability,
  'scientific-notation': generateScientificNotation,
  'percent-increase': generatePercentIncrease,
  'percent-decrease': generatePercentDecrease,
  'evaluate-expressions': generateEvaluateExpressions,
  'simplify-expressions': generateSimplifyExpressions,
  'plotting-points': generatePlottingPoints,
  'quartiles': generateQuartiles,
  'inequalities-on-number-line': generateInequalitiesOnNumberLine,
  'interquartile-range': generateInterquartileRange,
  'box-plots': generateBoxPlots,
  'absolute-value-equations': generateAbsoluteValueEquations,
  'slope-intercept-form': generateSlopeInterceptForm,
  'point-slope-form': generatePointSlopeForm,
  'standard-deviation': generateStandardDeviation,
  'variance': generateVariance,

  // 9-12 (Tier 3) - High School
  'multi-step-equations': generateMultiStepEquations,
  'equations-with-distribution': generateDistributiveProperty,
  'equations-with-variables-both-sides': generateVariablesBothSides,
  'solving-inequalities': generateSolvingInequalities,
  'systems-substitution': generateSystemsSubstitution,
  'systems-elimination': generateSystemsElimination,
  'systems-graphing': generateSystemsGraphing,
  'systems-special-cases': generateSystemsSpecialCases,
  'slope': generateSlope,
  'quadratic-functions': generateQuadraticFunctions,
  'factoring-quadratics': generateFactoringQuadratics,
  'systems-of-equations': generateSystemsOfEquations,
  'polynomials': generatePolynomials,
  'polynomial-addition': generatePolynomialAddition,
  'polynomial-subtraction': generatePolynomialSubtraction,
  'exponential-functions': generateExponentialFunctions,
  'logarithms': generateLogarithms,
  'trigonometry': generateTrigonometry,
  'trig-word-problems': generateTrigWordProblems,
  'conditional-statements': generateConditionalStatements,
  'logical-reasoning': generateLogicalReasoning,
  'geometric-proofs': generateGeometricProofs,
  'simplifying-radicals': generateSimplifyingRadicals,
  'parallel-lines': generateParallelLines,
  'perpendicular-lines': generatePerpendicularLines,
  'ratio-word-problems': generateRatioWordProblems,
  'proportion-word-problems': generateProportionWordProblems,
  'distance-rate-time': generateDistanceRateTime,
  'interior-angles': generateInteriorAngles,
  'similar-triangles': generateSimilarTriangles,
  'domain-range': generateDomainRange,
  'arithmetic-sequences': generateArithmeticSequences,
  'graph-linear-equations': generateGraphLinearEquations,
  'geometric-sequences': generateGeometricSequences,
  'function-notation': generateFunctionNotation,
  'congruent-triangles': generateCongruentTriangles,
  'y-intercept': generateYIntercept,
  'x-intercept': generateXIntercept,
  'composition-of-functions': generateCompositionOfFunctions,
  'inverse-functions': generateInverseFunctions,
  'permutations': generatePermutations,
  'combinations': generateCombinations,
  'vertex-form': generateVertexForm,
  'quadratic-formula': generateQuadraticFormula,
  'completing-the-square': generateCompletingTheSquare,
  'discriminant': generateDiscriminant,
  'unit-circle': generateUnitCircle,
  'rational-functions': generateRationalFunctions,
  'piecewise-functions': generatePiecewiseFunctions,
  'sector-area': generateSectorArea,
  'arc-length': generateArcLength,
  'recursive-sequences': generateRecursiveSequences,
  'matrices': generateMatrices,
  'vectors': generateVectors,
  'radian-conversion': generateRadianConversion,
  'sine-cosine-law': generateSineCosineLaw,
  'complex-numbers': generateComplexNumbers,
  'logarithmic-equations': generateLogarithmicEquations,
  'exponential-equations': generateExponentialEquations,
  'polynomial-long-division': generatePolynomialLongDivision,
  'trigonometric-identities': generateTrigonometricIdentities,

  // Calculus (Calc 1-3)
  'limits': generateLimits,
  'derivatives': generateDerivatives,
  'integrals': generateIntegrals,
  'chain-rule': generateChainRule,
  'product-rule': generateProductRule,
  'quotient-rule': generateQuotientRule,
  'integration-by-parts': generateIntegrationByParts,
  'definite-integrals': generateDefiniteIntegrals,
  'indefinite-integrals': generateIndefiniteIntegrals,
  'series-convergence': generateSeriesConvergence,
  'taylor-series': generateTaylorSeries,
  'multivariable-calculus': generateMultivariableCalculus,
  'differential-equations': generateDifferentialEquations,
  'limits-continuity': generateLimitsContinuity,
  'implicit-differentiation': generateImplicitDifferentiation,
  'related-rates': generateRelatedRates,
  'parametric-equations': generateParametricEquations,
  'polar-coordinates': generatePolarCoordinates
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

    // Check which skills already have problems
    console.log('Checking for existing problems...\n');
    const existingCounts = await Problem.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$skillId', count: { $sum: 1 } } }
    ]);
    const existingCountMap = new Map(existingCounts.map(e => [e._id, e.count]));

    // Generate problems for skills that have generators
    const problems = [];
    const difficulties = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5];
    const problemsPerDifficulty = 11; // 7 difficulties × 11 = 77 problems per skill
    const expectedProblemsPerSkill = difficulties.length * problemsPerDifficulty;

    console.log('Generating problems...\n');

    let skippedCount = 0;
    for (const skill of skillsWithGenerators) {
      const existingCount = existingCountMap.get(skill.skillId) || 0;

      // Skip if skill already has enough problems
      if (existingCount >= expectedProblemsPerSkill) {
        console.log(`⏭️  ${skill.skillId}: Skipped (already has ${existingCount} problems)`);
        skippedCount++;
        continue;
      }

      const generator = GENERATORS[skill.skillId];
      let count = 0;

      for (const diff of difficulties) {
        for (let i = 0; i < problemsPerDifficulty; i++) {
          problems.push(generator(diff));
          count++;
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }

      console.log(`✓ ${skill.skillId}: ${count} problems generated (had ${existingCount})`);
    }

    if (skippedCount > 0) {
      console.log(`\n⏭️  Skipped ${skippedCount} skills that already have problems`);
    }

    console.log(`\n📊 Total: ${problems.length} problems generated\n`);

    if (problems.length === 0) {
      console.log('✓ All skills already have problems. Nothing to generate!\n');
    } else {
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
    }

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
