'use strict';
/**
 * 7th-grade at-level check items — every item RE-SOLVED from its printed text.
 *
 * Nothing here calls the templates' own maths. Each re-solver regexes the
 * numbers out of the prompt a student would read, works the answer a second
 * way with rules typed by hand below (a tiny expression evaluator, brute-force
 * search for inequalities, Heron's formula for triangle areas, statistics
 * written out longhand), and compares with the keyed answer.
 */

const { expand, validate } = require('../../scripts/buildCourseLevelItems');
const bank = require('../../scripts/lib/courseLevelGrade7');

// ── reading numbers and expressions the way a student would ────────────────

const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const near = (a, b) => Math.abs(a - b) < 1e-9;

/** "−2 1/3", "3/4", "-1.5", "12" → number. */
function val(tok) {
  const t = String(tok).trim().replace(/[−–]/g, '-');
  let m;
  if ((m = t.match(/^(-?)(\d+) (\d+)\/(\d+)$/))) return (m[1] ? -1 : 1) * (Number(m[2]) + Number(m[3]) / Number(m[4]));
  if ((m = t.match(/^(-?\d+)\/(\d+)$/))) return Number(m[1]) / Number(m[2]);
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  throw new Error(`cannot read number "${tok}"`);
}

/** Recursive-descent evaluator: + − × ÷ /, parentheses, implicit multiplication, mixed numbers. */
function evalExpr(src, vars = {}) {
  const s = String(src).replace(/[−–]/g, '-')
    .replace(/(\d+) (\d+)\/(\d+)/g, '($1+$2/$3)')
    .replace(/(\d+)\/(\d+)/g, '($1/$2)');
  const toks = s.match(/\d+(?:\.\d+)?|[a-z]|[-+×÷*/()]/g);
  let i = 0;
  const isVar = (t) => t !== undefined && /^[a-z]$/.test(t);
  function factor() {
    const t = toks[i++];
    if (t === '-') return -factor();
    if (t === '(') { const v = expr(); if (toks[i++] !== ')') throw new Error(`unbalanced: ${src}`); return v; }
    if (isVar(t)) { if (!(t in vars)) throw new Error(`no value for ${t} in ${src}`); return vars[t]; }
    if (t === undefined || !/^\d/.test(t)) throw new Error(`cannot parse: ${src}`);
    return parseFloat(t);
  }
  function term() {
    let v = factor();
    for (;;) {
      const t = toks[i];
      if (t === '×' || t === '*') { i++; v *= factor(); } else if (t === '÷' || t === '/') { i++; v /= factor(); } else if (t === '(' || isVar(t)) v *= factor();
      else return v;
    }
  }
  function expr() {
    let v = term();
    for (;;) {
      const t = toks[i];
      if (t === '+') { i++; v += term(); } else if (t === '-') { i++; v -= term(); } else return v;
    }
  }
  const out = expr();
  if (i !== toks.length) throw new Error(`trailing input: ${src}`);
  return out;
}

const keyed = (item) => item.options.find((o) => o.label === item.correctOption).text;
const others = (item) => item.options.filter((o) => o.label !== item.correctOption).map((o) => o.text);

/** A typed answer: one number, in the stated form, equal to `expected`. */
function typed(item, expected) {
  expect(item.answerType).toBe('constructed-response');
  const v = item.answer.value;
  expect(v).toMatch(/^-?\d+(\.\d+)?$|^-?\d+\/\d+$/);
  if (v.includes('/')) {
    const [n, d] = v.split('/').map(Number);
    expect(gcd(Math.abs(n), d)).toBe(1);
    expect(d).toBeGreaterThan(1);
  }
  if (/fraction in lowest terms/.test(item.prompt)) expect(v).toMatch(/\//);
  else expect(v).not.toMatch(/\//);
  if (/Give your answer as a decimal\./.test(item.prompt)) expect(v).toMatch(/\./);
  expect(Number.isFinite(expected)).toBe(true);
  if (!near(val(v), expected)) throw new Error(`${item.problemId}: keyed ${v}, re-solved ${expected} — ${item.prompt}`);
}

/** A multiple-choice answer whose text must be exactly `expectedText`. */
function choice(item, expectedText) {
  expect(item.answerType).toBe('multiple-choice');
  if (keyed(item) !== expectedText) throw new Error(`${item.problemId}: keyed "${keyed(item)}", re-solved "${expectedText}" — ${item.prompt}`);
  expect(others(item)).not.toContain(expectedText);
}

const none = (item) => { throw new Error(`no re-solver matched: ${item.prompt}`); };

/** Expression items: the keyed option agrees with `target(x)` everywhere, each other option disagrees somewhere. */
function sameExpression(item, target, optionExpr = (t) => t) {
  const XS = [2, 5, -3, 0.5];
  expect(XS.every((x) => near(evalExpr(optionExpr(keyed(item)), { x }), target(x)))).toBe(true);
  for (const o of others(item)) {
    expect(XS.some((x) => !near(evalExpr(optionExpr(o), { x }), target(x)))).toBe(true);
  }
}

// ── inequalities: brute force ──────────────────────────────────────────────

const cmp = (a, op, b) => ({ '<': a < b - 1e-9, '>': a > b + 1e-9, '≤': a <= b + 1e-9, '≥': a >= b - 1e-9 }[op]);

// ── tables ─────────────────────────────────────────────────────────────────

function table(str) {
  const m = String(str).match(/x: (.+?); y: (.+)$/);
  if (!m) throw new Error(`no table in "${str}"`);
  const read = (part) => part.split(', ').map((t) => (t.trim() === '?' ? null : val(t)));
  return { xs: read(m[1]), ys: read(m[2]) };
}
const proportional = ({ xs, ys }) => xs.every((x, i) => near(ys[i] / x, ys[0] / xs[0]));
const proportionalEquation = (eq) => {
  const rhs = eq.replace(/^y = /, '');
  const ratios = [1, 2, 3, 7].map((x) => evalExpr(rhs, { x }) / x);
  return ratios.every((q) => near(q, ratios[0]));
};

// Typed by hand: the descriptions that ARE proportional (no starting amount, constant multiple).
const PROPORTIONAL_DESCRIPTIONS = [
  'The total cost of gasoline at $4 per gallon, and the number of gallons bought',
  'The distance a car travels at a steady 60 miles per hour, and the number of hours driven',
  'The total pay at $15 per hour, and the number of hours worked',
  'The number of pages printed at 20 pages per minute, and the number of minutes',
  'The perimeter of a square, and its side length',
  'The water in a pool that starts empty and fills at 12 gallons per minute, and the minutes of filling',
  'The circumference of a circle, and its diameter',
  'The cost of ribbon sold at $0.75 per foot with no other fees, and the number of feet bought',
];

// ── statistics, longhand ───────────────────────────────────────────────────

const sum = (a) => a.reduce((s, v) => s + v, 0);
const mean = (a) => sum(a) / a.length;
const sorted = (a) => a.slice().sort((p, q) => p - q);
const median = (a) => { const s = sorted(a); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const range = (a) => Math.max(...a) - Math.min(...a);
const mad = (a) => { const m = mean(a); return sum(a.map((v) => Math.abs(v - m))) / a.length; };
const iqr = (a) => { const s = sorted(a); const h = Math.floor(s.length / 2); return median(s.slice(s.length - h)) - median(s.slice(0, h)); };

function dataSets(prompt) {
  const out = {};
  const re = /([A-Z][a-z]+ [AB]): ([\d, ]+)\./g;
  let m;
  while ((m = re.exec(prompt))) out[m[1]] = m[2].split(', ').map(Number);
  const names = Object.keys(out);
  if (names.length !== 2) throw new Error(`expected two data sets: ${prompt}`);
  if (/listed in order/.test(prompt)) for (const n of names) expect(out[n]).toEqual(sorted(out[n]));
  return { out, names };
}

const heron = (a, b, c) => { const s = (a + b + c) / 2; return Math.sqrt(s * (s - a) * (s - b) * (s - c)); };

// ── the re-solvers, one per skill ──────────────────────────────────────────

const SOLVERS = {
  'g7-add-subtract-rationals': (item) => {
    const p = item.prompt; let m;
    if ((m = p.match(/^Calculate: (.+)\. Give your answer/))) return typed(item, evalExpr(m[1]));
    if ((m = p.match(/elevation of (−[\d.]+) m\. It rises ([\d.]+) m and then dives ([\d.]+) m/))) return typed(item, val(m[1]) + val(m[2]) - val(m[3]));
    if ((m = p.match(/balance of (−)\$([\d.]+)\. After a deposit of \$([\d.]+) and then a purchase of \$([\d.]+)/))) return typed(item, -val(m[2]) + val(m[3]) - val(m[4]));
    if ((m = p.match(/sum of two numbers is (.+?)\. One of the numbers is (.+?)\. What/))) return typed(item, val(m[1]) - val(m[2]));
    return none(item);
  },

  'g7-multiply-divide-rationals': (item) => {
    const p = item.prompt; let m;
    if ((m = p.match(/^Calculate: (.+)\. Give your answer/))) return typed(item, evalExpr(m[1]));
    if ((m = p.match(/changes by (−[\d.]+) °C each hour\..*after (.+?) hours/))) return typed(item, val(m[1]) * val(m[2]));
    if ((m = p.match(/product of a number and (.+?) is (.+?)\. What/))) return typed(item, val(m[2]) / val(m[1]));
    if ((m = p.match(/changes by (−[\d.]+) m in ([\d.]+) minutes/))) return typed(item, val(m[1]) / val(m[2]));
    return none(item);
  },

  'g7-simplify-expressions': (item) => {
    const p = item.prompt; let m;
    if ((m = p.match(/^Which expression is equivalent to (.+)\?$/))) return sameExpression(item, (x) => evalExpr(m[1], { x }));
    if ((m = p.match(/^Which expression shows (.+) factored using the greatest common factor\?$/))) {
      sameExpression(item, (x) => evalExpr(m[1], { x }));
      const f = keyed(item).match(/^(\d+)\((.+)\)$/);
      expect(f).not.toBeNull();
      const b = evalExpr(f[2], { x: 0 }), a = evalExpr(f[2], { x: 1 }) - b;
      expect(gcd(Math.abs(a), Math.abs(b))).toBe(1);          // nothing left to factor out
      return undefined;
    }
    if ((m = p.match(/simplified (.+) and got (.+)\. Which statement is correct\?$/))) {
      const truth = (x) => evalExpr(m[1], { x });
      expect([2, 5].some((x) => !near(evalExpr(m[2], { x }), truth(x)))).toBe(true);   // the student really is wrong
      const fixed = keyed(item).match(/so the answer is (.+)$/);
      expect(fixed).not.toBeNull();
      expect(keyed(item)).toMatch(/did not distribute the negative/);
      expect([2, 5, -3].every((x) => near(evalExpr(fixed[1], { x }), truth(x)))).toBe(true);
      for (const o of others(item)) {
        const alt = o.match(/so the answer is (.+)$/);
        if (alt) expect([2, 5, -3].some((x) => !near(evalExpr(alt[1], { x }), truth(x)))).toBe(true);
        else expect(o).toBe('The student is correct');
      }
      return undefined;
    }
    if ((m = p.match(/length \((.+?)\) units and width \((.+?)\) units/))) {
      return sameExpression(item, (x) => 2 * evalExpr(m[1], { x }) + 2 * evalExpr(m[2], { x }));
    }
    return none(item);
  },

  'g7-inequalities': (item) => {
    const p = item.prompt; let m;
    if ((m = p.match(/(?:solutions of|satisfies) (.+?) ([<>≤≥]) (−?[\d.]+)\?$/))) {
      const truth = (x) => cmp(evalExpr(m[1], { x }), m[2], val(m[3]));
      const want = p.match(/the (greatest|least) integer/);
      if (want) {
        const hits = [];
        for (let x = -500; x <= 500; x++) if (truth(x)) hits.push(x);
        const pickd = want[1] === 'greatest' ? Math.max(...hits) : Math.min(...hits);
        expect(Math.abs(pickd)).toBeLessThan(500);            // the set really is bounded on that side
        return typed(item, pickd);
      }
      const agrees = (text) => {
        const o = text.match(/^x ([<>≤≥]) (−?\d+)$/);
        expect(o).not.toBeNull();
        for (let x = -60; x <= 60; x += 0.25) if (truth(x) !== cmp(x, o[1], val(o[2]))) return false;
        return true;
      };
      expect(agrees(keyed(item))).toBe(true);
      for (const o of others(item)) expect(agrees(o)).toBe(false);
      return undefined;
    }
    if ((m = p.match(/no more than \$(\d+)\. She buys a book for \$(\d+) and wants to buy notebooks that cost \$([\d.]+) each/))) {
      let n = 0;
      while (Math.round(Number(m[2]) * 100 + Number(m[3]) * 100 * (n + 1)) <= Number(m[1]) * 100) n += 1;
      return typed(item, n);
    }
    if ((m = p.match(/at least \$(\d+)\. It already has \$(\d+) and earns \$(\d+) at each car wash/))) {
      let n = 0;
      while (Number(m[2]) + Number(m[3]) * n < Number(m[1])) n += 1;
      return typed(item, n);
    }
    if ((m = p.match(/charges \$(\d+) to rent a lane plus \$(\d+) per game\. A group wants to spend no more than \$(\d+)/))) return choice(item, `${m[1]} + ${m[2]}g ≤ ${m[3]}`);
    if ((m = p.match(/earns \$(\d+) a day plus \$(\d+) for each sale\. She wants to earn at least \$(\d+)/))) return choice(item, `${m[1]} + ${m[2]}s ≥ ${m[3]}`);
    return none(item);
  },

  'g7-unit-rates': (item) => {
    const p = item.prompt; let m;
    if ((m = p.match(/walks (.+?) miles? in (.+?) hour\. At this rate, how many miles does he walk in (\d+) hours/))) return typed(item, val(m[1]) / val(m[2]) * Number(m[3]));
    if ((m = p.match(/walks (.+?) miles? in (.+?) hour\. What is her unit rate/))) return typed(item, val(m[1]) / val(m[2]));
    if ((m = p.match(/A ([\d.]+)-pound bag of rice costs \$([\d.]+)\./))) return typed(item, val(m[2]) / val(m[1]));
    if ((m = p.match(/uses (.+?) cup of sugar for (.+?) of a batch/))) return typed(item, val(m[1]) / val(m[2]));
    if ((m = p.match(/moves (.+?) (?:feet|foot) in (.+?) minute\./))) return typed(item, val(m[1]) / val(m[2]));
    if ((m = p.match(/rides (.+?) miles in (.+?) hours at a steady speed/))) return typed(item, val(m[1]) / val(m[2]));
    if ((m = p.match(/Brand A sells (\d+) ounces of trail mix for \$([\d.]+)\. Brand B sells (\d+) ounces for \$([\d.]+)\./))) {
      const ua = val(m[2]) / val(m[1]), ub = val(m[4]) / val(m[3]);
      expect(near(ua, ub)).toBe(false);
      return typed(item, Math.min(ua, ub));
    }
    if ((m = p.match(/fills (.+?) of a tank in (.+?) hour\./))) return typed(item, val(m[2]) / val(m[1]));
    if ((m = p.match(/uses (.+?) cups? of flour for every (.+?) teaspoon of salt/))) return typed(item, val(m[1]) / val(m[2]));
    if ((m = p.match(/Car A travels (.+?) miles on (.+?) gallons? of gas\. Car B travels (.+?) miles on (.+?) gallons? of gas/))) {
      return typed(item, Math.abs(val(m[1]) / val(m[2]) - val(m[3]) / val(m[4])));
    }
    if ((m = p.match(/running (.+?) mile in (.+?) hour is a unit rate of (.+?) mile per hour/))) {
      const D = val(m[1]), T = val(m[2]);
      expect(near(val(m[3]), D * T)).toBe(true);              // the claim really is the product…
      expect(near(val(m[3]), D / T)).toBe(false);             // …and really is wrong
      const k = keyed(item).match(/multiplied instead of dividing; the unit rate is .+ = (.+) miles per hour$/);
      expect(k).not.toBeNull();
      expect(near(val(k[1]), D / T)).toBe(true);
      for (const o of others(item)) {
        const alt = o.match(/the unit rate is (.+) miles per hour$/);
        if (alt) expect(near(val(alt[1]), D / T)).toBe(false);
      }
      return undefined;
    }
    if ((m = p.match(/Store A sells (.+?) pounds? of cheese for \$([\d.]+)\. Store B sells (.+?) pounds of the same cheese for \$([\d.]+)\./))) {
      return typed(item, Math.abs(val(m[2]) / val(m[1]) - val(m[4]) / val(m[3])));
    }
    return none(item);
  },

  'g7-percent-applications': (item) => {
    const p = item.prompt; let m;
    const N = (i) => Number(m[i]);
    if ((m = p.match(/costs \$(\d+) before tax\. The sales tax is (\d+)%\. What is the total cost/))) return typed(item, N(1) + N(1) * N(2) / 100);
    if ((m = p.match(/meal costs \$(\d+)\. How much is an? (\d+)% tip/))) return typed(item, N(1) * N(2) / 100);
    if ((m = p.match(/regular price of \$(\d+) is on sale for (\d+)% off\. What is the sale price/))) return typed(item, N(1) - N(1) * N(2) / 100);
    if ((m = p.match(/deposits \$(\d+) in an account that pays (\d+)% simple interest per year\. .* in (\d+) years/))) return typed(item, N(1) * N(2) / 100 * N(3));
    if ((m = p.match(/regular price of \$(\d+) is on sale for (\d+)% off\. Then (\d+)% sales tax is added to the sale price\. What is the final cost/))) {
      const sale = N(1) - N(1) * N(2) / 100;
      return typed(item, sale + sale * N(3) / 100);
    }
    if ((m = p.match(/buys a lamp for \$(\d+) and marks the price up by (\d+)%/))) return typed(item, N(1) + N(1) * N(2) / 100);
    if ((m = p.match(/commission of \$(\d+) on sales of \$(\d+)\. What percent/))) return typed(item, N(1) / N(2) * 100);
    if ((m = p.match(/Of the (\d+) students in a class, (\d+) walk to school, (\d+) ride the bus, and the rest come by car\. What percent/))) return typed(item, (N(1) - N(2) - N(3)) / N(1) * 100);
    if ((m = p.match(/meal costs \$(\d+) before tax\. Sales tax is (\d+)%, and Jo leaves an? (\d+)% tip on the before-tax price/))) return typed(item, N(1) + N(1) * N(2) / 100 + N(1) * N(3) / 100);
    if ((m = p.match(/After an? (\d+)% discount, a bike costs \$(\d+)\. What was the original price/))) {
      const orig = val(item.answer.value);
      expect(near(orig - orig * N(1) / 100, N(2))).toBe(true);   // run the discount forward
      return typed(item, N(2) / (1 - N(1) / 100));
    }
    if ((m = p.match(/A \$(\d+) coat is on sale for (\d+)% off, and then (\d+)% sales tax is added to the sale price\. Which expression/))) {
      const sale = N(1) - N(1) * N(2) / 100, fin = sale + sale * N(3) / 100;
      expect(near(evalExpr(keyed(item)), fin)).toBe(true);
      for (const o of others(item)) expect(near(evalExpr(o), fin)).toBe(false);
      return undefined;
    }
    if ((m = p.match(/earns \$(\d+) per week plus an? (\d+)% commission on sales\. Last week Kai earned \$(\d+) in all/))) {
      const sales = val(item.answer.value);
      expect(near(N(1) + sales * N(2) / 100, N(3))).toBe(true);  // run the pay forward
      return typed(item, (N(3) - N(1)) * 100 / N(2));
    }
    return none(item);
  },

  'g7-identify-proportional': (item) => {
    const p = item.prompt; let m;
    const oneOf = (isProp, wantProp) => {
      expect(isProp(keyed(item))).toBe(wantProp);
      for (const o of others(item)) expect(isProp(o)).toBe(!wantProp);
    };
    if (/^Which table represents a proportional relationship/.test(p)) return oneOf((t) => proportional(table(t)), true);
    if (/^Which table does NOT represent a proportional relationship/.test(p)) return oneOf((t) => proportional(table(t)), false);
    if (/^Which equation represents a proportional relationship|^In which of these equations is y proportional to x/.test(p)) return oneOf(proportionalEquation, true);
    if (/^Which equation does NOT represent a proportional relationship/.test(p)) return oneOf(proportionalEquation, false);
    if ((m = p.match(/^Is the relationship in this table proportional\? (x: .+)$/))) {
      const t = table(m[1]);
      const yes = proportional(t);
      expect(keyed(item).startsWith(yes ? 'Yes, because y ÷ x equals' : 'No, because y ÷ x is not the same')).toBe(true);
      const k = keyed(item).match(/equals ([\d.]+) for every pair/);
      if (yes) expect(near(val(k[1]), t.ys[0] / t.xs[0])).toBe(true);
      for (const o of others(item)) expect(o).not.toMatch(/y ÷ x/);
      return undefined;
    }
    if ((m = p.match(/^What value of ([xy]) makes this table a proportional relationship\? (x: .+)$/))) {
      const t = table(m[2]);
      const i = t.xs.findIndex((x, j) => x !== null && t.ys[j] !== null);
      const k = t.ys[i] / t.xs[i];
      const hole = (m[1] === 'x' ? t.xs : t.ys).indexOf(null);
      expect(hole).toBeGreaterThanOrEqual(0);
      const filled = m[1] === 'x' ? t.ys[hole] / k : k * t.xs[hole];
      const full = { xs: t.xs.map((x) => (x === null ? filled : x)), ys: t.ys.map((y) => (y === null ? filled : y)) };
      expect(proportional(full)).toBe(true);
      return typed(item, filled);
    }
    if (/^Which of these describes a proportional relationship|^In which of these pairs is the first quantity proportional/.test(p)) {
      return oneOf((t) => PROPORTIONAL_DESCRIPTIONS.includes(t), true);
    }
    if ((m = p.match(/^(\w+) looks at this table — (x: .+?) — and says the relationship is proportional because y goes up by (\d+)/))) {
      const t = table(m[2]);
      expect(proportional(t)).toBe(false);
      expect(t.ys[1] - t.ys[0]).toBe(Number(m[3]));
      const k = keyed(item).match(/is wrong: the ratios y ÷ x are not equal \((\d+) ÷ 1 = (\d+), but (\d+) ÷ 2 = ([\d.]+)\)$/);
      expect(k).not.toBeNull();
      expect(t.xs.slice(0, 2)).toEqual([1, 2]);
      expect([Number(k[1]), Number(k[3])]).toEqual(t.ys.slice(0, 2));
      expect(Number(k[2])).toBe(t.ys[0]);
      expect(near(Number(k[4]), t.ys[1] / 2)).toBe(true);
      for (const o of others(item)) expect(o).not.toMatch(/ratios y ÷ x are not equal/);
      return undefined;
    }
    return none(item);
  },

  'g7-constant-of-proportionality': (item) => {
    const p = item.prompt; let m;
    if ((m = p.match(/In this table, y is proportional to x\. (x: .+?; y: .+?)\. (What is the constant|The same relationship can be written as x = ky)/))) {
      const t = table(m[1]);
      expect(proportional(t)).toBe(true);
      const k = t.ys[0] / t.xs[0];
      return typed(item, m[2].startsWith('The same') ? 1 / k : k);
    }
    if ((m = p.match(/(\d+) tickets cost \$([\d.]+)\./))) return typed(item, val(m[2]) / val(m[1]));
    if ((m = p.match(/\(0, 0\) and \((\d+), (\d+)\)\. What is the constant of proportionality k in y = kx/))) return typed(item, val(m[2]) / val(m[1]));
    if ((m = p.match(/given by (\d+)y = (\d+)x\./))) return typed(item, val(m[2]) / val(m[1]));
    if ((m = p.match(/uses (.+?) cups? of (flour|sugar) for every (.+?) cups? of (flour|sugar)\. The relationship is written as ([fs]) = k([fs]),/))) {
      const amount = { [m[2][0]]: val(m[1]), [m[4][0]]: val(m[3]) };
      return typed(item, amount[m[5]] / amount[m[6]]);
    }
    if ((m = p.match(/When x = (.+?), y = (.+?)\. What is the constant/))) return typed(item, val(m[2]) / val(m[1]));
    return none(item);
  },

  'g7-proportional-equations': (item) => {
    const p = item.prompt; let m;
    // Typed by hand: which letters each situation uses, output first.
    const LETTERS = { Almonds: ['c', 'p'], printer: ['n', 't'], Dana: ['e', 'h'], train: ['d', 't'] };
    if ((m = p.match(/^(?:(Almonds) cost \$(\d+) per pound|A (printer) prints (\d+) pages per minute|(Dana) earns \$(\d+) per hour|A (train) travels (\d+) miles per hour)\. Which equation gives/))) {
      const who = m[1] || m[3] || m[5] || m[7], k = m[2] || m[4] || m[6] || m[8];
      const [Y, X] = LETTERS[who];
      return choice(item, `${Y} = ${k}${X}`);
    }
    if ((m = p.match(/c = ([\d.]+)p\. How many pounds of almonds can be bought for \$([\d.]+)\?/))) return typed(item, val(m[2]) / val(m[1]));
    if ((m = p.match(/e = ([\d.]+)h\. How much does Dana earn, in dollars, in (\d+) hours/))) return typed(item, val(m[1]) * val(m[2]));
    if ((m = p.match(/travels (\d+) miles on (\d+) gallons of gas at a constant rate\. Which equation/))) return choice(item, `m = ${val(m[1]) / val(m[2])}g`);
    if ((m = p.match(/y = ([\d.]+) when x = ([\d.]+)\. What is y when x = ([\d.]+)\?/))) return typed(item, val(m[1]) / val(m[2]) * val(m[3]));
    if ((m = p.match(/y = ([\d.]+) when x = ([\d.]+)\. What is x when y = ([\d.]+)\?/))) return typed(item, val(m[3]) / (val(m[1]) / val(m[2])));
    if ((m = p.match(/proportional relationship in this table\? (x: .+)$/))) {
      const t = table(m[1]);
      expect(proportional(t)).toBe(true);
      return choice(item, `y = ${t.ys[0] / t.xs[0]}x`);
    }
    if ((m = p.match(/^(\d+) notebooks cost \$([\d.]+)\. .* do (\d+) notebooks cost/))) return typed(item, val(m[2]) / val(m[1]) * val(m[3]));
    if ((m = p.match(/fills (\d+) bottles every (\d+) seconds/))) {
      const k = keyed(item).match(/^b = \((\d+)\/(\d+)\)t$/);
      expect(k).not.toBeNull();
      expect(gcd(Number(k[1]), Number(k[2]))).toBe(1);
      expect(near(Number(k[1]) / Number(k[2]), val(m[1]) / val(m[2]))).toBe(true);
      for (const o of others(item)) {
        const rhs = o.replace(/^b = /, '');
        expect(near(evalExpr(rhs, { t: 2 * val(m[2]) }), 2 * val(m[1]))).toBe(false);   // twice the time must give twice the bottles
      }
      return undefined;
    }
    if ((m = p.match(/earns \$([\d.]+) for (\d+) hours of work\. .* to earn \$([\d.]+)\?/))) return typed(item, val(m[3]) / (val(m[1]) / val(m[2])));
    if ((m = p.match(/uses (.+?) cups? of flour to make (\d+) cookies\. .* to make (\d+) cookies\?/))) return typed(item, val(m[3]) / (val(m[2]) / val(m[1])));
    return none(item);
  },

  'g7-graph-proportional': (item) => {
    const p = item.prompt; let m;
    const money = (k) => (Number.isInteger(k) ? String(k) : k.toFixed(2));
    // Typed by hand: what the unit-rate point and the origin mean in each context.
    const MEANING = {
      grapes: { one: (k) => `Each pound of grapes costs $${money(k)}`, zero: 'Buying 0 pounds of grapes costs $0' },
      cyclist: { one: (k) => `The cyclist rides ${k} miles each hour`, zero: 'In 0 hours the cyclist has ridden 0 miles' },
      work: { one: (k) => `The worker earns $${money(k)} for each hour`, zero: 'Working 0 hours earns $0' },
    };
    const ctx = () => (/grapes/.test(p) ? 'grapes' : /cyclist/.test(p) ? 'cyclist' : /hours of work/.test(p) ? 'work' : none(item));
    if ((m = p.match(/passes through the point \(1, ([\d.]+)\)\. What does this point mean\?/))) return choice(item, MEANING[ctx()].one(val(m[1])));
    if (/What does the point \(0, 0\) on the graph mean\?/.test(p)) return choice(item, MEANING[ctx()].zero);
    if ((m = p.match(/passes through the point \((\d+), ([\d.]+)\)\. Which statement is true\?/))) {
      const x = val(m[1]), y = val(m[2]);
      const honest = (text) => {
        const n = text.match(/\d+(?:\.\d+)?/g).map(Number);
        return n.length === 3 && n[0] === x && n[1] === y && near(n[2], y / x);
      };
      expect(honest(keyed(item))).toBe(true);
      for (const o of others(item)) expect(honest(o)).toBe(false);
      return undefined;
    }
    if ((m = p.match(/Line A .*?\(0, 0\) and \((\d+), ([\d.]+)\)\. Line B .*?\(0, 0\) and \((\d+), ([\d.]+)\)\./))) {
      return typed(item, Math.abs(val(m[2]) / val(m[1]) - val(m[4]) / val(m[3])));
    }
    if (!(m = p.match(/\(0, 0\) and \((\d+), ([\d.]+)\)\. (.+)$/))) return none(item);
    const k = val(m[2]) / val(m[1]), ask = m[3]; let q;
    if (/^What is the unit rate|^What is the value of y at the point where x = 1/.test(ask)) return typed(item, k);
    if ((q = ask.match(/^What is y when x = ([\d.]+)\?/))) return typed(item, k * val(q[1]));
    if ((q = ask.match(/^For what value of x is y = ([\d.]+)\?/))) return typed(item, val(q[1]) / k);
    if (/^Which of these points also lies on the graph\?/.test(ask)) {
      const on = (text) => { const c = text.match(/^\((.+), (.+)\)$/); return near(val(c[2]), k * val(c[1])); };
      expect(on(keyed(item))).toBe(true);
      for (const o of others(item)) expect(on(o)).toBe(false);
      return undefined;
    }
    if (/^Which statement is true\?/.test(ask)) {
      const honest = (text) => {
        const c = text.match(/^The point \((.+), (.+)\) is on the graph, so the unit rate is (.+)$/);
        return near(val(c[2]), k * val(c[1])) && near(val(c[3]), k);
      };
      expect(honest(keyed(item))).toBe(true);
      for (const o of others(item)) expect(honest(o)).toBe(false);
      return undefined;
    }
    return none(item);
  },

  'g7-surface-area': (item) => {
    const p = item.prompt; let m;
    const N = (i) => Number(m[i]);
    if ((m = p.match(/rectangular prism is (\d+) cm long, (\d+) cm wide and (\d+) cm tall\. What is its surface area/))) {
      return typed(item, 2 * N(1) * N(2) + 2 * N(1) * N(3) + 2 * N(2) * N(3));
    }
    if ((m = p.match(/open-top box .* is (\d+) cm long, (\d+) cm wide and (\d+) cm tall/))) {
      return typed(item, N(1) * N(2) + 2 * N(1) * N(3) + 2 * N(2) * N(3));          // five faces: no lid
    }
    if ((m = p.match(/square bases with sides of (\d+) m, and the prism is (\d+) m tall/))) return typed(item, 2 * N(1) * N(1) + 4 * N(1) * N(2));
    if ((m = p.match(/sides of (\d+) m and its slant height is (\d+) m\. Only the four triangular faces .* cost \$(\d+) per m²/))) {
      return typed(item, 4 * (N(1) * N(2) / 2) * N(3));
    }
    if ((m = p.match(/square pyramid has a base with sides of (\d+) (?:in|m)\b.*?slant height\)? of ([\d.]+) (?:in|m)\./))) {
      return typed(item, N(1) * N(1) + 4 * (N(1) * N(2) / 2));
    }
    if ((m = p.match(/sides of (\d+) cm, (\d+) cm and (\d+) cm \(.*right angle\)\. The prism is (\d+) cm long/))
      || (m = p.match(/legs of (\d+) cm and (\d+) cm and a longest side of (\d+) cm\. The wedge is (\d+) cm long/))) {
      expect(N(1) * N(1) + N(2) * N(2)).toBe(N(3) * N(3));                          // the triangle described exists and is right
      return typed(item, 2 * heron(N(1), N(2), N(3)) + (N(1) + N(2) + N(3)) * N(4));
    }
    if ((m = p.match(/base of (\d+) ft, a height of (\d+) ft, and two equal sides of (\d+) ft\. The prism is (\d+) ft long/))) {
      expect((N(1) / 2) ** 2 + N(2) ** 2).toBe(N(3) ** 2);
      return typed(item, 2 * heron(N(1), N(3), N(3)) + (N(1) + 2 * N(3)) * N(4));
    }
    if ((m = p.match(/(\d+) m long, (\d+) m wide and ([\d.]+) m high\. Only the four walls .* covers (\d+) m²/))) {
      const walls = 2 * N(1) * N(3) + 2 * N(2) * N(3);
      let litres = 0;
      while (litres * N(4) < walls) litres += 1;
      return typed(item, litres);
    }
    if ((m = p.match(/(\d+) cm long, (\d+) cm wide and (\d+) cm tall\. Ignoring overlap, .* cover (\d+) of these boxes/))) {
      return typed(item, N(4) * (2 * N(1) * N(2) + 2 * N(1) * N(3) + 2 * N(2) * N(3)));
    }
    if ((m = p.match(/each (\d+) ft wide at the bottom and (\d+) ft tall, and each slanted side of the triangle is (\d+) ft\. The tent is (\d+) ft long/))) {
      expect((N(1) / 2) ** 2 + N(2) ** 2).toBe(N(3) ** 2);
      return typed(item, 2 * heron(N(1), N(3), N(3)) + 2 * N(3) * N(4));            // two ends + two slanted sides, no floor
    }
    return none(item);
  },

  'g7-volume': (item) => {
    const p = item.prompt; let m;
    const V = (i) => val(m[i]);
    if ((m = p.match(/rectangular prism is (.+?) (?:cm|in) long, (.+?) (?:cm|in) wide and (.+?) (?:cm|in) tall\. What is its volume/))) return typed(item, V(1) * V(2) * V(3));
    if ((m = p.match(/triangular base with a base of ([\d.]+) (?:cm|m) and a height of ([\d.]+) (?:cm|m)\. The prism is ([\d.]+) (?:cm|m) long\. What is its volume/))) return typed(item, V(1) * V(2) / 2 * V(3));
    if ((m = p.match(/base area of ([\d.]+) m² and a height of ([\d.]+) m\./))) return typed(item, V(1) * V(2));
    if ((m = p.match(/measures (.+?) ft by (.+?) ft by (.+?) ft\./))) return typed(item, V(1) * V(2) * V(3));
    if ((m = p.match(/volume of ([\d.]+) cm³\. It is ([\d.]+) cm long and ([\d.]+) cm wide\. What is its height/))) return typed(item, V(1) / V(2) / V(3));
    if ((m = p.match(/cube has edges of (.+?) in\./))) return typed(item, V(1) ** 3);
    if ((m = p.match(/volume of (\d+) cm³\. Its triangular base has a base of (\d+) cm and a height of (\d+) cm\. How long is the prism/))) return typed(item, V(1) / (V(2) * V(3) / 2));
    if ((m = p.match(/parallel sides of (\d+) ft and (\d+) ft and a height of ([\d.]+) ft\. The trough is (\d+) ft long/))) return typed(item, (V(1) + V(2)) / 2 * V(3) * V(4));
    if ((m = p.match(/rectangular prism ([\d.]+) m long, ([\d.]+) m wide and ([\d.]+) m tall\. It is filled with water to (\d+\/\d+) of its height/))) return typed(item, V(1) * V(2) * V(3) * V(4));
    if ((m = p.match(/volume of (\d+) in³ and is (\d+) in long\. Its triangular base has a base of (\d+) in\./))) return typed(item, 2 * (V(1) / V(2)) / V(3));
    return none(item);
  },

  'g7-compare-data-sets': (item) => {
    const p = item.prompt; let m;
    const { out, names } = dataSets(p);
    const [A, B] = names;
    const more = (f) => { expect(f(out[A])).not.toBe(f(out[B])); return f(out[A]) > f(out[B]) ? A : B; };
    const less = (f) => (more(f) === A ? B : A);
    const gap = (f) => { const d = f(out[m[1]]) - f(out[m[2]]); expect(d).toBeGreaterThan(0); return d; };
    if ((m = p.match(/How much greater is the mean for (\w+ [AB]) than the mean for (\w+ [AB])\?/))) return typed(item, gap(mean));
    if ((m = p.match(/How much greater is the median for (\w+ [AB]) than the median for (\w+ [AB])\?/))) return typed(item, gap(median));
    if (/What is the difference between the range for/.test(p)) return typed(item, Math.abs(range(out[A]) - range(out[B])));
    if ((m = p.match(/mean absolute deviation \(MAD\) for (\w+ [AB]) than the MAD for (\w+ [AB])\?/))) return typed(item, gap(mad));
    if ((m = p.match(/interquartile range \(IQR\) for (\w+ [AB]) than the IQR for (\w+ [AB])\?/))) return typed(item, gap(iqr));
    if (/more consistent \(less spread out\)/.test(p)) {
      const steady = less(range), loose = more(range);
      expect(less(mad)).toBe(steady);                         // range and MAD agree, so the answer does not depend on the measure
      return choice(item, `${steady}, because its range is smaller (${range(out[steady])} compared with ${range(out[loose])})`);
    }
    if (/Which statement is true\?$/.test(p)) {
      if (/mean absolute deviation/.test(keyed(item))) return choice(item, `${more(mean)} has the greater mean, and ${more(mad)} has the greater mean absolute deviation`);
      return choice(item, `${more(median)} has the greater median and ${more(range)} has the greater range`);
    }
    if (/The difference between the two means is how many times the MAD\?/.test(p)) {
      expect(near(mad(out[A]), mad(out[B]))).toBe(true);
      const stated = p.match(/Each set has a mean absolute deviation \(MAD\) of (\d+)\./);
      if (stated) expect(near(mad(out[A]), Number(stated[1]))).toBe(true);
      else expect(p).toMatch(/Both sets have the same mean absolute deviation/);
      return typed(item, Math.abs(mean(out[A]) - mean(out[B])) / mad(out[A]));
    }
    if ((m = p.match(/Both sets have an interquartile range \(IQR\) of (\d+)\. The difference between the two medians is how many times the IQR\?/))) {
      expect(iqr(out[A])).toBe(Number(m[1]));
      expect(iqr(out[B])).toBe(Number(m[1]));
      return typed(item, Math.abs(median(out[A]) - median(out[B])) / Number(m[1]));
    }
    return none(item);
  },
};

// ── the suite ──────────────────────────────────────────────────────────────

const EXPECTED_SKILLS = [
  'g7-add-subtract-rationals', 'g7-multiply-divide-rationals', 'g7-simplify-expressions', 'g7-inequalities',
  'g7-unit-rates', 'g7-percent-applications', 'g7-identify-proportional', 'g7-constant-of-proportionality',
  'g7-proportional-equations', 'g7-graph-proportional', 'g7-surface-area', 'g7-volume', 'g7-compare-data-sets',
];

const bySkill = {};
for (const t of bank.TEMPLATES) bySkill[t.skillId] = expand(t, bank.GB);
const allItems = Object.values(bySkill).flat();

describe('7th-grade course-level items', () => {
  test('the bank is the thirteen skills of the 7th-grade course', () => {
    expect(bank.COURSE_ID).toBe('7th-grade-math');
    expect(bank.GB).toBe('6-8');
    expect(bank.TEMPLATES.map((t) => t.skillId)).toEqual(EXPECTED_SKILLS);
    for (const t of bank.TEMPLATES) {
      expect(t.courseSkill).toBe(t.skillId);
      expect(t.tiers.map((x) => x.difficulty)).toEqual([2, 3, 4]);
    }
  });

  test('every template has a re-solver (and no re-solver is orphaned)', () => {
    expect(Object.keys(SOLVERS).sort()).toEqual(bank.TEMPLATES.map((t) => t.skillId).sort());
  });

  test('the builder accepts every item', () => {
    expect(validate(allItems)).toEqual([]);
    expect(allItems).toHaveLength(13 * 12);
  });

  test('items are text only and one question each', () => {
    for (const it of allItems) {
      expect(it.prompt).not.toMatch(/\b(shown|figure|diagram|pictured)\b|\b(graph|table|chart|number line) (above|below)\b/i);
      expect(it.svg).toBeNull();
      expect(it.explanation.length).toBeGreaterThan(40);
    }
  });

  test('the right answer does not always sit in the same place', () => {
    for (const [skill, items] of Object.entries(bySkill)) {
      const letters = items.filter((i) => i.options).map((i) => i.correctOption);
      if (letters.length >= 4 && new Set(letters).size < 2) throw new Error(`${skill}: every keyed option is ${letters[0]}`);
    }
  });

  test('a tier is not one question four times', () => {
    for (const [skill, items] of Object.entries(bySkill)) {
      for (const d of [2, 3, 4]) {
        const tier = items.filter((i) => i.difficulty === d);
        expect(tier).toHaveLength(4);
        if (new Set(tier.map((i) => i.answer.value)).size < 3) throw new Error(`${skill} d${d}: answers repeat — ${tier.map((i) => i.answer.value).join(' | ')}`);
      }
    }
  });

  describe.each(EXPECTED_SKILLS)('%s', (skill) => {
    test('every item re-solves from its own text', () => {
      const items = bySkill[skill];
      expect(items).toHaveLength(12);
      for (const it of items) SOLVERS[skill](it);
    });
  });
});

describe('the re-solver tools themselves', () => {
  test('evalExpr reads what a student reads', () => {
    expect(evalExpr('−2 1/3 + 1 1/2')).toBeCloseTo(-5 / 6, 12);
    expect(evalExpr('3/4 ÷ (−2/5)')).toBeCloseTo(-15 / 8, 12);
    expect(evalExpr('−1/4 × 5/6 ÷ (−5/8)')).toBeCloseTo(1 / 3, 12);
    expect(evalExpr('5x − 2(3x − 4)', { x: 3 })).toBe(5);
    expect(evalExpr('(1/3)(6x − 3) − 6x', { x: 2 })).toBe(-9);
    expect(evalExpr('−5(2x − 3)', { x: 4 })).toBe(-25);
    expect(evalExpr('220(0.8)(1.08)')).toBeCloseTo(190.08, 9);
    expect(evalExpr('12 − 5x', { x: 2 })).toBe(2);
  });

  test('statistics', () => {
    expect(mad([10, 12, 9, 15, 14])).toBe(2);
    expect(median([9, 13, 4, 8, 11])).toBe(9);
    expect(iqr([9, 11, 13, 14, 16, 17, 19, 21])).toBe(6);
    expect(heron(3, 4, 5)).toBeCloseTo(6, 12);
  });
});
