'use strict';
/**
 * At-level check items for the two "equation from a situation" course skills
 * (see scripts/buildCourseLevelItems.js for why these exist).
 *
 *   6th-grade-math  g6-word-problem-equations   one-step equations from a real
 *       situation (whole numbers, money decimals, simple fractions); the top
 *       tier is the module's simple two-step "fee + rate" and "sum" set-ups.
 *   7th-grade-math  g7-equation-word-problems   two-step equations px + q = r
 *       and p(x + q) = r with rational numbers, consecutive integers, perimeter.
 *
 * The old pool for both was worksheet questions whose stored answer was a
 * sentence ("n + (n + 1) + (n + 2) = 45; the integers are 14, 15, 16"). Nobody
 * can type that. Here every item asks ONE thing, two kinds per tier:
 *
 *   (a) multiple choice "Which equation models this situation?" — each wrong
 *       choice is a classic mis-translation (wrong operation, fee and rate
 *       swapped, fee multiplied instead of added, parentheses dropped, a
 *       subtraction written backwards). A wrong choice is never true at the
 *       situation's own solution, so no two choices are equivalent equations.
 *   (b) typed "set it up and solve" — the answer is one number.
 *
 * This file serves two courses, so the course id is on each template.
 * Every answer is re-solved from the printed prompt in
 * tests/unit/courseLevelWordEquations.test.js.
 */

const K = require('./templateKit');
const { int, pick } = K;

const COURSE_ID = null;
const GB = '5-8';

// ── helpers ────────────────────────────────────────────────────────────────

const RETRY = new Error('retry');
const again = () => { throw RETRY; };

/** Redraw until the generator produces a clean item. */
function g(f) {
  return (r, idx) => {
    for (let i = 0; i < 400; i++) {
      try { return f(r, idx); } catch (e) { if (e !== RETRY) throw e; }
    }
    throw new Error('no clean draw in 400 tries');
  };
}

/** Multiple choice: the right answer at a drawn position among three distinct wrong ones. */
function mc(r, correct, wrongs) {
  const c = String(correct);
  const w = [...new Set(wrongs.map(String))].filter((x) => x !== c);
  if (w.length < 3) again();
  const options = w.slice(0, 3);
  const pos = int(r, 0, 3);
  options.splice(pos, 0, c);
  return { value: c, options, correctOption: 'ABCD'[pos] };
}

/**
 * Equation choices. Each wrong one is [text, left side − right side at the
 * situation's true solution]; one that happens to hold there is an equivalent
 * (or accidentally true) equation, so the draw is thrown away.
 */
function mcEq(r, right, wrongs) {
  for (const [, residual] of wrongs) if (Math.abs(residual) < 1e-9) again();
  return mc(r, right, wrongs.map(([text]) => text));
}

const cents = (x) => Math.round(x * 100) / 100;
/** 6 → "6", 2.5 → "2.50" — a money amount the way a price tag prints it. */
const amt = (x) => (Number.isInteger(cents(x)) ? String(cents(x)) : cents(x).toFixed(2));
const usd = (x) => `$${amt(x)}`;
/** A plain number with a real minus sign: −9, 2.5. */
const n$ = (x) => (x < 0 ? `−${cents(-x)}` : String(cents(x)));
const NAMES = ['Maya', 'Leo', 'Ana', 'Kai', 'Rosa', 'Tyler', 'Dana', 'Eli', 'Mia', 'Sam', 'Noor', 'Luis', 'Jen', 'Omar', 'Priya', 'Ben'];
const name = (r) => pick(r, NAMES);

// ── 6th grade: g6-word-problem-equations ───────────────────────────────────

const G6_JOBS = ['babysitting', 'walking dogs', 'mowing lawns', 'washing cars', 'tutoring'];
const G6_THINGS = ['stickers', 'trading cards', 'marbles', 'beads', 'seashells'];
const G6_SHARE = [['granola bars', 'players'], ['pencils', 'students'], ['juice boxes', 'campers'], ['markers', 'art tables'], ['tennis balls', 'teams']];
const G6_PRICED = [['Notebooks', 'notebooks'], ['Smoothies', 'smoothies'], ['Bus passes', 'bus passes'], ['Paint brushes', 'paint brushes'], ['Raffle tickets', 'raffle tickets']];
const G6_PRICES = [0.75, 1.25, 1.5, 2.5, 3.5, 4.25];
const G6_PAIRS = [['sandwich', 'drink'], ['book', 'bookmark'], ['movie ticket', 'bag of popcorn'], ['helmet', 'bike bell'], ['T-shirt', 'sticker']];
const G6_FRACS = [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [2, 5], [3, 5]];
const G6_FEES = [
  ['A bowling alley charges', 'to rent shoes', 'game', 'games', 'g', 'the number of games'],
  ['A skate park charges', 'to enter', 'hour of skating', 'hours', 'h', 'the number of hours'],
  ['A fair charges', 'for admission', 'ride', 'rides', 'r', 'the number of rides'],
  ['A photo shop charges', 'for a setup fee', 'print', 'prints', 'p', 'the number of prints'],
];
const G6_TOPPED = [
  ['A pizza shop charges', 'for a large pizza', 'topping', 'toppings'],
  ['A phone plan costs', 'per month', 'gigabyte of extra data', 'gigabytes of extra data'],
  ['A taxi charges', 'to start a trip', 'mile', 'miles'],
  ['A print shop charges', 'for a poster', 'added color', 'added colors'],
];
const G6_SIBS = ['sister', 'brother', 'cousin'];

const g6Tier2 = g((r, idx) => {
  const N = name(r);
  if (idx === 0) {
    const rate = int(r, 6, 12), h = int(r, 3, 9), total = rate * h, job = pick(r, G6_JOBS);
    return {
      prompt: `${N} earns $${rate} per hour ${job} and wants to earn $${total} in all. Let h be the number of hours ${N} must work. Which equation models this situation?`,
      ...mcEq(r, `${rate}h = ${total}`, [
        [`h + ${rate} = ${total}`, h + rate - total],
        [`h ÷ ${rate} = ${total}`, h / rate - total],
        [`${total}h = ${rate}`, total * h - rate],
      ]),
      explanation: `"$${rate} per hour" means multiply: ${rate} dollars for each of h hours is ${rate}h, and that must equal ${total}. So ${rate}h = ${total} (h = ${h}). Writing h + ${rate} = ${total} adds where "per" calls for multiplying.`,
    };
  }
  if (idx === 1) {
    const spent = int(r, 12, 38), left = int(r, 9, 45), place = pick(r, ['the book fair', 'the arcade', 'the school store', 'the farmers market']);
    return {
      prompt: `After spending $${spent} at ${place}, ${N} has $${left} left. How many dollars did ${N} have before going to ${place}?`,
      value: String(spent + left),
      explanation: `Let m be the starting amount. Spending takes away: m − ${spent} = ${left}. Add ${spent} to both sides: m = ${left} + ${spent} = ${spent + left}. The slip is subtracting the two numbers that are given.`,
    };
  }
  if (idx === 2) {
    const gave = int(r, 8, 29), left = int(r, 12, 48), thing = pick(r, G6_THINGS);
    if (gave === left) again();
    const s = gave + left;
    return {
      prompt: `${N} had some ${thing}. After giving away ${gave} of them, ${N} has ${left} left. Let s be the number of ${thing} ${N} had at the start. Which equation models this situation?`,
      ...mcEq(r, `s − ${gave} = ${left}`, [
        [`s + ${gave} = ${left}`, s + gave - left],
        [`${gave} − s = ${left}`, gave - s - left],
        [`${gave}s = ${left}`, gave * s - left],
      ]),
      explanation: `Start with s, take away ${gave}, and ${left} remain: s − ${gave} = ${left} (so s = ${s}). ${gave} − s = ${left} subtracts in the wrong order, and s + ${gave} = ${left} adds what was given away.`,
    };
  }
  const [thing, group] = pick(r, G6_SHARE);
  const groups = int(r, 4, 9), each = int(r, 3, 12);
  if (groups === each) again();
  return {
    prompt: `A coach splits a box of ${thing} equally among ${groups} ${group}. Each of the ${groups} gets ${each} and none are left over. How many ${thing} were in the box?`,
    value: String(groups * each),
    explanation: `Let b be the number in the box. Splitting equally divides: b ÷ ${groups} = ${each}. Multiply both sides by ${groups}: b = ${each} × ${groups} = ${groups * each}. Dividing ${each} by ${groups} undoes nothing.`,
  };
});

const g6Tier3 = g((r, idx) => {
  const N = name(r);
  if (idx === 0) {
    const [Thing, thing] = pick(r, G6_PRICED);
    const price = pick(r, G6_PRICES), n = int(r, 4, 12), total = cents(price * n);
    return {
      prompt: `${Thing} cost ${usd(price)} each. ${N} spent ${usd(total)} on ${thing}. Let n be the number of ${thing} ${N} bought. Which equation models this situation?`,
      ...mcEq(r, `${amt(price)}n = ${amt(total)}`, [
        [`n + ${amt(price)} = ${amt(total)}`, n + price - total],
        [`n ÷ ${amt(price)} = ${amt(total)}`, n / price - total],
        [`${amt(total)}n = ${amt(price)}`, total * n - price],
      ]),
      explanation: `${usd(price)} for each of n ${thing} is ${amt(price)}n dollars, and that is the ${usd(total)} spent: ${amt(price)}n = ${amt(total)} (n = ${n}). "Each" means multiply, not add ${amt(price)} once.`,
    };
  }
  if (idx === 1) {
    const [big, small] = pick(r, G6_PAIRS);
    const smallP = pick(r, [0.75, 1.25, 1.5, 1.75, 2.25, 2.5]);
    const bigP = int(r, 9, 25) / 2 + (int(r, 0, 1) ? 0.25 : 0);
    if (bigP <= smallP) again();
    const together = cents(bigP + smallP);
    return {
      prompt: `A ${big} and a ${small} cost ${usd(together)} together. The ${small} costs ${usd(smallP)}. What is the price of the ${big}, in dollars?`,
      value: String(cents(bigP)),
      explanation: `Let p be the price of the ${big}: p + ${amt(smallP)} = ${amt(together)}. Subtract ${amt(smallP)} from both sides: p = ${amt(together)} − ${amt(smallP)} = ${amt(bigP)}. Adding the two given amounts is the slip.`,
    };
  }
  if (idx === 2) {
    const [a, b] = pick(r, G6_FRACS), k = int(r, 2, 9);
    const part = a * k, whole = b * k;
    const ctx = pick(r, [
      [`A recipe uses ${a}/${b} of a bag of flour, which is ${part} cups.`, 'c', 'the number of cups in a full bag'],
      [`${N} has read ${a}/${b} of a book, which is ${part} pages.`, 'p', 'the number of pages in the whole book'],
      [`${N} has walked ${a}/${b} of a trail, which is ${part} kilometers.`, 'd', 'the length of the whole trail in kilometers'],
    ]);
    const v = ctx[1];
    return {
      prompt: `${ctx[0]} Let ${v} be ${ctx[2]}. Which equation models this situation?`,
      ...mcEq(r, `(${a}/${b})${v} = ${part}`, [
        [`${v} + ${a}/${b} = ${part}`, whole + a / b - part],
        [`(${b}/${a})${v} = ${part}`, (b / a) * whole - part],
        [`${v} = (${a}/${b})(${part})`, whole - (a / b) * part],
      ]),
      explanation: `"${a}/${b} of" the whole means multiply the whole by ${a}/${b}: (${a}/${b})${v} = ${part}, so ${v} = ${part} ÷ ${a}/${b} = ${whole}. Taking ${a}/${b} of ${part} finds a part of the part, not the whole.`,
    };
  }
  const [a, b] = pick(r, G6_FRACS), k = int(r, 6, 15);
  const part = a * k, whole = b * k;
  const ctx = pick(r, [
    `${N} has saved ${a}/${b} of the price of a skateboard, which is $${part}. What is the price of the skateboard, in dollars?`,
    `A water tank is ${a}/${b} full and holds ${part} liters right now. How many liters does the tank hold when it is full?`,
    `${a}/${b} of the students in a club are sixth graders, and the club has ${part} sixth graders. How many students are in the club?`,
  ]);
  return {
    prompt: ctx,
    value: String(whole),
    explanation: `Let w be the whole amount: (${a}/${b})w = ${part}. Divide by ${a}/${b} (multiply by ${b}/${a}): w = ${part} × ${b}/${a} = ${whole}. Multiplying ${part} by ${a}/${b} gives a smaller number, which cannot be the whole.`,
  };
});

const g6Tier4 = g((r, idx) => {
  const N = name(r);
  if (idx === 0) {
    const [who, feeFor, unit, , v, vMeans] = pick(r, G6_FEES);
    const fee = int(r, 3, 9), rate = int(r, 2, 8), x = int(r, 2, 9);
    if (fee === rate) again();
    const total = fee + rate * x;
    return {
      prompt: `${who} $${fee} ${feeFor} plus $${rate} per ${unit}. ${N} paid $${total} in all. Let ${v} be ${vMeans}. Which equation models this situation?`,
      ...mcEq(r, `${rate}${v} + ${fee} = ${total}`, [
        [`${fee}${v} + ${rate} = ${total}`, fee * x + rate - total],
        [`${rate}(${v} + ${fee}) = ${total}`, rate * (x + fee) - total],
        [`${fee + rate}${v} = ${total}`, (fee + rate) * x - total],
      ]),
      explanation: `The $${fee} is paid once and the $${rate} is paid for each ${unit}: ${rate}${v} + ${fee} = ${total} (${v} = ${x}). ${fee}${v} + ${rate} swaps the fee and the rate; ${rate}(${v} + ${fee}) multiplies the one-time fee too.`,
    };
  }
  if (idx === 1) {
    const [who, baseFor, unit, units] = pick(r, G6_TOPPED);
    const base = int(r, 6, 15), rate = pick(r, [0.5, 0.75, 1.25, 1.5, 2.5]), x = pick(r, [2, 4, 6, 8]);
    const total = cents(base + rate * x);
    return {
      prompt: `${who} $${base} ${baseFor} plus ${usd(rate)} for each ${unit}. ${N} paid ${usd(total)}. How many ${units} did ${N} pay for?`,
      value: String(x),
      explanation: `Let t be the number of ${units}: ${base} + ${amt(rate)}t = ${amt(total)}. Subtract ${base}: ${amt(rate)}t = ${amt(total - base)}. Divide by ${amt(rate)}: t = ${x}. Dividing ${amt(total)} by ${amt(rate)} first forgets the $${base}.`,
    };
  }
  if (idx === 2) {
    const star = int(r, 14, 28), others = int(r, 3, 6), each = int(r, 4, 12);
    const total = star + others * each;
    const sport = pick(r, ['basketball', 'quiz bowl', 'volleyball']);
    return {
      prompt: `A ${sport} team scored ${total} points. One player scored ${star} of them, and the rest of the points were scored equally by ${others} other players. Let p be the number of points each of those ${others} players scored. Which equation models this situation?`,
      ...mcEq(r, `${others}p + ${star} = ${total}`, [
        [`${others}p = ${total}`, others * each - total],
        [`${others}(p + ${star}) = ${total}`, others * (each + star) - total],
        [`${star}p + ${others} = ${total}`, star * each + others - total],
      ]),
      explanation: `${others} players with p points each is ${others}p; add the one player's ${star}: ${others}p + ${star} = ${total} (p = ${each}). ${others}p = ${total} ignores the ${star} points already accounted for.`,
    };
  }
  const sib = pick(r, G6_SIBS), diff = int(r, 2, 6), young = int(r, 5, 12);
  const sum = young + young + diff;
  return {
    prompt: `${N} is ${diff} years older than ${N}'s ${sib}. The sum of their two ages is ${sum}. How old is ${N}'s ${sib}, in years?`,
    value: String(young),
    explanation: `Let s be the ${sib}'s age, so ${N} is s + ${diff}. s + (s + ${diff}) = ${sum} → 2s + ${diff} = ${sum} → 2s = ${sum - diff} → s = ${young}. Halving ${sum} without removing the ${diff} first is the slip.`,
  };
});

// ── 7th grade: g7-equation-word-problems ───────────────────────────────────

const G7_PLACES = ['a mountain camp', 'a ski town', 'a research station'];
const G7_GROUPS = [
  ['friends', 'pays the admission price', 'for a locker', 'the admission price in dollars'],
  ['students', 'pays the ticket price', 'for a snack', 'the ticket price in dollars'],
  ['skaters', 'pays the entry price', 'to rent skates', 'the entry price in dollars'],
];
const G7_ITEMS = [['shirts', 'shirt'], ['backpacks', 'backpack'], ['video games', 'video game'], ['hats', 'hat']];
const G7_KINDS = [
  ['consecutive integers', 1],
  ['consecutive even integers', 2],
  ['consecutive odd integers', 2],
];

/** Three consecutive (or consecutive even/odd) integers, smallest first. */
function drawRun(r, lo, hi) {
  const [kind, step] = pick(r, G7_KINDS);
  let n = int(r, lo, hi);
  if (kind.includes('even') && n % 2 !== 0) n += 1;
  if (kind.includes('odd') && n % 2 === 0) n += 1;
  if (n === 0 || n === -step || n === -2 * step) again();   // keep zero out of the run
  return { kind, step, n, sum: 3 * n + 3 * step };
}

const g7Tier2 = g((r, idx) => {
  const N = name(r);
  if (idx === 0) {
    const start = int(r, 2, 9), fall = int(r, 2, 4), h = int(r, 3, 8);
    const end = start - fall * h;
    if (end >= 0 || start - fall < 2) again();
    return {
      prompt: `At noon the temperature at ${pick(r, G7_PLACES)} was ${start}°C. It then fell ${fall}°C every hour until it reached ${n$(end)}°C. Let h be the number of hours the temperature fell. Which equation models this situation?`,
      ...mcEq(r, `${start} − ${fall}h = ${n$(end)}`, [
        [`${start} + ${fall}h = ${n$(end)}`, start + fall * h - end],
        [`${fall}h − ${start} = ${n$(end)}`, fall * h - start - end],
        [`${start - fall}h = ${n$(end)}`, (start - fall) * h - end],
      ]),
      explanation: `Start at ${start} and take away ${fall} for each of h hours: ${start} − ${fall}h = ${n$(end)} (h = ${h}). ${start} + ${fall}h makes the temperature rise, and ${start - fall}h subtracts before multiplying.`,
    };
  }
  if (idx === 1) {
    const k = int(r, 3, 6), fee = int(r, 2, 5), price = int(r, 8, 24);
    const total = k * (price + fee);
    return {
      prompt: `${N} bought ${k} concert tickets online. A $${fee} service fee was added to the price of each ticket, and ${N} paid $${total} in all. What was the price of one ticket before the fee, in dollars?`,
      value: String(price),
      explanation: `Let t be the ticket price. Each ticket costs t + ${fee}, and there are ${k}: ${k}(t + ${fee}) = ${total}. Divide by ${k}: t + ${fee} = ${total / k}. Subtract ${fee}: t = ${price}. Using ${k}t + ${fee} = ${total} charges the fee only once.`,
    };
  }
  if (idx === 2) {
    const [group, pays, extraFor, vMeans] = pick(r, G7_GROUPS);
    const k = int(r, 3, 8), extra = pick(r, [1.5, 2.5, 3.5, 4.5]), a = int(r, 6, 15);
    const total = cents(k * (a + extra));
    return {
      prompt: `Each of ${k} ${group} ${pays} plus ${usd(extra)} ${extraFor}. Together the ${k} ${group} pay ${usd(total)}. Let a be ${vMeans}. Which equation models this situation?`,
      ...mcEq(r, `${k}(a + ${amt(extra)}) = ${amt(total)}`, [
        [`${k}a + ${amt(extra)} = ${amt(total)}`, k * a + extra - total],
        [`${k}(a − ${amt(extra)}) = ${amt(total)}`, k * (a - extra) - total],
        [`${amt(extra)}(a + ${k}) = ${amt(total)}`, extra * (a + k) - total],
      ]),
      explanation: `One person pays a + ${amt(extra)}; ${k} people pay ${k} times that: ${k}(a + ${amt(extra)}) = ${amt(total)} (a = ${a}). Dropping the parentheses, ${k}a + ${amt(extra)}, charges the ${usd(extra)} to only one person.`,
    };
  }
  const more = int(r, 2, 9), w = int(r, 4, 15), u = pick(r, ['cm', 'm', 'ft', 'yd']);
  const per = 2 * w + 2 * (w + more);
  return {
    prompt: `The perimeter of a rectangle is ${per} ${u}. The length is ${more} ${u} more than the width. What is the width of the rectangle, in ${u}?`,
    value: String(w),
    explanation: `Let w be the width, so the length is w + ${more}. Perimeter: 2w + 2(w + ${more}) = ${per} → 4w + ${2 * more} = ${per} → 4w = ${per - 2 * more} → w = ${w}. Adding only one length and one width gives half the perimeter.`,
  };
});

const g7Tier3 = g((r, idx) => {
  const N = name(r);
  if (idx === 0) {
    const { kind, step, n, sum } = drawRun(r, -30, 40);
    const run = (s) => `n + (n + ${s}) + (n + ${2 * s})`;
    const other = step === 1 ? 2 : 1;
    return {
      prompt: `The sum of three ${kind} is ${n$(sum)}. Let n be the smallest of the three. Which equation models this situation?`,
      ...mcEq(r, `${run(step)} = ${n$(sum)}`, [
        [`${run(other)} = ${n$(sum)}`, 3 * n + 3 * other - sum],
        [`3n = ${n$(sum)}`, 3 * n - sum],
        [`n + ${step} + ${2 * step} = ${n$(sum)}`, n + 3 * step - sum],
      ]),
      explanation: `${kind[0].toUpperCase()}${kind.slice(1)} go up by ${step}: n, n + ${step}, n + ${2 * step}. Their sum is ${n$(sum)} (n = ${n$(n)}). Going up by ${other} describes ${step === 1 ? 'consecutive even or odd integers' : 'plain consecutive integers'}; 3n treats all three as equal.`,
    };
  }
  if (idx === 1) {
    const drop = pick(r, [0.5, 1.5, 2.5]), h = int(r, 3, 9), start = pick(r, [1.5, 2.5, 3.5, 4, 5, 6.5]);
    const end = cents(start - drop * h);
    if (end >= 0) again();
    return {
      prompt: `A freezer is switched on when the temperature inside is ${n$(start)}°C. The temperature then drops ${n$(drop)}°C each hour. After how many hours is the temperature inside ${n$(end)}°C?`,
      value: String(h),
      explanation: `Let h be the hours: ${n$(start)} − ${n$(drop)}h = ${n$(end)}. Subtract ${n$(start)}: −${n$(drop)}h = ${n$(cents(end - start))}. Divide by −${n$(drop)}: h = ${h}. Losing the negative on ${n$(end)} is the common slip.`,
    };
  }
  if (idx === 2) {
    const b = pick(r, [2, 3, 4, 5]), extra = int(r, 4, 12), k = int(r, 6, 15);
    const s = b * k, total = k + extra;
    const [big, small] = pick(r, [['bike helmet', 'bell'], ['pair of shoes', 'pair of socks'], ['video game', 'game guide'], ['tent', 'flashlight']]);
    const fr = `1/${b}`;
    return {
      prompt: `${N} spent ${fr} of a savings account on a ${big} and then $${extra} more on a ${small}, spending $${total} in all. Let s be the amount in the savings account at the start, in dollars. Which equation models this situation?`,
      ...mcEq(r, `(${fr})s + ${extra} = ${total}`, [
        [`(${fr})(s + ${extra}) = ${total}`, (s + extra) / b - total],
        [`${b}s + ${extra} = ${total}`, b * s + extra - total],
        [`(${fr})s − ${extra} = ${total}`, s / b - extra - total],
      ]),
      explanation: `${fr} of the savings is (${fr})s, and the $${extra} is added on top: (${fr})s + ${extra} = ${total} (s = ${s}). (${fr})(s + ${extra}) takes a fraction of the $${extra} too; ${b}s multiplies where "${fr} of" divides.`,
    };
  }
  const more = pick(r, [1.5, 2.5, 3.5, 4.5]), w = int(r, 7, 25) / 2, u = pick(r, ['cm', 'm', 'ft']);
  const per = cents(4 * w + 2 * more);
  return {
    prompt: `The perimeter of a rectangle is ${n$(per)} ${u}. The length is ${n$(more)} ${u} more than the width. What is the width of the rectangle, in ${u}?`,
    value: String(w),
    explanation: `Let w be the width; the length is w + ${n$(more)}. 2w + 2(w + ${n$(more)}) = ${n$(per)} → 4w + ${n$(2 * more)} = ${n$(per)} → 4w = ${n$(cents(per - 2 * more))} → w = ${n$(w)}. Subtracting ${n$(more)} only once forgets there are two lengths.`,
  };
});

const g7Tier4 = g((r, idx) => {
  const N = name(r);
  if (idx === 0) {
    const [things, thing] = pick(r, G7_ITEMS);
    const k = int(r, 3, 6), off = pick(r, [2.5, 3.5, 4.5, 5.25]), p = int(r, 12, 30);
    const total = cents(k * (p - off));
    return {
      prompt: `${N} bought ${k} ${things} that all had the same regular price. A coupon took ${usd(off)} off the price of each ${thing}, and ${N} paid ${usd(total)} in all. Let p be the regular price of one ${thing}, in dollars. Which equation models this situation?`,
      ...mcEq(r, `${k}(p − ${amt(off)}) = ${amt(total)}`, [
        [`${k}p − ${amt(off)} = ${amt(total)}`, k * p - off - total],
        [`${k}(p + ${amt(off)}) = ${amt(total)}`, k * (p + off) - total],
        [`${k}(${amt(off)} − p) = ${amt(total)}`, k * (off - p) - total],
      ]),
      explanation: `Each ${thing} costs p − ${amt(off)} after the coupon, and there are ${k}: ${k}(p − ${amt(off)}) = ${amt(total)} (p = ${p}). Without parentheses, ${k}p − ${amt(off)}, the coupon is used on only one ${thing}.`,
    };
  }
  if (idx === 1) {
    const { kind, n, step, sum } = drawRun(r, -45, -5);
    if (n + 2 * step >= 0) again();
    const ask = pick(r, ['greatest', 'smallest']);
    const ans = ask === 'greatest' ? n + 2 * step : n;
    return {
      prompt: `The sum of three ${kind} is ${n$(sum)}. What is the ${ask} of the three integers?`,
      value: String(ans),
      explanation: `Let n be the smallest: n + (n + ${step}) + (n + ${2 * step}) = ${n$(sum)} → 3n + ${3 * step} = ${n$(sum)} → 3n = ${n$(sum - 3 * step)} → n = ${n$(n)}. The three are ${n$(n)}, ${n$(n + step)}, ${n$(n + 2 * step)}, so the ${ask} is ${n$(ans)}.`,
    };
  }
  if (idx === 2) {
    const m = pick(r, [2, 3]), less = int(r, 1, 6), w = int(r, 5, 12), u = pick(r, ['cm', 'm', 'ft']);
    const len = m * w - less;
    if (len <= w) again();
    const per = 2 * w + 2 * len;
    const times = m === 2 ? 'twice' : 'three times';
    return {
      prompt: `The length of a rectangle is ${less} ${u} less than ${times} its width. The perimeter of the rectangle is ${per} ${u}. Let w be the width in ${u}. Which equation models this situation?`,
      ...mcEq(r, `2w + 2(${m}w − ${less}) = ${per}`, [
        [`w + (${m}w − ${less}) = ${per}`, w + len - per],
        [`2w + 2(${less} − ${m}w) = ${per}`, 2 * w + 2 * (less - m * w) - per],
        [`w(${m}w − ${less}) = ${per}`, w * len - per],
      ]),
      explanation: `"${less} less than ${times} the width" is ${m}w − ${less}. Perimeter counts both widths and both lengths: 2w + 2(${m}w − ${less}) = ${per} (w = ${w}). ${less} − ${m}w subtracts backwards; w(${m}w − ${less}) is the area.`,
    };
  }
  const k = int(r, 3, 6), x = int(r, 2, 9), pen = x + pick(r, [0.5, 1.5, 2.5, 3.5]);
  const total = cents(k * (x - pen));
  return {
    prompt: `In each of the ${k} rounds of a quiz game, ${N} earned the same number of points and then lost ${n$(pen)} points as a penalty. After the ${k} rounds ${N}'s total score was ${n$(total)} points. How many points did ${N} earn in each round before the penalty?`,
    value: String(x),
    explanation: `Let e be the points earned in a round. Each round nets e − ${n$(pen)}: ${k}(e − ${n$(pen)}) = ${n$(total)}. Divide by ${k}: e − ${n$(pen)} = ${n$(cents(total / k))}. Add ${n$(pen)}: e = ${x}. Dropping the negative sign on ${n$(total)} is the slip.`,
  };
});

const TEMPLATES = [
  {
    courseId: '6th-grade-math',
    courseSkill: 'g6-word-problem-equations',
    skillId: 'g6-word-problem-equations-check',
    tiers: [
      { difficulty: 2, gen: g6Tier2 },
      { difficulty: 3, gen: g6Tier3 },
      { difficulty: 4, gen: g6Tier4 },
    ],
  },
  {
    courseId: '7th-grade-math',
    courseSkill: 'g7-equation-word-problems',
    skillId: 'g7-equation-word-problems-check',
    tiers: [
      { difficulty: 2, gen: g7Tier2 },
      { difficulty: 3, gen: g7Tier3 },
      { difficulty: 4, gen: g7Tier4 },
    ],
  },
];

module.exports = { COURSE_ID, GB, TEMPLATES };
