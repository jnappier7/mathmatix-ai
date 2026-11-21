'use strict';
/**
 * At-level check items for 8th-grade math (Common Core grade 8) — the fifteen
 * course skills whose bank pools did not test the skill ("volume of a cylinder"
 * served prism items, "ordering real numbers" served "Order 14, 16, 6").
 *
 * Every answer is computed from the numbers drawn; every wrong option is the
 * answer a named common mistake produces. Text only — no item needs a picture.
 * Re-solved from the printed prompt in tests/unit/courseLevelGrade8.test.js.
 */

const K = require('./templateKit');
const { int, pick } = K;

const COURSE_ID = 'grade-8-math';
const GB = '6-8';

// ── shared helpers ──────────────────────────────────────────────────────────

const LETTERS = 'ABCD';
const neg = (n) => (n < 0 ? `−${Math.abs(n)}` : String(n));
const pt = (x, y) => `(${neg(x)}, ${neg(y)})`;
const FLIP = { '<': '>', '>': '<', '≤': '≥', '≥': '≤' };
const OPS = ['<', '>', '≤', '≥'];

/** "3x + 5", "−x − 4", "2x" */
function lin(m, b, v = 'x') {
  const mt = m === 1 ? v : m === -1 ? `−${v}` : `${neg(m)}${v}`;
  if (b === 0) return mt;
  return `${mt} ${b < 0 ? '−' : '+'} ${Math.abs(b)}`;
}

/** Hundredths → the decimal a student types: 28260 → "282.6". */
function dec100(n) {
  return (n / 100).toFixed(2).replace(/\.?0+$/, '');
}

/** n/d · π in lowest terms: "36π", "32π/3". */
function piText(n, d = 1) {
  const [a, b] = K.reduce(n, d);
  return b === 1 ? `${a}π` : `${a}π/${b}`;
}

function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(r, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Four options with the right one at a drawn position. Returns null when the
 * mistakes do not give three distinct wrong answers — the caller redraws.
 */
function mc(r, correct, wrongs) {
  const c = String(correct);
  const ws = [];
  for (const w of wrongs.map(String)) if (w !== c && !ws.includes(w)) ws.push(w);
  if (ws.length < 3) return null;
  const pos = int(r, 0, 3);
  const options = ws.slice(0, 3);
  options.splice(pos, 0, c);
  return { options, correctOption: LETTERS[pos], value: c };
}

/** Options in a fixed, natural order; the key is wherever the right one sits. */
function mcFixed(options, correct) {
  const at = options.indexOf(correct);
  if (at < 0 || new Set(options).size !== 4) return null;
  return { options, correctOption: LETTERS[at], value: correct };
}

/** Redraw until the generator is happy with its numbers. */
const retry = (fn) => (r, idx) => {
  for (let i = 0; i < 400; i++) {
    const out = fn(r, idx);
    if (out) return out;
  }
  throw new Error('no clean draw in 400 attempts');
};

const UNITS = ['cm', 'in', 'm', 'ft'];
const nUnits = (n) => `${Math.abs(n)} unit${Math.abs(n) === 1 ? '' : 's'}`;
const approxOf = (x) => `${x.t} ≈ ${x.v < 0 ? '−' : ''}${Math.abs(x.v).toFixed(2)}`;

// ── real numbers ────────────────────────────────────────────────────────────

const isSquare = (n) => Number.isInteger(Math.sqrt(n));
const RN = {
  sqrt: (n) => ({ t: `√${n}`, v: Math.sqrt(n) }),
  nsqrt: (n) => ({ t: `−√${n}`, v: -Math.sqrt(n) }),
  dec: (tenths) => ({ t: `${tenths < 0 ? '−' : ''}${(Math.abs(tenths) / 10).toFixed(1)}`, v: tenths / 10 }),
  fr: (a, b) => ({ t: `${a}/${b}`, v: a / b }),
  pi: () => ({ t: 'π', v: Math.PI }),
};
function minGap(nums) {
  let g = Infinity;
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) g = Math.min(g, Math.abs(nums[i].v - nums[j].v));
  }
  return g;
}
function nonSquareIn(r, lo, hi) {
  let n = int(r, lo, hi);
  while (isSquare(n)) n = int(r, lo, hi);
  return n;
}

// ── contexts for interpret-slope-intercept ──────────────────────────────────

const INC = [
  {
    key: 'plumber',
    intro: (m, b) => `A plumber's total charge C, in dollars, for a job that takes h hours is modeled by C = ${m}h + ${b}.`,
    rate: (n) => `The plumber charges $${n} for each hour of work`,
    start: (n) => `The plumber charges a flat fee of $${n} before any work is done`,
    total: (n) => `Every job costs a total of $${n}`,
    change: (k) => `By how many dollars does the total charge increase when a job takes ${k} more hours?`,
    m: [35, 80], b: [20, 95], step: 5,
  },
  {
    key: 'plant',
    intro: (m, b) => `The height H of a plant, in centimeters, w weeks after it was bought is modeled by H = ${m}w + ${b}.`,
    rate: (n) => `The plant grows ${n} cm each week`,
    start: (n) => `The plant was ${n} cm tall when it was bought`,
    total: (n) => `The plant stops growing when it is ${n} cm tall`,
    change: (k) => `By how many centimeters does the plant's height increase over any ${k} weeks?`,
    m: [2, 6], b: [8, 30], step: 1,
  },
  {
    key: 'savings',
    intro: (m, b) => `The amount S, in dollars, in Dana's savings account after w weeks is modeled by S = ${m}w + ${b}.`,
    rate: (n) => `Dana adds $${n} to the account each week`,
    start: (n) => `Dana had $${n} in the account at the start`,
    total: (n) => `Dana's goal is to save a total of $${n}`,
    change: (k) => `By how many dollars does the amount in the account increase over any ${k} weeks?`,
    m: [10, 45], b: [50, 300], step: 5,
  },
  {
    key: 'taxi',
    intro: (m, b) => `The fare F, in dollars, for a taxi ride of d miles is modeled by F = ${m}d + ${b}.`,
    rate: (n) => `The fare goes up $${n} for each mile traveled`,
    start: (n) => `The ride costs $${n} before any distance is traveled`,
    total: (n) => `Every ride costs a total of $${n}`,
    change: (k) => `By how many dollars does the fare increase when a ride is ${k} miles longer?`,
    m: [2, 4], b: [5, 12], step: 1,
  },
];

const DEC = [
  {
    key: 'candle',
    intro: (m, b) => `The height H of a burning candle, in centimeters, after t hours is modeled by H = ${b} − ${m}t.`,
    down: (n) => `The candle gets ${n} cm shorter each hour`,
    up: (n) => `The candle gets ${n} cm taller each hour`,
    start: (n) => `The candle was ${n} cm tall before it was lit`,
    end: (n) => `The candle burns out after ${n} hours`,
    units: ['centimeters per hour', 'hours per centimeter', 'centimeters', 'hours'],
    m: [2, 4], b: [18, 36],
  },
  {
    key: 'tank',
    intro: (m, b) => `The volume V of water in a tank, in liters, t minutes after a drain is opened is modeled by V = ${b} − ${m}t.`,
    down: (n) => `The tank loses ${n} liters of water each minute`,
    up: (n) => `The tank gains ${n} liters of water each minute`,
    start: (n) => `The tank held ${n} liters when the drain was opened`,
    end: (n) => `The tank is empty after ${n} minutes`,
    units: ['liters per minute', 'minutes per liter', 'liters', 'minutes'],
    m: [5, 15], b: [120, 400],
  },
  {
    key: 'card',
    intro: (m, b) => `The balance B, in dollars, left on a gift card after n smoothies are bought is modeled by B = ${b} − ${m}n.`,
    down: (n) => `The balance goes down $${n} for each smoothie bought`,
    up: (n) => `The balance goes up $${n} for each smoothie bought`,
    start: (n) => `The card had $${n} on it before any smoothies were bought`,
    end: (n) => `The card is empty after ${n} smoothies`,
    units: ['dollars per smoothie', 'smoothies per dollar', 'dollars', 'smoothies'],
    m: [4, 7], b: [40, 75],
  },
  {
    key: 'hiker',
    intro: (m, b) => `A hiker's elevation E, in meters, t minutes after starting down a trail is modeled by E = ${b} − ${m}t.`,
    down: (n) => `The hiker descends ${n} meters each minute`,
    up: (n) => `The hiker climbs ${n} meters each minute`,
    start: (n) => `The hiker started at an elevation of ${n} meters`,
    end: (n) => `The hike takes ${n} minutes`,
    units: ['meters per minute', 'minutes per meter', 'meters', 'minutes'],
    m: [8, 20], b: [900, 1800],
  },
];

// ── similar-solid lists ─────────────────────────────────────────────────────

const TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [7, 24, 25], [12, 16, 20]];

const TEMPLATES = [
  // 1 ─────────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'real-number-ordering',
    skillId: 'g8-real-number-ordering',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        if (idx % 2 === 0) {
          const n = nonSquareIn(r, idx === 0 ? 11 : 90, idx === 0 ? 80 : 220);
          const f = Math.floor(Math.sqrt(n));
          return { prompt: `√${n} lies between two consecutive whole numbers. What is the SMALLER of those two whole numbers?`,
            value: f,
            explanation: `${f}² = ${f * f} and ${f + 1}² = ${(f + 1) * (f + 1)}, and ${n} is between them, so √${n} is between ${f} and ${f + 1}. The usual slip is halving ${n} instead of looking for the nearest perfect squares.` };
        }
        const m = int(r, 3, 9);
        const nums = [
          RN.sqrt(m * m + int(r, 1, 2 * m)),
          RN.dec(10 * m + int(r, 1, 9)),
        ];
        const b = pick(r, [2, 3, 4]);
        const a = b * m + int(r, 1, b - 1);
        if (K.gcd(a, b) !== 1) return null;
        nums.push(RN.fr(a, b));
        nums.push(m === 3 ? RN.pi() : RN.sqrt(nonSquareIn(r, (m - 1) * (m - 1) + 1, m * m + 2 * m)));
        if (new Set(nums.map((x) => x.t)).size !== 4 || minGap(nums) < 0.12) return null;
        const list = shuffle(r, nums);
        const wantMax = idx === 1;
        const best = list.reduce((p, c) => ((wantMax ? c.v > p.v : c.v < p.v) ? c : p));
        const approx = list.map(approxOf).join(', ');
        return { prompt: `Which of these numbers is the ${wantMax ? 'greatest' : 'least'}: ${list.map((x) => x.t).join(', ')}?`,
          ...mcFixed(list.map((x) => x.t), best.t),
          explanation: `Write each as a decimal: ${approx}. The ${wantMax ? 'greatest' : 'least'} is ${best.t}. A common slip is comparing the number under the √ sign instead of the root's value.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const n = nonSquareIn(r, 5, 40);
        const ns = RN.nsqrt(n);
        const nd = RN.dec(-Math.round(Math.sqrt(n) * 10) + pick(r, [-6, -5, -4, -3, 3, 4, 5, 6]));
        if (Math.round(nd.v * 10) % 10 === 0) return null;
        let p1; let p2;
        if (int(r, 0, 1) === 0) {
          p1 = RN.pi();
          const f = pick(r, [[10, 3], [7, 2], [13, 4], [11, 4], [14, 5], [5, 2], [8, 3]]);
          p2 = RN.fr(f[0], f[1]);
        } else {
          const n2 = nonSquareIn(r, 3, 30);
          const b = pick(r, [2, 3, 4]);
          const a = Math.round(Math.sqrt(n2) * b) + pick(r, [-1, 1]);
          if (a < 1 || K.gcd(a, b) !== 1) return null;
          p1 = RN.sqrt(n2);
          p2 = RN.fr(a, b);
        }
        const nums = [ns, nd, p1, p2];
        if (minGap(nums) < 0.12 || Math.abs(p1.v - p2.v) > 0.9) return null;
        const asc = nums.slice().sort((x, y) => x.v - y.v).map((x) => x.t);
        const up = idx % 2 === 0;
        const right = up ? asc : asc.slice().reverse();
        const swap = (arr, i, j) => { const c = arr.slice(); [c[i], c[j]] = [c[j], c[i]]; return c; };
        // The negatives sit together at one end; swapping them is "ordered by size, ignoring the sign".
        const wrongs = up
          ? [swap(right, 0, 1), right.slice().reverse(), swap(right, 2, 3)]
          : [swap(right, 2, 3), right.slice().reverse(), swap(right, 0, 1)];
        const m = mc(r, right.join(', '), wrongs.map((w) => w.join(', ')));
        if (!m) return null;
        const approx = nums.map(approxOf).join(', ');
        return { prompt: `Which list shows the numbers ${shuffle(r, nums).map((x) => x.t).join(', ')} in order from ${up ? 'least to greatest' : 'greatest to least'}?`,
          ...m,
          explanation: `As decimals: ${approx}. So the order is ${right.join(', ')}. The usual slip is with the two negatives: the one farther from zero is the SMALLER number.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        if (idx % 2 === 1) {
          const n = nonSquareIn(r, 12, 180);
          const f = Math.floor(Math.sqrt(n));
          const near = n - f * f <= f ? f : f + 1;   // (f + 0.5)² = f² + f + 0.25
          return { prompt: `√${n} lies between two consecutive whole numbers. Which of those two whole numbers is √${n} CLOSER to?`,
            value: near,
            explanation: `${f}² = ${f * f} and ${f + 1}² = ${(f + 1) * (f + 1)}, so √${n} is between ${f} and ${f + 1}. The halfway point ${f}.5 squares to ${f * f + f + 0.25}; ${n} is ${n > f * f + f ? 'above' : 'below'} that, so √${n} is closer to ${near}. Don't just pick the smaller whole number every time.` };
        }
        const n = nonSquareIn(r, 10, 80);
        const lo = RN.sqrt(n);
        const hiT = Math.ceil(lo.v * 10) + int(r, 4, 8);
        if (hiT % 10 === 0) return null;
        const hi = RN.dec(hiT);
        const cands = [];
        for (let k = Math.max(2, Math.floor((lo.v - 0.8) ** 2)); k <= Math.ceil((hi.v + 0.8) ** 2); k++) if (!isSquare(k) && k !== n) cands.push(RN.sqrt(k));
        for (const b of [2, 3, 4, 5]) {
          for (let a = Math.floor((lo.v - 0.8) * b); a <= Math.ceil((hi.v + 0.8) * b); a++) if (a > 0 && K.gcd(a, b) === 1) cands.push(RN.fr(a, b));
        }
        for (let t = Math.floor((lo.v - 0.8) * 10); t <= Math.ceil((hi.v + 0.8) * 10); t++) if (t % 10 !== 0 && t !== hiT) cands.push(RN.dec(t));
        const inside = cands.filter((c) => c.v >= lo.v + 0.1 && c.v <= hi.v - 0.1 && !/^\d+\.\d$/.test(c.t));
        const below = cands.filter((c) => c.v <= lo.v - 0.1 && c.v >= lo.v - 0.7);
        const above = cands.filter((c) => c.v >= hi.v + 0.1 && c.v <= hi.v + 0.7);
        if (!inside.length || below.length < 2 || above.length < 2) return null;
        const right = pick(r, inside);
        const w = [pick(r, below), pick(r, above), pick(r, int(r, 0, 1) ? below : above)];
        const m = mc(r, right.t, w.map((x) => x.t));
        if (!m) return null;
        return { prompt: `Which of these numbers is between √${n} and ${hi.t}?`,
          ...m,
          explanation: `√${n} ≈ ${lo.v.toFixed(2)}, so the number must be between about ${lo.v.toFixed(2)} and ${hi.t}. ${right.t} ≈ ${right.v.toFixed(2)} is; ${w.map((x) => `${x.t} ≈ ${x.v.toFixed(2)}`).join(', ')} are not. Estimate each root or fraction as a decimal before comparing.` };
      }) },
    ],
  },

  // 2 ─────────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'linear-inequalities',
    skillId: 'g8-linear-inequalities',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const a = int(r, 2, 6) * (idx === 2 ? 1 : -1);
        const v = K.nonZero(r, -8, 8);
        const b = K.nonZero(r, -9, 9);
        const c = a * v + b;
        const op = pick(r, OPS);
        const cop = a < 0 ? FLIP[op] : op;
        const m = mc(r, `x ${cop} ${neg(v)}`, [`x ${FLIP[cop]} ${neg(v)}`, `x ${cop} ${neg(-v)}`, `x ${FLIP[cop]} ${neg(-v)}`]);
        if (!m) return null;
        return { prompt: `Solve for x: ${lin(a, b)} ${op} ${neg(c)}. Which inequality gives all the solutions?`,
          ...m,
          explanation: `${b < 0 ? 'Add' : 'Subtract'} ${Math.abs(b)}: ${lin(a, 0)} ${op} ${neg(c - b)}. Divide by ${neg(a)}: x ${cop} ${neg(v)}. ${a < 0 ? 'Dividing by a negative number reverses the inequality sign — forgetting that is the usual slip.' : 'The divisor is positive, so the sign does NOT flip — only dividing or multiplying by a negative reverses it.'}` };
      }) },
      { difficulty: 3, gen: retry((r) => {
        const a = int(r, 2, 9); const c = int(r, 2, 9);
        if (a === c) return null;
        const v = K.nonZero(r, -9, 9);
        const b = K.nonZero(r, -12, 12);
        const d = (a - c) * v + b;
        if (d === 0) return null;
        const op = pick(r, OPS);
        const cop = a - c < 0 ? FLIP[op] : op;
        const m = mc(r, `x ${cop} ${neg(v)}`, [`x ${FLIP[cop]} ${neg(v)}`, `x ${cop} ${neg(-v)}`, `x ${FLIP[cop]} ${neg(-v)}`]);
        if (!m) return null;
        return { prompt: `Solve for x: ${lin(a, b)} ${op} ${lin(c, d)}. Which inequality gives all the solutions?`,
          ...m,
          explanation: `Subtract ${c}x from both sides: ${lin(a - c, b)} ${op} ${neg(d)}. ${b < 0 ? 'Add' : 'Subtract'} ${Math.abs(b)}: ${lin(a - c, 0)} ${op} ${neg(d - b)}. Divide by ${neg(a - c)}: x ${cop} ${neg(v)}. ${a - c < 0 ? 'The divisor is negative, so the sign reverses.' : 'The divisor is positive, so the sign stays as it is.'}` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        if (idx % 2 === 1) {
          const a = int(r, 2, 5);
          const p = K.nonZero(r, -6, 6);
          const v = int(r, -7, 7);
          const c = -a * (v + p);
          const op = pick(r, OPS);
          const cop = FLIP[op];
          const greatest = cop === '<' || cop === '≤';
          const ans = cop === '<' ? v - 1 : cop === '>' ? v + 1 : v;
          return { prompt: `What is the ${greatest ? 'greatest' : 'least'} integer x that satisfies −${a}(x ${p < 0 ? '−' : '+'} ${Math.abs(p)}) ${op} ${neg(c)}?`,
            value: ans,
            explanation: `Divide both sides by −${a} and reverse the sign: x ${p < 0 ? '−' : '+'} ${Math.abs(p)} ${cop} ${neg(v + p)}, so x ${cop} ${neg(v)}. The ${greatest ? 'greatest' : 'least'} integer that fits is ${neg(ans)}. Forgetting to reverse the sign, or ${cop === '<' || cop === '>' ? 'including the endpoint of a strict inequality' : 'leaving out an endpoint that is allowed'}, are the usual slips.` };
        }
        const a = K.nonZero(r, -5, 6);
        const c = int(r, 2, 7);
        if (a === c || Math.abs(a) === 1) return null;
        const p = K.nonZero(r, -6, 6);
        const v = K.nonZero(r, -8, 8);
        const d = (a - c) * v - a * p;
        if (d === 0) return null;
        const op = pick(r, OPS);
        const cop = a - c < 0 ? FLIP[op] : op;
        const m = mc(r, `x ${cop} ${neg(v)}`, [`x ${FLIP[cop]} ${neg(v)}`, `x ${cop} ${neg(-v)}`, `x ${FLIP[cop]} ${neg(-v)}`]);
        if (!m) return null;
        return { prompt: `Solve for x: ${neg(a)}(x ${p < 0 ? '+' : '−'} ${Math.abs(p)}) ${op} ${lin(c, d)}. Which inequality gives all the solutions?`,
          ...m,
          explanation: `Distribute: ${lin(a, -a * p)} ${op} ${lin(c, d)}. Collect x-terms and constants: ${lin(a - c, 0)} ${op} ${neg(d + a * p)}. Divide by ${neg(a - c)}: x ${cop} ${neg(v)}. ${a - c < 0 ? 'Dividing by a negative reverses the sign' : 'The divisor is positive, so the sign stays'}; also watch the sign when distributing ${neg(a)}.` };
      }) },
    ],
  },

  // 3 ─────────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'equation-word-problems',
    skillId: 'g8-equation-word-problems',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const n = int(r, 3, 12);
        const shapes = [
          () => { const F = int(r, 4, 12) * 5; const R = int(r, 3, 9) * 5; return { F, R, text: (T) => `A gym charges a $${F} sign-up fee plus $${R} per month. Maya has paid $${T} in all. For how many months has she been a member?` }; },
          () => { const F = int(r, 6, 15) * 5; const R = int(r, 9, 17) * 5; return { F, R, text: (T) => `A plumber charges $${F} for a visit plus $${R} per hour of work. A customer's bill is $${T}. How many hours did the plumber work?` }; },
          () => { const F = int(r, 3, 8); const R = int(r, 2, 4); return { F, R, text: (T) => `A taxi charges $${F} to start a ride plus $${R} per mile. A ride cost $${T}. How many miles long was the ride?` }; },
          () => { const F = int(r, 4, 20) * 5; const R = int(r, 3, 8) * 5; return { F, R, text: (T) => `Sam has $${F} saved and adds $${R} to his savings each week. In how many weeks will he have exactly $${T}?` }; },
        ];
        const s = shapes[idx % 4]();
        const T = s.F + s.R * n;
        return { prompt: s.text(T), value: n,
          explanation: `Write ${s.F} + ${s.R}x = ${T}. Subtract ${s.F}: ${s.R}x = ${T - s.F}. Divide by ${s.R}: x = ${n}. The usual slip is dividing ${T} by ${s.R} without taking off the $${s.F} first.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        if (idx % 2 === 1) {
          const even = idx === 3;
          const n = even ? int(r, 5, 30) * 2 : int(r, 8, 60);
          const step = even ? 2 : 1;
          const S = 3 * n + 3 * step;
          const want = idx === 1 ? 'smallest' : 'largest';
          const ans = want === 'smallest' ? n : n + 2 * step;
          return { prompt: `The sum of three consecutive ${even ? 'even ' : ''}integers is ${S}. What is the ${want} of the three integers?`,
            value: ans,
            explanation: `Call them x, x + ${step} and x + ${2 * step}: 3x + ${3 * step} = ${S}, so 3x = ${S - 3 * step} and x = ${n}. The integers are ${n}, ${n + step}, ${n + 2 * step}; the ${want} is ${ans}. The usual slip is giving x when the question asks for a different one of the three.` };
        }
        const n = int(r, 3, 12);
        const R2 = int(r, 2, 8) * 5; const R1 = R2 + int(r, 1, 4) * 5;
        const F1 = int(r, 0, 6) * 5 + 10; const F2 = F1 + n * (R1 - R2);
        const text = idx === 0
          ? `Phone plan A costs $${F1} to set up plus $${R1} per month. Phone plan B costs $${F2} to set up plus $${R2} per month. After how many months will the two plans have cost the same total amount?`
          : `A bike shop rents a bike for a $${F1} fee plus $${R1} per hour. Another shop charges a $${F2} fee plus $${R2} per hour. For how many hours of renting do the two shops charge the same total?`;
        return { prompt: text, value: n,
          explanation: `Set the totals equal: ${F1} + ${R1}x = ${F2} + ${R2}x. Subtract ${R2}x and ${F1}: ${R1 - R2}x = ${F2 - F1}, so x = ${n}. The usual slip is combining the two rates by adding them instead of subtracting.` };
      } },
      { difficulty: 4, gen: retry((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const k = int(r, 2, 4); const c = int(r, 1, 9); const w = int(r, 4, 15);
          const L = k * w + c; const P = 2 * (L + w);
          return { prompt: `The length of a rectangle is ${c} cm more than ${k} times its width. The perimeter of the rectangle is ${P} cm. What is the LENGTH of the rectangle, in cm?`,
            value: L,
            explanation: `Let w be the width; the length is ${k}w + ${c}. Perimeter: 2(w + ${k}w + ${c}) = ${P}, so ${2 * (k + 1)}w + ${2 * c} = ${P} and w = ${w}. The length is ${k}(${w}) + ${c} = ${L} cm. The usual slip is stopping at the width.` };
        }
        if (shape === 1) {
          const a = int(r, 1, 9); const b = int(r, 1, 6); const c = int(r, 1, 8); const x = int(r, 5, 12);
          const sides = [x + a, 2 * x - b, 3 * x + c];
          const [s0, s1, s2] = sides.slice().sort((p, q) => p - q);
          if (s0 + s1 <= s2 || s1 === s2) return null;
          const P = sides[0] + sides[1] + sides[2];
          return { prompt: `The three sides of a triangle measure (x + ${a}) cm, (2x − ${b}) cm and (3x + ${c}) cm. The perimeter of the triangle is ${P} cm. What is the length of the LONGEST side, in cm?`,
            value: s2,
            explanation: `Add the sides: 6x + ${a - b + c} = ${P}, so 6x = ${P - (a - b + c)} and x = ${x}. The sides are ${sides.join(', ')} cm; the longest is ${s2} cm. The usual slip is answering with x instead of a side length.` };
        }
        if (shape === 2) {
          const A = int(r, 9, 15); const C = int(r, 4, 8); const more = int(r, 1, 4); const x = int(r, 2, 8);
          const T = A * x + C * (x + more);
          return { prompt: `Adult tickets cost $${A} each and child tickets cost $${C} each. A group buys ${more} more child tickets than adult tickets and pays $${T} in all. How many ADULT tickets did the group buy?`,
            value: x,
            explanation: `Let x be the number of adult tickets, so there are x + ${more} child tickets: ${A}x + ${C}(x + ${more}) = ${T}. Distribute: ${A + C}x + ${C * more} = ${T}, so ${A + C}x = ${T - C * more} and x = ${x}. The usual slip is forgetting to multiply the ${more} by ${C}.` };
        }
        const n = int(r, 3, 10);
        const R2 = int(r, 3, 9) * 5; const R1 = R2 + int(r, 1, 3) * 5;
        const F1 = int(r, 2, 8) * 5; const F2 = F1 + n * (R1 - R2);
        const cost = F1 + R1 * n;
        return { prompt: `Streaming service A costs $${F1} to join plus $${R1} per month. Service B costs $${F2} to join plus $${R2} per month. In the month when the two services have cost the same total amount, what is that total, in dollars?`,
          value: cost,
          explanation: `Set ${F1} + ${R1}x = ${F2} + ${R2}x: ${R1 - R2}x = ${F2 - F1}, so x = ${n} months. Substitute back: ${F1} + ${R1}(${n}) = ${cost} dollars. The usual slip is answering with the number of months, ${n}, instead of the cost.` };
      }) },
    ],
  },

  // 4 ─────────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'compare-linear-models',
    skillId: 'g8-compare-linear-models',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        if (idx % 2 === 0) {
          const n = int(r, 4, 15);
          const R2 = int(r, 2, 6); const R1 = R2 + int(r, 1, 5);
          const S1 = int(r, 1, 8) * 5; const S2 = S1 + n * (R1 - R2);
          const swap = int(r, 0, 1) === 1;
          const [a, b] = swap ? [[S2, R2], [S1, R1]] : [[S1, R1], [S2, R2]];
          return { prompt: `Tank A: starts with ${a[0]} liters and gains ${a[1]} liters per minute. Tank B: starts with ${b[0]} liters and gains ${b[1]} liters per minute. After how many minutes will the two tanks hold the same amount of water?`,
            value: n,
            explanation: `Set the amounts equal: ${a[0]} + ${a[1]}t = ${b[0]} + ${b[1]}t. The tanks start ${S2 - S1} liters apart and the gap closes by ${R1 - R2} liters each minute, so t = ${S2 - S1} ÷ ${R1 - R2} = ${n}. The usual slip is dividing by the sum of the rates.` };
        }
        const X = int(r, 3, 12);
        const R1 = int(r, 6, 20); const R2 = int(r, 6, 20);
        const F1 = int(r, 2, 12) * 5; const F2 = int(r, 2, 12) * 5;
        const cA = R1 * X + F1; const cB = R2 * X + F2;
        const d = Math.abs(cA - cB);
        const d2 = Math.abs(F1 - F2);
        if (R1 === R2 || F1 === F2 || d === 0 || d === d2 || (R1 > R2) === (F1 > F2)) return null;
        const win = cA < cB ? 'A' : 'B'; const lose = win === 'A' ? 'B' : 'A';
        const m = mc(r, `Plan ${win}, by $${d}`, [`Plan ${lose}, by $${d}`, `Plan ${F1 < F2 ? 'A' : 'B'}, by $${d2}`, `Plan ${F1 < F2 ? 'B' : 'A'}, by $${d2}`]);
        if (!m) return null;
        return { prompt: `Two plans give the total cost C, in dollars, after m months. Plan A: C = ${R1}m + ${F1}. Plan B: C = ${R2}m + ${F2}. Which plan costs less for ${X} months, and by how much?`,
          ...m,
          explanation: `Plan A: ${R1}(${X}) + ${F1} = ${cA}. Plan B: ${R2}(${X}) + ${F2} = ${cB}. Plan ${win} costs less, by $${d}. Comparing only the starting fees (a $${d2} difference) ignores the monthly rates.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const n = int(r, 4, 12);
        const R2 = int(r, 5, 15); const R1 = R2 + int(r, 2, 8);
        const F1 = int(r, 2, 10) * 5; const F2 = F1 + n * (R1 - R2);
        const swap = int(r, 0, 1) === 1;
        // eq = the plan written as an equation, tb = the plan written as a table (from m = 1).
        const eq = swap ? [F2, R2] : [F1, R1];
        const tb = swap ? [F1, R1] : [F2, R2];
        const rows = [1, 2, 3, 4].map((m) => tb[0] + tb[1] * m);
        const stem = `Two plans give the total cost C, in dollars, after m months. Plan A: C = ${eq[1]}m + ${eq[0]}. Plan B: m: 1, 2, 3, 4; C: ${rows.join(', ')}.`;
        if (idx % 2 === 1) {
          return { prompt: `${stem} After how many months do the two plans cost the same?`,
            value: n,
            explanation: `Plan B goes up ${tb[1]} each month, so it started at ${rows[0]} − ${tb[1]} = ${tb[0]}: C = ${tb[1]}m + ${tb[0]}. Set equal: ${eq[1]}m + ${eq[0]} = ${tb[1]}m + ${tb[0]}, so ${R1 - R2}m = ${F2 - F1} and m = ${n}. The usual slip is using ${rows[0]} (the cost at m = 1) as Plan B's starting fee.` };
        }
        const dR = R1 - R2; const dF = Math.abs(eq[0] - rows[0]);
        if (dR === dF) return null;
        const win = eq[1] > tb[1] ? 'A' : 'B'; const lose = win === 'A' ? 'B' : 'A';
        const m = mc(r, `Plan ${win}, by $${dR} per month`, [`Plan ${lose}, by $${dR} per month`, `Plan ${win}, by $${dF} per month`, `Plan ${lose}, by $${dF} per month`]);
        if (!m) return null;
        return { prompt: `${stem} Which plan has the greater monthly rate, and by how much?`,
          ...m,
          explanation: `Plan A's rate is the coefficient of m: $${eq[1]} per month. Plan B's cost rises ${rows[1]} − ${rows[0]} = $${tb[1]} per month. Plan ${win} is greater by $${dR}. Subtracting ${eq[0]} and ${rows[0]} compares a fee with a first-month cost, not the rates.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const n = int(r, 4, 14);
        const R2 = int(r, 5, 12); const R1 = R2 + int(r, 2, 6);
        const F1 = int(r, 2, 8) * 5; const F2 = F1 + n * (R1 - R2);
        const swap = int(r, 0, 1) === 1;
        const A = swap ? [F2, R2] : [F1, R1];
        const B = swap ? [F1, R1] : [F2, R2];
        if (idx % 2 === 1) {
          const cost = F1 + R1 * n;
          return { prompt: `Two gym plans give the total cost C, in dollars, after m months. Plan A: C = ${A[1]}m + ${A[0]}. Plan B: costs $${B[0]} to join plus $${B[1]} per month. In the month when the two plans have cost the same, what is that total cost, in dollars?`,
            value: cost,
            explanation: `Plan B is C = ${B[1]}m + ${B[0]}. Set equal: ${A[1]}m + ${A[0]} = ${B[1]}m + ${B[0]}, so ${R1 - R2}m = ${F2 - F1} and m = ${n}. Then C = ${A[1]}(${n}) + ${A[0]} = ${cost}. The usual slip is answering with the month, ${n}.` };
        }
        const rows = [1, 2, 3, 4].map((m) => B[0] + B[1] * m);
        // The plan with the HIGHER rate (and lower fee) is cheaper only before the break-even month.
        const aCheaperEarly = A[1] > B[1];
        const opts = [`Only when m is less than ${n}`, `Only when m is greater than ${n}`, 'For every number of months', `Only when m is exactly ${n}`];
        const m = mc(r, aCheaperEarly ? opts[0] : opts[1], opts);
        return { prompt: `Two plans give the total cost C, in dollars, after m months. Plan A: costs $${A[0]} to join plus $${A[1]} per month. Plan B: m: 1, 2, 3, 4; C: ${rows.join(', ')}. For which numbers of months m does Plan A cost LESS than Plan B?`,
          ...m,
          explanation: `Plan A: C = ${A[1]}m + ${A[0]}. Plan B rises ${B[1]} a month from ${rows[0]} − ${B[1]} = ${B[0]}: C = ${B[1]}m + ${B[0]}. They are equal when ${R1 - R2}m = ${F2 - F1}, at m = ${n}. Plan A has the ${aCheaperEarly ? 'lower fee but higher rate, so it is cheaper only before' : 'higher fee but lower rate, so it is cheaper only after'} month ${n}. Judging by the fee alone, or the rate alone, gives "every month".` };
      }) },
    ],
  },

  // 5 ─────────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'function-modeling',
    skillId: 'g8-function-modeling',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const H = int(r, 18, 40); const R = int(r, 2, 5);
          const m = mc(r, `h = ${H} − ${R}t`, [`h = ${H} + ${R}t`, `h = ${R} − ${H}t`, `h = ${H}t − ${R}`]);
          return { prompt: `A candle is ${H} cm tall and burns down ${R} cm every hour. Which equation gives the candle's height h, in cm, after t hours?`,
            ...m,
            explanation: `The initial value is ${H} (the height at t = 0) and the rate of change is −${R} (it gets shorter), so h = ${H} − ${R}t. Swapping the two numbers, or adding when the height is going down, are the usual slips.` };
        }
        if (shape === 1) {
          const x1 = int(r, 1, 3); const x2 = x1 + int(r, 2, 4); const m = int(r, 2, 6); const b = int(r, 3, 12);
          return { prompt: `A plant grows at a steady rate. It is ${m * x1 + b} cm tall after ${x1} weeks and ${m * x2 + b} cm tall after ${x2} weeks. What is its rate of growth, in cm per week?`,
            value: m,
            explanation: `Rate of change = change in height ÷ change in time = (${m * x2 + b} − ${m * x1 + b}) ÷ (${x2} − ${x1}) = ${m * (x2 - x1)} ÷ ${x2 - x1} = ${m}. The usual slip is dividing a height by its week number (${m * x2 + b} ÷ ${x2}), which ignores the starting height.` };
        }
        if (shape === 2) {
          const S = int(r, 12, 60) * 10; const R = int(r, 6, 25);
          const m = mc(r, `g = ${R}t + ${S}`, [`g = ${S}t + ${R}`, `g = ${S} − ${R}t`, `g = ${R + S}t`]);
          return { prompt: `A pool holds ${S} gallons of water and is being filled at ${R} gallons per minute. Which equation gives the number of gallons g in the pool after t minutes?`,
            ...m,
            explanation: `The initial value is ${S} gallons and the rate of change is +${R} gallons per minute, so g = ${R}t + ${S}. The rate is the number multiplied by t; swapping the two numbers is the usual slip.` };
        }
        const s = pick(r, [2, 3, 5]); const m = int(r, 2, 7); const b = int(r, 1, 15);
        const xs = [0, s, 2 * s, 3 * s];
        return { prompt: `A linear function has this table of values. x: ${xs.join(', ')}; y: ${xs.map((x) => m * x + b).join(', ')}. What is the function's rate of change?`,
          value: m,
          explanation: `Each time x goes up ${s}, y goes up ${m * s}, so the rate of change is ${m * s} ÷ ${s} = ${m}. The usual slip is answering ${m * s} — the change in y — without dividing by the change in x.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const shape = idx % 4;
        const s = pick(r, [2, 3]);
        const x1 = int(r, 1, 4);
        const m = shape === 3 ? -int(r, 2, 5) : int(r, 2, 6);
        const b = shape === 3 ? int(r, 40, 70) : int(r, 1, 12);
        const xs = [x1, x1 + s, x1 + 2 * s, x1 + 3 * s];
        const ys = xs.map((x) => m * x + b);
        const stem = `A linear function has this table of values. x: ${xs.join(', ')}; y: ${ys.join(', ')}.`;
        const how = `The rate of change is (${ys[1]} − ${ys[0]}) ÷ (${xs[1]} − ${xs[0]}) = ${m}. Working back from (${xs[0]}, ${ys[0]}): ${ys[0]} − (${m})(${xs[0]}) = ${b}, so y = ${lin(m, b)}.`;
        if (shape === 0) {
          return { prompt: `${stem} What is the function's initial value (the value of y when x = 0)?`, value: b,
            explanation: `${how} The usual slip is giving ${ys[0]}, the first y in the table — but that is the value at x = ${xs[0]}, not at x = 0.` };
        }
        if (shape === 2) {
          const x3 = int(r, 15, 30);
          return { prompt: `${stem} What is the value of y when x = ${x3}?`, value: m * x3 + b,
            explanation: `${how} At x = ${x3}: y = ${m}(${x3}) + ${b} = ${m * x3 + b}. The usual slip is using ${ys[0]} as the y-intercept.` };
        }
        const o = mc(r, `y = ${lin(m, b)}`, [`y = ${lin(m, ys[0])}`, `y = ${lin(m * s, b)}`, `y = ${lin(b, m)}`]);
        if (!o) return null;
        return { prompt: `${stem} Which equation represents the function?`, ...o,
          explanation: `${how} Using ${ys[0]} as the intercept, or using the change in y (${m * s}) as the slope without dividing by ${s}, are the usual slips.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const shape = idx % 4;
        if (shape <= 1) {
          const m = int(r, 2, 4); const b = int(r, 3, 9);
          const x1 = int(r, 2, 5); const x2 = x1 + int(r, 3, 6); const x3 = x2 + int(r, 2, 8);
          const y1 = m * x1 + b; const y2 = m * x2 + b;
          const stem = `A taxi's fare is a linear function of the distance traveled. A ${x1}-mile ride costs $${y1} and a ${x2}-mile ride costs $${y2}.`;
          const how = `Rate: (${y2} − ${y1}) ÷ (${x2} − ${x1}) = $${m} per mile. Starting fee: ${y1} − ${m}(${x1}) = $${b}.`;
          if (shape === 0) {
            return { prompt: `${stem} What does a ${x3}-mile ride cost, in dollars?`, value: m * x3 + b,
              explanation: `${how} So a ${x3}-mile ride costs ${m}(${x3}) + ${b} = $${m * x3 + b}. The usual slip is treating the fare as proportional (${y1} ÷ ${x1} per mile), which ignores the starting fee.` };
          }
          return { prompt: `${stem} What is the starting fee (the fare for 0 miles), in dollars?`, value: b,
            explanation: `${how} The usual slip is stopping at the rate, $${m}, or assuming the fare for 0 miles is $0.` };
        }
        const m = int(r, 2, 8); const t0 = int(r, 12, 30);
        const b = m * t0;
        const x1 = int(r, 2, 5); const x2 = x1 + int(r, 3, 6);
        if (x2 >= t0) return null;
        const y1 = b - m * x1; const y2 = b - m * x2;
        const stem = `Water drains from a tank at a steady rate. The tank holds ${y1} liters after ${x1} minutes and ${y2} liters after ${x2} minutes.`;
        const how = `Rate: (${y2} − ${y1}) ÷ (${x2} − ${x1}) = −${m} liters per minute. Starting amount: ${y1} + ${m}(${x1}) = ${b} liters.`;
        if (shape === 3) {
          return { prompt: `${stem} After how many minutes in all will the tank be empty?`, value: t0,
            explanation: `${how} The tank is empty when ${b} − ${m}t = 0, so t = ${b} ÷ ${m} = ${t0}. The usual slip is dividing ${y1} (not the starting ${b}) by the rate.` };
        }
        const o = mc(r, `V = ${b} − ${m}t`, [`V = ${y1} − ${m}t`, `V = ${b} + ${m}t`, `V = ${b} − ${y1 - y2}t`]);
        if (!o) return null;
        return { prompt: `${stem} Which equation gives the volume V, in liters, after t minutes?`, ...o,
          explanation: `${how} So V = ${b} − ${m}t. Using ${y1} as the starting amount, or using the drop of ${y1 - y2} liters as the rate without dividing by ${x2 - x1} minutes, are the usual slips.` };
      }) },
    ],
  },

  // 6 ─────────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'compare-functions',
    skillId: 'g8-compare-functions',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const m1 = int(r, 2, 9); const m2 = int(r, 2, 9);
        const b1 = int(r, 1, 12); const b2 = int(r, 1, 12);
        if (m1 === m2 || b1 === b2) return null;
        if (idx % 2 === 0) {
          const ys = [0, 1, 2, 3].map((x) => m2 * x + b2);
          return { prompt: `Function A: y = ${lin(m1, b1)}. Function B: x: 0, 1, 2, 3; y: ${ys.join(', ')}. How much greater is the larger of the two rates of change than the smaller?`,
            value: Math.abs(m1 - m2),
            explanation: `Function A's rate of change is the coefficient of x, ${m1}. Function B's y-values go up ${m2} each time x goes up 1, so its rate is ${m2}. The difference is ${Math.abs(m1 - m2)}. The usual slip is reading ${b1} or ${ys[0]} (the y-intercepts) as the rates.` };
        }
        const ys = [1, 2, 3, 4].map((x) => m2 * x + b2);
        return { prompt: `Function A: y = ${lin(m1, b1)}. Function B: x: 1, 2, 3, 4; y: ${ys.join(', ')}. How much greater is the larger of the two y-intercepts than the smaller?`,
          value: Math.abs(b1 - b2),
          explanation: `Function A's y-intercept is ${b1}. Function B goes up ${m2} per step, so at x = 0 it is ${ys[0]} − ${m2} = ${b2}. The difference is ${Math.abs(b1 - b2)}. The usual slip is using ${ys[0]}, the value at x = 1, as B's y-intercept.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const m1 = int(r, 2, 8); const m2 = int(r, 2, 8);
        const b1 = int(r, 1, 15); const b2 = int(r, 1, 15);
        if (m1 === m2 || b1 === b2) return null;
        const x1 = int(r, 1, 3); const s = pick(r, [2, 3]);
        let repB; let howB;
        if (idx % 2 === 0) {
          const xs = [x1, x1 + s, x1 + 2 * s, x1 + 3 * s];
          const ys = xs.map((x) => m2 * x + b2);
          repB = `x: ${xs.join(', ')}; y: ${ys.join(', ')}`;
          howB = `Function B rises ${m2 * s} when x rises ${s}, so its rate is ${m2}; working back from (${xs[0]}, ${ys[0]}), its y-intercept is ${ys[0]} − ${m2}(${xs[0]}) = ${b2}`;
        } else {
          const x2 = x1 + s + 1;
          repB = `its graph is a line that passes through ${pt(x1, m2 * x1 + b2)} and ${pt(x2, m2 * x2 + b2)}`;
          howB = `Function B's slope is (${m2 * x2 + b2} − ${m2 * x1 + b2}) ÷ (${x2} − ${x1}) = ${m2}, and its y-intercept is ${m2 * x1 + b2} − ${m2}(${x1}) = ${b2}`;
        }
        const st = (rw, iw) => `Function ${rw} has the greater rate of change, and Function ${iw} has the greater y-intercept`;
        const opts = [st('A', 'A'), st('A', 'B'), st('B', 'A'), st('B', 'B')];
        const right = st(m1 > m2 ? 'A' : 'B', b1 > b2 ? 'A' : 'B');
        return { prompt: `Function A: y = ${lin(m1, b1)}. Function B: ${repB}. Which statement is true?`,
          ...mcFixed(opts, right),
          explanation: `Function A has rate ${m1} and y-intercept ${b1}. ${howB}. So ${right}. The usual slip is taking B's first listed y-value as its y-intercept.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const s = pick(r, [2, 3]); const x1 = int(r, 1, 3);
        const xs = [x1, x1 + s, x1 + 2 * s, x1 + 3 * s];
        if (idx % 2 === 1) {
          const x0 = int(r, 2, 9); const m1 = K.nonZero(r, -4, 6); const m2 = K.nonZero(r, -4, 6);
          if (m1 === m2) return null;
          const b1 = int(r, -6, 12); const b2 = b1 + (m1 - m2) * x0;
          const ys = xs.map((x) => m2 * x + b2);
          if (xs.includes(x0)) return null;
          return { prompt: `Function A: y = ${lin(m1, b1)}. Function B: x: ${xs.join(', ')}; y: ${ys.map(neg).join(', ')}. Both functions are linear. For what value of x do the two functions have the same y-value?`,
            value: x0,
            explanation: `Function B's rate is (${neg(ys[1])} − ${ys[0] < 0 ? `(${neg(ys[0])})` : ys[0]}) ÷ ${s} = ${neg(m2)} and its y-intercept is ${neg(b2)}, so y = ${lin(m2, b2)}. Set ${lin(m1, b1)} = ${lin(m2, b2)}: x = ${x0}. The usual slip is using ${neg(ys[0])} as B's y-intercept.` };
        }
        const m1 = int(r, 2, 7); const m2 = int(r, 2, 7);
        const b1 = int(r, 1, 20); const b2 = int(r, 1, 20);
        const k = int(r, 10, 20);
        const ys = xs.map((x) => m2 * x + b2);
        const vA = m1 * k + b1; const vB = m2 * k + b2; const vBwrong = m2 * k + ys[0];
        const d = Math.abs(vA - vB); const d2 = Math.abs(vA - vBwrong);
        if (m1 === m2 || d === 0 || d2 === 0 || d === d2) return null;
        const win = vA > vB ? 'A' : 'B'; const lose = win === 'A' ? 'B' : 'A';
        const o = mc(r, `Function ${win}, by ${d}`, [`Function ${lose}, by ${d}`, `Function ${vA > vBwrong ? 'A' : 'B'}, by ${d2}`, `Function ${vA > vBwrong ? 'B' : 'A'}, by ${d2}`]);
        if (!o) return null;
        return { prompt: `Function A: y = ${lin(m1, b1)}. Function B: x: ${xs.join(', ')}; y: ${ys.join(', ')}. Both functions are linear. Which function has the greater value when x = ${k}, and by how much?`,
          ...o,
          explanation: `A(${k}) = ${m1}(${k}) + ${b1} = ${vA}. Function B has rate ${m2 * s} ÷ ${s} = ${m2} and y-intercept ${ys[0]} − ${m2}(${xs[0]}) = ${b2}, so B(${k}) = ${m2}(${k}) + ${b2} = ${vB}. Function ${win} is greater by ${d}. Using ${ys[0]} as B's y-intercept gives a difference of ${d2}.` };
      }) },
    ],
  },

  // 7 ─────────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'interpret-slope-intercept',
    skillId: 'g8-interpret-slope-intercept',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const c = INC[idx % 4];
        const m = int(r, c.m[0] / c.step, c.m[1] / c.step) * c.step;
        const b = int(r, c.b[0] / c.step, c.b[1] / c.step) * c.step;
        if (m === b || String(b).includes(String(m)) || String(m).includes(String(b))) return null;
        const slope = idx % 2 === 0;
        const o = slope
          ? mc(r, c.rate(m), [c.start(m), c.rate(b), c.total(m)])
          : mc(r, c.start(b), [c.rate(b), c.start(m), c.total(b)]);
        return { prompt: `${c.intro(m, b)} What does the ${slope ? m : b} represent in this situation?`,
          ...o,
          explanation: slope
            ? `${m} is the slope — the number multiplied by the variable — so it is the change for each 1 unit: ${c.rate(m)}. The ${b} is the starting value. Mixing up the two is the usual slip.`
            : `${b} is the y-intercept — the value when the variable is 0 — so it is the starting amount: ${c.start(b)}. The ${m} is the rate. Mixing up the two is the usual slip.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const c = pick(r, DEC);
        const m = int(r, c.m[0], c.m[1]);
        const b = m * int(r, Math.ceil(c.b[0] / m), Math.floor(c.b[1] / m));
        if (b / m === m || String(b).includes(String(m))) return null;
        const shape = idx % 4;
        if (shape === 1 || shape === 3) {
          const o = mc(r, c.units[0], c.units.slice(1));
          return { prompt: `${c.intro(m, b)} What are the units of the slope of this model?`,
            ...o,
            explanation: `Slope is change in the output divided by change in the input, so its units are output units per input unit: ${c.units[0]}. Giving only "${c.units[2]}" names the units of the output, not of the rate.` };
        }
        if (shape === 0) {
          const o = mc(r, c.down(m), [c.up(m), c.start(m), c.end(m)]);
          return { prompt: `${c.intro(m, b)} What does the ${m} represent in this situation?`,
            ...o,
            explanation: `The ${m} is multiplied by the variable and subtracted, so the slope is −${m}: ${c.down(m)}. Ignoring the minus sign, or reading ${m} as a starting or ending value, are the usual slips.` };
        }
        const o = mc(r, c.start(b), [c.down(b), c.end(b), c.up(b)]);
        return { prompt: `${c.intro(m, b)} What does the ${b} represent in this situation?`,
          ...o,
          explanation: `${b} is the value of the model when the variable is 0 — the y-intercept: ${c.start(b)}. It is not a rate (that is the ${m}) and not when the model reaches 0 (that happens at ${b} ÷ ${m} = ${b / m}).` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        if (idx % 2 === 0) {
          const c = INC[(idx / 2 + int(r, 0, 1) * 2) % 4];
          const m = int(r, c.m[0] / c.step, c.m[1] / c.step) * c.step;
          const b = int(r, c.b[0] / c.step, c.b[1] / c.step) * c.step;
          const k = int(r, 3, 8);
          if (m === b) return null;
          return { prompt: `${c.intro(m, b)} ${c.change(k)}`,
            value: m * k,
            explanation: `The slope ${m} is the change for each 1 unit, so ${k} units changes the total by ${m} × ${k} = ${m * k}. The ${b} is a one-time starting amount and does not repeat — adding it (${m * k + b}) is the usual slip.` };
        }
        const plumber = idx === 1;
        const m1 = plumber ? int(r, 8, 16) * 5 : int(r, 2, 4);
        const b1 = plumber ? int(r, 4, 12) * 5 : int(r, 4, 9);
        const up = plumber ? int(r, 1, 4) * 5 : int(r, 1, 3);
        const kase = int(r, 0, 3);
        const m2 = kase === 0 ? m1 : kase === 3 ? m1 - (plumber ? 5 : 1) : m1 + up;
        const b2 = kase === 0 || kase === 2 ? b1 + up : b1;
        if (new Set([m1, b1, m2, b2]).size < 3) return null;
        const [who, rate, fee, v, unit] = plumber
          ? ['Plumber', 'hourly rate', 'flat fee', 'h', 'the total charge in dollars for h hours of work']
          : ['Taxi company', 'charge per mile', 'starting fee', 'd', 'the total fare in dollars for a ride of d miles'];
        const opts = [
          `${who} B has the same ${rate} as ${who} A but a higher ${fee}`,
          `${who} B has a higher ${rate} than ${who} A but the same ${fee}`,
          `${who} B has a higher ${rate} and a higher ${fee} than ${who} A`,
          `${who} B has a lower ${rate} than ${who} A but the same ${fee}`,
        ];
        const o = mc(r, opts[kase], opts);
        return { prompt: `${who} A's charge is modeled by C = ${m1}${v} + ${b1} and ${who} B's by C = ${m2}${v} + ${b2}, where C is ${unit}. Which statement is true?`,
          ...o,
          explanation: `The number multiplied by ${v} is the ${rate}: ${m1} for A and ${m2} for B. The number added is the ${fee}: ${b1} for A and ${b2} for B. So ${opts[kase]}. Reading the added number as the rate is the usual slip.` };
      }) },
    ],
  },

  // 8 ─────────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'systems-graphing',
    skillId: 'g8-systems-graphing',
    tiers: [
      { difficulty: 2, gen: retry((r) => {
        const x0 = K.nonZero(r, -5, 5); const y0 = K.nonZero(r, -8, 8);
        const m1 = K.nonZero(r, -3, 4); const m2 = K.nonZero(r, -3, 4);
        if (m1 === m2 || Math.abs(x0) === Math.abs(y0)) return null;
        const b1 = y0 - m1 * x0; const b2 = y0 - m2 * x0;
        const o = mc(r, pt(x0, y0), [pt(y0, x0), pt(0, b1), pt(-x0, y0)]);
        if (!o) return null;
        return { prompt: `The lines y = ${lin(m1, b1)} and y = ${lin(m2, b2)} are graphed on the same coordinate plane. At which point do the two lines intersect?`,
          ...o,
          explanation: `The intersection is the point that makes BOTH equations true. At x = ${neg(x0)}: ${neg(m1)}(${neg(x0)}) ${K.signed(b1)} = ${neg(y0)} and ${neg(m2)}(${neg(x0)}) ${K.signed(b2)} = ${neg(y0)}, so it is ${pt(x0, y0)}. ${pt(0, b1)} is only the first line's y-intercept, and ${pt(y0, x0)} has the coordinates reversed.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        if (idx % 2 === 0) {
          const m = K.nonZero(r, -4, 5); const b1 = int(r, -8, 8); const b2 = int(r, -8, 8);
          const k = pick(r, [2, 3]);
          const kase = idx === 0 ? pick(r, ['par', 'one']) : pick(r, ['same', 'parDisguised']);
          if (b1 === b2 || Math.abs(m) === 1) return null;
          const second = { par: `y = ${lin(m, b2)}`, one: `y = ${lin(-m, b1)}`, same: `${k}y = ${lin(k * m, k * b1)}`, parDisguised: `${k}y = ${lin(k * m, k * b2)}` }[kase];
          const opts = ['No solution', 'Exactly one solution', 'Exactly two solutions', 'Infinitely many solutions'];
          const right = { par: opts[0], parDisguised: opts[0], one: opts[1], same: opts[3] }[kase];
          const why = {
            par: `Both lines have slope ${neg(m)} but different y-intercepts (${neg(b1)} and ${neg(b2)}), so they are parallel and never meet: no solution.`,
            parDisguised: `Divide the second equation by ${k}: y = ${lin(m, b2)}. Same slope ${neg(m)}, different y-intercepts (${neg(b1)} and ${neg(b2)}): parallel lines, no solution.`,
            one: `The slopes are different (${neg(m)} and ${neg(-m)}), so the lines cross exactly once — here at their shared y-intercept (0, ${neg(b1)}).`,
            same: `Divide the second equation by ${k}: y = ${lin(m, b1)}. It is the same line as the first, so every point on it is a solution: infinitely many.`,
          }[kase];
          return { prompt: `How many solutions does this system of equations have?  y = ${lin(m, b1)}  and  ${second}`,
            ...mcFixed(opts, right),
            explanation: `${why} Two different straight lines can never cross exactly twice.` };
        }
        const p = K.nonZero(r, -5, 5); const q = int(r, -8, 8);
        const m1 = K.nonZero(r, -3, 4); const m2 = K.nonZero(r, -3, 4);
        if (m1 === m2) return null;
        const kase = pick(r, ['both', 'first', 'second', 'neither']);
        const on1 = kase === 'both' || kase === 'first'; const on2 = kase === 'both' || kase === 'second';
        const b1 = q - m1 * p + (on1 ? 0 : K.nonZero(r, -3, 3));
        const b2 = q - m2 * p + (on2 ? 0 : K.nonZero(r, -3, 3));
        const opts = { both: 'Yes, it lies on both lines', first: 'No, it lies only on the first line', second: 'No, it lies only on the second line', neither: 'No, it lies on neither line' };
        const o = mc(r, opts[kase], Object.values(opts));
        return { prompt: `Is ${pt(p, q)} the solution of this system?  First line: y = ${lin(m1, b1)}.  Second line: y = ${lin(m2, b2)}.`,
          ...o,
          explanation: `Substitute x = ${neg(p)}. First line: ${neg(m1)}(${neg(p)}) ${K.signed(b1)} = ${neg(m1 * p + b1)}, which ${on1 ? 'equals' : 'is not'} ${neg(q)}. Second line: ${neg(m2)}(${neg(p)}) ${K.signed(b2)} = ${neg(m2 * p + b2)}, which ${on2 ? 'equals' : 'is not'} ${neg(q)}. A solution must lie on BOTH lines — checking only one equation is the usual slip.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const x0 = K.nonZero(r, -5, 5); const y0 = K.nonZero(r, -8, 8);
        const m1 = K.nonZero(r, -3, 4);
        if (idx % 2 === 1) {
          const m2 = K.nonZero(r, -3, 4);
          if (m1 === m2) return null;
          const b1 = y0 - m1 * x0; const k = y0 - m2 * x0;
          if (k === b1) return null;
          return { prompt: `The lines y = ${lin(m1, b1)} and y = ${lin(m2, 0)} + k intersect at a point whose x-coordinate is ${neg(x0)}. What is the value of k?`,
            value: k,
            explanation: `On the first line, x = ${neg(x0)} gives y = ${neg(m1)}(${neg(x0)}) ${K.signed(b1)} = ${neg(y0)}. The second line passes through the same point: ${neg(y0)} = ${neg(m2)}(${neg(x0)}) + k, so k = ${neg(y0)} − (${neg(m2 * x0)}) = ${neg(k)}. The usual slip is stopping at y = ${neg(y0)}.` };
        }
        const A = K.nonZero(r, -3, 4); const B = pick(r, [1, 2]);
        if (-A / B === m1 || Math.abs(x0) === Math.abs(y0)) return null;
        const C = A * x0 + B * y0;
        const b1 = y0 - m1 * x0;
        const second = `${lin(A, 0)} ${B === 1 ? '+ y' : `+ ${B}y`} = ${neg(C)}`;
        // (0, C/B)-style slip: the second line's intercept; fall back to the first line's.
        const o = mc(r, pt(x0, y0), [pt(y0, x0), pt(0, b1), pt(-x0, y0), pt(x0, -y0)]);
        if (!o) return null;
        return { prompt: `The lines y = ${lin(m1, b1)} and ${second} are graphed on the same coordinate plane. At which point do the two lines intersect?`,
          ...o,
          explanation: `The intersection must satisfy both equations. ${pt(x0, y0)}: ${neg(m1)}(${neg(x0)}) ${K.signed(b1)} = ${neg(y0)} ✓ and ${neg(A)}(${neg(x0)}) + ${B}(${neg(y0)}) = ${neg(C)} ✓. Each other choice fails at least one equation — test a point in BOTH before choosing it.` };
      }) },
    ],
  },

  // 9 ─────────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'transformations',
    skillId: 'g8-transformations',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const a = K.nonZero(r, -8, 8); const b = K.nonZero(r, -8, 8);
        if (Math.abs(a) === Math.abs(b)) return null;
        const shape = idx % 4;
        if (shape === 0 || shape === 2) {
          const h = K.nonZero(r, -7, 7); const k = K.nonZero(r, -7, 7);
          if (h === k) return null;
          const move = `${nUnits(h)} ${h > 0 ? 'right' : 'left'} and ${nUnits(k)} ${k > 0 ? 'up' : 'down'}`;
          if (shape === 2) {
            const wantX = int(r, 0, 1) === 0;
            return { prompt: `Point P${pt(a, b)} is translated ${move}. What is the ${wantX ? 'x' : 'y'}-coordinate of its image P′?`,
              value: wantX ? a + h : b + k,
              explanation: `Left/right changes x and up/down changes y: P′ = (${neg(a)} ${K.signed(h)}, ${neg(b)} ${K.signed(k)}) = ${pt(a + h, b + k)}. Moving left or down SUBTRACTS — a sign slip there is the usual mistake.` };
          }
          const o = mc(r, pt(a + h, b + k), [pt(a - h, b - k), pt(a + k, b + h), pt(a - h, b + k)]);
          if (!o) return null;
          return { prompt: `Point P${pt(a, b)} is translated ${move}. What are the coordinates of its image P′?`,
            ...o,
            explanation: `Left/right changes x and up/down changes y: P′ = (${neg(a)} ${K.signed(h)}, ${neg(b)} ${K.signed(k)}) = ${pt(a + h, b + k)}. Adding when the move is left or down, or applying the horizontal move to y, are the usual slips.` };
        }
        const overX = shape === 1;
        const o = mc(r, overX ? pt(a, -b) : pt(-a, b), [overX ? pt(-a, b) : pt(a, -b), pt(-a, -b), pt(b, a)]);
        return { prompt: `Point P${pt(a, b)} is reflected over the ${overX ? 'x' : 'y'}-axis. What are the coordinates of its image P′?`,
          ...o,
          explanation: `Reflecting over the ${overX ? 'x' : 'y'}-axis keeps the ${overX ? 'x' : 'y'}-coordinate and changes the sign of the ${overX ? 'y' : 'x'}-coordinate: ${pt(a, b)} → ${overX ? pt(a, -b) : pt(-a, b)}. Changing the wrong coordinate (the one named by the axis) is the usual slip.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const a = K.nonZero(r, -8, 8); const b = K.nonZero(r, -8, 8);
        if (Math.abs(a) === Math.abs(b)) return null;
        const ccw90 = pt(-b, a); const half = pt(-a, -b); const cw90 = pt(b, -a); const swap = pt(b, a);
        const kinds = [
          { text: '90° counterclockwise', right: ccw90, rule: '(x, y) → (−y, x)' },
          { text: '180°', right: half, rule: '(x, y) → (−x, −y)' },
          { text: '90° clockwise', right: cw90, rule: '(x, y) → (y, −x)' },
          { text: '270° counterclockwise', right: cw90, rule: '(x, y) → (y, −x), the same as 90° clockwise' },
        ];
        const k = kinds[idx % 4];
        const o = mc(r, k.right, [ccw90, half, cw90, swap]);
        return { prompt: `Point P${pt(a, b)} is rotated ${k.text} about the origin. What are the coordinates of its image P′?`,
          ...o,
          explanation: `A rotation of ${k.text} about the origin follows ${k.rule}, so ${pt(a, b)} → ${k.right}. The usual slips are turning the wrong way or just swapping the coordinates without changing a sign.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const a = K.nonZero(r, -7, 7); const b = K.nonZero(r, -7, 7);
        if (Math.abs(a) === Math.abs(b)) return null;
        if (idx % 2 === 0) {
          const h = K.nonZero(r, -6, 6); const k = K.nonZero(r, -6, 6);
          const overX = idx === 0;
          const move = `${nUnits(h)} ${h > 0 ? 'right' : 'left'} and ${nUnits(k)} ${k > 0 ? 'up' : 'down'}`;
          const mid = overX ? [a, -b] : [-a, b];
          const right = pt(mid[0] + h, mid[1] + k);
          const wrongOrder = overX ? pt(a + h, -(b + k)) : pt(-(a + h), b + k);
          const wrongAxis = overX ? pt(-a + h, b + k) : pt(a + h, -b + k);
          const o = mc(r, right, [wrongOrder, wrongAxis, pt(a + h, b + k)]);
          if (!o) return null;
          return { prompt: `Point P${pt(a, b)} is reflected over the ${overX ? 'x' : 'y'}-axis, and then the result is translated ${move}. What are the coordinates of the final image?`,
            ...o,
            explanation: `Reflect first: ${pt(a, b)} → ${pt(mid[0], mid[1])}. Then translate: (${neg(mid[0])} ${K.signed(h)}, ${neg(mid[1])} ${K.signed(k)}) = ${right}. Doing the steps in the other order gives ${wrongOrder} — order matters.` };
        }
        const rot = pick(r, [
          { text: '90° clockwise', f: ([x, y]) => [y, -x] },
          { text: '90° counterclockwise', f: ([x, y]) => [-y, x] },
          { text: '180°', f: ([x, y]) => [-x, -y] },
        ]);
        const ref = pick(r, [
          { text: 'x-axis', f: ([x, y]) => [x, -y] },
          { text: 'y-axis', f: ([x, y]) => [-x, y] },
        ]);
        const mid = rot.f([a, b]); const end = ref.f(mid);
        const wantX = idx === 1;
        return { prompt: `Point P${pt(a, b)} is rotated ${rot.text} about the origin, and then the result is reflected over the ${ref.text}. What is the ${wantX ? 'x' : 'y'}-coordinate of the final image?`,
          value: wantX ? end[0] : end[1],
          explanation: `Rotate ${rot.text}: ${pt(a, b)} → ${pt(mid[0], mid[1])}. Reflect over the ${ref.text}: → ${pt(end[0], end[1])}. The ${wantX ? 'x' : 'y'}-coordinate is ${neg(wantX ? end[0] : end[1])}. Rotating the wrong direction, or reflecting before rotating, are the usual slips.` };
      }) },
    ],
  },

  // 10 ────────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'congruence-similarity',
    skillId: 'g8-congruence-similarity',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const shape = idx % 4;
        if (shape === 0 || shape === 3) {
          const half = shape === 3;
          const k = half ? 2 : int(r, 2, 5);
          const a = K.nonZero(r, -6, 6) * (half ? 2 : 1); const b = K.nonZero(r, -6, 6) * (half ? 2 : 1);
          if (a === b) return null;
          const img = half ? [a / 2, b / 2] : [a * k, b * k];
          const o = mc(r, pt(img[0], img[1]), half
            ? [pt(a * 2, b * 2), pt(a - 2, b - 2), pt(a / 2, b)]
            : [pt(a + k, b + k), pt(a * k, b), pt(a, b * k)]);
          if (!o) return null;
          return { prompt: `Point A${pt(a, b)} is dilated about the origin with a scale factor of ${half ? '1/2' : k}. What are the coordinates of its image A′?`,
            ...o,
            explanation: `A dilation about the origin MULTIPLIES both coordinates by the scale factor: ${pt(a, b)} → ${pt(img[0], img[1])}. ${half ? 'Multiplying by 2 uses the wrong direction — a scale factor less than 1 shrinks.' : `Adding ${k} to each coordinate is a translation, not a dilation.`}` };
        }
        if (shape === 1) {
          const s = int(r, 3, 9); const k = int(r, 2, 5);
          return { prompt: `Triangle ABC is similar to triangle DEF. Side AB is ${s} cm long and its corresponding side DE is ${s * k} cm long. What is the scale factor from triangle ABC to triangle DEF?`,
            value: k,
            explanation: `Scale factor = image length ÷ original length = ${s * k} ÷ ${s} = ${k}. Subtracting the lengths (${s * k - s}) is the usual slip — similar shapes are related by multiplying, not adding.` };
        }
        const k = pick(r, [2, 3, 4]);
        const opts = shuffle(r, [
          `A translation ${int(r, 2, 9)} units ${pick(r, ['left', 'right', 'up', 'down'])}`,
          `A reflection over the ${pick(r, ['x', 'y'])}-axis`,
          `A rotation of ${pick(r, ['90°', '180°'])} about the origin`,
          `A dilation about the origin with a scale factor of ${k}`,
        ]);
        const right = opts.find((o) => o.startsWith('A dilation'));
        return { prompt: `A triangle is transformed in four different ways. Which transformation produces an image that is NOT congruent to the original triangle?`,
          ...mcFixed(opts, right),
          explanation: `Translations, reflections and rotations are rigid motions: they keep every side length and angle, so the image is congruent. A dilation with scale factor ${k} multiplies every side by ${k}, so the image is similar but not congruent.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const shape = idx % 4;
        if (shape === 0 || shape === 3) {
          const [p, q] = pick(r, [[3, 2], [5, 2], [4, 3], [5, 3], [5, 4], [7, 4]]);
          const t1 = int(r, 2, 6); const t2 = int(r, 2, 6);
          if (t1 === t2) return null;
          const ab = q * t1; const de = p * t1; const bc = q * t2; const ef = p * t2;
          if (shape === 0) {
            return { prompt: `Triangle ABC is similar to triangle DEF, with AB corresponding to DE and BC corresponding to EF. AB = ${ab}, BC = ${bc} and DE = ${de}. What is the length of EF?`,
              value: ef,
              explanation: `Corresponding sides are proportional: EF ÷ ${bc} = ${de} ÷ ${ab}, so EF = ${bc} × ${de} ÷ ${ab} = ${ef}. Adding the difference ${de} − ${ab} = ${de - ab} to ${bc} is the usual slip — similarity multiplies.` };
          }
          return { prompt: `A ${bc}-foot pole casts a shadow ${ab} feet long. At the same time, a tree casts a shadow ${de} feet long. The pole and the tree form similar right triangles with their shadows. How tall is the tree, in feet?`,
            value: ef,
            explanation: `Height ÷ shadow is the same for both: tree ÷ ${de} = ${bc} ÷ ${ab}, so tree = ${de} × ${bc} ÷ ${ab} = ${ef} feet. Matching a height with the wrong shadow, or adding instead of scaling, are the usual slips.` };
        }
        if (shape === 2) {
          const [p, q] = pick(r, [[2, 3], [3, 4], [2, 5], [3, 5], [4, 5], [5, 2], [3, 2], [4, 3]]);
          const t = int(r, 2, 6);
          return { prompt: `Triangle ABC is similar to triangle DEF. Side AB is ${q * t} cm long and its corresponding side DE is ${p * t} cm long. What is the scale factor from triangle ABC to triangle DEF? Give your answer as a fraction in lowest terms.`,
            value: K.frac(p, q),
            explanation: `Scale factor = new length ÷ original length = ${p * t} ÷ ${q * t} = ${K.frac(p, q)}. Dividing the other way round (${K.frac(q, p)}) gives the factor from DEF back to ABC — the usual slip.` };
        }
        const a = int(r, 6, 16) * 5; const b = int(r, 6, 16) * 5;
        const c = 180 - a - b;
        if (a === b || c < 25 || c === a || c === b) return null;
        const similar = int(r, 0, 1) === 1;
        const second = similar ? c : c + pick(r, [-10, -5, 5, 10]);
        if (second === a || second === b || second <= 0 || b + second >= 180) return null;
        const Y = 'Yes — the two triangles have the same three angle measures';
        const N = 'No — the two triangles do not have the same angle measures';
        const Y2 = 'Yes — any two triangles that share one angle measure are similar';
        const N2 = 'No — triangles can only be shown similar by measuring their sides';
        const o = mc(r, similar ? Y : N, [Y, N, Y2, N2]);
        return { prompt: `Triangle PQR has angles that measure ${a}° and ${b}°. Triangle XYZ has angles that measure ${b}° and ${second}°. Are the two triangles similar?`,
          ...o,
          explanation: `Find each third angle. PQR: 180 − ${a} − ${b} = ${c}°. XYZ: 180 − ${b} − ${second} = ${180 - b - second}°. ${similar ? `Both triangles have angles ${a}°, ${b}°, ${c}°, so they are similar (AA).` : `PQR has ${a}°, ${b}°, ${c}° but XYZ has ${b}°, ${second}°, ${180 - b - second}° — only one angle matches, so they are not similar.`} Deciding before finding the third angle is the usual slip.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const k = pick(r, [2, 3, '1/2']);
          const opts = shuffle(r, [
            `A reflection over the x-axis, then a translation ${int(r, 2, 8)} units up`,
            `A rotation of 180° about the origin, then a reflection over the y-axis`,
            `A dilation about the origin with a scale factor of ${k}, then a translation ${int(r, 2, 8)} units right`,
            `A translation ${int(r, 2, 8)} units left, then a rotation of 90° clockwise about the origin`,
          ]);
          const right = opts.find((o) => o.startsWith('A dilation'));
          return { prompt: `Which sequence of transformations maps a triangle onto an image that is similar to it but NOT congruent to it?`,
            ...mcFixed(opts, right),
            explanation: `Reflections, rotations and translations are rigid motions, so any sequence of them gives a congruent image. Only the sequence containing a dilation (scale factor ${k}) changes the side lengths, giving a similar but not congruent image.` };
        }
        if (shape === 1) {
          const [p, q] = pick(r, [[3, 2], [5, 2], [1, 2], [3, 1], [4, 1]]);
          const [x, y, z] = pick(r, TRIPLES.slice(0, 5)).map((s) => s * q);
          const per = (x + y + z) * p / q;
          return { prompt: `A triangle with side lengths ${x}, ${y} and ${z} is dilated with a scale factor of ${K.frac(p, q)}. What is the perimeter of the image?`,
            value: per,
            explanation: `A dilation multiplies every length — and so the perimeter — by the scale factor. The original perimeter is ${x + y + z}, so the image's is ${x + y + z} × ${K.frac(p, q)} = ${per}. Squaring the scale factor applies to area, not perimeter.` };
        }
        if (shape === 2) {
          const [p, q] = pick(r, [[3, 2], [5, 2], [1, 2], [3, 1], [2, 1]]);
          const ax = K.nonZero(r, 1, 4) * q; const ay = K.nonZero(r, -4, 4) * q;
          const bx = K.nonZero(r, -4, 4) * q; const by = K.nonZero(r, 1, 4) * q;
          if (ax === bx && ay === by) return null;
          const k = (n) => n * p / q;
          const o = mc(r, pt(k(bx), k(by)), [pt(bx + k(ax) - ax, by + k(ay) - ay), pt(k(bx), by), pt(bx, k(by))]);
          if (!o) return null;
          return { prompt: `Two vertices of triangle ABC are A${pt(ax, ay)} and B${pt(bx, by)}. The triangle is dilated about the origin, and the image of A is A′${pt(k(ax), k(ay))}. What are the coordinates of B′, the image of B?`,
            ...o,
            explanation: `The scale factor is ${neg(k(ax))} ÷ ${neg(ax)} = ${K.frac(p, q)}. Multiply B's coordinates by it: ${pt(bx, by)} → ${pt(k(bx), k(by))}. Adding what was added to A (a translation) is the usual slip — a dilation multiplies.` };
        }
        const [p, q] = pick(r, [[3, 2], [5, 2], [4, 3], [5, 3], [5, 4]]);
        const t = int(r, 2, 6);
        const ab = q * int(r, 2, 5); const de = ab * p / q;
        const x = q * t; const diff = (p - q) * t;
        if (ab === x) return null;
        return { prompt: `Triangle ABC is similar to triangle DEF, with AB corresponding to DE and BC corresponding to EF. AB = ${ab}, DE = ${de}, BC = x and EF = x + ${diff}. What is the value of x?`,
          value: x,
          explanation: `Corresponding sides are proportional: x ÷ ${ab} = (x + ${diff}) ÷ ${de}. Cross-multiply: ${de}x = ${ab}x + ${ab * diff}, so ${de - ab}x = ${ab * diff} and x = ${x}. Setting x + ${diff} = ${de} (matching EF with DE) is the usual slip.` };
      }) },
    ],
  },

  // 11 ────────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'distance-coordinate',
    skillId: 'g8-distance-coordinate',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const [a, b, c] = pick(r, TRIPLES.slice(0, 5));
        const [dx, dy] = idx % 2 === 0 ? [a, b] : [b, a];
        const x1 = int(r, 1, 6); const y1 = int(r, 1, 6);
        return { prompt: `What is the distance between the points ${pt(x1, y1)} and ${pt(x1 + dx, y1 + dy)} on the coordinate plane?`,
          value: c,
          explanation: `The horizontal change is ${dx} and the vertical change is ${dy}; they are the legs of a right triangle. Distance = √(${dx}² + ${dy}²) = √${dx * dx + dy * dy} = ${c}. Adding the legs (${dx + dy}) is the usual slip.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        const [a, b, c] = pick(r, TRIPLES);
        const dx = (idx % 2 === 0 ? a : b) * pick(r, [-1, 1]); const dy = (idx % 2 === 0 ? b : a) * pick(r, [-1, 1]);
        const x1 = dx > 0 ? -int(r, 1, Math.min(6, dx - 1)) : int(r, 1, Math.min(6, -dx - 1));
        const y1 = dy > 0 ? -int(r, 1, Math.min(6, dy - 1)) : int(r, 1, Math.min(6, -dy - 1));
        const p1 = pt(x1, y1); const p2 = pt(x1 + dx, y1 + dy);
        const prompt = idx < 2
          ? `What is the distance between the points ${p1} and ${p2} on the coordinate plane?`
          : `On a map grid where each unit is 1 km, the library is at ${p1} and the school is at ${p2}. What is the straight-line distance between them, in km?`;
        return { prompt, value: c,
          explanation: `Horizontal change: ${neg(x1 + dx)} − (${neg(x1)}) = ${neg(dx)}; vertical change: ${neg(y1 + dy)} − (${neg(y1)}) = ${neg(dy)}. Distance = √(${Math.abs(dx)}² + ${Math.abs(dy)}²) = √${dx * dx + dy * dy} = ${c}. Subtracting a negative coordinate wrongly (getting too short a leg) is the usual slip.` };
      } },
      { difficulty: 4, gen: retry((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const [a, b, c] = pick(r, TRIPLES);
          const x = int(r, -6, 3); const y = int(r, -6, 3);
          return { prompt: `A triangle has vertices A${pt(x, y)}, B${pt(x + a, y)} and C${pt(x, y + b)}. What is the perimeter of the triangle?`,
            value: a + b + c,
            explanation: `AB is horizontal with length ${a}; AC is vertical with length ${b}. BC is the hypotenuse: √(${a}² + ${b}²) = ${c}. Perimeter = ${a} + ${b} + ${c} = ${a + b + c}. Leaving out the slanted side is the usual slip.` };
        }
        if (shape === 1) {
          const dx = int(r, 1, 6); const dy = int(r, 1, 6);
          const s = dx * dx + dy * dy;
          if (isSquare(s) || dx === dy || K.largestSquareFactor(s) !== 1) return null;
          const x1 = int(r, -5, 2); const y1 = int(r, -5, 2);
          const o = mc(r, `√${s}`, [`${dx + dy}`, `${s}`, `√${dx + dy}`]);
          if (!o) return null;
          return { prompt: `What is the exact distance between the points ${pt(x1, y1)} and ${pt(x1 + dx, y1 + dy)}?`,
            ...o,
            explanation: `The legs are ${dx} and ${dy}, so the distance is √(${dx}² + ${dy}²) = √${s}. Adding the legs (${dx + dy}), forgetting the square root (${s}), or forgetting to square (√${dx + dy}) are the usual slips.` };
        }
        if (shape === 2) {
          const [a, b, c] = pick(r, TRIPLES);
          const x1 = int(r, -5, 4); const y1 = int(r, -5, 4);
          return { prompt: `The distance between the points ${pt(x1, y1)} and (x, ${neg(y1 + b)}) is ${c}, and x is greater than ${neg(x1)}. What is the value of x?`,
            value: x1 + a,
            explanation: `The vertical change is ${neg(y1 + b)} − (${neg(y1)}) = ${b}. The horizontal change h satisfies h² + ${b}² = ${c}², so h² = ${c * c - b * b} and h = ${a}. Since x is greater than ${neg(x1)}, x = ${neg(x1)} + ${a} = ${neg(x1 + a)}. Giving h itself is the usual slip.` };
        }
        const [a, b, c] = pick(r, TRIPLES.slice(0, 5));
        return { prompt: `A triangle has vertices A${pt(-a, 0)}, B${pt(a, 0)} and C${pt(0, b)}. What is the perimeter of the triangle?`,
          value: 2 * a + 2 * c,
          explanation: `AB lies on the x-axis with length ${2 * a}. AC and BC each have legs ${a} and ${b}, so each is √(${a}² + ${b}²) = ${c}. Perimeter = ${2 * a} + ${c} + ${c} = ${2 * a + 2 * c}. Using ${b} (the height) as a side length is the usual slip.` };
      }) },
    ],
  },

  // 12 ────────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'volume-cylinders',
    skillId: 'g8-volume-cylinders',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const rad = int(r, 3, 9); const h = int(r, 2, 12); const u = pick(r, UNITS);
        if (rad === h) return null;
        const v = rad * rad * h;
        if (idx % 2 === 1) {
          return { prompt: `A cylinder has a radius of ${rad} ${u} and a height of ${h} ${u}. Use 3.14 for π. What is its volume, in ${u}³? Give your answer as a decimal.`,
            value: dec100(314 * v),
            explanation: `V = πr²h = 3.14 × ${rad}² × ${h} = 3.14 × ${v} = ${dec100(314 * v)}. Forgetting to square the radius (3.14 × ${rad} × ${h}) is the usual slip.` };
        }
        const o = mc(r, piText(v), [piText(2 * rad * h), piText(rad * h), piText(rad * h * h)]);
        if (!o) return null;
        return { prompt: `A cylinder has a radius of ${rad} ${u} and a height of ${h} ${u}. What is its volume, in ${u}³, in terms of π?`,
          ...o,
          explanation: `V = πr²h = π × ${rad}² × ${h} = ${piText(v)}. ${piText(2 * rad * h)} comes from 2πrh (the side area), ${piText(rad * h)} from not squaring the radius, and ${piText(rad * h * h)} from squaring the height instead.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const rad = int(r, 2, 8); const h = int(r, 3, 12); const u = pick(r, UNITS);
        const d = 2 * rad; const v = rad * rad * h;
        if (idx % 2 === 1) {
          return { prompt: `A cylinder has a diameter of ${d} ${u} and a height of ${h} ${u}. Use 3.14 for π. What is its volume, in ${u}³? Give your answer as a decimal.`,
            value: dec100(314 * v),
            explanation: `The radius is half the diameter: ${d} ÷ 2 = ${rad}. V = 3.14 × ${rad}² × ${h} = 3.14 × ${v} = ${dec100(314 * v)}. Using the diameter ${d} as the radius gives an answer four times too large.` };
        }
        const o = mc(r, piText(v), [piText(d * d * h), piText(d * h), piText(rad * h)]);
        if (!o) return null;
        return { prompt: `A cylinder has a diameter of ${d} ${u} and a height of ${h} ${u}. What is its volume, in ${u}³, in terms of π?`,
          ...o,
          explanation: `The radius is ${d} ÷ 2 = ${rad}. V = πr²h = π × ${rad}² × ${h} = ${piText(v)}. ${piText(d * d * h)} uses the diameter as the radius; ${piText(d * h)} is πdh, the side area.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const rad = int(r, 2, 9); const h = int(r, 3, 15); const u = pick(r, UNITS);
        if (rad === h || 2 * rad === h) return null;
        const v = rad * rad * h;
        const shape = idx % 4;
        if (shape === 0) {
          return { prompt: `A cylinder has a volume of ${piText(v)} ${u}³ and a radius of ${rad} ${u}. What is its height, in ${u}?`,
            value: h,
            explanation: `V = πr²h, so ${piText(v)} = π × ${rad}² × h = ${piText(rad * rad)} × h. Divide: h = ${v} ÷ ${rad * rad} = ${h}. Dividing by ${rad} instead of ${rad}² is the usual slip.` };
        }
        if (shape === 1) {
          return { prompt: `A cylinder has a volume of ${piText(v)} ${u}³ and a height of ${h} ${u}. What is its radius, in ${u}?`,
            value: rad,
            explanation: `V = πr²h, so ${piText(v)} = π × r² × ${h}. Divide by ${h}π: r² = ${rad * rad}, so r = ${rad}. Stopping at r² = ${rad * rad}, or halving instead of taking the square root, are the usual slips.` };
        }
        if (shape === 2) {
          return { prompt: `A cylinder has a volume of ${piText(v)} ${u}³ and a diameter of ${2 * rad} ${u}. What is its height, in ${u}?`,
            value: h,
            explanation: `The radius is ${2 * rad} ÷ 2 = ${rad}. Then ${piText(v)} = π × ${rad}² × h, so h = ${v} ÷ ${rad * rad} = ${h}. Using the diameter as the radius gives a height four times too small.` };
        }
        return { prompt: `A cylinder has a volume of ${piText(v)} ${u}³ and a height of ${h} ${u}. What is its DIAMETER, in ${u}?`,
          value: 2 * rad,
          explanation: `${piText(v)} = π × r² × ${h}, so r² = ${v} ÷ ${h} = ${rad * rad} and r = ${rad}. The diameter is twice the radius: ${2 * rad}. Answering with the radius is the usual slip.` };
      }) },
    ],
  },

  // 13 ────────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'volume-cones',
    skillId: 'g8-volume-cones',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const rad = int(r, 3, 9); const h = 3 * int(r, 1, 5); const u = pick(r, UNITS);
        if (rad === h) return null;
        const v3 = rad * rad * h;       // three times the volume, in π
        if (idx % 2 === 1) {
          return { prompt: `A cone has a radius of ${rad} ${u} and a height of ${h} ${u}. Use 3.14 for π. What is its volume, in ${u}³? Give your answer as a decimal.`,
            value: dec100(314 * v3 / 3),
            explanation: `V = ⅓πr²h = ⅓ × 3.14 × ${rad}² × ${h} = 3.14 × ${v3 / 3} = ${dec100(314 * v3 / 3)}. Leaving out the ⅓ gives the volume of the cylinder with the same base and height (${dec100(314 * v3)}).` };
        }
        const o = mc(r, piText(v3, 3), [piText(v3), piText(rad * h, 3), piText(2 * rad * h, 3)]);
        if (!o) return null;
        return { prompt: `A cone has a radius of ${rad} ${u} and a height of ${h} ${u}. What is its volume, in ${u}³, in terms of π?`,
          ...o,
          explanation: `V = ⅓πr²h = ⅓ × π × ${rad}² × ${h} = ${piText(v3, 3)}. ${piText(v3)} forgets the ⅓ (that is a cylinder), and ${piText(rad * h, 3)} forgets to square the radius.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const rad = int(r, 2, 8); const h = 3 * int(r, 1, 5); const u = pick(r, UNITS);
        const d = 2 * rad; const v3 = rad * rad * h;
        if (idx % 2 === 1) {
          return { prompt: `A cone has a diameter of ${d} ${u} and a height of ${h} ${u}. Use 3.14 for π. What is its volume, in ${u}³? Give your answer as a decimal.`,
            value: dec100(314 * v3 / 3),
            explanation: `The radius is ${d} ÷ 2 = ${rad}. V = ⅓ × 3.14 × ${rad}² × ${h} = 3.14 × ${v3 / 3} = ${dec100(314 * v3 / 3)}. Using the diameter as the radius, or leaving out the ⅓, are the usual slips.` };
        }
        const o = mc(r, piText(v3, 3), [piText(v3), piText(4 * v3, 3), piText(4 * v3)]);
        if (!o) return null;
        return { prompt: `A cone has a diameter of ${d} ${u} and a height of ${h} ${u}. What is its volume, in ${u}³, in terms of π?`,
          ...o,
          explanation: `The radius is ${d} ÷ 2 = ${rad}. V = ⅓πr²h = ⅓ × π × ${rad}² × ${h} = ${piText(v3, 3)}. ${piText(v3)} forgets the ⅓; ${piText(4 * v3, 3)} uses the diameter as the radius; ${piText(4 * v3)} makes both mistakes.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const u = pick(r, UNITS);
        const shape = idx % 4;
        if (shape === 2) {
          const [rad, h, l] = pick(r, [[3, 4, 5], [6, 8, 10], [9, 12, 15], [12, 5, 13], [12, 16, 20], [15, 8, 17]]);
          const v3 = rad * rad * h;
          const o = mc(r, piText(v3, 3), [piText(rad * rad * l, 3), piText(v3), piText(rad * rad * l)]);
          if (!o) return null;
          return { prompt: `A cone has a radius of ${rad} ${u} and a slant height (the distance from the tip to the edge of the base) of ${l} ${u}. What is its volume, in ${u}³, in terms of π?`,
            ...o,
            explanation: `The radius, height and slant height form a right triangle: h = √(${l}² − ${rad}²) = ${h}. V = ⅓ × π × ${rad}² × ${h} = ${piText(v3, 3)}. Using the slant height ${l} as the height gives ${piText(rad * rad * l, 3)} — the usual slip.` };
        }
        const rad = int(r, 2, 9); const h = int(r, 2, 12);
        if (rad === h || (rad * rad * h) % 3 !== 0) return null;
        const v3 = rad * rad * h; const vol = piText(v3, 3);
        if (shape === 0) {
          return { prompt: `A cone has a volume of ${vol} ${u}³ and a radius of ${rad} ${u}. What is its height, in ${u}?`,
            value: h,
            explanation: `V = ⅓πr²h, so ${v3 / 3} = ⅓ × ${rad * rad} × h. Multiply by 3: ${v3} = ${rad * rad}h, so h = ${h}. Forgetting to multiply by 3 (dividing ${v3 / 3} by ${rad * rad}) is the usual slip.` };
        }
        if (shape === 1) {
          return { prompt: `A cone has a volume of ${vol} ${u}³ and a height of ${h} ${u}. What is its radius, in ${u}?`,
            value: rad,
            explanation: `V = ⅓πr²h, so ${v3 / 3} = ⅓ × r² × ${h}. Multiply by 3 and divide by ${h}: r² = ${v3} ÷ ${h} = ${rad * rad}, so r = ${rad}. Forgetting to multiply by 3, or stopping at r², are the usual slips.` };
        }
        return { prompt: `A cone has a volume of ${vol} ${u}³ and a diameter of ${2 * rad} ${u}. What is its height, in ${u}?`,
          value: h,
          explanation: `The radius is ${2 * rad} ÷ 2 = ${rad}. Then ${v3 / 3} = ⅓ × ${rad * rad} × h, so ${v3} = ${rad * rad}h and h = ${h}. Using the diameter as the radius, or forgetting the ⅓, are the usual slips.` };
      }) },
    ],
  },

  // 14 ────────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'volume-spheres',
    skillId: 'g8-volume-spheres',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const u = pick(r, UNITS);
        if (idx % 2 === 1) {
          const rad = pick(r, [3, 6, 9]);
          const c = rad * rad * rad;
          return { prompt: `A sphere has a radius of ${rad} ${u}. Use 3.14 for π. What is its volume, in ${u}³? Give your answer as a decimal.`,
            value: dec100(314 * 4 * c / 3),
            explanation: `V = (4/3)πr³ = (4/3) × 3.14 × ${rad}³ = (4/3) × 3.14 × ${c} = ${dec100(314 * 4 * c / 3)}. Squaring the radius instead of cubing it is the usual slip.` };
        }
        const rad = pick(r, [3, 6, 9, 12]);
        const c = rad * rad * rad;
        const o = mc(r, piText(4 * c, 3), [piText(c), piText(4 * c), piText(4 * rad * rad, 3)]);
        return { prompt: `A sphere has a radius of ${rad} ${u}. What is its volume, in ${u}³, in terms of π?`,
          ...o,
          explanation: `V = (4/3)πr³ = (4/3) × π × ${rad}³ = (4/3) × ${c}π = ${piText(4 * c, 3)}. ${piText(c)} leaves out the 4/3, ${piText(4 * c)} leaves out the ÷ 3, and ${piText(4 * rad * rad, 3)} squares the radius instead of cubing it.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const u = pick(r, UNITS);
        if (idx % 2 === 1) {
          const rad = pick(r, [3, 6, 9]);
          const c = rad * rad * rad;
          return { prompt: `A sphere has a diameter of ${2 * rad} ${u}. Use 3.14 for π. What is its volume, in ${u}³? Give your answer as a decimal.`,
            value: dec100(314 * 4 * c / 3),
            explanation: `The radius is ${2 * rad} ÷ 2 = ${rad}. V = (4/3) × 3.14 × ${rad}³ = (4/3) × 3.14 × ${c} = ${dec100(314 * 4 * c / 3)}. Cubing the diameter gives an answer eight times too large.` };
        }
        const rad = pick(r, [2, 3, 4, 5, 6, 9]);
        const c = rad * rad * rad;
        const o = mc(r, piText(4 * c, 3), [piText(32 * c, 3), piText(c), piText(4 * rad * rad, 3)]);
        if (!o) return null;
        return { prompt: `A sphere has a diameter of ${2 * rad} ${u}. What is its volume, in ${u}³, in terms of π?`,
          ...o,
          explanation: `The radius is ${2 * rad} ÷ 2 = ${rad}. V = (4/3)πr³ = (4/3) × π × ${c} = ${piText(4 * c, 3)}. ${piText(32 * c, 3)} cubes the diameter instead of the radius; ${piText(c)} leaves out the 4/3.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const u = pick(r, UNITS);
        const shape = idx % 4;
        if (shape === 0 || shape === 2) {
          const rad = shape === 0 ? pick(r, [3, 6, 9, 12]) : pick(r, [2, 4, 5, 6, 9]);
          const c = rad * rad * rad;
          const o = mc(r, piText(2 * c, 3), [piText(4 * c, 3), piText(2 * c), piText(2 * rad * rad, 3)]);
          if (!o) return null;
          const dims = shape === 0 ? `a radius of ${rad} ${u}` : `a diameter of ${2 * rad} ${u}`;
          return { prompt: `A hemisphere (half of a sphere) has ${dims}. What is its volume, in ${u}³, in terms of π?`,
            ...o,
            explanation: `${shape === 2 ? `The radius is ${rad}. ` : ''}A whole sphere of radius ${rad} has volume (4/3)π × ${c} = ${piText(4 * c, 3)}. Half of that is ${piText(2 * c, 3)}. Forgetting to halve (${piText(4 * c, 3)}) is the usual slip.` };
        }
        if (shape === 1) {
          const rad = pick(r, [3, 6, 9, 12]);
          const c = rad * rad * rad;
          return { prompt: `A sphere has a volume of ${piText(4 * c, 3)} ${u}³. What is its radius, in ${u}?`,
            value: rad,
            explanation: `(4/3)πr³ = ${piText(4 * c, 3)}, so r³ = ${4 * c / 3} × 3 ÷ 4 = ${c}, and r = ${rad} because ${rad}³ = ${c}. Taking a square root instead of a cube root, or dividing ${c} by 3, are the usual slips.` };
        }
        const rad = pick(r, [3, 6, 9]);
        const c = rad * rad * rad;
        return { prompt: `A bowl is shaped like a hemisphere (half of a sphere) with a diameter of ${2 * rad} ${u}. Use 3.14 for π. How much does the bowl hold, in ${u}³? Give your answer as a decimal.`,
          value: dec100(314 * 2 * c / 3),
          explanation: `The radius is ${rad}. A whole sphere: (4/3) × 3.14 × ${c} = ${dec100(314 * 4 * c / 3)}. The bowl is half of that: ${dec100(314 * 2 * c / 3)}. Using the diameter as the radius, or not halving, are the usual slips.` };
      }) },
    ],
  },

  // 15 ────────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'volume-word-problems',
    skillId: 'g8-volume-word-problems',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const rad = int(r, 2, 6); const h = int(r, 3, 10);
          const v = rad * rad * h;
          return { prompt: `A cylindrical water tank has a radius of ${rad} m and a height of ${h} m. Use 3.14 for π. How many cubic meters of water does the tank hold when full? Give your answer as a decimal.`,
            value: dec100(314 * v),
            explanation: `A cylinder's volume is πr²h = 3.14 × ${rad}² × ${h} = 3.14 × ${v} = ${dec100(314 * v)} m³. Forgetting to square the radius is the usual slip.` };
        }
        if (shape === 1) {
          const rad = int(r, 3, 6); const h = 3 * int(r, 2, 4);
          const v3 = rad * rad * h;
          const o = mc(r, piText(v3, 3), [piText(v3), piText(rad * h, 3), piText(2 * rad * h, 3)]);
          if (!o) return null;
          return { prompt: `A paper cup is shaped like a cone with a radius of ${rad} cm and a height of ${h} cm. How much water does the cup hold, in cm³, in terms of π?`,
            ...o,
            explanation: `A cone's volume is ⅓πr²h = ⅓ × π × ${rad}² × ${h} = ${piText(v3, 3)}. ${piText(v3)} is the cylinder with the same base and height — the cone holds only a third of that.` };
        }
        if (shape === 2) {
          const rad = pick(r, [3, 6, 9]); const c = rad * rad * rad;
          return { prompt: `A ball is a sphere with a radius of ${rad} in. Use 3.14 for π. How many cubic inches of air does the ball hold? Give your answer as a decimal.`,
            value: dec100(314 * 4 * c / 3),
            explanation: `A sphere's volume is (4/3)πr³ = (4/3) × 3.14 × ${rad}³ = (4/3) × 3.14 × ${c} = ${dec100(314 * 4 * c / 3)} in³. Squaring instead of cubing the radius is the usual slip.` };
        }
        const rad = int(r, 2, 5); const h = int(r, 6, 15);
        const v = rad * rad * h;
        return { prompt: `A soup can is a cylinder with a diameter of ${2 * rad} cm and a height of ${h} cm. Use 3.14 for π. What is the volume of the can, in cm³? Give your answer as a decimal.`,
          value: dec100(314 * v),
          explanation: `The radius is ${2 * rad} ÷ 2 = ${rad}. V = πr²h = 3.14 × ${rad}² × ${h} = 3.14 × ${v} = ${dec100(314 * v)} cm³. Using the diameter as the radius is the usual slip.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const rad = int(r, 2, 5); const h = int(r, 3, 9);
          const a = pick(r, [1, 2, 3]); const b = int(r, 1, 4);
          if (a === 1 && b === 1) return null;
          return { prompt: `A scoop is shaped like a cone with a radius of ${rad} cm and a height of ${h} cm. A bucket is a cylinder with a radius of ${a * rad} cm and a height of ${b * h} cm. How many full scoops of sand does it take to fill the bucket?`,
            value: 3 * a * a * b,
            explanation: `Scoop: ⅓ × π × ${rad}² × ${h} = ${piText(rad * rad * h, 3)} cm³. Bucket: π × ${a * rad}² × ${b * h} = ${piText(a * a * rad * rad * b * h)} cm³. Divide: ${3 * a * a * b} scoops. Leaving out the cone's ⅓ gives ${a * a * b}, three times too few.` };
        }
        if (shape === 1) {
          const r1 = int(r, 2, 6); const h1 = int(r, 3, 10);
          const r2 = int(r, 3, 8); const h2 = 3 * int(r, 1, 5);
          const cyl = r1 * r1 * h1; const cone3 = r2 * r2 * h2; const cone = cone3 / 3;
          // The cone LOOKS bigger (and is, if the ⅓ is forgotten) but holds less.
          if (!(cone3 > cyl && cone < cyl)) return null;
          const d = cyl - cone; const d2 = cone3 - cyl;
          const o = mc(r, `The cylinder, by ${d}π cm³`, [`The cone, by ${d}π cm³`, `The cone, by ${d2}π cm³`, `The cylinder, by ${d2}π cm³`]);
          if (!o) return null;
          return { prompt: `A glass is a cylinder with a radius of ${r1} cm and a height of ${h1} cm. A paper cup is a cone with a radius of ${r2} cm and a height of ${h2} cm. Which container holds more, and by how much?`,
            ...o,
            explanation: `Cylinder: π × ${r1}² × ${h1} = ${cyl}π cm³. Cone: ⅓ × π × ${r2}² × ${h2} = ${cone}π cm³. The cylinder holds ${d}π cm³ more. Leaving out the cone's ⅓ makes the cone look larger by ${d2}π — the usual slip.` };
        }
        if (shape === 2) {
          const rad = int(r, 2, 6); const H = int(r, 6, 12); const w = int(r, 2, H - 2);
          return { prompt: `A cylindrical tank has a diameter of ${2 * rad} m and a height of ${H} m. It is filled with water to a depth of ${w} m. Use 3.14 for π. What is the volume of the water in the tank, in m³? Give your answer as a decimal.`,
            value: dec100(314 * rad * rad * w),
            explanation: `The water is a cylinder with radius ${2 * rad} ÷ 2 = ${rad} m and height ${w} m (the depth, not the tank's ${H} m). V = 3.14 × ${rad}² × ${w} = ${dec100(314 * rad * rad * w)} m³. Using the tank's full height or the diameter are the usual slips.` };
        }
        const rad = int(r, 2, 6); const h = 3 * int(r, 1, 5);
        if (rad === h) return null;
        const cyl = rad * rad * h;
        const o = mc(r, piText(2 * cyl, 3), [piText(cyl, 3), piText(cyl), piText(4 * cyl, 3)]);
        if (!o) return null;
        return { prompt: `A cylindrical cup and a cone-shaped cup both have a radius of ${rad} cm and a height of ${h} cm. How much MORE does the cylindrical cup hold than the cone-shaped cup, in cm³, in terms of π?`,
          ...o,
          explanation: `Cylinder: π × ${rad}² × ${h} = ${piText(cyl)}. Cone: one third of that, ${piText(cyl, 3)}. Difference: ${piText(cyl)} − ${piText(cyl, 3)} = ${piText(2 * cyl, 3)}. Giving just the cone's volume, or adding the two, are the usual slips.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const shape = idx % 4;
        if (shape === 0 || shape === 2) {
          const [rad, R] = pick(r, [[3, 3], [3, 2], [3, 6], [6, 6], [6, 12], [6, 4], [9, 9], [9, 6], [6, 3]]);
          const hNum = 4 * rad * rad * rad; const hDen = 3 * R * R;
          if (hNum % hDen !== 0) return null;
          const h = hNum / hDen;
          if (shape === 2 && (h > 9 || R <= rad)) return null;
          const how = `The sphere's volume is (4/3) × π × ${rad}³ = ${piText(hNum, 3)} cm³. A cylinder of radius ${R} cm and height h has volume π × ${R}² × h = ${R * R}πh. Set them equal: h = ${hNum / 3} ÷ ${R * R} = ${h}.`;
          if (shape === 0) {
            return { prompt: `A solid metal sphere with a radius of ${rad} cm is melted down and recast as a solid cylinder with a radius of ${R} cm. No metal is lost. What is the height of the cylinder, in cm?`,
              value: h,
              explanation: `${how} Leaving out the 4/3, or squaring the sphere's radius instead of cubing it, are the usual slips.` };
          }
          return { prompt: `A cylindrical glass with a radius of ${R} cm is partly filled with water. A solid sphere with a radius of ${rad} cm is dropped in and sinks completely, and no water spills. By how many centimeters does the water level rise?`,
            value: h,
            explanation: `The water rises by the height of a cylinder (radius ${R} cm) whose volume equals the sphere's. ${how} Using the sphere's radius for the glass is the usual slip.` };
        }
        if (shape === 1) {
          const rad = pick(r, [3, 6]); const h = int(r, 2, 6) * (rad === 3 ? 2 : 1) + rad;
          const cone3 = rad * rad * h; const hemi3 = 2 * rad * rad * rad;
          if (cone3 % 3 !== 0) return null;
          const o = mc(r, piText(cone3 + hemi3, 3), [piText(cone3 + 2 * hemi3, 3), piText(3 * cone3 + hemi3, 3), piText(cone3, 3)]);
          if (!o) return null;
          return { prompt: `An ice cream treat is a cone with a radius of ${rad} cm and a height of ${h} cm, topped with a hemisphere (half of a sphere) of ice cream that has the same radius. What is the total volume of the treat, in cm³, in terms of π?`,
            ...o,
            explanation: `Cone: ⅓ × π × ${rad}² × ${h} = ${piText(cone3, 3)}. Hemisphere: ½ × (4/3) × π × ${rad}³ = ${piText(hemi3, 3)}. Total: ${piText(cone3 + hemi3, 3)}. Adding a whole sphere (${piText(cone3 + 2 * hemi3, 3)}) or leaving out the cone's ⅓ are the usual slips.` };
        }
        const [R, H, rad] = pick(r, [[6, 12, 3], [6, 4, 3], [6, 8, 3], [4, 6, 2], [2, 6, 1], [4, 9, 3], [3, 4, 1], [6, 6, 3], [4, 12, 2], [8, 6, 2]]);
        const num = 3 * R * R * H; const den = 4 * rad * rad * rad;
        if (num % den !== 0) return null;
        return { prompt: `A cylinder of clay has a radius of ${R} cm and a height of ${H} cm. All of the clay is rolled into solid spheres that each have a radius of ${rad} cm. How many spheres can be made?`,
          value: num / den,
          explanation: `Cylinder: π × ${R}² × ${H} = ${piText(R * R * H)} cm³. Each sphere: (4/3) × π × ${rad}³ = ${piText(4 * rad * rad * rad, 3)} cm³. Divide: ${R * R * H} ÷ (${K.frac(4 * rad * rad * rad, 3)}) = ${num / den} spheres. Leaving out the 4/3 is the usual slip.` };
      }) },
    ],
  },
];

module.exports = { COURSE_ID, GB, TEMPLATES };
