/**
 * PROBLEM GENERATOR
 *
 * Generates complete MC problems for all skills needing coverage.
 * This actually creates the problems - not templates.
 *
 * Run: node scripts/generateProblems.js
 * Output: docs/generated-problems.json
 */

const fs = require('fs');
const crypto = require('crypto');

const skills = JSON.parse(fs.readFileSync('./docs/mathmatixdb.skills.json', 'utf8'));
const existingProblems = JSON.parse(fs.readFileSync('./docs/problems-deduped.json', 'utf8'));
const workList = JSON.parse(fs.readFileSync('./docs/generation-worklist.json', 'utf8'));

// Track existing prompts to avoid duplicates
const existingPrompts = new Set(existingProblems.map(p => p.prompt.trim().toLowerCase()));

function uuid() {
  return crypto.randomUUID();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Generate wrong answers that are plausible
function wrongAnswers(correct, type, count = 3) {
  const wrongs = [];

  if (type === 'integer') {
    const c = parseInt(correct);
    const offsets = shuffle([-2, -1, 1, 2, -3, 3, -5, 5, 10, -10]);
    for (const off of offsets) {
      if (wrongs.length >= count) break;
      const w = c + off;
      if (w !== c && w >= 0) wrongs.push(String(w));
    }
  } else if (type === 'fraction') {
    // For fractions, create similar-looking fractions
    const parts = correct.split('/');
    if (parts.length === 2) {
      const [num, den] = parts.map(Number);
      const candidates = [
        `${num + 1}/${den}`,
        `${num - 1}/${den}`,
        `${num}/${den + 1}`,
        `${num}/${den - 1}`,
        `${num + 2}/${den}`,
        `${den}/${num}`, // common mistake: flip
      ].filter(f => f !== correct && !f.includes('/0') && !f.includes('-'));
      wrongs.push(...candidates.slice(0, count));
    }
  } else if (type === 'decimal') {
    const c = parseFloat(correct);
    const offsets = [0.1, -0.1, 0.5, -0.5, 1, -1, 0.01, -0.01];
    for (const off of offsets) {
      if (wrongs.length >= count) break;
      const w = (c + off).toFixed(2);
      if (w !== correct) wrongs.push(w);
    }
  } else if (type === 'expression') {
    // For algebraic expressions, provide common mistakes
    wrongs.push(...['x + 1', '2x', 'x - 1', 'x²', '3x'].slice(0, count));
  }

  while (wrongs.length < count) {
    wrongs.push(`Wrong ${wrongs.length + 1}`);
  }

  return wrongs.slice(0, count);
}

function createMCProblem(skillId, prompt, correctAnswer, wrongOptions, difficulty, gradeBand, category, tags = []) {
  // Shuffle options
  const allOptions = shuffle([correctAnswer, ...wrongOptions]);
  const correctIndex = allOptions.indexOf(correctAnswer);
  const correctLetter = ['A', 'B', 'C', 'D'][correctIndex];

  return {
    problemId: uuid(),
    skillId,
    secondarySkillIds: [],
    prompt,
    answer: {
      type: 'auto',
      value: correctLetter,
      equivalents: [correctLetter, correctAnswer]
    },
    answerType: 'multiple-choice',
    difficulty,
    gradeBand,
    ohioDomain: category,
    tags,
    isActive: true,
    source: 'generated-2026-02',
    options: allOptions.map((opt, i) => ({
      letter: ['A', 'B', 'C', 'D'][i],
      text: opt,
      isCorrect: i === correctIndex
    })),
    createdAt: { $date: new Date().toISOString() },
    updatedAt: { $date: new Date().toISOString() }
  };
}

// ============================================================================
// PROBLEM GENERATORS BY SKILL
// ============================================================================

const generators = {
  // ==========================================================================
  // BASIC OPERATIONS (K-5)
  // ==========================================================================

  'addition-within-100': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const a = Math.floor(Math.random() * 50) + 10;
      const b = Math.floor(Math.random() * (100 - a - 10)) + 5;
      const correct = a + b;
      const prompt = `${a} + ${b} = ?`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'addition-within-100', prompt, String(correct),
          wrongAnswers(correct, 'integer'), 1, 'K-5', 'Operations', ['addition']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'subtraction-within-100': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const a = Math.floor(Math.random() * 50) + 40;
      const b = Math.floor(Math.random() * (a - 10)) + 5;
      const correct = a - b;
      const prompt = `${a} - ${b} = ?`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'subtraction-within-100', prompt, String(correct),
          wrongAnswers(correct, 'integer'), 1, 'K-5', 'Operations', ['subtraction']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'addition-within-10': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const a = Math.floor(Math.random() * 5) + 1;
      const b = Math.floor(Math.random() * (10 - a)) + 1;
      const correct = a + b;
      const prompt = `${a} + ${b} = ?`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'addition-within-10', prompt, String(correct),
          wrongAnswers(correct, 'integer'), 1, 'K-5', 'Operations', ['addition']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'operations': (count) => {
    const problems = [];
    const ops = [
      { sym: '+', fn: (a, b) => a + b },
      { sym: '-', fn: (a, b) => a - b },
      { sym: '×', fn: (a, b) => a * b },
    ];
    for (let i = 0; i < count; i++) {
      const op = ops[i % 3];
      let a, b, correct;
      if (op.sym === '×') {
        a = Math.floor(Math.random() * 10) + 2;
        b = Math.floor(Math.random() * 10) + 2;
      } else if (op.sym === '-') {
        a = Math.floor(Math.random() * 50) + 20;
        b = Math.floor(Math.random() * a) + 1;
      } else {
        a = Math.floor(Math.random() * 50) + 10;
        b = Math.floor(Math.random() * 50) + 10;
      }
      correct = op.fn(a, b);
      const prompt = `${a} ${op.sym} ${b} = ?`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'operations', prompt, String(correct),
          wrongAnswers(correct, 'integer'), 2, 'K-5', 'Operations', ['operations']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'unit-rates': (count) => {
    const problems = [];
    const scenarios = [
      { item: 'apples', unit: 'bag', counts: [6, 8, 12, 10, 15], prices: [3, 4, 6, 5, 7.50] },
      { item: 'miles', unit: 'hour', counts: [60, 120, 90, 150, 180], prices: [1, 2, 1.5, 2.5, 3] },
      { item: 'pages', unit: 'minute', counts: [5, 10, 15, 20, 25], prices: [1, 2, 3, 4, 5] },
    ];
    for (let i = 0; i < count; i++) {
      const s = scenarios[i % scenarios.length];
      const idx = Math.floor(Math.random() * s.counts.length);
      const total = s.counts[idx];
      const units = s.prices[idx];
      const rate = total / units;
      const prompt = `If you travel ${total} ${s.item} in ${units} ${s.unit}${units !== 1 ? 's' : ''}, what is the rate per ${s.unit}?`;
      const correct = `${rate} ${s.item} per ${s.unit}`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'unit-rates', prompt, correct,
          [`${rate + 10} ${s.item} per ${s.unit}`, `${rate - 5} ${s.item} per ${s.unit}`, `${Math.round(rate / 2)} ${s.item} per ${s.unit}`],
          2, 'K-5', 'Ratios & Proportions', ['rates', 'ratios']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'square-cube-roots': (count) => {
    const problems = [];
    const squares = [4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144];
    const cubes = [8, 27, 64, 125, 216];
    for (let i = 0; i < count; i++) {
      if (i % 2 === 0) {
        const n = squares[i % squares.length];
        const correct = Math.sqrt(n);
        const prompt = `√${n} = ?`;
        if (!existingPrompts.has(prompt.toLowerCase())) {
          problems.push(createMCProblem(
            'square-cube-roots', prompt, String(correct),
            wrongAnswers(correct, 'integer'), 2, 'K-5', 'Operations', ['roots', 'squares']
          ));
          existingPrompts.add(prompt.toLowerCase());
        }
      } else {
        const n = cubes[i % cubes.length];
        const correct = Math.round(Math.cbrt(n));
        const prompt = `∛${n} = ?`;
        if (!existingPrompts.has(prompt.toLowerCase())) {
          problems.push(createMCProblem(
            'square-cube-roots', prompt, String(correct),
            wrongAnswers(correct, 'integer'), 3, 'K-5', 'Operations', ['roots', 'cubes']
          ));
          existingPrompts.add(prompt.toLowerCase());
        }
      }
    }
    return problems;
  },

  'exponent-properties': (count) => {
    const problems = [];
    const bases = [2, 3, 5, 10];
    for (let i = 0; i < count; i++) {
      const type = i % 4;
      const base = bases[i % bases.length];
      let prompt, correct;

      if (type === 0) {
        // Product rule: a^m * a^n = a^(m+n)
        const m = Math.floor(Math.random() * 3) + 2;
        const n = Math.floor(Math.random() * 3) + 1;
        prompt = `Simplify: ${base}^${m} × ${base}^${n}`;
        correct = `${base}^${m + n}`;
      } else if (type === 1) {
        // Quotient rule
        const m = Math.floor(Math.random() * 3) + 4;
        const n = Math.floor(Math.random() * 2) + 1;
        prompt = `Simplify: ${base}^${m} ÷ ${base}^${n}`;
        correct = `${base}^${m - n}`;
      } else if (type === 2) {
        // Power rule
        const m = 2;
        const n = Math.floor(Math.random() * 2) + 2;
        prompt = `Simplify: (${base}^${m})^${n}`;
        correct = `${base}^${m * n}`;
      } else {
        // Evaluate
        const exp = Math.floor(Math.random() * 3) + 2;
        prompt = `Evaluate: ${base}^${exp}`;
        correct = String(Math.pow(base, exp));
      }

      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'exponent-properties', prompt, correct,
          type === 3 ? wrongAnswers(correct, 'integer') : [`${base}^${Math.floor(Math.random() * 5) + 1}`, `${base}^${Math.floor(Math.random() * 5) + 6}`, `${base * 2}^2`],
          3, 'K-5', 'Expressions & Equations', ['exponents']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'financial-literacy': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const type = i % 3;
      let prompt, correct, wrongs;

      if (type === 0) {
        // Simple interest
        const principal = [100, 200, 500, 1000][i % 4];
        const rate = [5, 10, 8, 6][i % 4];
        const years = [1, 2, 3][i % 3];
        const interest = (principal * rate * years) / 100;
        prompt = `Calculate simple interest: Principal = $${principal}, Rate = ${rate}%, Time = ${years} year${years > 1 ? 's' : ''}`;
        correct = `$${interest}`;
        wrongs = [`$${interest + 10}`, `$${interest - 5}`, `$${principal}`];
      } else if (type === 1) {
        // Percent discount
        const price = [50, 80, 100, 120][i % 4];
        const discount = [10, 20, 25, 15][i % 4];
        const savings = price * discount / 100;
        const final = price - savings;
        prompt = `A $${price} item is ${discount}% off. What is the sale price?`;
        correct = `$${final}`;
        wrongs = [`$${price - discount}`, `$${savings}`, `$${price + savings}`];
      } else {
        // Tax calculation
        const price = [40, 60, 80, 100][i % 4];
        const tax = [5, 8, 10, 6][i % 4];
        const taxAmt = price * tax / 100;
        const total = price + taxAmt;
        prompt = `A $${price} item has ${tax}% sales tax. What is the total cost?`;
        correct = `$${total}`;
        wrongs = [`$${price + tax}`, `$${taxAmt}`, `$${price}`];
      }

      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'financial-literacy', prompt, correct, wrongs,
          2, 'K-5', 'Ratios & Proportions', ['money', 'percent']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'precalculus': (count) => {
    // This seems misplaced in K-5, but generating anyway
    const problems = [];
    for (let i = 0; i < count; i++) {
      const a = Math.floor(Math.random() * 5) + 2;
      const b = Math.floor(Math.random() * 10) + 1;
      const prompt = `If f(x) = ${a}x + ${b}, find f(3).`;
      const correct = String(a * 3 + b);
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'precalculus', prompt, correct,
          wrongAnswers(correct, 'integer'), 3, 'K-5', 'Functions', ['functions']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  // ==========================================================================
  // FRACTIONS (5-8)
  // ==========================================================================

  'adding-fractions-different-denominators': (count) => {
    const problems = [];
    const pairs = [
      ['1/2', '1/4', '3/4'],
      ['1/3', '1/6', '1/2'],
      ['2/3', '1/6', '5/6'],
      ['1/4', '1/8', '3/8'],
      ['3/4', '1/8', '7/8'],
      ['1/2', '1/3', '5/6'],
      ['2/5', '1/10', '1/2'],
      ['1/3', '1/4', '7/12'],
      ['2/3', '1/4', '11/12'],
      ['3/5', '1/10', '7/10'],
      ['1/6', '1/3', '1/2'],
      ['1/4', '2/8', '1/2'],
      ['5/6', '1/12', '11/12'],
      ['1/2', '2/5', '9/10'],
      ['3/8', '1/4', '5/8'],
    ];
    for (let i = 0; i < count && i < pairs.length; i++) {
      const [a, b, ans] = pairs[i];
      const prompt = `Add: ${a} + ${b}`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'adding-fractions-different-denominators', prompt, ans,
          wrongAnswers(ans, 'fraction'), 3, '5-8', 'Number & Operations—Fractions', ['fractions', 'addition']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'adding-fractions-same-denominator': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const den = [4, 5, 6, 8, 10][i % 5];
      const a = Math.floor(Math.random() * (den - 2)) + 1;
      const b = Math.floor(Math.random() * (den - a - 1)) + 1;
      const sum = a + b;
      const prompt = `Add: ${a}/${den} + ${b}/${den}`;
      const correct = sum < den ? `${sum}/${den}` : (sum === den ? '1' : `${sum}/${den}`);
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'adding-fractions-same-denominator', prompt, correct,
          wrongAnswers(correct, 'fraction'), 2, '5-8', 'Number & Operations—Fractions', ['fractions', 'addition']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'fractions-basics': (count) => {
    const problems = [];
    const questions = [
      { q: 'What fraction of the circle is shaded if 3 out of 4 equal parts are shaded?', a: '3/4' },
      { q: 'Express 0.5 as a fraction in lowest terms.', a: '1/2' },
      { q: 'What is the numerator in the fraction 5/8?', a: '5' },
      { q: 'What is the denominator in the fraction 3/7?', a: '7' },
      { q: 'If a pizza is cut into 8 equal slices and you eat 3, what fraction did you eat?', a: '3/8' },
      { q: 'Express 25% as a fraction in lowest terms.', a: '1/4' },
      { q: 'What fraction is equivalent to 2/4?', a: '1/2' },
      { q: 'A rectangle is divided into 5 equal parts. 2 parts are shaded. What fraction is shaded?', a: '2/5' },
      { q: 'Express 0.75 as a fraction.', a: '3/4' },
      { q: 'What is 1/2 of 10?', a: '5' },
      { q: 'What fraction of 12 is 4?', a: '1/3' },
      { q: 'If 6 out of 10 students are girls, what fraction are girls?', a: '3/5' },
      { q: 'Express 0.2 as a fraction in lowest terms.', a: '1/5' },
      { q: 'What is 1/4 of 20?', a: '5' },
      { q: 'Convert 50% to a fraction in lowest terms.', a: '1/2' },
    ];
    for (let i = 0; i < count && i < questions.length; i++) {
      const { q, a } = questions[i];
      if (!existingPrompts.has(q.toLowerCase())) {
        const isNumeric = !a.includes('/');
        problems.push(createMCProblem(
          'fractions-basics', q, a,
          isNumeric ? wrongAnswers(a, 'integer') : wrongAnswers(a, 'fraction'),
          2, '5-8', 'Number & Operations—Fractions', ['fractions']
        ));
        existingPrompts.add(q.toLowerCase());
      }
    }
    return problems;
  },

  'equivalent-fractions': (count) => {
    const problems = [];
    const fracs = [
      { orig: '1/2', equiv: ['2/4', '3/6', '4/8', '5/10'] },
      { orig: '1/3', equiv: ['2/6', '3/9', '4/12'] },
      { orig: '2/3', equiv: ['4/6', '6/9', '8/12'] },
      { orig: '1/4', equiv: ['2/8', '3/12', '4/16'] },
      { orig: '3/4', equiv: ['6/8', '9/12', '12/16'] },
      { orig: '1/5', equiv: ['2/10', '3/15', '4/20'] },
      { orig: '2/5', equiv: ['4/10', '6/15', '8/20'] },
    ];
    for (let i = 0; i < count; i++) {
      const f = fracs[i % fracs.length];
      const eq = f.equiv[i % f.equiv.length];
      const prompt = `Which fraction is equivalent to ${f.orig}?`;
      // Wrong answers: fractions that look similar but aren't equivalent
      const wrongs = ['3/7', '5/9', '2/7'].filter(w => w !== eq);
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'equivalent-fractions', prompt, eq,
          wrongs.slice(0, 3), 2, '5-8', 'Number & Operations—Fractions', ['fractions', 'equivalence']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'comparing-fractions': (count) => {
    const problems = [];
    const comparisons = [
      { a: '1/2', b: '1/3', ans: '1/2 > 1/3' },
      { a: '2/5', b: '3/5', ans: '2/5 < 3/5' },
      { a: '3/4', b: '2/3', ans: '3/4 > 2/3' },
      { a: '1/4', b: '1/2', ans: '1/4 < 1/2' },
      { a: '5/6', b: '4/5', ans: '5/6 > 4/5' },
      { a: '2/3', b: '3/4', ans: '2/3 < 3/4' },
      { a: '1/8', b: '1/6', ans: '1/8 < 1/6' },
      { a: '7/10', b: '3/5', ans: '7/10 > 3/5' },
      { a: '2/7', b: '3/7', ans: '2/7 < 3/7' },
      { a: '5/8', b: '1/2', ans: '5/8 > 1/2' },
      { a: '4/9', b: '1/2', ans: '4/9 < 1/2' },
      { a: '3/8', b: '1/4', ans: '3/8 > 1/4' },
      { a: '2/9', b: '1/3', ans: '2/9 < 1/3' },
      { a: '5/12', b: '1/3', ans: '5/12 > 1/3' },
      { a: '7/8', b: '6/7', ans: '7/8 > 6/7' },
    ];
    for (let i = 0; i < count && i < comparisons.length; i++) {
      const c = comparisons[i];
      const prompt = `Compare: ${c.a} ___ ${c.b}`;
      const wrongOps = c.ans.includes('>') ? ['<', '='] : c.ans.includes('<') ? ['>', '='] : ['<', '>'];
      const wrongs = wrongOps.map(op => c.a + ' ' + op + ' ' + c.b);
      wrongs.push('Cannot compare');
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'comparing-fractions', prompt, c.ans,
          wrongs.slice(0, 3), 2, '5-8', 'Number & Operations—Fractions', ['fractions', 'comparison']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  // ==========================================================================
  // DECIMALS (5-8)
  // ==========================================================================

  'decimals-place-value': (count) => {
    const problems = [];
    const questions = [
      { q: 'In 45.678, what digit is in the tenths place?', a: '6' },
      { q: 'In 123.456, what digit is in the hundredths place?', a: '5' },
      { q: 'In 7.089, what digit is in the thousandths place?', a: '9' },
      { q: 'What is the value of the 3 in 2.35?', a: '0.3 or 3 tenths' },
      { q: 'In 56.12, what place is the 1 in?', a: 'tenths' },
      { q: 'In 0.847, what digit is in the tenths place?', a: '8' },
      { q: 'What is the place value of 5 in 12.345?', a: 'thousandths' },
      { q: 'In 9.024, which digit is in the hundredths place?', a: '2' },
      { q: 'Express 0.7 in words.', a: 'seven tenths' },
      { q: 'In 34.567, the 5 represents how many hundredths?', a: '50' },
      { q: 'What digit is in the ones place of 123.45?', a: '3' },
      { q: 'In 0.908, which digit is in the tenths place?', a: '9' },
      { q: 'The 4 in 2.004 is in which place?', a: 'thousandths' },
      { q: 'In 15.62, the 2 is in which place?', a: 'hundredths' },
      { q: 'What is 0.05 in words?', a: 'five hundredths' },
    ];
    for (let i = 0; i < count && i < questions.length; i++) {
      const { q, a } = questions[i];
      if (!existingPrompts.has(q.toLowerCase())) {
        problems.push(createMCProblem(
          'decimals-place-value', q, a,
          ['ones', 'tens', 'hundreds'].includes(a) ? ['tenths', 'hundredths', 'thousandths'] :
          ['tenths', 'hundredths', 'thousandths'].includes(a) ? ['ones', 'tens', a === 'tenths' ? 'hundredths' : 'tenths'] :
          wrongAnswers(a, 'integer'),
          2, '5-8', 'The Number System', ['decimals', 'place-value']
        ));
        existingPrompts.add(q.toLowerCase());
      }
    }
    return problems;
  },

  'decimals-add-subtract': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const isAdd = i % 2 === 0;
      const a = (Math.random() * 10 + 1).toFixed(2);
      const b = (Math.random() * 5 + 0.5).toFixed(2);
      const correct = isAdd ?
        (parseFloat(a) + parseFloat(b)).toFixed(2) :
        (parseFloat(a) - parseFloat(b)).toFixed(2);
      const prompt = isAdd ? `${a} + ${b} = ?` : `${a} - ${b} = ?`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'decimals-add-subtract', prompt, correct,
          wrongAnswers(correct, 'decimal'), 2, '5-8', 'The Number System', ['decimals', isAdd ? 'addition' : 'subtraction']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'decimals-multiply': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const a = (Math.random() * 5 + 1).toFixed(1);
      const b = (Math.random() * 3 + 0.5).toFixed(1);
      const correct = (parseFloat(a) * parseFloat(b)).toFixed(2);
      const prompt = `${a} × ${b} = ?`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'decimals-multiply', prompt, correct,
          wrongAnswers(correct, 'decimal'), 3, '5-8', 'The Number System', ['decimals', 'multiplication']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'decimals-divide': (count) => {
    const problems = [];
    // Use clean divisions
    const pairs = [
      [4.5, 1.5, '3'], [6.4, 0.8, '8'], [7.2, 0.9, '8'], [2.5, 0.5, '5'],
      [3.6, 1.2, '3'], [8.1, 0.9, '9'], [4.8, 0.6, '8'], [5.5, 1.1, '5'],
      [9.6, 1.2, '8'], [6.3, 0.7, '9'], [2.4, 0.4, '6'], [7.5, 2.5, '3'],
      [8.4, 1.4, '6'], [3.2, 0.8, '4'], [5.4, 0.6, '9'],
    ];
    for (let i = 0; i < count && i < pairs.length; i++) {
      const [a, b, ans] = pairs[i];
      const prompt = `${a} ÷ ${b} = ?`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'decimals-divide', prompt, ans,
          wrongAnswers(ans, 'integer'), 3, '5-8', 'The Number System', ['decimals', 'division']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'decimals-rounding': (count) => {
    const problems = [];
    const rounds = [
      { n: '3.456', place: 'tenths', ans: '3.5' },
      { n: '7.823', place: 'hundredths', ans: '7.82' },
      { n: '12.345', place: 'tenths', ans: '12.3' },
      { n: '0.678', place: 'tenths', ans: '0.7' },
      { n: '5.555', place: 'hundredths', ans: '5.56' },
      { n: '9.994', place: 'tenths', ans: '10.0' },
      { n: '4.149', place: 'hundredths', ans: '4.15' },
      { n: '8.065', place: 'tenths', ans: '8.1' },
      { n: '2.999', place: 'hundredths', ans: '3.00' },
      { n: '6.745', place: 'hundredths', ans: '6.75' },
      { n: '1.234', place: 'ones', ans: '1' },
      { n: '15.678', place: 'tenths', ans: '15.7' },
      { n: '0.0456', place: 'hundredths', ans: '0.05' },
      { n: '3.895', place: 'tenths', ans: '3.9' },
      { n: '7.777', place: 'hundredths', ans: '7.78' },
    ];
    for (let i = 0; i < count && i < rounds.length; i++) {
      const r = rounds[i];
      const prompt = `Round ${r.n} to the nearest ${r.place}.`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'decimals-rounding', prompt, r.ans,
          wrongAnswers(r.ans, 'decimal'), 2, '5-8', 'The Number System', ['decimals', 'rounding']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  // ==========================================================================
  // INTEGERS (5-8)
  // ==========================================================================

  'adding-subtracting-integers': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const a = Math.floor(Math.random() * 20) - 10;
      const b = Math.floor(Math.random() * 20) - 10;
      const isAdd = i % 2 === 0;
      const correct = isAdd ? a + b : a - b;
      const prompt = isAdd ? `${a} + (${b}) = ?` : `${a} - (${b}) = ?`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'adding-subtracting-integers', prompt, String(correct),
          wrongAnswers(correct, 'integer'), 2, '5-8', 'The Number System', ['integers']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'multiplying-dividing-integers': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const isMult = i % 2 === 0;
      if (isMult) {
        const a = Math.floor(Math.random() * 10) - 5;
        const b = Math.floor(Math.random() * 10) - 5;
        const correct = a * b;
        const prompt = `(${a}) × (${b}) = ?`;
        if (!existingPrompts.has(prompt.toLowerCase())) {
          problems.push(createMCProblem(
            'multiplying-dividing-integers', prompt, String(correct),
            wrongAnswers(correct, 'integer'), 2, '5-8', 'The Number System', ['integers', 'multiplication']
          ));
          existingPrompts.add(prompt.toLowerCase());
        }
      } else {
        // Clean division
        const divisors = [[-12, -3, '4'], [15, -5, '-3'], [-20, 4, '-5'], [-18, -6, '3'], [24, -8, '-3']];
        const [a, b, ans] = divisors[i % divisors.length];
        const prompt = `(${a}) ÷ (${b}) = ?`;
        if (!existingPrompts.has(prompt.toLowerCase())) {
          problems.push(createMCProblem(
            'multiplying-dividing-integers', prompt, ans,
            wrongAnswers(ans, 'integer'), 2, '5-8', 'The Number System', ['integers', 'division']
          ));
          existingPrompts.add(prompt.toLowerCase());
        }
      }
    }
    return problems;
  },

  'irrational-numbers': (count) => {
    const problems = [];
    const questions = [
      { q: 'Which number is irrational?', a: '√2', wrongs: ['1/2', '0.5', '4'] },
      { q: 'Is π rational or irrational?', a: 'irrational', wrongs: ['rational', 'integer', 'whole number'] },
      { q: 'Which is a rational number?', a: '0.75', wrongs: ['√3', 'π', '√5'] },
      { q: 'Classify √9:', a: 'rational', wrongs: ['irrational', 'undefined', 'imaginary'] },
      { q: 'Which number is irrational?', a: '√7', wrongs: ['√4', '√9', '√16'] },
      { q: 'Is 0.333... (repeating) rational?', a: 'Yes, it equals 1/3', wrongs: ['No, it never ends', 'No, it\'s irrational', 'Cannot determine'] },
      { q: 'Which is irrational?', a: '√11', wrongs: ['11/2', '2.75', '√25'] },
      { q: 'Classify 22/7:', a: 'rational', wrongs: ['irrational', 'equal to π', 'undefined'] },
      { q: 'Which statement is true about √2?', a: 'It cannot be written as a fraction', wrongs: ['It equals 1.41', 'It is rational', 'It equals 2/√2'] },
      { q: 'Is 0.12122122212222... irrational?', a: 'Yes, the pattern doesn\'t repeat', wrongs: ['No, it has a pattern', 'No, it\'s rational', 'Cannot determine'] },
      { q: 'Which is between 3 and 4?', a: '√10', wrongs: ['√4', '√16', '√25'] },
      { q: 'Approximate √50 to nearest integer:', a: '7', wrongs: ['6', '8', '5'] },
      { q: 'Which number is rational?', a: '√100', wrongs: ['√101', '√99', 'π'] },
      { q: 'Is e (Euler\'s number) rational?', a: 'No, it\'s irrational', wrongs: ['Yes', 'Only approximately', 'It\'s imaginary'] },
      { q: 'Between which integers does √20 lie?', a: '4 and 5', wrongs: ['3 and 4', '5 and 6', '2 and 3'] },
    ];
    for (let i = 0; i < count && i < questions.length; i++) {
      const q = questions[i];
      if (!existingPrompts.has(q.q.toLowerCase())) {
        problems.push(createMCProblem(
          'irrational-numbers', q.q, q.a, q.wrongs,
          3, '5-8', 'The Number System', ['number-system', 'irrational']
        ));
        existingPrompts.add(q.q.toLowerCase());
      }
    }
    return problems;
  },

  // ==========================================================================
  // RATIOS & PROPORTIONS (5-8)
  // ==========================================================================

  'ratio-tables': (count) => {
    const problems = [];
    const tables = [
      { x: [1, 2, 3, 4], y: [3, 6, 9, '?'], ans: '12' },
      { x: [2, 4, 6, 8], y: [5, 10, 15, '?'], ans: '20' },
      { x: [1, 3, 5, 7], y: [4, 12, 20, '?'], ans: '28' },
      { x: [5, 10, 15, 20], y: [2, 4, 6, '?'], ans: '8' },
      { x: [3, 6, 9, '?'], y: [7, 14, 21, 28], ans: '12' },
      { x: [4, 8, '?', 16], y: [3, 6, 9, 12], ans: '12' },
      { x: [2, 4, 6, 8], y: [7, 14, 21, '?'], ans: '28' },
      { x: [1, 2, 3, 4], y: [5, 10, 15, '?'], ans: '20' },
      { x: [6, 12, 18, 24], y: [1, 2, 3, '?'], ans: '4' },
      { x: [3, 6, 9, 12], y: [8, 16, 24, '?'], ans: '32' },
    ];
    for (let i = 0; i < count && i < tables.length; i++) {
      const t = tables[i];
      const prompt = `Complete the ratio table: x = [${t.x.join(', ')}], y = [${t.y.join(', ')}]. Find the missing value.`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'ratio-tables', prompt, t.ans,
          wrongAnswers(t.ans, 'integer'), 2, '5-8', 'Ratios & Proportional Relationships', ['ratios', 'tables']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'proportional-relationships': (count) => {
    const problems = [];
    const questions = [
      { q: 'If 3 apples cost $6, how much do 5 apples cost?', a: '$10' },
      { q: 'A car travels 150 miles in 3 hours. How far in 5 hours at the same rate?', a: '250 miles' },
      { q: 'If 4 workers can build a wall in 6 days, how many days for 8 workers?', a: '3 days' },
      { q: '2 pizzas feed 6 people. How many pizzas for 15 people?', a: '5 pizzas' },
      { q: 'The ratio of boys to girls is 3:4. If there are 12 boys, how many girls?', a: '16' },
      { q: 'A recipe uses 2 cups flour for 24 cookies. How much for 36 cookies?', a: '3 cups' },
      { q: 'If y varies directly with x, and y=15 when x=3, find y when x=7.', a: '35' },
      { q: '8 pencils cost $4. What is the cost of 12 pencils?', a: '$6' },
      { q: 'A map scale is 1 inch = 50 miles. What distance is 3.5 inches?', a: '175 miles' },
      { q: 'If 5 machines produce 100 items in 2 hours, how many items do 8 machines produce?', a: '160 items' },
      { q: 'The ratio of cats to dogs is 5:3. If there are 24 animals total, how many cats?', a: '15' },
      { q: 'A $40 shirt is 20% off. What is the sale price?', a: '$32' },
      { q: 'If y = kx and y = 12 when x = 4, find k.', a: '3' },
      { q: '6 gallons of gas costs $24. How much for 10 gallons?', a: '$40' },
      { q: 'A shadow of 4 ft comes from a 6 ft pole. How tall is a tree with 10 ft shadow?', a: '15 ft' },
    ];
    for (let i = 0; i < count && i < questions.length; i++) {
      const q = questions[i];
      if (!existingPrompts.has(q.q.toLowerCase())) {
        const isNumber = /^\d+$/.test(q.a.replace(/[^0-9]/g, ''));
        problems.push(createMCProblem(
          'proportional-relationships', q.q, q.a,
          q.a.includes('$') ? [`$${parseInt(q.a.slice(1)) + 5}`, `$${parseInt(q.a.slice(1)) - 3}`, `$${parseInt(q.a.slice(1)) * 2}`] :
          q.a.includes('miles') ? [`${parseInt(q.a) + 50} miles`, `${parseInt(q.a) - 25} miles`, `${parseInt(q.a) * 2} miles`] :
          wrongAnswers(q.a.replace(/[^0-9.-]/g, ''), 'integer').map(w => q.a.replace(/[0-9.]+/, w)),
          3, '5-8', 'Ratios & Proportional Relationships', ['proportions']
        ));
        existingPrompts.add(q.q.toLowerCase());
      }
    }
    return problems;
  },

  'percent-problems': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const type = i % 3;
      let prompt, correct, wrongs;

      if (type === 0) {
        // Find percent of number
        const whole = [50, 80, 120, 200, 250][i % 5];
        const pct = [10, 20, 25, 50, 75][i % 5];
        correct = String(whole * pct / 100);
        prompt = `What is ${pct}% of ${whole}?`;
        wrongs = wrongAnswers(correct, 'integer');
      } else if (type === 1) {
        // Find what percent
        const part = [15, 24, 30, 45, 60][i % 5];
        const whole = [60, 80, 120, 90, 200][i % 5];
        correct = String(Math.round(part / whole * 100)) + '%';
        prompt = `${part} is what percent of ${whole}?`;
        wrongs = [`${Math.round(part / whole * 100) + 10}%`, `${Math.round(part / whole * 100) - 5}%`, `${Math.round(whole / part)}%`];
      } else {
        // Find the whole
        const part = [20, 30, 45, 16, 36][i % 5];
        const pct = [25, 50, 75, 20, 60][i % 5];
        correct = String(part / (pct / 100));
        prompt = `${part} is ${pct}% of what number?`;
        wrongs = wrongAnswers(correct, 'integer');
      }

      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'percent-problems', prompt, correct, wrongs,
          2, '5-8', 'Ratios & Proportional Relationships', ['percent']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  // ==========================================================================
  // EQUATIONS (8-12)
  // ==========================================================================

  'one-step-equations-addition': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * 15) + 1;
      const b = Math.floor(Math.random() * 20) + 5;
      const c = x + b;
      const prompt = `Solve: x + ${b} = ${c}`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'one-step-equations-addition', prompt, `x = ${x}`,
          [`x = ${x + 2}`, `x = ${x - 1}`, `x = ${c}`], 2, '8-12', 'Expressions & Equations', ['equations', 'one-step']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'solving-equations': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * 10) + 1;
      const a = Math.floor(Math.random() * 5) + 2;
      const b = Math.floor(Math.random() * 10) + 1;
      const c = a * x + b;
      const prompt = `Solve: ${a}x + ${b} = ${c}`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'solving-equations', prompt, `x = ${x}`,
          [`x = ${x + 1}`, `x = ${x - 1}`, `x = ${Math.round(c / a)}`], 3, '8-12', 'Expressions & Equations', ['equations', 'two-step']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'solving-linear-equations': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * 8) + 1;
      const a = Math.floor(Math.random() * 4) + 2;
      const b = Math.floor(Math.random() * 10) - 5;
      const c = Math.floor(Math.random() * 3) + 1;
      const d = a * x + b - c * x;
      const prompt = `Solve: ${a}x + ${b} = ${c}x + ${d}`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'solving-linear-equations', prompt, `x = ${x}`,
          [`x = ${x + 2}`, `x = ${-x}`, `x = ${x * 2}`], 3, '8-12', 'Expressions & Equations', ['equations', 'linear']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'linear-equations': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const m = [2, 3, -1, 4, -2][i % 5];
      const b = [-3, 5, 2, -1, 4][i % 5];
      const x = [1, 2, -1, 3, 0][i % 5];
      const y = m * x + b;
      const prompt = `If y = ${m}x ${b >= 0 ? '+' : ''} ${b}, find y when x = ${x}.`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'linear-equations', prompt, `y = ${y}`,
          [`y = ${y + 2}`, `y = ${y - 3}`, `y = ${-y}`], 2, '8-12', 'Functions', ['linear', 'equations']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  // ==========================================================================
  // EXPRESSIONS (8-12)
  // ==========================================================================

  'writing-expressions': (count) => {
    const problems = [];
    const translations = [
      { phrase: 'Three more than a number x', expr: 'x + 3' },
      { phrase: 'Five less than twice a number y', expr: '2y - 5' },
      { phrase: 'The product of 4 and a number n', expr: '4n' },
      { phrase: 'A number divided by 6', expr: 'x/6 or x ÷ 6' },
      { phrase: 'Seven subtracted from a number', expr: 'x - 7' },
      { phrase: 'The sum of a number and 10', expr: 'x + 10' },
      { phrase: 'Twice a number decreased by 3', expr: '2x - 3' },
      { phrase: 'The quotient of a number and 5', expr: 'x/5' },
      { phrase: 'Four times the sum of x and 2', expr: '4(x + 2)' },
      { phrase: 'Half of a number plus 8', expr: 'x/2 + 8' },
      { phrase: 'A number squared minus 4', expr: 'x² - 4' },
      { phrase: 'Three times a number increased by 7', expr: '3x + 7' },
      { phrase: 'The difference of 15 and a number', expr: '15 - x' },
      { phrase: 'Eight more than the product of 5 and x', expr: '5x + 8' },
      { phrase: 'Twice the difference of a number and 6', expr: '2(x - 6)' },
    ];
    for (let i = 0; i < count && i < translations.length; i++) {
      const t = translations[i];
      const prompt = `Write an algebraic expression: "${t.phrase}"`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'writing-expressions', prompt, t.expr,
          ['x + x', '3x + 1', 'x - 1'], 2, '8-12', 'Expressions & Equations', ['expressions', 'algebra']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'equivalent-expressions': (count) => {
    const problems = [];
    const equivs = [
      { expr: '2(x + 3)', equiv: '2x + 6' },
      { expr: '3x + 3x', equiv: '6x' },
      { expr: '4(2x - 1)', equiv: '8x - 4' },
      { expr: 'x + x + x', equiv: '3x' },
      { expr: '5(x + 2) - 5', equiv: '5x + 5' },
      { expr: '2x + 4 + 3x', equiv: '5x + 4' },
      { expr: '3(x - 2) + 6', equiv: '3x' },
      { expr: '4x - 2x + 5', equiv: '2x + 5' },
      { expr: '2(3x + 1) - 2', equiv: '6x' },
      { expr: 'x² + 2x + x²', equiv: '2x² + 2x' },
      { expr: '(x + 1)(x + 1)', equiv: 'x² + 2x + 1' },
      { expr: '3(x + y) - y', equiv: '3x + 2y' },
      { expr: '4x/2 + 3', equiv: '2x + 3' },
      { expr: '5x - 3x + 2', equiv: '2x + 2' },
      { expr: '2(x² + 3) - 6', equiv: '2x²' },
    ];
    for (let i = 0; i < count && i < equivs.length; i++) {
      const e = equivs[i];
      const prompt = `Simplify: ${e.expr}`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'equivalent-expressions', prompt, e.equiv,
          ['x + 1', '2x - 1', '4x'], 3, '8-12', 'Expressions & Equations', ['expressions', 'simplify']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'numerical-expressions-exponents': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const base = [2, 3, 5, 4, 10][i % 5];
      const exp = [2, 3, 2, 2, 2][i % 5];
      const add = [3, 5, 10, 8, 50][i % 5];
      const result = Math.pow(base, exp) + add;
      const prompt = `Evaluate: ${base}^${exp} + ${add}`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'numerical-expressions-exponents', prompt, String(result),
          wrongAnswers(result, 'integer'), 2, '8-12', 'Expressions & Equations', ['exponents', 'evaluate']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  // ==========================================================================
  // GEOMETRY (8-12)
  // ==========================================================================

  'pythagorean-theorem': (count) => {
    const problems = [];
    const triples = [
      [3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10],
      [9, 12, 15], [5, 12, 13], [9, 40, 41], [12, 16, 20], [15, 20, 25],
    ];
    for (let i = 0; i < count; i++) {
      const [a, b, c] = triples[i % triples.length];
      const type = i % 3;
      let prompt, correct;

      if (type === 0) {
        prompt = `A right triangle has legs ${a} and ${b}. Find the hypotenuse.`;
        correct = String(c);
      } else if (type === 1) {
        prompt = `A right triangle has hypotenuse ${c} and one leg ${a}. Find the other leg.`;
        correct = String(b);
      } else {
        prompt = `Is a triangle with sides ${a}, ${b}, ${c} a right triangle?`;
        correct = 'Yes';
      }

      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'pythagorean-theorem', prompt, correct,
          type === 2 ? ['No', 'Cannot determine', 'Only if c > a + b'] : wrongAnswers(correct, 'integer'),
          3, '8-12', 'Geometry', ['pythagorean', 'triangles']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'area-triangles': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const base = Math.floor(Math.random() * 10) + 4;
      const height = Math.floor(Math.random() * 8) + 3;
      const area = (base * height) / 2;
      const prompt = `Find the area of a triangle with base ${base} and height ${height}.`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'area-triangles', prompt, String(area),
          wrongAnswers(area, 'integer'), 2, '8-12', 'Geometry', ['area', 'triangles']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'circles-circumference-area': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const r = [3, 5, 7, 4, 6, 10][i % 6];
      const isArea = i % 2 === 0;
      const prompt = isArea ?
        `Find the area of a circle with radius ${r}. (Use π ≈ 3.14)` :
        `Find the circumference of a circle with radius ${r}. (Use π ≈ 3.14)`;
      const correct = isArea ?
        `${(3.14 * r * r).toFixed(2)} sq units` :
        `${(2 * 3.14 * r).toFixed(2)} units`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'circles-circumference-area', prompt, correct,
          isArea ?
            [`${(3.14 * r).toFixed(2)} sq units`, `${(2 * 3.14 * r * r).toFixed(2)} sq units`, `${(r * r).toFixed(2)} sq units`] :
            [`${(3.14 * r).toFixed(2)} units`, `${(3.14 * r * r).toFixed(2)} units`, `${(4 * r).toFixed(2)} units`],
          3, '8-12', 'Geometry', ['circles', isArea ? 'area' : 'circumference']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'volume-rectangular-prisms': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const l = Math.floor(Math.random() * 8) + 3;
      const w = Math.floor(Math.random() * 6) + 2;
      const h = Math.floor(Math.random() * 5) + 2;
      const vol = l * w * h;
      const prompt = `Find the volume of a rectangular prism: length=${l}, width=${w}, height=${h}`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'volume-rectangular-prisms', prompt, `${vol} cubic units`,
          [`${vol + 10} cubic units`, `${l * w} cubic units`, `${2 * (l + w + h)} cubic units`],
          2, '8-12', 'Geometry', ['volume', '3d-shapes']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  // ==========================================================================
  // TRIGONOMETRY (8-12)
  // ==========================================================================

  'trig-right-triangle-ratios': (count) => {
    const problems = [];
    const triangles = [
      { opp: 3, adj: 4, hyp: 5, angle: 'A' },
      { opp: 5, adj: 12, hyp: 13, angle: 'B' },
      { opp: 8, adj: 15, hyp: 17, angle: 'C' },
      { opp: 7, adj: 24, hyp: 25, angle: 'A' },
    ];
    const ratios = ['sin', 'cos', 'tan'];
    for (let i = 0; i < count; i++) {
      const t = triangles[i % triangles.length];
      const ratio = ratios[i % 3];
      let prompt, correct;

      if (ratio === 'sin') {
        prompt = `In a right triangle, the side opposite angle ${t.angle} is ${t.opp} and the hypotenuse is ${t.hyp}. Find sin(${t.angle}).`;
        correct = `${t.opp}/${t.hyp}`;
      } else if (ratio === 'cos') {
        prompt = `In a right triangle, the side adjacent to angle ${t.angle} is ${t.adj} and the hypotenuse is ${t.hyp}. Find cos(${t.angle}).`;
        correct = `${t.adj}/${t.hyp}`;
      } else {
        prompt = `In a right triangle, the side opposite angle ${t.angle} is ${t.opp} and adjacent is ${t.adj}. Find tan(${t.angle}).`;
        correct = `${t.opp}/${t.adj}`;
      }

      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'trig-right-triangle-ratios', prompt, correct,
          [`${t.adj}/${t.opp}`, `${t.hyp}/${t.opp}`, `${t.adj}/${t.hyp}`],
          3, '8-12', 'Trigonometry', ['trigonometry', 'ratios']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'trig-solve-right-triangles': (count) => {
    const problems = [];
    for (let i = 0; i < count; i++) {
      const angle = [30, 45, 60][i % 3];
      const hyp = [10, 12, 8, 20][i % 4];
      let opp, adj;

      if (angle === 30) {
        opp = hyp / 2;
        adj = (hyp * Math.sqrt(3) / 2).toFixed(1);
      } else if (angle === 45) {
        opp = (hyp / Math.sqrt(2)).toFixed(1);
        adj = opp;
      } else {
        opp = (hyp * Math.sqrt(3) / 2).toFixed(1);
        adj = hyp / 2;
      }

      const prompt = `In a right triangle with angle ${angle}° and hypotenuse ${hyp}, find the opposite side.`;
      const correct = String(opp);

      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'trig-solve-right-triangles', prompt, correct,
          wrongAnswers(parseFloat(correct), 'decimal'),
          4, '8-12', 'Trigonometry', ['trigonometry', 'triangles']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'trig-degree-radian-conversion': (count) => {
    const problems = [];
    const conversions = [
      { deg: 180, rad: 'π' },
      { deg: 90, rad: 'π/2' },
      { deg: 60, rad: 'π/3' },
      { deg: 45, rad: 'π/4' },
      { deg: 30, rad: 'π/6' },
      { deg: 360, rad: '2π' },
      { deg: 120, rad: '2π/3' },
      { deg: 135, rad: '3π/4' },
      { deg: 150, rad: '5π/6' },
      { deg: 270, rad: '3π/2' },
      { deg: 315, rad: '7π/4' },
      { deg: 240, rad: '4π/3' },
      { deg: 210, rad: '7π/6' },
      { deg: 330, rad: '11π/6' },
      { deg: 300, rad: '5π/3' },
    ];
    for (let i = 0; i < count && i < conversions.length; i++) {
      const c = conversions[i];
      const toRad = i % 2 === 0;
      const prompt = toRad ?
        `Convert ${c.deg}° to radians.` :
        `Convert ${c.rad} radians to degrees.`;
      const correct = toRad ? c.rad : `${c.deg}°`;

      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'trig-degree-radian-conversion', prompt, correct,
          toRad ? ['π/5', '2π/5', 'π/8'] : ['45°', '90°', '120°'],
          2, '8-12', 'Trigonometry', ['trigonometry', 'conversion']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'trig-unit-circle-evaluation': (count) => {
    const problems = [];
    const values = [
      { angle: '0', sin: '0', cos: '1' },
      { angle: 'π/6', sin: '1/2', cos: '√3/2' },
      { angle: 'π/4', sin: '√2/2', cos: '√2/2' },
      { angle: 'π/3', sin: '√3/2', cos: '1/2' },
      { angle: 'π/2', sin: '1', cos: '0' },
      { angle: 'π', sin: '0', cos: '-1' },
      { angle: '3π/2', sin: '-1', cos: '0' },
      { angle: '2π', sin: '0', cos: '1' },
      { angle: '5π/6', sin: '1/2', cos: '-√3/2' },
      { angle: '2π/3', sin: '√3/2', cos: '-1/2' },
      { angle: '7π/6', sin: '-1/2', cos: '-√3/2' },
      { angle: '5π/4', sin: '-√2/2', cos: '-√2/2' },
      { angle: '4π/3', sin: '-√3/2', cos: '-1/2' },
      { angle: '5π/3', sin: '-√3/2', cos: '1/2' },
      { angle: '11π/6', sin: '-1/2', cos: '√3/2' },
    ];
    for (let i = 0; i < count && i < values.length; i++) {
      const v = values[i];
      const isSin = i % 2 === 0;
      const prompt = isSin ? `Find sin(${v.angle})` : `Find cos(${v.angle})`;
      const correct = isSin ? v.sin : v.cos;

      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'trig-unit-circle-evaluation', prompt, correct,
          ['1/2', '-1/2', '√3/2', '-√3/2', '0', '1'].filter(x => x !== correct).slice(0, 3),
          3, '8-12', 'Trigonometry', ['trigonometry', 'unit-circle']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'trig-tan-unit-circle': (count) => {
    const problems = [];
    const values = [
      { angle: '0', tan: '0' },
      { angle: 'π/6', tan: '√3/3' },
      { angle: 'π/4', tan: '1' },
      { angle: 'π/3', tan: '√3' },
      { angle: 'π', tan: '0' },
      { angle: '5π/4', tan: '1' },
      { angle: '7π/4', tan: '-1' },
      { angle: '2π/3', tan: '-√3' },
      { angle: '5π/6', tan: '-√3/3' },
      { angle: '4π/3', tan: '√3' },
      { angle: '5π/3', tan: '-√3' },
      { angle: '11π/6', tan: '-√3/3' },
      { angle: '3π/4', tan: '-1' },
      { angle: '7π/6', tan: '√3/3' },
      { angle: 'π/2', tan: 'undefined' },
    ];
    for (let i = 0; i < count && i < values.length; i++) {
      const v = values[i];
      const prompt = `Find tan(${v.angle})`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'trig-tan-unit-circle', prompt, v.tan,
          ['0', '1', '-1', '√3', '-√3', 'undefined'].filter(x => x !== v.tan).slice(0, 3),
          3, '8-12', 'Trigonometry', ['trigonometry', 'tangent']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'trig-identities-basic': (count) => {
    const problems = [];
    const identities = [
      { q: 'Simplify: sin²θ + cos²θ', a: '1' },
      { q: 'Simplify: 1 + tan²θ', a: 'sec²θ' },
      { q: 'Simplify: 1 + cot²θ', a: 'csc²θ' },
      { q: 'If sin θ = 3/5, find cos θ (θ in Q1)', a: '4/5' },
      { q: 'Simplify: sin θ / cos θ', a: 'tan θ' },
      { q: 'Simplify: cos θ / sin θ', a: 'cot θ' },
      { q: 'Simplify: 1 / cos θ', a: 'sec θ' },
      { q: 'Simplify: 1 / sin θ', a: 'csc θ' },
      { q: 'If tan θ = 1, and θ is in Q1, find sin θ', a: '√2/2' },
      { q: 'Simplify: sin 2θ', a: '2 sin θ cos θ' },
      { q: 'Simplify: cos 2θ (one form)', a: 'cos²θ - sin²θ' },
      { q: 'If cos θ = 0, find sin θ (θ in Q1)', a: '1' },
      { q: 'Simplify: sec²θ - tan²θ', a: '1' },
      { q: 'Simplify: csc²θ - cot²θ', a: '1' },
      { q: 'If sin θ = 1/2 and θ in Q1, find tan θ', a: '√3/3' },
    ];
    for (let i = 0; i < count && i < identities.length; i++) {
      const id = identities[i];
      if (!existingPrompts.has(id.q.toLowerCase())) {
        problems.push(createMCProblem(
          'trig-identities-basic', id.q, id.a,
          ['sin θ', 'cos θ', 'tan θ', '0', '2'].filter(x => x !== id.a).slice(0, 3),
          4, '8-12', 'Trigonometry', ['trigonometry', 'identities']
        ));
        existingPrompts.add(id.q.toLowerCase());
      }
    }
    return problems;
  },

  'trig-solve-equations-special': (count) => {
    const problems = [];
    const equations = [
      { eq: 'sin x = 1/2, 0 ≤ x < 2π', a: 'π/6 and 5π/6' },
      { eq: 'cos x = 0, 0 ≤ x < 2π', a: 'π/2 and 3π/2' },
      { eq: 'tan x = 1, 0 ≤ x < 2π', a: 'π/4 and 5π/4' },
      { eq: 'sin x = -1, 0 ≤ x < 2π', a: '3π/2' },
      { eq: 'cos x = 1, 0 ≤ x < 2π', a: '0' },
      { eq: 'sin x = √2/2, 0 ≤ x < 2π', a: 'π/4 and 3π/4' },
      { eq: 'cos x = -1/2, 0 ≤ x < 2π', a: '2π/3 and 4π/3' },
      { eq: 'tan x = 0, 0 ≤ x < 2π', a: '0 and π' },
      { eq: 'sin x = 0, 0 ≤ x < 2π', a: '0 and π' },
      { eq: 'cos x = √3/2, 0 ≤ x < 2π', a: 'π/6 and 11π/6' },
      { eq: 'tan x = √3, 0 ≤ x < 2π', a: 'π/3 and 4π/3' },
      { eq: 'sin x = -√3/2, 0 ≤ x < 2π', a: '4π/3 and 5π/3' },
      { eq: 'cos x = -√2/2, 0 ≤ x < 2π', a: '3π/4 and 5π/4' },
      { eq: 'tan x = -1, 0 ≤ x < 2π', a: '3π/4 and 7π/4' },
      { eq: 'sin x = 1, 0 ≤ x < 2π', a: 'π/2' },
    ];
    for (let i = 0; i < count && i < equations.length; i++) {
      const e = equations[i];
      const prompt = `Solve: ${e.eq}`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'trig-solve-equations-special', prompt, e.a,
          ['π/4', 'π/3', '2π/3', 'π/6 and 11π/6'].filter(x => x !== e.a).slice(0, 3),
          4, '8-12', 'Trigonometry', ['trigonometry', 'equations']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'trig-elevation-depression': (count) => {
    const problems = [];
    const scenarios = [
      { desc: 'A person stands 50 ft from a building. The angle of elevation to the top is 60°. How tall is the building?', ans: '86.6 ft', hint: '50 × tan(60°)' },
      { desc: 'From a lighthouse 100 ft high, the angle of depression to a boat is 30°. How far is the boat from the base?', ans: '173.2 ft', hint: '100 / tan(30°)' },
      { desc: 'A ladder makes a 70° angle with the ground and reaches 15 ft up a wall. How long is the ladder?', ans: '16.0 ft', hint: '15 / sin(70°)' },
      { desc: 'A kite string is 80 ft long at a 45° angle. How high is the kite?', ans: '56.6 ft', hint: '80 × sin(45°)' },
      { desc: 'From 200 ft away, the angle of elevation to the top of a tree is 25°. Find the tree height.', ans: '93.3 ft', hint: '200 × tan(25°)' },
      { desc: 'A plane at 5000 ft sees a landmark at a 40° angle of depression. Find the horizontal distance.', ans: '5959 ft', hint: '5000 / tan(40°)' },
      { desc: 'A ramp rises 3 ft over a horizontal distance of 12 ft. Find the angle of elevation.', ans: '14.0°', hint: 'arctan(3/12)' },
      { desc: 'From a cliff 150 ft high, angle of depression to a ship is 20°. Find the distance to the ship.', ans: '412.1 ft', hint: '150 / tan(20°)' },
      { desc: 'A 20 ft pole casts a 15 ft shadow. Find the angle of elevation of the sun.', ans: '53.1°', hint: 'arctan(20/15)' },
      { desc: 'A guy wire attached 30 ft up a pole makes a 55° angle. How long is the wire?', ans: '36.6 ft', hint: '30 / sin(55°)' },
    ];
    for (let i = 0; i < count && i < scenarios.length; i++) {
      const s = scenarios[i];
      if (!existingPrompts.has(s.desc.toLowerCase())) {
        problems.push(createMCProblem(
          'trig-elevation-depression', s.desc, s.ans,
          wrongAnswers(parseFloat(s.ans), 'decimal').map(w => w + ' ft'),
          4, '8-12', 'Trigonometry', ['trigonometry', 'word-problems']
        ));
        existingPrompts.add(s.desc.toLowerCase());
      }
    }
    return problems;
  },

  'trig-law-of-sines': (count) => {
    const problems = [];
    const triangles = [
      { A: 30, B: 60, a: 5, b: '8.66', desc: 'In triangle ABC, A=30°, B=60°, a=5. Find b.' },
      { A: 45, B: 75, a: 10, b: '13.66', desc: 'In triangle ABC, A=45°, B=75°, a=10. Find b.' },
      { A: 40, C: 70, a: 8, c: '11.69', desc: 'In triangle ABC, A=40°, C=70°, a=8. Find c.' },
      { A: 50, B: 60, c: 12, a: '10.45', desc: 'In triangle ABC, A=50°, B=60°, c=12. Find a.' },
      { B: 55, C: 65, b: 15, c: '16.58', desc: 'In triangle ABC, B=55°, C=65°, b=15. Find c.' },
    ];
    for (let i = 0; i < count; i++) {
      const t = triangles[i % triangles.length];
      if (!existingPrompts.has(t.desc.toLowerCase())) {
        const correct = i % 2 === 0 ? t.b : t.c || t.a;
        problems.push(createMCProblem(
          'trig-law-of-sines', t.desc, String(correct),
          wrongAnswers(parseFloat(correct), 'decimal'),
          4, '8-12', 'Trigonometry', ['trigonometry', 'law-of-sines']
        ));
        existingPrompts.add(t.desc.toLowerCase());
      }
    }
    return problems;
  },

  'trig-law-of-cosines': (count) => {
    const problems = [];
    const triangles = [
      { a: 5, b: 7, C: 60, c: '6.24', desc: 'In triangle ABC, a=5, b=7, C=60°. Find c.' },
      { a: 8, b: 6, C: 45, c: '5.76', desc: 'In triangle ABC, a=8, b=6, C=45°. Find c.' },
      { a: 10, b: 12, c: 8, A: '41.4°', desc: 'In triangle ABC, a=10, b=12, c=8. Find angle A.' },
      { a: 7, b: 9, C: 120, c: '13.89', desc: 'In triangle ABC, a=7, b=9, C=120°. Find c.' },
      { a: 6, b: 8, c: 10, C: '90°', desc: 'In triangle ABC, a=6, b=8, c=10. Find angle C.' },
    ];
    for (let i = 0; i < count; i++) {
      const t = triangles[i % triangles.length];
      if (!existingPrompts.has(t.desc.toLowerCase())) {
        const correct = String(t.c || t.A || t.C);
        const isAngle = correct.includes('°');
        problems.push(createMCProblem(
          'trig-law-of-cosines', t.desc, correct,
          isAngle ? ['30°', '60°', '75°'] : wrongAnswers(parseFloat(correct), 'decimal'),
          4, '8-12', 'Trigonometry', ['trigonometry', 'law-of-cosines']
        ));
        existingPrompts.add(t.desc.toLowerCase());
      }
    }
    return problems;
  },

  // ==========================================================================
  // STATISTICS (5-8)
  // ==========================================================================

  'statistics': (count) => {
    const problems = [];
    const datasets = [
      { data: [2, 4, 6, 8, 10], mean: '6', median: '6', mode: 'none', range: '8' },
      { data: [3, 3, 5, 7, 9, 9], mean: '6', median: '6', mode: '3 and 9', range: '6' },
      { data: [10, 20, 30, 40, 50], mean: '30', median: '30', mode: 'none', range: '40' },
      { data: [1, 2, 2, 3, 4, 4, 4, 5], mean: '3.125', median: '3.5', mode: '4', range: '4' },
      { data: [15, 18, 22, 25, 30], mean: '22', median: '22', mode: 'none', range: '15' },
    ];
    const measures = ['mean', 'median', 'mode', 'range'];
    for (let i = 0; i < count; i++) {
      const d = datasets[i % datasets.length];
      const m = measures[i % measures.length];
      const prompt = `Find the ${m} of: ${d.data.join(', ')}`;
      const correct = d[m];
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'statistics', prompt, correct,
          m === 'mode' ? ['2', 'none', '3'] : wrongAnswers(parseFloat(correct) || 0, 'integer'),
          2, '5-8', 'Statistics', ['statistics', m]
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'statistics-probability': (count) => {
    const problems = [];
    const questions = [
      { q: 'A bag has 3 red, 4 blue, and 5 green marbles. P(red)?', a: '3/12 or 1/4' },
      { q: 'Roll a fair die. P(even)?', a: '3/6 or 1/2' },
      { q: 'Flip a coin twice. P(two heads)?', a: '1/4' },
      { q: 'A spinner has 8 equal sections numbered 1-8. P(prime)?', a: '4/8 or 1/2' },
      { q: 'Draw a card from a standard deck. P(heart)?', a: '13/52 or 1/4' },
      { q: 'Roll two dice. P(sum = 7)?', a: '6/36 or 1/6' },
      { q: 'A bag has 5 red and 7 blue marbles. P(blue)?', a: '7/12' },
      { q: 'Draw a card. P(face card)?', a: '12/52 or 3/13' },
      { q: 'Flip 3 coins. P(all tails)?', a: '1/8' },
      { q: 'Roll a die. P(greater than 4)?', a: '2/6 or 1/3' },
    ];
    for (let i = 0; i < count && i < questions.length; i++) {
      const q = questions[i];
      if (!existingPrompts.has(q.q.toLowerCase())) {
        problems.push(createMCProblem(
          'statistics-probability', q.q, q.a,
          ['1/2', '1/3', '1/4', '1/6'].filter(x => !q.a.includes(x)).slice(0, 3),
          3, '5-8', 'Statistics & Probability', ['probability']
        ));
        existingPrompts.add(q.q.toLowerCase());
      }
    }
    return problems;
  },

  // ==========================================================================
  // NUMBER SYSTEM (8-12)
  // ==========================================================================

  'number-system': (count) => {
    const problems = [];
    const questions = [
      { q: 'Which set does -5 belong to?', a: 'Integers', wrongs: ['Natural numbers', 'Whole numbers', 'Irrational numbers'] },
      { q: 'Which number is NOT rational?', a: '√2', wrongs: ['1/3', '0.5', '-7'] },
      { q: 'Is 0 a natural number?', a: 'No', wrongs: ['Yes', 'Sometimes', 'Only in some systems'] },
      { q: '√16 is a member of which set?', a: 'All of the above', wrongs: ['Natural numbers only', 'Integers only', 'Real numbers only'] },
      { q: 'Which is a whole number but not natural?', a: '0', wrongs: ['1', '-1', '1/2'] },
      { q: 'All integers are also:', a: 'Rational numbers', wrongs: ['Irrational numbers', 'Natural numbers', 'Whole numbers'] },
      { q: 'π belongs to which set?', a: 'Irrational numbers', wrongs: ['Rational numbers', 'Integers', 'Whole numbers'] },
      { q: 'The set of real numbers includes:', a: 'Both rational and irrational', wrongs: ['Only rational', 'Only irrational', 'Only integers'] },
      { q: '-3/4 is a member of:', a: 'Rational numbers', wrongs: ['Integers', 'Whole numbers', 'Natural numbers'] },
      { q: 'Which statement is false?', a: 'All real numbers are rational', wrongs: ['All integers are real', 'All natural numbers are whole', 'All rational numbers are real'] },
    ];
    for (let i = 0; i < count && i < questions.length; i++) {
      const q = questions[i];
      if (!existingPrompts.has(q.q.toLowerCase())) {
        problems.push(createMCProblem(
          'number-system', q.q, q.a, q.wrongs,
          3, '8-12', 'The Number System', ['number-system', 'classification']
        ));
        existingPrompts.add(q.q.toLowerCase());
      }
    }
    return problems;
  },

  // ==========================================================================
  // CALC 3
  // ==========================================================================

  'calc3-partial-derivatives': (count) => {
    const problems = [];
    const functions = [
      { f: 'f(x,y) = x² + 3xy + y²', fx: '2x + 3y', fy: '3x + 2y' },
      { f: 'f(x,y) = x³y²', fx: '3x²y²', fy: '2x³y' },
      { f: 'f(x,y) = sin(xy)', fx: 'y·cos(xy)', fy: 'x·cos(xy)' },
      { f: 'f(x,y) = e^(x+y)', fx: 'e^(x+y)', fy: 'e^(x+y)' },
      { f: 'f(x,y) = ln(x² + y²)', fx: '2x/(x²+y²)', fy: '2y/(x²+y²)' },
      { f: 'f(x,y) = x²y³', fx: '2xy³', fy: '3x²y²' },
      { f: 'f(x,y) = xy + x/y', fx: 'y + 1/y', fy: 'x - x/y²' },
      { f: 'f(x,y) = cos(x)sin(y)', fx: '-sin(x)sin(y)', fy: 'cos(x)cos(y)' },
    ];
    for (let i = 0; i < count; i++) {
      const func = functions[i % functions.length];
      const isFx = i % 2 === 0;
      const prompt = isFx ?
        `Find ∂f/∂x for ${func.f}` :
        `Find ∂f/∂y for ${func.f}`;
      const correct = isFx ? func.fx : func.fy;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'calc3-partial-derivatives', prompt, correct,
          ['2x', '3y', 'xy', '0'].filter(x => x !== correct).slice(0, 3),
          4, 'Calc 3', 'Calculus', ['calculus', 'partial-derivatives']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'calc3-gradient': (count) => {
    const problems = [];
    const functions = [
      { f: 'f(x,y) = x² + y²', grad: '⟨2x, 2y⟩' },
      { f: 'f(x,y) = 3x + 4y', grad: '⟨3, 4⟩' },
      { f: 'f(x,y) = xy', grad: '⟨y, x⟩' },
      { f: 'f(x,y) = x²y', grad: '⟨2xy, x²⟩' },
      { f: 'f(x,y,z) = x + y + z', grad: '⟨1, 1, 1⟩' },
      { f: 'f(x,y) = e^(xy)', grad: '⟨ye^(xy), xe^(xy)⟩' },
      { f: 'f(x,y) = sin(x) + cos(y)', grad: '⟨cos(x), -sin(y)⟩' },
      { f: 'f(x,y,z) = xyz', grad: '⟨yz, xz, xy⟩' },
    ];
    for (let i = 0; i < count && i < functions.length; i++) {
      const func = functions[i];
      const prompt = `Find ∇f for ${func.f}`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'calc3-gradient', prompt, func.grad,
          ['⟨x, y⟩', '⟨2, 2⟩', '⟨1, 0⟩'].filter(x => x !== func.grad).slice(0, 3),
          4, 'Calc 3', 'Calculus', ['calculus', 'gradient']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'calc3-dot-cross': (count) => {
    const problems = [];
    const vectors = [
      { a: '⟨1, 2, 3⟩', b: '⟨4, 5, 6⟩', dot: '32', cross: '⟨-3, 6, -3⟩' },
      { a: '⟨1, 0, 0⟩', b: '⟨0, 1, 0⟩', dot: '0', cross: '⟨0, 0, 1⟩' },
      { a: '⟨2, 3, 1⟩', b: '⟨1, -1, 2⟩', dot: '1', cross: '⟨7, -3, -5⟩' },
      { a: '⟨3, 0, 4⟩', b: '⟨0, 2, 0⟩', dot: '0', cross: '⟨-8, 0, 6⟩' },
      { a: '⟨1, 1, 1⟩', b: '⟨2, 2, 2⟩', dot: '6', cross: '⟨0, 0, 0⟩' },
    ];
    for (let i = 0; i < count; i++) {
      const v = vectors[i % vectors.length];
      const isDot = i % 2 === 0;
      const prompt = isDot ?
        `Find a · b where a = ${v.a} and b = ${v.b}` :
        `Find a × b where a = ${v.a} and b = ${v.b}`;
      const correct = isDot ? v.dot : v.cross;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'calc3-dot-cross', prompt, correct,
          isDot ? wrongAnswers(parseInt(v.dot), 'integer') : ['⟨1, 0, 0⟩', '⟨0, 1, 0⟩', '⟨0, 0, 1⟩'],
          4, 'Calc 3', 'Calculus', ['vectors', isDot ? 'dot-product' : 'cross-product']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'calc3-double-integrals': (count) => {
    const problems = [];
    const integrals = [
      { integral: '∫∫_R 1 dA where R = [0,2] × [0,3]', ans: '6' },
      { integral: '∫∫_R x dA where R = [0,1] × [0,1]', ans: '1/2' },
      { integral: '∫∫_R xy dA where R = [0,1] × [0,2]', ans: '1' },
      { integral: '∫∫_R (x + y) dA where R = [0,1] × [0,1]', ans: '1' },
      { integral: '∫₀¹ ∫₀² xy dy dx', ans: '1' },
      { integral: '∫₀² ∫₀¹ x dy dx', ans: '2' },
      { integral: '∫∫_R x² dA where R = [0,1] × [0,1]', ans: '1/3' },
      { integral: '∫₀¹ ∫₀¹ 2xy dy dx', ans: '1/2' },
    ];
    for (let i = 0; i < count && i < integrals.length; i++) {
      const int = integrals[i];
      const prompt = `Evaluate: ${int.integral}`;
      if (!existingPrompts.has(prompt.toLowerCase())) {
        problems.push(createMCProblem(
          'calc3-double-integrals', prompt, int.ans,
          ['0', '1', '2', '1/2', '1/3', '6'].filter(x => x !== int.ans).slice(0, 3),
          5, 'Calc 3', 'Calculus', ['calculus', 'double-integrals']
        ));
        existingPrompts.add(prompt.toLowerCase());
      }
    }
    return problems;
  },

  'calc3-greens-theorem': (count) => {
    const problems = [];
    const questions = [
      { q: 'Green\'s Theorem relates a line integral around C to:', a: 'A double integral over the region enclosed' },
      { q: 'In Green\'s Theorem: ∮_C (P dx + Q dy) = ?', a: '∫∫_R (∂Q/∂x - ∂P/∂y) dA' },
      { q: 'For Green\'s Theorem, the curve C must be:', a: 'Simple, closed, positively oriented' },
      { q: 'If P = -y and Q = x, what does ∮_C (P dx + Q dy) compute?', a: 'Twice the area enclosed' },
      { q: 'Green\'s Theorem is a special case of:', a: 'Stokes\' Theorem' },
      { q: 'The curl condition ∂Q/∂x - ∂P/∂y = 0 means:', a: 'The field is conservative' },
      { q: 'Using Green\'s, ∮_C x dy - y dx around unit circle =', a: '2π' },
      { q: 'Green\'s Theorem requires the region to be:', a: 'Simply connected' },
    ];
    for (let i = 0; i < count && i < questions.length; i++) {
      const q = questions[i];
      if (!existingPrompts.has(q.q.toLowerCase())) {
        problems.push(createMCProblem(
          'calc3-greens-theorem', q.q, q.a,
          ['A triple integral', 'The divergence', 'A surface integral'].slice(0, 3),
          5, 'Calc 3', 'Calculus', ['calculus', 'greens-theorem']
        ));
        existingPrompts.add(q.q.toLowerCase());
      }
    }
    return problems;
  },

  'calc3-divergence-theorem': (count) => {
    const problems = [];
    const questions = [
      { q: 'The Divergence Theorem relates a surface integral to:', a: 'A triple integral over the enclosed volume' },
      { q: 'In the Divergence Theorem: ∬_S F · n dS = ?', a: '∭_E div F dV' },
      { q: 'If F = ⟨x, y, z⟩, find div F', a: '3' },
      { q: 'The divergence of F = ⟨x², y², z²⟩ is:', a: '2x + 2y + 2z' },
      { q: 'Divergence Theorem requires S to be:', a: 'A closed surface' },
      { q: 'Physical interpretation of divergence:', a: 'Rate of fluid expansion' },
      { q: 'If div F = 0 everywhere, F is called:', a: 'Incompressible or solenoidal' },
      { q: 'For F = ⟨yz, xz, xy⟩, div F =', a: '0' },
    ];
    for (let i = 0; i < count && i < questions.length; i++) {
      const q = questions[i];
      if (!existingPrompts.has(q.q.toLowerCase())) {
        problems.push(createMCProblem(
          'calc3-divergence-theorem', q.q, q.a,
          ['A line integral', '0', '1'].slice(0, 3),
          5, 'Calc 3', 'Calculus', ['calculus', 'divergence']
        ));
        existingPrompts.add(q.q.toLowerCase());
      }
    }
    return problems;
  },

  'calc3-stokes-theorem': (count) => {
    const problems = [];
    const questions = [
      { q: 'Stokes\' Theorem relates a line integral to:', a: 'A surface integral of the curl' },
      { q: 'In Stokes\' Theorem: ∮_C F · dr = ?', a: '∬_S (curl F) · n dS' },
      { q: 'The curl of F = ⟨x, y, z⟩ is:', a: '⟨0, 0, 0⟩' },
      { q: 'For F = ⟨-y, x, 0⟩, curl F =', a: '⟨0, 0, 2⟩' },
      { q: 'Stokes\' generalizes which theorem?', a: 'Green\'s Theorem' },
      { q: 'If curl F = 0, then F is:', a: 'Conservative' },
      { q: 'The boundary curve C in Stokes\' must be:', a: 'Oriented consistently with S' },
      { q: 'curl(grad f) always equals:', a: '0' },
    ];
    for (let i = 0; i < count && i < questions.length; i++) {
      const q = questions[i];
      if (!existingPrompts.has(q.q.toLowerCase())) {
        problems.push(createMCProblem(
          'calc3-stokes-theorem', q.q, q.a,
          ['A volume integral', '⟨1, 1, 1⟩', 'The divergence'].slice(0, 3),
          5, 'Calc 3', 'Calculus', ['calculus', 'stokes']
        ));
        existingPrompts.add(q.q.toLowerCase());
      }
    }
    return problems;
  },

  // ==========================================================================
  // BATCH 2: ALGEBRA & FUNCTIONS
  // ==========================================================================

  'rate-of-change-problems': (count) => {
    const problems = [];
    const qs = [
      { q: 'A plant grows from 5 cm to 17 cm in 4 days. What is the rate of change?', a: '3 cm/day', w: ['4 cm/day', '12 cm/day', '2 cm/day'] },
      { q: 'Temperature drops from 80°F to 65°F over 5 hours. Find the rate of change.', a: '-3°F/hour', w: ['3°F/hour', '-15°F/hour', '5°F/hour'] },
      { q: 'A car travels 240 miles in 4 hours. What is its average rate?', a: '60 mph', w: ['40 mph', '80 mph', '244 mph'] },
      { q: 'Water level rises from 2 ft to 8 ft in 3 hours. Rate of change?', a: '2 ft/hr', w: ['3 ft/hr', '6 ft/hr', '1 ft/hr'] },
      { q: 'Stock price goes from $50 to $35 in 5 days. Rate of change?', a: '-$3/day', w: ['$3/day', '-$15/day', '$7/day'] },
      { q: 'A runner covers 6 miles in 48 minutes. Rate in miles per hour?', a: '7.5 mph', w: ['6 mph', '8 mph', '12 mph'] },
      { q: 'Population grows from 1000 to 1500 in 10 years. Annual rate?', a: '50 people/year', w: ['100 people/year', '500 people/year', '25 people/year'] },
      { q: 'f(2) = 10, f(5) = 25. Find average rate of change.', a: '5', w: ['15', '3', '7.5'] },
      { q: 'Between x=1 and x=4, f(x)=x² changes from 1 to 16. Average rate?', a: '5', w: ['15', '4', '3'] },
      { q: 'A balloon rises from 100m to 250m in 30 seconds. Rate?', a: '5 m/s', w: ['150 m/s', '3 m/s', '8 m/s'] },
      { q: 'Sales increase from $2000 to $3500 over 6 months. Monthly rate?', a: '$250/month', w: ['$1500/month', '$500/month', '$583/month'] },
      { q: 'Distance d(t) = 3t + 5. What is the rate of change?', a: '3', w: ['5', '8', '3t'] },
      { q: 'For f(x) = 2x - 7, the rate of change is:', a: '2', w: ['-7', '2x', '-5'] },
      { q: 'Elevation changes from 500 ft to 1700 ft over 4 miles. Rate?', a: '300 ft/mile', w: ['1200 ft/mile', '425 ft/mile', '200 ft/mile'] },
      { q: 'A tank drains from 50 gal to 20 gal in 15 min. Rate?', a: '-2 gal/min', w: ['2 gal/min', '-30 gal/min', '3 gal/min'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('rate-of-change-problems', p.q, p.a, p.w, 3, '8-12', 'Functions', ['rate-of-change']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'average-rate-of-change': (count) => {
    const problems = [];
    const qs = [
      { q: 'Find average rate of change of f(x) = x² from x=1 to x=3.', a: '4', w: ['2', '8', '6'] },
      { q: 'For f(x) = 3x + 2, average rate of change from x=0 to x=5 is:', a: '3', w: ['2', '17', '5'] },
      { q: 'f(x) = x² - 4x. Average rate from x=2 to x=6?', a: '4', w: ['0', '8', '2'] },
      { q: 'For f(x) = 2^x, average rate from x=1 to x=3?', a: '3', w: ['6', '4', '2'] },
      { q: 'Average rate of f(x) = √x from x=4 to x=9?', a: '0.2', w: ['0.5', '1', '0.4'] },
      { q: 'f(x) = 1/x. Average rate from x=1 to x=2?', a: '-0.5', w: ['0.5', '-1', '1'] },
      { q: 'For f(x) = x³, average rate from x=1 to x=2?', a: '7', w: ['3', '8', '1'] },
      { q: 'f(x) = |x|. Average rate from x=-3 to x=3?', a: '0', w: ['1', '2', '6'] },
      { q: 'Average rate of f(x) = -2x + 5 on any interval is:', a: '-2', w: ['5', '3', '-5'] },
      { q: 'f(x) = x² + 1. Average rate from x=0 to x=4?', a: '4', w: ['8', '17', '2'] },
      { q: 'For f(x) = 5, average rate from x=2 to x=10?', a: '0', w: ['5', '8', '1'] },
      { q: 'f(x) = 4x - x². Average rate from x=0 to x=2?', a: '2', w: ['4', '0', '3'] },
      { q: 'Average rate of f(x) = 3x² from x=1 to x=4?', a: '15', w: ['45', '9', '12'] },
      { q: 'f(2) = 7, f(6) = 19. Average rate of change?', a: '3', w: ['12', '4', '26'] },
      { q: 'For g(x) = x² - 2x, average rate from x=3 to x=5?', a: '6', w: ['8', '4', '10'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('average-rate-of-change', p.q, p.a, p.w, 3, '8-12', 'Functions', ['rate-of-change']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'slope-concepts': (count) => {
    const problems = [];
    const qs = [
      { q: 'Find the slope of the line through (2, 3) and (5, 9).', a: '2', w: ['3', '6', '1'] },
      { q: 'A line has equation y = -3x + 7. What is its slope?', a: '-3', w: ['7', '3', '-7'] },
      { q: 'What is the slope of a horizontal line?', a: '0', w: ['1', 'undefined', '-1'] },
      { q: 'What is the slope of a vertical line?', a: 'undefined', w: ['0', '1', 'infinity'] },
      { q: 'Line through (0, 4) and (2, 4). Slope?', a: '0', w: ['4', '2', 'undefined'] },
      { q: 'Slope of y = 5x - 2?', a: '5', w: ['-2', '3', '-5'] },
      { q: 'Points (1, 1) and (4, 7). Find m.', a: '2', w: ['6', '3', '4'] },
      { q: 'A roof rises 6 ft over a run of 12 ft. Slope?', a: '1/2', w: ['2', '6', '12'] },
      { q: 'If m = -4, the line is:', a: 'decreasing', w: ['increasing', 'horizontal', 'vertical'] },
      { q: 'Parallel lines have slopes that are:', a: 'equal', w: ['opposite', 'negative reciprocals', 'perpendicular'] },
      { q: 'Perpendicular lines have slopes that are:', a: 'negative reciprocals', w: ['equal', 'opposite', 'both positive'] },
      { q: 'Slope of 2x + 4y = 8?', a: '-1/2', w: ['2', '4', '1/2'] },
      { q: 'Line through (-1, 5) and (3, -3). Slope?', a: '-2', w: ['2', '-8', '4'] },
      { q: 'If slope = 3/4, rise 12 means run = ?', a: '16', w: ['9', '12', '36'] },
      { q: 'Slope of y - 3 = 2(x + 1)?', a: '2', w: ['3', '-1', '1'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('slope-concepts', p.q, p.a, p.w, 2, '8-12', 'Functions', ['slope', 'linear']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'distance-formula': (count) => {
    const problems = [];
    const qs = [
      { q: 'Distance between (0, 0) and (3, 4)?', a: '5', w: ['7', '25', '12'] },
      { q: 'Distance between (1, 2) and (4, 6)?', a: '5', w: ['7', '25', '3'] },
      { q: 'Distance between (-2, 1) and (2, 4)?', a: '5', w: ['7', '25', '4'] },
      { q: 'Distance between (0, 0) and (5, 12)?', a: '13', w: ['17', '169', '7'] },
      { q: 'Distance between (3, 3) and (6, 7)?', a: '5', w: ['7', '25', '4'] },
      { q: 'Distance between (-1, -1) and (2, 3)?', a: '5', w: ['7', '25', '6'] },
      { q: 'Distance between (0, 5) and (12, 0)?', a: '13', w: ['17', '12', '5'] },
      { q: 'Distance between (2, -3) and (-2, 0)?', a: '5', w: ['7', '25', '4'] },
      { q: 'Distance between (1, 1) and (1, 6)?', a: '5', w: ['0', '7', '6'] },
      { q: 'Distance between (4, 0) and (0, 3)?', a: '5', w: ['7', '25', '4'] },
      { q: 'Points (a, b) and (a, c). Distance = ?', a: '|c - b|', w: ['|a|', 'a + b', '0'] },
      { q: 'Distance from (6, 8) to origin?', a: '10', w: ['14', '100', '6'] },
      { q: 'If distance is 10 and Δx = 6, find |Δy|.', a: '8', w: ['4', '16', '6'] },
      { q: 'Distance between (5, 5) and (8, 9)?', a: '5', w: ['7', '25', '3'] },
      { q: 'Distance between (-3, -4) and origin?', a: '5', w: ['7', '25', '1'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('distance-formula', p.q, p.a, p.w, 3, '8-12', 'Geometry', ['distance', 'coordinate']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'midpoint-formula': (count) => {
    const problems = [];
    const qs = [
      { q: 'Midpoint of (0, 0) and (4, 6)?', a: '(2, 3)', w: ['(4, 6)', '(2, 6)', '(1, 1.5)'] },
      { q: 'Midpoint of (2, 5) and (8, 11)?', a: '(5, 8)', w: ['(6, 16)', '(10, 16)', '(4, 3)'] },
      { q: 'Midpoint of (-4, 2) and (6, 8)?', a: '(1, 5)', w: ['(2, 10)', '(-2, 4)', '(5, 5)'] },
      { q: 'Midpoint of (0, 0) and (10, 0)?', a: '(5, 0)', w: ['(10, 0)', '(0, 5)', '(5, 5)'] },
      { q: 'Midpoint of (1, 1) and (7, 9)?', a: '(4, 5)', w: ['(8, 10)', '(3, 4)', '(6, 8)'] },
      { q: 'Midpoint of (-2, -3) and (4, 5)?', a: '(1, 1)', w: ['(2, 2)', '(6, 8)', '(-1, -1)'] },
      { q: 'Midpoint of (3, 7) and (3, 1)?', a: '(3, 4)', w: ['(3, 8)', '(6, 4)', '(0, 3)'] },
      { q: 'If midpoint is (5, 3) and one point is (2, 1), find the other.', a: '(8, 5)', w: ['(3.5, 2)', '(7, 4)', '(10, 6)'] },
      { q: 'Midpoint of (-1, 4) and (5, -2)?', a: '(2, 1)', w: ['(4, 2)', '(3, 1)', '(-3, 3)'] },
      { q: 'Midpoint of (0, 8) and (6, 0)?', a: '(3, 4)', w: ['(6, 8)', '(3, 8)', '(6, 4)'] },
      { q: 'Midpoint of (10, 10) and (20, 30)?', a: '(15, 20)', w: ['(30, 40)', '(10, 20)', '(5, 10)'] },
      { q: 'Midpoint of (-6, 0) and (0, 8)?', a: '(-3, 4)', w: ['(-6, 8)', '(3, 4)', '(-3, -4)'] },
      { q: 'Midpoint of (a, b) and (c, d) is:', a: '((a+c)/2, (b+d)/2)', w: ['(a+c, b+d)', '(ac, bd)', '((a-c)/2, (b-d)/2)'] },
      { q: 'Midpoint of (4, -2) and (-4, 2)?', a: '(0, 0)', w: ['(4, 2)', '(0, 4)', '(8, 0)'] },
      { q: 'Midpoint of (7, 3) and (1, 9)?', a: '(4, 6)', w: ['(8, 12)', '(3, 3)', '(6, 6)'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('midpoint-formula', p.q, p.a, p.w, 2, '8-12', 'Geometry', ['midpoint', 'coordinate']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'quadrants': (count) => {
    const problems = [];
    const qs = [
      { q: 'Point (3, 5) is in which quadrant?', a: 'I', w: ['II', 'III', 'IV'] },
      { q: 'Point (-2, 4) is in which quadrant?', a: 'II', w: ['I', 'III', 'IV'] },
      { q: 'Point (-5, -3) is in which quadrant?', a: 'III', w: ['I', 'II', 'IV'] },
      { q: 'Point (7, -2) is in which quadrant?', a: 'IV', w: ['I', 'II', 'III'] },
      { q: 'In which quadrant are both coordinates positive?', a: 'I', w: ['II', 'III', 'IV'] },
      { q: 'In which quadrant is x negative and y positive?', a: 'II', w: ['I', 'III', 'IV'] },
      { q: 'Point (0, 5) lies on the:', a: 'y-axis', w: ['x-axis', 'Quadrant I', 'origin'] },
      { q: 'Point (-4, 0) lies on the:', a: 'x-axis', w: ['y-axis', 'Quadrant II', 'origin'] },
      { q: 'Where does (-1, -7) lie?', a: 'Quadrant III', w: ['Quadrant I', 'Quadrant II', 'Quadrant IV'] },
      { q: 'Point (6, -9) is in quadrant:', a: 'IV', w: ['I', 'II', 'III'] },
      { q: 'In Quadrant III, the signs of (x, y) are:', a: '(-, -)', w: ['(+, +)', '(-, +)', '(+, -)'] },
      { q: 'Which quadrant has x > 0 and y < 0?', a: 'IV', w: ['I', 'II', 'III'] },
      { q: 'The origin (0, 0) is in:', a: 'no quadrant', w: ['Quadrant I', 'all quadrants', 'Quadrant III'] },
      { q: 'Point (-8, 1) is in which quadrant?', a: 'II', w: ['I', 'III', 'IV'] },
      { q: 'If sin θ > 0 and cos θ < 0, θ is in quadrant:', a: 'II', w: ['I', 'III', 'IV'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('quadrants', p.q, p.a, p.w, 1, '5-8', 'Geometry', ['coordinate', 'quadrants']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'factoring-difference-squares': (count) => {
    const problems = [];
    const qs = [
      { q: 'Factor: x² - 9', a: '(x + 3)(x - 3)', w: ['(x - 3)²', '(x + 9)(x - 1)', 'x(x - 9)'] },
      { q: 'Factor: x² - 25', a: '(x + 5)(x - 5)', w: ['(x - 5)²', '(x + 25)(x - 1)', 'x(x - 25)'] },
      { q: 'Factor: 4x² - 1', a: '(2x + 1)(2x - 1)', w: ['(4x + 1)(x - 1)', '(2x - 1)²', '4(x² - 1)'] },
      { q: 'Factor: x² - 16', a: '(x + 4)(x - 4)', w: ['(x - 4)²', '(x + 8)(x - 2)', 'x(x - 16)'] },
      { q: 'Factor: 9x² - 4', a: '(3x + 2)(3x - 2)', w: ['(9x + 2)(x - 2)', '(3x - 2)²', '(3x + 4)(3x - 1)'] },
      { q: 'Factor: x² - 49', a: '(x + 7)(x - 7)', w: ['(x - 7)²', '(x + 49)(x - 1)', 'x(x - 49)'] },
      { q: 'Factor: 16x² - 9', a: '(4x + 3)(4x - 3)', w: ['(4x - 3)²', '(16x + 3)(x - 3)', '(8x + 3)(2x - 3)'] },
      { q: 'Factor: x² - 1', a: '(x + 1)(x - 1)', w: ['(x - 1)²', 'x(x - 1)', '(x + 1)²'] },
      { q: 'Factor: 25x² - 36', a: '(5x + 6)(5x - 6)', w: ['(5x - 6)²', '(25x + 6)(x - 6)', '(5x + 36)(5x - 1)'] },
      { q: 'Factor: x² - 100', a: '(x + 10)(x - 10)', w: ['(x - 10)²', '(x + 100)(x - 1)', 'x(x - 100)'] },
      { q: 'Factor: 4x² - 25', a: '(2x + 5)(2x - 5)', w: ['(2x - 5)²', '(4x + 5)(x - 5)', '2(2x² - 25)'] },
      { q: 'Factor: x⁴ - 1', a: '(x² + 1)(x + 1)(x - 1)', w: ['(x² - 1)²', '(x + 1)(x - 1)', '(x⁴ + 1)(x⁴ - 1)'] },
      { q: 'Factor: 49 - x²', a: '(7 + x)(7 - x)', w: ['(7 - x)²', '-(x + 7)(x - 7)', '(x + 7)(x - 7)'] },
      { q: 'Factor: 81x² - 64', a: '(9x + 8)(9x - 8)', w: ['(9x - 8)²', '(81x + 8)(x - 8)', '(9x + 64)(9x - 1)'] },
      { q: 'Factor: x²y² - 4', a: '(xy + 2)(xy - 2)', w: ['(xy - 2)²', 'xy(xy - 4)', '(x + 2)(y - 2)'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('factoring-difference-squares', p.q, p.a, p.w, 3, '8-12', 'Expressions & Equations', ['factoring', 'algebra']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'percent-change': (count) => {
    const problems = [];
    const qs = [
      { q: 'Price goes from $50 to $60. Percent increase?', a: '20%', w: ['10%', '$10', '12%'] },
      { q: 'Population drops from 1000 to 800. Percent decrease?', a: '20%', w: ['200%', '25%', '80%'] },
      { q: 'Stock rises from $25 to $30. Percent change?', a: '20%', w: ['5%', '$5', '16.7%'] },
      { q: 'Weight drops from 200 lb to 180 lb. Percent decrease?', a: '10%', w: ['20 lb', '20%', '11%'] },
      { q: 'Price increases from $80 to $100. Percent increase?', a: '25%', w: ['20%', '$20', '80%'] },
      { q: 'Value goes from 40 to 50. Percent change?', a: '25%', w: ['10%', '20%', '50%'] },
      { q: 'Sales drop from $500 to $400. Percent decrease?', a: '20%', w: ['25%', '$100', '80%'] },
      { q: 'Temperature rises from 60°F to 75°F. Percent increase?', a: '25%', w: ['15%', '20%', '12.5%'] },
      { q: 'Cost goes from $120 to $90. Percent decrease?', a: '25%', w: ['30%', '$30', '75%'] },
      { q: 'Score improves from 70 to 84. Percent increase?', a: '20%', w: ['14%', '16.7%', '84%'] },
      { q: 'Enrollment changes from 500 to 600. Percent change?', a: '20%', w: ['100%', '16.7%', '600%'] },
      { q: 'Rent increases from $1000 to $1150. Percent increase?', a: '15%', w: ['$150', '13%', '87%'] },
      { q: 'A $40 item is now $48. Percent markup?', a: '20%', w: ['8%', '$8', '16.7%'] },
      { q: 'Grade drops from 95 to 76. Percent decrease?', a: '20%', w: ['19%', '25%', '80%'] },
      { q: 'Quantity goes from 25 to 30. Percent increase?', a: '20%', w: ['5%', '16.7%', '25%'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('percent-change', p.q, p.a, p.w, 2, '5-8', 'Ratios & Proportional Relationships', ['percent', 'change']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  // ==========================================================================
  // BATCH 3: GEOMETRY TRANSFORMATIONS & SHAPES (hand-verified)
  // ==========================================================================

  'similarity': (count) => {
    const problems = [];
    const qs = [
      { q: 'Triangles ABC and DEF are similar. If AB=6, BC=8, and DE=9, find EF.', a: '12', w: ['10', '8', '14'] },
      { q: 'Two similar rectangles have widths 4 and 10. If the smaller has length 6, find the larger length.', a: '15', w: ['12', '16', '20'] },
      { q: 'A 5 ft person casts a 3 ft shadow. A tree casts a 15 ft shadow. How tall is the tree?', a: '25 ft', w: ['45 ft', '20 ft', '9 ft'] },
      { q: 'Similar triangles have sides 3,4,5 and 6,8,x. Find x.', a: '10', w: ['9', '12', '7'] },
      { q: 'The ratio of sides of similar triangles is 2:3. Ratio of their areas?', a: '4:9', w: ['2:3', '6:9', '8:27'] },
      { q: 'Similar pentagons have perimeters 20 and 35. Ratio of their sides?', a: '4:7', w: ['20:35', '5:7', '2:3'] },
      { q: 'A photo 4x6 is enlarged to width 10. New height?', a: '15', w: ['12', '16', '8'] },
      { q: 'Similar triangles have areas 16 and 25. Ratio of corresponding sides?', a: '4:5', w: ['16:25', '2:5', '8:10'] },
      { q: 'A model car is 1:24 scale. If model is 8 inches, actual car length?', a: '192 inches', w: ['32 inches', '96 inches', '288 inches'] },
      { q: 'Two similar cylinders have radii 2 and 5. Ratio of volumes?', a: '8:125', w: ['2:5', '4:25', '4:10'] },
      { q: 'If ΔABC ~ ΔXYZ with ratio 3:5, and AB=12, find XY.', a: '20', w: ['15', '7.2', '36'] },
      { q: 'Similar triangles: sides 5,7,9 and 10,14,x. Find x.', a: '18', w: ['16', '20', '12'] },
      { q: 'A map scale is 1 inch = 20 miles. Two cities are 3.5 inches apart. Actual distance?', a: '70 miles', w: ['60 miles', '80 miles', '35 miles'] },
      { q: 'For similar figures, if linear ratio is 1:4, volume ratio is:', a: '1:64', w: ['1:4', '1:16', '1:8'] },
      { q: 'If two figures are similar, their corresponding angles are:', a: 'equal', w: ['proportional', 'supplementary', 'complementary'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('similarity', p.q, p.a, p.w, 3, '8-12', 'Geometry', ['similarity']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'congruence': (count) => {
    const problems = [];
    const qs = [
      { q: 'Which postulate proves triangles congruent if all three sides are equal?', a: 'SSS', w: ['SAS', 'ASA', 'AAS'] },
      { q: 'Two triangles have 2 sides and the included angle equal. Congruence postulate?', a: 'SAS', w: ['SSS', 'ASA', 'SSA'] },
      { q: 'Congruent figures have the same:', a: 'shape and size', w: ['shape only', 'size only', 'neither'] },
      { q: 'Which is NOT a valid congruence postulate?', a: 'SSA', w: ['SSS', 'SAS', 'AAS'] },
      { q: 'If ΔABC ≅ ΔDEF, then AB = ?', a: 'DE', w: ['EF', 'DF', 'FE'] },
      { q: 'Two right triangles have equal hypotenuse and one leg. Congruence by:', a: 'HL', w: ['SSS', 'SAS', 'SSA'] },
      { q: 'ASA requires two angles and:', a: 'the included side', w: ['any side', 'the longest side', 'no side'] },
      { q: 'Congruent triangles have corresponding angles that are:', a: 'equal', w: ['supplementary', 'complementary', 'proportional'] },
      { q: 'CPCTC stands for:', a: 'Corresponding Parts of Congruent Triangles are Congruent', w: ['Congruent Parts Create Two Congruences', 'None of these', 'Cannot determine'] },
      { q: 'If ΔPQR ≅ ΔXYZ, then ∠Q = ?', a: '∠Y', w: ['∠X', '∠Z', '∠P'] },
      { q: 'Two triangles with sides 3,4,5 and 3,4,5 are:', a: 'congruent', w: ['similar only', 'neither', 'cannot determine'] },
      { q: 'AAS requires:', a: 'two angles and a non-included side', w: ['two angles and included side', 'three angles', 'two sides'] },
      { q: 'If ΔABC ≅ ΔDEF and BC = 7, then EF = ?', a: '7', w: ['DE', 'cannot determine', 'DF'] },
      { q: 'If ∠A = ∠D, ∠B = ∠E, AB = DE, congruent by:', a: 'AAS or ASA', w: ['SSS', 'SAS', 'HL'] },
      { q: 'Can 3 pairs of equal angles prove congruence?', a: 'No, only similarity', w: ['Yes, AAA', 'Yes, if right', 'Yes always'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('congruence', p.q, p.a, p.w, 3, '8-12', 'Geometry', ['congruence']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'translations': (count) => {
    const problems = [];
    const qs = [
      { q: 'Point (3, 5) translated 4 right and 2 up becomes:', a: '(7, 7)', w: ['(7, 3)', '(-1, 7)', '(3, 11)'] },
      { q: 'Translate (2, -1) by vector ⟨-3, 4⟩:', a: '(-1, 3)', w: ['(5, 3)', '(-1, -5)', '(2, 3)'] },
      { q: '(0, 0) translated 5 left and 3 down:', a: '(-5, -3)', w: ['(5, 3)', '(-5, 3)', '(5, -3)'] },
      { q: 'A translation moves (1, 2) to (4, 6). Where does (3, 1) go?', a: '(6, 5)', w: ['(6, 3)', '(0, -3)', '(4, 2)'] },
      { q: 'Translation vector from (2, 3) to (5, 1)?', a: '⟨3, -2⟩', w: ['⟨-3, 2⟩', '⟨3, 2⟩', '⟨7, 4⟩'] },
      { q: 'Translate triangle vertex (1, 1) by ⟨2, 3⟩:', a: '(3, 4)', w: ['(2, 3)', '(-1, -2)', '(3, 1)'] },
      { q: 'A translation preserves:', a: 'size, shape, and orientation', w: ['only size', 'only shape', 'only orientation'] },
      { q: '(-4, 2) translated 6 right:', a: '(2, 2)', w: ['(-10, 2)', '(-4, 8)', '(2, -4)'] },
      { q: 'Point (5, 5) after translation ⟨-5, -5⟩:', a: '(0, 0)', w: ['(10, 10)', '(0, 10)', '(5, 0)'] },
      { q: 'To move from (1, 4) to (-2, 7), translation is:', a: '⟨-3, 3⟩', w: ['⟨3, 3⟩', '⟨-3, -3⟩', '⟨3, -3⟩'] },
      { q: 'Translating twice: ⟨2, 1⟩ then ⟨3, -2⟩ equals:', a: '⟨5, -1⟩', w: ['⟨6, -2⟩', '⟨5, 3⟩', '⟨-1, 3⟩'] },
      { q: '(a, b) translated by ⟨h, k⟩ gives:', a: '(a+h, b+k)', w: ['(a-h, b-k)', '(ah, bk)', '(a+k, b+h)'] },
      { q: 'A shape translated is ___ to the original:', a: 'congruent', w: ['similar', 'larger', 'smaller'] },
      { q: 'Translate (-3, -2) up 5 units:', a: '(-3, 3)', w: ['(2, -2)', '(-3, -7)', '(-8, -2)'] },
      { q: 'If translation maps A to A\', then AA\' is:', a: 'parallel to translation vector', w: ['perpendicular', 'equal to 0', 'undefined'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('translations', p.q, p.a, p.w, 2, '8-12', 'Geometry', ['transformations']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'reflections': (count) => {
    const problems = [];
    const qs = [
      { q: 'Reflect (3, 2) over the x-axis:', a: '(3, -2)', w: ['(-3, 2)', '(-3, -2)', '(2, 3)'] },
      { q: 'Reflect (4, -1) over the y-axis:', a: '(-4, -1)', w: ['(4, 1)', '(-4, 1)', '(1, -4)'] },
      { q: 'Reflect (2, 5) over the line y = x:', a: '(5, 2)', w: ['(-2, -5)', '(2, -5)', '(-5, -2)'] },
      { q: 'Reflect (-3, 4) over the x-axis:', a: '(-3, -4)', w: ['(3, 4)', '(3, -4)', '(-4, 3)'] },
      { q: 'Point (0, 5) reflected over y-axis:', a: '(0, 5)', w: ['(0, -5)', '(5, 0)', '(-5, 0)'] },
      { q: 'Reflect (1, 1) over y = x:', a: '(1, 1)', w: ['(-1, -1)', '(-1, 1)', '(1, -1)'] },
      { q: 'Reflect (6, 0) over the y-axis:', a: '(-6, 0)', w: ['(6, 0)', '(0, 6)', '(0, -6)'] },
      { q: 'Reflect (-2, -3) over x-axis:', a: '(-2, 3)', w: ['(2, -3)', '(2, 3)', '(-3, -2)'] },
      { q: 'A reflection preserves:', a: 'size and shape', w: ['orientation', 'position', 'nothing'] },
      { q: 'Reflect (4, 7) over the line y = 3:', a: '(4, -1)', w: ['(4, 10)', '(-4, 7)', '(4, 3)'] },
      { q: 'Reflect (a, b) over x-axis gives:', a: '(a, -b)', w: ['(-a, b)', '(-a, -b)', '(b, a)'] },
      { q: 'Reflect (5, 2) over y = 0:', a: '(5, -2)', w: ['(-5, 2)', '(5, 2)', '(-5, -2)'] },
      { q: 'Line of reflection for (2, 3) → (-2, 3):', a: 'y-axis', w: ['x-axis', 'y = x', 'y = 3'] },
      { q: 'Reflect (-1, 6) over y = x:', a: '(6, -1)', w: ['(-6, 1)', '(1, -6)', '(-1, 6)'] },
      { q: 'Distance from point to reflection line equals:', a: 'distance from image to line', w: ['twice the distance', 'half', 'zero'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('reflections', p.q, p.a, p.w, 2, '8-12', 'Geometry', ['transformations']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'rotations': (count) => {
    const problems = [];
    const qs = [
      { q: 'Rotate (1, 0) by 90° counterclockwise about origin:', a: '(0, 1)', w: ['(0, -1)', '(-1, 0)', '(1, 0)'] },
      { q: 'Rotate (0, 3) by 180° about origin:', a: '(0, -3)', w: ['(3, 0)', '(-3, 0)', '(0, 3)'] },
      { q: 'Rotate (2, 0) by 270° counterclockwise about origin:', a: '(0, -2)', w: ['(0, 2)', '(-2, 0)', '(2, 0)'] },
      { q: '90° clockwise rotation of (3, 4) about origin:', a: '(4, -3)', w: ['(-4, 3)', '(-3, -4)', '(3, -4)'] },
      { q: 'Rotate (1, 1) by 180° about origin:', a: '(-1, -1)', w: ['(1, -1)', '(-1, 1)', '(1, 1)'] },
      { q: 'A 360° rotation returns the point to:', a: 'original position', w: ['opposite position', 'y-axis', 'x-axis'] },
      { q: 'Rotate (-2, 3) by 90° counterclockwise:', a: '(-3, -2)', w: ['(3, -2)', '(2, -3)', '(-2, -3)'] },
      { q: 'A rotation preserves:', a: 'size, shape, and distance from center', w: ['only orientation', 'only position', 'nothing'] },
      { q: '180° rotation of (5, -2):', a: '(-5, 2)', w: ['(5, 2)', '(-5, -2)', '(2, -5)'] },
      { q: 'Point (0, 0) rotated any amount stays at:', a: '(0, 0)', w: ['undefined', 'moves to (1,0)', 'depends on angle'] },
      { q: '90° CCW rotation formula: (x, y) →', a: '(-y, x)', w: ['(y, -x)', '(y, x)', '(-x, -y)'] },
      { q: 'Rotate (4, 0) by 90° CCW:', a: '(0, 4)', w: ['(-4, 0)', '(0, -4)', '(4, 0)'] },
      { q: 'A 270° CCW rotation equals:', a: '90° clockwise', w: ['90° CCW', '180°', '360°'] },
      { q: 'Rotate (-1, 2) by 180°:', a: '(1, -2)', w: ['(-1, -2)', '(1, 2)', '(2, -1)'] },
      { q: 'Center of rotation is the point that:', a: 'stays fixed', w: ['moves most', 'rotates 360°', 'disappears'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('rotations', p.q, p.a, p.w, 3, '8-12', 'Geometry', ['transformations']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'dilations': (count) => {
    const problems = [];
    const qs = [
      { q: 'Dilate (2, 4) by scale factor 3 from origin:', a: '(6, 12)', w: ['(5, 7)', '(6, 4)', '(2, 12)'] },
      { q: 'Dilate (6, 9) by factor 1/3 from origin:', a: '(2, 3)', w: ['(18, 27)', '(3, 6)', '(6, 3)'] },
      { q: 'A scale factor of 2 makes a figure:', a: 'twice as large', w: ['half as large', 'same size', 'four times'] },
      { q: 'Dilate (4, -2) by factor 2 from origin:', a: '(8, -4)', w: ['(6, 0)', '(4, -4)', '(8, -2)'] },
      { q: 'Scale factor k < 1 produces:', a: 'a reduction', w: ['an enlargement', 'same size', 'undefined'] },
      { q: 'Dilate (3, 0) by factor 5:', a: '(15, 0)', w: ['(8, 0)', '(3, 5)', '(0, 15)'] },
      { q: 'A dilation preserves:', a: 'shape and angles', w: ['size', 'perimeter', 'area'] },
      { q: 'Dilate (-2, 6) by factor 1/2:', a: '(-1, 3)', w: ['(-4, 12)', '(-1, 6)', '(-2, 3)'] },
      { q: 'If scale factor is 4, area ratio is:', a: '16:1', w: ['4:1', '8:1', '2:1'] },
      { q: 'Dilate (0, 5) by factor 3:', a: '(0, 15)', w: ['(3, 5)', '(0, 8)', '(15, 0)'] },
      { q: 'Point (a, b) dilated by k from origin:', a: '(ka, kb)', w: ['(a+k, b+k)', '(a/k, b/k)', '(ak, bk)'] },
      { q: 'Scale factor 1 produces:', a: 'congruent figure', w: ['smaller', 'larger', 'no figure'] },
      { q: 'Dilate (10, 5) by 0.1:', a: '(1, 0.5)', w: ['(100, 50)', '(1, 5)', '(10, 0.5)'] },
      { q: 'Perimeter ratio for scale factor 3:', a: '3:1', w: ['9:1', '6:1', '1:3'] },
      { q: 'Dilate (-4, -8) by factor 1/4:', a: '(-1, -2)', w: ['(-16, -32)', '(-1, -8)', '(-4, -2)'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('dilations', p.q, p.a, p.w, 3, '8-12', 'Geometry', ['transformations']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'similar-figures': (count) => {
    const problems = [];
    const qs = [
      { q: 'Similar figures have proportional ___ and equal ___.', a: 'sides; angles', w: ['angles; sides', 'areas; perimeters', 'perimeters; areas'] },
      { q: 'Rectangle A is 3×4. Similar Rectangle B has width 6. Its length?', a: '8', w: ['12', '7', '10'] },
      { q: 'Two similar triangles have side ratio 2:5. Area ratio?', a: '4:25', w: ['2:5', '4:10', '2:25'] },
      { q: 'A 4×6 photo enlarged to width 10. New height?', a: '15', w: ['12', '14', '8'] },
      { q: 'Similar polygons have perimeters 15 and 25. Side ratio?', a: '3:5', w: ['15:25', '9:25', '5:3'] },
      { q: 'If figures are similar with scale 1:3, volume ratio is:', a: '1:27', w: ['1:3', '1:9', '3:27'] },
      { q: 'Similar squares have sides 5 and 10. Area ratio?', a: '1:4', w: ['1:2', '5:10', '25:100'] },
      { q: 'Two similar pentagons have sides 4 and 12. Scale factor?', a: '1:3', w: ['4:12', '3:1', '1:4'] },
      { q: 'Model 1:50 scale. Model height 6 cm means actual:', a: '300 cm', w: ['56 cm', '50 cm', '600 cm'] },
      { q: 'Similar triangles: sides 5,12,13 and 10,24,?', a: '26', w: ['13', '20', '36'] },
      { q: 'The symbol ~ means:', a: 'similar to', w: ['congruent to', 'equal to', 'perpendicular to'] },
      { q: 'If ΔABC ~ ΔDEF, then AB/DE = ?', a: 'BC/EF = AC/DF', w: ['BC/DF', 'AC/EF', 'AB/DF'] },
      { q: 'All circles are:', a: 'similar', w: ['congruent', 'neither', 'proportional'] },
      { q: 'Similar rectangles: 2×6 and 3×?', a: '9', w: ['7', '12', '6'] },
      { q: 'Two similar cubes have edges 2 and 4. Surface area ratio?', a: '1:4', w: ['1:2', '1:8', '2:4'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('similar-figures', p.q, p.a, p.w, 3, '8-12', 'Geometry', ['similarity']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'identify-shapes': (count) => {
    const problems = [];
    const qs = [
      { q: 'A polygon with 6 sides is called a:', a: 'hexagon', w: ['pentagon', 'octagon', 'heptagon'] },
      { q: 'A quadrilateral with 4 right angles and 4 equal sides is a:', a: 'square', w: ['rectangle', 'rhombus', 'parallelogram'] },
      { q: 'A triangle with all sides equal is:', a: 'equilateral', w: ['isosceles', 'scalene', 'right'] },
      { q: 'A polygon with 8 sides:', a: 'octagon', w: ['hexagon', 'decagon', 'heptagon'] },
      { q: 'A quadrilateral with exactly one pair of parallel sides:', a: 'trapezoid', w: ['parallelogram', 'rectangle', 'rhombus'] },
      { q: 'A triangle with a 90° angle:', a: 'right triangle', w: ['acute triangle', 'obtuse triangle', 'equilateral'] },
      { q: 'A parallelogram with 4 equal sides:', a: 'rhombus', w: ['rectangle', 'square', 'trapezoid'] },
      { q: 'A polygon with 5 sides:', a: 'pentagon', w: ['quadrilateral', 'hexagon', 'heptagon'] },
      { q: 'A triangle with 2 equal sides:', a: 'isosceles', w: ['equilateral', 'scalene', 'right'] },
      { q: 'A polygon with 10 sides:', a: 'decagon', w: ['octagon', 'nonagon', 'dodecagon'] },
      { q: 'A quadrilateral with opposite sides parallel:', a: 'parallelogram', w: ['trapezoid', 'kite', 'irregular quad'] },
      { q: 'A 3D shape with 6 faces:', a: 'cube or rectangular prism', w: ['pyramid', 'cylinder', 'sphere'] },
      { q: 'A regular polygon has:', a: 'all sides and angles equal', w: ['only sides equal', 'only angles equal', 'neither'] },
      { q: 'A triangle with no equal sides:', a: 'scalene', w: ['isosceles', 'equilateral', 'right'] },
      { q: 'A quadrilateral with 4 right angles:', a: 'rectangle', w: ['rhombus', 'trapezoid', 'parallelogram'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('identify-shapes', p.q, p.a, p.w, 1, 'K-5', 'Geometry', ['shapes']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'classify-shapes': (count) => {
    const problems = [];
    const qs = [
      { q: 'Classify triangle with angles 60°, 60°, 60°:', a: 'equilateral and acute', w: ['isosceles right', 'scalene acute', 'obtuse'] },
      { q: 'A quadrilateral with sides 5,5,5,5 and no right angles is:', a: 'rhombus', w: ['square', 'rectangle', 'trapezoid'] },
      { q: 'Triangle with sides 3, 4, 5 is:', a: 'scalene right triangle', w: ['isosceles right', 'equilateral', 'obtuse'] },
      { q: 'Quadrilateral with 4 right angles and unequal sides:', a: 'rectangle', w: ['square', 'rhombus', 'parallelogram'] },
      { q: 'Triangle with angles 30°, 60°, 90°:', a: 'scalene right triangle', w: ['isosceles', 'equilateral', 'obtuse'] },
      { q: 'Quadrilateral with one pair parallel, other pair not:', a: 'trapezoid', w: ['parallelogram', 'rectangle', 'rhombus'] },
      { q: 'Triangle with angles 50°, 50°, 80°:', a: 'isosceles acute', w: ['scalene', 'right', 'obtuse'] },
      { q: 'Quadrilateral ABCD with AB∥CD and AD∥BC:', a: 'parallelogram', w: ['trapezoid', 'kite', 'irregular'] },
      { q: 'Triangle with sides 7, 7, 10:', a: 'isosceles', w: ['equilateral', 'scalene', 'right'] },
      { q: 'Shape with 4 equal sides and 4 right angles:', a: 'square', w: ['rhombus', 'rectangle', 'parallelogram'] },
      { q: 'Triangle with angles 100°, 40°, 40°:', a: 'isosceles obtuse', w: ['scalene acute', 'right', 'equilateral'] },
      { q: 'Pentagon with all sides 6 and all angles 108°:', a: 'regular pentagon', w: ['irregular pentagon', 'hexagon', 'convex pentagon'] },
      { q: 'Quadrilateral with perpendicular diagonals of unequal length:', a: 'kite', w: ['rhombus', 'square', 'rectangle'] },
      { q: 'Triangle with all angles less than 90°:', a: 'acute triangle', w: ['right triangle', 'obtuse triangle', 'scalene'] },
      { q: '4 sides, opposite sides equal, no right angles:', a: 'parallelogram (not rectangle)', w: ['rectangle', 'square', 'trapezoid'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('classify-shapes', p.q, p.a, p.w, 2, 'K-5', 'Geometry', ['shapes', 'classification']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  '2d-shapes': (count) => {
    const problems = [];
    const qs = [
      { q: 'How many sides does a triangle have?', a: '3', w: ['4', '2', '5'] },
      { q: 'A circle has how many corners?', a: '0', w: ['1', 'infinite', '4'] },
      { q: 'How many vertices does a rectangle have?', a: '4', w: ['2', '6', '8'] },
      { q: 'Sum of angles in a quadrilateral:', a: '360°', w: ['180°', '540°', '720°'] },
      { q: 'A regular hexagon has interior angles of:', a: '120° each', w: ['90° each', '60° each', '180° each'] },
      { q: 'Number of diagonals in a pentagon:', a: '5', w: ['2', '10', '3'] },
      { q: 'Sum of interior angles of a triangle:', a: '180°', w: ['360°', '90°', '270°'] },
      { q: 'A parallelogram has ___ pairs of parallel sides:', a: '2', w: ['1', '0', '4'] },
      { q: 'Number of lines of symmetry in a square:', a: '4', w: ['2', '1', '8'] },
      { q: 'Each interior angle of a regular octagon:', a: '135°', w: ['120°', '144°', '150°'] },
      { q: 'A rhombus has how many lines of symmetry?', a: '2', w: ['4', '1', '0'] },
      { q: 'Opposite angles in a parallelogram are:', a: 'equal', w: ['supplementary', 'complementary', '90°'] },
      { q: 'Sum of exterior angles of any polygon:', a: '360°', w: ['180°', '720°', 'depends on sides'] },
      { q: 'Interior angle of regular triangle:', a: '60°', w: ['90°', '45°', '120°'] },
      { q: 'A kite has ___ pair(s) of consecutive equal sides:', a: '2', w: ['1', '0', '4'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('2d-shapes', p.q, p.a, p.w, 1, 'K-5', 'Geometry', ['shapes', '2d']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  '3d-shapes': (count) => {
    const problems = [];
    const qs = [
      { q: 'A cube has how many faces?', a: '6', w: ['4', '8', '12'] },
      { q: 'A cylinder has how many edges?', a: '2', w: ['0', '3', '4'] },
      { q: 'A triangular prism has how many vertices?', a: '6', w: ['5', '8', '9'] },
      { q: 'A sphere has how many faces?', a: '1 (curved)', w: ['0', '2', 'infinite'] },
      { q: 'A rectangular prism has how many edges?', a: '12', w: ['8', '6', '10'] },
      { q: 'A cone has how many vertices?', a: '1', w: ['0', '2', '3'] },
      { q: 'A square pyramid has how many faces?', a: '5', w: ['4', '6', '8'] },
      { q: 'A tetrahedron has ___ faces:', a: '4', w: ['3', '5', '6'] },
      { q: 'A cylinder has how many flat faces?', a: '2', w: ['0', '1', '3'] },
      { q: 'Euler\'s formula for polyhedra: V - E + F = ?', a: '2', w: ['0', '1', '4'] },
      { q: 'A cube has how many vertices?', a: '8', w: ['6', '12', '4'] },
      { q: 'A hexagonal prism has how many faces?', a: '8', w: ['6', '12', '7'] },
      { q: 'A cone has how many edges?', a: '1', w: ['0', '2', '3'] },
      { q: 'A pentagonal pyramid has ___ vertices:', a: '6', w: ['5', '10', '7'] },
      { q: 'A triangular prism has ___ edges:', a: '9', w: ['6', '8', '12'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('3d-shapes', p.q, p.a, p.w, 2, 'K-5', 'Geometry', ['shapes', '3d']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'position-words': (count) => {
    const problems = [];
    const qs = [
      { q: 'A lamp sits on top of a desk. The lamp is ___ the desk.', a: 'on', w: ['under', 'beside', 'behind'] },
      { q: 'A rug is directly below a table. The rug is ___ the table.', a: 'under', w: ['on', 'above', 'beside'] },
      { q: 'A kite flies higher than the trees. The kite is ___ the trees.', a: 'above', w: ['under', 'beside', 'below'] },
      { q: 'Tom is in line. Sara is right after Tom. Sara is ___ Tom.', a: 'behind', w: ['in front of', 'above', 'under'] },
      { q: 'A chair is to the left of a couch. The chair is ___ the couch.', a: 'beside', w: ['on', 'under', 'above'] },
      { q: 'Amy stands with Joe on her left and Max on her right. Amy is ___ Joe and Max.', a: 'between', w: ['beside', 'behind', 'above'] },
      { q: 'A subway runs underneath a street. The subway is ___ the street.', a: 'below', w: ['above', 'beside', 'on'] },
      { q: 'A boat floats on top of the lake. The boat is ___ the water.', a: 'on', w: ['in', 'under', 'beside'] },
      { q: 'A bridge goes from one side of the river to the other. You walk ___ the bridge.', a: 'across', w: ['under', 'beside', 'into'] },
      { q: 'A tunnel goes through a mountain. Cars drive ___ the tunnel.', a: 'through', w: ['on', 'above', 'beside'] },
      { q: 'A clock hangs higher than a door. The clock is ___ the door.', a: 'above', w: ['under', 'beside', 'below'] },
      { q: 'A cat hides directly underneath a bed. The cat is ___ the bed.', a: 'under', w: ['on', 'beside', 'above'] },
      { q: 'Two houses are side by side. House A is ___ House B.', a: 'next to', w: ['on', 'under', 'above'] },
      { q: 'A plane is higher than the clouds. The plane is ___ the clouds.', a: 'above', w: ['below', 'beside', 'under'] },
      { q: 'A fish swims inside a tank of water. The fish is ___ the water.', a: 'in', w: ['on', 'above', 'beside'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('position-words', p.q, p.a, p.w, 1, 'K-5', 'Geometry', ['position', 'spatial']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'make-ten': (count) => {
    const problems = [];
    const qs = [
      { q: '8 + 5 = ? (Hint: 8 + 2 = 10, then add 3 more)', a: '13', w: ['12', '14', '15'] },
      { q: '7 + 6 = ? (Hint: 7 + 3 = 10, then add 3 more)', a: '13', w: ['12', '14', '11'] },
      { q: '9 + 4 = ? (Hint: 9 + 1 = 10, then add 3 more)', a: '13', w: ['12', '14', '11'] },
      { q: '6 + 5 = ? (Hint: 6 + 4 = 10, then add 1 more)', a: '11', w: ['10', '12', '9'] },
      { q: '8 + 7 = ? (Hint: 8 + 2 = 10, then add 5 more)', a: '15', w: ['14', '16', '13'] },
      { q: '9 + 6 = ? (Hint: 9 + 1 = 10, then add 5 more)', a: '15', w: ['14', '16', '13'] },
      { q: '7 + 5 = ? (Hint: 7 + 3 = 10, then add 2 more)', a: '12', w: ['11', '13', '10'] },
      { q: '8 + 4 = ? (Hint: 8 + 2 = 10, then add 2 more)', a: '12', w: ['11', '13', '10'] },
      { q: '9 + 7 = ? (Hint: 9 + 1 = 10, then add 6 more)', a: '16', w: ['15', '17', '14'] },
      { q: '6 + 8 = ? (Hint: 8 + 2 = 10, then add 4 more)', a: '14', w: ['13', '15', '12'] },
      { q: 'What number added to 7 makes 10?', a: '3', w: ['2', '4', '7'] },
      { q: 'What number added to 6 makes 10?', a: '4', w: ['3', '5', '6'] },
      { q: 'What number added to 8 makes 10?', a: '2', w: ['1', '3', '8'] },
      { q: 'What number added to 9 makes 10?', a: '1', w: ['0', '2', '9'] },
      { q: '5 + 7 = ? (Hint: 5 + 5 = 10, then add 2 more)', a: '12', w: ['11', '13', '10'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('make-ten', p.q, p.a, p.w, 1, 'K-5', 'Operations & Algebraic Thinking', ['addition', 'make-ten']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'doubles-near-doubles': (count) => {
    const problems = [];
    const qs = [
      { q: '6 + 7 = ? (Hint: 6 + 6 = 12, then add 1 more)', a: '13', w: ['12', '14', '11'] },
      { q: '7 + 8 = ? (Hint: 7 + 7 = 14, then add 1 more)', a: '15', w: ['14', '16', '13'] },
      { q: '8 + 9 = ? (Hint: 8 + 8 = 16, then add 1 more)', a: '17', w: ['16', '18', '15'] },
      { q: '5 + 6 = ? (Hint: 5 + 5 = 10, then add 1 more)', a: '11', w: ['10', '12', '9'] },
      { q: '4 + 5 = ? (Hint: 4 + 4 = 8, then add 1 more)', a: '9', w: ['8', '10', '7'] },
      { q: '3 + 4 = ? (Hint: 3 + 3 = 6, then add 1 more)', a: '7', w: ['6', '8', '5'] },
      { q: '9 + 10 = ? (Hint: 9 + 9 = 18, then add 1 more)', a: '19', w: ['18', '20', '17'] },
      { q: '6 + 6 = ? (This is a doubles fact)', a: '12', w: ['11', '13', '10'] },
      { q: '7 + 7 = ? (This is a doubles fact)', a: '14', w: ['13', '15', '12'] },
      { q: '8 + 8 = ? (This is a doubles fact)', a: '16', w: ['15', '17', '14'] },
      { q: '9 + 9 = ? (This is a doubles fact)', a: '18', w: ['17', '19', '16'] },
      { q: '5 + 5 = ? (This is a doubles fact)', a: '10', w: ['9', '11', '8'] },
      { q: '4 + 4 = ? (This is a doubles fact)', a: '8', w: ['7', '9', '6'] },
      { q: '3 + 3 = ? (This is a doubles fact)', a: '6', w: ['5', '7', '4'] },
      { q: '6 + 5 = ? (Hint: 5 + 5 = 10, then add 1 more)', a: '11', w: ['10', '12', '9'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('doubles-near-doubles', p.q, p.a, p.w, 1, 'K-5', 'Operations & Algebraic Thinking', ['addition', 'doubles']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'parent-functions': (count) => {
    const problems = [];
    const qs = [
      { q: 'The parent function f(x) = x² is called a:', a: 'quadratic function', w: ['linear function', 'cubic function', 'absolute value function'] },
      { q: 'The parent function f(x) = |x| is called a:', a: 'absolute value function', w: ['linear function', 'quadratic function', 'square root function'] },
      { q: 'The parent function f(x) = √x is called a:', a: 'square root function', w: ['quadratic function', 'cubic function', 'linear function'] },
      { q: 'The parent function f(x) = x is called a:', a: 'linear function', w: ['quadratic function', 'constant function', 'identity function'] },
      { q: 'The parent function f(x) = x³ is called a:', a: 'cubic function', w: ['quadratic function', 'linear function', 'exponential function'] },
      { q: 'The parent function f(x) = 1/x is called a:', a: 'reciprocal function', w: ['linear function', 'rational function', 'inverse function'] },
      { q: 'The parent function f(x) = 2^x is called a:', a: 'exponential function', w: ['quadratic function', 'power function', 'logarithmic function'] },
      { q: 'The parent function f(x) = log(x) is called a:', a: 'logarithmic function', w: ['exponential function', 'rational function', 'power function'] },
      { q: 'Which parent function has a V-shaped graph?', a: 'f(x) = |x|', w: ['f(x) = x²', 'f(x) = x', 'f(x) = √x'] },
      { q: 'Which parent function has a U-shaped graph (parabola)?', a: 'f(x) = x²', w: ['f(x) = |x|', 'f(x) = x³', 'f(x) = x'] },
      { q: 'Which parent function passes through the origin with slope 1?', a: 'f(x) = x', w: ['f(x) = x²', 'f(x) = |x|', 'f(x) = 1/x'] },
      { q: 'Which parent function has domain x ≥ 0?', a: 'f(x) = √x', w: ['f(x) = x²', 'f(x) = |x|', 'f(x) = x'] },
      { q: 'Which parent function has a horizontal asymptote at y = 0?', a: 'f(x) = 2^x', w: ['f(x) = x²', 'f(x) = x', 'f(x) = |x|'] },
      { q: 'Which parent function has vertical asymptote at x = 0?', a: 'f(x) = 1/x', w: ['f(x) = x²', 'f(x) = √x', 'f(x) = |x|'] },
      { q: 'The graph of f(x) = x³ passes through which point?', a: '(1, 1) and (-1, -1)', w: ['(1, 1) only', '(0, 1)', '(-1, 1)'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('parent-functions', p.q, p.a, p.w, 3, '8-12', 'Functions', ['functions', 'parent']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'function-families': (count) => {
    const problems = [];
    const qs = [
      { q: 'f(x) = 3x² - 2x + 1 belongs to which function family?', a: 'quadratic', w: ['linear', 'cubic', 'exponential'] },
      { q: 'f(x) = 5x - 7 belongs to which function family?', a: 'linear', w: ['quadratic', 'constant', 'exponential'] },
      { q: 'f(x) = 2^x + 3 belongs to which function family?', a: 'exponential', w: ['quadratic', 'linear', 'logarithmic'] },
      { q: 'f(x) = log₂(x) - 1 belongs to which function family?', a: 'logarithmic', w: ['exponential', 'rational', 'polynomial'] },
      { q: 'f(x) = (x+1)/(x-2) belongs to which function family?', a: 'rational', w: ['linear', 'polynomial', 'exponential'] },
      { q: 'f(x) = x⁴ - 3x² + 2 belongs to which function family?', a: 'polynomial', w: ['quadratic', 'exponential', 'rational'] },
      { q: 'f(x) = |2x - 5| belongs to which function family?', a: 'absolute value', w: ['linear', 'quadratic', 'piecewise'] },
      { q: 'f(x) = √(x + 4) belongs to which function family?', a: 'square root (radical)', w: ['quadratic', 'rational', 'exponential'] },
      { q: 'f(x) = sin(x) belongs to which function family?', a: 'trigonometric', w: ['exponential', 'polynomial', 'rational'] },
      { q: 'Which family has graphs that are parabolas?', a: 'quadratic', w: ['linear', 'exponential', 'cubic'] },
      { q: 'Which family has graphs that are straight lines?', a: 'linear', w: ['quadratic', 'absolute value', 'exponential'] },
      { q: 'Which family shows rapid growth or decay?', a: 'exponential', w: ['linear', 'quadratic', 'polynomial'] },
      { q: 'f(x) = 5 (constant) belongs to which family?', a: 'constant (polynomial degree 0)', w: ['linear', 'zero function', 'undefined'] },
      { q: 'f(x) = x³ + 2x belongs to which function family?', a: 'cubic (polynomial)', w: ['quadratic', 'exponential', 'linear'] },
      { q: 'Which family has graphs with asymptotes?', a: 'rational and exponential', w: ['linear only', 'quadratic only', 'polynomial only'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('function-families', p.q, p.a, p.w, 3, '8-12', 'Functions', ['functions', 'families']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'function-transformations': (count) => {
    const problems = [];
    const qs = [
      { q: 'g(x) = f(x) + 3 shifts the graph of f(x) how?', a: '3 units up', w: ['3 units down', '3 units left', '3 units right'] },
      { q: 'g(x) = f(x) - 5 shifts the graph of f(x) how?', a: '5 units down', w: ['5 units up', '5 units left', '5 units right'] },
      { q: 'g(x) = f(x - 2) shifts the graph of f(x) how?', a: '2 units right', w: ['2 units left', '2 units up', '2 units down'] },
      { q: 'g(x) = f(x + 4) shifts the graph of f(x) how?', a: '4 units left', w: ['4 units right', '4 units up', '4 units down'] },
      { q: 'g(x) = -f(x) transforms the graph of f(x) how?', a: 'reflects over x-axis', w: ['reflects over y-axis', 'shifts up', 'shifts down'] },
      { q: 'g(x) = f(-x) transforms the graph of f(x) how?', a: 'reflects over y-axis', w: ['reflects over x-axis', 'shifts left', 'shifts right'] },
      { q: 'g(x) = 2f(x) transforms the graph of f(x) how?', a: 'vertical stretch by factor of 2', w: ['horizontal stretch', 'shifts up 2', 'vertical compression'] },
      { q: 'g(x) = f(2x) transforms the graph of f(x) how?', a: 'horizontal compression by factor of 2', w: ['horizontal stretch', 'vertical stretch', 'shifts right'] },
      { q: 'g(x) = (1/2)f(x) transforms the graph how?', a: 'vertical compression by factor of 1/2', w: ['vertical stretch', 'horizontal compression', 'shifts down'] },
      { q: 'g(x) = f(x/2) transforms the graph how?', a: 'horizontal stretch by factor of 2', w: ['horizontal compression', 'vertical stretch', 'shifts right'] },
      { q: 'y = (x - 3)² + 2 is y = x² shifted how?', a: '3 right and 2 up', w: ['3 left and 2 up', '3 right and 2 down', '3 left and 2 down'] },
      { q: 'y = |x + 1| - 4 is y = |x| shifted how?', a: '1 left and 4 down', w: ['1 right and 4 down', '1 left and 4 up', '1 right and 4 up'] },
      { q: 'To shift f(x) = x² right 5 units, write:', a: 'f(x) = (x - 5)²', w: ['f(x) = (x + 5)²', 'f(x) = x² - 5', 'f(x) = x² + 5'] },
      { q: 'To reflect f(x) = √x over the x-axis, write:', a: 'g(x) = -√x', w: ['g(x) = √(-x)', 'g(x) = √x - 1', 'g(x) = -√(-x)'] },
      { q: 'g(x) = 3f(x - 1) + 2 combines which transformations?', a: 'right 1, stretch ×3, up 2', w: ['left 1, stretch ×3, up 2', 'right 1, compress, down 2', 'left 1, compress, up 2'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('function-transformations', p.q, p.a, p.w, 3, '8-12', 'Functions', ['functions', 'transformations']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'vertical-shift': (count) => {
    const problems = [];
    const qs = [
      { q: 'f(x) = x² + 4 is f(x) = x² shifted how?', a: '4 units up', w: ['4 units down', '4 units left', '4 units right'] },
      { q: 'f(x) = x² - 3 is f(x) = x² shifted how?', a: '3 units down', w: ['3 units up', '3 units left', '3 units right'] },
      { q: 'f(x) = |x| + 7 is f(x) = |x| shifted how?', a: '7 units up', w: ['7 units down', '7 units left', '7 units right'] },
      { q: 'f(x) = √x - 2 is f(x) = √x shifted how?', a: '2 units down', w: ['2 units up', '2 units left', '2 units right'] },
      { q: 'To shift y = x² up 5 units, write:', a: 'y = x² + 5', w: ['y = x² - 5', 'y = (x + 5)²', 'y = (x - 5)²'] },
      { q: 'To shift y = |x| down 6 units, write:', a: 'y = |x| - 6', w: ['y = |x| + 6', 'y = |x - 6|', 'y = |x + 6|'] },
      { q: 'The vertex of y = x² + 3 is at:', a: '(0, 3)', w: ['(3, 0)', '(0, -3)', '(-3, 0)'] },
      { q: 'The vertex of y = x² - 5 is at:', a: '(0, -5)', w: ['(0, 5)', '(-5, 0)', '(5, 0)'] },
      { q: 'Adding k to f(x) moves the graph:', a: 'up if k > 0, down if k < 0', w: ['left if k > 0', 'right if k > 0', 'no change'] },
      { q: 'y = 2^x + 1 has horizontal asymptote at:', a: 'y = 1', w: ['y = 0', 'y = 2', 'x = 1'] },
      { q: 'y = log(x) - 4 is y = log(x) shifted:', a: '4 units down', w: ['4 units up', '4 units left', '4 units right'] },
      { q: 'If f(x) passes through (2, 5), then f(x) + 3 passes through:', a: '(2, 8)', w: ['(5, 5)', '(2, 2)', '(5, 8)'] },
      { q: 'y = sin(x) + 2 oscillates between:', a: '1 and 3', w: ['-1 and 1', '0 and 2', '-2 and 2'] },
      { q: 'The minimum value of y = x² + 4 is:', a: '4', w: ['0', '-4', 'none'] },
      { q: 'y = 1/x + 3 has horizontal asymptote at:', a: 'y = 3', w: ['y = 0', 'y = 1', 'x = 3'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('vertical-shift', p.q, p.a, p.w, 2, '8-12', 'Functions', ['functions', 'transformations', 'vertical']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'horizontal-shift': (count) => {
    const problems = [];
    const qs = [
      { q: 'f(x) = (x - 3)² is f(x) = x² shifted how?', a: '3 units right', w: ['3 units left', '3 units up', '3 units down'] },
      { q: 'f(x) = (x + 2)² is f(x) = x² shifted how?', a: '2 units left', w: ['2 units right', '2 units up', '2 units down'] },
      { q: 'f(x) = |x - 5| is f(x) = |x| shifted how?', a: '5 units right', w: ['5 units left', '5 units up', '5 units down'] },
      { q: 'f(x) = √(x + 4) is f(x) = √x shifted how?', a: '4 units left', w: ['4 units right', '4 units up', '4 units down'] },
      { q: 'To shift y = x² right 6 units, write:', a: 'y = (x - 6)²', w: ['y = (x + 6)²', 'y = x² + 6', 'y = x² - 6'] },
      { q: 'To shift y = |x| left 3 units, write:', a: 'y = |x + 3|', w: ['y = |x - 3|', 'y = |x| + 3', 'y = |x| - 3'] },
      { q: 'The vertex of y = (x - 4)² is at:', a: '(4, 0)', w: ['(-4, 0)', '(0, 4)', '(0, -4)'] },
      { q: 'The vertex of y = (x + 1)² is at:', a: '(-1, 0)', w: ['(1, 0)', '(0, 1)', '(0, -1)'] },
      { q: 'f(x - h) shifts the graph:', a: 'right if h > 0, left if h < 0', w: ['left if h > 0', 'up if h > 0', 'down if h > 0'] },
      { q: 'y = 2^(x-1) has y-intercept at:', a: '(0, 1/2)', w: ['(0, 2)', '(0, 1)', '(1, 2)'] },
      { q: 'y = log(x - 2) has vertical asymptote at:', a: 'x = 2', w: ['x = 0', 'x = -2', 'y = 2'] },
      { q: 'If f(x) passes through (3, 7), then f(x - 2) passes through:', a: '(5, 7)', w: ['(1, 7)', '(3, 5)', '(3, 9)'] },
      { q: 'y = sin(x - π/2) is y = sin(x) shifted:', a: 'π/2 units right', w: ['π/2 units left', 'π/2 units up', 'π/2 units down'] },
      { q: 'The domain of y = √(x - 3) is:', a: 'x ≥ 3', w: ['x ≥ 0', 'x ≥ -3', 'all real numbers'] },
      { q: 'y = 1/(x + 2) has vertical asymptote at:', a: 'x = -2', w: ['x = 2', 'x = 0', 'y = -2'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('horizontal-shift', p.q, p.a, p.w, 2, '8-12', 'Functions', ['functions', 'transformations', 'horizontal']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'function-composition': (count) => {
    const problems = [];
    const qs = [
      { q: 'If f(x) = 2x and g(x) = x + 3, find (f ∘ g)(x).', a: '2(x + 3) = 2x + 6', w: ['2x + 3', 'x + 6', '2x · (x + 3)'] },
      { q: 'If f(x) = x² and g(x) = x + 1, find (f ∘ g)(x).', a: '(x + 1)²', w: ['x² + 1', 'x² + x + 1', 'x³'] },
      { q: 'If f(x) = x + 5 and g(x) = 3x, find (g ∘ f)(x).', a: '3(x + 5) = 3x + 15', w: ['3x + 5', 'x + 15', '3x · 5'] },
      { q: 'If f(x) = √x and g(x) = x - 4, find (f ∘ g)(x).', a: '√(x - 4)', w: ['√x - 4', '√x - √4', 'x - 4'] },
      { q: '(f ∘ g)(x) means:', a: 'f(g(x))', w: ['g(f(x))', 'f(x) · g(x)', 'f(x) + g(x)'] },
      { q: 'If f(x) = 2x and g(x) = x², find (f ∘ g)(3).', a: '18', w: ['36', '12', '9'] },
      { q: 'If f(x) = x - 1 and g(x) = x², find (g ∘ f)(4).', a: '9', w: ['15', '16', '8'] },
      { q: 'If f(x) = 3x and g(x) = x + 2, find (f ∘ g)(1).', a: '9', w: ['5', '6', '7'] },
      { q: 'If f(x) = x² and g(x) = 2x, find (g ∘ f)(3).', a: '18', w: ['36', '12', '6'] },
      { q: 'For f(x) = x + 1 and g(x) = x - 1, (f ∘ g)(x) = ?', a: 'x', w: ['x + 2', 'x - 2', '2x'] },
      { q: 'If f(x) = 1/x and g(x) = x + 2, find (f ∘ g)(x).', a: '1/(x + 2)', w: ['1/x + 2', '(1/x) + 2', 'x + 2'] },
      { q: 'If h(x) = (f ∘ g)(x) where f(x) = x³ and g(x) = 2x, then h(x) = ?', a: '(2x)³ = 8x³', w: ['2x³', '6x³', '2x + 3'] },
      { q: 'The domain of (f ∘ g)(x) depends on:', a: 'domain of g and range of g fitting domain of f', w: ['domain of f only', 'domain of g only', 'range of f'] },
      { q: 'If f(x) = |x| and g(x) = x - 3, find (f ∘ g)(1).', a: '2', w: ['-2', '4', '3'] },
      { q: 'Is (f ∘ g)(x) always equal to (g ∘ f)(x)?', a: 'No, composition is not commutative', w: ['Yes, always', 'Only for linear functions', 'Only when f = g'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('function-composition', p.q, p.a, p.w, 3, '8-12', 'Functions', ['functions', 'composition']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'nested-operations': (count) => {
    const problems = [];
    const qs = [
      { q: 'Evaluate: 2 × (3 + 4)', a: '14', w: ['10', '9', '24'] },
      { q: 'Evaluate: (8 - 2) × 5', a: '30', w: ['35', '3', '38'] },
      { q: 'Evaluate: 20 ÷ (2 + 3)', a: '4', w: ['13', '7', '25'] },
      { q: 'Evaluate: 3 × (4 × 2)', a: '24', w: ['14', '20', '9'] },
      { q: 'Evaluate: (12 ÷ 4) + (3 × 2)', a: '9', w: ['5', '12', '7'] },
      { q: 'Evaluate: 5 + 2 × (6 - 1)', a: '15', w: ['35', '25', '30'] },
      { q: 'Evaluate: (9 + 3) ÷ (6 - 2)', a: '3', w: ['2', '4', '6'] },
      { q: 'Evaluate: 4 × (5 + 3) - 10', a: '22', w: ['32', '12', '27'] },
      { q: 'Evaluate: 100 ÷ (5 × 4)', a: '5', w: ['80', '20', '500'] },
      { q: 'Evaluate: (2 + 3) × (4 + 1)', a: '25', w: ['10', '15', '20'] },
      { q: 'Evaluate: 6 + (8 ÷ 2) × 3', a: '18', w: ['21', '12', '24'] },
      { q: 'Evaluate: (15 - 5) ÷ (1 + 1)', a: '5', w: ['10', '4', '6'] },
      { q: 'Evaluate: 2 × ((4 + 2) × 3)', a: '36', w: ['18', '14', '24'] },
      { q: 'Evaluate: (3 + 7) × (10 - 8)', a: '20', w: ['12', '2', '100'] },
      { q: 'Evaluate: 50 ÷ (2 × (3 + 2))', a: '5', w: ['10', '25', '100'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('nested-operations', p.q, p.a, p.w, 2, 'K-5', 'Operations & Algebraic Thinking', ['operations', 'order-of-operations']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'simplify-rational-expressions': (count) => {
    const problems = [];
    const qs = [
      { q: 'Simplify: (2x)/(4x)', a: '1/2', w: ['2', 'x/2', '2/x'] },
      { q: 'Simplify: (6x²)/(3x)', a: '2x', w: ['2x²', '3x', '2'] },
      { q: 'Simplify: (x² - 4)/(x - 2)', a: 'x + 2', w: ['x - 2', 'x² - 2', '2x'] },
      { q: 'Simplify: (x² - 9)/(x + 3)', a: 'x - 3', w: ['x + 3', 'x² - 3', '3x'] },
      { q: 'Simplify: (x² + 5x)/(x)', a: 'x + 5', w: ['x² + 5', '5x', '5'] },
      { q: 'Simplify: (3x + 6)/(3)', a: 'x + 2', w: ['3x + 2', 'x + 6', '9x'] },
      { q: 'Simplify: (x² - x)/(x)', a: 'x - 1', w: ['x² - 1', 'x', '-1'] },
      { q: 'Simplify: (4x² - 4x)/(4x)', a: 'x - 1', w: ['x² - 1', '4x - 4', 'x - 4'] },
      { q: 'Simplify: (x² - 1)/(x - 1)', a: 'x + 1', w: ['x - 1', '1', 'x² + 1'] },
      { q: 'Simplify: (2x² + 4x)/(2x)', a: 'x + 2', w: ['x² + 2', '2x + 4', 'x + 4'] },
      { q: 'Simplify: (x³)/(x²)', a: 'x', w: ['x²', 'x³', '1'] },
      { q: 'Simplify: (5x - 10)/(x - 2)', a: '5', w: ['x - 2', '5x', '5x - 5'] },
      { q: 'Simplify: (x² + 2x + 1)/(x + 1)', a: 'x + 1', w: ['x + 2', 'x² + 1', '2x + 1'] },
      { q: 'When simplifying rational expressions, we can cancel:', a: 'common factors only', w: ['any terms', 'any numbers', 'anything that looks the same'] },
      { q: 'Simplify: (x² - 4x)/(x² - 16) when x ≠ ±4', a: 'x/(x + 4)', w: ['(x-4)/(x+4)', '4/16', 'x/4'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('simplify-rational-expressions', p.q, p.a, p.w, 3, '8-12', 'Expressions & Equations', ['rational', 'simplify']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'add-subtract-rational-expressions': (count) => {
    const problems = [];
    const qs = [
      { q: 'Add: (2/x) + (3/x)', a: '5/x', w: ['5/2x', '6/x²', '5/x²'] },
      { q: 'Subtract: (5/x) - (2/x)', a: '3/x', w: ['3/2x', '7/x', '3'] },
      { q: 'Add: (1/x) + (1/y)', a: '(y + x)/(xy)', w: ['2/xy', '1/(x+y)', '(x+y)/2'] },
      { q: 'Add: (x/2) + (x/3)', a: '(5x)/6', w: ['2x/5', 'x/5', '(x²)/6'] },
      { q: 'Subtract: (3/x) - (1/x)', a: '2/x', w: ['2/x²', '4/x', '3/x²'] },
      { q: 'Add: (2/(x+1)) + (3/(x+1))', a: '5/(x+1)', w: ['5/(2x+2)', '6/(x+1)²', '5/2(x+1)'] },
      { q: 'The LCD of 1/x and 1/(x+1) is:', a: 'x(x+1)', w: ['x + (x+1)', 'x²', '(x+1)²'] },
      { q: 'Add: (1/2) + (1/x)', a: '(x + 2)/(2x)', w: ['3/2x', '(1+x)/2x', '2/x'] },
      { q: 'Subtract: (x/(x-1)) - (1/(x-1))', a: '(x-1)/(x-1) = 1', w: ['(x-1)/1', 'x/1', '(x+1)/(x-1)'] },
      { q: 'Add: (a/b) + (c/b)', a: '(a + c)/b', w: ['(a+c)/2b', 'ac/b²', '(a·c)/b'] },
      { q: 'To add rational expressions with different denominators:', a: 'find LCD, rewrite each fraction, then add numerators', w: ['add denominators', 'multiply numerators', 'cross multiply'] },
      { q: 'Subtract: (4/x²) - (1/x)', a: '(4 - x)/x²', w: ['3/x²', '3/x', '(4-1)/(x²-x)'] },
      { q: 'Add: ((x+1)/x) + (1/x)', a: '(x + 2)/x', w: ['(x+2)/2x', '(x+1)/x²', '2(x+1)/x'] },
      { q: 'The LCD of 1/x² and 1/x is:', a: 'x²', w: ['x', 'x³', '2x'] },
      { q: 'Subtract: (2x/(x+2)) - (4/(x+2))', a: '(2x - 4)/(x+2)', w: ['(2x-4)/(2x+4)', '-2/(x+2)', '2x-4'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('add-subtract-rational-expressions', p.q, p.a, p.w, 3, '8-12', 'Expressions & Equations', ['rational', 'addition', 'subtraction']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'multiply-rational-expressions': (count) => {
    const problems = [];
    const qs = [
      { q: 'Multiply: (2/x) × (3/y)', a: '6/(xy)', w: ['5/xy', '6/(x+y)', '6xy'] },
      { q: 'Multiply: (x/2) × (4/x)', a: '2', w: ['4x/2x', '2x', '4/2'] },
      { q: 'Multiply: (x²/3) × (6/x)', a: '2x', w: ['6x²/3x', '2x²', '6x/3'] },
      { q: 'Multiply: ((x+1)/x) × (x/(x+2))', a: '(x+1)/(x+2)', w: ['1', 'x²/((x+1)(x+2))', '(x+1)(x+2)'] },
      { q: 'Multiply: (3/a) × (a²/9)', a: 'a/3', w: ['3a/9', 'a²/3', '3a²/9a'] },
      { q: 'Multiply: ((x-1)/(x+1)) × ((x+1)/(x-1))', a: '1', w: ['(x-1)²/(x+1)²', '(x+1)/(x-1)', '0'] },
      { q: 'Multiply: (5x/2) × (4/10x)', a: '1', w: ['20x/20x', 'x', '2'] },
      { q: 'Multiply: ((x²-4)/(x+3)) × (1/(x-2))', a: '(x+2)/(x+3)', w: ['(x²-4)/(x+3)(x-2)', '(x-2)/(x+3)', '1'] },
      { q: 'When multiplying rational expressions:', a: 'multiply numerators together and denominators together', w: ['cross multiply', 'find LCD', 'add numerators'] },
      { q: 'Multiply: (2x/5) × (15/4x²)', a: '3/(2x)', w: ['30x/20x²', '6/x', '3/2x²'] },
      { q: 'Multiply: ((a+b)/c) × (c/(a-b))', a: '(a+b)/(a-b)', w: ['c²/((a+b)(a-b))', '1', '(a+b)(a-b)/c²'] },
      { q: 'Simplify after multiplying: (x/3) × (9/x²)', a: '3/x', w: ['9x/3x²', '3x', '9/3x'] },
      { q: 'Multiply: ((x²-1)/(x)) × ((x)/(x+1))', a: 'x - 1', w: ['x² - 1', '(x²-1)/(x+1)', 'x/(x+1)'] },
      { q: 'Before multiplying, you should first:', a: 'factor and cancel common factors', w: ['find LCD', 'add fractions', 'flip the second fraction'] },
      { q: 'Multiply: (4/(x-2)) × ((x-2)/8)', a: '1/2', w: ['4/8', '(x-2)²/32', '32/(x-2)²'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('multiply-rational-expressions', p.q, p.a, p.w, 3, '8-12', 'Expressions & Equations', ['rational', 'multiplication']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'divide-rational-expressions': (count) => {
    const problems = [];
    const qs = [
      { q: 'Divide: (2/x) ÷ (4/x)', a: '1/2', w: ['2', '8/x²', 'x/2'] },
      { q: 'Divide: (x/2) ÷ (x/4)', a: '2', w: ['1/2', 'x²/8', '4/2'] },
      { q: 'Divide: (6/a) ÷ (3/a²)', a: '2a', w: ['2/a', '18/a³', '2a²'] },
      { q: 'To divide rational expressions:', a: 'multiply by the reciprocal of the divisor', w: ['divide numerators and denominators', 'cross multiply', 'find LCD'] },
      { q: 'Divide: (x²/4) ÷ (x/2)', a: 'x/2', w: ['x²/2x', 'x/4', '2x'] },
      { q: 'Divide: ((x+1)/3) ÷ ((x+1)/6)', a: '2', w: ['1/2', '(x+1)²/18', '6/3'] },
      { q: 'Divide: (a/b) ÷ (c/d)', a: '(ad)/(bc)', w: ['(ac)/(bd)', '(a/b)·(c/d)', '(a+c)/(b+d)'] },
      { q: 'Divide: ((x²-9)/(x+2)) ÷ ((x-3)/(x+2))', a: 'x + 3', w: ['x - 3', '(x²-9)/(x-3)', '(x+2)²'] },
      { q: 'Divide: (5x/7) ÷ (10x/21)', a: '3/2', w: ['2/3', '50x²/147', '15/2'] },
      { q: 'Divide: (1/x) ÷ (1/x²)', a: 'x', w: ['1/x³', 'x²', '1'] },
      { q: 'The reciprocal of (x+1)/(x-1) is:', a: '(x-1)/(x+1)', w: ['(x+1)/(x-1)', '-(x+1)/(x-1)', '1'] },
      { q: 'Divide: ((x²-4)/(x)) ÷ ((x+2)/(x²))', a: 'x(x-2)', w: ['(x-2)/x', '(x²-4)/x³', 'x²(x-2)'] },
      { q: 'Divide: (3/(x-1)) ÷ (9/(x-1)²)', a: '(x-1)/3', w: ['27/(x-1)³', '3(x-1)', '1/3'] },
      { q: 'Divide: (4x²/5) ÷ (2x/15)', a: '6x', w: ['8x³/75', '2x/3', '6x²'] },
      { q: 'Divide: ((a-b)/(a+b)) ÷ ((a-b)/(a+b))', a: '1', w: ['(a-b)²/(a+b)²', '0', '(a+b)/(a-b)'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('divide-rational-expressions', p.q, p.a, p.w, 3, '8-12', 'Expressions & Equations', ['rational', 'division']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'systems-special-cases': (count) => {
    const problems = [];
    const qs = [
      { q: 'If two lines are parallel, the system has:', a: 'no solution', w: ['one solution', 'infinitely many solutions', 'two solutions'] },
      { q: 'If two lines are the same (coincident), the system has:', a: 'infinitely many solutions', w: ['no solution', 'one solution', 'two solutions'] },
      { q: 'y = 2x + 3 and y = 2x + 5 have:', a: 'no solution (parallel lines)', w: ['one solution', 'infinitely many solutions', 'two solutions'] },
      { q: '2x + 4y = 8 and x + 2y = 4 have:', a: 'infinitely many solutions (same line)', w: ['no solution', 'one solution', 'two solutions'] },
      { q: 'A system with no solution is called:', a: 'inconsistent', w: ['consistent', 'dependent', 'independent'] },
      { q: 'A system with infinitely many solutions is called:', a: 'dependent', w: ['inconsistent', 'independent', 'unsolvable'] },
      { q: 'x + y = 5 and x + y = 7 have:', a: 'no solution', w: ['one solution at (6, -1)', 'infinitely many', '(5, 7)'] },
      { q: '3x - 6y = 12 and x - 2y = 4 have:', a: 'infinitely many solutions', w: ['no solution', 'one solution', 'two solutions'] },
      { q: 'When solving and you get 0 = 5, the system has:', a: 'no solution', w: ['x = 5', 'infinitely many', 'one solution'] },
      { q: 'When solving and you get 0 = 0, the system has:', a: 'infinitely many solutions', w: ['no solution', 'x = 0', 'one solution'] },
      { q: 'Lines with same slope but different y-intercepts are:', a: 'parallel (no solution)', w: ['identical', 'intersecting', 'perpendicular'] },
      { q: 'y = 3x + 2 and 6x - 2y = -4 have:', a: 'infinitely many solutions', w: ['no solution', 'one solution', 'the lines are perpendicular'] },
      { q: 'If a/d = b/e ≠ c/f for ax+by=c and dx+ey=f:', a: 'no solution (parallel)', w: ['one solution', 'infinitely many', 'cannot determine'] },
      { q: 'If a/d = b/e = c/f for ax+by=c and dx+ey=f:', a: 'infinitely many solutions', w: ['no solution', 'one solution', 'two solutions'] },
      { q: '4x + 2y = 10 and 2x + y = 5 are:', a: 'the same line (dependent)', w: ['parallel lines', 'intersecting at one point', 'perpendicular'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('systems-special-cases', p.q, p.a, p.w, 3, '8-12', 'Expressions & Equations', ['systems', 'special-cases']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'systems-of-inequalities': (count) => {
    const problems = [];
    const qs = [
      { q: 'A solution to a system of inequalities must satisfy:', a: 'all inequalities in the system', w: ['at least one inequality', 'exactly one inequality', 'the average of all'] },
      { q: 'The solution region for y > x and y < 3 is:', a: 'the overlap of both shaded regions', w: ['either shaded region', 'the boundary lines', 'outside both regions'] },
      { q: 'Is (2, 4) a solution to y > x and y ≤ 5?', a: 'Yes (4 > 2 and 4 ≤ 5)', w: ['No', 'Only satisfies one', 'Cannot determine'] },
      { q: 'Is (0, 0) a solution to y ≥ x + 1 and y < 2x?', a: 'No (0 ≥ 1 is false)', w: ['Yes', 'Only satisfies second', 'Cannot determine'] },
      { q: 'For y < 2x + 1 and y > -x + 4, the solution is:', a: 'the region where both conditions are true', w: ['the entire plane', 'no solution', 'a single point'] },
      { q: 'A system of two linear inequalities typically has:', a: 'infinitely many solutions (a region)', w: ['exactly one solution', 'no solutions', 'two solutions'] },
      { q: 'If two inequality regions don\'t overlap, the system has:', a: 'no solution', w: ['infinitely many solutions', 'one solution', 'two solutions'] },
      { q: 'Test point (0,0) for y > 2x - 3 and y ≤ x + 1:', a: 'Yes (0 > -3 ✓ and 0 ≤ 1 ✓)', w: ['No', 'Satisfies only first', 'Satisfies only second'] },
      { q: 'The boundary lines of y ≥ x and y ≤ -x + 4 intersect at:', a: '(2, 2)', w: ['(0, 0)', '(4, 4)', '(1, 3)'] },
      { q: 'For x ≥ 0, y ≥ 0, and x + y ≤ 5, the solution region is:', a: 'a triangle in the first quadrant', w: ['the entire plane', 'a line', 'no region'] },
      { q: 'To graph y < x + 2 and y > x - 1, the solution is:', a: 'the region between two parallel lines', w: ['no solution', 'a single line', 'the entire plane'] },
      { q: 'Is (-1, 0) in the solution set of x + y > -2 and 2x - y < 0?', a: 'Yes (-1 > -2 ✓ and -2 < 0 ✓)', w: ['No', 'Satisfies only first', 'Cannot tell'] },
      { q: 'A feasible region is:', a: 'the set of all points satisfying all constraints', w: ['any shaded region', 'the boundary only', 'points outside constraints'] },
      { q: 'The vertices of the solution region are important for:', a: 'linear programming (finding optimal values)', w: ['nothing special', 'graphing only', 'finding no solution'] },
      { q: 'y > x - 1 and y > -x + 3 overlap:', a: 'above both lines', w: ['below both lines', 'between the lines', 'nowhere'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('systems-of-inequalities', p.q, p.a, p.w, 3, '8-12', 'Expressions & Equations', ['systems', 'inequalities']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'graphing-systems-inequalities': (count) => {
    const problems = [];
    const qs = [
      { q: 'For y ≤ 2x + 1, the boundary line is:', a: 'solid (includes equality)', w: ['dashed', 'dotted', 'no line'] },
      { q: 'For y < 3x - 2, the boundary line is:', a: 'dashed (excludes equality)', w: ['solid', 'bold', 'double'] },
      { q: 'To graph y ≥ x, you shade:', a: 'above the line y = x', w: ['below the line', 'on the line only', 'left of the line'] },
      { q: 'For y < -x + 4, shade:', a: 'below the line', w: ['above the line', 'on the line', 'to the right'] },
      { q: 'The solution region of a system is shown by:', a: 'where all shadings overlap', w: ['any shaded area', 'the darkest region', 'boundary lines only'] },
      { q: 'When graphing x ≥ 2, you draw:', a: 'a solid vertical line at x = 2, shade right', w: ['dashed line, shade left', 'horizontal line', 'shade entire plane'] },
      { q: 'To check if (1, 5) is in the solution of y > 2x + 1:', a: 'substitute: 5 > 2(1) + 1 = 3, yes', w: ['no, 5 < 3', 'cannot check', 'only check boundary'] },
      { q: 'The intersection of the boundary lines y = x + 2 and y = -x + 4 is:', a: '(1, 3)', w: ['(2, 4)', '(0, 2)', '(3, 1)'] },
      { q: 'For the system y ≤ x and y ≥ 0 and x ≤ 3:', a: 'solution is a triangle', w: ['solution is a line', 'no solution exists', 'solution is infinite strip'] },
      { q: 'When two inequalities have parallel boundary lines:', a: 'solution may be a strip, one region, or empty', w: ['always no solution', 'always infinite strip', 'always a triangle'] },
      { q: 'A test point is used to determine:', a: 'which side of the boundary to shade', w: ['where lines intersect', 'if the line is solid', 'the slope'] },
      { q: 'If (0,0) does NOT satisfy y > 2x + 1, shade:', a: 'the side not containing (0,0)', w: ['the side with (0,0)', 'both sides', 'neither side'] },
      { q: 'The corner points (vertices) of a solution region are found by:', a: 'solving pairs of boundary equations', w: ['guessing', 'using only test points', 'taking derivatives'] },
      { q: 'For y > x - 1 and y < x + 3, the solution is:', a: 'a strip between two parallel lines', w: ['no solution', 'a triangle', 'a single line'] },
      { q: 'Graphing y ≤ |x| produces:', a: 'V-shape boundary, shading below/inside', w: ['straight line', 'parabola', 'circle'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('graphing-systems-inequalities', p.q, p.a, p.w, 3, '8-12', 'Expressions & Equations', ['graphing', 'systems', 'inequalities']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'absolute-value-inequalities': (count) => {
    const problems = [];
    const qs = [
      { q: 'Solve: |x| < 3', a: '-3 < x < 3', w: ['x < 3', 'x > -3', 'x < -3 or x > 3'] },
      { q: 'Solve: |x| > 5', a: 'x < -5 or x > 5', w: ['-5 < x < 5', 'x > 5', 'x < -5'] },
      { q: 'Solve: |x| ≤ 2', a: '-2 ≤ x ≤ 2', w: ['x ≤ 2', 'x ≥ -2', 'x ≤ -2 or x ≥ 2'] },
      { q: 'Solve: |x| ≥ 4', a: 'x ≤ -4 or x ≥ 4', w: ['-4 ≤ x ≤ 4', 'x ≥ 4', 'x ≤ -4'] },
      { q: 'Solve: |x - 2| < 3', a: '-1 < x < 5', w: ['x < 5', '-3 < x < 3', 'x > -1'] },
      { q: 'Solve: |x + 1| > 4', a: 'x < -5 or x > 3', w: ['-5 < x < 3', 'x > 3', 'x < -5'] },
      { q: 'Solve: |2x| < 6', a: '-3 < x < 3', w: ['x < 3', '-6 < x < 6', 'x < 6'] },
      { q: 'Solve: |x - 3| ≤ 0', a: 'x = 3 (only solution)', w: ['no solution', 'all real numbers', 'x ≤ 3'] },
      { q: 'Solve: |x| < -1', a: 'no solution (absolute value is never negative)', w: ['x < -1', '-1 < x < 1', 'all real numbers'] },
      { q: 'Solve: |x + 2| ≥ 0', a: 'all real numbers', w: ['x ≥ -2', 'x ≥ 0', 'no solution'] },
      { q: '|x| < a (where a > 0) means:', a: '-a < x < a', w: ['x < a', 'x > -a', 'x < -a or x > a'] },
      { q: '|x| > a (where a > 0) means:', a: 'x < -a or x > a', w: ['-a < x < a', 'x > a', 'x < -a'] },
      { q: 'Solve: |3x - 6| ≤ 9', a: '-1 ≤ x ≤ 5', w: ['x ≤ 5', '-3 ≤ x ≤ 3', '0 ≤ x ≤ 5'] },
      { q: 'The graph of |x| < 2 on a number line shows:', a: 'open circles at -2 and 2, shaded between', w: ['closed circles, shaded outside', 'one point at 0', 'shaded to the right of 2'] },
      { q: 'Solve: |x - 1| > 0', a: 'all real numbers except x = 1', w: ['x > 1', 'x < 1', 'all real numbers'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('absolute-value-inequalities', p.q, p.a, p.w, 3, '8-12', 'Expressions & Equations', ['absolute-value', 'inequalities']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'linear-programming': (count) => {
    const problems = [];
    const qs = [
      { q: 'In linear programming, the objective function is:', a: 'what you want to maximize or minimize', w: ['a constraint', 'the feasible region', 'a boundary line'] },
      { q: 'The feasible region in linear programming is:', a: 'the set of points satisfying all constraints', w: ['the objective function', 'always a triangle', 'always unbounded'] },
      { q: 'The optimal solution in linear programming occurs at:', a: 'a vertex (corner point) of the feasible region', w: ['the center of the region', 'any point in the region', 'outside the region'] },
      { q: 'Maximize P = 3x + 2y with vertices (0,0), (4,0), (0,3). Max P is:', a: '12 at (4,0)', w: ['6 at (0,3)', '0 at (0,0)', '14 at (4,3)'] },
      { q: 'Constraints x ≥ 0 and y ≥ 0 restrict solutions to:', a: 'the first quadrant', w: ['the third quadrant', 'the x-axis only', 'the origin only'] },
      { q: 'Minimize C = 5x + 4y at vertices (0,6), (3,2), (6,0). Min C is:', a: '23 at (3,2)', w: ['24 at (0,6)', '30 at (6,0)', '0'] },
      { q: 'If the feasible region is empty, the problem is:', a: 'infeasible (no solution)', w: ['unbounded', 'has infinite solutions', 'optimal at origin'] },
      { q: 'If P = 2x + 2y and the feasible region is a line segment:', a: 'infinitely many optimal solutions may exist', w: ['no solution', 'exactly one solution', 'the problem is infeasible'] },
      { q: 'A company makes x chairs ($50 profit) and y tables ($80 profit). Objective function:', a: 'Maximize P = 50x + 80y', w: ['P = 50 + 80', 'Minimize 50x + 80y', 'P = x + y'] },
      { q: 'Evaluate P = 4x + 5y at (2, 3):', a: '23', w: ['14', '17', '20'] },
      { q: 'If a constraint is x + y ≤ 10 and another is x ≥ 2, vertices include:', a: 'the intersection of boundary lines and axes', w: ['only (0,0)', 'no vertices', 'infinite points'] },
      { q: 'A bounded feasible region has:', a: 'a finite area enclosed by constraints', w: ['infinite area', 'no area', 'negative area'] },
      { q: 'To solve a linear programming problem, first:', a: 'graph constraints and find the feasible region', w: ['guess and check', 'solve the objective function', 'ignore constraints'] },
      { q: 'Maximize P = x + 3y with constraint y ≤ 4 and x ≥ 0. If no upper bound on x:', a: 'the problem is unbounded', w: ['P max = 12', 'P max = 4', 'no solution'] },
      { q: 'Vertices of x ≥ 0, y ≥ 0, x + y ≤ 6, x ≤ 4 are:', a: '(0,0), (4,0), (4,2), (0,6)', w: ['(0,0), (6,0), (0,6)', '(4,2) only', '(0,0), (4,4), (0,6)'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('linear-programming', p.q, p.a, p.w, 3, '8-12', 'Expressions & Equations', ['linear-programming', 'optimization']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'spatial-relationships': (count) => {
    const problems = [];
    const qs = [
      { q: 'Two lines that never intersect and are in the same plane are:', a: 'parallel', w: ['perpendicular', 'intersecting', 'skew'] },
      { q: 'Two lines that intersect at a 90° angle are:', a: 'perpendicular', w: ['parallel', 'skew', 'coincident'] },
      { q: 'Lines in different planes that never intersect are:', a: 'skew', w: ['parallel', 'perpendicular', 'coincident'] },
      { q: 'A point that lies on a line is said to be:', a: 'collinear with other points on that line', w: ['parallel to the line', 'perpendicular', 'skew'] },
      { q: 'Points that lie in the same plane are called:', a: 'coplanar', w: ['collinear', 'perpendicular', 'parallel'] },
      { q: 'The intersection of two planes is:', a: 'a line', w: ['a point', 'a plane', 'empty'] },
      { q: 'A line and a plane can intersect in:', a: 'a point, a line, or not at all', w: ['only a point', 'only a line', 'only in parallel'] },
      { q: 'If two planes are parallel, they:', a: 'never intersect', w: ['intersect in a line', 'intersect at a point', 'are the same plane'] },
      { q: 'A transversal is a line that:', a: 'intersects two or more lines at different points', w: ['is parallel to other lines', 'is perpendicular to all lines', 'never intersects'] },
      { q: 'The distance from a point to a line is measured:', a: 'along the perpendicular from the point to the line', w: ['along any path', 'parallel to the line', 'it cannot be measured'] },
      { q: 'Two segments with the same length are:', a: 'congruent', w: ['parallel', 'perpendicular', 'similar'] },
      { q: 'A ray has:', a: 'one endpoint and extends infinitely in one direction', w: ['two endpoints', 'no endpoints', 'finite length'] },
      { q: 'If point B is between points A and C on a line, then:', a: 'AB + BC = AC', w: ['AB = BC = AC', 'AB × BC = AC', 'AB - BC = AC'] },
      { q: 'Vertical angles are:', a: 'congruent (equal in measure)', w: ['supplementary', 'complementary', 'adjacent'] },
      { q: 'Adjacent angles share:', a: 'a common vertex and a common side', w: ['no common elements', 'only a vertex', 'only a side'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('spatial-relationships', p.q, p.a, p.w, 2, '5-8', 'Geometry', ['spatial', 'relationships']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'symmetry-shapes': (count) => {
    const problems = [];
    const qs = [
      { q: 'A shape with line symmetry can be folded so that:', a: 'both halves match exactly', w: ['it forms a triangle', 'it becomes 3D', 'the halves are different'] },
      { q: 'How many lines of symmetry does a square have?', a: '4', w: ['2', '1', '8'] },
      { q: 'How many lines of symmetry does a rectangle (not square) have?', a: '2', w: ['4', '1', '0'] },
      { q: 'How many lines of symmetry does an equilateral triangle have?', a: '3', w: ['1', '2', '6'] },
      { q: 'How many lines of symmetry does a circle have?', a: 'infinite', w: ['1', '4', '0'] },
      { q: 'A regular hexagon has how many lines of symmetry?', a: '6', w: ['3', '4', '2'] },
      { q: 'How many lines of symmetry does a scalene triangle have?', a: '0', w: ['1', '2', '3'] },
      { q: 'An isosceles triangle has how many lines of symmetry?', a: '1', w: ['2', '3', '0'] },
      { q: 'A regular pentagon has how many lines of symmetry?', a: '5', w: ['2', '3', '10'] },
      { q: 'Rotational symmetry means a shape looks the same after:', a: 'being rotated less than 360°', w: ['being flipped', 'being stretched', 'only at 360°'] },
      { q: 'A square has rotational symmetry of order:', a: '4 (90°, 180°, 270°, 360°)', w: ['2', '1', '8'] },
      { q: 'The letter H has how many lines of symmetry?', a: '2', w: ['1', '0', '4'] },
      { q: 'The letter A has how many lines of symmetry?', a: '1 (vertical)', w: ['2', '0', '3'] },
      { q: 'A parallelogram (not rectangle) has how many lines of symmetry?', a: '0', w: ['2', '1', '4'] },
      { q: 'A regular octagon has how many lines of symmetry?', a: '8', w: ['4', '2', '16'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('symmetry-shapes', p.q, p.a, p.w, 2, 'K-5', 'Geometry', ['symmetry', 'shapes']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'line-symmetry': (count) => {
    const problems = [];
    const qs = [
      { q: 'A line of symmetry divides a shape into:', a: 'two identical mirror-image halves', w: ['two different halves', 'three equal parts', 'unequal pieces'] },
      { q: 'Which letter has a vertical line of symmetry?', a: 'A', w: ['F', 'G', 'J'] },
      { q: 'Which letter has a horizontal line of symmetry?', a: 'B', w: ['F', 'G', 'L'] },
      { q: 'A heart shape typically has:', a: '1 vertical line of symmetry', w: ['2 lines', 'no lines', '4 lines'] },
      { q: 'Which shape has exactly 1 line of symmetry?', a: 'isosceles triangle', w: ['square', 'equilateral triangle', 'circle'] },
      { q: 'A line of symmetry is also called:', a: 'axis of symmetry or mirror line', w: ['diagonal', 'median', 'altitude'] },
      { q: 'If you fold along a line of symmetry:', a: 'both sides match up perfectly', w: ['one side is larger', 'the shape becomes 3D', 'nothing happens'] },
      { q: 'Which number has a horizontal line of symmetry?', a: '8', w: ['2', '5', '7'] },
      { q: 'Which number has a vertical line of symmetry?', a: '8', w: ['2', '5', '6'] },
      { q: 'A butterfly typically has:', a: '1 vertical line of symmetry', w: ['no symmetry', '2 lines', '4 lines'] },
      { q: 'Which word has a vertical line of symmetry through its center?', a: 'MOM', w: ['DAD', 'SIS', 'CAT'] },
      { q: 'A regular polygon with n sides has:', a: 'n lines of symmetry', w: ['1 line', '2 lines', 'n/2 lines'] },
      { q: 'Which capital letter has both horizontal and vertical symmetry?', a: 'H', w: ['A', 'B', 'D'] },
      { q: 'An irregular shape typically has:', a: 'no lines of symmetry', w: ['1 line', 'many lines', 'infinite lines'] },
      { q: 'To test for line symmetry, you can:', a: 'fold the shape along the line', w: ['rotate the shape', 'stretch the shape', 'color the shape'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('line-symmetry', p.q, p.a, p.w, 2, 'K-5', 'Geometry', ['symmetry', 'line']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'create-symmetry': (count) => {
    const problems = [];
    const qs = [
      { q: 'To complete a symmetrical design, you must:', a: 'mirror the existing part across the line of symmetry', w: ['copy it exactly beside it', 'rotate it 90°', 'make it larger'] },
      { q: 'If the left half of a symmetric shape has a triangle pointing right, the right half has:', a: 'a triangle pointing left', w: ['a triangle pointing right', 'no triangle', 'a square'] },
      { q: 'When creating symmetry with a vertical axis, a point 3 units left of the axis maps to:', a: '3 units right of the axis', w: ['3 units up', '3 units down', 'the same spot'] },
      { q: 'To make pattern symmetric about a horizontal line, reflect shapes:', a: 'above the line to below, and vice versa', w: ['left to right', 'diagonally', 'at 45 degrees'] },
      { q: 'A half-finished symmetric drawing shows a star on the left. To complete it:', a: 'draw a mirror image star on the right', w: ['draw another star next to it', 'color the star', 'erase the star'] },
      { q: 'When reflecting a shape over a line, distances from the line are:', a: 'preserved (equal on both sides)', w: ['doubled', 'halved', 'changed randomly'] },
      { q: 'To create a design with 2 lines of symmetry:', a: 'make it symmetric both horizontally and vertically', w: ['use only diagonal lines', 'make it circular', 'use only one reflection'] },
      { q: 'If a dot is at coordinates (2, 5) and the axis is x = 0, its reflection is at:', a: '(-2, 5)', w: ['(2, -5)', '(-2, -5)', '(5, 2)'] },
      { q: 'Creating rotational symmetry involves:', a: 'rotating a design around a center point', w: ['folding in half', 'stretching equally', 'translating sideways'] },
      { q: 'A snowflake design typically uses:', a: '6-fold rotational symmetry', w: ['no symmetry', '2-fold symmetry', '3-fold symmetry'] },
      { q: 'To complete a pattern with point symmetry (180° rotation):', a: 'rotate the partial design 180° around the center', w: ['flip it horizontally', 'flip it vertically', 'make it larger'] },
      { q: 'If the top half of a symmetric face shows a smile, the bottom half shows:', a: 'nothing (smiles have vertical, not horizontal symmetry)', w: ['an upside-down smile', 'a frown', 'another smile'] },
      { q: 'When creating a symmetric border pattern, you repeat:', a: 'the same motif with consistent spacing', w: ['random shapes', 'different sizes each time', 'only one shape total'] },
      { q: 'A kaleidoscope creates patterns using:', a: 'multiple lines of symmetry from mirrors', w: ['random generation', 'magnification', 'color filters only'] },
      { q: 'To create bilateral symmetry in art:', a: 'make both sides mirror images of each other', w: ['use only one color', 'make sides different', 'avoid any patterns'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('create-symmetry', p.q, p.a, p.w, 2, 'K-5', 'Geometry', ['symmetry', 'create']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'scale-factor': (count) => {
    const problems = [];
    const qs = [
      { q: 'A scale factor of 2 means the new figure is:', a: 'twice as large (each dimension doubled)', w: ['half as large', 'the same size', 'four times as large'] },
      { q: 'A scale factor of 1/2 means the new figure is:', a: 'half as large (each dimension halved)', w: ['twice as large', 'the same size', 'one-fourth as large'] },
      { q: 'A rectangle 4 cm by 6 cm scaled by factor 3 becomes:', a: '12 cm by 18 cm', w: ['7 cm by 9 cm', '12 cm by 6 cm', '4 cm by 18 cm'] },
      { q: 'If original length is 5 and new length is 15, the scale factor is:', a: '3', w: ['10', '15', '5'] },
      { q: 'A scale factor of 1 produces:', a: 'an identical copy (congruent figure)', w: ['a larger figure', 'a smaller figure', 'no figure'] },
      { q: 'Original side: 8 cm. Scale factor: 1/4. New side:', a: '2 cm', w: ['32 cm', '4 cm', '12 cm'] },
      { q: 'When scale factor > 1, the figure is:', a: 'enlarged', w: ['reduced', 'unchanged', 'rotated'] },
      { q: 'When scale factor < 1, the figure is:', a: 'reduced', w: ['enlarged', 'unchanged', 'reflected'] },
      { q: 'A triangle with sides 3, 4, 5 scaled by 2 has sides:', a: '6, 8, 10', w: ['5, 6, 7', '6, 8, 5', '3, 4, 10'] },
      { q: 'If a map has scale 1:100, then 1 cm on map = :', a: '100 cm in reality', w: ['1 cm in reality', '0.01 cm in reality', '10 cm in reality'] },
      { q: 'A photo is enlarged by scale factor 4. Original area 6 sq cm. New area:', a: '96 sq cm (area scales by factor²)', w: ['24 sq cm', '10 sq cm', '6 sq cm'] },
      { q: 'To find scale factor: divide:', a: 'new length by original length', w: ['original by new', 'add lengths', 'multiply lengths'] },
      { q: 'Scale factor 2.5 applied to length 4 gives:', a: '10', w: ['6.5', '8', '1.6'] },
      { q: 'If corresponding sides are 9 and 3, scale factor (small to large) is:', a: '3', w: ['1/3', '6', '27'] },
      { q: 'Similar figures have:', a: 'same shape, proportional sides', w: ['same size only', 'same area', 'different shapes'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('scale-factor', p.q, p.a, p.w, 2, '5-8', 'Geometry', ['scale', 'similarity']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'geometric-proofs': (count) => {
    const problems = [];
    const qs = [
      { q: 'In a two-column proof, the left column contains:', a: 'statements', w: ['reasons', 'diagrams', 'conclusions only'] },
      { q: 'In a two-column proof, the right column contains:', a: 'reasons', w: ['statements', 'diagrams', 'givens only'] },
      { q: 'The first statement in a proof is usually:', a: 'the given information', w: ['the conclusion', 'a theorem', 'an assumption'] },
      { q: 'The last statement in a proof is:', a: 'what you are trying to prove', w: ['the given', 'always a definition', 'a postulate'] },
      { q: 'SSS, SAS, ASA, and AAS are used to prove:', a: 'triangle congruence', w: ['parallel lines', 'angle measures', 'area formulas'] },
      { q: 'If two angles are supplementary, their measures add to:', a: '180°', w: ['90°', '360°', '270°'] },
      { q: 'If two angles are complementary, their measures add to:', a: '90°', w: ['180°', '360°', '45°'] },
      { q: 'Vertical angles are always:', a: 'congruent', w: ['supplementary', 'complementary', 'adjacent'] },
      { q: 'CPCTC stands for:', a: 'Corresponding Parts of Congruent Triangles are Congruent', w: ['Congruent Parts Create Two Congruences', 'Central Points Connect Two Circles', 'None of the above'] },
      { q: 'A postulate is:', a: 'accepted as true without proof', w: ['proven from other statements', 'always about circles', 'a type of conclusion'] },
      { q: 'A theorem is:', a: 'a statement that has been proven', w: ['assumed true', 'never used in proofs', 'only about triangles'] },
      { q: 'The Reflexive Property states that:', a: 'any segment or angle is congruent to itself', w: ['all segments are equal', 'nothing equals itself', 'angles sum to 180°'] },
      { q: 'If AB = CD and CD = EF, then AB = EF. This is the:', a: 'Transitive Property', w: ['Reflexive Property', 'Symmetric Property', 'Addition Property'] },
      { q: 'To prove two triangles similar, you can use:', a: 'AA, SSS~, or SAS~', w: ['only SSS', 'only angles', 'CPCTC'] },
      { q: 'The reason "Given" is used when:', a: 'stating information provided in the problem', w: ['concluding the proof', 'using a theorem', 'making an assumption'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('geometric-proofs', p.q, p.a, p.w, 3, '8-12', 'Geometry', ['proofs', 'reasoning']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'frequency-tables': (count) => {
    const problems = [];
    const qs = [
      { q: 'A frequency table shows:', a: 'how often each value occurs', w: ['only the highest value', 'only the average', 'the order of data'] },
      { q: 'In a frequency table, the sum of all frequencies equals:', a: 'the total number of data points', w: ['the mean', 'the mode', '100'] },
      { q: 'Data: 2, 3, 3, 4, 4, 4, 5. Frequency of 4 is:', a: '3', w: ['4', '1', '7'] },
      { q: 'Data: red, blue, red, green, red, blue. Frequency of red:', a: '3', w: ['2', '1', '6'] },
      { q: 'A relative frequency is:', a: 'the frequency divided by total count', w: ['the highest frequency', 'frequency times 100', 'the mode'] },
      { q: 'If 15 out of 50 students chose pizza, the relative frequency is:', a: '0.3 or 30%', w: ['15%', '50%', '0.15'] },
      { q: 'The mode of a data set can be found from a frequency table by:', a: 'finding the value with highest frequency', w: ['adding all frequencies', 'finding the middle value', 'dividing by count'] },
      { q: 'Cumulative frequency shows:', a: 'running total of frequencies up to each value', w: ['only the last frequency', 'frequency minus mean', 'the range'] },
      { q: 'Data: 1, 1, 2, 2, 2, 3. Total frequency:', a: '6', w: ['3', '8', '2'] },
      { q: 'A two-way frequency table shows:', a: 'data categorized by two variables', w: ['only one variable', 'time data only', 'percentages only'] },
      { q: 'In a grouped frequency table, data is organized into:', a: 'intervals or ranges', w: ['individual values only', 'alphabetical order', 'random groups'] },
      { q: 'Scores: 70-79 (5), 80-89 (12), 90-99 (8). Most common range:', a: '80-89', w: ['70-79', '90-99', 'all equal'] },
      { q: 'If frequency of A is 4 and B is 6, P(selecting A) =', a: '4/10 or 0.4', w: ['4/6', '6/4', '4'] },
      { q: 'A histogram is related to frequency tables because it:', a: 'displays frequencies as bar heights', w: ['shows only means', 'uses pie slices', 'connects points with lines'] },
      { q: 'Data: cat(3), dog(5), bird(2). Relative freq. of dog:', a: '5/10 = 0.5', w: ['5/8', '3/10', '2/5'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('frequency-tables', p.q, p.a, p.w, 2, '5-8', 'Statistics & Probability', ['statistics', 'frequency']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'tally-charts': (count) => {
    const problems = [];
    const qs = [
      { q: 'In a tally chart, each mark represents:', a: 'one item or occurrence', w: ['five items', 'ten items', 'half an item'] },
      { q: 'In tally marks, a group of 5 is shown as:', a: 'four vertical lines crossed by one diagonal', w: ['five vertical lines', 'one big mark', 'a circle'] },
      { q: 'Tally: |||| ||| represents:', a: '8', w: ['7', '5', '13'] },
      { q: 'Tally: |||| |||| || represents:', a: '12', w: ['10', '11', '7'] },
      { q: 'To show 7 in tally marks:', a: '|||| ||', w: ['|||||  ||', '|||||||', '|||| |||'] },
      { q: 'To show 15 in tally marks:', a: '|||| |||| |||||', w: ['|||| |||| |||| |', '|||||||||||||', '|||| |||| ||||'] },
      { q: 'Tally charts are useful for:', a: 'recording data as it is collected', w: ['calculating means', 'showing percentages', 'comparing two datasets'] },
      { q: 'Why do we group tally marks in fives?', a: 'to make counting easier', w: ['because there are 5 fingers', 'it is required', 'to save space only'] },
      { q: 'Tally: |||| represents:', a: '4', w: ['5', '3', '1'] },
      { q: 'Count the tally: |||| |||| |||| |', a: '16', w: ['15', '14', '20'] },
      { q: 'A tally chart differs from a frequency table because:', a: 'it uses marks instead of numbers for counting', w: ['it shows percentages', 'it has more columns', 'it uses decimals'] },
      { q: 'Votes: Pizza |||| |||, Tacos |||| ||. Pizza received:', a: '8 votes', w: ['7 votes', '5 votes', '13 votes'] },
      { q: 'Colors: Blue |||| |||| |, Red |||| Total:', a: '15', w: ['14', '11', '9'] },
      { q: 'To convert tally |||| |||| ||| to a number:', a: '5 + 5 + 3 = 13', w: ['4 + 4 + 3 = 11', '5 + 3 = 8', '4 + 5 + 3 = 12'] },
      { q: 'Survey results: Yes |||| |||| ||||, No |||| ||. How many more Yes than No?', a: '8', w: ['7', '15', '22'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('tally-charts', p.q, p.a, p.w, 1, 'K-5', 'Statistics & Probability', ['data', 'tally']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'data-collection': (count) => {
    const problems = [];
    const qs = [
      { q: 'A survey is a type of data collection that:', a: 'asks questions to gather information', w: ['measures physical objects', 'observes without asking', 'uses only numbers'] },
      { q: 'Primary data is:', a: 'data you collect yourself', w: ['data from another source', 'always numerical', 'collected only online'] },
      { q: 'Secondary data is:', a: 'data collected by someone else', w: ['data you collect yourself', 'always more accurate', 'never reliable'] },
      { q: 'A sample is:', a: 'a subset of a population used for study', w: ['the entire population', 'always 100 people', 'randomly selected items only'] },
      { q: 'A census collects data from:', a: 'every member of the population', w: ['a random sample only', 'volunteers only', 'half the population'] },
      { q: 'Bias in data collection means:', a: 'the data systematically favors certain outcomes', w: ['the data is random', 'the sample is too large', 'all data is accurate'] },
      { q: 'A random sample helps to:', a: 'reduce bias and represent the population fairly', w: ['increase bias', 'collect less data', 'avoid all errors'] },
      { q: 'An observation study involves:', a: 'watching and recording without interfering', w: ['changing the environment', 'asking questions', 'manipulating variables'] },
      { q: 'An experiment differs from observation by:', a: 'deliberately changing conditions to test effects', w: ['only watching', 'asking fewer questions', 'using smaller samples'] },
      { q: 'A questionnaire should have questions that are:', a: 'clear, unbiased, and easy to understand', w: ['confusing', 'leading', 'very long'] },
      { q: 'Qualitative data describes:', a: 'qualities or characteristics (non-numerical)', w: ['only quantities', 'only measurements', 'only percentages'] },
      { q: 'Quantitative data is:', a: 'numerical and can be measured', w: ['descriptive only', 'always opinions', 'non-numerical'] },
      { q: 'To collect data about favorite colors, the best method is:', a: 'a survey or questionnaire', w: ['measuring with a ruler', 'a science experiment', 'weighing samples'] },
      { q: 'A leading question is problematic because it:', a: 'suggests a particular answer', w: ['is too short', 'collects too much data', 'is always accurate'] },
      { q: 'Reliable data collection means:', a: 'consistent results when repeated', w: ['different results each time', 'only one measurement', 'random outcomes always'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('data-collection', p.q, p.a, p.w, 2, '5-8', 'Statistics & Probability', ['data', 'collection']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'counting-methods': (count) => {
    const problems = [];
    const qs = [
      { q: 'The Fundamental Counting Principle states: if event A has m outcomes and event B has n outcomes, then A and B together have:', a: 'm × n outcomes', w: ['m + n outcomes', 'm - n outcomes', 'm ÷ n outcomes'] },
      { q: '3 shirts and 4 pants. How many outfits?', a: '12', w: ['7', '3', '4'] },
      { q: '2 appetizers, 5 entrees, 3 desserts. How many different meals?', a: '30', w: ['10', '15', '8'] },
      { q: 'A password has 3 digits (0-9 each). How many possible passwords?', a: '1000', w: ['30', '100', '27'] },
      { q: 'A coin flipped 4 times has how many possible outcomes?', a: '16', w: ['8', '4', '24'] },
      { q: 'A die rolled twice has how many outcomes?', a: '36', w: ['12', '6', '18'] },
      { q: 'License plates: 3 letters then 3 digits. Possible plates:', a: '17,576,000', w: ['15,600', '1,000,000', '263'] },
      { q: '4 routes to school, 3 routes home. Different round trips:', a: '12', w: ['7', '4', '1'] },
      { q: 'True/False quiz with 5 questions. Possible answer patterns:', a: '32', w: ['10', '5', '25'] },
      { q: '5 books arranged on a shelf. Arrangements:', a: '120', w: ['25', '5', '60'] },
      { q: 'Choosing 2 from 5 people (order matters): arrangements:', a: '20', w: ['10', '25', '7'] },
      { q: 'A tree diagram helps to:', a: 'visualize and count all possible outcomes', w: ['plant trees', 'calculate averages', 'graph data'] },
      { q: 'A lock has 3 dials with 10 digits each. Combinations:', a: '1000', w: ['30', '100', '13'] },
      { q: 'Menu: 4 drinks, 3 sizes. Different orders:', a: '12', w: ['7', '4', '1'] },
      { q: 'If each choice is independent, multiply:', a: 'the number of options at each stage', w: ['add all options', 'subtract options', 'divide by stages'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('counting-methods', p.q, p.a, p.w, 2, '5-8', 'Statistics & Probability', ['counting', 'probability']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'riemann-sums': (count) => {
    const problems = [];
    const qs = [
      { q: 'A Riemann sum approximates:', a: 'the area under a curve', w: ['the slope of a curve', 'the maximum value', 'the derivative'] },
      { q: 'In a left Riemann sum, the height of each rectangle is taken from:', a: 'the left endpoint of each subinterval', w: ['the right endpoint', 'the midpoint', 'the average'] },
      { q: 'In a right Riemann sum, the height is taken from:', a: 'the right endpoint of each subinterval', w: ['the left endpoint', 'the midpoint', 'the minimum'] },
      { q: 'Increasing the number of rectangles in a Riemann sum:', a: 'generally improves the approximation', w: ['always makes it worse', 'has no effect', 'decreases accuracy'] },
      { q: 'The width of each rectangle in a Riemann sum equals:', a: '(b - a) / n, where n is the number of rectangles', w: ['b - a', 'a + b', 'n / (b - a)'] },
      { q: 'For f(x) = 2 on [0, 3] with 3 rectangles, left sum =', a: '6', w: ['3', '2', '9'] },
      { q: 'For f(x) = x on [0, 2] with 2 rectangles, left sum =', a: '1', w: ['2', '3', '4'] },
      { q: 'For f(x) = x on [0, 2] with 2 rectangles, right sum =', a: '3', w: ['1', '2', '4'] },
      { q: 'A midpoint Riemann sum uses heights from:', a: 'the midpoint of each subinterval', w: ['the left endpoint', 'the right endpoint', 'the maximum'] },
      { q: 'As n → ∞, the Riemann sum approaches:', a: 'the definite integral', w: ['zero', 'infinity', 'the derivative'] },
      { q: 'For an increasing function, left sums tend to:', a: 'underestimate the area', w: ['overestimate', 'equal exactly', 'be negative'] },
      { q: 'For an increasing function, right sums tend to:', a: 'overestimate the area', w: ['underestimate', 'equal exactly', 'be zero'] },
      { q: 'For f(x) = 3 on [1, 4] with any number of rectangles:', a: 'the sum equals 9 (constant function)', w: ['depends on n', 'equals 12', 'equals 3'] },
      { q: 'Riemann sums are the foundation for:', a: 'the definite integral', w: ['the derivative', 'limits only', 'algebra'] },
      { q: 'The notation Σf(xᵢ)Δx represents:', a: 'a Riemann sum', w: ['a derivative', 'an average', 'a limit only'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('riemann-sums', p.q, p.a, p.w, 4, 'Calculus', 'Calculus', ['integration', 'riemann']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'area-approximation': (count) => {
    const problems = [];
    const qs = [
      { q: 'To approximate area under a curve, we can use:', a: 'rectangles (Riemann sums)', w: ['only triangles', 'the derivative', 'tangent lines'] },
      { q: 'Using more rectangles in an approximation generally:', a: 'gives a more accurate result', w: ['gives a less accurate result', 'has no effect', 'always gives exact area'] },
      { q: 'The trapezoidal rule uses which shapes?', a: 'trapezoids', w: ['rectangles', 'triangles', 'circles'] },
      { q: 'Approximate area of a rectangle 5 units wide and 3 units tall:', a: '15 square units', w: ['8 square units', '5 square units', '3 square units'] },
      { q: 'If f(x) is always positive, the area under the curve is:', a: 'positive', w: ['negative', 'zero', 'undefined'] },
      { q: 'Simpson\'s rule uses which shapes for approximation?', a: 'parabolic arcs', w: ['straight lines only', 'rectangles', 'circles'] },
      { q: 'Grid method: count squares. 8 full squares + 4 half squares ≈', a: '10 square units', w: ['12 square units', '8 square units', '4 square units'] },
      { q: 'Overestimate occurs when rectangles are:', a: 'taller than the curve at each point', w: ['shorter than the curve', 'exactly on the curve', 'negative'] },
      { q: 'Underestimate occurs when rectangles are:', a: 'shorter than the curve at each point', w: ['taller than the curve', 'exactly on the curve', 'outside the region'] },
      { q: 'Area under y = 4 from x = 0 to x = 3 is:', a: '12', w: ['4', '7', '3'] },
      { q: 'For irregular shapes, we can approximate area by:', a: 'counting grid squares', w: ['using only formulas', 'guessing', 'measuring perimeter'] },
      { q: 'The exact area under a curve is found using:', a: 'the definite integral', w: ['only rectangles', 'approximation only', 'the derivative'] },
      { q: 'Area between curve and x-axis where f(x) < 0 is:', a: 'counted as negative in integrals', w: ['always positive', 'always zero', 'undefined'] },
      { q: 'Approximating π using inscribed polygons gives:', a: 'an underestimate', w: ['an overestimate', 'the exact value', 'a negative value'] },
      { q: 'Monte Carlo method approximates area using:', a: 'random points and probability', w: ['exact formulas', 'rectangles only', 'derivatives'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('area-approximation', p.q, p.a, p.w, 3, '8-12', 'Geometry', ['area', 'approximation']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'exponential-patterns': (count) => {
    const problems = [];
    const qs = [
      { q: 'Sequence: 2, 4, 8, 16, ... The pattern is:', a: 'multiply by 2 (exponential)', w: ['add 2', 'add 4', 'multiply by 4'] },
      { q: 'Sequence: 3, 9, 27, 81, ... The next term is:', a: '243', w: ['108', '162', '324'] },
      { q: 'Sequence: 1, 2, 4, 8, 16, ... This is:', a: 'powers of 2', w: ['multiples of 2', 'prime numbers', 'squares'] },
      { q: 'Bacteria double every hour. Start: 100. After 3 hours:', a: '800', w: ['300', '600', '400'] },
      { q: 'Pattern: 5, 10, 20, 40, ... The 6th term is:', a: '160', w: ['80', '120', '200'] },
      { q: 'If a population triples yearly, starting at 10, after 2 years:', a: '90', w: ['30', '60', '20'] },
      { q: 'Sequence: 1000, 500, 250, 125, ... The pattern is:', a: 'divide by 2 (exponential decay)', w: ['subtract 500', 'subtract 250', 'divide by 4'] },
      { q: 'Compound interest shows:', a: 'exponential growth', w: ['linear growth', 'no growth', 'decreasing pattern'] },
      { q: 'Sequence: 2, 6, 18, 54, ... Common ratio is:', a: '3', w: ['4', '2', '6'] },
      { q: 'Half-life decay: 80, 40, 20, 10, ... The pattern:', a: 'multiply by 1/2', w: ['subtract 40', 'subtract 10', 'divide by 4'] },
      { q: 'Term formula for 3, 6, 12, 24, ... is:', a: '3 × 2^(n-1)', w: ['3 + 3n', '3n', '3 × n'] },
      { q: 'A rumor spreads: each person tells 3 others. People who heard after 4 rounds:', a: '1 + 3 + 9 + 27 = 40 (exponential spread)', w: ['12', '4', '81'] },
      { q: 'Exponential patterns have a constant:', a: 'ratio between consecutive terms', w: ['difference between terms', 'sum of terms', 'product'] },
      { q: 'Linear vs exponential: 2, 4, 6, 8 is ___ while 2, 4, 8, 16 is ___', a: 'linear, exponential', w: ['exponential, linear', 'both linear', 'both exponential'] },
      { q: 'Paper folded in half n times has 2^n layers. After 5 folds:', a: '32 layers', w: ['10 layers', '25 layers', '64 layers'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('exponential-patterns', p.q, p.a, p.w, 2, '5-8', 'Functions', ['patterns', 'exponential']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'ratio-concepts': (count) => {
    const problems = [];
    const qs = [
      { q: 'A ratio compares:', a: 'two or more quantities', w: ['only one quantity', 'percentages only', 'differences only'] },
      { q: 'The ratio of 15 to 5 in simplest form is:', a: '3:1', w: ['15:5', '1:3', '5:15'] },
      { q: 'If the ratio of boys to girls is 2:3 and there are 10 boys, how many girls?', a: '15', w: ['6', '12', '5'] },
      { q: 'A ratio of 4:6 is equivalent to:', a: '2:3', w: ['4:3', '3:2', '6:4'] },
      { q: 'Part-to-whole ratio: 3 red out of 12 total. Ratio of red to total:', a: '3:12 or 1:4', w: ['3:9', '12:3', '1:3'] },
      { q: 'Part-to-part ratio: 5 cats, 3 dogs. Ratio of cats to dogs:', a: '5:3', w: ['3:5', '5:8', '8:5'] },
      { q: 'If ratio is 1:4 and total is 20, the smaller part is:', a: '4', w: ['5', '1', '16'] },
      { q: 'Scale on a map is 1:1000. 5 cm on map equals:', a: '5000 cm (50 m) in reality', w: ['1000 cm', '5 cm', '200 cm'] },
      { q: 'Ratio of 3:4:5 means if smallest is 6, the largest is:', a: '10', w: ['5', '8', '15'] },
      { q: 'Recipe ratio flour:sugar is 3:1. For 12 cups flour, sugar needed:', a: '4 cups', w: ['3 cups', '1 cup', '9 cups'] },
      { q: 'Two ratios are equivalent if:', a: 'their cross products are equal', w: ['they look similar', 'they add to same number', 'they have same numbers'] },
      { q: 'Is 6:9 equivalent to 10:15?', a: 'Yes (both simplify to 2:3)', w: ['No', 'Cannot determine', 'Only if multiplied'] },
      { q: 'A gear ratio of 3:1 means the first gear turns 3 times for every:', a: '1 turn of the second gear', w: ['3 turns of second', '0 turns', '9 turns'] },
      { q: 'Ratio of angles in a triangle is 1:2:3. The angles are:', a: '30°, 60°, 90°', w: ['10°, 20°, 30°', '60°, 120°, 180°', '45°, 90°, 135°'] },
      { q: 'Golden ratio is approximately:', a: '1.618:1', w: ['2:1', '1:1', '3:2'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('ratio-concepts', p.q, p.a, p.w, 2, '5-8', 'Ratios & Proportional Relationships', ['ratios', 'concepts']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'prek-count-0-5': (count) => {
    const problems = [];
    const qs = [
      { q: 'Count the apples: 🍎🍎🍎. How many apples?', a: '3', w: ['2', '4', '5'] },
      { q: 'Count the stars: ⭐⭐. How many stars?', a: '2', w: ['1', '3', '4'] },
      { q: 'Count the balls: 🔵🔵🔵🔵. How many balls?', a: '4', w: ['3', '5', '2'] },
      { q: 'Count the hearts: ❤️. How many hearts?', a: '1', w: ['2', '0', '3'] },
      { q: 'Count the fish: 🐟🐟🐟🐟🐟. How many fish?', a: '5', w: ['4', '6', '3'] },
      { q: 'There are no birds on the branch. How many birds?', a: '0', w: ['1', '2', '3'] },
      { q: 'Count the flowers: 🌸🌸. How many flowers?', a: '2', w: ['1', '3', '4'] },
      { q: 'Count the cats: 🐱🐱🐱. How many cats?', a: '3', w: ['2', '4', '1'] },
      { q: 'Count the trees: 🌳🌳🌳🌳🌳. How many trees?', a: '5', w: ['4', '3', '6'] },
      { q: 'Count the dogs: 🐕. How many dogs?', a: '1', w: ['2', '0', '3'] },
      { q: 'Count the suns: 🌞🌞🌞🌞. How many suns?', a: '4', w: ['3', '5', '2'] },
      { q: 'An empty box has how many toys inside?', a: '0', w: ['1', '2', '5'] },
      { q: 'Count the moons: 🌙🌙. How many moons?', a: '2', w: ['1', '3', '0'] },
      { q: 'Count the bees: 🐝🐝🐝🐝🐝. How many bees?', a: '5', w: ['4', '6', '3'] },
      { q: 'Count the butterflies: 🦋🦋🦋. How many butterflies?', a: '3', w: ['2', '4', '5'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('prek-count-0-5', p.q, p.a, p.w, 1, 'K-2', 'Counting & Cardinality', ['counting', 'prek']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'prek-count-0-10': (count) => {
    const problems = [];
    const qs = [
      { q: 'Count the circles: ⚪⚪⚪⚪⚪⚪. How many circles?', a: '6', w: ['5', '7', '8'] },
      { q: 'Count the leaves: 🍃🍃🍃🍃🍃🍃🍃. How many leaves?', a: '7', w: ['6', '8', '5'] },
      { q: 'Count the bananas: 🍌🍌🍌🍌🍌🍌🍌🍌. How many bananas?', a: '8', w: ['7', '9', '6'] },
      { q: 'Count the grapes: 🍇🍇🍇🍇🍇🍇🍇🍇🍇. How many grapes?', a: '9', w: ['8', '10', '7'] },
      { q: 'Count the cherries: 🍒🍒🍒🍒🍒🍒🍒🍒🍒🍒. How many cherries?', a: '10', w: ['9', '8', '11'] },
      { q: 'Count the ducks: 🦆🦆🦆🦆🦆🦆. How many ducks?', a: '6', w: ['5', '7', '4'] },
      { q: 'Count the clouds: ☁️☁️☁️☁️☁️☁️☁️☁️. How many clouds?', a: '8', w: ['7', '9', '6'] },
      { q: 'Count the raindrops: 💧💧💧💧💧💧💧💧💧💧. How many raindrops?', a: '10', w: ['9', '11', '8'] },
      { q: 'Count the snowflakes: ❄️❄️❄️❄️❄️❄️❄️. How many snowflakes?', a: '7', w: ['6', '8', '5'] },
      { q: 'Count the bells: 🔔🔔🔔🔔🔔🔔🔔🔔🔔. How many bells?', a: '9', w: ['8', '10', '7'] },
      { q: 'Count the pencils: ✏️✏️✏️✏️✏️✏️. How many pencils?', a: '6', w: ['5', '7', '8'] },
      { q: 'Count the carrots: 🥕🥕🥕🥕🥕🥕🥕🥕🥕🥕. How many carrots?', a: '10', w: ['9', '8', '11'] },
      { q: 'Count the presents: 🎁🎁🎁🎁🎁🎁🎁🎁. How many presents?', a: '8', w: ['7', '9', '10'] },
      { q: 'Count the balloons: 🎈🎈🎈🎈🎈🎈🎈. How many balloons?', a: '7', w: ['6', '8', '9'] },
      { q: 'Count the cookies: 🍪🍪🍪🍪🍪🍪🍪🍪🍪. How many cookies?', a: '9', w: ['8', '10', '7'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('prek-count-0-10', p.q, p.a, p.w, 1, 'K-2', 'Counting & Cardinality', ['counting', 'prek']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'prek-sort-attributes': (count) => {
    const problems = [];
    const qs = [
      { q: 'Which one is RED? 🔵 🔴 🟢', a: '🔴', w: ['🔵', '🟢', 'None'] },
      { q: 'Which one is the BIGGEST? small ball, medium ball, large ball', a: 'large ball', w: ['small ball', 'medium ball', 'They are equal'] },
      { q: 'Which one is a CIRCLE? ⬜ 🔺 ⭕', a: '⭕', w: ['⬜', '🔺', 'None'] },
      { q: 'Which one is BLUE? 🟡 🔵 🟠', a: '🔵', w: ['🟡', '🟠', 'None'] },
      { q: 'Which one is the SMALLEST? big dog, tiny ant, medium cat', a: 'tiny ant', w: ['big dog', 'medium cat', 'They are equal'] },
      { q: 'Which one is a TRIANGLE? ⭕ ⬜ 🔺', a: '🔺', w: ['⭕', '⬜', 'None'] },
      { q: 'Which one is GREEN? 🟢 🔴 🟣', a: '🟢', w: ['🔴', '🟣', 'None'] },
      { q: 'Which one is a SQUARE? ⬜ ⭕ 🔺', a: '⬜', w: ['⭕', '🔺', 'None'] },
      { q: 'Sort by color: Which does NOT belong? 🔴🔴🔴🔵', a: '🔵 (it is blue)', w: ['All belong', 'First 🔴', 'Last 🔴'] },
      { q: 'Which one is YELLOW? 🟣 🟤 🟡', a: '🟡', w: ['🟣', '🟤', 'None'] },
      { q: 'Which is TALLER? A giraffe or a mouse?', a: 'giraffe', w: ['mouse', 'They are the same', 'Cannot tell'] },
      { q: 'Sort by size: Which is the ODD one? big elephant, big whale, tiny mouse', a: 'tiny mouse (it is small)', w: ['big elephant', 'big whale', 'All are the same'] },
      { q: 'Which one is ORANGE? 🟠 🟢 🔵', a: '🟠', w: ['🟢', '🔵', 'None'] },
      { q: 'Which is LONGER? A pencil or a crayon?', a: 'pencil', w: ['crayon', 'They are equal', 'Cannot tell'] },
      { q: 'Which shape has 4 sides? circle, triangle, square', a: 'square', w: ['circle', 'triangle', 'None'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('prek-sort-attributes', p.q, p.a, p.w, 1, 'K-2', 'Measurement & Data', ['sorting', 'attributes', 'prek']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'prek-patterns': (count) => {
    const problems = [];
    const qs = [
      { q: 'What comes next? 🔴🔵🔴🔵🔴___', a: '🔵', w: ['🔴', '🟢', '🟡'] },
      { q: 'What comes next? ⭐🌙⭐🌙⭐___', a: '🌙', w: ['⭐', '☀️', '🌟'] },
      { q: 'What comes next? 🍎🍎🍊🍎🍎___', a: '🍊', w: ['🍎', '🍋', '🍇'] },
      { q: 'What comes next? 🔺⬜🔺⬜🔺___', a: '⬜', w: ['🔺', '⭕', '🔶'] },
      { q: 'What comes next? 🐱🐶🐱🐶🐱___', a: '🐶', w: ['🐱', '🐰', '🐻'] },
      { q: 'What comes next? 🟢🟢🟡🟢🟢___', a: '🟡', w: ['🟢', '🔴', '🔵'] },
      { q: 'What comes next? 🌸🌸🌸🌻🌸🌸🌸___', a: '🌻', w: ['🌸', '🌹', '🌷'] },
      { q: 'What comes next? big small big small big ___', a: 'small', w: ['big', 'medium', 'tiny'] },
      { q: 'What comes next? 1 2 1 2 1 ___', a: '2', w: ['1', '3', '0'] },
      { q: 'What comes next? clap stomp clap stomp clap ___', a: 'stomp', w: ['clap', 'jump', 'sit'] },
      { q: 'What comes next? 🔵🔵🔴🔵🔵___', a: '🔴', w: ['🔵', '🟢', '🟡'] },
      { q: 'What comes next? up down up down up ___', a: 'down', w: ['up', 'left', 'right'] },
      { q: 'What comes next? A B A B A ___', a: 'B', w: ['A', 'C', 'D'] },
      { q: 'What comes next? 🌞🌧️🌞🌧️🌞___', a: '🌧️', w: ['🌞', '❄️', '🌈'] },
      { q: 'What comes next? 🐟🐟🐢🐟🐟___', a: '🐢', w: ['🐟', '🦀', '🐙'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('prek-patterns', p.q, p.a, p.w, 1, 'K-2', 'Operations & Algebraic Thinking', ['patterns', 'prek']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'prek-shapes-basic': (count) => {
    const problems = [];
    const qs = [
      { q: 'What shape is this? ⭕', a: 'circle', w: ['square', 'triangle', 'rectangle'] },
      { q: 'What shape is this? ⬜', a: 'square', w: ['circle', 'triangle', 'oval'] },
      { q: 'What shape is this? 🔺', a: 'triangle', w: ['circle', 'square', 'rectangle'] },
      { q: 'A ball is shaped like a:', a: 'circle (sphere)', w: ['square', 'triangle', 'rectangle'] },
      { q: 'A door is shaped like a:', a: 'rectangle', w: ['circle', 'triangle', 'oval'] },
      { q: 'How many sides does a triangle have?', a: '3', w: ['4', '2', '5'] },
      { q: 'How many sides does a square have?', a: '4', w: ['3', '5', '6'] },
      { q: 'A circle has how many corners?', a: '0', w: ['1', '2', '4'] },
      { q: 'A pizza slice is shaped like a:', a: 'triangle', w: ['circle', 'square', 'rectangle'] },
      { q: 'A wheel is shaped like a:', a: 'circle', w: ['square', 'triangle', 'star'] },
      { q: 'Which shape has 4 equal sides?', a: 'square', w: ['triangle', 'circle', 'oval'] },
      { q: 'An egg is shaped like an:', a: 'oval', w: ['circle', 'square', 'triangle'] },
      { q: 'A stop sign has how many sides?', a: '8 (octagon)', w: ['4', '6', '3'] },
      { q: 'A window is usually shaped like a:', a: 'rectangle or square', w: ['circle', 'triangle', 'oval'] },
      { q: 'Which shape can roll? circle, square, or triangle?', a: 'circle', w: ['square', 'triangle', 'All of them'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('prek-shapes-basic', p.q, p.a, p.w, 1, 'K-2', 'Geometry', ['shapes', 'prek']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'prek-number-words': (count) => {
    const problems = [];
    const qs = [
      { q: 'What number is "one"?', a: '1', w: ['2', '0', '3'] },
      { q: 'What number is "two"?', a: '2', w: ['1', '3', '4'] },
      { q: 'What number is "three"?', a: '3', w: ['2', '4', '5'] },
      { q: 'What number is "four"?', a: '4', w: ['3', '5', '6'] },
      { q: 'What number is "five"?', a: '5', w: ['4', '6', '3'] },
      { q: 'What number is "zero"?', a: '0', w: ['1', '2', '10'] },
      { q: 'What number is "six"?', a: '6', w: ['5', '7', '4'] },
      { q: 'What number is "seven"?', a: '7', w: ['6', '8', '5'] },
      { q: 'What number is "eight"?', a: '8', w: ['7', '9', '6'] },
      { q: 'What number is "nine"?', a: '9', w: ['8', '10', '7'] },
      { q: 'What number is "ten"?', a: '10', w: ['9', '11', '1'] },
      { q: 'How do you write the word for 3?', a: 'three', w: ['tree', 'free', 'thee'] },
      { q: 'How do you write the word for 5?', a: 'five', w: ['fiv', 'fife', 'vive'] },
      { q: 'How do you write the word for 8?', a: 'eight', w: ['ate', 'eit', 'eigt'] },
      { q: 'How do you write the word for 2?', a: 'two', w: ['to', 'too', 'tow'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('prek-number-words', p.q, p.a, p.w, 1, 'K-2', 'Counting & Cardinality', ['number-words', 'prek']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'prek-compare-sets': (count) => {
    const problems = [];
    const qs = [
      { q: 'Which has MORE? 🍎🍎🍎 or 🍊🍊', a: '🍎🍎🍎 (3 is more than 2)', w: ['🍊🍊', 'They are equal', 'Cannot tell'] },
      { q: 'Which has FEWER? 🐶🐶🐶🐶 or 🐱🐱', a: '🐱🐱 (2 is fewer than 4)', w: ['🐶🐶🐶🐶', 'They are equal', 'Cannot tell'] },
      { q: 'Which has MORE? ⭐⭐⭐⭐⭐ or ⭐⭐⭐', a: '⭐⭐⭐⭐⭐ (5 is more than 3)', w: ['⭐⭐⭐', 'They are equal', 'Cannot tell'] },
      { q: 'Are these EQUAL? 🔵🔵🔵 and 🔴🔴🔴', a: 'Yes, both have 3', w: ['No, blue has more', 'No, red has more', 'Cannot tell'] },
      { q: 'Which has FEWER? 🌸🌸🌸🌸🌸 or 🌻🌻🌻🌻🌻🌻', a: '🌸🌸🌸🌸🌸 (5 is fewer than 6)', w: ['🌻🌻🌻🌻🌻🌻', 'They are equal', 'Cannot tell'] },
      { q: 'Which group has MORE? 4 balls or 2 balls', a: '4 balls', w: ['2 balls', 'They are equal', 'Neither'] },
      { q: 'Which group has FEWER? 1 cookie or 5 cookies', a: '1 cookie', w: ['5 cookies', 'They are equal', 'Neither'] },
      { q: 'Are these EQUAL? 🐟🐟 and 🦋🦋', a: 'Yes, both have 2', w: ['No, fish has more', 'No, butterfly has more', 'Cannot tell'] },
      { q: 'Which has MORE? 🍌🍌🍌🍌🍌🍌 or 🍇🍇🍇🍇', a: '🍌🍌🍌🍌🍌🍌 (6 is more than 4)', w: ['🍇🍇🍇🍇', 'They are equal', 'Cannot tell'] },
      { q: '3 apples or 3 oranges - which has more?', a: 'They are equal (both 3)', w: ['3 apples', '3 oranges', 'Cannot tell'] },
      { q: 'Which has FEWER? 🎈🎈🎈🎈🎈🎈🎈 or 🎁🎁🎁', a: '🎁🎁🎁 (3 is fewer than 7)', w: ['🎈🎈🎈🎈🎈🎈🎈', 'They are equal', 'Cannot tell'] },
      { q: 'Sam has 5 toys. Kim has 5 toys. Who has more?', a: 'They have the same amount', w: ['Sam', 'Kim', 'Cannot tell'] },
      { q: 'Which has MORE? 🚗🚗 or 🚌🚌🚌🚌', a: '🚌🚌🚌🚌 (4 is more than 2)', w: ['🚗🚗', 'They are equal', 'Cannot tell'] },
      { q: '0 birds or 1 bird - which has fewer?', a: '0 birds', w: ['1 bird', 'They are equal', 'Cannot tell'] },
      { q: 'Which has MORE? 🍪🍪🍪🍪 or 🧁🧁🧁🧁', a: 'They are equal (both 4)', w: ['🍪🍪🍪🍪', '🧁🧁🧁🧁', 'Cannot tell'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('prek-compare-sets', p.q, p.a, p.w, 1, 'K-2', 'Counting & Cardinality', ['comparing', 'sets', 'prek']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },

  'prek-position-words': (count) => {
    const problems = [];
    const qs = [
      { q: 'The bird is IN the nest. Where is the bird?', a: 'inside the nest', w: ['under the nest', 'above the nest', 'beside the nest'] },
      { q: 'The cat is UNDER the table. Where is the cat?', a: 'below the table', w: ['on top of the table', 'beside the table', 'inside the table'] },
      { q: 'The ball is ON the box. Where is the ball?', a: 'on top of the box', w: ['under the box', 'inside the box', 'behind the box'] },
      { q: 'The dog is BEHIND the tree. Where is the dog?', a: 'at the back of the tree', w: ['in front of the tree', 'on the tree', 'under the tree'] },
      { q: 'The book is NEXT TO the lamp. Where is the book?', a: 'beside the lamp', w: ['on the lamp', 'under the lamp', 'inside the lamp'] },
      { q: 'The airplane is ABOVE the clouds. Where is it?', a: 'higher than the clouds', w: ['below the clouds', 'inside the clouds', 'beside the clouds'] },
      { q: 'The fish is IN the water. Where is the fish?', a: 'inside the water', w: ['above the water', 'next to the water', 'under the water'] },
      { q: 'The toy is BETWEEN the two pillows. Where is it?', a: 'in the middle of the pillows', w: ['on top of the pillows', 'under the pillows', 'behind the pillows'] },
      { q: 'The apple is IN FRONT OF the orange. Which fruit is closer to you?', a: 'the apple', w: ['the orange', 'they are the same', 'cannot tell'] },
      { q: 'The sun is UP in the sky. Where is the sun?', a: 'high above', w: ['down low', 'beside us', 'behind us'] },
      { q: 'Put the cup ON the shelf. Where should the cup go?', a: 'on top of the shelf', w: ['under the shelf', 'behind the shelf', 'beside the shelf'] },
      { q: 'The shoes are UNDER the bed. Where are the shoes?', a: 'below the bed', w: ['on top of the bed', 'next to the bed', 'in the bed'] },
      { q: 'The clock is ON the wall. Where is the clock?', a: 'attached to the wall surface', w: ['behind the wall', 'under the wall', 'next to the wall'] },
      { q: 'Stand BEHIND your chair. Where should you stand?', a: 'at the back of the chair', w: ['in front of the chair', 'on the chair', 'under the chair'] },
      { q: 'The flower is BESIDE the vase. Where is the flower?', a: 'next to the vase', w: ['in the vase', 'under the vase', 'on top of the vase'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i];
      if (!existingPrompts.has(p.q.toLowerCase())) {
        problems.push(createMCProblem('prek-position-words', p.q, p.a, p.w, 1, 'K-2', 'Geometry', ['position', 'spatial', 'prek']));
        existingPrompts.add(p.q.toLowerCase());
      }
    }
    return problems;
  },
};

// ============================================================================
// MAIN EXECUTION
// ============================================================================

console.log('=== PROBLEM GENERATION ===\n');

const allGenerated = [];
let totalNeeded = 0;
let totalGenerated = 0;

// Process missing skills (need 15 each)
console.log('Generating for MISSING skills...');
for (const skill of workList.missing) {
  const gen = generators[skill.skillId];
  if (gen) {
    const problems = gen(15);
    allGenerated.push(...problems);
    console.log(`  ${skill.skillId}: ${problems.length} problems`);
    totalGenerated += problems.length;
  } else {
    console.log(`  ${skill.skillId}: NO GENERATOR (skipped)`);
  }
  totalNeeded += 15;
}

// Process critical skills (1-4 problems, need to reach 15)
console.log('\nGenerating for CRITICAL skills...');
for (const skill of workList.critical) {
  const gen = generators[skill.skillId];
  const needed = skill.neededFor15;
  if (gen) {
    const problems = gen(needed);
    allGenerated.push(...problems);
    console.log(`  ${skill.skillId}: ${problems.length}/${needed} problems`);
    totalGenerated += problems.length;
  } else {
    console.log(`  ${skill.skillId}: NO GENERATOR (skipped)`);
  }
  totalNeeded += needed;
}

// Process low skills (5-9 problems)
console.log('\nGenerating for LOW skills...');
for (const skill of workList.low) {
  const gen = generators[skill.skillId];
  const needed = skill.neededFor15;
  if (gen) {
    const problems = gen(needed);
    allGenerated.push(...problems);
    console.log(`  ${skill.skillId}: ${problems.length}/${needed} problems`);
    totalGenerated += problems.length;
  } else {
    console.log(`  ${skill.skillId}: NO GENERATOR (skipped)`);
  }
  totalNeeded += needed;
}

console.log('\n=== SUMMARY ===');
console.log(`Total needed: ${totalNeeded}`);
console.log(`Total generated: ${totalGenerated}`);
console.log(`Coverage: ${((totalGenerated / totalNeeded) * 100).toFixed(1)}%`);

// Save generated problems
fs.writeFileSync('./docs/generated-problems.json', JSON.stringify(allGenerated, null, 2));
console.log(`\nSaved to docs/generated-problems.json`);

// List skills without generators
const missingGenerators = [...workList.missing, ...workList.critical, ...workList.low]
  .filter(s => !generators[s.skillId])
  .map(s => s.skillId);

if (missingGenerators.length > 0) {
  console.log(`\n${missingGenerators.length} skills need generators:`);
  missingGenerators.forEach(s => console.log(`  - ${s}`));
  fs.writeFileSync('./docs/skills-needing-generators.json', JSON.stringify(missingGenerators, null, 2));
}

// Additional generators added inline
Object.assign(generators, {
  'exponential-growth': (count) => {
    const problems = [];
    const qs = [
      { q: 'A population doubles every 3 years. Starting at 100, what is it after 6 years?', a: '400', w: ['200', '600', '800'] },
      { q: 'f(x) = 2^x. Find f(3).', a: '8', w: ['6', '9', '16'] },
      { q: 'A bank account grows at 10% annually. $1000 after 2 years?', a: '$1210', w: ['$1200', '$1100', '$1020'] },
      { q: 'y = 3(2)^x represents:', a: 'exponential growth', w: ['exponential decay', 'linear growth', 'no growth'] },
      { q: 'Bacteria triple every hour. Starting at 50, count after 2 hours?', a: '450', w: ['150', '300', '100'] },
      { q: 'For y = a(b)^x, growth occurs when:', a: 'b > 1', w: ['b < 1', 'b = 1', 'b < 0'] },
      { q: 'Investment doubles every 5 years. Time to reach 8x original?', a: '15 years', w: ['20 years', '10 years', '40 years'] },
      { q: 'y = 5(1.1)^x. The growth rate is:', a: '10%', w: ['1%', '110%', '1.1%'] },
      { q: 'f(x) = 100(1.05)^x models a 5% annual growth. f(0) = ?', a: '100', w: ['105', '5', '0'] },
      { q: 'Which represents faster growth: y=2^x or y=3^x?', a: 'y = 3^x', w: ['y = 2^x', 'Same rate', 'Cannot compare'] },
      { q: 'A colony grows from 200 to 800 in 2 hours. Growth factor per hour?', a: '2', w: ['4', '600', '3'] },
      { q: 'y = 1000(1.08)^t. What is the initial value?', a: '1000', w: ['1080', '1.08', '0'] },
      { q: 'Which is exponential growth? A: y=2x, B: y=x², C: y=2^x', a: 'C', w: ['A', 'B', 'All'] },
      { q: 'If growth rate is 25%, the multiplier is:', a: '1.25', w: ['0.25', '25', '1.025'] },
      { q: 'y = 50(2)^(t/3). After how long does y double?', a: '3 time units', w: ['2 units', '6 units', '1 unit'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i]; if (!existingPrompts.has(p.q.toLowerCase())) { problems.push(createMCProblem('exponential-growth', p.q, p.a, p.w, 3, '8-12', 'Functions', ['exponential'])); existingPrompts.add(p.q.toLowerCase()); }
    }
    return problems;
  },

  'exponential-decay': (count) => {
    const problems = [];
    const qs = [
      { q: 'A car loses 20% value yearly. Worth $10000 now, value after 1 year?', a: '$8000', w: ['$2000', '$9000', '$7000'] },
      { q: 'Half-life is 5 days. Starting at 80g, how much after 10 days?', a: '20g', w: ['40g', '10g', '0g'] },
      { q: 'y = 100(0.8)^x represents:', a: 'exponential decay', w: ['exponential growth', 'linear decay', 'no change'] },
      { q: 'For y = a(b)^x, decay occurs when:', a: '0 < b < 1', w: ['b > 1', 'b < 0', 'b = 1'] },
      { q: 'Drug has 4-hour half-life. 200mg dose, amount after 8 hours?', a: '50mg', w: ['100mg', '25mg', '0mg'] },
      { q: 'y = 500(0.9)^t. The decay rate is:', a: '10%', w: ['90%', '0.9%', '9%'] },
      { q: 'Radioactive substance: half-life 3 years. Time to reach 1/8 of original?', a: '9 years', w: ['6 years', '8 years', '24 years'] },
      { q: 'y = 1000(0.95)^x. What is the initial amount?', a: '1000', w: ['950', '0.95', '50'] },
      { q: 'If decay rate is 15%, the multiplier is:', a: '0.85', w: ['1.15', '0.15', '85'] },
      { q: 'A sample decays from 64g to 8g in 6 hours. Half-life?', a: '2 hours', w: ['3 hours', '1 hour', '6 hours'] },
      { q: 'y = 200(1/2)^(t/4). After 4 time units, y = ?', a: '100', w: ['50', '200', '25'] },
      { q: 'Depreciation: $20000 car loses 10% yearly. Value after 3 years?', a: '$14580', w: ['$17000', '$12000', '$18000'] },
      { q: 'Which decay is faster: y=100(0.5)^x or y=100(0.9)^x?', a: 'y = 100(0.5)^x', w: ['y = 100(0.9)^x', 'Same', 'Cannot tell'] },
      { q: 'f(x) = 1000e^(-0.1x) represents:', a: 'continuous exponential decay', w: ['growth', 'linear', 'no change'] },
      { q: 'If 75% remains after each period, what percent decays?', a: '25%', w: ['75%', '0.75%', '125%'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i]; if (!existingPrompts.has(p.q.toLowerCase())) { problems.push(createMCProblem('exponential-decay', p.q, p.a, p.w, 3, '8-12', 'Functions', ['exponential'])); existingPrompts.add(p.q.toLowerCase()); }
    }
    return problems;
  },

  'probability-basics': (count) => {
    const problems = [];
    const qs = [
      { q: 'A fair coin is flipped. P(heads)?', a: '1/2', w: ['1', '0', '1/4'] },
      { q: 'Roll a fair die. P(rolling 3)?', a: '1/6', w: ['1/3', '3/6', '1'] },
      { q: 'Probability ranges from:', a: '0 to 1', w: ['0 to 100', '-1 to 1', '1 to 10'] },
      { q: 'P(impossible event) = ?', a: '0', w: ['1', '-1', '0.5'] },
      { q: 'P(certain event) = ?', a: '1', w: ['0', '100', '0.5'] },
      { q: 'Bag has 3 red, 2 blue marbles. P(red)?', a: '3/5', w: ['2/5', '3/2', '1/3'] },
      { q: 'Roll die. P(even number)?', a: '1/2', w: ['1/3', '2/6', '3'] },
      { q: 'If P(A) = 0.3, P(not A) = ?', a: '0.7', w: ['0.3', '1.3', '-0.3'] },
      { q: 'Spinner has 4 equal sections. P(landing on blue)?', a: '1/4', w: ['1/2', '4', '3/4'] },
      { q: 'P(A) + P(not A) = ?', a: '1', w: ['0', '2', 'depends'] },
      { q: 'Deck of 52 cards. P(ace)?', a: '4/52 or 1/13', w: ['1/52', '4/13', '1/4'] },
      { q: 'A box has 5 items, 2 defective. P(selecting defective)?', a: '2/5', w: ['3/5', '2/3', '5/2'] },
      { q: 'Favorable outcomes / Total outcomes = ?', a: 'Probability', w: ['Odds', 'Ratio', 'Percentage'] },
      { q: 'P(A or B) when mutually exclusive = ?', a: 'P(A) + P(B)', w: ['P(A) × P(B)', 'P(A) - P(B)', '0'] },
      { q: 'Roll die. P(less than 5)?', a: '4/6 or 2/3', w: ['5/6', '4/5', '1/6'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i]; if (!existingPrompts.has(p.q.toLowerCase())) { problems.push(createMCProblem('probability-basics', p.q, p.a, p.w, 2, '5-8', 'Statistics & Probability', ['probability'])); existingPrompts.add(p.q.toLowerCase()); }
    }
    return problems;
  },

  'simple-probability': (count) => {
    const problems = [];
    const qs = [
      { q: 'Bag: 4 red, 6 blue marbles. P(blue)?', a: '6/10 or 3/5', w: ['4/10', '6/4', '1/6'] },
      { q: 'Spinner: 3 red, 2 yellow, 3 green sections. P(yellow)?', a: '2/8 or 1/4', w: ['3/8', '2/3', '1/2'] },
      { q: 'Roll die. P(5 or 6)?', a: '2/6 or 1/3', w: ['5/6', '11/6', '1/6'] },
      { q: 'Flip coin twice. P(two heads)?', a: '1/4', w: ['1/2', '2/4', '1'] },
      { q: 'Draw from deck. P(heart)?', a: '13/52 or 1/4', w: ['1/13', '4/52', '1/2'] },
      { q: 'Jar: 5 red, 3 green, 2 blue. P(not red)?', a: '5/10 or 1/2', w: ['5/10', '3/10', '8/10'] },
      { q: 'Roll two dice. P(both show 6)?', a: '1/36', w: ['1/6', '2/36', '1/12'] },
      { q: 'Bag: 7 white, 3 black. P(white)?', a: '7/10', w: ['3/10', '7/3', '10/7'] },
      { q: 'Spin spinner with 5 equal parts. P(landing on 3)?', a: '1/5', w: ['3/5', '1/3', '5'] },
      { q: '20 tickets, 4 winners. P(winning)?', a: '4/20 or 1/5', w: ['4/16', '16/20', '1/4'] },
      { q: 'Draw card. P(face card)?', a: '12/52 or 3/13', w: ['4/52', '3/52', '1/4'] },
      { q: 'Bag has equal red and blue. P(red)?', a: '1/2', w: ['1', '2', '1/4'] },
      { q: 'Roll die. P(prime number: 2,3,5)?', a: '3/6 or 1/2', w: ['2/6', '4/6', '5/6'] },
      { q: 'Pick letter from PROBABILITY. P(B)?', a: '2/11', w: ['1/11', '2/9', '1/9'] },
      { q: '15 students: 9 girls. P(picking a girl)?', a: '9/15 or 3/5', w: ['6/15', '9/6', '15/9'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i]; if (!existingPrompts.has(p.q.toLowerCase())) { problems.push(createMCProblem('simple-probability', p.q, p.a, p.w, 2, '5-8', 'Statistics & Probability', ['probability'])); existingPrompts.add(p.q.toLowerCase()); }
    }
    return problems;
  },

  'graphing-inequalities': (count) => {
    const problems = [];
    const qs = [
      { q: 'Graph of x > 3 uses:', a: 'open circle at 3, arrow right', w: ['closed circle', 'arrow left', 'line segment'] },
      { q: 'Graph of x ≤ -2 uses:', a: 'closed circle at -2, arrow left', w: ['open circle', 'arrow right', 'no circle'] },
      { q: 'y < 2x + 1 is graphed with:', a: 'dashed line, shade below', w: ['solid line, above', 'dashed, above', 'solid, below'] },
      { q: 'y ≥ -x + 3 is graphed with:', a: 'solid line, shade above', w: ['dashed, above', 'solid, below', 'dashed, below'] },
      { q: 'Open circle means:', a: 'value not included', w: ['value included', 'equals', 'no solution'] },
      { q: 'Closed circle means:', a: 'value included', w: ['value not included', 'less than', 'greater than'] },
      { q: 'x ≥ 5: arrow points?', a: 'right (toward larger numbers)', w: ['left', 'both ways', 'neither'] },
      { q: 'x < 0: shade which part of number line?', a: 'left of 0', w: ['right of 0', 'at 0', 'entire line'] },
      { q: '-3 ≤ x < 2 is graphed as:', a: 'closed at -3, open at 2', w: ['open at both', 'closed at both', 'open -3, closed 2'] },
      { q: 'For y > mx + b, shade:', a: 'above the line', w: ['below', 'on the line', 'neither'] },
      { q: 'Dashed boundary line means:', a: 'strict inequality (< or >)', w: ['≤ or ≥', 'equals', 'no boundary'] },
      { q: 'Solid boundary line means:', a: 'includes equal (≤ or ≥)', w: ['< or >', 'infinite', 'no solution'] },
      { q: 'Graph -1 < x ≤ 4:', a: 'open at -1, closed at 4, segment between', w: ['closed both', 'open both', 'arrows'] },
      { q: 'To test shading region for y > 2x:', a: 'pick test point not on line', w: ['use origin always', 'guess', 'no test needed'] },
      { q: 'If (0,0) satisfies y < x + 1, shade:', a: 'region containing origin', w: ['opposite region', 'neither', 'both'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i]; if (!existingPrompts.has(p.q.toLowerCase())) { problems.push(createMCProblem('graphing-inequalities', p.q, p.a, p.w, 2, '8-12', 'Expressions & Equations', ['inequalities', 'graphing'])); existingPrompts.add(p.q.toLowerCase()); }
    }
    return problems;
  },

  'inequality-notation': (count) => {
    const problems = [];
    const qs = [
      { q: 'x > 5 means x is:', a: 'greater than 5', w: ['less than 5', 'equal to 5', 'at least 5'] },
      { q: 'x ≤ 3 means x is:', a: 'less than or equal to 3', w: ['less than 3', 'greater than 3', 'equal to 3 only'] },
      { q: 'The symbol ≥ means:', a: 'greater than or equal to', w: ['greater than', 'less than', 'not equal'] },
      { q: 'Write "at least 18" as inequality:', a: 'x ≥ 18', w: ['x > 18', 'x < 18', 'x ≤ 18'] },
      { q: 'Write "less than 100" as inequality:', a: 'x < 100', w: ['x ≤ 100', 'x > 100', 'x = 100'] },
      { q: '2 < x < 7 means x is:', a: 'between 2 and 7 (exclusive)', w: ['less than 2', 'greater than 7', 'equal to 2 or 7'] },
      { q: 'Write "no more than 50":', a: 'x ≤ 50', w: ['x < 50', 'x ≥ 50', 'x > 50'] },
      { q: 'Write "at most 20":', a: 'x ≤ 20', w: ['x < 20', 'x ≥ 20', 'x > 20'] },
      { q: 'x ≠ 5 means:', a: 'x is not equal to 5', w: ['x equals 5', 'x > 5', 'x < 5'] },
      { q: '-3 ≤ x ≤ 3 is called:', a: 'compound inequality', w: ['simple inequality', 'equation', 'expression'] },
      { q: 'Write "more than 0":', a: 'x > 0', w: ['x ≥ 0', 'x < 0', 'x = 0'] },
      { q: 'Symbol < means:', a: 'less than (strict)', w: ['less than or equal', 'greater than', 'equal'] },
      { q: 'Write "between -5 and 5 inclusive":', a: '-5 ≤ x ≤ 5', w: ['-5 < x < 5', 'x ≤ 5', '|x| < 5'] },
      { q: 'If x > -2 and x < 4, write combined:', a: '-2 < x < 4', w: ['x > -2 or x < 4', '-2 > x > 4', 'x < -2 or x > 4'] },
      { q: 'Interval notation for x ≥ 3:', a: '[3, ∞)', w: ['(3, ∞)', '[3, ∞]', '(3, ∞]'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i]; if (!existingPrompts.has(p.q.toLowerCase())) { problems.push(createMCProblem('inequality-notation', p.q, p.a, p.w, 1, '5-8', 'Expressions & Equations', ['inequalities'])); existingPrompts.add(p.q.toLowerCase()); }
    }
    return problems;
  },

  'multi-step-inequalities': (count) => {
    const problems = [];
    const qs = [
      { q: 'Solve: 2x + 3 > 7', a: 'x > 2', w: ['x > 5', 'x < 2', 'x > 4'] },
      { q: 'Solve: 3x - 5 ≤ 10', a: 'x ≤ 5', w: ['x ≤ 15', 'x ≥ 5', 'x < 5'] },
      { q: 'Solve: -2x > 8', a: 'x < -4', w: ['x > -4', 'x > 4', 'x < 4'] },
      { q: 'Solve: 4x + 1 < 2x + 9', a: 'x < 4', w: ['x < 8', 'x > 4', 'x < 5'] },
      { q: 'Solve: 5 - x ≥ 2', a: 'x ≤ 3', w: ['x ≥ 3', 'x ≤ -3', 'x ≥ -3'] },
      { q: 'When dividing by negative, inequality sign:', a: 'reverses', w: ['stays same', 'disappears', 'becomes equal'] },
      { q: 'Solve: -3x + 6 < 0', a: 'x > 2', w: ['x < 2', 'x > -2', 'x < -2'] },
      { q: 'Solve: 2(x - 1) > 6', a: 'x > 4', w: ['x > 3', 'x > 5', 'x < 4'] },
      { q: 'Solve: x/3 + 2 ≤ 5', a: 'x ≤ 9', w: ['x ≤ 7', 'x ≤ 3', 'x ≥ 9'] },
      { q: 'Solve: -4x - 8 ≥ 12', a: 'x ≤ -5', w: ['x ≥ -5', 'x ≤ 5', 'x ≥ 5'] },
      { q: 'Solve: 3(x + 2) < x + 10', a: 'x < 2', w: ['x < 4', 'x > 2', 'x < 8'] },
      { q: 'Solve: 5x - 3 ≥ 2x + 9', a: 'x ≥ 4', w: ['x ≥ 6', 'x ≤ 4', 'x ≥ 2'] },
      { q: 'Solve: (x + 4)/2 > 3', a: 'x > 2', w: ['x > 6', 'x > 10', 'x < 2'] },
      { q: 'Solve: 6 - 2x ≤ 4x', a: 'x ≥ 1', w: ['x ≤ 1', 'x ≥ 6', 'x ≤ 6'] },
      { q: 'Solve: -5(x - 1) < 15', a: 'x > -2', w: ['x < -2', 'x > 2', 'x < 2'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i]; if (!existingPrompts.has(p.q.toLowerCase())) { problems.push(createMCProblem('multi-step-inequalities', p.q, p.a, p.w, 3, '8-12', 'Expressions & Equations', ['inequalities', 'solving'])); existingPrompts.add(p.q.toLowerCase()); }
    }
    return problems;
  },

  'definite-integrals': (count) => {
    const problems = [];
    const qs = [
      { q: '∫₀² 3 dx = ?', a: '6', w: ['3', '2', '0'] },
      { q: '∫₁³ 2x dx = ?', a: '8', w: ['4', '6', '12'] },
      { q: '∫₀¹ x² dx = ?', a: '1/3', w: ['1', '1/2', '2/3'] },
      { q: '∫₋₁¹ x dx = ?', a: '0', w: ['1', '-1', '2'] },
      { q: '∫₀^π sin(x) dx = ?', a: '2', w: ['0', '1', '-2'] },
      { q: '∫₁⁴ √x dx = ?', a: '14/3', w: ['4', '7/3', '2'] },
      { q: '∫₀² (x + 1) dx = ?', a: '4', w: ['3', '6', '2'] },
      { q: '∫₂⁵ 1 dx = ?', a: '3', w: ['5', '2', '7'] },
      { q: '∫₀¹ e^x dx = ?', a: 'e - 1', w: ['e', '1', 'e + 1'] },
      { q: '∫₁² 1/x dx = ?', a: 'ln(2)', w: ['1', '2', 'ln(1)'] },
      { q: '∫₀^(π/2) cos(x) dx = ?', a: '1', w: ['0', '-1', 'π/2'] },
      { q: '∫₋₂² x³ dx = ?', a: '0', w: ['8', '-8', '16'] },
      { q: 'If ∫ₐᵇ f(x)dx = 5 and ∫ₐᵇ g(x)dx = 3, then ∫ₐᵇ [f(x)+g(x)]dx = ?', a: '8', w: ['15', '2', '53'] },
      { q: '∫₀³ 4x dx = ?', a: '18', w: ['12', '6', '36'] },
      { q: '∫₁⁴ 3x² dx = ?', a: '63', w: ['21', '48', '36'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i]; if (!existingPrompts.has(p.q.toLowerCase())) { problems.push(createMCProblem('definite-integrals', p.q, p.a, p.w, 4, 'Calculus', 'Calculus', ['integrals', 'definite'])); existingPrompts.add(p.q.toLowerCase()); }
    }
    return problems;
  },

  'graph-quadratic-functions': (count) => {
    const problems = [];
    const qs = [
      { q: 'The graph of y = x² is a:', a: 'parabola opening upward', w: ['line', 'circle', 'parabola opening down'] },
      { q: 'Vertex of y = (x - 2)² + 3 is:', a: '(2, 3)', w: ['(-2, 3)', '(2, -3)', '(3, 2)'] },
      { q: 'y = -x² opens:', a: 'downward', w: ['upward', 'left', 'right'] },
      { q: 'Axis of symmetry for y = x² - 4x + 3 is:', a: 'x = 2', w: ['x = 4', 'x = -2', 'x = 3'] },
      { q: 'y = (x + 1)² shifts y = x² by:', a: '1 unit left', w: ['1 unit right', '1 unit up', '1 unit down'] },
      { q: 'y = x² + 5 shifts y = x² by:', a: '5 units up', w: ['5 units down', '5 left', '5 right'] },
      { q: 'Vertex form of quadratic is:', a: 'y = a(x - h)² + k', w: ['y = ax² + bx + c', 'y = mx + b', 'y = a/x'] },
      { q: 'For y = ax², if a > 0, parabola opens:', a: 'upward', w: ['downward', 'left', 'neither'] },
      { q: 'y = 2x² compared to y = x² is:', a: 'narrower (steeper)', w: ['wider', 'same', 'shifted'] },
      { q: 'y = (1/2)x² compared to y = x² is:', a: 'wider (less steep)', w: ['narrower', 'same', 'inverted'] },
      { q: 'x-intercepts of y = (x-1)(x-3) are:', a: 'x = 1 and x = 3', w: ['x = -1, -3', 'x = 1 only', 'x = 3 only'] },
      { q: 'If vertex is (0,0), the quadratic could be:', a: 'y = x²', w: ['y = x² + 1', 'y = (x-1)²', 'y = x² - 1'] },
      { q: 'The minimum of y = x² - 6x + 9 is:', a: '0 at x = 3', w: ['9 at x = 0', '3 at x = 6', '-9 at x = 3'] },
      { q: 'y = -(x - 4)² + 2 has vertex:', a: '(4, 2)', w: ['(-4, 2)', '(4, -2)', '(2, 4)'] },
      { q: 'A quadratic with no real x-intercepts has discriminant:', a: 'negative', w: ['positive', 'zero', 'undefined'] },
    ];
    for (let i = 0; i < count && i < qs.length; i++) {
      const p = qs[i]; if (!existingPrompts.has(p.q.toLowerCase())) { problems.push(createMCProblem('graph-quadratic-functions', p.q, p.a, p.w, 3, '8-12', 'Functions', ['quadratic', 'graphing'])); existingPrompts.add(p.q.toLowerCase()); }
    }
    return problems;
  },
});
