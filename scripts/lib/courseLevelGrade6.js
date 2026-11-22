'use strict';
/**
 * At-level check items for 6th Grade Math (Common Core grade 6).
 *
 * Thirteen course skills whose crosswalked bank pools do not test the skill at
 * grade level. Each template has three tiers (difficulty 2, 3, 4) and each
 * tier cycles two to four question SHAPES on idx, so a tier is never one
 * question with new numbers. Every answer is computed from the numbers drawn;
 * tests/unit/courseLevelGrade6.test.js re-solves each item from its printed
 * text with rules typed there by hand.
 *
 * Text only: a net, a dot plot, a histogram and a coordinate grid are all
 * described in words, in a fixed grammar the test can read back.
 */

const K = require('./templateKit');
const { int, pick, gcd, frac } = K;

const COURSE_ID = '6th-grade-math';
const GB = '6-8';

// ── helpers ────────────────────────────────────────────────────────────────

const LETTERS = 'ABCD';

/** Four options with the right one at `pos`; null when two options collide. */
function mc(correct, wrongs, pos) {
  const options = wrongs.slice(0, 3).map(String);
  options.splice(pos, 0, String(correct));
  if (options.length !== 4 || new Set(options).size !== 4) return null;
  return { options, correctOption: LETTERS[pos], value: String(correct) };
}

/** Redraw until the generator body accepts its own numbers. */
function until(fn) {
  for (let i = 0; i < 2000; i++) {
    const out = fn();
    if (out) return out;
  }
  throw new Error('no acceptable draw in 2000 tries');
}

function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(r, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A number as printed in a prompt: Unicode minus, no float noise. */
const dec = (x) => String(Math.round(x * 1000) / 1000);
const show = (x) => (x < 0 ? `−${dec(Math.abs(x))}` : dec(x));
/** A number as a typed answer: ASCII minus. */
const typed = (x) => dec(x);
const usd = (x) => (Number.isInteger(x) ? `$${x}` : `$${x.toFixed(2)}`);
const ratio = (a, b) => { const g = gcd(a, b); return `${a / g}:${b / g}`; };
const sum = (a) => a.reduce((s, v) => s + v, 0);
const asc = (a) => a.slice().sort((x, y) => x - y);

/** A proper fraction in lowest terms, as [n, d]. */
function properFrac(r, maxD = 9) {
  return until(() => {
    const d = int(r, 2, maxD);
    const n = int(r, 1, d - 1);
    return gcd(n, d) === 1 ? [n, d] : null;
  });
}

/** "3", "3/4" or "2 1/2" — how a fraction is printed in a prompt. */
function mixed(n, d) {
  const [a, b] = K.reduce(n, d);
  if (b === 1) return String(a);
  if (a < b) return `${a}/${b}`;
  return `${Math.floor(a / b)} ${a % b}/${b}`;
}

/** "15/18 = 5/6", or just "5/6" when nothing reduces. */
function eq(n, d) {
  const raw = `${n}/${d}`;
  return raw === frac(n, d) ? raw : `${raw} = ${frac(n, d)}`;
}

const FRAC_FORM = 'Write the answer as a fraction in lowest terms, or as a whole number (an improper fraction is fine).';
const RATIO_FORM = 'Write it in the form a:b.';

function median(a) {
  const s = asc(a);
  const m = s.length / 2;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[m - 1] + s[m]) / 2;
}
const range = (a) => Math.max(...a) - Math.min(...a);
const mean = (a) => sum(a) / a.length;
/** IQR with the halves on either side of the middle (even n: clean halves). */
function iqr(a) {
  const s = asc(a);
  const half = Math.floor(s.length / 2);
  return median(s.slice(s.length - half)) - median(s.slice(0, half));
}

/** Expand "value: count" pairs into the data they stand for. */
const expandCounts = (pairs) => pairs.flatMap(([v, c]) => Array(c).fill(v));
const listPairs = (pairs) => pairs.map(([v, c]) => `${v}: ${c}`).join(', ');

/**
 * Ordering options for a list of {t, v}: the right order plus the three orders
 * real mistakes produce — by distance from zero, the wrong direction, and the
 * negatives in "bigger digits are bigger" order.
 */
function orderOptions(nums, descending, pos) {
  const dir = descending ? -1 : 1;
  const right = nums.slice().sort((a, b) => dir * (a.v - b.v));
  const byAbs = nums.slice().sort((a, b) => dir * (Math.abs(a.v) - Math.abs(b.v)));
  const reversed = right.slice().reverse();
  const negs = right.filter((n) => n.v < 0).reverse();
  let k = 0;
  const negsFlipped = right.map((n) => (n.v < 0 ? negs[k++] : n));
  const text = (list) => list.map((n) => n.t).join(', ');
  return mc(text(right), [text(byAbs), text(reversed), text(negsFlipped)], pos);
}

// ── statistical questions: one bank of questions per theme ──────────────────
// num  = statistical, numerical data;  cat = statistical, categorical data;
// more = a second statistical question; fixed = three questions with ONE answer
// (the first of them has a number for its answer).
const THEMES = [
  { topic: 'pets',
    num: 'How many pets does each student in the class have?',
    cat: 'What kind of pet do the students at our school like best?',
    more: 'How much do the dogs at the animal shelter weigh?',
    fixed: ['How many legs does a dog have?', 'How many pets does Ms. Ortiz have?', 'What is the name of the class hamster?'] },
  { topic: 'sleep',
    num: 'How many hours did each sixth grader sleep last night?',
    cat: 'Do the sixth graders at our school feel rested in the morning?',
    more: 'What time do the students in our class wake up on school days?',
    fixed: ['How many hours are in one day?', 'What time did Jamal go to bed last night?', 'What time does first period start at our school?'] },
  { topic: 'reading',
    num: 'How many books did each student in the class read this summer?',
    cat: 'What type of book do the students in our grade like best?',
    more: 'How many minutes do the sixth graders read each night?',
    fixed: ['How many pages are in this math textbook?', 'How many books did Priya read in June?', 'Who wrote the book the class is reading now?'] },
  { topic: 'sports',
    num: 'How many points did the school team score in each game this season?',
    cat: 'Which sport do the students at our school like best?',
    more: 'How many hours a week do the players on the team practice?',
    fixed: ['How many players does one basketball team have on the court?', 'How many points did the team score in last night\'s game?', 'Who is the coach of the school soccer team?'] },
  { topic: 'weather',
    num: 'What was the high temperature in our town on each day in March?',
    cat: 'What kind of weather do the students in our class like best?',
    more: 'How many inches of rain fell in our town in each month of last year?',
    fixed: ['How many days are in March?', 'What is the temperature outside right now?', 'At what temperature does water freeze, in degrees Celsius?'] },
  { topic: 'school lunch',
    num: 'How many minutes does each student in our grade spend eating lunch?',
    cat: 'Which cafeteria lunch do the students at our school like best?',
    more: 'How much money do the students in our grade spend on lunch each week?',
    fixed: ['How much does one carton of milk cost in the cafeteria?', 'What is the cafeteria serving for lunch today?', 'What time does lunch start for sixth grade?'] },
  { topic: 'height',
    num: 'How tall are the students in the sixth grade?',
    cat: 'What color eyes do the students in the class have?',
    more: 'What are the shoe sizes of the students in the class?',
    fixed: ['How many centimeters are in one meter?', 'How tall is Marco?', 'Who is the tallest teacher at the school?'] },
  { topic: 'getting to school',
    num: 'How many minutes does it take each student in the class to get to school?',
    cat: 'How do the students in our class get to school?',
    more: 'How many miles do the teachers at our school drive to work?',
    fixed: ['How many seats are on bus 12?', 'How far is the school from the public library?', 'What time does bus 12 arrive at school?'] },
];

const REWRITES = [
  { original: 'How tall is Marco?',
    right: 'How tall are the students in Marco\'s class?',
    wrong: ['How tall is Marco in centimeters?', 'How tall was Marco on his last birthday?', 'Is Marco taller than his teacher?'] },
  { original: 'How many books did Priya read in June?',
    right: 'How many books did each student in Priya\'s class read in June?',
    wrong: ['How many books did Priya read in June and July?', 'Which book did Priya read first in June?', 'Did Priya read more than 3 books in June?'] },
];

const WHY_RIGHT = 'The answers will be different from one student or day to the next, so data must be collected to answer it.';
const WHY_WRONG = [
  'It has one exact answer that can be looked up.',
  'Its answer is a number, and every question with a number for an answer is statistical.',
  'It is a question about a school, and every question about a school is statistical.',
];

// ── rational numbers for comparing and ordering ────────────────────────────
const FRACTIONS = [[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [3, 2], [5, 4], [7, 4], [1, 8], [3, 8], [5, 8]];
const DECIMALS = [0.3, 0.6, 0.7, 0.9, 1.2, 1.4, 0.45, 0.65, 0.35, 1.1, 0.15, 0.85];

function drawRational(r, kind) {
  const sign = pick(r, [-1, -1, 1]);
  if (kind === 'fraction') {
    const [n, d] = pick(r, FRACTIONS);
    return { t: `${sign < 0 ? '−' : ''}${n}/${d}`, v: (sign * n) / d };
  }
  const x = pick(r, DECIMALS) * sign;
  return { t: show(x), v: x };
}

/** `count` rationals: distinct values, distinct distances from 0, mixed signs. */
function drawRationals(r, kinds) {
  return until(() => {
    const nums = kinds.map((k) => drawRational(r, k));
    const vals = nums.map((n) => n.v);
    const negatives = vals.filter((v) => v < 0).length;
    if (new Set(vals).size !== nums.length) return null;
    if (new Set(vals.map(Math.abs)).size !== nums.length) return null;
    if (negatives < 2 || negatives === nums.length) return null;
    return nums;
  });
}

const PT = (x, y) => `(${show(x)}, ${show(y)})`;

// ── templates ──────────────────────────────────────────────────────────────

const PAIRS = [
  { lead: 'A bag holds', x: 'red marbles', y: 'blue marbles', all: 'marbles' },
  { lead: 'A shelter has', x: 'dogs', y: 'cats', all: 'animals' },
  { lead: 'A garden has', x: 'tulips', y: 'roses', all: 'flowers' },
  { lead: 'A parking lot has', x: 'cars', y: 'trucks', all: 'vehicles' },
];

const TEMPLATES = [
  // ── 1. ratio language ────────────────────────────────────────────────────
  {
    courseSkill: 'g6-ratio-language',
    skillId: 'g6-ratio-language',
    tiers: [
      { difficulty: 2, gen: (r, idx) => until(() => {
        const c = pick(r, PAIRS);
        const shape = idx % 4;
        if (shape === 0) {
          const X = int(r, 2, 9), Y = int(r, 2, 9);
          if (X === Y || gcd(X, Y) !== 1) return null;
          const o = mc(`${Y}:${X}`, [`${X}:${Y}`, `${Y}:${X + Y}`, `${X}:${X + Y}`], int(r, 0, 3));
          return o && { prompt: `${c.lead} ${X} ${c.x} and ${Y} ${c.y}. Which is the ratio of ${c.y} to ${c.x}?`, ...o,
            explanation: `A ratio is written in the order it is said: ${c.y} first (${Y}), then ${c.x} (${X}), so ${Y}:${X}. ${X}:${Y} reverses the order, and ${Y}:${X + Y} compares ${c.y} to ALL the ${c.all}.` };
        }
        if (shape === 1) {
          const g = int(r, 2, 4), a = int(r, 1, 4), b = int(r, 1, 4);
          if (gcd(a, a + b) !== 1 || a === b) return null;
          const Y = g * a, X = g * b;
          return { prompt: `${c.lead} ${X} ${c.x} and ${Y} ${c.y}. What is the ratio of ${c.y} to all the ${c.all}, in simplest form? ${RATIO_FORM}`,
            value: ratio(Y, X + Y),
            explanation: `There are ${X} + ${Y} = ${X + Y} ${c.all} in all, so the ratio is ${Y}:${X + Y}, which simplifies to ${ratio(Y, X + Y)}. The usual slip is ${ratio(Y, X)}, which compares ${c.y} to ${c.x} only.` };
        }
        if (shape === 2) {
          const a = int(r, 2, 7), b = int(r, 2, 7);
          if (a === b || gcd(a, b) !== 1) return null;
          const o = mc(`For every ${a} pencils, there are ${b} pens.`,
            [`For every ${b} pencils, there are ${a} pens.`, `${a} out of every ${b} items in the box are pencils.`, `For every ${a} pencils, there are ${a + b} pens.`], int(r, 0, 3));
          return o && { prompt: `The ratio of pencils to pens in a box is ${a}:${b}. Which statement is true?`, ...o,
            explanation: `${a}:${b} read in order means ${a} pencils for every ${b} pens. Pencils are ${a} out of every ${a + b} items, not ${a} out of every ${b} — the second number of a part-to-part ratio is not the total.` };
        }
        const g = int(r, 2, 5), a = int(r, 1, 5), b = int(r, 1, 5);
        if (a === b || gcd(a, b) !== 1) return null;
        return { prompt: `A team has ${g * a} wins and ${g * b} losses. What is the ratio of wins to losses, in simplest form? ${RATIO_FORM}`,
          value: ratio(g * a, g * b),
          explanation: `Wins to losses is ${g * a}:${g * b}. Divide both numbers by ${g} to get ${a}:${b}. Keep the order — ${b}:${a} would be losses to wins.` };
      }) },
      { difficulty: 3, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 0) {
          const g = int(r, 2, 4), a = int(r, 2, 5), b = int(r, 2, 5);
          if (a === b || gcd(a, b) !== 1) return null;
          const girls = g * a, boys = g * b;
          return { prompt: `A class has ${girls + boys} students. ${girls} of them are girls and the rest are boys. What is the ratio of boys to girls, in simplest form? ${RATIO_FORM}`,
            value: ratio(boys, girls),
            explanation: `There are ${girls + boys} − ${girls} = ${boys} boys, so boys to girls is ${boys}:${girls} = ${ratio(boys, girls)}. Using ${girls + boys} as one of the numbers compares a part to the whole class instead.` };
        }
        if (shape === 1) {
          const a = int(r, 2, 7), b = int(r, 2, 7);
          if (a === b || gcd(a, b) !== 1) return null;
          return { prompt: `The ratio of girls to boys in a club is ${a}:${b}. What fraction of the club members are girls? Write a fraction in lowest terms.`,
            value: frac(a, a + b),
            explanation: `For every ${a} girls there are ${b} boys, so ${a} out of every ${a} + ${b} = ${a + b} members are girls: ${frac(a, a + b)}. The slip is ${a}/${b}, which compares girls to boys, not girls to the whole club.` };
        }
        if (shape === 2) {
          const g = int(r, 2, 5), p = int(r, 2, 5), a = int(r, 2, 7);
          if (p === a || gcd(p, a) !== 1) return null;
          const P = g * p, A = g * a;
          if (A - P === a) return null;
          const o = mc(`For every ${p} pear trees, there are ${a} apple trees.`,
            [`For every ${a} pear trees, there are ${p} apple trees.`, `For every ${p} pear trees, there are ${p + a} apple trees.`, `For every 1 pear tree, there are ${Math.abs(A - P)} apple trees.`], int(r, 0, 3));
          return o && { prompt: `An orchard has ${A} apple trees and ${P} pear trees. Which statement describes the ratio of pear trees to apple trees?`, ...o,
            explanation: `Pear to apple is ${P}:${A}. Dividing both by ${g} gives ${p}:${a} — ${p} pear trees for every ${a} apple trees. A ratio compares by dividing; subtracting (${Math.abs(A - P)}) only tells how many more.` };
        }
        const g = int(r, 2, 3), b = int(r, 1, 4), rest = int(r, 2, 7);
        if (gcd(b, b + rest) !== 1) return null;
        const B = g * b, A = int(r, 2, g * rest - 2), C = g * rest - A;
        if (A === B || C === B || C < 2) return null;
        return { prompt: `A fruit bowl holds ${A} apples, ${B} bananas and ${C} oranges. What is the ratio of bananas to all the fruit, in simplest form? ${RATIO_FORM}`,
          value: ratio(B, A + B + C),
          explanation: `All the fruit is ${A} + ${B} + ${C} = ${A + B + C} pieces, so bananas to all fruit is ${B}:${A + B + C} = ${ratio(B, A + B + C)}. Comparing bananas only to the other fruit (${B}:${A + C}) answers a different question.` };
      }) },
      { difficulty: 4, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 0) {
          const a = int(r, 2, 7), b = int(r, 2, 7), k = int(r, 3, 8);
          if (a === b || gcd(a, b) !== 1) return null;
          return { prompt: `The ratio of red beads to blue beads on a necklace is ${a}:${b}. The necklace has ${k * (a + b)} beads, and every bead is red or blue. How many beads are red?`,
            value: k * a,
            explanation: `${a}:${b} means ${a} red in every group of ${a} + ${b} = ${a + b} beads. ${k * (a + b)} ÷ ${a + b} = ${k} groups, so there are ${k} × ${a} = ${k * a} red beads. Dividing ${k * (a + b)} by ${b} instead treats the ratio as part to whole.` };
        }
        if (shape === 1) {
          const a = int(r, 2, 7), b = int(r, 2, 7);
          if (a === b || gcd(a, b) !== 1) return null;
          const o = mc(`Jo is incorrect: the order is reversed. Sugar to flour is ${b}:${a}.`,
            ['Jo is correct.', `Jo is incorrect: sugar to flour is ${b}:${a + b}.`, `Jo is incorrect: sugar to flour is ${a}:${a + b}.`], int(r, 0, 3));
          return o && { prompt: `A recipe uses ${a} cups of flour for every ${b} cups of sugar. Jo writes the ratio of sugar to flour as ${a}:${b}. Which statement is true?`, ...o,
            explanation: `"Sugar to flour" puts sugar first: ${b} cups of sugar to ${a} cups of flour, ${b}:${a}. Jo wrote flour to sugar. ${b}:${a + b} would compare sugar to the whole mixture.` };
        }
        if (shape === 2) {
          const q = int(r, 5, 12), p = int(r, 2, q - 2);
          if (gcd(p, q) !== 1 || p * 2 === q) return null;
          return { prompt: `${p} out of every ${q} students in a club are sixth graders. What is the ratio of sixth graders to students who are NOT sixth graders, in simplest form? ${RATIO_FORM}`,
            value: ratio(p, q - p),
            explanation: `In every group of ${q} students, ${p} are sixth graders and ${q} − ${p} = ${q - p} are not, so the ratio is ${p}:${q - p}. ${p}:${q} compares sixth graders to ALL the students.` };
        }
        const g = int(r, 2, 4), t = int(r, 1, 4), rest = int(r, 3, 7);
        if (gcd(t, rest) !== 1) return null;
        const T = g * t, C = int(r, 2, g * rest - 2), V = g * rest - C;
        if (C === T || V === T || C === V) return null;
        return { prompt: `A lot has ${C} cars, ${T} trucks and ${V} vans. What is the ratio of trucks to vehicles that are NOT trucks, in simplest form? ${RATIO_FORM}`,
          value: ratio(T, C + V),
          explanation: `The vehicles that are not trucks are ${C} + ${V} = ${C + V}. Trucks to non-trucks is ${T}:${C + V} = ${ratio(T, C + V)}. ${ratio(T, C + T + V)} would compare trucks to every vehicle in the lot.` };
      }) },
    ],
  },

  // ── 2. equivalent ratios ─────────────────────────────────────────────────
  {
    courseSkill: 'g6-equivalent-ratios',
    skillId: 'g6-equivalent-ratios',
    tiers: [
      { difficulty: 2, gen: (r, idx) => until(() => {
        const a = int(r, 2, 7), b = int(r, 2, 9);
        if (a === b || gcd(a, b) !== 1) return null;
        const shape = idx % 4;
        if (shape === 0) {
          return { prompt: `A ratio table for a recipe lists cups of flour: ${a}, ${2 * a}, ${3 * a}, ? and cups of milk: ${b}, ${2 * b}, ${3 * b}, ${4 * b}. What number replaces the question mark?`,
            value: 4 * a,
            explanation: `Each column is a multiple of the first: the milk went from ${b} to ${4 * b}, which is × 4, so the flour is ${a} × 4 = ${4 * a}. Adding the same amount to both rows does not keep a ratio equivalent.` };
        }
        if (shape === 1) {
          const k = int(r, 3, 9);
          return { prompt: `The ratios ${a}:${b} and n:${k * b} are equivalent. What is the value of n?`,
            value: k * a,
            explanation: `${b} × ${k} = ${k * b}, so multiply the first number by the same ${k}: ${a} × ${k} = ${k * a}. The slip is adding ${k * b - b} to ${a} instead of multiplying.` };
        }
        if (shape === 2) {
          const k = int(r, 2, 6);
          const o = mc(`${k * a}:${k * b}`, [`${a + k}:${b + k}`, `${k * b}:${k * a}`, `${k * a}:${k * b + b}`], int(r, 0, 3));
          return o && { prompt: `Which ratio is equivalent to ${a}:${b}?`, ...o,
            explanation: `Multiply BOTH numbers by the same factor: ${a} × ${k} = ${k * a} and ${b} × ${k} = ${k * b}. Adding ${k} to both (${a + k}:${b + k}) changes the ratio, and ${k * b}:${k * a} reverses it.` };
        }
        const k = int(r, 3, 8);
        return { prompt: `A recipe uses ${a} cups of rice for every ${b} cups of water. How many cups of water are needed for ${k * a} cups of rice?`,
          value: k * b,
          explanation: `${k * a} cups of rice is ${k} times the recipe (${a} × ${k}), so the water is ${b} × ${k} = ${k * b} cups. Both amounts are multiplied by the same number.` };
      }) },
      { difficulty: 3, gen: (r, idx) => until(() => {
        const a = int(r, 2, 6), b = int(r, 3, 9);
        if (a === b || gcd(a, b) !== 1) return null;
        const shape = idx % 4;
        if (shape === 0) {
          const j = int(r, 2, 4), k = int(r, 3, 7);
          if (k % j === 0) return null;
          return { prompt: `The ratios ${j * a}:${j * b} and n:${k * b} are equivalent. What is the value of n?`,
            value: k * a,
            explanation: `${j * a}:${j * b} simplifies to ${a}:${b}. Then ${b} × ${k} = ${k * b}, so n = ${a} × ${k} = ${k * a}. There is no whole number that takes ${j * b} to ${k * b}, which is why simplifying first helps.` };
        }
        if (shape === 1) {
          const [k1, k2, k3] = shuffle(r, [2, 3, 4, 5, 6]);
          const add = int(r, 2, 5);
          const o = mc(`${a + add}:${b + add}`, [`${k1 * a}:${k1 * b}`, `${k2 * a}:${k2 * b}`, `${k3 * a}:${k3 * b}`], int(r, 0, 3));
          return o && { prompt: `Which ratio is NOT equivalent to ${a}:${b}?`, ...o,
            explanation: `${k1 * a}:${k1 * b}, ${k2 * a}:${k2 * b} and ${k3 * a}:${k3 * b} are ${a}:${b} with both numbers multiplied by ${k1}, ${k2} and ${k3}. ${a + add}:${b + add} was made by ADDING ${add} to both numbers, which does not give an equivalent ratio.` };
        }
        if (shape === 2) {
          const [k1, k2, k3] = asc(shuffle(r, [2, 3, 5, 6, 7, 8]).slice(0, 3));
          return { prompt: `A ratio table lists x: ${a}, ${k1 * a}, ${k2 * a}, ${k3 * a} and y: ${b}, ${k1 * b}, ?, ${k3 * b}. What number replaces the question mark?`,
            value: k2 * b,
            explanation: `Every pair is ${a}:${b} scaled up. ${k2 * a} is ${a} × ${k2}, so the missing y is ${b} × ${k2} = ${k2 * b}. The y-values do not go up by a constant amount here because the multipliers skip.` };
        }
        const g = int(r, 2, 4), k = int(r, 3, 5);
        if (k % g === 0 || k === g) return null;
        const servings = pick(r, [2, 3, 4]);
        return { prompt: `A recipe that makes ${g * servings} servings uses ${g * a} cups of flour. How many cups of flour are needed to make ${k * servings} servings?`,
          value: k * a,
          explanation: `${g * a} cups for ${g * servings} servings is ${a} cups for every ${servings} servings. ${k * servings} servings is ${k} of those groups, so ${a} × ${k} = ${k * a} cups.` };
      }) },
      { difficulty: 4, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 0) {
          const s = pick(r, [4, 6, 8]), cups = pick(r, [3, 5, 7, 9]), target = pick(r, [10, 14, 18, 22]);
          const need = (cups * target) / s;
          if (Number.isInteger(need) || !Number.isInteger(need * 4)) return null;
          return { prompt: `A recipe for ${s} servings uses ${cups} cups of broth. How many cups of broth are needed for ${target} servings? Write a decimal.`,
            value: typed(need),
            explanation: `One serving uses ${cups} ÷ ${s} = ${dec(cups / s)} cups. ${target} servings use ${dec(cups / s)} × ${target} = ${dec(need)} cups. Adding ${target - s} to ${cups} is the additive slip.` };
        }
        if (shape === 1) {
          const a = int(r, 2, 6), b = int(r, 3, 9), c = int(r, 2, 5), k = int(r, 2, 4);
          if (a === b || gcd(a, b) !== 1) return null;
          const o = mc(`Sam is incorrect. Equivalent ratios come from multiplying both numbers by the same number, such as ${k * a}:${k * b}.`,
            ['Sam is correct, because he did the same thing to both numbers.',
              `Sam is incorrect. He should add ${c} to the first number only, to get ${a + c}:${b}.`,
              `Sam is incorrect. An equivalent ratio is ${k * b}:${k * a}.`], int(r, 0, 3));
          return o && { prompt: `Sam says ${a}:${b} is equivalent to ${a + c}:${b + c} because he added ${c} to both numbers. Which statement is true?`, ...o,
            explanation: `${a}:${b} and ${a + c}:${b + c} are different comparisons (${a} × ${b + c} = ${a * (b + c)} but ${b} × ${a + c} = ${b * (a + c)}). Only multiplying or dividing both numbers by the same number keeps a ratio equivalent, e.g. ${k * a}:${k * b}.` };
        }
        if (shape === 2) {
          const a = int(r, 2, 5), b = int(r, 2, 5), k = int(r, 3, 9);
          if (a === b || gcd(a, b) !== 1) return null;
          return { prompt: `Green paint is made by mixing blue paint and yellow paint in the ratio ${a}:${b}. How many cups of blue paint are needed to make ${k * (a + b)} cups of green paint?`,
            value: k * a,
            explanation: `Each batch is ${a} + ${b} = ${a + b} cups of green. ${k * (a + b)} ÷ ${a + b} = ${k} batches, and each uses ${a} cups of blue: ${k} × ${a} = ${k * a} cups. The slip is scaling against ${b} instead of the total ${a + b}.` };
        }
        const which = int(r, 0, 2);
        const a1 = int(r, 2, 4), w1 = int(r, 3, 6);
        if (gcd(a1, w1) !== 1 || a1 >= w1) return null;
        let a2, w2;
        if (which === 2) { const k = pick(r, [2, 3]); a2 = a1 * k; w2 = w1 * k; } else {
          a2 = a1 + 1; w2 = w1 + int(r, 1, 3);
          const cmp = a1 * w2 - a2 * w1;          // > 0: mix A is stronger
          if (cmp === 0 || (which === 0) !== (cmp > 0)) return null;
        }
        const OPTS = ['Mix A', 'Mix B', 'They taste equally strong.', 'It cannot be known without the total amount of each mix.'];
        return { prompt: `Mix A uses ${a1} cups of juice concentrate for every ${w1} cups of water. Mix B uses ${a2} cups of concentrate for every ${w2} cups of water. Which mix has the stronger juice taste?`,
          value: OPTS[which], options: OPTS, correctOption: LETTERS[which],
          explanation: `Compare with a common amount of water, ${w1 * w2} cups: Mix A needs ${a1 * w2} cups of concentrate and Mix B needs ${a2 * w1}. ${which === 2 ? 'The amounts match, so the ratios are equivalent.' : `${Math.max(a1 * w2, a2 * w1)} is more, so ${OPTS[which]} is stronger.`} More concentrate in the recipe does not by itself mean a stronger taste.` };
      }) },
    ],
  },

  // ── 3. unit rates ────────────────────────────────────────────────────────
  {
    courseSkill: 'g6-unit-rates',
    skillId: 'g6-unit-rates',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const n = int(r, 3, 8), u = int(r, 2, 9);
          return { prompt: `A pack of ${n} notebooks costs $${n * u}. What is the cost of one notebook, in dollars?`,
            value: u,
            explanation: `The unit rate is the cost for ONE: $${n * u} ÷ ${n} = $${u} per notebook. Dividing the other way (${n} ÷ ${n * u}) gives notebooks per dollar instead.` };
        }
        if (shape === 1) {
          const h = int(r, 2, 5), s = int(r, 42, 68);
          return { prompt: `A car travels ${h * s} miles in ${h} hours at a constant speed. What is its speed, in miles per hour?`,
            value: s,
            explanation: `Miles per hour means miles for ONE hour: ${h * s} ÷ ${h} = ${s} miles per hour. Always divide by the quantity that comes after "per".` };
        }
        if (shape === 2) {
          const m = int(r, 3, 8), w = int(r, 22, 48);
          return { prompt: `Maya types ${m * w} words in ${m} minutes at a steady rate. How many words does she type per minute?`,
            value: w,
            explanation: `Words per minute is ${m * w} ÷ ${m} = ${w}. The divisor is the number of minutes because the rate is for one minute.` };
        }
        const h = pick(r, [2, 4, 6]), s = pick(r, [1.5, 2.5, 3.5, 4.5]);
        return { prompt: `A hiker walks ${h * s} miles in ${h} hours at a steady pace. How many miles does the hiker walk per hour? Write a decimal.`,
          value: typed(s),
          explanation: `${h * s} ÷ ${h} = ${s} miles per hour. A unit rate does not have to be a whole number. Dividing ${h} by ${h * s} would give hours per mile.` };
      } },
      { difficulty: 3, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 0) {
          const w = int(r, 22, 45), m1 = pick(r, [3, 4, 6]), m2 = pick(r, [5, 7, 10]);
          return { prompt: `Dev types ${w * m1} words in ${m1} minutes. At that rate, how many words does he type in ${m2} minutes?`,
            value: w * m2,
            explanation: `Unit rate: ${w * m1} ÷ ${m1} = ${w} words per minute. In ${m2} minutes that is ${w} × ${m2} = ${w * m2} words. Find the amount for 1 first, because ${m2} is not a whole multiple of ${m1}.` };
        }
        if (shape === 1) {
          const u = pick(r, [1.5, 2.5, 3.5]), n1 = pick(r, [2, 4, 6]), n2 = pick(r, [8, 10, 12, 14]);
          return { prompt: `${n1} pounds of apples cost ${usd(u * n1)}. At that price, how many dollars do ${n2} pounds of apples cost?`,
            value: u * n2,
            explanation: `Unit price: $${u * n1} ÷ ${n1} = ${usd(u)} per pound. Then ${n2} × ${usd(u)} = $${u * n2}. Adding ${n2 - n1} dollars for the extra ${n2 - n1} pounds treats each pound as $1.` };
        }
        if (shape === 2) {
          const s = int(r, 9, 16), h = int(r, 2, 3), h2 = int(r, 4, 7);
          return { prompt: `A cyclist rides ${s * h} miles in ${h} hours at a constant speed. At that speed, how many hours does it take to ride ${s * h2} miles?`,
            value: h2,
            explanation: `Speed: ${s * h} ÷ ${h} = ${s} miles per hour. Time = distance ÷ speed = ${s * h2} ÷ ${s} = ${h2} hours. Multiplying ${s * h2} by ${s} would be the slip.` };
        }
        const rate = pick(r, [0.4, 0.6, 0.8, 0.9, 1.2, 1.5]), h = pick(r, [3, 4, 5, 6]);
        return { prompt: `A faucet leaks ${dec(rate * h)} liters of water in ${h} hours at a steady rate. How many liters does it leak per hour? Write a decimal.`,
          value: typed(rate),
          explanation: `Liters per hour is ${dec(rate * h)} ÷ ${h} = ${dec(rate)}. Divide the liters by the hours — the unit after "per" is the divisor.` };
      }) },
      { difficulty: 4, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 0 || shape === 2) {
          const n1 = pick(r, [4, 5, 6]), n2 = pick(r, [9, 10, 12]);
          const u1 = int(r, 7, 19) * 5, u2 = (shape === 0 && int(r, 0, 4) === 0) ? u1 : int(r, 7, 19) * 5;   // cents
          if (shape === 2 && u1 === u2) return null;
          if (Math.abs(u1 - u2) > 25) return null;
          const c1 = (n1 * u1) / 100, c2 = (n2 * u2) / 100;
          const lead = `A ${n1}-pack of granola bars costs $${c1.toFixed(2)}. A ${n2}-pack of the same bars costs $${c2.toFixed(2)}.`;
          const work = `${n1}-pack: $${c1.toFixed(2)} ÷ ${n1} = $${(u1 / 100).toFixed(2)} per bar. ${n2}-pack: $${c2.toFixed(2)} ÷ ${n2} = $${(u2 / 100).toFixed(2)} per bar.`;
          if (shape === 2) {
            return { prompt: `${lead} What is the price per bar of the better buy, in dollars? Write a decimal.`,
              value: typed(Math.min(u1, u2) / 100),
              explanation: `${work} The better buy has the LOWER price per bar, $${(Math.min(u1, u2) / 100).toFixed(2)}. Comparing the pack prices alone ignores how many bars are in each.` };
          }
          const OPTS = [`The ${n1}-pack`, `The ${n2}-pack`, 'Neither: they cost the same per bar.', 'It cannot be decided, because the packs are different sizes.'];
          const which = u1 < u2 ? 0 : (u2 < u1 ? 1 : 2);
          return { prompt: `${lead} Which is the better buy?`,
            value: OPTS[which], options: OPTS, correctOption: LETTERS[which],
            explanation: `${work} ${which === 2 ? 'The unit prices are equal.' : `${OPTS[which]} costs less per bar.`} Unit rates are what let you compare packs of different sizes; the lower total price or the bigger pack is not automatically the better buy.` };
        }
        if (shape === 1) {
          const sA = int(r, 21, 33) * 2, sB = int(r, 42, 66), hA = pick(r, [1.5, 2.5, 3.5]), hB = pick(r, [2, 3, 4]);
          if (sA === sB) return null;
          return { prompt: `Car A travels ${sA * hA} miles in ${hA} hours. Car B travels ${sB * hB} miles in ${hB} hours. Both drive at constant speeds. How many miles per hour faster is the faster car?`,
            value: Math.abs(sA - sB),
            explanation: `Car A: ${sA * hA} ÷ ${hA} = ${sA} miles per hour. Car B: ${sB * hB} ÷ ${hB} = ${sB} miles per hour. The difference is ${Math.abs(sA - sB)} miles per hour. The car that went farther is not necessarily faster — compare unit rates.` };
        }
        const rate = pick(r, [12.5, 17.5, 22.5, 27.5]), m = pick(r, [2, 4]), t = pick(r, [6, 8, 10, 12]);
        return { prompt: `A printer prints ${rate * m} pages in ${m} minutes at a steady rate. At this rate, how many minutes does it take to print ${rate * t} pages?`,
          value: t,
          explanation: `Unit rate: ${rate * m} ÷ ${m} = ${rate} pages per minute. Time = ${rate * t} ÷ ${rate} = ${t} minutes. The unit rate is a decimal, so scaling ${m} minutes by a guess does not work — divide.` };
      }) },
    ],
  },

  // ── 4. multiply and divide fractions ─────────────────────────────────────
  {
    courseSkill: 'g6-fraction-multiply-divide',
    skillId: 'g6-fraction-multiply-divide',
    tiers: [
      { difficulty: 2, gen: (r, idx) => until(() => {
        const [a, b] = properFrac(r), [c, d] = properFrac(r);
        if (a === c && b === d) return null;
        const shape = idx % 4;
        if (shape === 0) {
          return { prompt: `Divide: ${a}/${b} ÷ ${c}/${d}. ${FRAC_FORM}`,
            value: frac(a * d, b * c),
            explanation: `Dividing by ${c}/${d} is multiplying by its reciprocal ${d}/${c}: ${a}/${b} × ${d}/${c} = ${eq(a * d, b * c)}. The slip is multiplying straight across without flipping, which gives ${frac(a * c, b * d)}.` };
        }
        if (shape === 1) {
          return { prompt: `Multiply: ${a}/${b} × ${c}/${d}. ${FRAC_FORM}`,
            value: frac(a * c, b * d),
            explanation: `Multiply numerators and denominators: ${a} × ${c} = ${a * c} and ${b} × ${d} = ${b * d}, so the product is ${eq(a * c, b * d)}. No common denominator is needed to multiply.` };
        }
        if (shape === 2) {
          const w = int(r, 2, 9);
          return { prompt: `Divide: ${w} ÷ ${c}/${d}. ${FRAC_FORM}`,
            value: frac(w * d, c),
            explanation: `${w} ÷ ${c}/${d} = ${w} × ${d}/${c} = ${eq(w * d, c)}. Dividing by a fraction less than 1 gives an answer GREATER than ${w}; ${frac(w * c, d)} comes from multiplying instead.` };
        }
        const w = int(r, 2, 6);
        return { prompt: `Divide: ${a}/${b} ÷ ${w}. ${FRAC_FORM}`,
          value: frac(a, b * w),
          explanation: `Dividing by ${w} is multiplying by 1/${w}: ${a}/${b} × 1/${w} = ${eq(a, b * w)}. The slip is multiplying by ${w}, which gives ${frac(a * w, b)}.` };
      }) },
      { difficulty: 3, gen: (r, idx) => until(() => {
        const [a, b] = properFrac(r, 6), [c, d] = properFrac(r, 8);
        const w = int(r, 1, 4);
        const N = w * b + a;                       // w a/b = N/b
        const shape = idx % 4;
        if (shape === 0) {
          return { prompt: `Divide: ${w} ${a}/${b} ÷ ${c}/${d}. ${FRAC_FORM}`,
            value: frac(N * d, b * c),
            explanation: `Write ${w} ${a}/${b} as ${N}/${b}, then multiply by the reciprocal: ${N}/${b} × ${d}/${c} = ${eq(N * d, b * c)}. Change the mixed number to a fraction before flipping anything.` };
        }
        if (shape === 1) {
          if (c === 1) return null;
          const k = int(r, 2, 5), total = k * c;
          return { prompt: `How many ${c}/${d}-cup servings are in ${total} cups of soup?`,
            value: (total * d) / c,
            explanation: `${total} ÷ ${c}/${d} = ${total} × ${d}/${c} = ${total * d}/${c} = ${(total * d) / c} servings. There are MORE servings than cups because each serving is less than a cup.` };
        }
        if (shape === 2) {
          const w2 = int(r, 1, 3), [e, f] = properFrac(r, 5);
          const M = w2 * f + e;
          return { prompt: `Multiply: ${w} ${a}/${b} × ${w2} ${e}/${f}. ${FRAC_FORM}`,
            value: frac(N * M, b * f),
            explanation: `Change both to fractions: ${N}/${b} × ${M}/${f} = ${eq(N * M, b * f)}. Multiplying the whole numbers and the fractions separately (${w} × ${w2} and ${a}/${b} × ${e}/${f}) leaves out part of the product.` };
        }
        return { prompt: `Divide: ${c}/${d} ÷ ${w} ${a}/${b}. ${FRAC_FORM}`,
          value: frac(c * b, d * N),
          explanation: `${w} ${a}/${b} = ${N}/${b}, so ${c}/${d} ÷ ${N}/${b} = ${c}/${d} × ${b}/${N} = ${eq(c * b, d * N)}. Flip the DIVISOR (the second number), not the first.` };
      }) },
      { difficulty: 4, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 0) {
          const [n, d] = properFrac(r, 8), k = int(r, 3, 9);
          if ((k * n) % d === 0 || n === 1) return null;
          return { prompt: `A ribbon ${mixed(k * n, d)} yards long is cut into pieces that are each ${n}/${d} yard long. How many pieces are cut?`,
            value: k,
            explanation: `${mixed(k * n, d)} = ${frac(k * n, d)}, and ${frac(k * n, d)} ÷ ${n}/${d} = ${frac(k * n, d)} × ${d}/${n} = ${k} pieces. Multiplying the two lengths instead answers a different question.` };
        }
        if (shape === 1) {
          const [a, b] = properFrac(r, 7), [c, d] = properFrac(r, 7);
          if ((a === c && b === d) || c === 1 || frac(a * d, b * c) === frac(b * c, a * d)) return null;
          const name = pick(r, ['Lee', 'Tia', 'Omar', 'Nell']);
          const o = mc(`${name} is incorrect: the reciprocal of ${c}/${d} was not used. The quotient is ${frac(a * d, b * c)}.`,
            [`${name} is correct.`,
              `${name} is incorrect: the first fraction should be flipped. The quotient is ${frac(b * c, a * d)}.`,
              `${name} is incorrect: fractions need a common denominator before dividing, so the quotient is ${frac(a * c, b * d * b * d)}.`], int(r, 0, 3));
          return o && { prompt: `${name} says ${a}/${b} ÷ ${c}/${d} = ${frac(a * c, b * d)}. Which statement is true?`, ...o,
            explanation: `${name} multiplied ${a}/${b} × ${c}/${d}. To divide, multiply by the reciprocal of the divisor: ${a}/${b} × ${d}/${c} = ${eq(a * d, b * c)}. Flipping the first fraction instead gives ${frac(b * c, a * d)}, which is also wrong.` };
        }
        if (shape === 2) {
          const [ln, ld] = pick(r, [[3, 2], [5, 2], [4, 3], [5, 3], [7, 4], [5, 4], [3, 4], [2, 3]]);
          const [wn, wd] = pick(r, [[3, 2], [5, 2], [4, 3], [7, 3], [9, 4], [5, 4]]);
          if ((ln * wn) % (ld * wd) === 0) return null;
          return { prompt: `A rectangle has an area of ${mixed(ln * wn, ld * wd)} square feet and a width of ${mixed(wn, wd)} feet. What is its length, in feet? ${FRAC_FORM}`,
            value: frac(ln, ld),
            explanation: `Length = area ÷ width = ${frac(ln * wn, ld * wd)} ÷ ${frac(wn, wd)} = ${frac(ln * wn, ld * wd)} × ${frac(wd, wn)} = ${frac(ln, ld)} feet. Change both mixed numbers to fractions first; multiplying area by width is the slip.` };
        }
        const [a, b] = properFrac(r, 6), [c, d] = properFrac(r, 6);
        if (a * d >= b * c) return null;
        return { prompt: `How many ${c}/${d}-cup servings are in ${a}/${b} cup of yogurt? Write the answer as a fraction in lowest terms.`,
          value: frac(a * d, b * c),
          explanation: `${a}/${b} ÷ ${c}/${d} = ${a}/${b} × ${d}/${c} = ${eq(a * d, b * c)} of a serving. The answer is less than 1 because ${a}/${b} cup is less than one full ${c}/${d}-cup serving.` };
      }) },
    ],
  },

  // ── 5. formulas for area, perimeter and volume ───────────────────────────
  {
    courseSkill: 'g6-formulas-area-volume',
    skillId: 'g6-formulas-area-volume',
    tiers: [
      { difficulty: 2, gen: (r, idx) => until(() => {
        const u = pick(r, ['cm', 'in', 'ft', 'm']);
        const shape = idx % 4;
        if (shape === 0) {
          const b = int(r, 5, 14), h = int(r, 3, 11);
          if ((b * h) % 2) return null;
          return { prompt: `Use the formula A = ½bh. A triangle has b = ${b} ${u} and h = ${h} ${u}. What is A, in ${u}²?`,
            value: (b * h) / 2,
            explanation: `A = ½ × ${b} × ${h} = ½ × ${b * h} = ${(b * h) / 2} ${u}². Forgetting the ½ gives ${b * h}, the area of the whole rectangle around the triangle.` };
        }
        if (shape === 1) {
          const l = int(r, 4, 9), w = int(r, 2, 6), h = int(r, 2, 7);
          return { prompt: `Use the formula V = lwh. A box has l = ${l} ${u}, w = ${w} ${u} and h = ${h} ${u}. What is V, in ${u}³?`,
            value: l * w * h,
            explanation: `V = ${l} × ${w} × ${h} = ${l * w * h} ${u}³. Multiply all three dimensions; adding them (${l + w + h}) is the slip.` };
        }
        if (shape === 2) {
          const l = int(r, 8, 20), w = int(r, 3, 9);
          return { prompt: `Use the formula P = 2l + 2w. A rectangle has l = ${l} ${u} and w = ${w} ${u}. What is P, in ${u}?`,
            value: 2 * l + 2 * w,
            explanation: `P = 2(${l}) + 2(${w}) = ${2 * l} + ${2 * w} = ${2 * l + 2 * w} ${u}. Multiply before adding; ${l + w} counts only two of the four sides.` };
        }
        const s = int(r, 3, 9);
        return { prompt: `Use the formula V = s³. A cube has s = ${s} ${u}. What is V, in ${u}³?`,
          value: s * s * s,
          explanation: `V = ${s} × ${s} × ${s} = ${s * s * s} ${u}³. The exponent means ${s} is used as a factor three times — it is not ${s} × 3 = ${3 * s}.` };
      }) },
      { difficulty: 3, gen: (r, idx) => until(() => {
        const u = pick(r, ['cm', 'in', 'ft', 'm']);
        const shape = idx % 4;
        if (shape === 0) {
          const b = int(r, 3, 12) + 0.5, h = int(r, 3, 9);
          const A = b * h;
          return { prompt: `Use the formula A = bh. A parallelogram has b = ${b} ${u} and h = ${h} ${u}. What is A, in ${u}²?${Number.isInteger(A) ? '' : ' Write a decimal.'}`,
            value: typed(A),
            explanation: `A = ${b} × ${h} = ${dec(A)} ${u}². A parallelogram's area is base times height with no ½ — halving it (${dec(A / 2)}) is the triangle formula.` };
        }
        if (shape === 1) {
          const w0 = int(r, 1, 4), [n, d] = pick(r, [[1, 2], [1, 4], [3, 4]]);
          const w = int(r, 2, 6), h = pick(r, [4, 8]);
          const V = ((w0 * d + n) * w * h) / d;
          return { prompt: `Use the formula V = lwh. A box has l = ${w0} ${n}/${d} ${u}, w = ${w} ${u} and h = ${h} ${u}. What is V, in ${u}³?`,
            value: V,
            explanation: `${w0} ${n}/${d} = ${w0 * d + n}/${d}, so V = ${w0 * d + n}/${d} × ${w} × ${h} = ${V} ${u}³. Using only the whole-number part ${w0} gives ${w0 * w * h}, which is too small.` };
        }
        if (shape === 2) {
          const b = int(r, 2, 7) * 2 + 1, h = int(r, 1, 5) * 2 + 1;
          return { prompt: `Use the formula A = ½bh. A triangle has b = ${b} ${u} and h = ${h} ${u}. What is A, in ${u}²? Write a decimal.`,
            value: typed((b * h) / 2),
            explanation: `A = ½ × ${b} × ${h} = ½ × ${b * h} = ${dec((b * h) / 2)} ${u}². The product is odd, so the area is a decimal; ${b * h} forgets the ½.` };
        }
        const [n, d] = pick(r, [[1, 2], [1, 3], [2, 3], [3, 2], [1, 4], [3, 4], [5, 2], [2, 5]]);
        return { prompt: `Use the formula V = s³. A cube has s = ${n}/${d} ${u}. What is V, in ${u}³? Write a fraction in lowest terms.`,
          value: frac(n * n * n, d * d * d),
          explanation: `V = ${n}/${d} × ${n}/${d} × ${n}/${d} = ${n * n * n}/${d * d * d} ${u}³. Cube the numerator AND the denominator; multiplying by 3 (${frac(3 * n, d)}) is the slip.` };
      }) },
      { difficulty: 4, gen: (r, idx) => until(() => {
        const u = pick(r, ['cm', 'in', 'ft', 'm']);
        const shape = idx % 4;
        if (shape === 0) {
          const b = int(r, 4, 14), h = int(r, 3, 13);
          if (b === h) return null;
          const A = (b * h) / 2;
          return { prompt: `Use the formula A = ½bh. A triangle has A = ${dec(A)} ${u}² and b = ${b} ${u}. What is h, in ${u}?`,
            value: h,
            explanation: `${dec(A)} = ½ × ${b} × h, so ${dec(A)} = ${dec(b / 2)}h and h = ${dec(A)} ÷ ${dec(b / 2)} = ${h} ${u}. Dividing ${dec(A)} by ${b} without undoing the ½ gives half the true height.` };
        }
        if (shape === 1) {
          const l = pick(r, [2.5, 3.5, 4.5, 1.5]), w = pick(r, [2, 4, 6]), h = int(r, 3, 9);
          return { prompt: `Use the formula V = lwh. A box has V = ${dec(l * w * h)} ${u}³, l = ${l} ${u} and w = ${w} ${u}. What is h, in ${u}?`,
            value: h,
            explanation: `${dec(l * w * h)} = ${l} × ${w} × h = ${dec(l * w)}h, so h = ${dec(l * w * h)} ÷ ${dec(l * w)} = ${h} ${u}. Divide the volume by the area of the base, l × w.` };
        }
        if (shape === 2) {
          const l = int(r, 6, 15) + pick(r, [0, 0.5]), w = int(r, 2, 6) + 0.5;
          const P = 2 * l + 2 * w;
          return { prompt: `Use the formula P = 2l + 2w. A rectangle has P = ${dec(P)} ${u} and l = ${l} ${u}. What is w, in ${u}? Write a decimal.`,
            value: typed(w),
            explanation: `${dec(P)} = 2(${l}) + 2w = ${dec(2 * l)} + 2w, so 2w = ${dec(P - 2 * l)} and w = ${dec(w)} ${u}. Subtracting ${l} only once, or forgetting to halve at the end, are the usual slips.` };
        }
        const b = int(r, 4, 12), h = int(r, 2, 9) + 0.5;
        return { prompt: `Use the formula A = bh. A parallelogram has A = ${dec(b * h)} ${u}² and b = ${b} ${u}. What is h, in ${u}? Write a decimal.`,
          value: typed(h),
          explanation: `${dec(b * h)} = ${b} × h, so h = ${dec(b * h)} ÷ ${b} = ${h} ${u}. Undo the multiplication by dividing the area by the base.` };
      }) },
    ],
  },

  // ── 6. nets and surface area ─────────────────────────────────────────────
  {
    courseSkill: 'g6-nets-surface-area',
    skillId: 'g6-nets-surface-area',
    tiers: [
      { difficulty: 2, gen: (r, idx) => until(() => {
        const u = pick(r, ['cm', 'in', 'ft']);
        const shape = idx % 4;
        if (shape === 0) {
          const s = int(r, 3, 12);
          return { prompt: `The net of a cube is made of 6 squares with sides of ${s} ${u}. What is the surface area of the cube, in ${u}²?`,
            value: 6 * s * s,
            explanation: `Each square has area ${s} × ${s} = ${s * s} ${u}², and there are 6 of them: 6 × ${s * s} = ${6 * s * s} ${u}². ${s * s * s} would be the volume, not the surface area.` };
        }
        if (shape === 2) {
          const s = int(r, 3, 8), h = int(r, 5, 14);
          if (s === h) return null;
          return { prompt: `The net of a rectangular prism is made of 2 squares with sides of ${s} ${u} and 4 rectangles that are each ${s} ${u} by ${h} ${u}. What is the surface area of the prism, in ${u}²?`,
            value: 2 * s * s + 4 * s * h,
            explanation: `Squares: 2 × ${s * s} = ${2 * s * s}. Rectangles: 4 × ${s * h} = ${4 * s * h}. Total ${2 * s * s} + ${4 * s * h} = ${2 * s * s + 4 * s * h} ${u}². Count every face of the net once.` };
        }
        const l = int(r, 5, 12), w = int(r, 3, 8), h = int(r, 2, 6);
        if (l === w || w === h || l === h) return null;
        return { prompt: `The net of a rectangular prism is made of 6 rectangles: 2 rectangles that are each ${l} ${u} by ${w} ${u}, 2 rectangles that are each ${l} ${u} by ${h} ${u}, and 2 rectangles that are each ${w} ${u} by ${h} ${u}. What is the surface area of the prism, in ${u}²?`,
          value: 2 * (l * w + l * h + w * h),
          explanation: `2 × ${l * w} + 2 × ${l * h} + 2 × ${w * h} = ${2 * l * w} + ${2 * l * h} + ${2 * w * h} = ${2 * (l * w + l * h + w * h)} ${u}². Adding only one of each pair (${l * w + l * h + w * h}) covers half the net.` };
      }) },
      { difficulty: 3, gen: (r, idx) => until(() => {
        const u = pick(r, ['cm', 'in', 'ft']);
        const shape = idx % 4;
        if (shape === 0) {
          const s = int(r, 4, 12), l = int(r, 5, 14);
          return { prompt: `The net of a square pyramid is made of 1 square with sides of ${s} ${u} and 4 triangles with a base of ${s} ${u} and a height of ${l} ${u}. What is the surface area of the pyramid, in ${u}²?`,
            value: s * s + 2 * s * l,
            explanation: `Square: ${s * s}. Each triangle: ½ × ${s} × ${l} = ${dec((s * l) / 2)}, and 4 of them make ${2 * s * l}. Total ${s * s} + ${2 * s * l} = ${s * s + 2 * s * l} ${u}². Leaving out the ½ on the triangles gives ${s * s + 4 * s * l}.` };
        }
        if (shape === 1) {
          const [a, b, c] = pick(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15]]);
          const L = int(r, 6, 14);
          return { prompt: `The net of a triangular prism is made of 2 triangles with a base of ${a} ${u} and a height of ${b} ${u}, and 3 rectangles that measure ${a} ${u} by ${L} ${u}, ${b} ${u} by ${L} ${u}, and ${c} ${u} by ${L} ${u}. What is the surface area of the prism, in ${u}²?`,
            value: a * b + (a + b + c) * L,
            explanation: `Triangles: 2 × ½ × ${a} × ${b} = ${a * b}. Rectangles: ${a * L} + ${b * L} + ${c * L} = ${(a + b + c) * L}. Total ${a * b + (a + b + c) * L} ${u}². The two triangles together make one ${a}-by-${b} rectangle, not two.` };
        }
        if (shape === 2) {
          const [b, h, s] = pick(r, [[6, 4, 5], [10, 12, 13], [16, 6, 10], [12, 8, 10], [8, 3, 5]]);
          const L = int(r, 7, 15);
          return { prompt: `The net of a triangular prism is made of 2 triangles with a base of ${b} ${u} and a height of ${h} ${u}, 1 rectangle that is ${b} ${u} by ${L} ${u}, and 2 rectangles that are each ${s} ${u} by ${L} ${u}. What is the surface area of the prism, in ${u}²?`,
            value: b * h + b * L + 2 * s * L,
            explanation: `Triangles: 2 × ½ × ${b} × ${h} = ${b * h}. Rectangles: ${b * L} + 2 × ${s * L} = ${b * L + 2 * s * L}. Total ${b * h + b * L + 2 * s * L} ${u}². A triangular prism has 5 faces — 2 triangles and 3 rectangles.` };
        }
        const l = int(r, 3, 9) + 0.5, w = int(r, 2, 6), h = int(r, 2, 6);
        if (w === h) return null;
        return { prompt: `The net of a rectangular prism is made of 2 rectangles that are each ${l} ${u} by ${w} ${u}, 2 rectangles that are each ${l} ${u} by ${h} ${u}, and 2 rectangles that are each ${w} ${u} by ${h} ${u}. What is the surface area of the prism, in ${u}²?`,
          value: typed(2 * (l * w + l * h + w * h)),
          explanation: `2 × ${dec(l * w)} + 2 × ${dec(l * h)} + 2 × ${w * h} = ${dec(2 * l * w)} + ${dec(2 * l * h)} + ${2 * w * h} = ${dec(2 * (l * w + l * h + w * h))} ${u}². Multiplying ${l} × ${w} × ${h} would give the volume instead.` };
      }) },
      { difficulty: 4, gen: (r, idx) => until(() => {
        const u = pick(r, ['cm', 'in', 'ft']);
        const shape = idx % 4;
        if (shape === 0) {
          const l = int(r, 5, 11), w = int(r, 3, 7), h = int(r, 2, 6);
          if (l === w || w === h || l === h) return null;
          const o = mc(`2(${l} × ${w}) + 2(${l} × ${h}) + 2(${w} × ${h})`,
            [`${l} × ${w} × ${h}`, `(${l} × ${w}) + (${l} × ${h}) + (${w} × ${h})`, `2(${l} + ${w} + ${h})`], int(r, 0, 3));
          return o && { prompt: `A rectangular prism is ${l} ${u} long, ${w} ${u} wide and ${h} ${u} tall. Its net has 6 rectangular faces. Which expression gives the surface area of the prism, in ${u}²?`, ...o,
            explanation: `The net has three PAIRS of matching rectangles: two ${l} by ${w}, two ${l} by ${h} and two ${w} by ${h}, so the area is 2(${l} × ${w}) + 2(${l} × ${h}) + 2(${w} × ${h}) = ${2 * (l * w + l * h + w * h)}. ${l} × ${w} × ${h} is the volume, and leaving out the 2s counts half the faces.` };
        }
        if (shape === 1) {
          const l = int(r, 6, 14), w = int(r, 4, 9), h = int(r, 2, 7);
          if (l === w || w === h || l === h) return null;
          return { prompt: `The net of an open box with no top is made of 5 rectangles: 1 rectangle that is ${l} ${u} by ${w} ${u}, 2 rectangles that are each ${l} ${u} by ${h} ${u}, and 2 rectangles that are each ${w} ${u} by ${h} ${u}. What is the total area of the net, in ${u}²?`,
            value: l * w + 2 * l * h + 2 * w * h,
            explanation: `Bottom: ${l * w}. Sides: 2 × ${l * h} + 2 × ${w * h} = ${2 * l * h + 2 * w * h}. Total ${l * w + 2 * l * h + 2 * w * h} ${u}². There is only ONE ${l}-by-${w} face because the box has no top; ${2 * (l * w + l * h + w * h)} counts a lid.` };
        }
        if (shape === 2) {
          const s = int(r, 3, 11);
          return { prompt: `The net of a cube is made of 6 equal squares. The total area of the net is ${6 * s * s} ${u}². How long is each edge of the cube, in ${u}?`,
            value: s,
            explanation: `One square has area ${6 * s * s} ÷ 6 = ${s * s} ${u}², and ${s} × ${s} = ${s * s}, so each edge is ${s} ${u}. Dividing ${6 * s * s} by 6 gives the area of a face, not its side.` };
        }
        const s = int(r, 4, 10), l = int(r, 5, 12);
        const o = mc(`A square pyramid with surface area ${s * s + 2 * s * l} ${u}²`,
          [`A square pyramid with surface area ${s * s + 4 * s * l} ${u}²`, `A triangular prism with surface area ${s * s + 2 * s * l} ${u}²`, `A square pyramid with surface area ${2 * s * l} ${u}²`], int(r, 0, 3));
        return o && { prompt: `A net is made of 1 square with sides of ${s} ${u} and 4 triangles with a base of ${s} ${u} and a height of ${l} ${u}, one triangle attached to each side of the square. Which solid does the net fold into, and what is its surface area?`, ...o,
          explanation: `One square base with a triangle on each side folds into a square pyramid. Area: ${s * s} + 4 × ½ × ${s} × ${l} = ${s * s} + ${2 * s * l} = ${s * s + 2 * s * l} ${u}². ${s * s + 4 * s * l} forgets the ½ in the triangle areas and ${2 * s * l} leaves out the base.` };
      }) },
    ],
  },

  // ── 7. geometry applications ─────────────────────────────────────────────
  {
    courseSkill: 'g6-geometry-applications',
    skillId: 'g6-geometry-applications',
    tiers: [
      { difficulty: 2, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 0) {
          const L = int(r, 10, 16), W = int(r, 8, 12), c = int(r, 2, 4);
          return { prompt: `A rectangular room is ${L} feet long and ${W} feet wide. Carpet costs $${c} per square foot. How many dollars does it cost to carpet the whole floor?`,
            value: L * W * c,
            explanation: `Carpet covers AREA: ${L} × ${W} = ${L * W} square feet. At $${c} each, ${L * W} × ${c} = $${L * W * c}. Using the perimeter (${2 * L + 2 * W} feet) would price the edge of the room, not the floor.` };
        }
        if (shape === 1) {
          const L = int(r, 4, 9), W = pick(r, [2, 4, 6]), H = pick(r, [0.5, 1.5]);
          return { prompt: `A sandbox is a rectangular prism ${L} feet long, ${W} feet wide and ${H} feet deep. How many cubic feet of sand fill it to the top?`,
            value: L * W * H,
            explanation: `Filling means VOLUME: ${L} × ${W} × ${H} = ${L * W * H} cubic feet. The base is ${L * W} square feet, and it is filled ${H} feet deep.` };
        }
        if (shape === 2) {
          const b = int(r, 5, 12), h = int(r, 6, 15);
          if ((b * h) % 2) return null;
          return { prompt: `A triangular sail has a base of ${b} feet and a height of ${h} feet. How many square feet of cloth are in the sail?`,
            value: (b * h) / 2,
            explanation: `Area of a triangle = ½ × base × height = ½ × ${b} × ${h} = ${(b * h) / 2} square feet. ${b * h} is the area of a rectangle twice the sail's size.` };
        }
        const L = pick(r, [20, 25, 30, 35]), H = pick(r, [8, 10, 12]), q = pick(r, [40, 50, 60, 100]);
        if ((L * H) % q) return null;
        return { prompt: `A wall is ${L} feet long and ${H} feet high. One quart of paint covers ${q} square feet. How many quarts are needed to paint the wall with one coat?`,
          value: (L * H) / q,
          explanation: `The wall's area is ${L} × ${H} = ${L * H} square feet. ${L * H} ÷ ${q} = ${(L * H) / q} quarts. Paint covers area, so find square feet first, then divide by the coverage.` };
      }) },
      { difficulty: 3, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 0) {
          const e = pick(r, [2, 3]);                       // cubes have 1/e-inch edges
          const a = int(r, e + 1, 8), b = int(r, e + 1, 8), c = int(r, e + 1, 8);
          if ([a, b, c].every((v) => v % e === 0) || a * b * c > 250) return null;
          return { prompt: `A box is ${mixed(a, e)} inches long, ${mixed(b, e)} inches wide and ${mixed(c, e)} inches tall. It is packed with cubes that have 1/${e}-inch edges, with no gaps. How many cubes fill the box?`,
            value: a * b * c,
            explanation: `Count cubes along each edge by dividing by 1/${e}: ${a} long, ${b} wide and ${c} tall. ${a} × ${b} × ${c} = ${a * b * c} cubes. The number of cubes is not the volume in cubic inches — each cube is only 1/${e * e * e} cubic inch.` };
        }
        if (shape === 1) {
          const L = int(r, 4, 9), W = int(r, 2, 6), H = int(r, 2, 5);
          if (L === W || W === H || L === H) return null;
          return { prompt: `A closed wooden box is ${L} feet long, ${W} feet wide and ${H} feet tall. How many square feet must be painted to cover all 6 outside faces?`,
            value: 2 * (L * W + L * H + W * H),
            explanation: `Painting the outside is SURFACE AREA: 2(${L} × ${W}) + 2(${L} × ${H}) + 2(${W} × ${H}) = ${2 * L * W} + ${2 * L * H} + ${2 * W * H} = ${2 * (L * W + L * H + W * H)} square feet. ${L * W * H} is the volume, which measures what the box holds.` };
        }
        if (shape === 2) {
          const L = int(r, 7, 15), W = int(r, 4, 9);
          if (L === W || 2 * (L + W) === L * W) return null;
          const P = 2 * (L + W), A = L * W;
          const o = mc(`${P} meters of border and ${A} square meters of mulch`,
            [`${A} meters of border and ${P} square meters of mulch`, `${L + W} meters of border and ${A} square meters of mulch`, `${P} meters of border and ${P} square meters of mulch`], int(r, 0, 3));
          return o && { prompt: `A rectangular garden is ${L} meters long and ${W} meters wide. Dana wants to put a border around its edge and cover all the soil inside with mulch. How much border and how much mulch does she need?`, ...o,
            explanation: `The border goes AROUND, so it is the perimeter: 2(${L}) + 2(${W}) = ${P} meters. Mulch COVERS, so it is the area: ${L} × ${W} = ${A} square meters. ${L + W} counts only two of the four sides.` };
        }
        const L = pick(r, [1.5, 2.5, 3.5]), W = pick(r, [1.5, 2.5]), H = pick(r, [2, 4]);
        return { prompt: `A fish tank is a rectangular prism ${L} feet long, ${W} feet wide and ${H} feet tall. How many cubic feet of water does it hold when full?${Number.isInteger(L * W * H) ? '' : ' Write a decimal.'}`,
          value: typed(L * W * H),
          explanation: `Volume = ${L} × ${W} × ${H} = ${dec(L * W)} × ${H} = ${dec(L * W * H)} cubic feet. Rounding the edges to whole numbers before multiplying gives the wrong amount.` };
      }) },
      { difficulty: 4, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 0) {
          const N = int(r, 5, 40) * 2;
          if (N % 8 === 0) return null;
          return { prompt: `A rectangular prism is packed exactly with ${N} cubes that each have 1/2-inch edges. What is the volume of the prism, in cubic inches? Write a decimal.`,
            value: typed(N / 8),
            explanation: `Each small cube has volume ½ × ½ × ½ = 1/8 cubic inch. ${N} × 1/8 = ${dec(N / 8)} cubic inches. Dividing ${N} by 2 (${N / 2}) treats each cube as half a cubic inch.` };
        }
        if (shape === 1) {
          const L = int(r, 10, 16), W = int(r, 8, 12), H = int(r, 8, 10);
          if (L === W) return null;
          return { prompt: `A room is ${L} feet long, ${W} feet wide and ${H} feet high. Ana paints the four walls and the ceiling, but not the floor. How many square feet does she paint?`,
            value: 2 * H * (L + W) + L * W,
            explanation: `Walls: 2(${L} × ${H}) + 2(${W} × ${H}) = ${2 * L * H} + ${2 * W * H} = ${2 * H * (L + W)}. Ceiling: ${L} × ${W} = ${L * W}. Total ${2 * H * (L + W) + L * W} square feet. The full surface area (${2 * H * (L + W) + 2 * L * W}) wrongly includes the floor.` };
        }
        if (shape === 2) {
          const a = int(r, 8, 14), b = int(r, 6, 10), c = int(r, 3, 6), d = int(r, 2, 5), cost = int(r, 3, 6);
          return { prompt: `An L-shaped floor is made of a ${a}-foot by ${b}-foot rectangle joined to a ${c}-foot by ${d}-foot rectangle, with no overlap. Flooring costs $${cost} per square foot. How many dollars does it cost to cover the whole floor?`,
            value: (a * b + c * d) * cost,
            explanation: `Add the two rectangles: ${a} × ${b} = ${a * b} and ${c} × ${d} = ${c * d}, so ${a * b + c * d} square feet. Cost: ${a * b + c * d} × $${cost} = $${(a * b + c * d) * cost}. Multiplying all four lengths together is not an area.` };
        }
        const L = pick(r, [10, 12, 20, 24]), W = pick(r, [8, 10, 12]), depth = int(r, 3, 12) + 0.5;
        return { prompt: `A fish tank has a rectangular base ${L} inches long and ${W} inches wide. It holds ${L * W * depth} cubic inches of water. How deep is the water, in inches? Write a decimal.`,
          value: typed(depth),
          explanation: `Volume = length × width × depth, so depth = ${L * W * depth} ÷ (${L} × ${W}) = ${L * W * depth} ÷ ${L * W} = ${depth} inches. Divide the volume by the AREA of the base, not by one edge.` };
      }) },
    ],
  },

  // ── 8. statistical questions ─────────────────────────────────────────────
  {
    courseSkill: 'g6-statistical-questions',
    skillId: 'g6-statistical-questions',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const t = THEMES[idx % 4];
        const right = idx % 2 === 0 ? t.num : t.cat;
        const o = mc(right, shuffle(r, t.fixed), int(r, 0, 3));
        return { prompt: `A class is collecting data about ${t.topic}. Which of these is a statistical question?`, ...o,
          explanation: 'A statistical question expects answers that VARY, so it takes data from many people or days to answer. The other three questions each have one fixed answer that can be looked up or asked once.' };
      } },
      { difficulty: 3, gen: (r, idx) => {
        const t = THEMES[4 + (idx % 4)];
        if (idx % 2 === 0) {
          const o = mc(pick(r, t.fixed), shuffle(r, [t.num, t.cat, t.more]), int(r, 0, 3));
          return { prompt: `A class is collecting data about ${t.topic}. Which of these is NOT a statistical question?`, ...o,
            explanation: `"${o.value}" has a single answer, with no variability to describe. Each of the other three would get different answers from different people or days, which is what makes a question statistical.` };
        }
        const o = mc(WHY_RIGHT, WHY_WRONG, int(r, 0, 3));
        return { prompt: `A class studying ${t.topic} asks: "${t.num}" Which statement explains why this is a statistical question?`, ...o,
          explanation: 'What makes a question statistical is VARIABILITY in the answers — the data will differ, so it has to be collected and summarized. Having a number for an answer, or being about a school, is not enough.' };
      } },
      { difficulty: 4, gen: (r, idx) => {
        if (idx % 2 === 0) {
          const t = THEMES[idx % 4 === 0 ? 0 : 7];
          const o = mc(t.num, shuffle(r, [t.cat, t.fixed[0], t.fixed[2]]), int(r, 0, 3));
          return { prompt: `A class is collecting data about ${t.topic}. Which question would produce NUMERICAL data that varies?`, ...o,
            explanation: `"${t.num}" gets a number from each person, and the numbers differ. "${t.cat}" also varies, but its answers are categories, not numbers. "${t.fixed[0]}" has a number for an answer, but only one — nothing varies.` };
        }
        const w = REWRITES[idx % 4 === 1 ? 0 : 1];
        const o = mc(w.right, shuffle(r, w.wrong), int(r, 0, 3));
        return { prompt: `"${w.original}" is not a statistical question. Which rewrite turns it into a statistical question?`, ...o,
          explanation: `"${w.right}" asks about a whole group, so the answers will vary and data must be collected. The other rewrites still ask about one person and still have a single answer.` };
      } },
    ],
  },

  // ── 9. data displays ─────────────────────────────────────────────────────
  {
    courseSkill: 'g6-data-displays',
    skillId: 'g6-data-displays',
    tiers: [
      { difficulty: 2, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 2) {
          const start = pick(r, [0, 10, 20, 50]);
          const counts = [int(r, 1, 6), int(r, 2, 9), int(r, 2, 9), int(r, 1, 6)];
          const top = Math.max(...counts);
          if (counts.filter((c) => c === top).length !== 1) return null;
          const ints = counts.map((c, i) => `${start + 10 * i}–${start + 10 * i + 9}`);
          const which = counts.indexOf(top);
          return { prompt: `A histogram of the ages of people at a picnic has these bars (age interval: number of people) — ${ints.map((t, i) => `${t}: ${counts[i]}`).join(', ')}. Which interval has the most people?`,
            value: ints[which], options: ints, correctOption: LETTERS[which],
            explanation: `The tallest bar is the one with the greatest count: ${top} people in the interval ${ints[which]}. The bar farthest to the right shows the oldest ages, not the most people.` };
        }
        const lo = shape === 0 ? int(r, 4, 6) : int(r, 0, 1);
        const pairs = [0, 1, 2, 3, 4].map((i) => [lo + i, int(r, 1, 6)]);
        const data = expandCounts(pairs);
        if (shape === 0) {
          return { prompt: `A dot plot of quiz scores has this many dots above each score (score: dots) — ${listPairs(pairs)}. How many quiz scores are on the dot plot in all?`,
            value: data.length,
            explanation: `Each dot is one score, so add the dots: ${pairs.map((p) => p[1]).join(' + ')} = ${data.length}. Counting the ${pairs.length} different score values is the slip.` };
        }
        if (shape === 1) {
          const cut = lo + int(r, 2, 3);
          return { prompt: `A frequency table lists how many books students read last month (books: students) — ${listPairs(pairs)}. How many students read at least ${cut} books?`,
            value: data.filter((v) => v >= cut).length,
            explanation: `"At least ${cut}" means ${cut} or more: ${pairs.filter((p) => p[0] >= cut).map((p) => p[1]).join(' + ')} = ${data.filter((v) => v >= cut).length} students. Leaving out the students who read exactly ${cut} is the usual slip.` };
        }
        const top = Math.max(...pairs.map((p) => p[1]));
        if (pairs.filter((p) => p[1] === top).length !== 1) return null;
        const best = pairs.find((p) => p[1] === top)[0];
        if (best === top) return null;
        return { prompt: `A dot plot of the number of goals a team scored in each game has this many dots above each number (goals: dots) — ${listPairs(pairs)}. Which number of goals did the team score in the most games?`,
          value: best,
          explanation: `The tallest stack has ${top} dots, above the number ${best}. The answer is the VALUE under the tallest stack (${best}), not the number of dots in it (${top}).` };
      }) },
      { difficulty: 3, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 2) {
          const start = pick(r, [50, 60]);
          const counts = [int(r, 1, 6), int(r, 2, 9), int(r, 2, 9), int(r, 1, 6)];
          const k = int(r, 2, 3);
          const ints = counts.map((c, i) => `${start + 10 * i}–${start + 10 * i + 9}`);
          return { prompt: `A histogram of test scores has these bars (score interval: number of students) — ${ints.map((t, i) => `${t}: ${counts[i]}`).join(', ')}. How many students scored less than ${start + 10 * k}?`,
            value: sum(counts.slice(0, k)),
            explanation: `Scores less than ${start + 10 * k} are in the first ${k} bars: ${counts.slice(0, k).join(' + ')} = ${sum(counts.slice(0, k))} students. The bar that STARTS at ${start + 10 * k} is not included.` };
        }
        const lo = shape === 1 ? int(r, 4, 6) : int(r, 0, 1);
        const pairs = [0, 1, 2, 3, 4].map((i) => [lo + i, int(r, 1, 5)]);
        const data = expandCounts(pairs);
        if (shape === 0) {
          if (data.length % 2 === 0) return null;
          return { prompt: `A dot plot of the number of pets in each home on a street has this many dots above each number (pets: dots) — ${listPairs(pairs)}. What is the median number of pets?`,
            value: median(data),
            explanation: `There are ${data.length} dots, so the median is the ${(data.length + 1) / 2}th value when counting up from the left: ${median(data)}. Count dots, not columns — the middle column (${lo + 2}) is not automatically the median.` };
        }
        if (shape === 1) {
          const span = int(r, 3, 5);
          const rp = Array.from({ length: span + 1 }, (_, i) => [lo + i, (i === 0 || i === span) ? int(r, 1, 4) : int(r, 0, 4)]);
          const withZeros = [[lo - 1, 0], ...rp, [lo + span + 1, 0]];
          return { prompt: `A dot plot of the number of hours students slept has this many dots above each number (hours: dots) — ${listPairs(withZeros)}. What is the range of the data?`,
            value: span,
            explanation: `The least value WITH a dot is ${lo} and the greatest is ${lo + span}, so the range is ${lo + span} − ${lo} = ${span}. ${lo - 1} and ${lo + span + 1} are on the axis but have no dots, so they are not data, and the range is not the difference of the dot counts.` };
        }
        const cut = lo + int(r, 2, 3);
        const part = data.filter((v) => v >= cut).length;
        if (gcd(part, data.length) === 1) return null;
        return { prompt: `A frequency table lists how many siblings each student has (siblings: students) — ${listPairs(pairs)}. What fraction of the students have at least ${cut} siblings? Write a fraction in lowest terms.`,
          value: frac(part, data.length),
          explanation: `${part} students have ${cut} or more siblings, out of ${data.length} students in all: ${part}/${data.length} = ${frac(part, data.length)}. The denominator is the total of the counts, not the number of rows.` };
      }) },
      { difficulty: 4, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 2) {
          const start = pick(r, [0, 10, 50]);
          const counts = [int(r, 2, 9), int(r, 2, 9), int(r, 2, 9), int(r, 1, 5)];
          const n = sum(counts);
          const top = Math.max(...counts);
          if (n % 2 === 0 || counts.filter((c) => c === top).length !== 1) return null;
          const ints = counts.map((c, i) => `${start + 10 * i}–${start + 10 * i + 9}`);
          let seen = 0, medAt = -1;
          counts.forEach((c, i) => { if (medAt < 0 && seen + c >= (n + 1) / 2) medAt = i; seen += c; });
          const tall = counts.indexOf(top);
          if (tall === medAt) return null;
          const o = mc(`The median is in the interval ${ints[medAt]}.`,
            [`The median is in the interval ${ints[tall]}.`, `The greatest value is exactly ${start + 39}.`, `Exactly ${counts[0]} values are equal to ${start}.`], int(r, 0, 3));
          return o && { prompt: `A histogram of ${n} data values has these bars (interval: count) — ${ints.map((t, i) => `${t}: ${counts[i]}`).join(', ')}. Which statement must be true?`, ...o,
            explanation: `With ${n} values the median is the ${(n + 1) / 2}th. Adding counts from the left reaches it in ${ints[medAt]}. The tallest bar (${ints[tall]}) is the most common interval, not the median, and a histogram never tells the exact values inside a bar.` };
        }
        const lo = shape === 0 ? int(r, 9, 12) : (shape === 1 ? int(r, 0, 2) : int(r, 4, 6));
        const pairs = [0, 1, 2, 3, 4].map((i) => [lo + i, int(r, 0, 4)]);
        if (pairs[0][1] === 0 || pairs[4][1] === 0) return null;
        const data = expandCounts(pairs);
        if (shape === 0) {
          const m = median(data);
          if (data.length % 2 || Number.isInteger(m)) return null;
          return { prompt: `A dot plot of the ages of the players on a team has this many dots above each age (age: dots) — ${listPairs(pairs)}. What is the median age? Write a decimal.`,
            value: typed(m),
            explanation: `There are ${data.length} dots, an even number, so the median is halfway between the ${data.length / 2}th and ${data.length / 2 + 1}th values: ${m - 0.5} and ${m + 0.5}, giving ${m}. Taking just one of the two middle values is the slip.` };
        }
        if (shape === 1) {
          if (sum(data) % data.length || data.length < 8) return null;
          return { prompt: `A frequency table lists the number of goals a team scored in each game (goals: games) — ${listPairs(pairs)}. What is the mean number of goals per game?`,
            value: mean(data),
            explanation: `Total goals: ${pairs.map((p) => `${p[0]} × ${p[1]}`).join(' + ')} = ${sum(data)}. Games: ${data.length}. Mean = ${sum(data)} ÷ ${data.length} = ${mean(data)}. Averaging the five goal values without their counts ignores how often each happened.` };
        }
        if (data.length !== 10) return null;
        const q = iqr(data);
        if (q === 0) return null;
        const s = asc(data);
        return { prompt: `A dot plot of 10 quiz scores has this many dots above each score (score: dots) — ${listPairs(pairs)}. What is the interquartile range (IQR) of the scores?`,
          value: q,
          explanation: `In order, the lower half is the first 5 scores, so Q1 is its middle value, ${s[2]}. The upper half is the last 5, so Q3 is ${s[7]}. IQR = ${s[7]} − ${s[2]} = ${q}. The range (${range(data)}) uses the two extremes instead of the quartiles.` };
      }) },
    ],
  },

  // ── 10. comparing distributions ──────────────────────────────────────────
  {
    courseSkill: 'g6-compare-distributions',
    skillId: 'g6-compare-distributions',
    tiers: [
      { difficulty: 2, gen: (r, idx) => until(() => {
        const A = asc([1, 2, 3, 4, 5].map(() => int(r, 2, 15)));
        const B = asc([1, 2, 3, 4, 5].map(() => int(r, 4, 20)));
        const lead = `Two classes recorded quiz scores. Class A: ${A.join(', ')}. Class B: ${B.join(', ')}.`;
        const shape = idx % 4;
        if (shape === 0) {
          if (median(A) === median(B)) return null;
          return { prompt: `${lead} What is the difference between the two medians?`,
            value: Math.abs(median(A) - median(B)),
            explanation: `Each list is in order with 5 values, so the median is the 3rd: ${median(A)} for Class A and ${median(B)} for Class B. The difference is ${Math.abs(median(A) - median(B))}. The median is the middle value, not the average.` };
        }
        if (shape === 1) {
          if (range(A) === range(B)) return null;
          return { prompt: `${lead} What is the difference between the two ranges?`,
            value: Math.abs(range(A) - range(B)),
            explanation: `Range = greatest − least. Class A: ${A[4]} − ${A[0]} = ${range(A)}. Class B: ${B[4]} − ${B[0]} = ${range(B)}. The ranges differ by ${Math.abs(range(A) - range(B))}. Range measures spread, not center.` };
        }
        if (shape === 2) {
          if (sum(A) % 5 || sum(B) % 5 || mean(A) === mean(B)) return null;
          return { prompt: `${lead} What is the difference between the two means?`,
            value: Math.abs(mean(A) - mean(B)),
            explanation: `Class A: ${sum(A)} ÷ 5 = ${mean(A)}. Class B: ${sum(B)} ÷ 5 = ${mean(B)}. The means differ by ${Math.abs(mean(A) - mean(B))}. Add all five values and divide by 5 for each class.` };
        }
        if (median(A) === median(B) || range(A) === range(B)) return null;
        const OPTS = ['Class A has the greater median and the greater range.', 'Class A has the greater median, and Class B has the greater range.',
          'Class B has the greater median, and Class A has the greater range.', 'Class B has the greater median and the greater range.'];
        const which = (median(A) > median(B) ? 0 : 2) + ((range(A) > range(B)) === (median(A) > median(B)) ? (median(A) > median(B) ? 0 : 1) : (median(A) > median(B) ? 1 : 0));
        return { prompt: `${lead} Which statement is true?`,
          value: OPTS[which], options: OPTS, correctOption: LETTERS[which],
          explanation: `Medians (3rd of 5): Class A ${median(A)}, Class B ${median(B)}. Ranges: Class A ${A[4]} − ${A[0]} = ${range(A)}, Class B ${B[4]} − ${B[0]} = ${range(B)}. Center and spread are separate comparisons — a class can win one and not the other.` };
      }) },
      { difficulty: 3, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 1) {
          const lo = int(r, 10, 30);
          if (int(r, 0, 1) === 0) {
            const cluster = [1, 2, 3, 4, 5, 6, 7].map(() => lo + int(r, 0, 5));
            if (range(cluster) !== 5) return null;
            const out = lo + int(r, 22, 30);
            const data = shuffle(r, [...cluster, out]);
            const o = mc(`Clustered from ${lo} to ${lo + 5}, with one outlier at ${out}`,
              [`Clustered around ${out}, with one outlier at ${lo}`, `Spread evenly from ${lo} to ${out}, with no gaps`, 'Two clusters of the same size, with a gap between them'], int(r, 0, 3));
            return o && { prompt: `The ages of the people in a club are ${data.join(', ')}. Which best describes the shape of the data?`, ...o,
              explanation: `In order: ${asc(data).join(', ')}. Seven of the eight values sit between ${lo} and ${lo + 5}, and ${out} is far from all of them — an outlier. One far-away value does not make a second cluster.` };
          }
          const c1 = [1, 2, 3, 4].map(() => lo + int(r, 0, 3)), c2 = [1, 2, 3, 4].map(() => lo + 20 + int(r, 0, 3));
          if (range(c1) !== 3 || range(c2) !== 3) return null;
          const data = shuffle(r, [...c1, ...c2]);
          const o = mc(`Two clusters, ${lo} to ${lo + 3} and ${lo + 20} to ${lo + 23}, with a gap between them`,
            [`Clustered from ${lo} to ${lo + 3}, with one outlier at ${lo + 23}`, `Spread evenly from ${lo} to ${lo + 23}, with no gaps`, `Clustered from ${lo + 20} to ${lo + 23}, with one outlier at ${lo}`], int(r, 0, 3));
          return o && { prompt: `The ages of the people in a club are ${data.join(', ')}. Which best describes the shape of the data?`, ...o,
            explanation: `In order: ${asc(data).join(', ')}. Four values are from ${lo} to ${lo + 3}, four are from ${lo + 20} to ${lo + 23}, and nothing lies between ${lo + 3} and ${lo + 20} — a gap between two clusters. An outlier is a single value far from the rest, not a group of four.` };
        }
        const n = 6;
        const A = Array.from({ length: n }, () => int(r, 3, 18));
        const B = Array.from({ length: n }, () => int(r, 5, 24));
        if (shape === 0) {
          if (iqr(A) === iqr(B)) return null;
          const sa = asc(A), sb = asc(B);
          return { prompt: `Two teams recorded points per game. Team A: ${A.join(', ')}. Team B: ${B.join(', ')}. What is the difference between the two interquartile ranges (IQRs)?`,
            value: Math.abs(iqr(A) - iqr(B)),
            explanation: `Order each list and split it into a lower three and an upper three. Team A: ${sa.join(', ')}, so Q1 = ${sa[1]}, Q3 = ${sa[4]}, IQR = ${iqr(A)}. Team B: ${sb.join(', ')}, so Q1 = ${sb[1]}, Q3 = ${sb[4]}, IQR = ${iqr(B)}. Difference: ${Math.abs(iqr(A) - iqr(B))}. Forgetting to put the values in order first is the usual slip.` };
        }
        if (shape === 2) {
          if (range(A) === range(B) || median(A) === median(B)) return null;
          const [X, Y, rx, ry, mx, my] = range(A) < range(B) ? ['Team A', 'Team B', range(A), range(B), median(A), median(B)] : ['Team B', 'Team A', range(B), range(A), median(B), median(A)];
          if (mx >= my) return null;                       // the steadier team has the LOWER median
          const o = mc(`${X} is more consistent, because its range is ${rx} and ${Y}'s range is ${ry}.`,
            [`${Y} is more consistent, because its range is ${ry} and ${X}'s range is ${rx}.`,
              `${X} is more consistent, because its median is greater than ${Y}'s.`,
              `${Y} is more consistent, because its median is greater than ${X}'s.`], int(r, 0, 3));
          return o && { prompt: `Two teams recorded points per game. Team A: ${A.join(', ')}. Team B: ${B.join(', ')}. Which statement correctly compares how consistent the two teams' scores are?`, ...o,
            explanation: `Consistency is about SPREAD: the smaller the range, the closer together the scores. ${X}'s range is ${rx} and ${Y}'s is ${ry}, so ${X} is more consistent. ${Y} has the greater median (${my} against ${mx}), but the median measures center, not consistency.` };
        }
        if (sum(A) % n || sum(B) % n || mean(A) === mean(B)) return null;
        return { prompt: `Two teams recorded points per game. Team A: ${A.join(', ')}. Team B: ${B.join(', ')}. By how many points does the greater mean exceed the smaller mean?`,
          value: Math.abs(mean(A) - mean(B)),
          explanation: `Team A: ${sum(A)} ÷ 6 = ${mean(A)}. Team B: ${sum(B)} ÷ 6 = ${mean(B)}. The difference is ${Math.abs(mean(A) - mean(B))} points. Divide each total by the number of games, 6.` };
      }) },
      { difficulty: 4, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 0) {
          const base = asc(Array.from({ length: 5 }, () => int(r, 4, 16)));
          if (new Set(base).size < 4 || base[3] === base[4]) return null;
          const D = pick(r, [4, 6, 8, 10]);
          const B = base.slice(0, 4).concat(base[4] + 5 * D);
          const o = mc(`The medians are equal, and the mean of Set B is ${D} greater.`,
            [`The means are equal, and the median of Set B is ${D} greater.`, `The mean and the median of Set B are both ${D} greater.`, `The medians are equal, and the mean of Set B is ${5 * D} greater.`], int(r, 0, 3));
          return o && { prompt: `Set A: ${base.join(', ')}. Set B: ${B.join(', ')}. Which statement correctly compares the two sets?`, ...o,
            explanation: `Both sets have the same middle value, ${base[2]}, so the medians are equal. Set B's total is ${5 * D} more, and ${5 * D} ÷ 5 = ${D}, so its mean is ${D} greater. One very large value pulls the mean up but leaves the median alone.` };
        }
        if (shape === 1) {
          const m = int(r, 12, 30);
          const [a, b, c, d] = [int(r, 1, 4), int(r, 2, 6), int(r, 3, 9), int(r, 4, 11)];
          if ((a + b) % 2 || (c + d) % 2 || a + b === c + d || a === b || c === d) return null;
          const A = shuffle(r, [m - a, m + a, m - b, m + b]), B = shuffle(r, [m - c, m + c, m - d, m + d]);
          return { prompt: `Set A: ${A.join(', ')}. Set B: ${B.join(', ')}. Both sets have a mean of ${m}. What is the difference between the mean absolute deviations (MADs) of the two sets?`,
            value: Math.abs(a + b - c - d) / 2,
            explanation: `MAD is the average distance from the mean. Set A's distances from ${m} are ${A.map((v) => Math.abs(v - m)).join(', ')}, so MAD = ${2 * (a + b)} ÷ 4 = ${(a + b) / 2}. Set B's are ${B.map((v) => Math.abs(v - m)).join(', ')}, so MAD = ${2 * (c + d)} ÷ 4 = ${(c + d) / 2}. Difference: ${Math.abs(a + b - c - d) / 2}. Distances are never negative.` };
        }
        if (shape === 2) {
          const A = Array.from({ length: 6 }, () => int(r, 3, 20)), B = Array.from({ length: 6 }, () => int(r, 3, 20));
          if (median(A) === median(B) || iqr(A) === iqr(B)) return null;
          const medA = median(A) > median(B), iqrA = iqr(A) > iqr(B);
          if (medA === iqrA) return null;
          const OPTS = ['Set A has the greater median and the greater IQR.', 'Set A has the greater median, and Set B has the greater IQR.',
            'Set B has the greater median, and Set A has the greater IQR.', 'Set B has the greater median and the greater IQR.'];
          const which = medA ? 1 : 2;
          const sa = asc(A), sb = asc(B);
          return { prompt: `Set A: ${A.join(', ')}. Set B: ${B.join(', ')}. Which statement is true?`,
            value: OPTS[which], options: OPTS, correctOption: LETTERS[which],
            explanation: `In order, Set A is ${sa.join(', ')}: median ${median(A)}, IQR ${sa[4]} − ${sa[1]} = ${iqr(A)}. Set B is ${sb.join(', ')}: median ${median(B)}, IQR ${sb[4]} − ${sb[1]} = ${iqr(B)}. The set with the higher center is not the one with the wider middle half here.` };
        }
        const A = Array.from({ length: 4 }, () => int(r, 5, 20)), B = Array.from({ length: 6 }, () => int(r, 5, 24));
        if (sum(A) % 4 || sum(B) % 6 || mean(A) === mean(B)) return null;
        return { prompt: `Group A has 4 students with scores ${A.join(', ')}. Group B has 6 students with scores ${B.join(', ')}. By how many points does the greater mean exceed the smaller mean?`,
          value: Math.abs(mean(A) - mean(B)),
          explanation: `Group A: ${sum(A)} ÷ 4 = ${mean(A)}. Group B: ${sum(B)} ÷ 6 = ${mean(B)}. Difference: ${Math.abs(mean(A) - mean(B))}. Each total is divided by its OWN group size; comparing the totals (${sum(A)} and ${sum(B)}) is unfair because the groups are different sizes.` };
      }) },
    ],
  },

  // ── 11. positive and negative numbers in context ─────────────────────────
  {
    courseSkill: 'g6-positive-negative-context',
    skillId: 'g6-positive-negative-context',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const shape = idx % 4;
        const n = shape === 3 ? int(r, 2, 15) : int(r, 3, 60);
        if (shape === 0) {
          const s = pick(r, [
            { text: `A submarine is ${n} feet below sea level. Sea level is 0. Which integer represents the submarine's elevation, in feet?`, sign: -1 },
            { text: `A scuba diver is ${n} feet below sea level. Sea level is 0. Which integer represents the diver's elevation, in feet?`, sign: -1 },
          ]);
          return { prompt: s.text, value: typed(s.sign * n),
            explanation: `Below sea level is the negative side of 0, so the integer is −${n}. Writing ${n} without the sign would mean ${n} feet ABOVE sea level.` };
        }
        if (shape === 1) {
          const c = pick(r, [
            { text: 'Elevations of places on a map are written as positive and negative numbers of feet.', right: 'Sea level', wrong: ['The top of the highest mountain', 'The bottom of the ocean', 'An elevation that cannot be measured'] },
            { text: 'A bank records money put into an account as a positive number and money taken out as a negative number.', right: 'No money was put in or taken out', wrong: ['The account was closed', 'The largest amount ever taken out', 'A mistake was made by the bank'] },
            { text: 'An elevator shows floors above the lobby as positive numbers and parking levels below the lobby as negative numbers.', right: 'The lobby', wrong: ['The top floor', 'The lowest parking level', 'A floor that does not exist'] },
            { text: 'A game gives positive points for right answers and negative points for wrong answers.', right: 'A turn with no points gained or lost', wrong: ['The highest score possible', 'The lowest score possible', 'A turn that does not count'] },
          ]);
          const o = mc(c.right, c.wrong, int(r, 0, 3));
          return { prompt: `${c.text} What does 0 represent in this situation?`, ...o,
            explanation: `Zero is the starting point that positive and negative values are measured from: here, "${c.right.toLowerCase()}". It is a real, meaningful value — not "nothing" and not the smallest value.` };
        }
        if (shape === 2) {
          const s = pick(r, [
            { text: `The temperature in a town is ${n} degrees below zero. Which integer represents the temperature, in degrees?`, sign: -1 },
            { text: `Leo makes a withdrawal of $${n} from his account. Which integer represents the change in his account balance, in dollars?`, sign: -1 },
            { text: `A hot-air balloon rises ${n} meters above the ground. The ground is 0. Which integer represents the balloon's height, in meters?`, sign: 1 },
          ]);
          return { prompt: s.text, value: typed(s.sign * n),
            explanation: s.sign < 0
              ? `Below zero and a withdrawal are on the negative side of 0, so the integer is −${n}. A positive ${n} would mean above zero or a deposit.`
              : `Above the ground is the positive side of 0, so the integer is ${n}. A negative number would mean below the ground.` };
        }
        const o = mc(`A loss of ${n} yards in a football game`, [`A gain of ${n} yards in a football game`, `An elevation of ${n} feet above sea level`, `A deposit of $${n} in a bank account`], int(r, 0, 3));
        return { prompt: `Which situation can be represented by the integer −${n}?`, ...o,
          explanation: `A negative integer describes a quantity on the "below" or "less" side of zero — a loss. A gain, a height above sea level and a deposit are all represented by +${n}.` };
      } },
      { difficulty: 3, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 0) {
          const a = int(r, 2, 12), b = a + int(r, 3, 14);
          const [x, y] = int(r, 0, 1) ? [a, b] : [b, a];
          return { prompt: `The low temperature was −${x}°C in Ashton and −${y}°C in Belmont. How many degrees colder was the colder town?`,
            value: b - a,
            explanation: `−${b} is farther below zero than −${a}, so it is colder. The two temperatures are ${b} and ${a} units below 0, so they are ${b} − ${a} = ${b - a} degrees apart. Adding to get ${a + b} would be right only if one were above zero.` };
        }
        if (shape === 1) {
          const up = int(r, 15, 90), down = int(r, 10, 70);
          return { prompt: `A bird flies ${up} feet above sea level. A fish swims ${down} feet below sea level, directly under the bird. How many feet apart are the bird and the fish?`,
            value: up + down,
            explanation: `The bird is ${up} feet from sea level on one side and the fish is ${down} feet from it on the other, so the distance is ${up} + ${down} = ${up + down} feet. Subtracting (${Math.abs(up - down)}) works only when both are on the same side of 0.` };
        }
        if (shape === 2) {
          const a = int(r, 10, 40), b = a + int(r, 5, 30);
          const [na, nb] = int(r, 0, 1) ? ['Ana', 'Ben'] : ['Ben', 'Ana'];     // na owes a, nb owes b (more)
          const o = mc(`${nb} owes more money, because −${b} is less than −${a}.`,
            [`${na} owes more money, because −${a} is greater than −${b}.`, `${nb} has more money, because ${b} is greater than ${a}.`, 'They owe the same amount, because both balances are negative.'], int(r, 0, 3));
          return o && { prompt: `${na}'s account balance is −$${a} and ${nb}'s account balance is −$${b}. A negative balance is money owed. Which statement is true?`, ...o,
            explanation: `−${b} is farther below zero than −${a}, so −${b} < −${a}: ${nb} has the lower balance and owes more ($${b} against $${a}). A lower negative balance means a LARGER debt.` };
        }
        const up = int(r, 3, 15), down = int(r, 1, 4);
        return { prompt: `In a building, the lobby is floor 0, floors above it are positive, and parking levels below it are negative. An elevator goes from floor ${up} to floor −${down}. How many floors does it travel?`,
          value: up + down,
          explanation: `From floor ${up} down to the lobby is ${up} floors, and from the lobby down to −${down} is ${down} more: ${up} + ${down} = ${up + down} floors. Subtracting ${down} from ${up} ignores that the two floors are on opposite sides of 0.` };
      }) },
      { difficulty: 4, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 0) {
          const vals = [-int(r, 2, 25), -int(r, 2, 25), int(r, 1, 20), pick(r, [0, int(r, 1, 20)])];
          if (new Set(vals.map(Math.abs)).size !== 4) return null;
          const o = orderOptions(shuffle(r, vals).map((v) => ({ t: show(v), v })), false, int(r, 0, 3));
          const listed = o && shuffle(r, vals).map(show).join(', ');
          return o && { prompt: `Four cities recorded these temperatures, in °C: ${listed}. Which list orders the temperatures from coldest to warmest?`, ...o,
            explanation: `Coldest means farthest below zero, so the negatives come first, with the one farther from 0 before the other; then ${vals[3] === 0 ? '0, then ' : ''}the positive values. The correct order is ${o.value}. Ordering by the size of the digits puts the negatives backwards.` };
        }
        if (shape === 1) {
          const n = int(r, 12, 85);
          return { prompt: `A bird is at an elevation of ${n} feet. A fish is at the opposite elevation. Sea level is 0. How many feet apart are the bird and the fish?`,
            value: 2 * n,
            explanation: `The opposite of ${n} is −${n}: the fish is ${n} feet below sea level. Each is ${n} feet from 0 on opposite sides, so they are ${n} + ${n} = ${2 * n} feet apart. Opposites are the same distance from 0, so the answer is not 0.` };
        }
        if (shape === 2) {
          const a = -int(r, 20, 70), b = int(r, 20, 70), c = -int(r, 20, 70);
          const d = [a, b, c].map(Math.abs);
          if (new Set(d).size !== 3 || Math.min(...d) === b) return null;     // a negative place is closest
          const best = [a, b, c][d.indexOf(Math.min(...d))];
          return { prompt: `Three places have these elevations, with sea level at 0: a cave at ${show(a)} meters, a hill at ${show(b)} meters, and a well at ${show(c)} meters. What is the elevation, in meters, of the place closest to sea level?`,
            value: typed(best),
            explanation: `Distance from sea level ignores the sign: ${d[0]}, ${d[1]} and ${d[2]} meters. The smallest distance is ${Math.min(...d)}, so the closest place is at ${show(best)} meters. The least number (${show(Math.min(a, b, c))}) is the LOWEST place, not the closest to 0.` };
        }
        const temps = shuffle(r, [-int(r, 2, 15), -int(r, 2, 15), int(r, 1, 12), -int(r, 1, 15)]);
        if (new Set(temps).size !== 4) return null;
        const hi = Math.max(...temps), lo = Math.min(...temps);
        return { prompt: `The low temperatures on four days were ${temps.map(show).join(', ')} degrees Celsius. How many degrees apart are the coldest and the warmest of these temperatures?`,
          value: hi - lo,
          explanation: `The coldest is ${show(lo)} and the warmest is ${hi}. They are on opposite sides of 0, so the distance is ${-lo} + ${hi} = ${hi - lo} degrees. The coldest is the negative farthest from zero, not the one with the smallest digits.` };
      }) },
    ],
  },

  // ── 12. compare and order rational numbers ───────────────────────────────
  {
    courseSkill: 'g6-compare-order-rationals',
    skillId: 'g6-compare-order-rationals',
    tiers: [
      { difficulty: 2, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        const halves = () => until(() => {
          const vals = [1, 2, 3, 4].map(() => int(r, -12, 12) / 2);
          const negs = vals.filter((v) => v < 0).length;
          if (new Set(vals.map(Math.abs)).size !== 4 || negs < 2 || negs === 4) return null;
          return vals.some((v) => !Number.isInteger(v)) ? vals : null;
        });
        if (shape === 0) {
          const vals = halves();
          const o = orderOptions(vals.map((v) => ({ t: show(v), v })), false, int(r, 0, 3));
          return o && { prompt: `Which list orders the numbers ${vals.map(show).join(', ')} from least to greatest?`, ...o,
            explanation: `On a number line, numbers farther left are less. The negatives come first, with the one farthest from 0 being the least, then the positives: ${o.value}. Ordering by distance from 0 treats each negative number as if it were positive.` };
        }
        if (shape === 1) {
          const vals = until(() => {
            const v = [1, 2, 3, 4].map(() => -int(r, 1, 39) / 4);
            v[int(r, 0, 3)] = int(r, 1, 8) / 4;
            return new Set(v).size === 4 ? v : null;
          });
          return { prompt: `Which of these numbers is the least: ${vals.map(show).join(', ')}? Write a decimal.`,
            value: typed(Math.min(...vals)),
            explanation: `The least number is the one farthest LEFT on the number line — the negative farthest from zero, ${show(Math.min(...vals))}. Among negatives, the one that "looks biggest" is actually the least.` };
        }
        if (shape === 2) {
          const a = int(r, 1, 5), b = a + int(r, 2, 6);
          const c = int(r, 1, 4) + 0.5, d = c + int(r, 1, 4), e = int(r, 1, 9), f = int(r, 2, 9) + 0.5, g = f - int(r, 1, 2);
          const o = mc(`−${b} < −${a}`, [`−${dec(c)} < −${dec(d)}`, `0 < −${e}`, `−${dec(f)} > −${dec(g)}`], int(r, 0, 3));
          return o && { prompt: `Which of these inequalities is true?`, ...o,
            explanation: `−${b} is to the left of −${a} on the number line, so −${b} < −${a}. In each of the other choices the number farther from zero on the negative side is wrongly called the greater one, or a negative is called greater than 0.` };
        }
        const w = int(r, 1, 7);
        const o = mc(`Halfway between −${w + 1} and −${w}`, [`Halfway between −${w} and −${w - 1 === 0 ? '0' : w - 1}`.replace('−0', '0'), `Halfway between ${w} and ${w + 1}`, `Halfway between −${w + 2} and −${w + 1}`], int(r, 0, 3));
        return o && { prompt: `Where is −${w}.5 located on a horizontal number line?`, ...o,
          explanation: `−${w}.5 is ${w}.5 units to the LEFT of 0, which puts it between −${w + 1} and −${w}. It is farther from zero than −${w}, so it cannot be between −${w} and ${w - 1 === 0 ? '0' : `−${w - 1}`}.` };
      }) },
      { difficulty: 3, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 0) {
          const nums = drawRationals(r, ['fraction', 'fraction', 'decimal', 'decimal']);
          const listed = shuffle(r, nums);
          const o = orderOptions(nums, false, int(r, 0, 3));
          return o && { prompt: `Which list orders the numbers ${listed.map((n) => n.t).join(', ')} from least to greatest?`, ...o,
            explanation: `Write each as a decimal: ${listed.map((n) => `${n.t} = ${show(n.v)}`).join(', ')}. Negatives come first, farthest from 0 first: ${o.value}. Comparing negatives as if they were positive reverses their order.` };
        }
        if (shape === 1) {
          const a = int(r, 2, 9), b = a + int(r, 2, 9);
          const c = pick(r, [
            { stmt: `−${a}°C > −${b}°C`, right: `It is warmer at −${a}°C than at −${b}°C.`, wrong: [`It is colder at −${a}°C than at −${b}°C.`, `−${a}°C is farther from 0°C than −${b}°C is.`, 'Both temperatures are above 0°C.'], about: 'two temperatures' },
            { stmt: `−${a} m > −${b} m`, right: `An elevation of −${a} m is higher than an elevation of −${b} m.`, wrong: [`An elevation of −${a} m is lower than an elevation of −${b} m.`, `−${a} m is farther from sea level than −${b} m is.`, 'Both elevations are above sea level.'], about: 'two elevations' },
            { stmt: `−$${a} > −$${b}`, right: `A balance of −$${a} is a smaller debt than a balance of −$${b}.`, wrong: [`A balance of −$${a} is a larger debt than a balance of −$${b}.`, `−$${a} is farther from $0 than −$${b} is.`, 'Neither balance is a debt.'], about: 'two account balances' },
          ]);
          const o = mc(c.right, c.wrong, int(r, 0, 3));
          return o && { prompt: `The inequality ${c.stmt} compares ${c.about}. What does it mean?`, ...o,
            explanation: `−${a} is to the right of −${b} on the number line, so it is the greater value: ${c.right} It is CLOSER to zero, not farther, and both values are still below zero.` };
        }
        if (shape === 2) {
          const nums = until(() => {
            const n = [drawRational(r, 'fraction'), drawRational(r, 'fraction'), drawRational(r, 'decimal'), drawRational(r, 'decimal')];
            if (n.some((x) => x.v > 0) || new Set(n.map((x) => x.v)).size !== 4) return null;
            return Math.max(...n.map((x) => x.v)) - Math.min(...n.map((x) => x.v)) < 0.7 ? n : null;
          });
          const greatest = Math.max(...nums.map((n) => n.v));
          const which = nums.findIndex((n) => n.v === greatest);
          return { prompt: `Which of the numbers ${nums.map((n) => n.t).join(', ')} is the greatest?`,
            value: nums[which].t, options: nums.map((n) => n.t), correctOption: LETTERS[which],
            explanation: `As decimals: ${nums.map((n) => `${n.t} = ${show(n.v)}`).join(', ')}. All are negative, so the greatest is the one CLOSEST to zero, ${nums[which].t}. The one farthest from zero is the least.` };
        }
        const c = pick(r, [
          { lo: '−3/4', hi: '−1/2', right: '−0.6', wrong: ['−0.8', '−0.4', '0.6'] },
          { lo: '−1/2', hi: '−1/4', right: '−0.3', wrong: ['−0.6', '−0.2', '0.3'] },
          { lo: '−3/2', hi: '−5/4', right: '−1.4', wrong: ['−1.6', '−1.2', '1.4'] },
          { lo: '−1/4', hi: '−1/5', right: '−0.22', wrong: ['−0.3', '−0.15', '0.22'] },
          { lo: '−4/5', hi: '−3/5', right: '−0.7', wrong: ['−0.9', '−0.5', '0.7'] },
          { lo: '−7/4', hi: '−3/2', right: '−1.6', wrong: ['−1.8', '−1.45', '1.6'] },
        ]);
        const o = mc(c.right, c.wrong, int(r, 0, 3));
        return { prompt: `Which number is between ${c.lo} and ${c.hi} on a number line?`, ...o,
          explanation: `Change the fractions to decimals and find a number greater than ${c.lo} but less than ${c.hi}: ${c.right}. ${c.wrong[0]} is to the left of both, ${c.wrong[1]} is to the right of both, and ${c.wrong[2]} is on the positive side of zero.` };
      }) },
      { difficulty: 4, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        if (shape === 0) {
          const nums = drawRationals(r, ['fraction', 'fraction', 'decimal', 'decimal', 'fraction']);
          const listed = shuffle(r, nums);
          const o = orderOptions(nums, true, int(r, 0, 3));
          return o && { prompt: `Which list orders the numbers ${listed.map((n) => n.t).join(', ')} from greatest to least?`, ...o,
            explanation: `As decimals: ${listed.map((n) => `${n.t} = ${show(n.v)}`).join(', ')}. Greatest to least means right to left on the number line: positives first, then negatives from closest to 0 to farthest: ${o.value}. Check the direction asked for before choosing.` };
        }
        if (shape === 1) {
          const a = int(r, 2, 6), b = a + int(r, 1, 3);
          const name = pick(r, ['Kai', 'Rosa', 'Eli', 'Mina']);
          const o = mc(`${name} is incorrect: −0.${b} is to the left of −0.${a} on the number line, so −0.${b} < −0.${a}.`,
            [`${name} is correct, because ${b} tenths is more than ${a} tenths.`,
              `${name} is correct, because −0.${b} is farther from 0, and farther from 0 always means greater.`,
              `${name} is incorrect: −0.${b} and −0.${a} are both less than 0, so they are equal.`], int(r, 0, 3));
          return o && { prompt: `${name} says −0.${b} > −0.${a} because ${b} is greater than ${a}. Which statement is true?`, ...o,
            explanation: `For negative numbers, farther from zero means LESS. −0.${b} is farther left than −0.${a}, so −0.${b} < −0.${a}. ${name}'s reasoning works only for positive numbers.` };
        }
        if (shape === 2) {
          const names = ['Ana', 'Ben', 'Cy', 'Di'];
          const vals = until(() => {
            const v = [-(int(r, 20, 60) / 4), -(int(r, 20, 60) / 4), -(int(r, 20, 60) / 4), int(r, 8, 80) / 4];
            if (new Set(v).size !== 4 || Math.max(...v) <= -Math.min(...v)) return null;
            return shuffle(r, v);
          });
          const which = vals.indexOf(Math.min(...vals));
          return { prompt: `Four friends have these account balances: ${names.map((n, i) => `${n} ${vals[i] < 0 ? '−' : ''}$${Math.abs(vals[i]).toFixed(2)}`).join(', ')}. Who has the lowest balance?`,
            value: names[which], options: names, correctOption: LETTERS[which],
            explanation: `The lowest balance is the least number — the negative farthest from zero, −$${Math.abs(vals[which]).toFixed(2)}, which is ${names[which]}'s. The balance with the largest digits is positive here, so it is the HIGHEST, and the negative closest to zero is the smallest debt.` };
        }
        const cut = pick(r, [{ t: '−1/2', v: -0.5 }, { t: '−3/4', v: -0.75 }, { t: '−1/4', v: -0.25 }]);
        const nums = until(() => {
          const n = Array.from({ length: 6 }, (_, i) => drawRational(r, i % 2 ? 'fraction' : 'decimal'));
          if (new Set(n.map((x) => x.v)).size !== 6 || n.some((x) => x.v === cut.v)) return null;
          const below = n.filter((x) => x.v < cut.v).length;
          return below >= 1 && below <= 4 && n.some((x) => x.v < 0 && x.v > cut.v) ? n : null;
        });
        const below = nums.filter((n) => n.v < cut.v);
        return { prompt: `How many of these numbers are less than ${cut.t}: ${nums.map((n) => n.t).join(', ')}?`,
          value: below.length,
          explanation: `Less than ${cut.t} means to the LEFT of ${show(cut.v)} on the number line: ${below.map((n) => n.t).join(', ')} — ${below.length} in all. A negative closer to zero than ${cut.t}, and every positive number, is greater than ${cut.t}.` };
      }) },
    ],
  },

  // ── 13. distance on the coordinate plane ─────────────────────────────────
  {
    courseSkill: 'g6-distance-coordinate-plane',
    skillId: 'g6-distance-coordinate-plane',
    tiers: [
      { difficulty: 2, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        const fixed = K.nonZero(r, -9, 9);
        let p, q;
        if (shape === 0 || shape === 1) { p = -int(r, 1, 9); q = int(r, 1, 9); } else { p = -int(r, 1, 4); q = p - int(r, 2, 7); }
        if (int(r, 0, 1)) [p, q] = [q, p];
        const vertical = shape % 2 === 0;
        const P1 = vertical ? PT(fixed, p) : PT(p, fixed), P2 = vertical ? PT(fixed, q) : PT(q, fixed);
        const crosses = p * q < 0;
        return { prompt: `What is the distance, in units, between the points ${P1} and ${P2} on a coordinate plane?`,
          value: Math.abs(p - q),
          explanation: crosses
            ? `The points share ${vertical ? 'an x' : 'a y'}-coordinate, so only the other coordinates matter: ${show(p)} and ${show(q)}. They are on opposite sides of 0, so add their distances from 0: ${Math.abs(p)} + ${Math.abs(q)} = ${Math.abs(p - q)}. Subtracting ${Math.abs(p)} and ${Math.abs(q)} is the slip.`
            : `The points share ${vertical ? 'an x' : 'a y'}-coordinate, so only the other coordinates matter: ${show(p)} and ${show(q)}. Both are on the same side of 0, so subtract their distances from 0: ${Math.max(Math.abs(p), Math.abs(q))} − ${Math.min(Math.abs(p), Math.abs(q))} = ${Math.abs(p - q)}. Adding them is the slip.` };
      }) },
      { difficulty: 3, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        const x1 = -int(r, 1, 8), x2 = int(r, 1, 8), y1 = int(r, 1, 8), y2 = -int(r, 1, 8);
        const w = x2 - x1, h = y1 - y2;
        if (w === h) return null;
        const verts = `${PT(x1, y1)}, ${PT(x2, y1)}, ${PT(x2, y2)} and ${PT(x1, y2)}`;
        if (shape === 0) {
          return { prompt: `A rectangle has vertices at ${verts}. What is its perimeter, in units?`,
            value: 2 * (w + h),
            explanation: `Width: from x = ${show(x1)} to x = ${x2} is ${-x1} + ${x2} = ${w}. Height: from y = ${show(y2)} to y = ${y1} is ${-y2} + ${y1} = ${h}. Perimeter = 2(${w}) + 2(${h}) = ${2 * (w + h)} units. Each side crosses an axis, so its length is a sum of two distances from 0.` };
        }
        if (shape === 1) {
          return { prompt: `A rectangle has vertices at ${verts}. What is its area, in square units?`,
            value: w * h,
            explanation: `Width: ${-x1} + ${x2} = ${w}. Height: ${-y2} + ${y1} = ${h}. Area = ${w} × ${h} = ${w * h} square units. Subtracting the coordinates' sizes (${Math.abs(x2 + x1)} and ${Math.abs(y1 + y2)}) gives sides that are too short.` };
        }
        if (shape === 2) {
          const a = -(int(r, 1, 6) + 0.5), b = int(r, 1, 7) + pick(r, [0, 0.5]), y = K.nonZero(r, -8, 8);
          if (Number.isInteger(b - a)) return null;
          return { prompt: `What is the distance, in units, between the points ${PT(a, y)} and ${PT(b, y)} on a coordinate plane? Write a decimal.`,
            value: typed(b - a),
            explanation: `The y-coordinates match, so use the x-coordinates ${show(a)} and ${dec(b)}. They are on opposite sides of 0: ${dec(-a)} + ${dec(b)} = ${dec(b - a)} units. Subtracting ${dec(-a)} from ${dec(b)} is the slip.` };
        }
        const blocks = int(r, 2, 5);
        return { prompt: `On a town map, each grid unit stands for ${blocks} blocks. The library is at ${PT(x1, y1)} and the school is at ${PT(x1, y2)}. How many blocks apart are they?`,
          value: h * blocks,
          explanation: `The x-coordinates match, so the distance is along the y-direction: ${y1} + ${-y2} = ${h} grid units. Each unit is ${blocks} blocks, so ${h} × ${blocks} = ${h * blocks} blocks. Stopping at ${h} forgets the map scale.` };
      }) },
      { difficulty: 4, gen: (r, idx) => until(() => {
        const shape = idx % 4;
        const x1 = -int(r, 1, 8), x2 = int(r, 1, 8), y1 = int(r, 1, 8), y2 = -int(r, 1, 8);
        const w = x2 - x1, h = y1 - y2;
        if (shape === 0) {
          if (y1 === x2 || x1 === -x2 || y2 === -y1) return null;
          const o = mc(PT(x2, y1), [PT(y1, x2), PT(x2, -y1), PT(-x2, y1)], int(r, 0, 3));
          return o && { prompt: `Three vertices of a rectangle are ${PT(x1, y1)}, ${PT(x1, y2)} and ${PT(x2, y2)}. Which point is the fourth vertex?`, ...o,
            explanation: `The fourth vertex lines up with ${PT(x2, y2)} vertically (same x, ${x2}) and with ${PT(x1, y1)} horizontally (same y, ${y1}): ${PT(x2, y1)}. Swapping the coordinates or flipping a sign puts the corner in the wrong place.` };
        }
        if (shape === 1) {
          if (w === h) return null;
          return { prompt: `Three vertices of a rectangle are ${PT(x1, y1)}, ${PT(x2, y1)} and ${PT(x2, y2)}. What is the area of the rectangle, in square units?`,
            value: w * h,
            explanation: `One side runs from ${PT(x1, y1)} to ${PT(x2, y1)}: ${-x1} + ${x2} = ${w} units. The next runs from ${PT(x2, y1)} to ${PT(x2, y2)}: ${y1} + ${-y2} = ${h} units. Area = ${w} × ${h} = ${w * h}. You do not need the fourth vertex to find the side lengths.` };
        }
        if (shape === 2) {
          const other = int(r, 2, 9);
          if (other === w) return null;
          return { prompt: `One side of a rectangle has endpoints ${PT(x1, y1)} and ${PT(x2, y1)}. The perimeter of the rectangle is ${2 * (w + other)} units. What is the length, in units, of each of the two sides that meet this side?`,
            value: other,
            explanation: `The given side is ${-x1} + ${x2} = ${w} units long. Two such sides use ${2 * w} of the perimeter, leaving ${2 * (w + other)} − ${2 * w} = ${2 * other} for the other two sides, so each is ${other} units. Subtracting ${w} only once is the usual slip.` };
        }
        const d = int(r, 5, 12);
        if (int(r, 0, 1)) {
          const a = -int(r, 1, d - 1), b = int(r, 1, 8);
          const o = mc(PT(a + d, b), [PT(a - d, b), PT(a, b + d), PT(d, b)], int(r, 0, 3));
          return o && { prompt: `Point A is at ${PT(a, b)}. Point B is on the same horizontal line as A, exactly ${d} units from A, and in Quadrant I. Which point is B?`, ...o,
            explanation: `Same horizontal line means the same y-coordinate, ${b}. Quadrant I is to the right of the y-axis, so move right ${d}: ${show(a)} + ${d} = ${a + d}, giving ${PT(a + d, b)}. ${PT(a - d, b)} is ${d} units away too, but in Quadrant II.` };
        }
        const a = int(r, 1, 8), b = -int(r, 1, d - 1);
        const o = mc(PT(a, b + d), [PT(a, b - d), PT(a + d, b), PT(a, d)], int(r, 0, 3));
        return o && { prompt: `Point A is at ${PT(a, b)}. Point B is on the same vertical line as A, exactly ${d} units from A, and in Quadrant I. Which point is B?`, ...o,
          explanation: `Same vertical line means the same x-coordinate, ${a}. Quadrant I is above the x-axis, so move up ${d}: ${show(b)} + ${d} = ${b + d}, giving ${PT(a, b + d)}. ${PT(a, b - d)} is ${d} units away too, but in Quadrant IV.` };
      }) },
    ],
  },
];

module.exports = { COURSE_ID, GB, TEMPLATES };
