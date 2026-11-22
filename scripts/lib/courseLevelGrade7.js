'use strict';
/**
 * At-level check items for 7th-grade math (Common Core grade 7).
 *
 * Thirteen course skills whose crosswalked bank pools did not test the skill
 * at grade level. Every answer is computed from the drawn numbers; every
 * prompt is text only (tables are listed inline, solids are described).
 * Re-solved from the printed text in tests/unit/courseLevelGrade7.test.js.
 */

const K = require('./templateKit');
const { int, pick } = K;

const COURSE_ID = '7th-grade-math';
const GB = '6-8';

const FRAC_FORM = 'Give your answer as a fraction in lowest terms.';
const DEC_FORM = 'Give your answer as a decimal.';
const NUM_FORM = 'Give your answer as a whole number or a decimal.';

// ── helpers ────────────────────────────────────────────────────────────────

/** Number for display, with a Unicode minus. */
const U = (n) => (n < 0 ? `−${String(-n)}` : String(n));
const uni = (s) => String(s).replace(/-/g, '−');

const rat = (n, d = 1) => { const [a, b] = K.reduce(n, d); return { n: a, d: b }; };
const add = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
const neg = (a) => ({ n: -a.n, d: a.d });
const sub = (a, b) => add(a, neg(b));
const mul = (a, b) => rat(a.n * b.n, a.d * b.d);
const div = (a, b) => rat(a.n * b.d, a.d * b.n);

function mixedStr(q) {
  const a = Math.abs(q.n), w = Math.floor(a / q.d), rem = a % q.d, sg = q.n < 0 ? '−' : '';
  if (rem === 0) return `${sg}${w}`;
  return w === 0 ? `${sg}${rem}/${q.d}` : `${sg}${w} ${rem}/${q.d}`;
}
/** A rational shown as a fraction or mixed number ("−2 1/3"). */
const mx = (n, d = 1) => { const q = rat(n, d); return { ...q, s: mixedStr(q) }; };
/** A rational shown as a plain (possibly improper) fraction. */
const fr = (n, d) => { const q = rat(n, d); return { ...q, s: q.d === 1 ? U(q.n) : `${q.n < 0 ? '−' : ''}${Math.abs(q.n)}/${q.d}` }; };
/** h hundredths (places = 2) or tenths (places = 1) shown as a decimal. */
const dc = (h, places) => { const q = rat(h, 10 ** places); return { ...q, s: `${h < 0 ? '−' : ''}${Math.abs(h) / 10 ** places}` }; };
const par = (q) => (q.n < 0 ? `(${q.s})` : q.s);
const flipS = (s) => (s.startsWith('−') ? s.slice(1) : `−${s}`);
const impS = (q) => `${U(q.n)}/${q.d}`;

/** Terminating decimal as an ASCII string, or null when it does not terminate. */
function decStr(q) {
  const { n, d } = rat(q.n, q.d);
  let m = d;
  while (m % 2 === 0) m /= 2;
  while (m % 5 === 0) m /= 5;
  if (m !== 1) return null;
  let p = 0, t = 1;
  while (t % d !== 0) { t *= 10; p += 1; }
  return p === 0 ? String(n) : (n / d).toFixed(p);
}
const fracStr = (q) => K.frac(q.n, q.d);

function proper(r, dens) {
  const d = pick(r, dens);
  let n = int(r, 1, d - 1);
  while (K.gcd(n, d) !== 1) n = int(r, 1, d - 1);
  return [n, d];
}

function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = int(r, 0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Re-draw until the generator produces an item (it returns null to reject a draw). */
const retry = (f) => (r, idx) => {
  for (let i = 0; i < 400; i++) { const o = f(r, idx); if (o) return o; }
  throw new Error('no acceptable draw in 400 tries');
};

/** Multiple choice: the right answer goes at position `pos`; null if options collide. */
function mc(prompt, correct, wrongs, pos, explanation) {
  const all = [correct, ...wrongs].map(String);
  if (all.length !== 4 || new Set(all).size !== 4) return null;
  const options = wrongs.map(String);
  options.splice(pos % 4, 0, String(correct));
  return { prompt, value: String(correct), options, correctOption: 'ABCD'[pos % 4], explanation };
}

function calc(expr, ans, form, explanation) {
  if (ans.d === 1) return null;
  if (form === 'frac') return { prompt: `Calculate: ${expr}. ${FRAC_FORM}`, value: fracStr(ans), explanation };
  const v = decStr(ans);
  if (v === null) return null;
  return { prompt: `Calculate: ${expr}. ${DEC_FORM}`, value: v, explanation };
}

const SIGN_SLIP = 'The usual slip is the sign: decide first whether the result is positive or negative.';

/** Explanation for a ± b (b already includes its own sign). */
function expAddSub(a, b, isSub, ans, form) {
  const b2 = isSub ? { ...neg(b), s: flipS(b.s) } : b;
  const lead = isSub ? `Subtracting ${b.s} is the same as adding ${b2.s}, so this is ${a.s} + ${par(b2)}. ` : '';
  if (form === 'dec') return `${lead}${a.s} + ${par(b2)} = ${uni(decStr(ans))}. ${SIGN_SLIP}`;
  const L = K.lcm(a.d, b2.d);
  const A = a.n * (L / a.d), B = b2.n * (L / b2.d);
  const tail = `${U(A + B)}/${L}` === uni(fracStr(ans)) ? '' : ` = ${uni(fracStr(ans))}`;
  return `${lead}Use the common denominator ${L}: ${U(A)}/${L} + ${B < 0 ? `(${U(B)}/${L})` : `${B}/${L}`} = ${U(A + B)}/${L}${tail}. ${SIGN_SLIP}`;
}

function expMulDiv(a, b, isDiv, ans, form) {
  const out = form === 'dec' ? uni(decStr(ans)) : uni(fracStr(ans));
  const sign = (a.n < 0) === (b.n < 0) ? 'Like signs give a positive result' : 'Unlike signs give a negative result';
  if (form === 'dec') {
    return `${sign}. ${a.s.replace('−', '')} ${isDiv ? '÷' : '×'} ${b.s.replace('−', '')} = ${out.replace('−', '')}, so the answer is ${out}. The usual slip is the sign or the decimal point.`;
  }
  if (isDiv) {
    return `Dividing by ${b.s} means multiplying by its reciprocal: ${impS(a)} × ${b.n < 0 ? `(${U(-b.d)}/${-b.n})` : `${b.d}/${b.n}`} = ${out}. ${sign}; the usual slip is flipping the wrong fraction.`;
  }
  return `Write each number as a fraction and multiply across: ${impS(a)} × ${b.n < 0 ? `(${impS(b)})` : impS(b)} = ${U(a.n * b.n)}/${a.d * b.d}${`${U(a.n * b.n)}/${a.d * b.d}` === out ? '' : ` = ${out}`}. ${sign}; the usual slip is the sign.`;
}

// ── linear-expression display ──────────────────────────────────────────────

const cf = (a, v = 'x') => (a === 1 ? v : a === -1 ? `−${v}` : `${U(a)}${v}`);
function lin(a, b, v = 'x') {
  if (a === 0) return U(b);
  if (b === 0) return cf(a, v);
  return `${cf(a, v)} ${b < 0 ? '−' : '+'} ${Math.abs(b)}`;
}

// ── money ──────────────────────────────────────────────────────────────────

const money = (cents) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));
const usd = (cents) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

// ── data sets ──────────────────────────────────────────────────────────────

const DEV5 = [[-3, -1, 0, 1, 3], [-4, -2, 0, 2, 4], [-2, -1, 0, 1, 2], [-5, -1, 0, 2, 4], [-3, -2, 0, 2, 3], [-4, -1, 0, 1, 4], [-6, -2, 0, 3, 5]];
const MAD2 = [[-3, -2, 0, 2, 3], [-4, -1, 0, 1, 4], [-5, 0, 0, 0, 5], [-3, -2, 0, 1, 4]];
const TIGHT = [[-2, -1, 0, 1, 2], [-1, -1, 0, 1, 1], [-2, 0, 0, 0, 2]];
const WIDE = [[-6, -2, 0, 3, 5], [-8, -3, 0, 4, 7], [-7, -4, 1, 2, 8]];
// Eight ordered values: [pattern, Q1, median, Q3]
const Q8 = {
  3: [[0, 1, 2, 3, 4, 4, 5, 7]],
  4: [[0, 1, 3, 4, 4, 5, 7, 9], [0, 2, 2, 3, 5, 6, 6, 8]],
  6: [[0, 2, 4, 5, 7, 8, 10, 12], [0, 3, 3, 6, 6, 9, 9, 11], [1, 2, 4, 6, 6, 8, 10, 13]],
  8: [[0, 1, 3, 5, 7, 9, 11, 12]],
};
const setOf = (r, mean, dev) => shuffle(r, dev.map((d) => mean + d));
const list = (a) => a.join(', ');
const meanOf = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const madOf = (a) => { const m = meanOf(a); return a.reduce((s, v) => s + Math.abs(v - m), 0) / a.length; };
const rangeOf = (a) => Math.max(...a) - Math.min(...a);
const medianOf = (a) => { const s = a.slice().sort((x, y) => x - y); const h = s.length / 2; return s.length % 2 ? s[(s.length - 1) / 2] : (s[h - 1] + s[h]) / 2; };

const GROUPS = [
  ['Quiz scores for two classes', 'Class A', 'Class B'],
  ['Points scored by two teams in their games', 'Team A', 'Team B'],
  ['Minutes of reading logged by two groups', 'Group A', 'Group B'],
  ['Plant heights, in cm, from two gardens', 'Garden A', 'Garden B'],
];

// ── proportional-relationship text pools ───────────────────────────────────

const PROP_EASY = [
  'The total cost of gasoline at $4 per gallon, and the number of gallons bought',
  'The distance a car travels at a steady 60 miles per hour, and the number of hours driven',
  'The total pay at $15 per hour, and the number of hours worked',
  'The number of pages printed at 20 pages per minute, and the number of minutes',
];
const NONPROP_EASY = [
  'The cost of a taxi ride that charges $3 plus $2 per mile, and the number of miles',
  'The total paid to a gym that charges a $25 sign-up fee plus $10 per month, and the number of months',
  'The height of a child, and the age of the child',
  'The height of a candle that starts 20 cm tall and burns down 2 cm each hour, and the number of hours',
  'The money in a jar that starts with $50 and gains $5 each week, and the number of weeks',
  'The cost of a pizza at $9 plus $1.50 per topping, and the number of toppings',
];
const PROP_HARD = [
  'The perimeter of a square, and its side length',
  'The water in a pool that starts empty and fills at 12 gallons per minute, and the minutes of filling',
  'The circumference of a circle, and its diameter',
  'The cost of ribbon sold at $0.75 per foot with no other fees, and the number of feet bought',
];
const NONPROP_HARD = [
  'The area of a square, and its side length',
  'The water in a pool that already holds 50 gallons and fills at 12 gallons per minute, and the minutes of filling',
  'The total cost of tickets at $8 each with a one-time $5 service fee, and the number of tickets',
  'A temperature in degrees Fahrenheit, and the same temperature in degrees Celsius',
  'The number of days left in a 30-day month, and the number of days that have passed',
  'The cost per person when a $60 bill is split equally, and the number of people',
];

function describeItem(r, props, nons, question) {
  const right = pick(r, props);
  const wrongs = shuffle(r, nons).slice(0, 3);
  return mc(question, right, wrongs, int(r, 0, 3),
    'A relationship is proportional when one quantity is always the same multiple of the other (y = kx), so it has no starting amount or fee and passes through (0, 0). The usual slip is to call any steady rate proportional even when there is a starting value.');
}

const cups = (q) => `${q.s} cup${q.n > q.d ? 's' : ''}`;
const an = (n) => (n === 8 || n === 11 || n === 18 ? 'an' : 'a');
const dol = (k) => (Number.isInteger(k) ? String(k) : k.toFixed(2));
const tbl = (xs, ys) => `x: ${xs.join(', ')}; y: ${ys.join(', ')}`;

// ── graph contexts ─────────────────────────────────────────────────────────

const GRAPH_CTX = [
  { what: 'the total cost y, in dollars, of x pounds of grapes',
    unit: (k) => `Each pound of grapes costs $${dol(k)}`,
    swap: (k) => `Each dollar buys ${k} pounds of grapes`,
    same: (k) => `${k} pounds of grapes cost $${dol(k)}`,
    start: (k) => `The cost starts at $${dol(k)} before any grapes are bought`,
    zero: 'Buying 0 pounds of grapes costs $0',
    zeroW: ['The first pound of grapes is free', 'Grapes cost $0 per pound', 'There is a fee even when no grapes are bought'],
    pt: (x, y) => `${x} pounds of grapes cost $${dol(y)}`, rate: (k) => `the unit rate is $${dol(k)} per pound` },
  { what: 'the distance y, in miles, that a cyclist rides in x hours',
    unit: (k) => `The cyclist rides ${k} miles each hour`,
    swap: (k) => `The cyclist takes ${k} hours to ride each mile`,
    same: (k) => `The cyclist rides ${k} miles in ${k} hours`,
    start: (k) => `The cyclist starts ${k} miles from home`,
    zero: 'In 0 hours the cyclist has ridden 0 miles',
    zeroW: ['The cyclist never moves', 'The cyclist rides 0 miles each hour', 'The cyclist starts 1 mile from home'],
    pt: (x, y) => `In ${x} hours the cyclist rides ${y} miles`, rate: (k) => `the unit rate is ${k} miles per hour` },
  { what: 'the amount y, in dollars, earned for x hours of work',
    unit: (k) => `The worker earns $${dol(k)} for each hour`,
    swap: (k) => `The worker needs ${k} hours to earn each dollar`,
    same: (k) => `The worker earns $${dol(k)} in ${k} hours`,
    start: (k) => `The worker is paid $${dol(k)} before working any hours`,
    zero: 'Working 0 hours earns $0',
    zeroW: ['The first hour of work is unpaid', 'The worker earns $0 per hour', 'The worker is paid a bonus just for starting'],
    pt: (x, y) => `${x} hours of work earn $${dol(y)}`, rate: (k) => `the unit rate is $${dol(k)} per hour` },
];

const EQ_CTX = [
  { txt: (k) => `Almonds cost $${k} per pound.`, ask: 'the total cost c, in dollars, of p pounds of almonds', Y: 'c', X: 'p' },
  { txt: (k) => `A printer prints ${k} pages per minute.`, ask: 'the number of pages n printed in t minutes', Y: 'n', X: 't' },
  { txt: (k) => `Dana earns $${k} per hour.`, ask: 'the amount e, in dollars, that Dana earns in h hours', Y: 'e', X: 'h' },
  { txt: (k) => `A train travels ${k} miles per hour.`, ask: 'the distance d, in miles, travelled in t hours', Y: 'd', X: 't' },
];

const OPS = ['<', '>', '≤', '≥'];
const FLIP = { '<': '>', '>': '<', '≤': '≥', '≥': '≤' };

/** Greatest or least integer in the solution set of  x OP b  (b rational). */
function extremeInt(op, bn, bd) {
  const b = bn / bd;
  if (op === '<') return { word: 'greatest', v: Math.ceil(b) - 1 };
  if (op === '≤') return { word: 'greatest', v: Math.floor(b) };
  if (op === '>') return { word: 'least', v: Math.floor(b) + 1 };
  return { word: 'least', v: Math.ceil(b) };
}

const TEMPLATES = [
  // ── 1 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'g7-add-subtract-rationals',
    skillId: 'g7-add-subtract-rationals',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const a = dc(-int(r, 12, 95), 1), b = dc(int(r, 105, 899), 2);
          const ans = add(a, b);
          return calc(`${a.s} + ${b.s}`, ans, 'dec', expAddSub(a, b, false, ans, 'dec'));
        }
        if (k === 1) {
          const [n1, d1] = proper(r, [2, 3, 4, 5, 6]); const [n2, d2] = proper(r, [3, 4, 5, 8, 10]);
          if (d1 === d2) return null;
          const a = fr(n1, d1), b = fr(-n2, d2); const ans = add(a, b);
          return calc(`${a.s} + ${par(b)}`, ans, 'frac', expAddSub(a, b, false, ans, 'frac'));
        }
        if (k === 2) {
          const a = dc(int(r, 12, 60), 1), b = dc(int(r, 61, 150), 1);
          const ans = sub(a, b);
          return calc(`${a.s} − ${b.s}`, ans, 'dec', expAddSub(a, b, true, ans, 'dec'));
        }
        const [n1, d1] = proper(r, [2, 3, 4, 6]); const [n2, d2] = proper(r, [3, 5, 8, 9]);
        if (d1 === d2) return null;
        const a = fr(-n1, d1), b = fr(n2, d2); const ans = sub(a, b);
        return calc(`${a.s} − ${b.s}`, ans, 'frac', expAddSub(a, b, true, ans, 'frac'));
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const [n1, d1] = proper(r, [3, 4, 5, 6, 8]); const [n2, d2] = proper(r, [2, 3, 4, 6, 9]);
          if (d1 === d2) return null;
          const a = fr(pick(r, [1, -1]) * n1, d1), b = fr(-n2, d2); const ans = sub(a, b);
          return calc(`${a.s} − ${par(b)}`, ans, 'frac', expAddSub(a, b, true, ans, 'frac'));
        }
        if (k === 1) {
          const a = dc(-int(r, 21, 98), 1), b = dc(-int(r, 105, 995), 2);
          const ans = sub(a, b);
          return calc(`${a.s} − ${par(b)}`, ans, 'dec', expAddSub(a, b, true, ans, 'dec'));
        }
        const [n1, d1] = proper(r, [2, 3, 4, 6]); const [n2, d2] = proper(r, [2, 3, 4, 5, 8]);
        if (d1 === d2) return null;
        if (k === 2) {
          const a = mx(-(int(r, 1, 4) * d1 + n1), d1), b = mx(int(r, 1, 3) * d2 + n2, d2); const ans = add(a, b);
          return calc(`${a.s} + ${b.s}`, ans, 'frac', expAddSub(a, b, false, ans, 'frac'));
        }
        const a = mx(int(r, 1, 2) * d1 + n1, d1), b = mx(int(r, 3, 5) * d2 + n2, d2); const ans = sub(a, b);
        return calc(`${a.s} − ${b.s}`, ans, 'frac', expAddSub(a, b, true, ans, 'frac'));
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const s = int(r, 205, 695), up = int(r, 102, 198), down = int(r, 1205, 3995);
          if (s % 10 === 0 || down % 10 === 0) return null;
          const ans = rat(-s * 10 + up * 10 - down, 100);
          const v = decStr(ans);
          if (ans.d === 1) return null;
          return { prompt: `A submarine is at an elevation of −${s / 10} m. It rises ${up / 10} m and then dives ${down / 100} m. What is its new elevation, in metres? ${DEC_FORM}`,
            value: v,
            explanation: `Rising adds and diving subtracts: −${s / 10} + ${up / 10} − ${down / 100} = ${uni(decStr(rat(-s + up, 10)))} − ${down / 100} = ${uni(v)}. The usual slip is treating the dive as moving toward zero.` };
        }
        if (k === 1) {
          const [n1, d1] = proper(r, [2, 3, 4]); const [n2, d2] = proper(r, [3, 4, 6]); const [n3, d3] = proper(r, [4, 6, 8]);
          if (d1 === d2 || d2 === d3) return null;
          const a = fr(-n1, d1), b = fr(n2, d2), c = fr(-n3, d3);
          const ans = sub(add(a, b), c);
          const L = K.lcm(K.lcm(d1, d2), d3);
          return calc(`${a.s} + ${b.s} − ${par(c)}`, ans, 'frac',
            `Subtracting ${c.s} adds ${flipS(c.s)}. With the common denominator ${L}: ${U(a.n * L / a.d)}/${L} + ${b.n * L / b.d}/${L} + ${-c.n * L / c.d}/${L} = ${uni(fracStr(ans))}. ${SIGN_SLIP}`);
        }
        if (k === 2) {
          const bal = int(r, 1205, 4995), dep = int(r, 2005, 5995), buy = int(r, 2505, 7995);
          const ans = -bal + dep - buy;
          if (ans % 100 === 0) return null;
          return { prompt: `An account has a balance of −$${(bal / 100).toFixed(2)}. After a deposit of $${(dep / 100).toFixed(2)} and then a purchase of $${(buy / 100).toFixed(2)}, what is the balance, in dollars? ${DEC_FORM}`,
            value: decStr(rat(ans, 100)),
            explanation: `A deposit adds and a purchase subtracts: −${(bal / 100).toFixed(2)} + ${(dep / 100).toFixed(2)} − ${(buy / 100).toFixed(2)} = ${uni(decStr(rat(-bal + dep, 100)))} − ${(buy / 100).toFixed(2)} = ${uni(decStr(rat(ans, 100)))}. The usual slip is ignoring that the balance started below zero.` };
        }
        const [n1, d1] = proper(r, [2, 3, 4, 6]); const [n2, d2] = proper(r, [3, 4, 5, 8]);
        if (d1 === d2) return null;
        const one = mx(-(int(r, 1, 3) * d1 + n1), d1), sum = mx(int(r, 1, 2) * d2 + n2, d2);
        const ans = sub(sum, one);
        if (ans.d === 1) return null;
        return { prompt: `The sum of two numbers is ${sum.s}. One of the numbers is ${one.s}. What is the other number? ${FRAC_FORM}`,
          value: fracStr(ans),
          explanation: `The other number is the sum minus the known number: ${sum.s} − (${one.s}) = ${sum.s} + ${flipS(one.s)} = ${uni(fracStr(ans))} (that is ${mixedStr(ans)}). The usual slip is subtracting ${flipS(one.s)} instead of adding it.` };
      }) },
    ],
  },

  // ── 2 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'g7-multiply-divide-rationals',
    skillId: 'g7-multiply-divide-rationals',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const [n1, d1] = proper(r, [3, 4, 5, 6, 8]); const [n2, d2] = proper(r, [3, 4, 5, 7, 9]);
          const a = fr(-n1, d1), b = fr(n2, d2); const ans = mul(a, b);
          return calc(`${a.s} × ${b.s}`, ans, 'frac', expMulDiv(a, b, false, ans, 'frac'));
        }
        if (k === 1) {
          const a = dc(-int(r, 3, 9), 1), b = dc(int(r, 12, 45), 1); const ans = mul(a, b);
          if (b.d === 1) return null;
          return calc(`${a.s} × ${b.s}`, ans, 'dec', expMulDiv(a, b, false, ans, 'dec'));
        }
        if (k === 2) {
          const [n1, d1] = proper(r, [3, 4, 5, 6, 8]); const [n2, d2] = proper(r, [3, 4, 5, 7, 9]);
          const a = fr(n1, d1), b = fr(-n2, d2); const ans = div(a, b);
          return calc(`${a.s} ÷ ${par(b)}`, ans, 'frac', expMulDiv(a, b, true, ans, 'frac'));
        }
        const v = int(r, 2, 9), q = pick(r, [15, 25, 35, 45, 12, 16, 24]);
        const b = dc(-v, 1), a = dc(-v * q, 2); const ans = div(a, b);
        return calc(`${a.s} ÷ ${par(b)}`, ans, 'dec', expMulDiv(a, b, true, ans, 'dec'));
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const [n1, d1] = proper(r, [2, 3, 4, 5]); const [n2, d2] = proper(r, [2, 3, 4, 6]);
          const a = mx(-(int(r, 1, 3) * d1 + n1), d1), b = mx(int(r, 1, 3) * d2 + n2, d2); const ans = mul(a, b);
          return calc(`${a.s} × ${b.s}`, ans, 'frac', expMulDiv(a, b, false, ans, 'frac'));
        }
        if (k === 1) {
          const [n1, d1] = proper(r, [2, 3, 4, 5]); const [n2, d2] = proper(r, [4, 5, 6, 8, 9]);
          const a = mx(int(r, 1, 3) * d1 + n1, d1), b = fr(-n2, d2); const ans = div(a, b);
          return calc(`${a.s} ÷ ${par(b)}`, ans, 'frac', expMulDiv(a, b, true, ans, 'frac'));
        }
        if (k === 2) {
          const a = dc(-int(r, 12, 96), 1), b = dc(-pick(r, [25, 15, 35, 45, 75, 5]), 2); const ans = mul(a, b);
          return calc(`${a.s} × ${par(b)}`, ans, 'dec', expMulDiv(a, b, false, ans, 'dec'));
        }
        const [n1, d1] = proper(r, [2, 3, 4, 6]); const [n2, d2] = proper(r, [3, 4, 5, 9]);
        const a = mx(-(int(r, 2, 4) * d1 + n1), d1), b = mx(-(int(r, 1, 2) * d2 + n2), d2); const ans = div(a, b);
        return calc(`${a.s} ÷ ${par(b)}`, ans, 'frac', expMulDiv(a, b, true, ans, 'frac'));
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const [n1, d1] = proper(r, [3, 4, 5]); const [n2, d2] = proper(r, [2, 4, 6]); const [n3, d3] = proper(r, [3, 6, 8, 9]);
          const a = fr(-n1, d1), b = fr(n2, d2), c = fr(-n3, d3);
          const ab = mul(a, b); const ans = div(ab, c);
          return calc(`${a.s} × ${b.s} ÷ ${par(c)}`, ans, 'frac',
            `Work left to right: ${a.s} × ${b.s} = ${uni(fracStr(ab))}, then ÷ ${par(c)} means × (−${c.d}/${-c.n}), giving ${uni(fracStr(ans))}. Two negative signs make the result positive; the usual slip is leaving it negative.`);
        }
        if (k === 1) {
          const rate = dc(-pick(r, [15, 25, 12, 18, 35, 24]), 1);
          const [n, d] = proper(r, [2, 4]); const t = mx(int(r, 2, 5) * d + n, d);
          const ans = mul(rate, t);
          const v = decStr(ans);
          if (ans.d === 1 || v === null) return null;
          return { prompt: `The temperature changes by ${rate.s} °C each hour. What is the total change in temperature after ${t.s} hours, in °C? ${DEC_FORM}`,
            value: v,
            explanation: `Total change = rate × time = ${rate.s} × ${t.s} = ${rate.s} × ${decStr(t)} = ${uni(v)}. A negative rate times a positive time is negative; the usual slip is dropping the sign.` };
        }
        if (k === 2) {
          const [n1, d1] = proper(r, [3, 4, 5, 6]); const [n2, d2] = proper(r, [4, 6, 8, 9]);
          const f = fr(-n1, d1), p = fr(n2, d2); const ans = div(p, f);
          if (ans.d === 1) return null;
          return { prompt: `The product of a number and ${f.s} is ${p.s}. What is the number? ${FRAC_FORM}`,
            value: fracStr(ans),
            explanation: `Undo the multiplication by dividing: ${p.s} ÷ (${f.s}) = ${p.s} × (−${f.d}/${-f.n}) = ${uni(fracStr(ans))}. The usual slip is multiplying ${p.s} by ${f.s} instead of dividing.` };
        }
        const t = pick(r, [25, 35, 45, 15, 75]); const per = -int(r, 4, 14) * pick(r, [5, 2, 6]);
        const total = dc(per * t, 2), time = dc(t, 1);
        if (total.d === 1) return null;
        const ans = div(total, time);
        const v = decStr(ans);
        return { prompt: `A diver's elevation changes by ${total.s} m in ${time.s} minutes at a steady rate. What is the change in elevation per minute, in metres? ${NUM_FORM}`,
          value: v,
          explanation: `Change per minute = total change ÷ time = ${total.s} ÷ ${time.s} = ${uni(v)}. A negative divided by a positive is negative; the usual slip is losing the sign or misplacing the decimal point.` };
      }) },
    ],
  },

  // ── 3 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'g7-simplify-expressions',
    skillId: 'g7-simplify-expressions',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const k = idx % 3;
        if (k === 0) {
          const a = int(r, 2, 6), p = int(r, 2, 5), q = K.nonZero(r, -9, 9), c = int(r, 2, 9);
          if (a * p + c + a * q === 0) return null;
          return mc(`Which expression is equivalent to ${a}(${lin(p, q)}) + ${c}x?`, lin(a * p + c, a * q),
            [lin(a * p + c, q), lin(a * p + c, -a * q), cf(a * p + c + a * q)], int(r, 0, 3),
            `Distribute ${a} to both terms: ${lin(a * p, a * q)}. Then combine the x-terms: ${a * p}x + ${c}x = ${a * p + c}x, giving ${lin(a * p + c, a * q)}. The usual slips are multiplying only the first term by ${a}, or adding the constant to the x-term.`);
        }
        if (k === 1) {
          const g = int(r, 2, 8), a = int(r, 1, 5), b = K.nonZero(r, -7, 7);
          if (K.gcd(a, Math.abs(b)) !== 1 || Math.abs(b) === 1) return null;
          return mc(`Which expression shows ${lin(g * a, g * b)} factored using the greatest common factor?`, `${g}(${lin(a, b)})`,
            [`${g}(${lin(a, g * b)})`, `${g}(${lin(a, -b)})`, `${g}(${lin(g * a, b)})`], int(r, 0, 3),
            `The greatest common factor of ${g * a} and ${Math.abs(g * b)} is ${g}. Divide BOTH terms by ${g}: ${g}(${lin(a, b)}). Check by distributing. The usual slip is dividing only one term by ${g}.`);
        }
        const a = int(r, 5, 13) / 2, c = int(r, 1, 4) / 2, b = int(r, 1, 6), d = int(r, 7, 12);
        if (a - c + b - d === 0) return null;
        return mc(`Which expression is equivalent to ${a}x + ${b} − ${c}x − ${d}?`, lin(a - c, b - d),
          [lin(a + c, b - d), lin(a - c, b + d), cf(a - c + b - d)], int(r, 0, 3),
          `Combine like terms: ${a}x − ${c}x = ${a - c}x and ${b} − ${d} = ${U(b - d)}, giving ${lin(a - c, b - d)}. The usual slips are adding instead of subtracting, or combining an x-term with a constant.`);
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const a = int(r, 2, 9), b = int(r, 2, 5), c = int(r, 1, 4), d = int(r, 1, 6);
          if (a - b * c === 0) return null;
          return mc(`Which expression is equivalent to ${a}x − ${b}(${lin(c, -d)})?`, lin(a - b * c, b * d),
            [lin(a - b * c, -b * d), lin(a - b * c, -d), lin(a + b * c, -b * d)], int(r, 0, 3),
            `Distribute −${b}: −${b} × ${cf(c)} = −${b * c}x and −${b} × (−${d}) = +${b * d}. Then ${a}x − ${b * c}x = ${cf(a - b * c)}, giving ${lin(a - b * c, b * d)}. The usual slip is writing −${b * d}: a negative times a negative is positive.`);
        }
        if (k === 1) {
          const n = pick(r, [2, 3, 4]), p = int(r, 1, 4), q = K.nonZero(r, -5, 5), c = int(r, 2, 6);
          if (p - c === 0 || p - c + q === 0 || p * n - c === 0) return null;
          return mc(`Which expression is equivalent to (1/${n})(${lin(p * n, q * n)}) − ${c}x?`, lin(p - c, q),
            [lin(p - c, q * n), lin(p * n - c, q), cf(p - c + q)], int(r, 0, 3),
            `Multiply both terms by 1/${n}: ${lin(p, q)}. Then ${cf(p)} − ${c}x = ${cf(p - c)}, giving ${lin(p - c, q)}. The usual slip is taking 1/${n} of only one of the two terms.`);
        }
        if (k === 2) {
          const g = int(r, 2, 7), a = int(r, 1, 5), b = int(r, 2, 7);
          if (K.gcd(a, b) !== 1) return null;
          return mc(`Which expression is equivalent to ${lin(-g * a, g * b)}?`, `−${g}(${lin(a, -b)})`,
            [`−${g}(${lin(a, b)})`, `−${g}(${lin(a, -g * b)})`, `${g}(${lin(a, -b)})`], int(r, 0, 3),
            `Factor out −${g}: −${g * a}x ÷ (−${g}) = ${cf(a)} and ${g * b} ÷ (−${g}) = −${b}, so the expression is −${g}(${lin(a, -b)}). Check: −${g} × (−${b}) = +${g * b}. The usual slip is keeping + ${b} inside the parentheses.`);
        }
        const p = int(r, 2, 6), q = int(r, 1, 5), c = pick(r, [0.5, 1.5, 2.5]);
        return mc(`Which expression is equivalent to 0.5(${lin(2 * p, -2 * q)}) − ${c}x?`, lin(p - c, -q),
          [lin(p - c, -2 * q), lin(2 * p - c, -q), lin(p + c, -q)], int(r, 0, 3),
          `Distribute 0.5: ${lin(p, -q)}. Then ${cf(p)} − ${c}x = ${cf(p - c)}, giving ${lin(p - c, -q)}. The usual slips are halving only one term, or adding ${c}x instead of subtracting it.`);
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const a = int(r, 2, 5), p = int(r, 2, 4), q = K.nonZero(r, -5, 5), b = int(r, 2, 4), u = int(r, 1, 3), v = -int(r, 1, 6);
          if (a * p - b * u === 0 || a * q - b * v === 0 || a * q + b * v === 0) return null;
          return mc(`Which expression is equivalent to ${a}(${lin(p, q)}) − ${b}(${lin(u, v)})?`, lin(a * p - b * u, a * q - b * v),
            [lin(a * p - b * u, a * q + b * v), lin(a * p - b * u, a * q - v), lin(a * p + b * u, a * q + b * v)], int(r, 0, 3),
            `Distribute ${a} and −${b}: ${lin(a * p, a * q)} − ${b * u}x + ${-b * v}. Combine: ${cf(a * p - b * u)} and ${U(a * q)} + ${-b * v} = ${U(a * q - b * v)}, giving ${lin(a * p - b * u, a * q - b * v)}. The usual slip is not distributing the negative to the second term in the parentheses.`);
        }
        if (k === 1) {
          const d1 = pick(r, [3, 4, 5]), n1 = int(r, 2, d1 - 1), d2 = pick(r, [2, 3, 4]);
          if (K.gcd(n1, d1) !== 1) return null;
          const p = int(r, 1, 3), q = -int(r, 1, 4), u = int(r, 1, 3), v = int(r, 1, 4);
          if (n1 * p - u === 0 || n1 * q + v === 0) return null;
          return mc(`Which expression is equivalent to (${n1}/${d1})(${lin(d1 * p, d1 * q)}) − (1/${d2})(${lin(d2 * u, d2 * v)})?`, lin(n1 * p - u, n1 * q - v),
            [lin(n1 * p - u, n1 * q + v), lin(n1 * p + u, n1 * q + v), lin(n1 * p - u, n1 * q - d2 * v)], int(r, 0, 3),
            `(${n1}/${d1})(${lin(d1 * p, d1 * q)}) = ${lin(n1 * p, n1 * q)} and −(1/${d2})(${lin(d2 * u, d2 * v)}) = ${lin(-u, -v)}. Combining gives ${lin(n1 * p - u, n1 * q - v)}. The usual slip is subtracting only the first term of the second product.`);
        }
        if (k === 2) {
          const b = int(r, 2, 5), a = b + int(r, 2, 5), d = int(r, 2, 6);
          if (a - b === b) return null;
          return mc(`A student simplified ${a}x − ${b}(x − ${d}) and got ${lin(a - b, -b * d)}. Which statement is correct?`,
            `The student did not distribute the negative: −${b} × (−${d}) = +${b * d}, so the answer is ${lin(a - b, b * d)}`,
            ['The student is correct',
              `The student should have subtracted first: (${a} − ${b})(x − ${d}), so the answer is ${lin(a - b, -(a - b) * d)}`,
              `The student should not have multiplied ${d} by ${b}, so the answer is ${lin(a - b, -d)}`], int(r, 0, 3),
            `Distributing −${b} gives −${b}x and −${b} × (−${d}) = +${b * d}. So ${a}x − ${b}x + ${b * d} = ${lin(a - b, b * d)}. The student kept the sign of ${d} instead of multiplying two negatives.`);
        }
        const p = int(r, 2, 4), q = int(r, 1, 5), u = pick(r, [0.5, 1.5, 2.5]), v = pick(r, [-1.5, -0.5, 0.5, 2.5]);
        return mc(`A rectangle has length (${lin(p, q)}) units and width (${lin(u, v)}) units. Which expression is its perimeter, in units?`, lin(2 * p + 2 * u, 2 * q + 2 * v),
          [lin(p + u, q + v), lin(2 * p + 2 * u, q + v), lin(2 * p + u, 2 * q + v)], int(r, 0, 3),
          `Perimeter = 2(length) + 2(width) = 2(${lin(p, q)}) + 2(${lin(u, v)}) = ${lin(2 * p, 2 * q)} + ${lin(2 * u, 2 * v)} = ${lin(2 * p + 2 * u, 2 * q + 2 * v)}. The usual slips are adding the sides only once, or doubling only part of the expression.`);
      }) },
    ],
  },

  // ── 4 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'g7-inequalities',
    skillId: 'g7-inequalities',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const op = pick(r, OPS);
        if (idx % 2 === 0) {
          const p = int(r, 2, 6), m = K.nonZero(r, -5, 5), n = int(r, 2, 9);
          const q = p * m, rr = p * n, b = n - m;
          return mc(`Which inequality describes all solutions of ${lin(p, q)} ${op} ${rr}?`, `x ${op} ${U(b)}`,
            [`x ${FLIP[op]} ${U(b)}`, `x ${op} ${U(n + m)}`, `x ${op} ${U(rr - q)}`], int(r, 0, 3),
            `${q < 0 ? `Add ${-q} to` : `Subtract ${q} from`} both sides: ${p}x ${op} ${rr - q}. Divide by ${p} (positive, so the symbol stays): x ${op} ${U(b)}. The usual slips are forgetting to divide, moving ${Math.abs(q)} the wrong way, or flipping the symbol when no negative was divided.`);
        }
        const p = int(r, 2, 6), q = K.nonZero(r, -9, 9), rr = int(r, 10, 40);
        const { word, v } = extremeInt(op, rr - q, p);
        return { prompt: `What is the ${word} integer that satisfies ${lin(p, q)} ${op} ${rr}?`,
          value: v,
          explanation: `${q < 0 ? `Add ${-q}` : `Subtract ${q}`}: ${p}x ${op} ${rr - q}. Divide by ${p}: x ${op} ${uni(K.frac(rr - q, p))}${(rr - q) % p === 0 ? '' : ` (about ${((rr - q) / p).toFixed(2)})`}. The ${word} integer that makes this true is ${U(v)}. The usual slip is including or leaving out the boundary value wrongly.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const op = pick(r, OPS);
        if (idx % 2 === 0) {
          const a = int(r, 2, 6), m = int(r, 1, 6), n = K.nonZero(r, -4, 9);
          const q = a * m, rr = a * n, B = m - n;
          if (B === 0) return null;
          const lhs = idx % 4 === 0 ? lin(-a, q) : `${q} − ${cf(a)}`;
          return mc(`Which inequality describes all solutions of ${lhs} ${op} ${U(rr)}?`, `x ${FLIP[op]} ${U(B)}`,
            [`x ${op} ${U(B)}`, `x ${FLIP[op]} ${U(-B)}`, `x ${op} ${U(-B)}`], int(r, 0, 3),
            `Subtract ${q} from both sides: −${a}x ${op} ${U(rr - q)}. Divide by −${a} and FLIP the symbol: x ${FLIP[op]} ${U(B)}. The usual slip is forgetting to reverse the inequality when dividing by a negative.`);
        }
        const a = int(r, 2, 6), q = K.nonZero(r, -9, 12), rr = K.nonZero(r, -20, 20);
        if (rr === q) return null;
        const { word, v } = extremeInt(FLIP[op], rr - q, -a);
        return { prompt: `What is the ${word} integer that satisfies ${lin(-a, q)} ${op} ${U(rr)}?`,
          value: v,
          explanation: `${q < 0 ? `Add ${-q}` : `Subtract ${q}`}: −${a}x ${op} ${U(rr - q)}. Divide by −${a} and flip the symbol: x ${FLIP[op]} ${uni(K.frac(rr - q, -a))}. The ${word} integer that works is ${U(v)}. The usual slip is not flipping the symbol, which sends you to the wrong side of the boundary.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const total = int(r, 4, 9) * 10, first = int(r, 9, 19), each = pick(r, [350, 450, 250, 550, 375]);
          const n = Math.floor((total - first) * 100 / each);
          return { prompt: `Maya can spend no more than $${total}. She buys a book for $${first} and wants to buy notebooks that cost $${(each / 100).toFixed(2)} each. What is the greatest number of notebooks she can buy?`,
            value: n,
            explanation: `${first} + ${each / 100}n ≤ ${total}, so ${each / 100}n ≤ ${total - first} and n ≤ ${((total - first) * 100 / each).toFixed(2).replace(/\.?0+$/, '')}. She can buy at most ${n} whole notebooks. The usual slip is rounding up, which would cost more than $${total}.` };
        }
        if (k === 1) {
          const goal = int(r, 4, 9) * 100, have = int(r, 11, 29) * 5, per = pick(r, [35, 45, 55, 65, 40]);
          const n = Math.ceil((goal - have) / per);
          if ((goal - have) % per === 0) return null;
          return { prompt: `A club needs to raise at least $${goal}. It already has $${have} and earns $${per} at each car wash. What is the least number of car washes the club must hold?`,
            value: n,
            explanation: `${have} + ${per}n ≥ ${goal}, so ${per}n ≥ ${goal - have} and n ≥ ${((goal - have) / per).toFixed(2)}. The least whole number that works is ${n}. The usual slip is rounding down, which leaves the club short of $${goal}.` };
        }
        if (k === 2) {
          const F = int(r, 12, 30), c = pick(r, [3, 4, 6, 8]), M = F + c * int(r, 6, 15);
          if (pick(r, [0, 1]) === 0) {
            return mc(`A bowling alley charges $${F} to rent a lane plus $${c} per game. A group wants to spend no more than $${M}. Which inequality can be used to find g, the number of games the group can play?`,
              `${F} + ${c}g ≤ ${M}`, [`${F} + ${c}g ≥ ${M}`, `${F} + ${c}g < ${M}`, `${c} + ${F}g ≤ ${M}`], int(r, 0, 3),
              `The total cost is the fixed $${F} plus $${c} for each game: ${F} + ${c}g. "No more than $${M}" means less than OR equal to, so ${F} + ${c}g ≤ ${M}. The usual slips are using < (which leaves out exactly $${M}) or swapping the fee and the per-game price.`);
          }
          return mc(`A salesperson earns $${F} a day plus $${c} for each sale. She wants to earn at least $${M} today. Which inequality can be used to find s, the number of sales she needs?`,
            `${F} + ${c}s ≥ ${M}`, [`${F} + ${c}s ≤ ${M}`, `${F} + ${c}s > ${M}`, `${c} + ${F}s ≥ ${M}`], int(r, 0, 3),
            `Her pay is the fixed $${F} plus $${c} for each sale: ${F} + ${c}s. "At least $${M}" means greater than OR equal to, so ${F} + ${c}s ≥ ${M}. The usual slips are using > (which leaves out exactly $${M}) or swapping the daily amount and the per-sale amount.`);
        }
        const op = pick(r, OPS), a = int(r, 2, 6), q = int(r, 3, 15), rr = K.nonZero(r, -20, 9);
        if ((rr - q) % a === 0) return null;
        const { word, v } = extremeInt(FLIP[op], rr - q, -a);
        return { prompt: `What is the ${word} integer that satisfies ${q} − ${cf(a)} ${op} ${U(rr)}?`,
          value: v,
          explanation: `Subtract ${q}: −${a}x ${op} ${U(rr - q)}. Divide by −${a} and flip the symbol: x ${FLIP[op]} ${uni(K.frac(rr - q, -a))} (about ${((rr - q) / -a).toFixed(2)}). The ${word} integer that works is ${U(v)}. The usual slip is forgetting to flip the symbol.` };
      }) },
    ],
  },

  // ── 5 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'g7-unit-rates',
    skillId: 'g7-unit-rates',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const R = int(r, 2, 6); const [n, d] = proper(r, [2, 3, 4, 5]);
          const T = mx(n, d), D = mx(R * n, d);
          if (D.d === 1) return null;
          return { prompt: `Lena walks ${D.s} mile${D.n > D.d ? 's' : ''} in ${T.s} hour. What is her unit rate, in miles per hour?`,
            value: R,
            explanation: `Unit rate = miles ÷ hours = ${D.s} ÷ ${T.s} = ${impS(D)} × ${T.d}/${T.n} = ${R} miles per hour. The usual slip is multiplying the two fractions instead of dividing.` };
        }
        if (k === 1) {
          const w = pick(r, [15, 25, 35, 8, 12]), u = pick(r, [150, 250, 350, 450, 325, 275]);
          const cents = w * u / 10;
          if (!Number.isInteger(cents)) return null;
          return { prompt: `A ${w / 10}-pound bag of rice costs $${(cents / 100).toFixed(2)}. What is the price per pound, in dollars? ${DEC_FORM}`,
            value: money(u),
            explanation: `Price per pound = cost ÷ pounds = ${(cents / 100).toFixed(2)} ÷ ${w / 10} = ${(u / 100).toFixed(2)}. The usual slip is dividing the pounds by the cost, which gives pounds per dollar.` };
        }
        if (k === 2) {
          const [n1, d1] = proper(r, [3, 4, 5]); const [n2, d2] = proper(r, [2, 3, 4]);
          const S = fr(n1, d1), B = fr(n2, d2); const ans = div(S, B);
          if (ans.d === 1) return null;
          return { prompt: `A recipe uses ${S.s} cup of sugar for ${B.s} of a batch of cookies. How many cups of sugar are needed for 1 whole batch? ${FRAC_FORM}`,
            value: fracStr(ans),
            explanation: `Cups per batch = ${S.s} ÷ ${B.s} = ${S.s} × ${B.d}/${B.n} = ${fracStr(ans)}. The usual slip is multiplying ${S.s} by ${B.s} instead of dividing.` };
        }
        const R = pick(r, [15, 25, 35, 45]); const [n, d] = proper(r, [3, 5]);
        const T = fr(n, d), D = mx(R * n, 10 * d);
        return { prompt: `A snail moves ${D.s} ${D.n > D.d ? 'feet' : 'foot'} in ${T.s} minute. What is its unit rate, in feet per minute? ${DEC_FORM}`,
          value: decStr(rat(R, 10)),
          explanation: `Unit rate = feet ÷ minutes = ${D.s} ÷ ${T.s} = ${impS(D)} × ${T.d}/${T.n} = ${R / 10} feet per minute. The usual slip is dividing the time by the distance.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const R = pick(r, [6, 8, 9, 12, 14, 15, 7.5, 10.5, 12.5]);
          const T = mx(...pick(r, [[5, 4], [3, 2], [5, 2], [4, 3], [7, 4], [9, 4]]));
          const D = mx(R * 2 * T.n, 2 * T.d);
          if (D.d === 1) return null;
          return { prompt: `A cyclist rides ${D.s} miles in ${T.s} hours at a steady speed. What is the unit rate, in miles per hour? ${NUM_FORM}`,
            value: String(R),
            explanation: `Unit rate = ${D.s} ÷ ${T.s} = ${impS(D)} ÷ ${impS(T)} = ${impS(D)} × ${T.d}/${T.n} = ${R} miles per hour. The usual slip is not changing the mixed numbers to improper fractions before dividing.` };
        }
        if (k === 1) {
          const oa = pick(r, [8, 10, 12]), ob = pick(r, [16, 20, 24]);
          const ua = int(r, 18, 32), ub = ua + pick(r, [-3, -2, 2, 3]);
          const best = Math.min(ua, ub);
          return { prompt: `Brand A sells ${oa} ounces of trail mix for $${(oa * ua / 100).toFixed(2)}. Brand B sells ${ob} ounces for $${(ob * ub / 100).toFixed(2)}. What is the unit price, in dollars per ounce, of the better buy? ${DEC_FORM}`,
            value: (best / 100).toFixed(2),
            explanation: `Brand A: ${(oa * ua / 100).toFixed(2)} ÷ ${oa} = $${(ua / 100).toFixed(2)} per ounce. Brand B: ${(ob * ub / 100).toFixed(2)} ÷ ${ob} = $${(ub / 100).toFixed(2)} per ounce. The better buy is the LOWER unit price, $${(best / 100).toFixed(2)}. The usual slip is choosing the lower total price or the bigger bag without finding the unit prices.` };
        }
        if (k === 2) {
          const [n1, d1] = proper(r, [3, 4, 5, 8]); const [n2, d2] = proper(r, [2, 3, 4, 6]);
          const part = fr(n1, d1), time = fr(n2, d2); const ans = div(time, part);
          if (ans.d === 1) return null;
          return { prompt: `A hose fills ${part.s} of a tank in ${time.s} hour. At this rate, how many hours does it take to fill 1 whole tank? ${FRAC_FORM}`,
            value: fracStr(ans),
            explanation: `Hours per tank = hours ÷ tanks = ${time.s} ÷ ${part.s} = ${time.s} × ${part.d}/${part.n} = ${fracStr(ans)}. The usual slip is dividing the other way, which gives tanks per hour (${fracStr(div(part, time))}).` };
        }
        const R = pick(r, [2, 3, 4, 1.5, 2.5]); const [n, d] = proper(r, [2, 3, 4, 8]);
        const salt = fr(n, d), flour = mx(R * 2 * n, 2 * d);
        if (flour.d === 1) return null;
        return { prompt: `A bread recipe uses ${cups(flour)} of flour for every ${salt.s} teaspoon of salt. How many cups of flour are used per 1 teaspoon of salt? ${NUM_FORM}`,
          value: String(R),
          explanation: `Cups per teaspoon = ${flour.s} ÷ ${salt.s} = ${impS(flour)} × ${salt.d}/${salt.n} = ${R}. The usual slip is dividing the salt by the flour, which answers a different question.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const ra = int(r, 22, 38), rb = ra + pick(r, [-6, -5, -4, 4, 5, 6]);
          const ga = mx(...pick(r, [[3, 4], [1, 2], [3, 2]])), gb = mx(...pick(r, [[5, 4], [1, 4], [5, 2]]));
          const da = mx(ra * ga.n, ga.d), db = mx(rb * gb.n, gb.d);
          if (da.d === 1 || db.d === 1) return null;
          return { prompt: `Car A travels ${da.s} miles on ${ga.s} gallon${ga.n > ga.d ? 's' : ''} of gas. Car B travels ${db.s} miles on ${gb.s} gallon${gb.n > gb.d ? 's' : ''} of gas. How many more miles per gallon does the more efficient car get?`,
            value: Math.abs(ra - rb),
            explanation: `Car A: ${da.s} ÷ ${ga.s} = ${ra} miles per gallon. Car B: ${db.s} ÷ ${gb.s} = ${rb} miles per gallon. The difference is ${Math.abs(ra - rb)}. The usual slip is comparing the distances without dividing by the gallons.` };
        }
        if (k === 1) {
          const T = fr(...pick(r, [[2, 5], [3, 4], [3, 5], [2, 3]])), R4 = pick(r, [10, 14, 15, 18, 13, 11]);
          const D = mx(R4 * T.n, 4 * T.d), H = int(r, 2, 4);
          if (D.d === 1 || (R4 * H) % 4 === 0) return null;
          return { prompt: `Omar walks ${D.s} mile${D.n > D.d ? 's' : ''} in ${T.s} hour. At this rate, how many miles does he walk in ${H} hours? ${DEC_FORM}`,
            value: decStr(rat(R4 * H, 4)),
            explanation: `Unit rate = ${D.s} ÷ ${T.s} = ${R4 / 4} miles per hour. In ${H} hours: ${R4 / 4} × ${H} = ${R4 * H / 4} miles. The usual slip is multiplying ${D.s} by ${H} without first finding the rate for one hour.` };
        }
        if (k === 2) {
          const [n1, d1] = proper(r, [2, 3, 4]); const [n2, d2] = proper(r, [4, 5, 6, 8]);
          const D = fr(n1, d1), T = fr(n2, d2);
          const right = div(D, T), prod = mul(D, T), inv = div(T, D), sum = add(D, T);
          if (right.d !== 1 && decStr(right) === null) return null;
          const name = pick(r, ['Jo', 'Ravi', 'Mia', 'Theo']);
          return mc(`${name} says that running ${D.s} mile in ${T.s} hour is a unit rate of ${fracStr(prod)} mile per hour. Which statement is correct?`,
            `${name} multiplied instead of dividing; the unit rate is ${D.s} ÷ ${T.s} = ${mixedStr(right)} miles per hour`,
            [`${name} is correct`,
              `${name} should have divided ${T.s} by ${D.s}; the unit rate is ${mixedStr(inv)} miles per hour`,
              `${name} should have added; the unit rate is ${mixedStr(sum)} miles per hour`], int(r, 0, 3),
            `A unit rate in miles per hour is miles ÷ hours: ${D.s} ÷ ${T.s} = ${D.s} × ${T.d}/${T.n} = ${mixedStr(right)}. ${name} found ${D.s} × ${T.s} = ${fracStr(prod)}, which is not a rate.`);
        }
        const ua = pick(r, [480, 520, 560, 640, 720]), ub = ua + pick(r, [-80, -40, 40, 80]);
        const wa = mx(...pick(r, [[3, 4], [1, 2], [1, 4]])), wb = mx(...pick(r, [[5, 4], [3, 2], [7, 4]]));
        const ca = ua * wa.n / wa.d, cb = ub * wb.n / wb.d;
        if (!Number.isInteger(ca) || !Number.isInteger(cb)) return null;
        return { prompt: `Store A sells ${wa.s} pound of cheese for $${(ca / 100).toFixed(2)}. Store B sells ${wb.s} pounds of the same cheese for $${(cb / 100).toFixed(2)}. How much less per pound, in dollars, does the cheaper store charge? ${DEC_FORM}`,
          value: (Math.abs(ua - ub) / 100).toFixed(2).replace(/0$/, ''),
          explanation: `Store A: ${(ca / 100).toFixed(2)} ÷ ${wa.s} = $${(ua / 100).toFixed(2)} per pound. Store B: ${(cb / 100).toFixed(2)} ÷ ${wb.s} = $${(ub / 100).toFixed(2)} per pound. The difference is $${(Math.abs(ua - ub) / 100).toFixed(2)}. The usual slip is multiplying by the fraction of a pound instead of dividing by it.` };
      }) },
    ],
  },

  // ── 6 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'g7-percent-applications',
    skillId: 'g7-percent-applications',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const P = int(r, 2, 10) * 20, t = pick(r, [5, 6, 7, 8]);
          return { prompt: `A pair of shoes costs $${P} before tax. The sales tax is ${t}%. What is the total cost, in dollars, including tax?`,
            value: money(P * 100 + P * t),
            explanation: `Tax = ${t / 100} × ${P} = ${usd(P * t)}. Total = ${P} + ${money(P * t)} = ${usd(P * 100 + P * t)}. The usual slip is giving only the tax and not adding it to the price.` };
        }
        if (k === 1) {
          const M = int(r, 5, 17) * 5, t = pick(r, [15, 18, 20]);
          return { prompt: `A restaurant meal costs $${M}. How much is ${an(t)} ${t}% tip, in dollars?`,
            value: money(M * t),
            explanation: `Tip = ${t / 100} × ${M} = ${usd(M * t)}. The usual slip is moving the decimal point the wrong way when changing ${t}% to ${t / 100}.` };
        }
        if (k === 2) {
          const P = int(r, 3, 12) * 10, d = pick(r, [15, 20, 25, 30, 35, 40]);
          return { prompt: `A jacket with a regular price of $${P} is on sale for ${d}% off. What is the sale price, in dollars?`,
            value: money(P * (100 - d)),
            explanation: `Discount = ${d / 100} × ${P} = ${usd(P * d)}. Sale price = ${P} − ${money(P * d)} = ${usd(P * (100 - d))} (or ${(100 - d) / 100} × ${P}). The usual slip is giving the discount instead of the sale price.` };
        }
        const P = int(r, 2, 12) * 100, rate = pick(r, [2, 3, 4, 5, 6]), t = int(r, 2, 5);
        return { prompt: `Ava deposits $${P} in an account that pays ${rate}% simple interest per year. How much interest, in dollars, does she earn in ${t} years?`,
          value: P * rate * t / 100,
          explanation: `Simple interest I = prt = ${P} × ${rate / 100} × ${t} = $${P * rate * t / 100}. The usual slip is forgetting to multiply by the ${t} years.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const P = int(r, 2, 9) * 20, d = pick(r, [10, 20, 25, 30, 40]), t = pick(r, [5, 6, 8, 10]);
          const sale = P * (100 - d); const fin = sale * (100 + t) / 100;
          if (!Number.isInteger(fin)) return null;
          return { prompt: `A coat with a regular price of $${P} is on sale for ${d}% off. Then ${t}% sales tax is added to the sale price. What is the final cost, in dollars?`,
            value: money(fin),
            explanation: `Sale price = ${(100 - d) / 100} × ${P} = ${usd(sale)}. With tax: ${(100 + t) / 100} × ${money(sale)} = ${usd(fin)}. The usual slip is subtracting the percents (${d}% − ${t}%) and taking a single discount.` };
        }
        if (k === 1) {
          const C = int(r, 4, 16) * 5, m = pick(r, [30, 40, 60, 75, 120, 150]);
          const sell = C * (100 + m);
          return { prompt: `A store buys a lamp for $${C} and marks the price up by ${m}%. What is the selling price, in dollars?`,
            value: money(sell),
            explanation: `Markup = ${m / 100} × ${C} = ${usd(C * m)}. Selling price = ${C} + ${money(C * m)} = ${usd(sell)}. The usual slip is giving only the markup, not the cost plus the markup.` };
        }
        if (k === 2) {
          const S = int(r, 8, 30) * 100, c = pick(r, [3, 4, 6, 7, 8, 12]);
          return { prompt: `A salesperson earned a commission of $${S * c / 100} on sales of $${S}. What percent of sales is the commission rate?`,
            value: c,
            explanation: `Rate = commission ÷ sales = ${S * c / 100} ÷ ${S} = ${c / 100} = ${c}%. The usual slip is dividing the sales by the commission.` };
        }
        const N = pick(r, [20, 25, 50]), a = int(r, 3, N / 2 - 1), b = int(r, 3, N / 2 - 2);
        const rest = N - a - b;
        if (rest === a || rest === b) return null;
        return { prompt: `Of the ${N} students in a class, ${a} walk to school, ${b} ride the bus, and the rest come by car. What percent of the students come by car?`,
          value: rest * 100 / N,
          explanation: `Students by car: ${N} − ${a} − ${b} = ${rest}. Percent = ${rest}/${N} = ${rest * 100 / N}%. The usual slip is finding the percent who walk or ride the bus instead of first finding "the rest".` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const M = int(r, 3, 12) * 10, t = pick(r, [6, 7, 8, 9]), tip = pick(r, [15, 18, 20]);
          return { prompt: `A meal costs $${M} before tax. Sales tax is ${t}%, and Jo leaves ${an(tip)} ${tip}% tip on the before-tax price. What is the total Jo pays, in dollars?`,
            value: money(M * (100 + t + tip)),
            explanation: `Tax = ${usd(M * t)} and tip = ${usd(M * tip)}, both taken on $${M}. Total = ${M} + ${money(M * t)} + ${money(M * tip)} = ${usd(M * (100 + t + tip))}. The usual slip is leaving out one of the three parts.` };
        }
        if (k === 1) {
          const P = int(r, 4, 20) * 20, d = pick(r, [15, 20, 25, 30, 35, 40]);
          const S = P * (100 - d) / 100;
          return { prompt: `After ${an(d)} ${d}% discount, a bike costs $${S}. What was the original price, in dollars?`,
            value: P,
            explanation: `The sale price is ${100 - d}% of the original: ${(100 - d) / 100} × p = ${S}, so p = ${S} ÷ ${(100 - d) / 100} = $${P}. The usual slip is adding ${d}% of $${S} to $${S}, which gives $${money(S * (100 + d))} — the percent must be taken of the ORIGINAL price.` };
        }
        if (k === 2) {
          const P = int(r, 3, 12) * 20, d = pick(r, [10, 20, 25, 30, 40]), t = pick(r, [5, 6, 8]);
          const keep = (100 - d) / 100, up = (100 + t) / 100;
          const fin = P * (100 - d) * (100 + t) / 100;
          return mc(`A $${P} coat is on sale for ${d}% off, and then ${t}% sales tax is added to the sale price. Which expression gives the final price, in dollars?`,
            `${P}(${keep})(${up})`,
            [`${P}(${(100 - d + t) / 100})`, `${P}(${d / 100})(${up})`, `${P}(${keep}) + ${t / 100}`], int(r, 0, 3),
            `Paying ${100 - d}% of the price is × ${keep}; adding ${t}% tax to that is × ${up}. So the final price is ${P}(${keep})(${up}) = $${(fin / 100).toFixed(2)}. The usual slip is combining the percents into one (${100 - d + t}%), but the tax is taken on the sale price, not the original.`);
        }
        const B = int(r, 20, 45) * 10, c = pick(r, [4, 5, 6, 8]), S = int(r, 15, 60) * 100;
        const E = B + S * c / 100;
        return { prompt: `Kai earns $${B} per week plus ${an(c)} ${c}% commission on sales. Last week Kai earned $${E} in all. What were Kai's sales last week, in dollars?`,
          value: S,
          explanation: `Commission = ${E} − ${B} = $${E - B}. That is ${c}% of sales, so sales = ${E - B} ÷ ${c / 100} = $${S}. The usual slip is dividing the whole $${E} by ${c / 100} without first subtracting the weekly $${B}.` };
      }) },
    ],
  },

  // ── 7 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'g7-identify-proportional',
    skillId: 'g7-identify-proportional',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const k = int(r, 2, 6), b = int(r, 1, 5);
        const xs = pick(r, [[1, 2, 3, 4], [2, 4, 6, 8], [1, 3, 5, 7], [2, 3, 4, 5]]);
        if (idx % 4 === 0) {
          const c = int(r, 2, 6);
          return mc('Which table represents a proportional relationship between x and y?', tbl(xs, xs.map((x) => k * x)),
            [tbl(xs, xs.map((x) => k * x + b)), tbl(xs, xs.map((x) => x + c)), tbl(xs, xs.map((x) => x * x + 1))], int(r, 0, 3),
            `In a proportional relationship y ÷ x is the same for every pair. Only in ${tbl(xs, xs.map((x) => k * x))} is every y exactly ${k} times its x. The usual slip is choosing a table where y goes up by a constant amount but y ÷ x changes.`);
        }
        if (idx % 4 === 1) {
          return mc('Which equation represents a proportional relationship between x and y?', `y = ${k}x`,
            [`y = ${k}x + ${b}`, `y = x + ${k}`, `y = ${k}x − ${b}`], int(r, 0, 3),
            `A proportional relationship has the form y = kx: y is a constant multiple of x, with nothing added or subtracted, so (0, 0) fits. Only y = ${k}x has that form. The usual slip is accepting any straight-line equation such as y = ${k}x + ${b}.`);
        }
        if (idx % 4 === 2) {
          const bad = xs.map((x) => k * x + b);
          return mc('Which table does NOT represent a proportional relationship between x and y?', tbl(xs, bad),
            [tbl(xs, xs.map((x) => k * x)), tbl(xs, xs.map((x) => (k + 1) * x)), tbl(xs, xs.map((x) => (k + 3) * x))], int(r, 0, 3),
            `In ${tbl(xs, bad)} the ratios differ: ${bad[0]} ÷ ${xs[0]} = ${+(bad[0] / xs[0]).toFixed(2)} but ${bad[1]} ÷ ${xs[1]} = ${+(bad[1] / xs[1]).toFixed(2)}. In each of the other tables y ÷ x is the same for every pair. The usual slip is checking only that y goes up steadily.`);
        }
        return mc('Which equation does NOT represent a proportional relationship between x and y?', `y = ${k}x + ${b}`,
          [`y = ${k}x`, `y = ${k + 3}x`, 'y = 0.5x'], int(r, 0, 3),
          `y = ${k}x + ${b} adds ${b}, so when x = 0, y = ${b} instead of 0, and y ÷ x is not constant. The other three have the form y = kx. The usual slip is thinking a decimal multiplier such as 0.5 stops a relationship being proportional.`);
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const m = int(r, 2, 5), b = int(r, 1, 6), x0 = int(r, 1, 3);
          const xs = [x0, x0 + 1, x0 + 2, x0 + 3], ys = xs.map((x) => m * x + b);
          return mc(`Is the relationship in this table proportional? ${tbl(xs, ys)}`,
            'No, because y ÷ x is not the same for every pair',
            [`Yes, because y goes up by ${m} each time x goes up by 1`, 'Yes, because every y is greater than its x', 'No, because the x-values do not start at 0'], int(r, 0, 3),
            `Check the ratios: ${ys[0]} ÷ ${xs[0]} = ${+(ys[0] / xs[0]).toFixed(2)} but ${ys[1]} ÷ ${xs[1]} = ${+(ys[1] / xs[1]).toFixed(2)}. They differ, so it is not proportional. The usual slip is thinking a constant increase in y is enough — the ratio y ÷ x must be constant.`);
        }
        if (k === 2) {
          const kk = pick(r, [1.5, 2.5, 3.5, 4.5]);
          const xs = pick(r, [[2, 4, 10, 12], [2, 6, 8, 14], [4, 6, 10, 16]]), ys = xs.map((x) => kk * x);
          return mc(`Is the relationship in this table proportional? ${tbl(xs, ys)}`,
            `Yes, because y ÷ x equals ${kk} for every pair`,
            ['No, because y does not go up by the same amount each time', 'No, because the y-values are not multiples of the x-values', `Yes, because y is always ${ys[0] - xs[0]} more than x`], int(r, 0, 3),
            `Every ratio is the same: ${ys[0]} ÷ ${xs[0]} = ${kk}, ${ys[1]} ÷ ${xs[1]} = ${kk}, ${ys[2]} ÷ ${xs[2]} = ${kk}, ${ys[3]} ÷ ${xs[3]} = ${kk}. So y = ${kk}x. The usual slip is looking at how much y increases; the x-values are not evenly spaced, so that tells you nothing.`);
        }
        if (k === 1) {
          const kk = int(r, 3, 9), xs = pick(r, [[3, 5, 8], [2, 7, 9], [4, 6, 11], [5, 8, 12]]);
          return { prompt: `What value of y makes this table a proportional relationship? x: ${xs.join(', ')}; y: ${kk * xs[0]}, ${kk * xs[1]}, ?`,
            value: kk * xs[2],
            explanation: `The ratio y ÷ x must be constant: ${kk * xs[0]} ÷ ${xs[0]} = ${kk} and ${kk * xs[1]} ÷ ${xs[1]} = ${kk}. So y = ${kk} × ${xs[2]} = ${kk * xs[2]}. The usual slip is continuing an adding pattern in the y-values instead of using the ratio.` };
        }
        return describeItem(r, PROP_EASY, NONPROP_EASY, 'Which of these describes a proportional relationship between the two quantities?');
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const [n, d] = pick(r, [[2, 3], [3, 2], [3, 4], [5, 2], [4, 3], [5, 4]]);  // y = (n/d) x
          const ms = shuffle(r, [2, 3, 4, 5, 6, 7]).slice(0, 3).sort((a, b) => a - b);
          const xs = ms.map((m) => m * d), ys = ms.map((m) => m * n);
          return { prompt: `What value of x makes this table a proportional relationship? x: ${xs[0]}, ${xs[1]}, ?; y: ${ys[0]}, ${ys[1]}, ${ys[2]}`,
            value: xs[2],
            explanation: `The ratio y ÷ x is ${ys[0]}/${xs[0]} = ${n}/${d} for every pair. So x = ${ys[2]} ÷ (${n}/${d}) = ${ys[2]} × ${d}/${n} = ${xs[2]}. The usual slip is extending an adding pattern, or multiplying by ${n}/${d} when you need to divide.` };
        }
        if (k === 1) {
          const m = int(r, 2, 6), b = int(r, 2, 7);
          const xs = [1, 2, 3, 4], ys = xs.map((x) => m * x + b);
          const name = pick(r, ['Sam', 'Lina', 'Cole', 'Priya']);
          return mc(`${name} looks at this table — ${tbl(xs, ys)} — and says the relationship is proportional because y goes up by ${m} each time x goes up by 1. Which statement is true?`,
            `${name} is wrong: the ratios y ÷ x are not equal (${ys[0]} ÷ 1 = ${ys[0]}, but ${ys[1]} ÷ 2 = ${ys[1] / 2})`,
            [`${name} is right: a constant increase in y always means a proportional relationship`,
              `${name} is right: the constant of proportionality is ${m}`,
              `${name} is wrong: in a proportional relationship y must go up by 1 each time`], int(r, 0, 3),
            `A constant increase makes the relationship linear (y = ${m}x + ${b}), but proportional also needs y ÷ x to be constant, and ${ys[0]} ÷ 1 ≠ ${ys[1]} ÷ 2. The extra ${b} is what breaks it: when x = 0, y would be ${b}, not 0.`);
        }
        if (k === 2) {
          const a = int(r, 2, 9), b = int(r, 1, 6);
          return mc('In which of these equations is y proportional to x?', `y = x/${a}`,
            [`y = ${a}/x`, `y = x + ${a}`, `y = ${a}x − ${b}`], int(r, 0, 3),
            `y = x/${a} is the same as y = (1/${a})x, which has the form y = kx with k = 1/${a}. In y = ${a}/x the ratio y ÷ x changes, and the other two add or subtract a constant. The usual slip is rejecting y = x/${a} because it shows division.`);
        }
        return describeItem(r, PROP_HARD, NONPROP_HARD, 'In which of these pairs is the first quantity proportional to the second?');
      }) },
    ],
  },

  // ── 8 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'g7-constant-of-proportionality',
    skillId: 'g7-constant-of-proportionality',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const kk = int(r, 3, 9), xs = pick(r, [[2, 4, 6], [3, 5, 7], [2, 5, 8], [4, 6, 9]]);
          return { prompt: `In this table, y is proportional to x. ${tbl(xs, xs.map((x) => kk * x))}. What is the constant of proportionality k in y = kx?`,
            value: kk,
            explanation: `k = y ÷ x for any pair: ${kk * xs[0]} ÷ ${xs[0]} = ${kk} (and ${kk * xs[1]} ÷ ${xs[1]} = ${kk}). The usual slip is using the difference between y-values instead of the ratio y ÷ x.` };
        }
        if (k === 1) {
          const n = pick(r, [4, 6, 8, 12]), u = pick(r, [750, 1250, 450, 650, 1150]);
          return { prompt: `The total cost is proportional to the number of tickets. ${n} tickets cost $${n * u / 100}. What is the constant of proportionality, in dollars per ticket? ${DEC_FORM}`,
            value: money(u),
            explanation: `k = total cost ÷ number of tickets = ${n * u / 100} ÷ ${n} = ${(u / 100).toFixed(2)}. The usual slip is dividing the tickets by the cost.` };
        }
        if (k === 2) {
          const kk = int(r, 3, 12), x = int(r, 3, 9);
          return { prompt: `The graph of a proportional relationship is a straight line through (0, 0) and (${x}, ${kk * x}). What is the constant of proportionality k in y = kx?`,
            value: kk,
            explanation: `k = y ÷ x = ${kk * x} ÷ ${x} = ${kk}. The usual slip is dividing x by y, which gives 1/${kk}.` };
        }
        const kk = pick(r, [1.5, 2.5, 3.5, 4.5]), xs = pick(r, [[2, 4, 10], [4, 6, 8], [2, 6, 12]]);
        return { prompt: `In this table, y is proportional to x. ${tbl(xs, xs.map((x) => kk * x))}. What is the constant of proportionality k in y = kx? ${DEC_FORM}`,
          value: String(kk),
          explanation: `k = y ÷ x for any pair: ${kk * xs[0]} ÷ ${xs[0]} = ${kk}. Check with another pair: ${kk * xs[2]} ÷ ${xs[2]} = ${kk}. The usual slip is using how much y increases from one column to the next.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const a = pick(r, [2, 4, 5, 8]), b = int(r, 3, 30);
          const q = rat(b, a);
          if (q.d === 1) return null;
          return { prompt: `A proportional relationship is given by ${a}y = ${b}x. What is the constant of proportionality k when the equation is written as y = kx? ${DEC_FORM}`,
            value: decStr(q),
            explanation: `Divide both sides by ${a}: y = (${b}/${a})x = ${decStr(q)}x, so k = ${decStr(q)}. The usual slips are answering ${b} without dividing, or dividing ${a} by ${b}.` };
        }
        if (k === 1) {
          const [n, d] = proper(r, [3, 4, 5, 6, 7]); const m = int(r, 2, 4);
          return { prompt: `The graph of a proportional relationship passes through (0, 0) and (${d * m}, ${n * m}). What is the constant of proportionality k in y = kx? ${FRAC_FORM}`,
            value: K.frac(n, d),
            explanation: `k = y ÷ x = ${n * m}/${d * m} = ${K.frac(n, d)}. The usual slip is dividing x by y, which gives ${K.frac(d, n)}.` };
        }
        if (k === 2) {
          const [f, s] = pick(r, [[6, 4], [9, 6], [10, 4], [15, 6], [7, 2], [9, 2], [14, 4]]);
          return { prompt: `A recipe uses ${f} cups of flour for every ${s} cups of sugar. The relationship is written as f = ks, where f is cups of flour and s is cups of sugar. What is k? ${DEC_FORM}`,
            value: decStr(rat(f, s)),
            explanation: `From f = ks, k = f ÷ s = ${f} ÷ ${s} = ${decStr(rat(f, s))}. The usual slip is computing s ÷ f = ${K.frac(s, f)}, which is the constant for s = kf instead.` };
        }
        const kk = int(r, 3, 8), xs = pick(r, [[0.5, 2, 3.5], [1.5, 2, 4.5], [0.5, 1.5, 4], [2.5, 3, 5.5]]);
        return { prompt: `In this table, y is proportional to x. ${tbl(xs, xs.map((x) => kk * x))}. What is the constant of proportionality k in y = kx?`,
          value: kk,
          explanation: `k = y ÷ x for any pair: ${kk * xs[1]} ÷ ${xs[1]} = ${kk}, and ${kk * xs[0]} ÷ ${xs[0]} = ${kk}. The usual slip is subtracting x from y instead of dividing.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const [n, d] = pick(r, [[3, 7], [5, 8], [3, 8], [5, 6], [2, 7], [7, 8]]);
          const xq = [fr(1, 2), fr(3, 2), fr(2, 1), fr(3, 4), fr(5, 2)];
          const xs = shuffle(r, xq).slice(0, 3).sort((a, b) => a.n / a.d - b.n / b.d);
          const ys = xs.map((x) => { const y = mul(x, rat(n, d)); return fr(y.n, y.d); });
          return { prompt: `In this table, y is proportional to x. x: ${xs.map((x) => x.s).join(', ')}; y: ${ys.map((y) => y.s).join(', ')}. What is the constant of proportionality k in y = kx? ${FRAC_FORM}`,
            value: K.frac(n, d),
            explanation: `k = y ÷ x for any pair: ${ys[0].s} ÷ ${xs[0].s} = ${ys[0].s} × ${xs[0].d}/${xs[0].n} = ${K.frac(n, d)}. The usual slip is multiplying the two fractions instead of dividing y by x.` };
        }
        if (k === 1) {
          const [n1, d1] = proper(r, [2, 3, 4]); const [n2, d2] = proper(r, [2, 4]);
          const s = fr(n1, d1), f = mx(int(r, 1, 3) * d2 + n2, d2); const ans = div(s, f);
          if (ans.d === 1) return null;
          return { prompt: `A recipe uses ${s.s} cup of sugar for every ${f.s} cups of flour. The relationship is written as s = kf, where s is cups of sugar and f is cups of flour. What is k? ${FRAC_FORM}`,
            value: fracStr(ans),
            explanation: `From s = kf, k = s ÷ f = ${s.s} ÷ ${f.s} = ${s.s} ÷ ${impS(f)} = ${s.s} × ${f.d}/${f.n} = ${fracStr(ans)}. The usual slip is dividing flour by sugar, which gives ${fracStr(div(f, s))}.` };
        }
        if (k === 2) {
          const [n1, d1] = proper(r, [3, 4, 5, 6]); const [n2, d2] = proper(r, [4, 6, 8, 9]);
          const x = fr(n1, d1), y = fr(n2, d2); const ans = div(y, x);
          if (ans.d === 1) return null;
          return { prompt: `y is proportional to x. When x = ${x.s}, y = ${y.s}. What is the constant of proportionality k in y = kx? ${FRAC_FORM}`,
            value: fracStr(ans),
            explanation: `k = y ÷ x = ${y.s} ÷ ${x.s} = ${y.s} × ${x.d}/${x.n} = ${fracStr(ans)}. The usual slip is multiplying ${y.s} by ${x.s}, or dividing x by y.` };
        }
        const [n, d] = pick(r, [[3, 2], [5, 2], [4, 3], [5, 3], [7, 4], [5, 4]]);   // y = (n/d)x
        const ms = shuffle(r, [2, 3, 4, 5, 6, 7]).slice(0, 3).sort((a, b) => a - b);
        const xs = ms.map((m) => m * d), ys = ms.map((m) => m * n);
        return { prompt: `In this table, y is proportional to x. ${tbl(xs, ys)}. The same relationship can be written as x = ky. What is k in x = ky? ${FRAC_FORM}`,
          value: K.frac(d, n),
          explanation: `For x = ky, k = x ÷ y = ${xs[0]}/${ys[0]} = ${K.frac(d, n)}. The usual slip is giving y ÷ x = ${K.frac(n, d)}, which is the constant for y = kx, not x = ky.` };
      }) },
    ],
  },

  // ── 9 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'g7-proportional-equations',
    skillId: 'g7-proportional-equations',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k % 2 === 0) {
          const c = EQ_CTX[(idx / 2 + int(r, 0, 1) * 2) % 4];
          const kk = pick(r, [6, 7, 8, 9, 12, 14, 15, 18]);
          return mc(`${c.txt(kk)} Which equation gives ${c.ask}?`, `${c.Y} = ${kk}${c.X}`,
            [`${c.X} = ${kk}${c.Y}`, `${c.Y} = ${c.X} + ${kk}`, `${c.Y} = ${c.X}/${kk}`], int(r, 0, 3),
            `Each unit of ${c.X} contributes ${kk}, so ${c.Y} is ${kk} times ${c.X}: ${c.Y} = ${kk}${c.X}. Test it: when ${c.X} = 2, ${c.Y} = ${2 * kk}. The usual slips are swapping the two variables or adding ${kk} instead of multiplying.`);
        }
        if (k === 1) {
          const kk = pick(r, [2.5, 3.5, 4.5, 1.5]), p = int(r, 2, 9) * 2;
          return { prompt: `The cost c, in dollars, of p pounds of almonds is given by c = ${kk}p. How many pounds of almonds can be bought for $${kk * p}?`,
            value: p,
            explanation: `Substitute c = ${kk * p}: ${kk * p} = ${kk}p, so p = ${kk * p} ÷ ${kk} = ${p}. The usual slip is multiplying ${kk * p} by ${kk} instead of dividing.` };
        }
        const kk = pick(r, [7.5, 6.5, 12.5, 8.5]), h = pick(r, [4, 6, 8, 12, 14]);
        return { prompt: `The amount e, in dollars, that Dana earns in h hours is given by e = ${kk}h. How much does Dana earn, in dollars, in ${h} hours?`,
          value: kk * h,
          explanation: `Substitute h = ${h}: e = ${kk} × ${h} = ${kk * h}. The usual slip is dividing ${h} by ${kk} instead of multiplying.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const g = int(r, 3, 6), mpg = int(r, 22, 36);
          return mc(`A car travels ${g * mpg} miles on ${g} gallons of gas at a constant rate. Which equation relates the miles travelled, m, to the gallons used, g?`,
            `m = ${mpg}g`, [`g = ${mpg}m`, `m = ${g * mpg}g`, `m = g + ${g * mpg - g}`], int(r, 0, 3),
            `The constant of proportionality is miles ÷ gallons = ${g * mpg} ÷ ${g} = ${mpg}, so m = ${mpg}g. The usual slips are using the total ${g * mpg} as the rate, or swapping m and g.`);
        }
        if (k === 1) {
          const kk = pick(r, [1.5, 2.5, 3.5, 4.5]), x1 = pick(r, [2, 4, 6]), x2 = pick(r, [8, 10, 12, 14]);
          return { prompt: `y is proportional to x, and y = ${kk * x1} when x = ${x1}. What is y when x = ${x2}?`,
            value: kk * x2,
            explanation: `k = y ÷ x = ${kk * x1} ÷ ${x1} = ${kk}, so y = ${kk}x. When x = ${x2}, y = ${kk} × ${x2} = ${kk * x2}. The usual slip is adding the same amount to x and y instead of keeping the ratio.` };
        }
        if (k === 2) {
          const kk = pick(r, [1.5, 2.5, 3.5]), xs = pick(r, [[2, 4, 6], [4, 6, 10], [2, 6, 8]]), ys = xs.map((x) => kk * x);
          return mc(`Which equation represents the proportional relationship in this table? ${tbl(xs, ys)}`,
            `y = ${kk}x`, [`y = x + ${ys[0] - xs[0]}`, `y = ${ys[0]}x`, `x = ${kk}y`], int(r, 0, 3),
            `k = y ÷ x = ${ys[0]} ÷ ${xs[0]} = ${kk}, and the other pairs agree (${ys[1]} ÷ ${xs[1]} = ${kk}), so y = ${kk}x. The usual slip is y = x + ${ys[0] - xs[0]}, which fits only the first pair.`);
        }
        const n1 = pick(r, [4, 6, 8]), u = pick(r, [250, 350, 150, 450]), n2 = pick(r, [10, 14, 18, 22]);
        return { prompt: `${n1} notebooks cost $${n1 * u / 100}. The total cost is proportional to the number of notebooks. How much, in dollars, do ${n2} notebooks cost?`,
          value: n2 * u / 100,
          explanation: `Cost per notebook: ${n1 * u / 100} ÷ ${n1} = $${(u / 100).toFixed(2)}, so c = ${u / 100}n. For ${n2} notebooks: ${u / 100} × ${n2} = $${n2 * u / 100}. The usual slip is adding the extra ${n2 - n1} notebooks as $${n2 - n1} instead of scaling by the unit price.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const [n, d] = proper(r, [3, 4, 5]); const m = int(r, 2, 5);
          const B = n * m, T = d * m;
          return mc(`A machine fills ${B} bottles every ${T} seconds at a constant rate. Which equation gives the number of bottles b filled after t seconds?`,
            `b = (${n}/${d})t`, [`b = (${d}/${n})t`, `b = ${B}t`, `b = ${T}t`], int(r, 0, 3),
            `k = bottles ÷ seconds = ${B}/${T} = ${n}/${d}, so b = (${n}/${d})t. Check: t = ${T} gives b = ${B}. The usual slips are inverting the ratio (${d}/${n}) or using ${B} as the rate per second.`);
        }
        if (k === 1) {
          const [n, d] = pick(r, [[3, 2], [5, 2], [4, 3], [5, 4], [7, 4]]);
          const m1 = int(r, 2, 4), m2 = m1 + int(r, 2, 5);
          return { prompt: `y is proportional to x, and y = ${n * m1} when x = ${d * m1}. What is x when y = ${n * m2}?`,
            value: d * m2,
            explanation: `k = ${n * m1}/${d * m1} = ${n}/${d}, so y = (${n}/${d})x. Solve ${n * m2} = (${n}/${d})x: x = ${n * m2} × ${d}/${n} = ${d * m2}. The usual slip is multiplying ${n * m2} by ${n}/${d}, which finds y for a given x instead.` };
        }
        if (k === 2) {
          const u = pick(r, [850, 950, 1250, 1050, 750]), h1 = pick(r, [4, 6, 8]), h2 = pick(r, [11, 13, 15, 17]);
          return { prompt: `Mina earns $${money(u * h1)} for ${h1} hours of work. Her pay is proportional to the hours she works. How many hours must she work to earn $${(u * h2 / 100).toFixed(2)}?`,
            value: h2,
            explanation: `Pay per hour: ${money(u * h1)} ÷ ${h1} = $${(u / 100).toFixed(2)}, so p = ${u / 100}h. Solve ${(u * h2 / 100).toFixed(2)} = ${u / 100}h: h = ${h2}. The usual slip is dividing by the total $${money(u * h1)} instead of the hourly rate.` };
        }
        const per = pick(r, [8, 12, 16]); const fl = mx(...pick(r, [[5, 2], [3, 2], [7, 2], [5, 4], [7, 4]]));
        const c1 = per * fl.n / fl.d, c2 = per * pick(r, [9, 11, 13, 15]) / 2;
        if (!Number.isInteger(c1) || c2 <= c1 || !Number.isInteger(c2 / per * 2) || Number.isInteger(c2 / per)) return null;
        return { prompt: `A recipe uses ${cups(fl)} of flour to make ${c1} cookies. The number of cookies is proportional to the cups of flour. How many cups of flour are needed to make ${c2} cookies? ${DEC_FORM}`,
          value: decStr(rat(c2, per)),
          explanation: `Cookies per cup: ${c1} ÷ ${fl.s} = ${per}, so c = ${per}f. Solve ${c2} = ${per}f: f = ${c2} ÷ ${per} = ${c2 / per}. The usual slip is dividing in the wrong order when finding the unit rate (${fl.s} ÷ ${c1}).` };
      }) },
    ],
  },

  // ── 10 ───────────────────────────────────────────────────────────────────
  {
    courseSkill: 'g7-graph-proportional',
    skillId: 'g7-graph-proportional',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const k = idx % 4;
        const c = pick(r, GRAPH_CTX);
        if (k === 0) {
          const kk = int(r, 3, 12), x = int(r, 3, 8);
          return { prompt: `The graph of a proportional relationship is a straight line through (0, 0) and (${x}, ${kk * x}). What is the unit rate, the amount y changes for each 1 unit of x?`,
            value: kk,
            explanation: `Unit rate = y ÷ x = ${kk * x} ÷ ${x} = ${kk}; the line passes through (1, ${kk}). The usual slip is dividing x by y.` };
        }
        if (k === 1) {
          const kk = pick(r, [2.5, 3.5, 4.5, 6.5, 7.5, 12.5]);
          return mc(`A graph of a proportional relationship shows ${c.what}. The graph passes through the point (1, ${kk}). What does this point mean?`,
            c.unit(kk), [c.swap(kk), c.same(kk), c.start(kk)], int(r, 0, 3),
            `The point (1, ${kk}) says that when x = 1, y = ${kk}: ${c.unit(kk).toLowerCase()}. On the graph of a proportional relationship, the point (1, r) always gives the unit rate r. The usual slip is reading the coordinates in the wrong order.`);
        }
        if (k === 2) {
          const x = pick(r, [2, 4, 6, 8]), kk = pick(r, [1.5, 2.5, 3.5, 4.5]);
          return { prompt: `The graph of a proportional relationship is a straight line through (0, 0) and (${x}, ${kk * x}). What is the value of y at the point where x = 1? ${DEC_FORM}`,
            value: String(kk),
            explanation: `At x = 1 the y-value is the unit rate: ${kk * x} ÷ ${x} = ${kk}, so the point is (1, ${kk}). The usual slip is subtracting (${kk * x} − ${x}) instead of dividing.` };
        }
        return mc(`A graph of a proportional relationship shows ${c.what}. What does the point (0, 0) on the graph mean?`,
          c.zero, c.zeroW, int(r, 0, 3),
          `The point (0, 0) says that when x = 0, y = 0: ${c.zero.toLowerCase()}. Every proportional relationship passes through (0, 0). The usual slip is reading (0, 0) as a rate of zero.`);
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const kk = int(r, 2, 6), x1 = int(r, 2, 4), x2 = x1 + int(r, 2, 4);
          return mc(`The graph of a proportional relationship passes through (0, 0) and (${x1}, ${kk * x1}). Which of these points also lies on the graph?`,
            `(${x2}, ${kk * x2})`, [`(${x2}, ${kk * x1 + (x2 - x1)})`, `(${kk * x2}, ${x2})`, `(${x2}, ${x2 * x1})`], int(r, 0, 3),
            `The unit rate is ${kk * x1} ÷ ${x1} = ${kk}, so every point has y = ${kk}x. Only (${x2}, ${kk * x2}) fits: ${kk} × ${x2} = ${kk * x2}. The usual slips are adding the same number to both coordinates, or swapping x and y.`);
        }
        if (k === 1) {
          const kk = pick(r, [1.5, 2.5, 3.5]), x1 = pick(r, [4, 6, 8]), x2 = pick(r, [10, 12, 14]);
          return { prompt: `The graph of a proportional relationship passes through (0, 0) and (${x1}, ${kk * x1}). What is y when x = ${x2}?`,
            value: kk * x2,
            explanation: `Unit rate = ${kk * x1} ÷ ${x1} = ${kk}, so y = ${kk}x. When x = ${x2}, y = ${kk} × ${x2} = ${kk * x2}. The usual slip is adding ${x2 - x1} to ${kk * x1} because x went up by ${x2 - x1}.` };
        }
        if (k === 2) {
          const c = pick(r, GRAPH_CTX), x = pick(r, [4, 6, 8]), kk = pick(r, [7.5, 8.5, 9.5, 12.5, 10.5]);
          const y = kk * x;
          return mc(`A graph of a proportional relationship shows ${c.what}. The graph passes through the point (${x}, ${y}). Which statement is true?`,
            `${c.pt(x, y)}, so ${c.rate(kk)}`,
            [`${c.pt(y, x)}, so ${c.rate(kk)}`, `${c.pt(x, y)}, so ${c.rate(y)}`, `${c.pt(x, y)}, so ${c.rate(x * y)}`], int(r, 0, 3),
            `The point (${x}, ${y}) pairs x = ${x} with y = ${y}. The unit rate is y ÷ x = ${y} ÷ ${x} = ${kk}. The usual slips are swapping the coordinates, or reading ${y} itself as the unit rate.`);
        }
        const kk = pick(r, [1.5, 2.5, 3.5]), x1 = pick(r, [2, 4, 6]), x2 = pick(r, [8, 12, 16, 18]);
        return { prompt: `The graph of a proportional relationship passes through (0, 0) and (${x1}, ${kk * x1}). For what value of x is y = ${kk * x2}?`,
          value: x2,
          explanation: `Unit rate = ${kk * x1} ÷ ${x1} = ${kk}, so y = ${kk}x. Solve ${kk * x2} = ${kk}x: x = ${kk * x2} ÷ ${kk} = ${x2}. The usual slip is multiplying ${kk * x2} by ${kk} instead of dividing.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const [n, d] = proper(r, [3, 4, 5, 6, 8]); const m = int(r, 2, 4);
          return { prompt: `The graph of a proportional relationship passes through (0, 0) and (${d * m}, ${n * m}). What is the unit rate (the value of y when x = 1)? ${FRAC_FORM}`,
            value: K.frac(n, d),
            explanation: `Unit rate = y ÷ x = ${n * m}/${d * m} = ${K.frac(n, d)}; the graph passes through (1, ${K.frac(n, d)}). The usual slip is dividing x by y, giving ${K.frac(d, n)}.` };
        }
        if (k === 1) {
          const xa = pick(r, [4, 8]), xb = pick(r, [5, 6, 10]);
          const ka4 = int(r, 5, 15), kb2 = int(r, 3, 9);   // kA = ka4/4, kB = kb2/2
          const diff = rat(Math.abs(ka4 - 2 * kb2), 4);
          if (diff.n === 0 || diff.d === 1 || ka4 % 4 === 0 || kb2 % 2 === 0) return null;
          return { prompt: `Line A is the graph of a proportional relationship through (0, 0) and (${xa}, ${ka4 * xa / 4}). Line B is the graph of a proportional relationship through (0, 0) and (${xb}, ${kb2 * xb / 2}). How much greater is the unit rate of the steeper line than the unit rate of the other line? ${DEC_FORM}`,
            value: decStr(diff),
            explanation: `Line A: ${ka4 * xa / 4} ÷ ${xa} = ${ka4 / 4}. Line B: ${kb2 * xb / 2} ÷ ${xb} = ${kb2 / 2}. The difference is ${decStr(diff)}. The usual slip is comparing the y-values of the two points without dividing by x.` };
        }
        if (k === 2) {
          const a = pick(r, [4, 5]), b = a + int(r, 1, 6);
          if (b % a === 0) return null;
          const kk = b / a;
          return mc(`The graph of a proportional relationship passes through (0, 0) and (${a}, ${b}). Which statement is true?`,
            `The point (1, ${kk}) is on the graph, so the unit rate is ${kk}`,
            [`The point (1, ${K.frac(a, b)}) is on the graph, so the unit rate is ${K.frac(a, b)}`,
              `The point (0, ${kk}) is on the graph, so the unit rate is ${kk}`,
              `The point (${b}, ${a}) is on the graph, so the unit rate is ${kk}`], int(r, 0, 3),
            `Unit rate = y ÷ x = ${b} ÷ ${a} = ${kk}, and the point (1, r) on the graph shows the unit rate r, so (1, ${kk}) is on the line. (0, ${kk}) is not: the line passes through (0, 0). The usual slip is dividing x by y.`);
        }
        const kk = pick(r, [1.5, 2.5]), x1 = pick(r, [2, 4, 6]), x2 = x1 + pick(r, [4, 6, 8]);
        return mc(`The graph of a proportional relationship passes through (0, 0) and (${x1}, ${kk * x1}). Which of these points also lies on the graph?`,
          `(${x2}, ${kk * x2})`, [`(${x2}, ${kk * x1 + (x2 - x1)})`, `(${kk * x2}, ${x2})`, `(${x2}, ${kk * x1 * 2})`], int(r, 0, 3),
          `The unit rate is ${kk * x1} ÷ ${x1} = ${kk}, so y = ${kk}x. For x = ${x2}: y = ${kk} × ${x2} = ${kk * x2}. The usual slips are adding ${x2 - x1} to both coordinates, or swapping x and y.`);
      }) },
    ],
  },

  // ── 11 ───────────────────────────────────────────────────────────────────
  {
    courseSkill: 'g7-surface-area',
    skillId: 'g7-surface-area',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const l = int(r, 5, 12), w = int(r, 3, 8), h = int(r, 2, 9);
          if (l === w || w === h || l === h) return null;
          return { prompt: `A rectangular prism is ${l} cm long, ${w} cm wide and ${h} cm tall. What is its surface area, in cm²?`,
            value: 2 * (l * w + l * h + w * h),
            explanation: `SA = 2(lw + lh + wh) = 2(${l * w} + ${l * h} + ${w * h}) = ${2 * (l * w + l * h + w * h)} cm². The usual slips are finding the volume (${l * w * h}) or counting each pair of faces only once (${l * w + l * h + w * h}).` };
        }
        if (k === 1) {
          const s = int(r, 4, 12), l = int(r, 5, 15);
          return { prompt: `A square pyramid has a base with sides of ${s} in. Each of its four triangular faces has a height (the slant height) of ${l} in. What is the total surface area of the pyramid, in in²?`,
            value: s * s + 2 * s * l,
            explanation: `Base: ${s}² = ${s * s}. Each triangle: ½ × ${s} × ${l} = ${s * l / 2}; four of them: ${2 * s * l}. Total = ${s * s} + ${2 * s * l} = ${s * s + 2 * s * l} in². The usual slips are forgetting the ½ in the triangles or leaving out the base.` };
        }
        if (k === 2) {
          const s = int(r, 3, 9), h = int(r, 4, 15);
          if (s === h) return null;
          return { prompt: `A right prism has square bases with sides of ${s} m, and the prism is ${h} m tall. What is its surface area, in m²?`,
            value: 2 * s * s + 4 * s * h,
            explanation: `Two square bases: 2 × ${s}² = ${2 * s * s}. Four rectangular faces: 4 × ${s} × ${h} = ${4 * s * h}. Total = ${2 * s * s + 4 * s * h} m². The usual slip is counting only one base or only two of the four side faces.` };
        }
        const [a, b, c] = pick(r, [[3, 4, 5], [6, 8, 10]]); const L = int(r, 6, 12);
        return { prompt: `A triangular prism has two right-triangle bases with sides of ${a} cm, ${b} cm and ${c} cm (the ${a} cm and ${b} cm sides meet at the right angle). The prism is ${L} cm long. What is its surface area, in cm²?`,
          value: a * b + (a + b + c) * L,
          explanation: `Two triangles: 2 × ½ × ${a} × ${b} = ${a * b}. Three rectangles: (${a} + ${b} + ${c}) × ${L} = ${(a + b + c) * L}. Total = ${a * b + (a + b + c) * L} cm². The usual slip is leaving out the rectangle on the longest (${c} cm) side.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const [a, b, c] = pick(r, [[5, 12, 13], [9, 12, 15], [8, 15, 17], [6, 8, 10]]); const L = pick(r, [7, 9, 11, 14, 20]);
          return { prompt: `A wooden wedge is a right triangular prism. Its triangular ends have legs of ${a} cm and ${b} cm and a longest side of ${c} cm. The wedge is ${L} cm long. What is the total surface area of the wedge, in cm²?`,
            value: a * b + (a + b + c) * L,
            explanation: `Two triangular ends: 2 × ½ × ${a} × ${b} = ${a * b}. Three rectangular faces: ${a}×${L} + ${b}×${L} + ${c}×${L} = ${(a + b + c) * L}. Total = ${a * b + (a + b + c) * L} cm². The usual slips are using ${a} × ${b} for EACH triangle (forgetting ½), or leaving out a rectangle.` };
        }
        if (k === 1) {
          const l = int(r, 6, 14), w = int(r, 4, 9), h = int(r, 3, 8);
          if (l === w || w === h || l === h) return null;
          return { prompt: `An open-top box (a rectangular prism with no lid) is ${l} cm long, ${w} cm wide and ${h} cm tall. What is the total area of its outside surfaces, in cm²?`,
            value: l * w + 2 * l * h + 2 * w * h,
            explanation: `Bottom: ${l} × ${w} = ${l * w}. Front and back: 2 × ${l} × ${h} = ${2 * l * h}. Two ends: 2 × ${w} × ${h} = ${2 * w * h}. Total = ${l * w + 2 * l * h + 2 * w * h} cm². The usual slip is using the full formula, which counts a lid the box does not have.` };
        }
        if (k === 2) {
          const [hb, th, s] = pick(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17]]); const L = pick(r, [8, 10, 12, 15]);
          const b = 2 * hb;
          return { prompt: `A triangular prism has two isosceles-triangle bases. Each triangle has a base of ${b} ft, a height of ${th} ft, and two equal sides of ${s} ft. The prism is ${L} ft long. What is its surface area, in ft²?`,
            value: b * th + (b + 2 * s) * L,
            explanation: `Two triangles: 2 × ½ × ${b} × ${th} = ${b * th}. Three rectangles: (${b} + ${s} + ${s}) × ${L} = ${(b + 2 * s) * L}. Total = ${b * th + (b + 2 * s) * L} ft². The usual slip is using the triangle's height (${th}) as the width of a rectangle — the rectangles use the SIDES of the triangle.` };
        }
        const s = pick(r, [5, 6, 8, 10, 12]), l2 = pick(r, [9, 11, 13, 15, 17]);   // slant = l2/2
        return { prompt: `A square pyramid has a base with sides of ${s} m and a slant height of ${l2 / 2} m. What is its total surface area, in m²?`,
          value: s * s + s * l2,
          explanation: `Base: ${s}² = ${s * s}. Four triangles: 4 × ½ × ${s} × ${l2 / 2} = ${s * l2}. Total = ${s * s} + ${s * l2} = ${s * s + s * l2} m². The usual slip is using 4 × ${s} × ${l2 / 2} for the triangles (forgetting ½).` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const l = int(r, 4, 7), w = int(r, 3, 5), h = pick(r, [2.5, 3]), cover = pick(r, [8, 10, 12]);
          const walls = 2 * (l + w) * h;
          if (!Number.isInteger(walls) || walls % cover === 0) return null;
          return { prompt: `A room is a rectangular prism ${l} m long, ${w} m wide and ${h} m high. Only the four walls will be painted (not the floor or ceiling). One litre of paint covers ${cover} m². What is the least whole number of litres needed to paint the walls?`,
            value: Math.ceil(walls / cover),
            explanation: `Walls: 2 × ${l} × ${h} + 2 × ${w} × ${h} = ${walls} m². Litres: ${walls} ÷ ${cover} = ${(walls / cover).toFixed(2)}, so ${Math.ceil(walls / cover)} whole litres are needed. The usual slips are including the floor and ceiling, or rounding down and running short.` };
        }
        if (k === 1) {
          const l = int(r, 20, 40), w = int(r, 10, 19), h = int(r, 4, 9), n = int(r, 2, 4);
          const sa = 2 * (l * w + l * h + w * h);
          return { prompt: `A gift box is a rectangular prism ${l} cm long, ${w} cm wide and ${h} cm tall. Ignoring overlap, how many cm² of wrapping paper are needed to cover ${n} of these boxes completely?`,
            value: n * sa,
            explanation: `One box: 2(${l}×${w} + ${l}×${h} + ${w}×${h}) = 2(${l * w} + ${l * h} + ${w * h}) = ${sa} cm². For ${n} boxes: ${n} × ${sa} = ${n * sa} cm². The usual slips are using volume, or forgetting to double the three face areas.` };
        }
        if (k === 2) {
          const s = int(r, 4, 9), l = int(r, 5, 9), c = pick(r, [12, 15, 20, 25]);
          return { prompt: `The roof of a tower is a square pyramid. Its base has sides of ${s} m and its slant height is ${l} m. Only the four triangular faces are covered with shingles, which cost $${c} per m². What is the total cost of the shingles, in dollars?`,
            value: 2 * s * l * c,
            explanation: `Four triangles: 4 × ½ × ${s} × ${l} = ${2 * s * l} m². Cost: ${2 * s * l} × ${c} = $${2 * s * l * c}. The usual slips are adding the square base (which is not shingled) or forgetting the ½.` };
        }
        const [hb, th, s] = pick(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13]]); const L = pick(r, [7, 8, 9, 10]);
        const b = 2 * hb;
        return { prompt: `A tent is a triangular prism. Its two triangular ends are each ${b} ft wide at the bottom and ${th} ft tall, and each slanted side of the triangle is ${s} ft. The tent is ${L} ft long. Fabric covers the two triangular ends and the two slanted rectangular sides, but NOT the floor. How many ft² of fabric are used?`,
          value: b * th + 2 * s * L,
          explanation: `Two triangular ends: 2 × ½ × ${b} × ${th} = ${b * th}. Two slanted rectangles: 2 × ${s} × ${L} = ${2 * s * L}. Total = ${b * th + 2 * s * L} ft². The usual slip is including the floor (${b} × ${L} = ${b * L}), which has no fabric.` };
      }) },
    ],
  },

  // ── 12 ───────────────────────────────────────────────────────────────────
  {
    courseSkill: 'g7-volume',
    skillId: 'g7-volume',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const l = pick(r, [2.5, 3.5, 4.5, 1.5, 6.5]), w = pick(r, [4, 6, 8]), h = int(r, 3, 9);
          return { prompt: `A rectangular prism is ${l} cm long, ${w} cm wide and ${h} cm tall. What is its volume, in cm³?`,
            value: l * w * h,
            explanation: `V = lwh = ${l} × ${w} × ${h} = ${l * w * h} cm³. The usual slip is adding the three lengths or finding the surface area.` };
        }
        if (k === 1) {
          const b = int(r, 4, 10), h = pick(r, [3, 5, 6, 7, 9]), L = int(r, 5, 12);
          if ((b * h) % 2 !== 0) return null;
          return { prompt: `A triangular prism has a triangular base with a base of ${b} cm and a height of ${h} cm. The prism is ${L} cm long. What is its volume, in cm³?`,
            value: b * h * L / 2,
            explanation: `Base area B = ½ × ${b} × ${h} = ${b * h / 2}. V = Bh = ${b * h / 2} × ${L} = ${b * h * L / 2} cm³. The usual slip is forgetting the ½ and answering ${b * h * L}.` };
        }
        if (k === 2) {
          const B = pick(r, [12.5, 7.5, 18.5, 22.5, 9.5]), h = pick(r, [4, 6, 8, 12]);
          return { prompt: `A right prism has a base area of ${B} m² and a height of ${h} m. What is its volume, in m³?`,
            value: B * h,
            explanation: `For any right prism, V = Bh = ${B} × ${h} = ${B * h} m³. The usual slip is dividing by 2 or 3 — that belongs to triangles and pyramids, not to a prism whose base area is already given.` };
        }
        const l = int(r, 3, 9) * 2, w = int(r, 3, 9), f = pick(r, [[1, 2], [3, 2], [5, 2]]);
        return { prompt: `A rectangular prism is ${l} in long, ${w} in wide and ${mixedStr(rat(f[0], f[1]))} in tall. What is its volume, in in³?`,
          value: l * w * f[0] / f[1],
          explanation: `V = lwh = ${l} × ${w} × ${mixedStr(rat(f[0], f[1]))} = ${l * w} × ${f[0]}/${f[1]} = ${l * w * f[0] / f[1]} in³. The usual slip is multiplying only two of the three dimensions.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const a = mx(...pick(r, [[3, 2], [5, 2], [9, 4], [7, 2], [5, 4]])), b = mx(...pick(r, [[2, 3], [4, 3], [8, 3], [4, 5], [8, 5]])), c = int(r, 2, 6);
          const v = mul(mul(a, b), rat(c));
          const out = decStr(v);
          if (out === null) return null;
          return { prompt: `A rectangular prism measures ${a.s} ft by ${b.s} ft by ${c} ft. What is its volume, in ft³? ${NUM_FORM}`,
            value: out,
            explanation: `V = ${a.s} × ${b.s} × ${c} = ${impS(a)} × ${impS(b)} × ${c} = ${out} ft³. The usual slip is multiplying the whole-number parts and the fraction parts separately instead of using improper fractions.` };
        }
        if (k === 1) {
          const l = int(r, 4, 12), w = pick(r, [2.5, 3.5, 4.5, 1.5]), h = pick(r, [4, 6, 8, 10]);
          const V = l * w * h;
          return { prompt: `A rectangular prism has a volume of ${V} cm³. It is ${l} cm long and ${w} cm wide. What is its height, in cm?`,
            value: h,
            explanation: `V = lwh, so h = V ÷ (lw) = ${V} ÷ (${l} × ${w}) = ${V} ÷ ${l * w} = ${h} cm. The usual slip is dividing by only one of the two known dimensions.` };
        }
        if (k === 2) {
          const b = pick(r, [4.5, 2.5, 6.5, 3.5]), h = pick(r, [4, 6, 8]), L = pick(r, [5, 10, 12, 15]);
          return { prompt: `A triangular prism has a triangular base with a base of ${b} m and a height of ${h} m. The prism is ${L} m long. What is its volume, in m³? ${NUM_FORM}`,
            value: String(b * h * L / 2),
            explanation: `Base area B = ½ × ${b} × ${h} = ${b * h / 2}. V = Bh = ${b * h / 2} × ${L} = ${b * h * L / 2} m³. The usual slip is forgetting the ½ and answering ${b * h * L}.` };
        }
        const e = mx(...pick(r, [[3, 2], [5, 2], [1, 2], [7, 2]]));
        const v = mul(mul(e, e), e);
        return { prompt: `A cube has edges of ${e.s} in. What is its volume, in in³? ${DEC_FORM}`,
          value: decStr(v),
          explanation: `V = s³ = ${impS(e)} × ${impS(e)} × ${impS(e)} = ${v.n}/${v.d} = ${decStr(v)} in³. The usual slips are multiplying the edge by 3, or cubing the whole number and the fraction separately.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const k = idx % 4;
        if (k === 0) {
          const b = int(r, 4, 9), h = int(r, 3, 8), L = pick(r, [7, 9, 11, 12, 15]);
          if ((b * h) % 2 !== 0) return null;
          const V = b * h * L / 2;
          return { prompt: `A triangular prism has a volume of ${V} cm³. Its triangular base has a base of ${b} cm and a height of ${h} cm. How long is the prism, in cm?`,
            value: L,
            explanation: `Base area B = ½ × ${b} × ${h} = ${b * h / 2}. V = B × length, so length = ${V} ÷ ${b * h / 2} = ${L} cm. The usual slip is dividing by ${b} × ${h} = ${b * h} (forgetting the ½), which gives half the true length.` };
        }
        if (k === 1) {
          const a = int(r, 3, 6), b = a + pick(r, [2, 4, 6]), h = pick(r, [3, 5, 2.5, 4]), L = pick(r, [8, 10, 12, 20]);
          const B = (a + b) * h / 2;
          return { prompt: `A water trough is a right prism whose ends are trapezoids. Each trapezoid has parallel sides of ${a} ft and ${b} ft and a height of ${h} ft. The trough is ${L} ft long. What is its volume, in ft³?`,
            value: B * L,
            explanation: `Base area B = ½(${a} + ${b}) × ${h} = ${B}. V = Bh = ${B} × ${L} = ${B * L} ft³. The usual slip is multiplying ${a} × ${b} × ${h} × ${L} as if the ends were rectangles.` };
        }
        if (k === 2) {
          const l = pick(r, [2.5, 1.5, 3.5]), w = pick(r, [2, 4, 6]), h4 = pick(r, [12, 16, 20, 24]);   // h = h4/10
          const [n, d] = pick(r, [[3, 4], [1, 4], [1, 2]]);
          const v = mul(rat(Math.round(l * 10) * w * h4, 100), rat(n, d));
          const out = decStr(v);
          if (v.d === 1) return null;
          return { prompt: `A tank is a rectangular prism ${l} m long, ${w} m wide and ${h4 / 10} m tall. It is filled with water to ${n}/${d} of its height. How many cubic metres of water are in the tank? ${DEC_FORM}`,
            value: out,
            explanation: `Full volume: ${l} × ${w} × ${h4 / 10} = ${decStr(rat(Math.round(l * 10) * w * h4, 100))} m³. Water: ${n}/${d} of that = ${out} m³. The usual slip is giving the volume of the whole tank.` };
        }
        const b = int(r, 4, 10), h = int(r, 3, 9), L = pick(r, [6, 8, 10, 12]);
        if ((b * h) % 2 !== 0 || b === h) return null;
        const V = b * h * L / 2;
        return { prompt: `A triangular prism has a volume of ${V} in³ and is ${L} in long. Its triangular base has a base of ${b} in. What is the height of the triangular base, in inches?`,
          value: h,
          explanation: `Base area B = V ÷ length = ${V} ÷ ${L} = ${V / L}. Since B = ½ × ${b} × height, height = 2 × ${V / L} ÷ ${b} = ${h} in. The usual slip is stopping at ${V / L} ÷ ${b} without doubling for the ½.` };
      }) },
    ],
  },

  // ── 13 ───────────────────────────────────────────────────────────────────
  {
    courseSkill: 'g7-compare-data-sets',
    skillId: 'g7-compare-data-sets',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const k = idx % 4;
        const [intro, A, B] = GROUPS[(idx + int(r, 0, 3)) % 4];
        const mA = int(r, 8, 20), mB = mA + pick(r, [-5, -4, -3, 3, 4, 5]);
        const hi = mA > mB ? A : B, lo = mA > mB ? B : A;
        if (k === 0) {
          const a = setOf(r, mA, pick(r, DEV5)), b = setOf(r, mB, pick(r, DEV5));
          return { prompt: `${intro} — ${A}: ${list(a)}. ${B}: ${list(b)}. How much greater is the mean for ${hi} than the mean for ${lo}?`,
            value: Math.abs(mA - mB),
            explanation: `${A}: sum ${a.reduce((s, v) => s + v, 0)} ÷ 5 = ${mA}. ${B}: sum ${b.reduce((s, v) => s + v, 0)} ÷ 5 = ${mB}. Difference of means = ${Math.abs(mA - mB)}. The usual slip is comparing the totals or the largest values instead of the means.` };
        }
        if (k === 1) {
          const a = setOf(r, mA, pick(r, [[-5, -1, 0, 2, 4], [-6, -2, 0, 3, 5], [-3, -2, 0, 1, 6], [-7, -1, 0, 1, 2]]));
          const b = setOf(r, mB, pick(r, [[-4, -3, 0, 2, 7], [-2, -1, 0, 5, 6], [-8, -2, 0, 1, 3]]));
          const medHi = mA > mB ? A : B, medLo = mA > mB ? B : A;
          return { prompt: `${intro} — ${A}: ${list(a)}. ${B}: ${list(b)}. How much greater is the median for ${medHi} than the median for ${medLo}?`,
            value: Math.abs(mA - mB),
            explanation: `Put each list in order and take the middle value. ${A}: ${list(a.slice().sort((x, y) => x - y))} → median ${mA}. ${B}: ${list(b.slice().sort((x, y) => x - y))} → median ${mB}. Difference = ${Math.abs(mA - mB)}. The usual slip is taking the middle number of the unordered list.` };
        }
        if (k === 2) {
          const a = setOf(r, mA, pick(r, DEV5)), b = setOf(r, mB, pick(r, WIDE));
          const d = Math.abs(rangeOf(a) - rangeOf(b));
          if (d === 0) return null;
          return { prompt: `${intro} — ${A}: ${list(a)}. ${B}: ${list(b)}. What is the difference between the range for ${A} and the range for ${B}?`,
            value: d,
            explanation: `Range = greatest − least. ${A}: ${Math.max(...a)} − ${Math.min(...a)} = ${rangeOf(a)}. ${B}: ${Math.max(...b)} − ${Math.min(...b)} = ${rangeOf(b)}. The difference is ${d}. The usual slip is subtracting the first value from the last without finding the greatest and least.` };
        }
        const a = shuffle(r, [mA - 3, mA - 1, mA + 1, mA + 3]), b = setOf(r, mB, pick(r, DEV5));
        return { prompt: `${intro} — ${A}: ${list(a)}. ${B}: ${list(b)}. How much greater is the mean for ${hi} than the mean for ${lo}?`,
          value: Math.abs(mA - mB),
          explanation: `${A} has 4 values: sum ${a.reduce((s, v) => s + v, 0)} ÷ 4 = ${mA}. ${B} has 5 values: sum ${b.reduce((s, v) => s + v, 0)} ÷ 5 = ${mB}. Difference of means = ${Math.abs(mA - mB)}. The usual slip is dividing both sums by the same number even though the sets are different sizes.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const k = idx % 4;
        const [intro, A, B] = GROUPS[(idx + int(r, 0, 3)) % 4];
        if (k === 0) {
          const dA = pick(r, DEV5), dB = pick(r, DEV5);
          const a = setOf(r, int(r, 8, 20), dA), b = setOf(r, int(r, 8, 20), dB);
          const diff = rat(Math.round(Math.abs(madOf(a) - madOf(b)) * 10), 10);
          if (diff.n === 0 || diff.d === 1) return null;
          const hi = madOf(a) > madOf(b) ? A : B, lo = hi === A ? B : A;
          return { prompt: `${intro} — ${A}: ${list(a)}. ${B}: ${list(b)}. How much greater is the mean absolute deviation (MAD) for ${hi} than the MAD for ${lo}? ${DEC_FORM}`,
            value: decStr(diff),
            explanation: `${A}: mean ${meanOf(a)}, distances from the mean add to ${madOf(a) * 5}, so MAD = ${madOf(a)}. ${B}: mean ${meanOf(b)}, distances add to ${madOf(b) * 5}, so MAD = ${madOf(b)}. Difference = ${decStr(diff)}. The usual slip is adding signed differences (which always total 0) instead of distances.` };
        }
        if (k === 1) {
          const [ia, ib] = pick(r, [[3, 6], [4, 8], [6, 4], [8, 3], [3, 8], [6, 8]]);
          const oa = int(r, 5, 20), ob = int(r, 5, 20);
          const a = pick(r, Q8[ia]).map((v) => v + oa), b = pick(r, Q8[ib]).map((v) => v + ob);
          const hi = ia > ib ? A : B, lo = ia > ib ? B : A;
          return { prompt: `${intro}, listed in order — ${A}: ${list(a)}. ${B}: ${list(b)}. How much greater is the interquartile range (IQR) for ${hi} than the IQR for ${lo}?`,
            value: Math.abs(ia - ib),
            explanation: `Split each ordered list of 8 into halves of 4; Q1 and Q3 are the medians of the halves. ${A}: Q1 = ${(a[1] + a[2]) / 2}, Q3 = ${(a[5] + a[6]) / 2}, IQR = ${ia}. ${B}: Q1 = ${(b[1] + b[2]) / 2}, Q3 = ${(b[5] + b[6]) / 2}, IQR = ${ib}. Difference = ${Math.abs(ia - ib)}. The usual slip is using the range (greatest − least) instead of Q3 − Q1.` };
        }
        if (k === 2) {
          const tightIsA = pick(r, [true, false]);
          const mT = int(r, 12, 20), mW = mT + int(r, 2, 4);
          const t = setOf(r, mT, pick(r, TIGHT)), w = setOf(r, mW, pick(r, WIDE));
          const a = tightIsA ? t : w, b = tightIsA ? w : t;
          const T = tightIsA ? A : B, W = tightIsA ? B : A;
          return mc(`${intro} — ${A}: ${list(a)}. ${B}: ${list(b)}. Which group's results are more consistent (less spread out), and why?`,
            `${T}, because its range is smaller (${rangeOf(t)} compared with ${rangeOf(w)})`,
            [`${W}, because its range is larger (${rangeOf(w)} compared with ${rangeOf(t)})`,
              `${W}, because its mean is higher (${mW} compared with ${mT})`,
              'Neither, because both groups have the same number of values'], int(r, 0, 3),
            `Consistency is about spread, not centre. ${T}'s values run from ${Math.min(...t)} to ${Math.max(...t)} (range ${rangeOf(t)}); ${W}'s run from ${Math.min(...w)} to ${Math.max(...w)} (range ${rangeOf(w)}). The smaller spread is more consistent. The usual slip is choosing by the mean, which measures centre.`);
        }
        const mA = int(r, 10, 18), mB = mA + pick(r, [-3, -2, 2, 3]);
        const dA = pick(r, [[-5, -1, 0, 2, 4], [-2, -1, 0, 1, 2], [-7, -1, 0, 1, 2]]), dB = pick(r, [[-4, -3, 0, 2, 7], [-1, -1, 0, 1, 1], [-8, -2, 0, 1, 3]]);
        const a = setOf(r, mA, dA), b = setOf(r, mB, dB);
        if (rangeOf(a) === rangeOf(b)) return null;
        const medHi = mA > mB ? A : B, medLo = medHi === A ? B : A;
        const rHi = rangeOf(a) > rangeOf(b) ? A : B, rLo = rHi === A ? B : A;
        return mc(`${intro} — ${A}: ${list(a)}. ${B}: ${list(b)}. Which statement is true?`,
          `${medHi} has the greater median and ${rHi} has the greater range`,
          [`${medHi} has the greater median and ${rLo} has the greater range`,
            `${medLo} has the greater median and ${rHi} has the greater range`,
            `${medLo} has the greater median and ${rLo} has the greater range`], int(r, 0, 3),
          `Order each list. ${A}: median ${mA}, range ${rangeOf(a)}. ${B}: median ${mB}, range ${rangeOf(b)}. So ${medHi} has the greater median and ${rHi} has the greater range. The usual slip is reading the middle of the unordered list as the median.`);
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const k = idx % 4;
        const [intro, A, B] = GROUPS[(idx + int(r, 0, 3)) % 4];
        if (k === 0 || k === 2) {
          const mA = int(r, 10, 20), D = k === 0 ? pick(r, [4, 6, 8]) : pick(r, [3, 5, 7]);
          const mB = mA + pick(r, [-1, 1]) * D;
          const a = setOf(r, mA, pick(r, MAD2)), b = setOf(r, mB, pick(r, MAD2));
          const given = k === 0 ? 'Each set has a mean absolute deviation (MAD) of 2.' : 'Both sets have the same mean absolute deviation (MAD).';
          return { prompt: `${intro} — ${A}: ${list(a)}. ${B}: ${list(b)}. ${given} The difference between the two means is how many times the MAD?${k === 2 ? ` ${DEC_FORM}` : ''}`,
            value: decStr(rat(D, 2)),
            explanation: `Means: ${A} = ${mA}, ${B} = ${mB}; difference = ${D}. The MAD of each set is 2 (the distances from the mean add to 10, and 10 ÷ 5 = 2). ${D} ÷ 2 = ${D / 2}, so the means are ${D / 2} MADs apart. The usual slip is dividing the MAD by the difference, or multiplying them.` };
        }
        if (k === 1) {
          const mA = int(r, 10, 18), mB = mA + pick(r, [-3, -2, 2, 3]);
          const tightIsA = pick(r, [true, false]);
          const a = setOf(r, mA, pick(r, tightIsA ? TIGHT : WIDE)), b = setOf(r, mB, pick(r, tightIsA ? WIDE : TIGHT));
          const meanHi = mA > mB ? A : B, meanLo = meanHi === A ? B : A;
          const vHi = tightIsA ? B : A, vLo = tightIsA ? A : B;
          return mc(`${intro} — ${A}: ${list(a)}. ${B}: ${list(b)}. Which statement is true?`,
            `${meanHi} has the greater mean, and ${vHi} has the greater mean absolute deviation`,
            [`${meanHi} has the greater mean, and ${vLo} has the greater mean absolute deviation`,
              `${meanLo} has the greater mean, and ${vHi} has the greater mean absolute deviation`,
              `${meanLo} has the greater mean, and ${vLo} has the greater mean absolute deviation`], int(r, 0, 3),
            `${A}: mean ${mA}, MAD ${madOf(a)}. ${B}: mean ${mB}, MAD ${madOf(b)}. So ${meanHi} has the greater mean and ${vHi} varies more (greater MAD). The usual slip is assuming the set with the bigger numbers must also be the more variable one.`);
        }
        const fam = pick(r, [4, 6]);
        const oA = int(r, 5, 15), D = fam * pick(r, [0.5, 1.5, 2.5]);
        const oB = oA + D;
        const a = pick(r, Q8[fam]).map((v) => v + oA), b = pick(r, Q8[fam]).map((v) => v + oB);
        return { prompt: `${intro}, listed in order — ${A}: ${list(a)}. ${B}: ${list(b)}. Both sets have an interquartile range (IQR) of ${fam}. The difference between the two medians is how many times the IQR? ${DEC_FORM}`,
          value: String(D / fam),
          explanation: `Medians (mean of the 4th and 5th values): ${A} = ${medianOf(a)}, ${B} = ${medianOf(b)}; difference = ${D}. ${D} ÷ ${fam} = ${D / fam}, so the medians are ${D / fam} IQRs apart. The usual slip is using the difference of the greatest values instead of the medians.` };
      }) },
    ],
  },
];

module.exports = { COURSE_ID, GB, TEMPLATES };
