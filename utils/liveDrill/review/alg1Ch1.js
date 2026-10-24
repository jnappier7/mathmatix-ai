/**
 * Chapter Review: Algebra 1 — Module 1 (Expressions, 1.1–1.6), built from Mr. Nappier's guided
 * notes, the paper practices and the Module 1 practice test. Quick-fire: one move per play —
 * translate words to an expression, evaluate with order of operations, name the property, combine
 * like terms, distribute (and Rex's sign error), absolute value with the minus inside or outside,
 * the concession-stand and summer-camp expressions, the test's cumulative ACT items.
 */
const { int, pick, sample, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Module', ch: 'Mod 1', blurb: 'Words to expressions, order of operations, properties, like terms, distributing, absolute value — mixed.' },
  numeric: { name: 'Numerical Expressions', ch: '1.1', blurb: 'Translate the words, evaluate with order of operations, the concession stand.' },
  algebraic: { name: 'Algebraic Expressions', ch: '1.2', blurb: 'Match the verbal expression, evaluate for given values, write the earnings expression.' },
  properties: { name: 'Properties', ch: '1.3', blurb: 'Name the property: commutative, associative, identity, inverse, reflexive, symmetric, transitive.' },
  distribute: { name: 'Distribute & Simplify', ch: '1.4', blurb: 'Combine like terms, distribute (both terms!), the perimeter expression.' },
  absval: { name: 'Absolute Value', ch: '1.5–1.6', blurb: 'The minus inside vs. outside the bars; accuracy as |t − m|; rates per unit.' },
  review: { name: 'Cumulative Review', ch: 'ACT style', blurb: 'Fractions, percents, integer operations.' },
};

const M = '−';
const num = (n) => (n < 0 ? `${M}${-n}` : String(n));
const uniq = (xs) => [...new Set(xs)];
const mc = (rand, ans, wrongs) => ({ choices: [ans, ...sample(rand, uniq(wrongs.filter((w) => w !== ans)), 3)], answer: 0 });
const nz = (rand, lo, hi) => { let v = 0; while (v === 0) v = int(rand, lo, hi); return v; };
const term = (a, v) => (a === 1 ? v : a === -1 ? `${M}${v}` : `${num(a)}${v}`);
const lin = (a, b, v = 'x') => (b === 0 ? term(a, v) : a === 0 ? num(b) : `${term(a, v)} ${b < 0 ? M : '+'} ${Math.abs(b)}`);
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const frac = (p, q) => { const g = gcd(p, q); return q / g === 1 ? String(p / g) : `${p / g}/${q / g}`; };

const T = {};

// ------------------------------------------------------------------ 1.1
T.wordsToNumeric = { book: 'numeric', make(rand) {
  const a = int(rand, 10, 40); const b = int(rand, 2, 9); const c = int(rand, 2, 9); if (b === c) return T.wordsToNumeric.make(rand);
  const Q = [
    { words: `${c} less than the difference of ${a} and ${b}`, ans: `(${a} ${M} ${b}) ${M} ${c}`, wrongs: [`${c} ${M} (${a} ${M} ${b})`, `(${a} ${M} ${b}) + ${c}`, `${a} ${M} (${b} ${M} ${c})`] },
    { words: `the product of ${b} and the sum of ${a} and ${c}`, ans: `${b}(${a} + ${c})`, wrongs: [`${b} · ${a} + ${c}`, `${b} + ${a} · ${c}`, `(${b} + ${a}) · ${c}`] },
    { words: `the quotient of ${a} and ${b}, increased by ${c}`, ans: `${a} ÷ ${b} + ${c}`, wrongs: [`${a} ÷ (${b} + ${c})`, `${b} ÷ ${a} + ${c}`, `(${a} + ${c}) ÷ ${b}`] },
    { words: `${c} more than the square of ${b}`, ans: `${b}² + ${c}`, wrongs: [`(${b} + ${c})²`, `${b} · 2 + ${c}`, `${c}² + ${b}`] },
    { words: `${a} decreased by the product of ${b} and ${c}`, ans: `${a} ${M} ${b} · ${c}`, wrongs: [`(${a} ${M} ${b}) · ${c}`, `${b} · ${c} ${M} ${a}`, `${a} ${M} ${b} + ${c}`] },
  ];
  const q = pick(rand, Q);
  return { ask: 'Write the numerical expression (do not evaluate)', prompt: q.words, ...mc(rand, q.ans, q.wrongs), tell: `"${q.words}" → ${q.ans}. "Less than" and "subtracted from" flip the order; "the sum/difference of" needs parentheses.` };
} };

T.orderOps = { book: 'numeric', make(rand) {
  const a = int(rand, 2, 9); const b = int(rand, 2, 9); const c = int(rand, 2, 6); const d = int(rand, 2, 9);
  const Q = [
    { expr: `${a} + ${b} × ${c}`, val: a + b * c, work: `multiply first: ${a} + ${b * c} = ${a + b * c}` },
    { expr: `(${a} + ${b}) × ${c} ${M} ${d}`, val: (a + b) * c - d, work: `parentheses, then multiply: ${a + b} × ${c} ${M} ${d} = ${(a + b) * c - d}` },
    { expr: `${a}² ${M} ${b} × ${c}`, val: a * a - b * c, work: `exponent, then multiply: ${a * a} ${M} ${b * c} = ${a * a - b * c}` },
    { expr: `${c}[(${a + b} ${M} ${b})² ÷ ${a}]`, val: c * a, work: `inside out: (${a})² = ${a * a}; ${a * a} ÷ ${a} = ${a}; ${c} × ${a} = ${c * a}` },
    { expr: `${a * b * 2} ÷ ${b} ${M} ${c} × ${d}`, val: 2 * a - c * d, work: `multiply and divide left to right: ${2 * a} ${M} ${c * d} = ${num(2 * a - c * d)}` },
  ];
  const q = pick(rand, Q);
  return { ask: 'Evaluate', prompt: q.expr, typed: q.val, neg: q.val < 0, tell: `${q.work}. Grouping, exponents, multiply/divide left to right, add/subtract left to right.` };
} };

T.concession = { book: 'numeric', make(rand) {
  const items = sample(rand, [['pretzel', 'pretzels'], ['hot dog', 'hot dogs'], ['water', 'waters'], ['nacho', 'nachos'], ['slice', 'slices']], 3);
  const prices = items.map(() => int(rand, 1, 5)); const counts = items.map(() => int(rand, 1, 5)); const total = prices.reduce((s, p, i) => s + p * counts[i], 0);
  const list = items.map((it, i) => `${counts[i]} ${counts[i] === 1 ? it[0] : it[1]}`).join(', ').replace(/, ([^,]*)$/, ', and $1');
  const menu = items.map((it, i) => `${it[0]} $${prices[i]}`).join(', ');
  return { ask: 'Total cost, in dollars', prompt: `Prices: ${menu}. The Ruiz family bought ${list}.`, typed: total,
    tell: `${items.map((it, i) => `${counts[i]}(${prices[i]})`).join(' + ')} = ${items.map((it, i) => counts[i] * prices[i]).join(' + ')} = $${total}.` };
} };

// ------------------------------------------------------------------ 1.2
T.matchVerbal = { book: 'algebraic', make(rand) {
  const a = int(rand, 2, 9); const b = int(rand, 2, 9); const v = pick(rand, ['m', 'n', 'k', 'x']);
  const Q = [
    { words: `the product of ${a} and ${v}, subtracted from ${b}`, ans: `${b} ${M} ${a}${v}` },
    { words: `${a} times the difference of ${b} and ${v}`, ans: `${a}(${b} ${M} ${v})` },
    { words: `${b} less than the product of ${a} and ${v}`, ans: `${a}${v} ${M} ${b}` },
    { words: `${b} decreased by the sum of ${a} and ${v}`, ans: `${b} ${M} (${a} + ${v})` },
    { words: `the sum of ${a} times ${v} and ${b}`, ans: `${a}${v} + ${b}` },
    { words: `${b} more than one-${['', '', 'half', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'][a]} of ${v}`, ans: `${v}/${a} + ${b}` },
  ];
  const q = pick(rand, Q);
  return { ask: 'Which expression?', prompt: q.words, ...mc(rand, q.ans, Q.map((x) => x.ans)), tell: `${q.ans}.` };
} };

T.evaluate = { book: 'algebraic', make(rand) {
  const a = int(rand, 1, 5); const b = int(rand, 1, 5); const c = int(rand, 2, 9); const k = pick(rand, [2, 3, 4]); const s = a + b; const d = pick(rand, [1, 2, 4].filter((x) => (k * s * s) % x === 0));
  return { ask: 'Evaluate', prompt: `${k}(a + b)² ÷ ${d} + 2c, if a = ${a}, b = ${b}, c = ${c}.`, typed: (k * s * s) / d + 2 * c,
    tell: `${k}(${s})² ÷ ${d} + 2(${c}) = ${k * s * s} ÷ ${d} + ${2 * c} = ${(k * s * s) / d} + ${2 * c} = ${(k * s * s) / d + 2 * c}.` };
} };

T.earnings = { book: 'algebraic', make(rand) {
  const p1 = int(rand, 8, 20); const p2 = int(rand, 8, 20); const n1 = int(rand, 2, 8); const n2 = int(rand, 2, 8); if (p1 === p2) return T.earnings.make(rand);
  if (rand() < 0.5) return { ask: 'Write the expression for her earnings', prompt: `Priya earns $${p1} per archery session (a) and $${p2} per canoe session (c).`, ...mc(rand, `${p1}a + ${p2}c`, [`${p2}a + ${p1}c`, `${p1 + p2}(a + c)`, `${p1}a · ${p2}c`, `a + c + ${p1 + p2}`]),
    tell: `each job's pay times its count: ${p1}a + ${p2}c.` };
  return { ask: 'Find her earnings, in dollars', prompt: `Priya earns $${p1} per archery session and $${p2} per canoe session. She leads ${n1} archery and ${n2} canoe sessions.`, typed: p1 * n1 + p2 * n2,
    tell: `${p1}(${n1}) + ${p2}(${n2}) = ${p1 * n1} + ${p2 * n2} = $${p1 * n1 + p2 * n2}.` };
} };

// ------------------------------------------------------------------ 1.3
T.property = { book: 'properties', make(rand) {
  const a = int(rand, 2, 9); const b = int(rand, 2, 9); const v = pick(rand, ['y', 'r', 'x']);
  const Q = [
    [`${a} · (${b} · ${v}) = (${a} · ${b}) · ${v}`, 'Associative Property of Multiplication'], [`(${a} + ${b}) + ${v} = ${a} + (${b} + ${v})`, 'Associative Property of Addition'],
    [`${a} · ${v} = ${v} · ${a}`, 'Commutative Property of Multiplication'], [`${a} + ${v} = ${v} + ${a}`, 'Commutative Property of Addition'],
    [`${v} · 1 = ${v}`, 'Multiplicative Identity'], [`${v} + 0 = ${v}`, 'Additive Identity'], [`${a} · (1/${a}) = 1`, 'Multiplicative Inverse'], [`${a} + (${M}${a}) = 0`, 'Additive Inverse'],
    [`${a}(${v} + ${b}) = ${a}${v} + ${a * b}`, 'Distributive Property'], [`${v} + ${a} = ${v} + ${a}`, 'Reflexive Property'], [`If ${a} + ${b} = ${a + b}, then ${a + b} = ${a} + ${b}`, 'Symmetric Property'],
    [`If ${v} = ${a} and ${a} = ${b} ${M} ${b - a}, then ${v} = ${b} ${M} ${b - a}`, 'Transitive Property'], [`${v} · 0 = 0`, 'Multiplicative Property of Zero'],
  ];
  const [s, w] = pick(rand, Q);
  return { ask: 'Name the property', prompt: s, ...mc(rand, w, Q.map((q) => q[1])), tell: `${w}.` };
} };

// ------------------------------------------------------------------ 1.4
T.combineLike = { book: 'distribute', make(rand) {
  const a = int(rand, 3, 12); const c = int(rand, 2, a - 1); const b = int(rand, 2, 12); const d = int(rand, 1, 12); const v = pick(rand, ['c', 'x', 'n']);
  const A = a - c; const B = b - d; if (B === 0) return T.combineLike.make(rand);
  return { ask: 'Simplify', prompt: `${a}${v} + ${b} ${M} ${c}${v} ${M} ${d}`, ...mc(rand, lin(A, B, v), [lin(A, b + d, v), lin(a + c, B, v), lin(A - B, 0, v) + '', lin(A, -B, v)]),
    tell: `like terms: ${a}${v} ${M} ${c}${v} = ${A}${v}; ${b} ${M} ${d} = ${num(B)}. ${lin(A, B, v)}.` };
} };

T.distributeSimplify = { book: 'distribute', make(rand) {
  const kind = rand() < 0.5 ? 'plus' : 'minus'; const v = pick(rand, ['x', 'p', 'y']);
  if (kind === 'plus') { const k = int(rand, 2, 8); const a = int(rand, 2, 5); const b = int(rand, 2, 9); const c = int(rand, 1, k * a - 1); const A = k * a - c; const B = k * b;
    return { ask: 'Simplify', prompt: `${k}(${a}${v} + ${b}) ${M} ${c}${v}`, ...mc(rand, lin(A, B, v), [lin(A, b, v), lin(k * a + c, B, v), lin(A, B - c, v), lin(k * a - c * k, B, v)]),
      tell: `distribute: ${k * a}${v} + ${B} ${M} ${c}${v} = ${lin(A, B, v)}.` }; }
  const a = int(rand, 6, 12); const k = int(rand, 2, a - 1); const b = int(rand, 2, 9); const A = a - k; const B = k * b;
  return { ask: 'Simplify', prompt: `${a}${v} ${M} ${k}(${v} ${M} ${b})`, ...mc(rand, lin(A, B, v), [lin(A, -B, v), lin(a + k, B, v), lin(A, b, v), lin(a - k * b, 0, v)]),
    tell: `distribute the ${M}${k} to BOTH terms: ${a}${v} ${M} ${k}${v} + ${B} = ${lin(A, B, v)}. A negative times a negative is positive.` };
} };

T.rexDistribute = { book: 'distribute', make(rand) {
  const k = int(rand, 2, 9); const a = int(rand, 2, 6); const b = int(rand, 2, 9);
  return { ask: `Rex wrote ${M}${k}(${a}x + ${b}) = ${M}${k * a}x + ${k * b}. What went wrong?`, prompt: 'Error analysis.',
    ...mc(rand, `the ${M}${k} makes BOTH products negative: ${M}${k * a}x ${M} ${k * b}`, [`nothing — that is correct`, `the first term should be positive: ${k * a}x + ${k * b}`, `he should not have distributed at all`]),
    tell: `${M}${k} · ${b} = ${M}${k * b}: ${M}${k * a}x ${M} ${k * b}.` };
} };

T.perimeter = { book: 'distribute', make(rand) {
  const a = int(rand, 2, 6); const b = nz(rand, -6, 6); const w = int(rand, 3, 10); const P = 2 * (a + 1); const C = 2 * b;
  if (rand() < 0.5) return { ask: 'Write a simplified expression for the perimeter', prompt: `A rectangle has width w and length ${lin(a, b, 'w')}.`, ...mc(rand, lin(P, C, 'w'), [lin(a + 1, b, 'w'), lin(P, b, 'w'), lin(a, C, 'w'), lin(P + 2, C, 'w')]),
    tell: `P = 2(length) + 2(width) = 2(${lin(a, b, 'w')}) + 2w = ${lin(P, C, 'w')}.` };
  return { ask: `Find the perimeter when w = ${w}`, prompt: `A rectangle has width w and length ${lin(a, b, 'w')}.`, typed: P * w + C, tell: `P = ${lin(P, C, 'w')}; w = ${w} → ${P * w} ${C < 0 ? M : '+'} ${Math.abs(C)} = ${P * w + C}.` };
} };

// ------------------------------------------------------------------ 1.5–1.6
T.absValue = { book: 'absval', make(rand) {
  const n = int(rand, 2, 9); const m = -int(rand, 2, 9); const p = int(rand, 2, 9);
  const Q = [[`|m|`, -m], [`${M}|n|`, -n], [`|${M}p|`, p], [`${M}|${M}m|`, m], [`|n| + |m|`, n - m], [`${M}|m| + p`, m + p], [`|m ${M} n|`, n - m], [`|n ${M} p| ${M} |m|`, Math.abs(n - p) + m]];
  const [e, val] = pick(rand, Q);
  return { ask: 'Evaluate', prompt: `${e}, where n = ${n}, m = ${num(m)}, p = ${p}.`, typed: val, neg: val < 0,
    tell: `a minus INSIDE the bars is absorbed; a minus OUTSIDE survives. ${e} = ${num(val)}.` };
} };

T.accuracy = { book: 'absval', make(rand) {
  const Q = [
    { q: 'The accuracy of a thermometer is the positive difference between its reading t and the actual temperature m. Which expression gives it?', ans: '|t − m|', wrongs: ['t − m', 'm + t', '|t| − |m|'] },
    { q: 'Which expression is equivalent to |t − m|?', ans: '|m − t|', wrongs: ['t − m', '−|t − m|', '|t| − |m|'] },
    { q: 'Absolute value is…', ans: 'the distance from zero on the number line — never negative', wrongs: ['the opposite of a number', 'the number without its decimal part', 'always the negative of the number'] },
  ];
  const q = pick(rand, Q);
  return { ask: 'Absolute value', prompt: q.q, ...mc(rand, q.ans, q.wrongs), tell: `${q.ans}.` };
} };

T.rate = { book: 'absval', make(rand) {
  const per = int(rand, 20, 90); const units = int(rand, 5, 25); const total = per * units; const kind = pick(rand, ['mpg', 'ppg']);
  if (kind === 'mpg') return { ask: 'Miles per gallon', prompt: `A car travels ${total} miles on ${units} gallons.`, typed: per, tell: `${total} ÷ ${units} = ${per} miles per gallon — a metric for comparing cars.` };
  return { ask: 'Points per game', prompt: `A team scored ${total} points over ${units} games.`, typed: per, tell: `${total} ÷ ${units} = ${per} points per game.` };
} };

T.compareMetrics = { book: 'absval', make(rand) {
  const g1 = int(rand, 15, 25); const g2 = int(rand, 12, 22); const p1 = int(rand, 60, 95); const p2 = int(rand, 60, 95); if (p1 === p2 || g1 === g2) return T.compareMetrics.make(rand);
  const t1 = p1 * g1; const t2 = p2 * g2; if ((t1 > t2) === (p1 > p2)) return T.compareMetrics.make(rand); // the two metrics disagree — that's the point
  return { ask: 'Which statement is true?', prompt: `Alvarez: ${t1} points in ${g1} games. Brooks: ${t2} points in ${g2} games.`,
    ...mc(rand, `${t1 > t2 ? 'Alvarez' : 'Brooks'} leads in total points, but ${p1 > p2 ? 'Alvarez' : 'Brooks'} leads in points per game`, [`${t1 > t2 ? 'Alvarez' : 'Brooks'} leads in both total points and points per game`, `${p1 > p2 ? 'Alvarez' : 'Brooks'} leads in both total points and points per game`, 'the two metrics always agree']),
    tell: `totals: ${t1} vs ${t2}. Per game: ${t1} ÷ ${g1} = ${p1} vs ${t2} ÷ ${g2} = ${p2}. Different metrics can rank the players differently.` };
} };

// ------------------------------------------------------------------ cumulative review
T.fractions = { book: 'review', make(rand) {
  const q1 = pick(rand, [4, 6, 8]); const q2 = pick(rand, [3, 6, 12].filter((q) => q !== q1)); const p1 = int(rand, 1, q1 - 1); const p2 = int(rand, 1, q2 - 1); const L = (q1 * q2) / gcd(q1, q2); const top = p1 * (L / q1) + p2 * (L / q2);
  if (gcd(p1, q1) !== 1 || gcd(p2, q2) !== 1) return T.fractions.make(rand);
  return { ask: 'Add', prompt: `${p1}/${q1} + ${p2}/${q2}`, ...mc(rand, frac(top, L), [frac(p1 + p2, q1 + q2), frac(p1 + p2, L), frac(p1 * p2, q1 * q2), frac(top, q1 * q2)]),
    tell: `common denominator ${L}: ${p1 * (L / q1)}/${L} + ${p2 * (L / q2)}/${L} = ${top}/${L}${frac(top, L) !== `${top}/${L}` ? ` = ${frac(top, L)}` : ''}.` };
} };

T.percentOf = { book: 'review', make(rand) {
  const pct = pick(rand, [10, 20, 25, 30, 40, 50, 60, 75, 80]); const n = pick(rand, [20, 40, 45, 60, 80, 85, 120, 150, 200]); if ((pct * n) % 100) return T.percentOf.make(rand);
  return { ask: 'Find the number', prompt: `${pct}% of ${n} is what number?`, typed: (pct * n) / 100, tell: `0.${pct.toString().padStart(2, '0')}(${n}) = ${(pct * n) / 100}.` };
} };

T.integerOps = { book: 'review', make(rand) {
  const a = nz(rand, -12, 12); const b = nz(rand, -12, 12); const c = nz(rand, -12, 12); const val = a - b + c;
  return { ask: 'Simplify', prompt: `${num(a)} ${M} (${num(b)}) + ${b < 0 && c < 0 ? `(${num(c)})` : num(c)}`, typed: val, neg: val < 0,
    tell: `subtracting ${num(b)} is adding ${num(-b)}: ${num(a)} + ${num(-b)} + ${num(c)} = ${num(val)}.` };
} };

T.vocab = { book: 'all', make(rand) {
  const V = [
    ['a mathematical phrase with numbers and operations but no variable', 'numerical expression'], ['a mathematical phrase with at least one variable', 'algebraic expression'],
    ['a symbol, usually a letter, that stands for a number', 'variable'], ['the number multiplied by a variable in a term', 'coefficient'], ['terms with the same variable raised to the same power', 'like terms'],
    ['a number whose square is the given number', 'square root'], ['the distance a number is from zero', 'absolute value'], ['two numbers whose product is 1', 'multiplicative inverses (reciprocals)'],
    ['using a graph, table or formula to describe a real situation', 'descriptive modeling'], ['a rule or measurement used to compare or rank things', 'metric'],
  ];
  const [d, w] = pick(rand, V);
  return { ask: 'Name it', prompt: d, ...mc(rand, w, V.map((v) => v[1])), tell: `${w}.` };
} };

module.exports = makeBank(BOOKS, T);
