'use strict';
/**
 * At-level check items for Early Math Foundations (grades 3–5).
 *
 * The three tiers are read as grade 3 / grade 4 / grade 5 work on the SAME
 * skill, because that is the spread of students in the course: tier 2 is what a
 * third grader meets, tier 4 the hard end for a fifth grader. Wording is kept
 * to short sentences an 8-year-old can read alone.
 *
 * Comparing and ordering items are multiple choice, and the wrong choices are
 * the orders real mistakes give: "more digits after the point is bigger",
 * "bigger denominator is bigger", greatest-to-least for least-to-greatest.
 *
 * Answers are computed from the drawn numbers — see templateKit.
 */

const K = require('./templateKit');
const { int, pick } = K;

const COURSE_ID = 'early-math-foundations';
const GB = '3-5';

// ── helpers ──────────────────────────────────────────────────────────────

const fmt = (n) => n.toLocaleString('en-US');

function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(r, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Keep drawing until the shape comes out usable (a generator returns null to redraw). */
const retry = (fn) => (r, idx) => {
  for (let i = 0; i < 400; i++) {
    const out = fn(r, idx);
    if (out) return out;
  }
  throw new Error('no usable draw in 400 tries');
};

/** Multiple choice with the right answer at `pos`; null when two choices collide. */
function mc(correct, wrongs, pos) {
  const options = wrongs.slice(0, 3).map(String);
  options.splice(pos, 0, String(correct));
  if (options.length !== 4 || new Set(options).size !== 4) return null;
  return { options, correctOption: 'ABCD'[pos], value: String(correct) };
}

/** The four choices ARE the things being compared, in the order drawn. */
function mcAmong(choices, correct) {
  if (new Set(choices).size !== 4) return null;
  return { options: choices.slice(), correctOption: 'ABCD'[choices.indexOf(correct)], value: correct };
}

/** An ordering question: the right order, then the orders mistakes give, then filler. */
function orderOptions(r, correct, mistakes, sep, pos) {
  const key = (a) => a.join(sep);
  const c = key(correct);
  const wrongs = [];
  for (const m of mistakes) {
    const k = key(m);
    if (k !== c && !wrongs.includes(k)) wrongs.push(k);
  }
  for (let g = 0; wrongs.length < 3 && g < 200; g++) {
    const k = key(shuffle(r, correct));
    if (k !== c && !wrongs.includes(k)) wrongs.push(k);
  }
  return mc(c, wrongs, pos);
}

/**
 * "Which comparison is true?" — four pairs, the first written with the right
 * symbol and the other three with the wrong one. Each side is { s, v }.
 */
function stmtOptions(r, pairs, pos) {
  const st = pairs.map(([a, b], i) => {
    const [x, y] = int(r, 0, 1) ? [b, a] : [a, b];
    const right = x.v < y.v ? '<' : '>';
    const sym = i === 0 ? right : (right === '<' ? '>' : '<');
    return `${x.s} ${sym} ${y.s}`;
  });
  return mc(st[0], st.slice(1), pos);
}

const TRUE_ASK = {
  2: 'Which comparison is true?',
  3: 'Which of these comparisons is true?',
  4: 'Only one of these comparisons is true. Which one?',
};

// Number names, for "which is greater: 34,650 or thirty-four thousand, sixty-five".
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function under1000(n) {
  const parts = [];
  if (n >= 100) parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
  const rest = n % 100;
  if (rest >= 20) parts.push(TENS[Math.floor(rest / 10)] + (rest % 10 ? `-${ONES[rest % 10]}` : ''));
  else if (rest > 0) parts.push(ONES[rest]);
  return parts.join(' ');
}
function words(n) {
  const th = Math.floor(n / 1000);
  const rest = n % 1000;
  if (!th) return under1000(rest);
  return `${under1000(th)} thousand${rest ? `, ${under1000(rest)}` : ''}`;
}
function expanded(n) {
  const digits = String(n).split('');
  const parts = [];
  digits.forEach((d, i) => {
    if (d !== '0') parts.push(fmt(Number(d) * 10 ** (digits.length - 1 - i)));
  });
  return parts.join(' + ');
}
const FORMS = [fmt, words, expanded];

/** How many columns need regrouping in a − b. */
function borrows(a, b) {
  let n = 0;
  let carry = 0;
  while (a > 0 || b > 0) {
    const top = (a % 10) - carry;
    carry = top < b % 10 ? 1 : 0;
    n += carry;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return n;
}
function regroupPair(r, lo, hi, minBorrows) {
  for (;;) {
    const a = int(r, lo, hi);
    const b = int(r, Math.ceil(lo / 3), a - Math.ceil(lo / 5));
    if (b > 0 && borrows(a, b) >= minBorrows) return [a, b];
  }
}
/** a has zeros in the middle; the ones column forces regrouping across them. */
function zeroPair(r, digits) {
  for (;;) {
    const a = int(r, 3, 9) * 10 ** (digits - 1) + int(r, 0, 6);
    const b = int(r, 10 ** (digits - 1) + 1, a - 10 ** (digits - 1));
    if (b % 10 > a % 10 && borrows(a, b) === digits - 1) return [a, b];
  }
}

const PROPS = ['Commutative property', 'Associative property', 'Distributive property', 'Identity property', 'Zero property'];
function propertyItem(r, idx, kind) {
  const a = int(r, 2, 9);
  const b = pick(r, [2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== a));
  const c = pick(r, [2, 3, 4, 5, 6, 7, 8, 9, 10].filter((x) => x !== a && x !== b));
  const big = int(r, 12, 89);
  const eq = {
    'Commutative property': [`${a} × ${b} = ${b} × ${a}`, 'Changing the ORDER of the factors does not change the product. That is the commutative property.'],
    'Associative property': [`(${a} × ${b}) × ${c} = ${a} × (${b} × ${c})`, 'The factors stay in the same order; only the GROUPING (the parentheses) moves. That is the associative property, not the commutative one.'],
    'Distributive property': [`${a} × (${c} + ${b}) = ${a} × ${c} + ${a} × ${b}`, `The ${a} is multiplied by each part of the sum. Breaking a factor apart like this is the distributive property.`],
    'Identity property': [`${big} × 1 = ${big}`, 'Any number times 1 stays the same number. That is the identity property. Do not mix it up with the zero property.'],
    'Zero property': [`${big} × 0 = 0`, 'Any number times 0 is 0. That is the zero property. Do not mix it up with the identity property, which is about 1.'],
  }[kind];
  const others = shuffle(r, PROPS.filter((p) => p !== kind)).slice(0, 3);
  const m = mc(kind, others, (idx + int(r, 0, 3)) % 4);
  return { prompt: `Which property of multiplication does this equation show? ${eq[0]}`, ...m, explanation: eq[1] };
}

const NAMES = ['Ava', 'Ben', 'Cal', 'Dee'];

// Fractions as { n, d, s, v }.
const F = (n, d) => ({ n, d, s: `${n}/${d}`, v: n / d });
const lowest = (n, d) => K.gcd(n, d) === 1;
function properFractions(maxD, minD = 2) {
  const out = [];
  for (let d = minD; d <= maxD; d++) for (let n = 1; n < d; n++) if (lowest(n, d)) out.push(F(n, d));
  return out;
}
const byValue = (a, b) => a.v - b.v;

// Decimals are kept as whole thousandths so nothing is ever a rounding error.
const D = (t) => ({ t, s: String(t / 1000), v: t });

// ── templates ────────────────────────────────────────────────────────────

const TEMPLATES = [
  // 1 ── compare and order multi-digit whole numbers ───────────────────────
  {
    courseSkill: 'emf-compare-order',
    skillId: 'emf-compare-order',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const shape = idx % 4;
        if (shape === 0 || shape === 3) {
          // Same digits rearranged, so the first digit alone does not settle it.
          const h = int(r, 2, 8);
          const [p, q] = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== h)).slice(0, 2);
          const nums = shuffle(r, [h * 100 + p * 10 + q, h * 100 + q * 10 + p, h * 100 + p * 10 + h, h * 100 + q * 10 + h]);
          const want = shape === 0 ? Math.max(...nums) : Math.min(...nums);
          const m = mcAmong(nums.map(fmt), fmt(want));
          if (!m) return null;
          return { prompt: `Which of these numbers is the ${shape === 0 ? 'greatest' : 'least'}? ${nums.map(fmt).join('; ')}`, ...m,
            explanation: `All four have ${h} hundreds, so compare the tens digit next, then the ones. The ${shape === 0 ? 'greatest' : 'least'} is ${fmt(want)}. Looking only at the ones digit is the usual slip.` };
        }
        if (shape === 1) {
          const t = int(r, 1, 8);
          const [p, q, s] = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3);
          const nums = shuffle(r, [t * 1000 + p * 100 + q * 10 + s, t * 1000 + p * 100 + s * 10 + q, t * 1000 + q * 100 + p * 10 + s, t * 1000 + s * 100 + q * 10 + p]);
          const sorted = nums.slice().sort((a, b) => a - b);
          const byOnes = nums.slice().sort((a, b) => (a % 10) - (b % 10) || a - b);
          const swapped = [sorted[1], sorted[0], sorted[2], sorted[3]];
          const m = orderOptions(r, sorted.map(fmt), [sorted.slice().reverse().map(fmt), byOnes.map(fmt), swapped.map(fmt)], '; ', int(r, 0, 3));
          if (!m) return null;
          return { prompt: `Which list shows these numbers in order from least to greatest? ${nums.map(fmt).join('; ')}`, ...m,
            explanation: `Every number has ${t} thousand, so compare the hundreds, then the tens, then the ones: ${m.value}. Writing them greatest to least is the usual slip.` };
        }
        const mk = () => {
          const h = int(r, 1, 9);
          const [p, q] = shuffle(r, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 2);
          const a = h * 100 + p * 10 + q;
          const b = h * 100 + q * 10 + p;
          return [{ s: fmt(a), v: a }, { s: fmt(b), v: b }];
        };
        const pairs = [mk(), mk(), mk(), mk()];
        const m = stmtOptions(r, pairs, int(r, 0, 3));
        if (!m) return null;
        return { prompt: TRUE_ASK[2], ...m,
          explanation: `${m.value} is true. Each pair has the same hundreds digit, so the tens digit decides. Remember the symbol opens toward the greater number.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          // A 5-digit number that starts with 9 against 6-digit numbers that start with 1.
          const [p, q] = shuffle(r, [0, 2, 3, 4, 5, 6, 7, 8]).slice(0, 2);
          const tail = int(r, 100, 999);
          const six = [100000 + p * 10000 + q * 1000 + tail, 100000 + q * 10000 + p * 1000 + tail, 100000 + Math.min(p, q) * 10000 + tail];
          const five = 90000 + int(r, 1000, 9999);
          const nums = shuffle(r, [...six, five]);
          const want = Math.max(...nums);
          const m = mcAmong(nums.map(fmt), fmt(want));
          if (!m) return null;
          return { prompt: `Which of these numbers is the greatest? ${nums.map(fmt).join('; ')}`, ...m,
            explanation: `${fmt(five)} has only 5 digits, so every 6-digit number is greater than it. Among the 6-digit numbers compare the ten thousands, then the thousands: ${fmt(want)}. Picking ${fmt(five)} because it starts with 9 is the usual slip.` };
        }
        if (shape === 1) {
          // Each pair differs in exactly one middle digit.
          const mk = () => {
            const base = int(r, 10000, 99999);
            const place = pick(r, [100, 1000]);
            const digit = Math.floor(base / place) % 10;
            const other = pick(r, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== digit));
            const b = base + (other - digit) * place;
            return [{ s: fmt(base), v: base }, { s: fmt(b), v: b }];
          };
          const pairs = [mk(), mk(), mk(), mk()];
          const m = stmtOptions(r, pairs, int(r, 0, 3));
          if (!m) return null;
          return { prompt: TRUE_ASK[3], ...m,
            explanation: `${m.value} is true. In each pair the numbers match except for one digit in the middle, so that one digit decides which is greater. Check each place from the left.` };
        }
        if (shape === 2) {
          const lead = int(r, 11, 98);
          const [p, q, s] = shuffle(r, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3);
          const tails = shuffle(r, [p * 100 + q * 10 + s, p * 100 + s * 10 + q, q * 100 + p * 10 + s, s * 100 + q * 10 + p]);
          const nums = tails.map((t) => lead * 1000 + t);
          const sorted = nums.slice().sort((a, b) => b - a);
          const swapped = [sorted[0], sorted[2], sorted[1], sorted[3]];
          const swapped2 = [sorted[1], sorted[0], sorted[2], sorted[3]];
          const m = orderOptions(r, sorted.map(fmt), [sorted.slice().reverse().map(fmt), swapped.map(fmt), swapped2.map(fmt)], '; ', int(r, 0, 3));
          if (!m) return null;
          return { prompt: `Which list shows these numbers in order from greatest to least? ${nums.map(fmt).join('; ')}`, ...m,
            explanation: `All four start with ${lead} thousand, so compare the hundreds, then the tens, then the ones: ${m.value}. Listing them least to greatest is the usual slip.` };
        }
        const lead = int(r, 2, 8);
        const [p, q] = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 2);
        const tail = int(r, 10, 99);
        const mkN = (x, y, z) => lead * 100000 + x * 10000 + y * 1000 + z * 100 + tail;
        const nums = shuffle(r, [mkN(p, q, 0), mkN(p, 0, q), mkN(q, p, 0), mkN(q, 0, p)]);
        const want = Math.min(...nums);
        const m = mcAmong(nums.map(fmt), fmt(want));
        if (!m) return null;
        return { prompt: `Which of these numbers is the least? ${nums.map(fmt).join('; ')}`, ...m,
          explanation: `All four have ${lead} hundred thousands. Compare the ten thousands next, and if those tie, the thousands. The least is ${fmt(want)}. A 0 in a place makes that place worth nothing, so do not skip it.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const shape = idx % 4;
        // Same leading digits, then 0 and two other digits in every order.
        const lead = shape % 2 ? int(r, 101, 899) : int(r, 21, 98);
        const [p, q] = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 2);
        const tails = shuffle(r, [p * 100 + q * 10, p * 100 + q, q * 100 + p * 10, q * 100 + p, p * 10 + q, q * 10 + p]);
        const nums = tails.slice(0, 4).map((t) => lead * 1000 + t);
        const forms = shuffle(r, [0, 1, 2, pick(r, [0, 1, 2])]);
        const reps = nums.map((n, i) => FORMS[forms[i]](n));
        if (shape === 0 || shape === 3) {
          const want = shape === 0 ? Math.max(...nums) : Math.min(...nums);
          const who = NAMES[nums.indexOf(want)];
          return { prompt: `Four students each wrote a number. ${NAMES.map((nm, i) => `${nm}: ${reps[i]}.`).join(' ')} Who wrote the ${shape === 0 ? 'greatest' : 'least'} number?`,
            options: NAMES.slice(), correctOption: 'ABCD'[nums.indexOf(want)], value: who,
            explanation: `Write each one as a numeral first: ${NAMES.map((nm, i) => `${nm} ${fmt(nums[i])}`).join(', ')}. Then compare place by place. ${who} wrote the ${shape === 0 ? 'greatest' : 'least'}, ${fmt(want)}. Forgetting a 0 placeholder when you change forms is the usual slip.` };
        }
        if (shape === 1) {
          const labels = ['P', 'Q', 'R', 'S'];
          const order = [0, 1, 2, 3].sort((a, b) => nums[a] - nums[b]);
          const sorted = order.map((i) => labels[i]);
          const swapped = [sorted[0], sorted[2], sorted[1], sorted[3]];
          const swapped2 = [sorted[1], sorted[0], sorted[2], sorted[3]];
          const m = orderOptions(r, sorted, [sorted.slice().reverse(), swapped, swapped2], ', ', int(r, 0, 3));
          if (!m) return null;
          return { prompt: `Here are four numbers. ${labels.map((l, i) => `${l} = ${reps[i]}`).join('; ')}. Which list puts them in order from least to greatest?`, ...m,
            explanation: `As numerals: ${labels.map((l, i) => `${l} = ${fmt(nums[i])}`).join(', ')}. Compare place by place to get ${m.value}. Forgetting a 0 placeholder when you change forms is the usual slip.` };
        }
        const all = tails.map((t) => lead * 1000 + t);
        const side = (n, f) => ({ s: FORMS[f](n), v: n });
        const pairs = [
          [side(all[0], 1), side(all[1], 0)],
          [side(all[2], 2), side(all[3], 0)],
          [side(all[4], 0), side(all[5], 1)],
          [side(all[1], 2), side(all[4], 0)],
        ];
        const m = stmtOptions(r, shuffle(r, pairs), int(r, 0, 3));
        if (!m) return null;
        return { prompt: TRUE_ASK[4], ...m,
          explanation: `${m.value} is true. Write the word form or expanded form as a numeral first, then compare place by place. Forgetting a 0 placeholder (reading "sixty-five" as 650) is the usual slip.` };
      }) },
    ],
  },

  // 2 ── multi-digit subtraction with regrouping ──────────────────────────
  {
    courseSkill: 'emf-multi-digit-subtraction',
    skillId: 'emf-multi-digit-subtraction',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const shape = idx % 4;
        if (shape === 1) {
          const [a, b] = zeroPair(r, 3);
          return { prompt: `What is ${a} − ${b}?`, value: a - b,
            explanation: `There are no tens to regroup, so regroup a hundred first: ${a} − ${b} = ${a - b}. Check by adding: ${a - b} + ${b} = ${a}. Subtracting the smaller digit from the larger in each column is the usual slip.` };
        }
        const [a, b] = regroupPair(r, 300, 999, 2);
        if (shape === 0) {
          return { prompt: `Subtract: ${a} − ${b}`, value: a - b,
            explanation: `Regroup a ten for the ones and a hundred for the tens: ${a} − ${b} = ${a - b}. Check by adding: ${a - b} + ${b} = ${a}. Forgetting that you took a ten away is the usual slip.` };
        }
        if (shape === 2) {
          return { prompt: `What number goes in the blank? ___ − ${b} = ${a - b}`, value: a,
            explanation: `The blank is the starting number, so add back what was taken away: ${a - b} + ${b} = ${a}. Subtracting the two numbers you see is the usual slip.` };
        }
        return { prompt: `What number goes in the blank? ${a} − ___ = ${a - b}`, value: b,
          explanation: `The blank is the amount taken away: ${a} − ${a - b} = ${b}. Check: ${a} − ${b} = ${a - b}. Remember to regroup in the ones and the tens.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        const shape = idx % 4;
        if (shape === 1) {
          const [a, b] = zeroPair(r, 4);
          return { prompt: `What is ${fmt(a)} − ${fmt(b)}?`, value: a - b,
            explanation: `The tens and hundreds are 0, so regroup from the thousands all the way across: ${fmt(a)} − ${fmt(b)} = ${fmt(a - b)}. Check by adding: ${fmt(a - b)} + ${fmt(b)} = ${fmt(a)}. Leaving the zeros as 10 instead of 9 after regrouping is the usual slip.` };
        }
        const [a, b] = regroupPair(r, 3000, 9999, 3);
        if (shape === 0) {
          return { prompt: `Subtract: ${fmt(a)} − ${fmt(b)}`, value: a - b,
            explanation: `Work from the ones, regrouping each time the top digit is too small: ${fmt(a)} − ${fmt(b)} = ${fmt(a - b)}. Check by adding: ${fmt(a - b)} + ${fmt(b)} = ${fmt(a)}.` };
        }
        if (shape === 2) {
          return { prompt: `A stadium has ${fmt(a)} seats. ${fmt(b)} seats are filled. How many seats are empty?`, value: a - b,
            explanation: `Empty seats = all seats − filled seats: ${fmt(a)} − ${fmt(b)} = ${fmt(a - b)}. Forgetting to regroup is the usual slip, so check by adding back.` };
        }
        return { prompt: `What number goes in the blank? ${fmt(a)} − ___ = ${fmt(a - b)}`, value: b,
          explanation: `The blank is the amount taken away: ${fmt(a)} − ${fmt(a - b)} = ${fmt(b)}. Check: ${fmt(a)} − ${fmt(b)} = ${fmt(a - b)}.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const [a, b] = zeroPair(r, 5);
          return { prompt: `What is ${fmt(a)} − ${fmt(b)}?`, value: a - b,
            explanation: `Regroup from the ten thousands across all the zeros: ${fmt(a)} − ${fmt(b)} = ${fmt(a - b)}. Check by adding: ${fmt(a - b)} + ${fmt(b)} = ${fmt(a)}. Each 0 you regroup through becomes a 9, not a 10.` };
        }
        if (shape === 1) {
          const [a, b] = regroupPair(r, 300000, 999999, 4);
          return { prompt: `Subtract: ${fmt(a)} − ${fmt(b)}`, value: a - b,
            explanation: `Line up the places and regroup wherever the top digit is too small: ${fmt(a)} − ${fmt(b)} = ${fmt(a - b)}. Check by adding: ${fmt(a - b)} + ${fmt(b)} = ${fmt(a)}.` };
        }
        const [a, b] = regroupPair(r, 30000, 99999, 3);
        if (shape === 2) {
          return { prompt: `What number goes in the blank? ___ − ${fmt(b)} = ${fmt(a - b)}`, value: a,
            explanation: `The blank is the starting number, so add back what was taken away: ${fmt(a - b)} + ${fmt(b)} = ${fmt(a)}. Subtracting the two numbers you see is the usual slip.` };
        }
        const [c, d] = zeroPair(r, 6);
        return { prompt: `Lake City has ${fmt(c)} people. Pine Town has ${fmt(d)} people. How many more people live in Lake City than in Pine Town?`, value: c - d,
          explanation: `"How many more" means subtract: ${fmt(c)} − ${fmt(d)} = ${fmt(c - d)}. You must regroup across the zeros; check by adding ${fmt(c - d)} + ${fmt(d)} = ${fmt(c)}.` };
      } },
    ],
  },

  // 3 ── properties of multiplication ─────────────────────────────────────
  {
    courseSkill: 'emf-multiplication-properties',
    skillId: 'emf-multiplication-properties',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) return propertyItem(r, idx, pick(r, ['Commutative property', 'Identity property']));
        if (shape === 2) return propertyItem(r, idx, pick(r, ['Associative property', 'Zero property']));
        const a = int(r, 3, 9);
        const b = pick(r, [2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== a));
        if (shape === 1) {
          return { prompt: `What number makes this equation true? ${a} × ${b} = ${b} × ___`, value: a,
            explanation: `You can multiply in either order (the commutative property), so ${a} × ${b} = ${b} × ${a}. The blank is ${a}. Writing the product ${a * b} in the blank is the usual slip.` };
        }
        const c = pick(r, [2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== a && x !== b));
        return { prompt: `What number makes this equation true? (${a} × ${b}) × ${c} = ${a} × (${b} × ___)`, value: c,
          explanation: `Moving the parentheses does not change the product (the associative property), so the same three factors appear on both sides. The missing factor is ${c}.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const shape = idx % 4;
        const a = int(r, 3, 9);
        const tens = int(r, 1, shape === 0 ? 1 : 4) * 10;
        const o = pick(r, [2, 3, 4, 6, 7, 8, 9].filter((x) => x !== a));
        const n = tens + o;
        if (shape === 0) {
          return { prompt: `What number makes this equation true? ${a} × ${n} = ${a} × ${tens} + ${a} × ___`, value: o,
            explanation: `Break ${n} into ${tens} + ${o}. The distributive property says ${a} × ${n} = ${a} × ${tens} + ${a} × ${o}, so the blank is ${o}. Writing the product ${a * o} in the blank is the usual slip.` };
        }
        if (shape === 1) return propertyItem(r, idx, pick(r, ['Distributive property', 'Associative property']));
        if (shape === 2) {
          const right = `${a} × ${tens} + ${a} × ${o}`;
          const wrong = [[`${a} × ${tens} + ${o}`, a * tens + o], [`${a} × ${tens / 10} + ${a} × ${o}`, a * (tens / 10) + a * o], [`${a} + ${tens} × ${o}`, a + tens * o]];
          if (wrong.some((w) => w[1] === a * n)) return null;
          const m = mc(right, wrong.map((w) => w[0]), int(r, 0, 3));
          if (!m) return null;
          return { prompt: `Which expression is equal to ${a} × ${n}?`, ...m,
            explanation: `Break ${n} into ${tens} + ${o} and multiply BOTH parts by ${a}: ${a} × ${tens} + ${a} × ${o} = ${a * tens} + ${a * o} = ${a * n}. Multiplying only the tens (${a} × ${tens} + ${o}) is the usual slip.` };
        }
        return { prompt: `Use the distributive property: ${a} × ${n} = ${a} × ${tens} + ${a} × ${o}. What is ${a} × ${n}?`, value: a * n,
          explanation: `${a} × ${tens} = ${a * tens} and ${a} × ${o} = ${a * o}. Add the two parts: ${a * tens} + ${a * o} = ${a * n}. Forgetting to add the second part is the usual slip.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const shape = idx % 4;
        const a = int(r, 3, 9);
        if (shape === 0) {
          const round = int(r, 3, 9) * 10;
          const back = int(r, 1, 3);
          return { prompt: `What number makes this equation true? ${a} × ${round - back} = ${a} × ${round} − ${a} × ___`, value: back,
            explanation: `${round - back} is ${round} − ${back}, so ${a} × ${round - back} = ${a} × ${round} − ${a} × ${back}. The blank is ${back}. The distributive property works with subtraction too.` };
        }
        if (shape === 1) {
          const [b, c, d, e] = shuffle(r, [2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== a)).slice(0, 4);
          const big = int(r, 11, 19);
          const trues = [`${a} × ${big} = ${big} × ${a}`, `(${b} × ${c}) × ${d} = ${b} × (${c} × ${d})`, `${e} × (${b} + ${d}) = ${e} × ${b} + ${e} × ${d}`];
          const falseEq = `${a} × (${c} + ${e}) = ${a} × ${c} + ${e}`;
          const m = mc(falseEq, shuffle(r, trues), int(r, 0, 3));
          if (!m) return null;
          return { prompt: 'Which equation is NOT true?', ...m,
            explanation: `${a} × (${c} + ${e}) = ${a * (c + e)}, but ${a} × ${c} + ${e} = ${a * c + e}. The ${a} must multiply BOTH numbers in the parentheses. The other three show the commutative, associative and distributive properties.` };
        }
        if (shape === 2) {
          const total = pick(r, [20, 30, 40, 50, 100]);
          const b = int(r, 11, total - 6);
          const c = total - b;
          if (b === c) return null;
          return { prompt: `What number makes this equation true? ${a} × ${b} + ${a} × ${c} = ${a} × ___`, value: total,
            explanation: `Both parts are groups of ${a}, so add the other factors: ${b} + ${c} = ${total}. That gives ${a} × ${total}. This is the distributive property used backward. Writing ${a * total}, the product, is the usual slip.` };
        }
        const round = pick(r, [100, 200, 300]);
        const back = int(r, 1, 3);
        const n = round - back;
        const right = `${a} × ${round} − ${a} × ${back}`;
        const wrong = [[`${a} × ${round} − ${back}`, a * round - back], [`${a} × ${round} + ${a} × ${back}`, a * round + a * back], [`${a} × ${round - 10} + ${a} × ${10 - back - 1}`, a * (round - 10) + a * (10 - back - 1)]];
        if (wrong.some((w) => w[1] === a * n)) return null;
        const m = mc(right, wrong.map((w) => w[0]), int(r, 0, 3));
        if (!m) return null;
        return { prompt: `Which expression is equal to ${a} × ${n}?`, ...m,
          explanation: `${n} = ${round} − ${back}, so ${a} × ${n} = ${a} × ${round} − ${a} × ${back} = ${a * round} − ${a * back} = ${a * n}. Subtracting just ${back} instead of ${a} × ${back} is the usual slip.` };
      }) },
    ],
  },

  // 4 ── multiplication word problems ─────────────────────────────────────
  {
    courseSkill: 'emf-multiply-word-problems',
    skillId: 'emf-multiply-word-problems',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const a = int(r, 3, 9);
        const b = pick(r, [3, 4, 5, 6, 7, 8, 9].filter((x) => x !== a));
        const shape = idx % 4;
        if (shape === 0) {
          const [box, thing] = pick(r, [['bags', 'apples'], ['boxes', 'pencils'], ['plates', 'cookies'], ['teams', 'players']]);
          return { prompt: `There are ${a} ${box}. Each of them has ${b} ${thing}. How many ${thing} are there in all?`, value: a * b,
            explanation: `${a} equal groups of ${b} is ${a} × ${b} = ${a * b}. Adding ${a} + ${b} is the usual slip.` };
        }
        if (shape === 1) {
          return { prompt: `A garden has ${a} rows of plants. There are ${b} plants in each row. How many plants are in the garden?`, value: a * b,
            explanation: `Rows of equal size make an array: ${a} × ${b} = ${a * b} plants. Adding ${a} + ${b} is the usual slip.` };
        }
        if (shape === 2) {
          return { prompt: `Ben has ${a} stickers. Ana has ${b} times as many stickers as Ben. How many stickers does Ana have?`, value: a * b,
            explanation: `"${b} times as many" means multiply: ${b} × ${a} = ${a * b}. Adding ${b} more (${a + b}) is the usual slip.` };
        }
        return { prompt: `One movie ticket costs $${a}. How many dollars do ${b} tickets cost?`, value: a * b,
          explanation: `${b} tickets at $${a} each cost ${b} × ${a} = ${a * b} dollars.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const a = int(r, 12, 29), b = int(r, 21, 35);
          return { prompt: `A school has ${a} classrooms. Each classroom has ${b} desks. How many desks are in the school?`, value: a * b,
            explanation: `${a} equal groups of ${b}: ${a} × ${b} = ${a * b}. Multiply by the ones and by the tens, then add the two parts.` };
        }
        if (shape === 1) {
          const a = int(r, 28, 65), b = int(r, 6, 9);
          return { prompt: `A dog weighs ${a} pounds. A horse weighs ${b} times as much as the dog. How many pounds does the horse weigh?`, value: a * b,
            explanation: `"${b} times as much" means multiply: ${b} × ${a} = ${a * b} pounds. Adding ${b} to ${a} is the usual slip.` };
        }
        if (shape === 2) {
          const a = int(r, 14, 28), b = int(r, 16, 36);
          return { prompt: `A theater has ${a} rows of seats. Each row has ${b} seats. How many seats are in the theater?`, value: a * b,
            explanation: `Rows of equal size make an array: ${a} × ${b} = ${a * b} seats.` };
        }
        const a = int(r, 112, 288), b = int(r, 3, 8);
        return { prompt: `A box holds ${a} crayons. How many crayons are in ${b} boxes?`, value: a * b,
          explanation: `${b} boxes of ${a} is ${b} × ${a} = ${fmt(a * b)}. Multiply the ones, tens and hundreds by ${b} and regroup as you go.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const n = int(r, 4, 9), m = int(r, 12, 36), k = int(r, 15, 45);
          return { prompt: `A teacher buys ${n} boxes of pencils. Each box has ${m} pencils. She gives ${k} pencils to her students. How many pencils does she have left?`, value: n * m - k,
            explanation: `First find how many she bought: ${n} × ${m} = ${n * m}. Then subtract the ones she gave away: ${n * m} − ${k} = ${n * m - k}. Stopping after the first step is the usual slip.` };
        }
        if (shape === 1) {
          const n = int(r, 3, 8), m = int(r, 11, 24), p = int(r, 3, 8), q = int(r, 6, 9);
          return { prompt: `Sam buys ${n} packs of red balloons with ${m} balloons in each pack. He also buys ${p} packs of blue balloons with ${q} balloons in each pack. How many balloons does Sam buy in all?`, value: n * m + p * q,
            explanation: `Red: ${n} × ${m} = ${n * m}. Blue: ${p} × ${q} = ${p * q}. In all: ${n * m} + ${p * q} = ${n * m + p * q}. Adding all four numbers is the usual slip.` };
        }
        if (shape === 2) {
          const n = int(r, 4, 9), m = int(r, 6, 14);
          const bill = Math.ceil((n * m + 1) / 50) * 50;
          return { prompt: `Rosa buys ${n} books that cost $${m} each. She pays with $${bill}. How many dollars does she get back in change?`, value: bill - n * m,
            explanation: `The books cost ${n} × ${m} = ${n * m} dollars. Change: ${bill} − ${n * m} = ${bill - n * m} dollars. Stopping at the total cost is the usual slip.` };
        }
        const n = int(r, 14, 38), m = int(r, 3, 6);
        return { prompt: `Liam read ${n} pages. Zoe read ${m} times as many pages as Liam. How many pages did they read altogether?`, value: n + n * m,
          explanation: `Zoe read ${m} × ${n} = ${n * m} pages. Together: ${n} + ${n * m} = ${n + n * m}. Giving only Zoe's ${n * m} pages is the usual slip.` };
      } },
    ],
  },

  // 5 ── division facts ───────────────────────────────────────────────────
  {
    courseSkill: 'emf-division-facts',
    skillId: 'emf-division-facts',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const d = int(r, 3, 9);
        const q = pick(r, [3, 4, 5, 6, 7, 8, 9].filter((x) => x !== d));
        const n = d * q;
        const shape = idx % 4;
        if (shape === 0) {
          return { prompt: `What is ${n} ÷ ${d}?`, value: q,
            explanation: `Think: ${d} × ? = ${n}. Since ${d} × ${q} = ${n}, ${n} ÷ ${d} = ${q}.` };
        }
        if (shape === 1) {
          return { prompt: `What number goes in the blank? ___ ÷ ${d} = ${q}`, value: n,
            explanation: `Division undoes multiplication, so the blank is ${q} × ${d} = ${n}. Check: ${n} ÷ ${d} = ${q}.` };
        }
        if (shape === 2) {
          return { prompt: `What number goes in the blank? ${n} ÷ ___ = ${q}`, value: d,
            explanation: `Think: ${q} × ? = ${n}. Since ${q} × ${d} = ${n}, the blank is ${d}.` };
        }
        return { prompt: `Use the fact ${q} × ${d} = ${n} to find ${n} ÷ ${q}.`, value: d,
          explanation: `${q} × ${d} = ${n} means ${n} split into groups of ${q} makes ${d} groups, so ${n} ÷ ${q} = ${d}. Answering ${q} (dividing by the other factor) is the usual slip.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        const d = int(r, 4, 9);
        const q = pick(r, [4, 6, 7, 8, 9].filter((x) => x !== d));
        const n = d * q;
        const shape = idx % 4;
        if (shape === 0) {
          return { prompt: `What number goes in the blank? ___ × ${d} = ${n}`, value: q,
            explanation: `A missing factor is found by dividing: ${n} ÷ ${d} = ${q}. Check: ${q} × ${d} = ${n}.` };
        }
        if (shape === 1) {
          const big = int(r, 12, 99);
          const kind = pick(r, [0, 1, 2]);
          if (kind === 0) {
            return { prompt: `What is ${big} ÷ 1?`, value: big,
              explanation: `Dividing by 1 makes one group that holds everything, so ${big} ÷ 1 = ${big}. Answering 1 is the usual slip.` };
          }
          if (kind === 1) {
            return { prompt: `What is 0 ÷ ${d}?`, value: 0,
              explanation: `Zero shared among ${d} groups gives 0 in each group, because ${d} × 0 = 0. Answering ${d} is the usual slip.` };
          }
          return { prompt: `What is ${big} ÷ ${big}?`, value: 1,
            explanation: `Any number (except 0) divided by itself is 1, because ${big} × 1 = ${big}. Answering 0 is the usual slip.` };
        }
        if (shape === 2) {
          return { prompt: `A number divided by ${d} equals ${q}. What is the number?`, value: n,
            explanation: `Undo the division by multiplying: ${q} × ${d} = ${n}. Check: ${n} ÷ ${d} = ${q}.` };
        }
        return { prompt: `The same number goes in both blanks. What is it? ${d} × ___ = ${n} and ${n} ÷ ___ = ${d}`, value: q,
          explanation: `${d}, ${q} and ${n} make a fact family: ${d} × ${q} = ${n} and ${n} ÷ ${q} = ${d}. The missing number is ${q}.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const shape = idx % 4;
        if (shape === 0 || shape === 3) {
          // Within 100 but past the 10 × 10 table.
          const d = int(r, 3, 8);
          const q = int(r, 11, Math.floor(100 / d));
          const n = d * q;
          if (shape === 0) {
            return { prompt: `What is ${n} ÷ ${d}?`, value: q,
              explanation: `Break ${n} into ${d * 10} + ${n - d * 10}. ${d * 10} ÷ ${d} = 10 and ${n - d * 10} ÷ ${d} = ${q - 10}, so ${n} ÷ ${d} = ${q}. Check: ${d} × ${q} = ${n}.` };
          }
          return { prompt: `What number goes in the blank? ___ ÷ ${d} = ${q}`, value: n,
            explanation: `Undo the division by multiplying: ${q} × ${d} = ${n}. Check: ${n} ÷ ${d} = ${q}.` };
        }
        if (shape === 1) {
          const d = int(r, 2, 5), q = int(r, 6, 9), k = pick(r, [2, 3].filter((x) => d * q * x <= 100));
          return { prompt: `What number makes this equation true? ${d * q} ÷ ${d} = ${d * q * k} ÷ ___`, value: d * k,
            explanation: `${d * q} ÷ ${d} = ${q}, so the right side must also equal ${q}. ${q} × ? = ${d * q * k}, and ${d * q * k} ÷ ${q} = ${d * k}. The blank is ${d * k}.` };
        }
        const b = int(r, 2, 4);
        const c = pick(r, [2, 3].filter((x) => x !== b));
        const q = int(r, 3, Math.floor(100 / (b * c)));
        const n = b * c * q;
        return { prompt: `Divide from left to right: ${n} ÷ ${b} ÷ ${c}`, value: q,
          explanation: `First ${n} ÷ ${b} = ${n / b}. Then ${n / b} ÷ ${c} = ${q}. Doing ${b} ÷ ${c} first is the usual slip.` };
      } },
    ],
  },

  // 6 ── division word problems ───────────────────────────────────────────
  {
    courseSkill: 'emf-divide-word-problems',
    skillId: 'emf-divide-word-problems',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const d = int(r, 3, 9);
        const q = pick(r, [3, 4, 5, 6, 7, 8, 9].filter((x) => x !== d));
        const n = d * q;
        const shape = idx % 4;
        if (shape === 0) {
          return { prompt: `${n} cookies are shared equally among ${d} friends. How many cookies does each friend get?`, value: q,
            explanation: `Sharing equally means divide: ${n} ÷ ${d} = ${q}. Check: ${d} × ${q} = ${n}.` };
        }
        if (shape === 1) {
          return { prompt: `There are ${n} students. They sit in rows of ${d}. How many rows are there?`, value: q,
            explanation: `Making equal groups of ${d} means divide: ${n} ÷ ${d} = ${q} rows. Subtracting ${n} − ${d} is the usual slip.` };
        }
        if (shape === 2) {
          return { prompt: `${d} tickets cost $${n} in all. Each ticket costs the same amount. How many dollars does one ticket cost?`, value: q,
            explanation: `Split the total cost into ${d} equal parts: ${n} ÷ ${d} = ${q} dollars for each ticket.` };
        }
        return { prompt: `A baker has ${n} muffins. She puts ${d} muffins in each box. How many boxes does she fill?`, value: q,
          explanation: `Equal groups of ${d}: ${n} ÷ ${d} = ${q} boxes. Check: ${q} × ${d} = ${n}.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        const d = int(r, 3, 8);
        const q = int(r, 12, 29);
        const n = d * q;
        const shape = idx % 4;
        if (shape === 0) {
          return { prompt: `A library has ${n} new books. The books are put on ${d} shelves with the same number on each shelf. How many books are on each shelf?`, value: q,
            explanation: `Sharing equally means divide: ${n} ÷ ${d} = ${q}. Check: ${d} × ${q} = ${n}.` };
        }
        if (shape === 1) {
          return { prompt: `A store has ${n} pencils. The pencils are put in packs of ${d}. How many packs can the store make?`, value: q,
            explanation: `Equal groups of ${d}: ${n} ÷ ${d} = ${q} packs. Check: ${q} × ${d} = ${n}.` };
        }
        if (shape === 2) {
          return { prompt: `Maya reads a book with ${n} pages. She reads the same number of pages each day and finishes in ${d} days. How many pages does she read each day?`, value: q,
            explanation: `Split the pages into ${d} equal days: ${n} ÷ ${d} = ${q} pages each day.` };
        }
        return { prompt: `A class raised $${n} by selling plants. Each plant cost $${d}. How many plants did the class sell?`, value: q,
          explanation: `How many ${d}s are in ${n}? ${n} ÷ ${d} = ${q} plants. Check: ${q} × ${d} = ${n}.` };
      } },
      { difficulty: 4, gen: retry((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const d = int(r, 4, 9), q = int(r, 32, 98);
          const n = d * q;
          if (n < 200) return null;
          return { prompt: `A farmer has ${n} eggs. He packs them in cartons that hold ${d} eggs each. How many cartons does he fill?`, value: q,
            explanation: `Equal groups of ${d}: ${n} ÷ ${d} = ${q} cartons. Check by multiplying: ${q} × ${d} = ${n}.` };
        }
        if (shape === 1) {
          const d = int(r, 4, 9), q = int(r, 12, 24);
          const a = int(r, 20, d * q - 20);
          const b = d * q - a;
          if (a === b) return null;
          return { prompt: `Mia has ${a} red beads and ${b} blue beads. She puts all of the beads on ${d} strings, with the same number of beads on each string. How many beads are on each string?`, value: q,
            explanation: `First find all the beads: ${a} + ${b} = ${a + b}. Then share them: ${a + b} ÷ ${d} = ${q}. Dividing only the red beads is the usual slip.` };
        }
        if (shape === 2) {
          const d = int(r, 4, 8), q = int(r, 18, 36), k = int(r, 5, 14);
          return { prompt: `A baker makes ${d * q} muffins and packs them ${d} to a box. He sells ${k} of the boxes. How many boxes are left?`, value: q - k,
            explanation: `First find the number of boxes: ${d * q} ÷ ${d} = ${q}. Then subtract the boxes sold: ${q} − ${k} = ${q - k}. Subtracting ${k} from the muffins instead of the boxes is the usual slip.` };
        }
        const c = int(r, 2, 4), m = int(r, 12, 24);
        const ps = [3, 4, 5, 6, 8].filter((p) => p !== c && (c * m) % p === 0);
        if (!ps.length) return null;
        const p = pick(r, ps);
        return { prompt: `${p} friends buy ${c} pizzas that cost $${m} each. They split the total cost equally. How many dollars does each friend pay?`, value: (c * m) / p,
          explanation: `The pizzas cost ${c} × ${m} = ${c * m} dollars in all. Split among ${p} friends: ${c * m} ÷ ${p} = ${(c * m) / p} dollars each. Dividing the price of one pizza is the usual slip.` };
      }) },
    ],
  },

  // 7 ── compare and order fractions ──────────────────────────────────────
  {
    courseSkill: 'emf-compare-order-fractions',
    skillId: 'emf-compare-order-fractions',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const n = int(r, 1, 4);
          const ds = shuffle(r, [2, 3, 4, 5, 6, 8, 10, 12].filter((d) => d > n)).slice(0, 4);
          const fs = ds.map((d) => F(n, d));
          const want = fs.slice().sort(byValue)[3];
          const m = mcAmong(fs.map((f) => f.s), want.s);
          if (!m) return null;
          return { prompt: `Which fraction is the greatest? ${fs.map((f) => f.s).join(', ')}`, ...m,
            explanation: `The numerators are all ${n}, so look at the size of the pieces. Fewer pieces in the whole means bigger pieces, so the smallest denominator wins: ${want.s}. Picking the biggest denominator is the usual slip.` };
        }
        if (shape === 1) {
          const d = pick(r, [6, 8, 10, 12]);
          const ns = shuffle(r, Array.from({ length: d - 1 }, (_, i) => i + 1)).slice(0, 3);
          const fs = ns.map((n) => F(n, d));
          const sorted = fs.slice().sort(byValue).map((f) => f.s);
          const m = orderOptions(r, sorted, [sorted.slice().reverse(), [sorted[1], sorted[0], sorted[2]], [sorted[0], sorted[2], sorted[1]]], ', ', int(r, 0, 3));
          if (!m) return null;
          return { prompt: `Which list shows these fractions in order from least to greatest? ${fs.map((f) => f.s).join(', ')}`, ...m,
            explanation: `The denominators are all ${d}, so the pieces are the same size. More pieces means a greater fraction, so order by the numerators: ${m.value}. Listing them greatest to least is the usual slip.` };
        }
        if (shape === 2) {
          const sameDen = () => {
            const d = pick(r, [4, 5, 6, 8, 10]);
            const [a, b] = shuffle(r, Array.from({ length: d - 1 }, (_, i) => i + 1)).slice(0, 2);
            return [F(a, d), F(b, d)];
          };
          const sameNum = () => {
            const n = int(r, 1, 3);
            const [a, b] = shuffle(r, [4, 5, 6, 8, 10, 12]).slice(0, 2);
            return [F(n, a), F(n, b)];
          };
          const pairs = shuffle(r, [sameDen(), sameNum(), sameDen(), sameNum()]);
          const m = stmtOptions(r, pairs, int(r, 0, 3));
          if (!m) return null;
          return { prompt: TRUE_ASK[2], ...m,
            explanation: `${m.value} is true. With the same denominator, the greater numerator is greater. With the same numerator, the SMALLER denominator is greater, because the pieces are bigger.` };
        }
        const n = int(r, 2, 5);
        const ds = shuffle(r, [6, 8, 9, 10, 12].filter((d) => d > n)).slice(0, 3);
        const fs = ds.map((d) => F(n, d));
        const sorted = fs.slice().sort(byValue).map((f) => f.s);
        const m = orderOptions(r, sorted, [sorted.slice().reverse(), [sorted[1], sorted[0], sorted[2]], [sorted[0], sorted[2], sorted[1]]], ', ', int(r, 0, 3));
        if (!m) return null;
        return { prompt: `Which list shows these fractions in order from least to greatest? ${fs.map((f) => f.s).join(', ')}`, ...m,
          explanation: `The numerators are all ${n}. A bigger denominator means smaller pieces, so the fraction with the biggest denominator is the LEAST: ${m.value}. Ordering by the denominators from small to big is the usual slip.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const shape = idx % 4;
        const pool = properFractions(12, 3).filter((f) => f.d !== 11 && f.d !== 7);
        const below = pool.filter((f) => f.v < 0.5 && f.v > 0.25);
        const above = pool.filter((f) => f.v > 0.5 && f.v < 0.8);
        if (shape === 0) {
          const k = pick(r, [3, 4, 5, 6]);
          const half = F(k, 2 * k);
          const win = pick(r, above);
          const lows = shuffle(r, below.filter((f) => f.d !== win.d)).slice(0, 2);
          const choices = shuffle(r, [win, half, ...lows]).map((f) => f.s);
          const m = mcAmong(choices, win.s);
          if (!m) return null;
          return { prompt: 'Which fraction is greater than 1/2?', ...m,
            explanation: `Half of the denominator tells you: half of ${win.d} is ${K.frac(win.d, 2)}, and ${win.n} is more than that, so ${win.s} is greater than 1/2. ${half.s} is exactly 1/2, and the other two are less than 1/2.` };
        }
        if (shape === 1) {
          const mk = () => {
            const lo = pick(r, below);
            const hi = pick(r, above.filter((f) => f.d !== lo.d));
            return [lo, hi];
          };
          const pairs = [mk(), mk(), mk(), mk()];
          const m = stmtOptions(r, pairs, int(r, 0, 3));
          if (!m) return null;
          return { prompt: TRUE_ASK[3], ...m,
            explanation: `${m.value} is true. Compare each fraction to 1/2: in every pair one fraction is less than 1/2 and the other is more than 1/2, so the one above 1/2 is greater.` };
        }
        if (shape === 2) {
          const lo = pick(r, below);
          const mid = pick(r, above.filter((f) => f.d !== lo.d));
          const d = pick(r, [3, 4, 5, 6, 8].filter((x) => x !== lo.d && x !== mid.d));
          const top = F(d + 1, d);
          const fs = shuffle(r, [lo, mid, top]);
          const sorted = [lo.s, mid.s, top.s];
          const byDen = fs.slice().sort((a, b) => a.d - b.d).map((f) => f.s);
          const m = orderOptions(r, sorted, [sorted.slice().reverse(), byDen, [sorted[1], sorted[0], sorted[2]]], ', ', int(r, 0, 3));
          if (!m) return null;
          return { prompt: `Which list shows these fractions in order from least to greatest? ${fs.map((f) => f.s).join(', ')}`, ...m,
            explanation: `Use benchmarks. ${lo.s} is less than 1/2. ${mid.s} is more than 1/2 but less than 1. ${top.s} is more than 1. So the order is ${m.value}.` };
        }
        // One denominator is a multiple of the others, so each can be renamed.
        const base = pick(r, [8, 10, 12]);
        const fam = properFractions(base).filter((f) => base % f.d === 0);
        const fs = shuffle(r, fam).slice(0, 4);
        if (new Set(fs.map((f) => f.d)).size < 3) return null;
        const want = fs.slice().sort(byValue)[3];
        const m = mcAmong(fs.map((f) => f.s), want.s);
        if (!m) return null;
        return { prompt: `Which fraction is the greatest? ${fs.map((f) => f.s).join(', ')}`, ...m,
          explanation: `Rename each fraction with denominator ${base}: ${fs.map((f) => `${f.s} = ${f.n * (base / f.d)}/${base}`).join(', ')}. The greatest numerator belongs to ${want.s}. Comparing only the numerators you are given is the usual slip.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const shape = idx % 4;
        const pool = properFractions(9, 3).filter((f) => f.v > 0.3);
        if (shape === 0 || shape === 3) {
          const fs = shuffle(r, pool.filter((f) => f.v > 0.5)).slice(0, 4);
          if (new Set(fs.map((f) => f.d)).size < 4) return null;
          const sorted = fs.slice().sort(byValue);
          if (shape === 3) {
            // "Between" two of them: one below, one above, one equal to an end.
            const lo = pick(r, [F(1, 2), F(1, 3), F(2, 3)]);
            const hi = lo.s === '1/2' ? pick(r, [F(2, 3), F(3, 4)]) : (lo.s === '1/3' ? F(1, 2) : F(3, 4));
            const cands = properFractions(12, 5).filter((f) => f.d !== 7 && f.d !== 11);
            const mid = pick(r, cands.filter((f) => f.v > lo.v && f.v < hi.v));
            const under = pick(r, cands.filter((f) => f.v < lo.v && f.v > lo.v - 0.2));
            const over = pick(r, cands.filter((f) => f.v > hi.v && f.v < hi.v + 0.2));
            const k = pick(r, [2, 3]);
            const same = F(hi.n * k, hi.d * k);
            const choices = shuffle(r, [mid, under, over, same]).map((f) => f.s);
            const m = mcAmong(choices, mid.s);
            if (!m) return null;
            const cd = K.lcm(K.lcm(lo.d, hi.d), mid.d);
            return { prompt: `Which fraction is between ${lo.s} and ${hi.s}?`, ...m,
              explanation: `Use the common denominator ${cd}: ${lo.s} = ${lo.n * (cd / lo.d)}/${cd}, ${hi.s} = ${hi.n * (cd / hi.d)}/${cd}, and ${mid.s} = ${mid.n * (cd / mid.d)}/${cd}, which is between them. ${same.s} is equal to ${hi.s}, not between.` };
          }
          const want = sorted[3];
          if (sorted[3].v - sorted[2].v < 1e-9) return null;
          const m = mcAmong(fs.map((f) => f.s), want.s);
          if (!m) return null;
          return { prompt: `Which fraction is the greatest? ${fs.map((f) => f.s).join(', ')}`, ...m,
            explanation: `Rename the fractions with a common denominator, or compare them two at a time by cross-multiplying. The greatest is ${want.s}. Picking the fraction with the biggest numerator or denominator without renaming is the usual slip.` };
        }
        if (shape === 1) {
          const fs = shuffle(r, pool).slice(0, 3);
          if (new Set(fs.map((f) => f.d)).size < 3) return null;
          if (fs.some((f) => fs.some((g) => g !== f && f.d % g.d === 0))) return null;
          const sorted = fs.slice().sort(byValue);
          if (sorted[1].v - sorted[0].v > 0.25 || sorted[2].v - sorted[1].v > 0.25) return null;
          const s = sorted.map((f) => f.s);
          const byNum = fs.slice().sort((a, b) => a.n - b.n || a.d - b.d).map((f) => f.s);
          const byDen = fs.slice().sort((a, b) => a.d - b.d).map((f) => f.s);
          const m = orderOptions(r, s, [s.slice().reverse(), byDen, byNum], ', ', int(r, 0, 3));
          if (!m) return null;
          const cd = K.lcm(K.lcm(fs[0].d, fs[1].d), fs[2].d);
          return { prompt: `Which list shows these fractions in order from least to greatest? ${fs.map((f) => f.s).join(', ')}`, ...m,
            explanation: `Use the common denominator ${cd}: ${fs.map((f) => `${f.s} = ${f.n * (cd / f.d)}/${cd}`).join(', ')}. Now order by the numerators: ${m.value}. Ordering by the old numerators or denominators is the usual slip.` };
        }
        const mk = () => {
          for (;;) {
            const [a, b] = shuffle(r, pool).slice(0, 2);
            if (a.d !== b.d && a.n !== b.n && a.d % b.d !== 0 && b.d % a.d !== 0 && Math.abs(a.v - b.v) < 0.2) return [a, b];
          }
        };
        const pairs = [mk(), mk(), mk(), mk()];
        const m = stmtOptions(r, pairs, int(r, 0, 3));
        if (!m) return null;
        return { prompt: TRUE_ASK[4], ...m,
          explanation: `${m.value} is true. Rename each pair with a common denominator (or cross-multiply) before you compare. Judging by the numerators or denominators alone is the usual slip.` };
      }) },
    ],
  },

  // 8 ── compare and order decimals ───────────────────────────────────────
  {
    courseSkill: 'emf-compare-order-decimals',
    skillId: 'emf-compare-order-decimals',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const shape = idx % 4;
        const t = int(r, 3, 8);
        const h = int(r, 5, 9);
        if (shape === 0 || shape === 3) {
          // 0.6 against 0.58, 0.06 and 0.49: the shortest one is the greatest.
          const set = shape === 0
            ? [D(t * 100), D((t - 1) * 100 + h * 10), D(t * 10), D((t - 2) * 100 + 90)]
            : [D(t * 100), D(t * 100 + h * 10), D(h * 10), D((t + 1) * 100)];
          const ds = shuffle(r, set);
          const sorted = ds.slice().sort(byValue);
          const want = shape === 0 ? sorted[3] : sorted[0];
          const m = mcAmong(ds.map((d) => d.s), want.s);
          if (!m) return null;
          return { prompt: `Which of these decimals is the ${shape === 0 ? 'greatest' : 'least'}? ${ds.map((d) => d.s).join(', ')}`, ...m,
            explanation: `Compare the tenths digit first, then the hundredths. ${want.s} is the ${shape === 0 ? 'greatest' : 'least'}. A decimal with more digits is not always greater: 0.5 is the same as 0.50.` };
        }
        if (shape === 1) {
          const mk = () => {
            const a = int(r, 2, 9), b = int(r, 1, 9);
            return pick(r, [0, 1]) ? [D(a * 100), D((a - 1) * 100 + b * 10)] : [D(a * 100), D(a * 10)];
          };
          const pairs = [mk(), mk(), mk(), mk()];
          const m = stmtOptions(r, pairs, int(r, 0, 3));
          if (!m) return null;
          return { prompt: TRUE_ASK[2], ...m,
            explanation: `${m.value} is true. Line up the decimal points and compare the tenths first. Thinking that 0.45 is greater than 0.5 because 45 is greater than 5 is the usual slip.` };
        }
        const [p, q] = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 2);
        const ds = shuffle(r, [D(p * 100), D(q * 100), D(p * 100 + q * 10), D(q * 100 + p * 10)]);
        const sorted = ds.slice().sort(byValue).map((d) => d.s);
        const naive = ds.slice().sort((a, b) => Number(a.s.slice(2)) - Number(b.s.slice(2))).map((d) => d.s);
        const m = orderOptions(r, sorted, [naive, sorted.slice().reverse(), naive.slice().reverse()], ', ', int(r, 0, 3));
        if (!m) return null;
        return { prompt: `Which list shows these decimals in order from least to greatest? ${ds.map((d) => d.s).join(', ')}`, ...m,
          explanation: `Write them all with two decimal places (0.${p} = 0.${p}0) and compare: ${m.value}. Putting the one-digit decimals first because they "look smaller" is the usual slip.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const shape = idx % 4;
        const w = int(r, 1, 9) * 1000;
        const [p, q] = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 2);
        if (shape === 0) {
          const ds = shuffle(r, [D(w + p * 100), D(w + p * 10), D(w + p * 100 + q * 10), D(w + q * 100 + p * 10)]);
          const sorted = ds.slice().sort((a, b) => b.v - a.v).map((d) => d.s);
          const naive = ds.slice().sort((a, b) => Number(b.s.slice(2)) - Number(a.s.slice(2))).map((d) => d.s);
          const m = orderOptions(r, sorted, [sorted.slice().reverse(), naive, [sorted[1], sorted[0], sorted[2], sorted[3]]], ', ', int(r, 0, 3));
          if (!m) return null;
          return { prompt: `Which list shows these decimals in order from greatest to least? ${ds.map((d) => d.s).join(', ')}`, ...m,
            explanation: `The whole-number parts match, so compare the tenths, then the hundredths: ${m.value}. Remember ${String((w + p * 100) / 1000)} is the same as ${((w + p * 100) / 1000).toFixed(2)}, and listing least to greatest is the other usual slip.` };
        }
        if (shape === 1) {
          const lowT = Math.min(p, q), hiT = Math.max(p, q);
          const ds = shuffle(r, [D(w + hiT * 100), D(w + lowT * 100 + 90), D(w + hiT * 10), D(w + lowT * 100 + hiT * 10)]);
          const want = ds.slice().sort(byValue)[3];
          const m = mcAmong(ds.map((d) => d.s), want.s);
          if (!m) return null;
          return { prompt: `Which of these decimals is the greatest? ${ds.map((d) => d.s).join(', ')}`, ...m,
            explanation: `The whole-number parts match, so the tenths digit decides: ${want.s} has the most tenths. A decimal with more digits is not always greater.` };
        }
        if (shape === 2) {
          const mk = () => {
            const ww = int(r, 0, 9) * 1000, a = int(r, 2, 9), b = int(r, 1, 9);
            return pick(r, [0, 1]) ? [D(ww + a * 100), D(ww + (a - 1) * 100 + b * 10)] : [D(ww + a * 10), D(ww + (a - 1) * 100)];
          };
          const pairs = [mk(), mk(), mk(), mk()];
          const m = stmtOptions(r, pairs, int(r, 0, 3));
          if (!m) return null;
          return { prompt: TRUE_ASK[3], ...m,
            explanation: `${m.value} is true. Line up the decimal points and compare tenths first, then hundredths. Comparing the digits after the point as whole numbers is the usual slip.` };
        }
        const t = int(r, 2, 8);
        const k = pick(r, [5, 6, 7, 8, 9]);
        const good = D(t * 100 + k * 10);
        const m = mcAmong(shuffle(r, [good, D(k * 100 + t * 10), D(t * 10), D((t + 1) * 100 + k * 10)]).map((d) => d.s), good.s);
        if (!m) return null;
        return { prompt: `Which decimal is between ${D(t * 100).s} and ${D((t + 1) * 100).s}?`, ...m,
          explanation: `Think of ${D(t * 100).s} as 0.${t}0 and ${D((t + 1) * 100).s} as 0.${t + 1}0. The decimal ${good.s} has ${t} tenths and ${k} hundredths, so it is between them.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const shape = idx % 4;
        const [p, q] = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 2);
        if (shape === 0) {
          // 0.35, 0.305, 0.053, 0.3
          const ds = shuffle(r, [D(p * 100 + q * 10), D(p * 100 + q), D(q * 10 + p), D(p * 100)]);
          const want = ds.slice().sort(byValue)[3];
          const m = mcAmong(ds.map((d) => d.s), want.s);
          if (!m) return null;
          return { prompt: `Which of these decimals is the greatest? ${ds.map((d) => d.s).join(', ')}`, ...m,
            explanation: `Compare tenths, then hundredths, then thousandths. ${want.s} is the greatest. Picking the decimal with the most digits is the usual slip: 0.305 is less than 0.35.` };
        }
        if (shape === 1) {
          const ds = shuffle(r, [D(p * 100 + q * 10), D(p * 100 + q), D(p * 10 + q), D(p * 100)]);
          const sorted = ds.slice().sort(byValue).map((d) => d.s);
          const naive = ds.slice().sort((a, b) => Number(a.s.slice(2)) - Number(b.s.slice(2)) || a.v - b.v).map((d) => d.s);
          const byLen = ds.slice().sort((a, b) => a.s.length - b.s.length || a.v - b.v).map((d) => d.s);
          const m = orderOptions(r, sorted, [sorted.slice().reverse(), byLen, naive], ', ', int(r, 0, 3));
          if (!m) return null;
          return { prompt: `Which list shows these decimals in order from least to greatest? ${ds.map((d) => d.s).join(', ')}`, ...m,
            explanation: `Write each with three decimal places and compare: ${ds.map((d) => `${d.s} = ${(d.t / 1000).toFixed(3)}`).join(', ')}. The order is ${m.value}. Ordering by how many digits each has is the usual slip.` };
        }
        if (shape === 2) {
          const mk = () => {
            const ww = int(r, 0, 4) * 1000, a = int(r, 1, 9), b = int(r, 1, 9), c = int(r, 1, 9);
            return pick(r, [
              [D(ww + a * 100 + b), D(ww + a * 100 + b * 10)],
              [D(ww + a * 100 + b * 10 + c), D(ww + (a + 1) * 100)],
              [D(ww + a * 10 + b), D(ww + a * 10)],
            ]);
          };
          const pairs = [mk(), mk(), mk(), mk()];
          const m = stmtOptions(r, pairs, int(r, 0, 3));
          if (!m) return null;
          return { prompt: TRUE_ASK[4], ...m,
            explanation: `${m.value} is true. Line up the decimal points and compare tenths, then hundredths, then thousandths. A longer decimal is not always greater (0.305 < 0.35).` };
        }
        const lo = p * 100, hi = p * 100 + 50;
        const good = D(lo + pick(r, [5, 8, 12, 25, 41, 49]));
        const over = D(hi + pick(r, [1, 5, 10]));
        const tenth = D(hi / 10);
        const next = D(lo + 100);
        const m = mcAmong(shuffle(r, [good, over, tenth, next]).map((d) => d.s), good.s);
        if (!m) return null;
        return { prompt: `Which decimal is between ${D(lo).s} and ${D(hi).s}?`, ...m,
          explanation: `With three decimal places the ends are ${(lo / 1000).toFixed(3)} and ${(hi / 1000).toFixed(3)}. ${good.s} = ${(good.t / 1000).toFixed(3)} is between them. ${over.s} is just past ${D(hi).s}, and ${tenth.s} is much smaller.` };
      }) },
    ],
  },
];

module.exports = { COURSE_ID, GB, TEMPLATES };
