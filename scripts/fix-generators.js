/**
 * FIXED GENERATORS - Properly parameterized versions
 * These replace the hardcoded generators that were creating duplicates
 */

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
// FIXED: generateBoxPlots - Now creates varied problems
// ============================================================================
function generateBoxPlots(difficulty) {
  // Generate random box plot values with proper ordering
  const min = randomInt(5, 15);
  const q1 = min + randomInt(10, 20);
  const median = q1 + randomInt(8, 15);
  const q3 = median + randomInt(8, 15);
  const max = q3 + randomInt(10, 20);

  // Vary the question based on difficulty
  const questions = [
    { ask: 'median', answer: median },
    { ask: 'Q1', answer: q1 },
    { ask: 'Q3', answer: q3 },
    { ask: 'IQR (Q3 - Q1)', answer: q3 - q1 },
    { ask: 'range (Max - Min)', answer: max - min }
  ];

  const difficultyIndex = Math.floor((difficulty + 2) / 4 * questions.length);
  const questionIndex = Math.max(0, Math.min(difficultyIndex, questions.length - 1));
  const { ask, answer } = questions[questionIndex];

  const content = `In a box plot with Min=${min}, Q1=${q1}, Median=${median}, Q3=${q3}, Max=${max}, what is the ${ask}?`;

  // Generate wrong answers based on the question type
  let wrong1, wrong2, wrong3;
  if (ask === 'median') {
    wrong1 = q1;
    wrong2 = q3;
    wrong3 = Math.round((q1 + q3) / 2);
  } else if (ask === 'IQR (Q3 - Q1)') {
    wrong1 = q3;
    wrong2 = q1;
    wrong3 = median;
  } else if (ask === 'range (Max - Min)') {
    wrong1 = max;
    wrong2 = min;
    wrong3 = q3 - q1;
  } else {
    wrong1 = median;
    wrong2 = answer + 5;
    wrong3 = answer - 5;
  }

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
    content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options,
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

// ============================================================================
// FIXED: generateStandardDeviation - Now creates varied data sets
// ============================================================================
function generateStandardDeviation(difficulty) {
  // Generate random data set with varied spread based on difficulty
  const baseValue = randomInt(10, 30);
  const spread = Math.floor(2 + difficulty * 2);  // Harder = more spread
  const count = 5;

  const data = [];
  for (let i = 0; i < count; i++) {
    data.push(baseValue + randomInt(-spread, spread));
  }
  data.sort((a, b) => a - b);  // Keep sorted for readability

  const mean = data.reduce((a, b) => a + b) / data.length;
  const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
  const stdDev = Math.sqrt(variance);

  const content = `For the data set {${data.join(', ')}}, what is the standard deviation? (Round to 2 decimals)`;
  const answer = stdDev.toFixed(2);

  const wrong1 = variance.toFixed(2);
  const wrong2 = mean.toFixed(2);
  const wrong3 = (stdDev * 1.5).toFixed(2);

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
    content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options,
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

// ============================================================================
// FIXED: generateDefiniteIntegrals - Now creates varied integrals
// ============================================================================
function generateDefiniteIntegrals(difficulty) {
  const coeff = randomInt(1, 5);
  const power = randomInt(1, 3);
  const lower = randomInt(0, 2);
  const upper = lower + randomInt(1, 3);

  let integrand, antiderivative;

  if (power === 1) {
    // Linear: ∫ ax dx = (a/2)x²
    integrand = coeff === 1 ? 'x' : `${coeff}x`;
    const result = (coeff / 2) * (upper ** 2 - lower ** 2);
    const answer = Number.isInteger(result) ? String(result) : result.toFixed(2);

    const content = `∫₀${upper === 0 ? '¹' : upper === 1 ? '¹' : upper === 2 ? '²' : upper === 3 ? '³' : '⁴'} ${integrand} dx = ?`;

    const wrong1 = String(Math.round(result * 0.5));
    const wrong2 = String(Math.round(result * 1.5));
    const wrong3 = coeff === 1 ? 'x²' : `${coeff}x²`;

    const options = shuffle([
      { label: 'A', text: answer },
      { label: 'B', text: wrong1 },
      { label: 'C', text: wrong2 },
      { label: 'D', text: wrong3 }
    ]);

    const correctLabel = options.find(o => o.text === answer).label;

    return {
      problemId: `prob_defint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      skillId: 'definite-integrals',
      content,
      answer,
      correctOption: correctLabel,
      answerType: 'multiple-choice',
      options,
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

  // Fallback for higher powers (simplified version)
  const result = (coeff / (power + 1)) * (upper ** (power + 1) - lower ** (power + 1));
  const answer = Number.isInteger(result) ? String(result) : result.toFixed(2);
  const content = `∫₀${upper === 2 ? '²' : upper === 3 ? '³' : '¹'} ${coeff}x${power === 2 ? '²' : '³'} dx = ?`;

  const options = shuffle([
    { label: 'A', text: answer },
    { label: 'B', text: String(Math.round(result * 0.5)) },
    { label: 'C', text: String(Math.round(result * 2)) },
    { label: 'D', text: `${coeff}x${power}` }
  ]);

  const correctLabel = options.find(o => o.text === answer).label;

  return {
    problemId: `prob_defint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'definite-integrals',
    content,
    answer,
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options,
    irtParameters: {
      difficulty: difficulty + 0.8,
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

// ============================================================================
// FIXED: generateFrequencyTables - Now creates varied questions
// ============================================================================
function generateFrequencyTables(difficulty) {
  const colors = ['Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple'];
  const color = colors[randomInt(0, colors.length - 1)];
  const freq = randomInt(3, 12);

  const questions = [
    {
      content: `In a frequency table, if '${color}: ${freq}' appears, what does ${freq} represent?`,
      answer: 'how many times it appeared',
      wrongs: ['the color value', 'the percentage', 'the average']
    },
    {
      content: `A frequency table shows '${color}: ${freq}'. What does this mean?`,
      answer: `${color} appeared ${freq} times`,
      wrongs: [`${color} is worth ${freq} points`, `${freq}% were ${color}`, `average is ${freq}`]
    }
  ];

  const q = questions[randomInt(0, questions.length - 1)];
  const { content, answer, wrongs } = q;

  const options = shuffle([
    { label: 'A', text: String(answer) },
    { label: 'B', text: String(wrongs[0]) },
    { label: 'C', text: String(wrongs[1]) },
    { label: 'D', text: String(wrongs[2]) }
  ]);

  const correctLabel = options.find(o => o.text === String(answer)).label;

  return {
    problemId: `prob_freqtable_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    skillId: 'frequency-tables',
    content,
    answer: String(answer),
    correctOption: correctLabel,
    answerType: 'multiple-choice',
    options,
    irtParameters: {
      difficulty,
      discrimination: 1.0,
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },
    dokLevel: 2,
    metadata: {
      estimatedTime: 40,
      source: 'template',
      tags: ['data', 'frequency']
    },
    isActive: true
  };
}

// ============================================================================
// FIXED: generateMultiplyRationalExpressions - Now creates varied expressions
// ============================================================================
function generateMultiplyRationalExpressions(difficulty) {
  const num1 = randomInt(2, 6);
  const num2 = randomInt(2, 6);
  const denom1 = ['x', '2', '3', 'y'][randomInt(0, 3)];
  const denom2 = ['x', '2', '3', 'y'][randomInt(0, 3)];

  // Ensure we can simplify (x cancels)
  const useX = Math.random() > 0.5;

  let content, answer;

  if (useX) {
    // Form: (a/x) × (x/b) = a/b
    const a = randomInt(2, 6);
    const b = randomInt(2, 6);
    content = `Simplify: (${a}/x) × (x/${b})`;
    answer = `${a}/${b}`;

    const options = shuffle([
      { label: 'A', text: String(answer) },
      { label: 'B', text: String(`${a}x²/${b}`) },
      { label: 'C', text: String(`${a}/${b}x`) },
      { label: 'D', text: String(`x/${b}`) }
    ]);

    const correctLabel = options.find(o => o.text === String(answer)).label;

    return {
      problemId: `prob_multrational_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      skillId: 'multiply-rational-expressions',
      content,
      answer: String(answer),
      correctOption: correctLabel,
      answerType: 'multiple-choice',
      options,
      irtParameters: {
        difficulty: difficulty + 0.7,
        discrimination: 1.3,
        calibrationConfidence: 'expert',
        attemptsCount: 0
      },
      dokLevel: 3,
      metadata: {
        estimatedTime: 60,
        source: 'template',
        tags: ['rational', 'multiplication']
      },
      isActive: true
    };
  } else {
    // Form: (a/b) × (c/d) = (ac)/(bd)
    const a = randomInt(2, 5);
    const b = randomInt(2, 5);
    const c = randomInt(2, 5);
    const d = randomInt(2, 5);

    content = `Simplify: (${a}/${b}) × (${c}/${d})`;
    answer = `${a * c}/${b * d}`;

    const options = shuffle([
      { label: 'A', text: String(answer) },
      { label: 'B', text: String(`${a * c}/${d}`) },
      { label: 'C', text: String(`${a}/${b * d}`) },
      { label: 'D', text: String(`${c}/${b}`) }
    ]);

    const correctLabel = options.find(o => o.text === String(answer)).label;

    return {
      problemId: `prob_multrational_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      skillId: 'multiply-rational-expressions',
      content,
      answer: String(answer),
      correctOption: correctLabel,
      answerType: 'multiple-choice',
      options,
      irtParameters: {
        difficulty: difficulty + 0.5,
        discrimination: 1.3,
        calibrationConfidence: 'expert',
        attemptsCount: 0
      },
      dokLevel: 3,
      metadata: {
        estimatedTime: 60,
        source: 'template',
        tags: ['rational', 'multiplication']
      },
      isActive: true
    };
  }
}

// ============================================================================
// EXPORT
// ============================================================================
module.exports = {
  generateBoxPlots,
  generateStandardDeviation,
  generateDefiniteIntegrals,
  generateFrequencyTables,
  generateMultiplyRationalExpressions
};

// Test if run directly
if (require.main === module) {
  console.log('Testing fixed generators...\n');

  console.log('=== Box Plots (3 variations) ===');
  for (let i = 0; i < 3; i++) {
    const p = generateBoxPlots(-1 + i);
    console.log(`${p.content}`);
    console.log(`Answer: ${p.answer}\n`);
  }

  console.log('=== Standard Deviation (3 variations) ===');
  for (let i = 0; i < 3; i++) {
    const p = generateStandardDeviation(-1 + i);
    console.log(`${p.content}`);
    console.log(`Answer: ${p.answer}\n`);
  }

  console.log('=== Definite Integrals (3 variations) ===');
  for (let i = 0; i < 3; i++) {
    const p = generateDefiniteIntegrals(-1 + i);
    console.log(`${p.content}`);
    console.log(`Answer: ${p.answer}\n`);
  }

  console.log('=== Frequency Tables (3 variations) ===');
  for (let i = 0; i < 3; i++) {
    const p = generateFrequencyTables(-1 + i);
    console.log(`${p.content.substring(0, 80)}...`);
    console.log(`Answer: ${p.answer.substring(0, 40)}\n`);
  }

  console.log('=== Multiply Rational Expressions (3 variations) ===');
  for (let i = 0; i < 3; i++) {
    const p = generateMultiplyRationalExpressions(-1 + i);
    console.log(`${p.content}`);
    console.log(`Answer: ${p.answer}\n`);
  }
}
