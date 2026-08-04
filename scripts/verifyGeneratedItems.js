'use strict';
/**
 * INDEPENDENT verification of generated items.
 *
 * The generator computes its own answers, so testing it against itself proves
 * nothing. This script re-derives the answer by PARSING THE PROMPT and doing
 * the mathematics a second time, by a different route, then compares. A
 * template bug shows up as a mismatch here.
 *
 * Families it cannot re-derive (classification, correlation, conceptual
 * multiple-choice) are reported as UNCHECKED rather than silently counted as
 * passing — a verifier that quietly skips what it cannot do is worse than none.
 *
 *   node scripts/verifyGeneratedItems.js seeds/low-volume-items.generated.json
 */

const fs = require('fs');

const file = process.argv[2] || 'seeds/low-volume-items.generated.json';
/** Reduce n/d to a lowest-terms string, independently of templateKit. */
function reduceStr(n, d) {
  const g = (a, b) => (b ? g(b, a % b) : Math.abs(a));
  const k = g(n, d) || 1;
  const num = n / k, den = d / k;
  return den === 1 ? String(num) : `${num}/${den}`;
}

const items = JSON.parse(fs.readFileSync(file, 'utf8'));

const norm = (s) => String(s).replace(/[−–]/g, '-').replace(/\s+/g, '').replace(/\^/g, '');
const eq = (a, b) => norm(a) === norm(b);

let checked = 0, failed = 0;
const unchecked = {};
const failures = [];

function fail(it, expected) {
  failed += 1;
  failures.push(`${it.problemId}\n    Q: ${it.prompt}\n    stored: ${it.answer.value}\n    recomputed: ${expected}`);
}

for (const it of items) {
  const p = it.prompt;
  let m;

  // Evaluate ax + b when x = n   /   ax − b when x = n
  if ((m = p.match(/^Evaluate (-?\d*)x ([+−-]) (\d+) when x = (-?\d+)\.$/))) {
    const a = m[1] === '' ? 1 : Number(m[1]);
    const sign = m[2] === '+' ? 1 : -1;
    const expected = a * Number(m[4]) + sign * Number(m[3]);
    checked++; if (!eq(it.answer.value, expected)) fail(it, expected);
    continue;
  }
  // Evaluate ax² + by when x = .. and y = ..
  if ((m = p.match(/^Evaluate (\d+)x² \+ (\d+)y when x = (-?\d+) and y = (-?\d+)\.$/))) {
    const expected = Number(m[1]) * Number(m[3]) ** 2 + Number(m[2]) * Number(m[4]);
    checked++; if (!eq(it.answer.value, expected)) fail(it, expected);
    continue;
  }
  // Evaluate a(x + b) − c when x = n
  if ((m = p.match(/^Evaluate (\d+)\(x \+ (\d+)\) − (\d+) when x = (-?\d+)\.$/))) {
    const expected = Number(m[1]) * (Number(m[4]) + Number(m[2])) - Number(m[3]);
    checked++; if (!eq(it.answer.value, expected)) fail(it, expected);
    continue;
  }
  // Discriminant of x² + bx + c  (a = 1)
  if ((m = p.match(/^Find the discriminant of x² \+ (\d+)x \+ (\d+) = 0\.$/))) {
    const expected = Number(m[1]) ** 2 - 4 * Number(m[2]);
    checked++; if (!eq(it.answer.value, expected)) fail(it, expected);
    continue;
  }
  // Multiply: ax(bx + c)
  if ((m = p.match(/^Multiply: (\d+)x\((\d+)x \+ (\d+)\)$/))) {
    const a = Number(m[1]), b = Number(m[2]), c = Number(m[3]);
    checked++; if (!eq(it.answer.value, `${a * b}x2 + ${a * c}x`)) fail(it, `${a * b}x^2 + ${a * c}x`);
    continue;
  }
  // Multiply: (x + a)(x + b)
  if ((m = p.match(/^Multiply: \(x \+ (\d+)\)\(x \+ (\d+)\)$/))) {
    const a = Number(m[1]), b = Number(m[2]);
    checked++; if (!eq(it.answer.value, `x2 + ${a + b}x + ${a * b}`)) fail(it, `x^2 + ${a + b}x + ${a * b}`);
    continue;
  }
  // Multiply: (x − a)(x + b)
  if ((m = p.match(/^Multiply: \(x − (\d+)\)\(x \+ (\d+)\)$/))) {
    const a = Number(m[1]), b = Number(m[2]);
    const mid = b - a;
    // Conventional notation: no "+ 0x", and "− x" rather than "− 1x".
    const midStr = mid === 0 ? '' : (mid === 1 ? ' + x' : (mid === -1 ? ' − x' : (mid > 0 ? ` + ${mid}x` : ` − ${Math.abs(mid)}x`)));
    const expected = `x^2${midStr} − ${a * b}`;
    checked++; if (!eq(it.answer.value, expected)) fail(it, expected);
    continue;
  }
  // Multiply: (x + a)²
  if ((m = p.match(/^Multiply: \(x \+ (\d+)\)²$/))) {
    const a = Number(m[1]);
    checked++; if (!eq(it.answer.value, `x2 + ${2 * a}x + ${a * a}`)) fail(it, `x^2 + ${2 * a}x + ${a * a}`);
    continue;
  }
  // Mean / median / mode of a listed set
  if ((m = p.match(/^Find the (mean|median|mode) of: (.+)$/))) {
    const vals = m[2].split(',').map((v) => Number(v.trim()));
    const sorted = [...vals].sort((a, b) => a - b);
    let expected;
    if (m[1] === 'mean') {
      const raw = vals.reduce((s, v) => s + v, 0) / vals.length;
      expected = Number.isInteger(raw) ? raw : Math.round(raw * 100) / 100;
    } else if (m[1] === 'median') {
      const n = sorted.length;
      expected = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    } else {
      const counts = {};
      vals.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
      expected = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
    }
    checked++; if (!eq(it.answer.value, expected)) fail(it, expected);
    continue;
  }
  // Simplify: √n  (perfect square or k√rest)
  if ((m = p.match(/^Simplify: √(\d+)$/))) {
    const n = Number(m[1]);
    const stored = String(it.answer.value);
    let ok;
    const mm = stored.match(/^(\d+)√(\d+)$/);
    if (mm) ok = Number(mm[1]) ** 2 * Number(mm[2]) === n;
    else ok = Number(stored) ** 2 === n;
    checked++; if (!ok) fail(it, `something whose square-expansion is ${n}`);
    continue;
  }
  // Simplify: c√n
  if ((m = p.match(/^Simplify: (\d+)√(\d+)$/))) {
    const c = Number(m[1]), n = Number(m[2]);
    const mm = String(it.answer.value).match(/^(\d+)√(\d+)$/);
    const ok = mm && (Number(mm[1]) / c) ** 2 * Number(mm[2]) === n;
    checked++; if (!ok) fail(it, `c·√${n} simplified`);
    continue;
  }
  // a√r ± b√r
  if ((m = p.match(/^Simplify: (\d+)√(\d+) ([+−]) (\d+)√(\d+)$/))) {
    const a = Number(m[1]), r1 = Number(m[2]), op = m[3], b = Number(m[4]), r2 = Number(m[5]);
    const expected = r1 === r2 ? `${op === '+' ? a + b : a - b}√${r1}` : null;
    checked++; if (expected === null || !eq(it.answer.value, expected)) fail(it, expected);
    continue;
  }
  // √p · √q
  if ((m = p.match(/^Simplify: √(\d+) · √(\d+)$/))) {
    const prod = Number(m[1]) * Number(m[2]);
    const stored = String(it.answer.value);
    const mm = stored.match(/^(\d+)√(\d+)$/);
    const ok = mm ? Number(mm[1]) ** 2 * Number(mm[2]) === prod : stored === `√${prod}`;
    checked++; if (!ok) fail(it, `√${prod} simplified`);
    continue;
  }
  // Solve for x: a/x = b   and   x/k = c
  if ((m = p.match(/^Solve for x: {2}(\d+)\/x = (\d+)$/))) {
    const a = Number(m[1]), b = Number(m[2]);
    const g = (function gg(u, v) { return v ? gg(v, u % v) : u; })(a, b) || 1;
    const expected = b / g === 1 ? String(a / g) : `${a / g}/${b / g}`;
    checked++; if (!eq(it.answer.value, expected)) fail(it, expected);
    continue;
  }
  if ((m = p.match(/^Solve for x: {2}x\/(\d+) = (\d+)$/))) {
    const expected = Number(m[1]) * Number(m[2]);
    checked++; if (!eq(it.answer.value, expected)) fail(it, expected);
    continue;
  }
  // Point-slope with a positive x1
  if ((m = p.match(/^Write an equation in point-slope form for the line through \((-?\d+), (-?\d+)\) with slope (-?\d+)\./))) {
    const x1 = Number(m[1]), y1 = Number(m[2]), slope = Number(m[3]);
    const expected = x1 < 0
      ? `y − ${y1} = ${slope}(x + ${Math.abs(x1)})`
      : `y − ${y1} = ${slope}(x − ${x1})`;
    checked++; if (!eq(it.answer.value, expected)) fail(it, expected);
    continue;
  }
  // Ticket / sum-difference word problems: verify the stated answer satisfies the system
  if ((m = p.match(/^Adult tickets cost \$(\d+) and child tickets cost \$(\d+)\. A group bought (\d+) tickets for \$(\d+)\./))) {
    const [ad, ch, tot, money] = m.slice(1).map(Number);
    const a = Number(it.answer.value);
    checked++;
    if (!(Number.isInteger(a) && a >= 0 && a <= tot && ad * a + ch * (tot - a) === money)) {
      fail(it, `an integer a with ${ad}a + ${ch}(${tot}−a) = ${money}`);
    }
    continue;
  }
  if ((m = p.match(/^The sum of two numbers is (\d+) and their difference is (-?\d+)\./))) {
    const s = Number(m[1]), d = Number(m[2]);
    const expected = (s + d) / 2;
    checked++; if (!eq(it.answer.value, expected)) fail(it, expected);
    continue;
  }
  // Break-even
  if ((m = p.match(/^A shop pays \$(\d+) in fixed costs plus \$(\d+) per item, and sells each item for \$(\d+)\./))) {
    const [fixedC, per, price] = m.slice(1).map(Number);
    const expected = fixedC / (price - per);
    checked++; if (!eq(it.answer.value, expected)) fail(it, expected);
    continue;
  }
  // Probability from a bag
  if ((m = p.match(/^A bag holds (\d+) marbles, (\d+) of which are (?:red|blue)\. What is the probability of (NOT )?drawing/))) {
    const total = Number(m[1]), want = Number(m[2]);
    const num = m[3] ? total - want : want;
    const g = (function gg(u, v) { return v ? gg(v, u % v) : u; })(num, total) || 1;
    const expected = total / g === 1 ? String(num / g) : `${num / g}/${total / g}`;
    checked++; if (!eq(it.answer.value, expected)) fail(it, expected);
    continue;
  }
  // Die roll
  if ((m = p.match(/^A fair six-sided die is rolled\. What is the probability of rolling a number greater than (\d+)\?/))) {
    const t = Number(m[1]);
    const num = 6 - t;
    const g = (function gg(u, v) { return v ? gg(v, u % v) : u; })(num, 6) || 1;
    const expected = num === 0 ? '0' : (6 / g === 1 ? String(num / g) : `${num / g}/${6 / g}`);
    checked++; if (!eq(it.answer.value, expected)) fail(it, expected);
    continue;
  }
  // Geometric sequence next term
  if ((m = p.match(/^A sequence begins ([\d, ]+)\. What is the next term\?$/))) {
    const vals = m[1].split(',').map((v) => Number(v.trim()));
    const ratio = vals[1] / vals[0];
    const expected = vals[vals.length - 1] * ratio;
    checked++; if (!eq(it.answer.value, expected)) fail(it, expected);
    continue;
  }

  // ── grade 6 families ──
  const G = (u, v) => (v ? G(v, u % v) : u);
  if ((m = p.match(/^Find the sum: −(\d+) \+ (\d+)$/))) {
    checked++; const e = -Number(m[1]) + Number(m[2]); if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Find the difference: (\d+) − \(−(\d+)\)$/))) {
    checked++; const e = Number(m[1]) + Number(m[2]); if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Multiply: \(−(\d+)\) · \(−(\d+)\)$/))) {
    checked++; const e = Number(m[1]) * Number(m[2]); if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Divide: \(−(\d+)\) ÷ (\d+)$/))) {
    checked++; const e = -Number(m[1]) / Number(m[2]); if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Find the (GCF|LCM) of (\d+) and (\d+)\.$/))) {
    const a = Number(m[2]), b = Number(m[3]);
    const e = m[1] === 'GCF' ? G(a, b) : Math.abs(a * b) / G(a, b);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^What is (\d+)% of (\d+)\?$/))) {
    checked++; const e = (Number(m[1]) / 100) * Number(m[2]); if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Solve for x: {2}x \+ (\d+) = (\d+)$/))) {
    checked++; const e = Number(m[2]) - Number(m[1]); if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Solve for x: {2}(\d+)x = (\d+)$/))) {
    checked++; const e = Number(m[2]) / Number(m[1]); if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Solve for x: {2}(\d+)x ([+−]) (\d+) = (-?\d+)$/))) {
    const a = Number(m[1]), b = Number(m[3]), rhs = Number(m[4]);
    const e = m[2] === '+' ? (rhs - b) / a : (rhs + b) / a;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Simplify: (\d+)x \+ (\d+)x$/))) {
    checked++; const e = `${Number(m[1]) + Number(m[2])}x`; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Simplify: (\d+)x − (\d+)x \+ (\d+)$/))) {
    checked++; const e = `${Number(m[1]) - Number(m[2])}x + ${m[3]}`; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Simplify: (\d+)x \+ (\d+)y \+ (\d+)x \+ (\d+)y$/))) {
    const e = `${Number(m[1]) + Number(m[3])}x + ${Number(m[2]) + Number(m[4])}y`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Find the value: \|−(\d+)\|$/))) {
    checked++; if (!eq(it.answer.value, Number(m[1]))) fail(it, m[1]); continue;
  }
  if ((m = p.match(/^What is the opposite of −(\d+)\?$/))) {
    checked++; if (!eq(it.answer.value, Number(m[1]))) fail(it, m[1]); continue;
  }
  if ((m = p.match(/^Evaluate: \|−(\d+)\| − \|(\d+)\|$/))) {
    checked++; const e = Number(m[1]) - Number(m[2]); if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Divide: (\d+) ÷ (\d+)$/))) {
    checked++; const e = Number(m[1]) / Number(m[2]); if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Divide and give the remainder: (\d+) ÷ (\d+)$/))) {
    const n = Number(m[1]), d = Number(m[2]);
    const e = `${Math.floor(n / d)} R${n % d}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Find the area of a triangle with base (\d+) cm and height (\d+) cm\.$/))) {
    checked++; const e = (Number(m[1]) * Number(m[2])) / 2; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Find the area of a parallelogram with base (\d+) in and height (\d+) in\.$/))) {
    checked++; const e = Number(m[1]) * Number(m[2]); if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A triangle has area (\d+) cm² and base (\d+) cm\. What is its height\?$/))) {
    checked++; const e = (2 * Number(m[1])) / Number(m[2]); if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Convert: (\d+) feet = ___ inches$/))) {
    checked++; const e = Number(m[1]) * 12; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Convert: (\d+) meters = ___ centimeters$/))) {
    checked++; const e = Number(m[1]) * 100; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Convert: (\d+) cups = ___ quarts/))) {
    checked++; const e = Number(m[1]) / 4; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Add and simplify: (\d+)\/(\d+) \+ (\d+)\/(\d+)$/))) {
    const a = Number(m[1]), b = Number(m[2]), c = Number(m[3]), d = Number(m[4]);
    const num = a * d + c * b, den = b * d;
    const g = G(num, den) || 1;
    const e = den / g === 1 ? String(num / g) : `${num / g}/${den / g}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Multiply and simplify: (\d+)\/(\d+) · (\d+)\/(\d+)$/))) {
    const num = Number(m[1]) * Number(m[3]), den = Number(m[2]) * Number(m[4]);
    const g = G(num, den) || 1;
    const e = den / g === 1 ? String(num / g) : `${num / g}/${den / g}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Divide and simplify: (\d+)\/(\d+) ÷ (\d+)\/(\d+)$/))) {
    const num = Number(m[1]) * Number(m[4]), den = Number(m[2]) * Number(m[3]);
    const g = G(num, den) || 1;
    const e = den / g === 1 ? String(num / g) : `${num / g}/${den / g}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Find the RANGE of: (.+)$/))) {
    const vals = m[1].split(',').map((v) => Number(v.trim()));
    const e = Math.max(...vals) - Math.min(...vals);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Find the distance between \((-?\d+), (-?\d+)\) and \((-?\d+), (-?\d+)\)\.$/))) {
    const [x1, y1, x2, y2] = m.slice(1).map(Number);
    const e = x1 === x2 ? Math.abs(y1 - y2) : Math.abs(x1 - x2);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Complete the equivalent ratio: (\d+) : (\d+) = (\d+) : ___$/))) {
    const a = Number(m[1]), b = Number(m[2]), a2 = Number(m[3]);
    const e = (b * a2) / a;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }

  // ── Grade 8 ──────────────────────────────────────────────────────────────
  if ((m = p.match(/cube has edges of (\d+) cm\. If every edge is multiplied by (\d+)/))) {
    const s0 = Number(m[1]), k = Number(m[2]);
    const e = Math.pow(s0 * k, 3);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/radius and height are both multiplied by (\d+)\. By what factor/))) {
    const k = Number(m[1]);
    checked++; if (!eq(it.answer.value, k * k * k)) fail(it, k * k * k); continue;
  }
  if ((m = p.match(/edge lengths in the ratio (\d+):(\d+)\. What is the ratio of their volumes/))) {
    const a = Number(m[1]), b = Number(m[2]);
    const e = `${a * a * a}:${b * b * b}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/sphere has volume (\d+) in³.*radius (\d+) times as large/))) {
    const v = Number(m[1]), k = Number(m[2]);
    const e = v * k * k * k;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A line of best fit is y = (\d+)x \+ (\d+)\. Use it to predict y when x = (\d+)\.$/))) {
    const [a, b, x] = m.slice(1).map(Number);
    const e = a * x + b;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/y = (\d+)x \+ (\d+)\. A real data point at x = (\d+) has y = (\d+)/))) {
    const [a, b, x, y] = m.slice(1).map(Number);
    const e = y - (a * x + b);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A survey recorded: (\d+) students walk and play a sport, \d+ students walk and do not play a sport, (\d+) students ride the bus and play a sport/))) {
    const e = Number(m[1]) + Number(m[2]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/(\d+) like pizza and are in Grade 8, (\d+) like pizza and are in Grade 7, (\d+) like tacos and are in Grade 8, (\d+) like tacos and are in Grade 7/))) {
    const e = m.slice(1).map(Number).reduce((a, b) => a + b, 0);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Two angles of a triangle measure (\d+)° and (\d+)°/))) {
    const e = 180 - Number(m[1]) - Number(m[2]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Two angles are supplementary\. One measures (\d+)°/))) {
    const e = 180 - Number(m[1]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/right triangle has legs of (\d+) and (\d+)/))) {
    const a = Number(m[1]), b = Number(m[2]);
    const e = Math.sqrt(a * a + b * b);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/hypotenuse of (\d+) and one leg of (\d+)/))) {
    const c = Number(m[1]), a = Number(m[2]);
    const e = Math.sqrt(c * c - a * a);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/prism measures (\d+) by (\d+) by (\d+) cm/))) {
    const [l, w, h] = m.slice(1).map(Number);
    checked++; if (!eq(it.answer.value, l * w * h)) fail(it, l * w * h); continue;
  }
  if ((m = p.match(/cylinder has radius (\d+) cm and height (\d+) cm/))) {
    const r0 = Number(m[1]), h = Number(m[2]);
    const e = `${r0 * r0 * h}π`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^If f\(x\) = (\d+)x \+ (\d+), what is f\((\d+)\)\?$/))) {
    const [a, b, t] = m.slice(1).map(Number);
    checked++; if (!eq(it.answer.value, a * t + b)) fail(it, a * t + b); continue;
  }
  if ((m = p.match(/^Solve for x: {2}(\d+)x \+ (\d+) = (\d+)$/))) {
    const [a, b, rhs] = m.slice(1).map(Number);
    const e = (rhs - b) / a;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }

  // ── Grades 6 & 7 ─────────────────────────────────────────────────────────
  if ((m = p.match(/two rectangles that do not overlap: one is (\d+) cm by (\d+) cm, the other is (\d+) cm by (\d+) cm/))) {
    const [a, b, c, d] = m.slice(1).map(Number);
    const e = a * b + c * d;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/(\d+) cm by (\d+) cm rectangle with a triangle on top\. The triangle has base (\d+) cm and height (\d+) cm/))) {
    const [a, b, base, h] = m.slice(1).map(Number);
    const e = a * b + (base * h) / 2;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/(\d+) cm by (\d+) cm rectangle has a (\d+) cm by \d+ cm square cut out/))) {
    const [a, b, sq] = m.slice(1).map(Number);
    const e = a * b - sq * sq;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/(\d+) m by (\d+) m rectangle with a triangle of base (\d+) m and height (\d+) m/))) {
    const [a, b, base, h] = m.slice(1).map(Number);
    const e = a * b + (base * h) / 2;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/(\d+) ft by (\d+) ft rectangle with a (\d+) ft by (\d+) ft corner removed/))) {
    const [a, b, c, d] = m.slice(1).map(Number);
    const e = a * b - c * d;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/square of side (\d+) cm sits beside a (\d+) cm by (\d+) cm rectangle/))) {
    const [sq, a, b] = m.slice(1).map(Number);
    const e = sq * sq + a * b;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/recipe needs (\d+)\/(\d+) cup of sugar per batch.*for (\d+) batches/))) {
    const [n0, d0, b] = m.slice(1).map(Number);
    const e = reduceStr(n0 * b, d0);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/(\d+)-metre ribbon is cut into pieces (\d+)\/(\d+) of a metre/))) {
    const [t, n0, d0] = m.slice(1).map(Number);
    const e = (t * d0) / n0;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/temperature is (\d+)°C and falls by (\d+)°C/))) {
    const [a, b] = m.slice(1).map(Number);
    checked++; if (!eq(it.answer.value, a - b)) fail(it, a - b); continue;
  }
  if ((m = p.match(/One notebook costs \$([\d.]+)\. What is the cost of (\d+) notebooks/))) {
    const a = parseFloat(m[1]), b = Number(m[2]);
    const e = (a * b).toFixed(2);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/pack of (\d+) notebooks costs \$(\d+)/))) {
    const q = Number(m[1]), pr = Number(m[2]);
    const e = reduceStr(pr, q);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/\$(\d+) jacket is (\d+)% off/))) {
    const pr = Number(m[1]), pc = Number(m[2]);
    const e = pr - (pr * pc) / 100;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/tank holds (\d+) litres and (\d+) litres are used/))) {
    const a = Number(m[1]), b = Number(m[2]);
    const e = Math.round((100 * (a - b)) / a);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/Each of (\d+) friends pays \$(\d+), and one of them also pays a \$(\d+) fee/))) {
    const [n0, each, extra] = m.slice(1).map(Number);
    const e = n0 * each + extra;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/garden is (\d+) m long and (\d+) m wide/))) {
    const l = Number(m[1]), w = Number(m[2]);
    const e = 2 * (l + w);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/has \$(\d+), spends \$(\d+), then earns \$(\d+)/))) {
    const [a, b, c] = m.slice(1).map(Number);
    const e = a - b + c;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/(\d+) boxes with (\d+) pencils each\. If (\d+) pencils are taken/))) {
    const [bx, per, taken] = m.slice(1).map(Number);
    const e = bx * per - taken;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/pays \$(\d+) per hour plus a \$(\d+) bonus.*for (\d+) hours/))) {
    const [rate, bonus, hrs] = m.slice(1).map(Number);
    const e = rate * hrs + bonus;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/sample of (\d+) people, (\d+) preferred option A.*of (\d+) people/))) {
    const [n0, yes, pop] = m.slice(1).map(Number);
    const e = Math.round((yes / n0) * pop);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/sample of (\d+) students, (\d+) said they walk.*of the (\d+) students/))) {
    const [n0, yes, pop] = m.slice(1).map(Number);
    const e = Math.round((yes / n0) * pop);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/Of (\d+) club members, (\d+) are asked/))) {
    checked++; if (!eq(it.answer.value, Number(m[2]))) fail(it, Number(m[2])); continue;
  }
  if ((m = p.match(/In (\d+) coin flips, heads came up (\d+) times/))) {
    const t = Number(m[1]), h = Number(m[2]);
    const e = reduceStr(h, t);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/simulation of (\d+) trials produced (\d+) successes/))) {
    const t = Number(m[1]), h = Number(m[2]);
    const e = reduceStr(h, t);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/run (\d+) times to model an event with probability (\d+)%/))) {
    const t = Number(m[1]), pc = Number(m[2]);
    const e = (t * pc) / 100;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }

  // ── Algebra 2 ────────────────────────────────────────────────────────────
  if ((m = p.match(/remainder when (\d+)x² \+ (\d+) is divided by \(x − (\d+)\)/))) {
    const [a, b, c] = m.slice(1).map(Number);
    const e = a * c * c + b;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/remainder when (\d*)x³ \+ (\d+)x \+ (\d+) is divided by \(x − (\d+)\)/))) {
    const a = m[1] === '' ? 1 : Number(m[1]);
    const [b, c, k] = m.slice(2).map(Number);
    const e = a * k * k * k + b * k + c;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Is \(x − (\d+)\) a factor of x² ([−+]) (\d+)x ([−+]) (\d+)\?$/))) {
    const root = Number(m[1]);
    const b = (m[2] === '−' ? -1 : 1) * Number(m[3]);
    const c = (m[4] === '−' ? -1 : 1) * Number(m[5]);
    const e = root * root + b * root + c === 0 ? 'Yes' : 'No';
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^P\(x\) = \(x − (\d+)\)\(x − (\d+)\)\. What is P\((\d+)\)\?$/))) {
    const [r1, r2, x] = m.slice(1).map(Number);
    const e = (x - r1) * (x - r2);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/vertical asymptote of f\(x\) = 1\/\(x − (\d+)\)/))) {
    const e = `x = ${m[1]}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/f\(x\) = 1\/\(x \+ (\d+)\) has a vertical asymptote/))) {
    const e = `x = ${-Number(m[1])}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/horizontal asymptote of f\(x\) = \((\d+)x \+ 1\)\/\((\d+)x − 3\)/))) {
    const e = `y = ${reduceStr(Number(m[1]), Number(m[2]))}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/f\(x\) = \(\(x − (\d+)\)\(x \+ (\d+)\)\)\/\(x − \d+\)\. What is the y-value of the hole/))) {
    const e = Number(m[1]) + Number(m[2]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/At what x-value is there a HOLE/)) && (m = p.match(/\(\(x − (\d+)\)/))) {
    const e = `x = ${m[1]}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Simplify the complex fraction: {2}\(1\/(\d+)\) ÷ \(1\/(\d+)\)$/))) {
    const e = reduceStr(Number(m[2]), Number(m[1]));
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Simplify: {2}\((\d+)\/x\) ÷ \((\d+)\/x\)$/))) {
    const e = reduceStr(Number(m[1]), Number(m[2]));
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/AMPLITUDE of y = (\d+)sin\(x\)/))) {
    checked++; if (!eq(it.answer.value, Number(m[1]))) fail(it, Number(m[1])); continue;
  }
  if ((m = p.match(/MAXIMUM value of y = (\d+)sin\(x\) \+ (\d+)/))) {
    const e = Number(m[1]) + Number(m[2]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/MIDLINE of y = \d+sin\(x\) \+ (\d+)/))) {
    const e = `y = ${m[1]}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/coin is flipped (\d+) times\. How many possible outcome sequences/))) {
    const e = Math.pow(2, Number(m[1]));
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/mean (\d+) and standard deviation (\d+)\. What is the z-score of the value (-?\d+)/))) {
    const [mu, sd, x] = m.slice(1).map(Number);
    const e = (x - mu) / sd;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/y-intercept of y = \(x − (\d+)\)\(x \+ (\d+)\)/))) {
    const e = -Number(m[1]) * Number(m[2]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/MAXIMUM number of x-intercepts a polynomial of degree (\d+)/))) {
    checked++; if (!eq(it.answer.value, Number(m[1]))) fail(it, Number(m[1])); continue;
  }
  if ((m = p.match(/maximum number of TURNING POINTS on the graph of a degree-(\d+)/))) {
    const e = Number(m[1]) - 1;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/DOMAIN restriction of f\(x\) = 1\/\(x \+ (\d+)\)/))) {
    const e = `x ≠ ${-Number(m[1])}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/x-intercept of f\(x\) = \(x − (\d+)\)\/\(x \+ 2\)/))) {
    const e = `x = ${m[1]}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/y-intercept of f\(x\) = \(x \+ (\d+)\)\/\(x \+ (\d+)\)/))) {
    const e = reduceStr(Number(m[1]), Number(m[2]));
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/population of (\d+) multiplies by (\d+) each year.*after (\d+) years/))) {
    const [p0, rate, t] = m.slice(1).map(Number);
    const e = p0 * Math.pow(rate, t);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/tank starts with (\d+) litres and gains (\d+) litres per minute.*after (\d+) minutes/))) {
    const [s0, mm, t] = m.slice(1).map(Number);
    const e = s0 + mm * t;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/f\(x\) = (\d+)x² and g\(x\) = x \+ (\d+)\. What is f\(g\((\d+)\)\)/))) {
    const [a, b, x] = m.slice(1).map(Number);
    const e = a * Math.pow(x + b, 2);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/plan costs \$(\d+) plus \$(\d+) per unit.*for (\d+) units/))) {
    const [f0, per, n0] = m.slice(1).map(Number);
    const e = f0 + per * n0;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/bill of \$(\d+) gets a (\d+)% tip/))) {
    const [pr, pc] = m.slice(1).map(Number);
    const e = pr + (pr * pc) / 100;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/car travels (\d+) miles at (\d+) miles per hour/))) {
    const e = reduceStr(Number(m[1]), Number(m[2]));
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Evaluate (\d+)x² − (\d+) when x = (\d+)\.$/))) {
    const [a, b, x] = m.slice(1).map(Number);
    const e = a * x * x - b;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }

  unchecked[it.skillId] = (unchecked[it.skillId] || 0) + 1;
}

console.log(`Independently re-derived: ${checked}/${items.length}`);
console.log(`Mismatches: ${failed}`);
if (Object.keys(unchecked).length) {
  console.log('\nNot re-derivable (conceptual / classification / literal-form answers):');
  Object.entries(unchecked).sort((a, b) => b[1] - a[1])
    .forEach(([s, n]) => console.log(`  ${String(n).padStart(3)}  ${s}`));
}
if (failures.length) {
  console.log('\nFAILURES:');
  failures.slice(0, 20).forEach((f) => console.log('  ' + f));
  process.exit(1);
}
console.log('\n✓ every re-derivable answer matches');
