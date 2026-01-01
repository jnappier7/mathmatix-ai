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

  // K-5 (Tier 1) - Elementary
  'one-step-addition': generateOneStepAddition,
  'one-step-subtraction': generateOneStepSubtraction,
  'one-step-multiplication': generateOneStepMultiplication,
  'one-step-division': generateOneStepDivision,
  'addition': generateAddition,
  'subtraction': generateSubtraction,
  'multiplication-basics': generateMultiplicationBasics,
  'multiplication-as-groups': generateMultiplicationAsGroups,
  'repeated-addition': generateRepeatedAddition,
  'division-basics': generateDivision,
  'addition-subtraction-word-problems': generateAdditionWordProblems,
  'missing-addend': generateMissingAddend,
  'unknown-addend': generateUnknownAddend,
  'balance-scales': generateBalanceScales,
  'place-value': generatePlaceValue,
  'decimals': generateDecimals,
  'order-of-operations': generateOrderOfOperations,
  'simplify-fractions': generateSimplifyFractions,
  'equivalent-fractions': generateEquivalentFractions,
  'comparing-fractions': generateComparingFractions,
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
  'angle-measurement': generateAngleMeasurement,
  'classify-triangles': generateClassifyTriangles,
  'classify-quadrilaterals': generateClassifyQuadrilaterals,
  'circles': generateCircles,
  'surface-area': generateSurfaceArea,
  'transformations': generateTransformations,
  'reading-graphs': generateReadingGraphs,
  'reading-tables': generateReadingTables,
  'scatterplots': generateScatterplots,

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
  'proportions': generateProportions,
  'pythagorean-theorem': generatePythagorean,
  'pythagorean-word-problems': generatePythagoreanWordProblems,
  'one-step-inequalities': generateOneStepInequality,
  'two-step-inequalities': generateTwoStepInequality,
  'absolute-value': generateAbsoluteValue,

  // 9-12 (Tier 3) - High School
  'multi-step-equations': generateMultiStepEquations,
  'equations-with-distribution': generateDistributiveProperty,
  'equations-with-variables-both-sides': generateVariablesBothSides,
  'solving-inequalities': generateSolvingInequalities,
  'systems-substitution': generateSystemsSubstitution,
  'systems-elimination': generateSystemsElimination,
  'systems-graphing': generateSystemsGraphing,
  'slope': generateSlope,
  'quadratic-functions': generateQuadraticFunctions,
  'systems-of-equations': generateSystemsOfEquations,
  'polynomials': generatePolynomials,
  'exponential-functions': generateExponentialFunctions,
  'logarithms': generateLogarithms,
  'trigonometry': generateTrigonometry,
  'trig-word-problems': generateTrigWordProblems,
  'conditional-statements': generateConditionalStatements,
  'logical-reasoning': generateLogicalReasoning,
  'geometric-proofs': generateGeometricProofs,

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
