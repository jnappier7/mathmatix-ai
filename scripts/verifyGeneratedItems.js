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
  if (/At what x-value is there a HOLE/.test(p) && (m = p.match(/\(\(x − (\d+)\)/))) {
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

  // ── Precalculus ──────────────────────────────────────────────────────────
  if ((m = p.match(/^f\(x\) = x \+ (\d+)\. What is f⁻¹\(x\)\?$/))) {
    const e = `x − ${m[1]}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^f\(x\) = (\d+)x\. What is f⁻¹\(x\)\?$/))) {
    const e = `x/${m[1]}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^f\(x\) = (\d+)x \+ (\d+)\. What is f⁻¹\(x\)\?$/))) {
    const e = `(x − ${m[2]})/${m[1]}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/point \((\d+), (\d+)\) lies on the graph of f\. What point must lie on the graph of f⁻¹/))) {
    const e = `(${m[2]}, ${m[1]})`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/remainder when x² \+ (\d+)x \+ (\d+) is divided by \(x − (\d+)\)/))) {
    const [b, c, k] = m.slice(1).map(Number);
    const e = k * k + b * k + c;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/x² \+ (\d+)x \+ \d+ is divided synthetically by \(x − (\d+)\), the quotient is x \+ q/))) {
    const e = Number(m[1]) + Number(m[2]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/Synthetic division of x² − (\d+)x \+ (\d+) by \(x − (\d+)\) leaves remainder 0\. What is the OTHER root/))) {
    const [sum, prod, root] = m.slice(1).map(Number);
    const other = sum - root;
    checked++;
    if (other * root !== prod) { fail(it, `inconsistent polynomial: ${root}·${other} ≠ ${prod}`); continue; }
    if (!eq(it.answer.value, other)) fail(it, other); continue;
  }
  if (/find cos\(A − B\)/.test(p) && (m = p.match(/sin A = (\d+)\/5, cos A = (\d+)\/5, sin B = (\d+)\/13, cos B = (\d+)\/13/))) {
    const [sa, ca, sb, cb] = m.slice(1).map(Number);
    const e = reduceStr(ca * cb + sa * sb, 65);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if (/find sin\(A \+ B\)/.test(p) && (m = p.match(/sin A = (\d+)\/5, cos A = (\d+)\/5, sin B = (\d+)\/13, cos B = (\d+)\/13/))) {
    const [sa, ca, sb, cb] = m.slice(1).map(Number);
    const e = reduceStr(sa * cb + ca * sb, 65);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/sin θ = (\d+)\/(\d+) and cos θ = (\d+)\/\d+, find sin 2θ/))) {
    const [s0, h, c0] = m.slice(1).map(Number);
    const e = reduceStr(2 * s0 * c0, h * h);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/sin θ = (\d+)\/(\d+) and cos θ = (\d+)\/\d+, find cos 2θ/))) {
    const [s0, h, c0] = m.slice(1).map(Number);
    const e = reduceStr(c0 * c0 - s0 * s0, h * h);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/ellipse x²\/(\d+) \+ y²\/(\d+) = 1, what is the length of the MAJOR axis/))) {
    const A = Math.max(Number(m[1]), Number(m[2]));
    const e = 2 * Math.sqrt(A);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/ellipse x²\/(\d+) \+ y²\/(\d+) = 1, find c/))) {
    const A = Math.max(Number(m[1]), Number(m[2])), B = Math.min(Number(m[1]), Number(m[2]));
    const e = Math.sqrt(A - B);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/hyperbola x²\/(\d+) − y²\/(\d+) = 1, find c/))) {
    const e = Math.sqrt(Number(m[1]) + Number(m[2]));
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/slopes of the asymptotes of x²\/(\d+) − y²\/(\d+) = 1/))) {
    const e = `±${Math.sqrt(Number(m[2])) / Math.sqrt(Number(m[1]))}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/x = t \+ (\d+), y = (\d+)t\. What point corresponds to t = (\d+)/))) {
    const [a, b, t] = m.slice(1).map(Number);
    const e = `(${t + a}, ${b * t})`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/Eliminate the parameter: x = t \+ (\d+), y = (\d+)t/))) {
    const e = `y = ${m[2]}(x − ${m[1]})`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/Find r for the rectangular point \((\d+), (\d+)\)/))) {
    const e = Math.sqrt(Number(m[1]) ** 2 + Number(m[2]) ** 2);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/Convert the polar equation r = (\d+) to rectangular form/))) {
    const e = `x² + y² = ${Number(m[1]) ** 2}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/How many petals does the rose r = \d+cos\((\d+)θ\)/))) {
    const n0 = Number(m[1]);
    const e = n0 % 2 === 1 ? n0 : 2 * n0;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/modulus of the complex number (\d+) \+ (\d+)i/))) {
    const e = Math.sqrt(Number(m[1]) ** 2 + Number(m[2]) ** 2);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/modulus (\d+) and argument π in rectangular form/))) {
    const e = `−${m[1]}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/vector from P\((\d+), (\d+)\) to Q\((\d+), (\d+)\)/))) {
    const [x1, y1, x2, y2] = m.slice(1).map(Number);
    const e = `⟨${x2 - x1}, ${y2 - y1}⟩`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/magnitude of the vector ⟨(\d+), (\d+)⟩/))) {
    const e = Math.sqrt(Number(m[1]) ** 2 + Number(m[2]) ** 2);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Compute ⟨(\d+), (\d+)⟩ \+ ⟨(\d+), (\d+)⟩\.$/))) {
    const [a, b, c0, d] = m.slice(1).map(Number);
    const e = `⟨${a + c0}, ${b + d}⟩`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Compute (\d+)⟨(\d+), (\d+)⟩\.$/))) {
    const [k, a, b] = m.slice(1).map(Number);
    const e = `⟨${k * a}, ${k * b}⟩`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Compute ⟨(\d+), (\d+)⟩ − (\d+)⟨(\d+), (\d+)⟩\.$/))) {
    const [a, b, k, c0, d] = m.slice(1).map(Number);
    const e = `⟨${a - k * c0}, ${b - k * d}⟩`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/dot product ⟨(\d+), (\d+)⟩ · ⟨(\d+), (\d+)⟩/))) {
    const [a, b, c0, d] = m.slice(1).map(Number);
    const e = a * c0 + b * d;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/Find k so that ⟨(\d+), 2⟩ and ⟨2, k⟩ are orthogonal/))) {
    const e = -Number(m[1]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/walks (\d+) m east, then (\d+) m north/))) {
    const e = `⟨${m[1]}, ${m[2]}⟩`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/travels (\d+) m east and (\d+) m north\. How far/))) {
    const e = Math.sqrt(Number(m[1]) ** 2 + Number(m[2]) ** 2);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/(\d+) N east and (\d+) N west\. What is the magnitude/))) {
    const e = Math.abs(Number(m[1]) - Number(m[2]));
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }

  // ── Geometry ─────────────────────────────────────────────────────────────
  if ((m = p.match(/^(\d+) points are drawn so that NO three are collinear\. How many distinct lines/))) {
    const n0 = Number(m[1]);
    const e = (n0 * (n0 - 1)) / 2;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Can segments of length (\d+), (\d+), and (\d+) form a triangle\?$/))) {
    const sides = m.slice(1).map(Number).sort((x, y) => x - y);
    const e = sides[0] + sides[1] > sides[2] ? 'Yes' : 'No';
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Two sides of a triangle measure (\d+) and (\d+)\. What is the (SMALLEST|LARGEST) whole number/))) {
    const a = Number(m[1]), b = Number(m[2]);
    const e = m[3] === 'SMALLEST' ? Math.abs(a - b) + 1 : a + b - 1;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^In triangle ABC, BC = (\d+), CA = (\d+), and AB = (\d+)\. Which angle is the (LARGEST|SMALLEST)\?$/))) {
    // Side BC is opposite angle A, CA opposite B, AB opposite C.
    const sides = [['Angle A', Number(m[1])], ['Angle B', Number(m[2])], ['Angle C', Number(m[3])]];
    sides.sort((x, y) => x[1] - y[1]);
    const e = m[4] === 'LARGEST' ? sides[2][0] : sides[0][0];
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/sum of the interior angles of an? [\w-]+ \((\d+) sides\)/))) {
    const e = (Number(m[1]) - 2) * 180;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Each interior angle of a REGULAR (\d+)-gon/))) {
    const n0 = Number(m[1]);
    const e = ((n0 - 2) * 180) / n0;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Each EXTERIOR angle of a regular (\d+)-gon/))) {
    const e = 360 / Number(m[1]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^The interior angles of a polygon add up to (\d+)°\. How many sides/))) {
    const e = Number(m[1]) / 180 + 2;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Each exterior angle of a regular polygon measures (\d+)°\. How many sides/))) {
    const e = 360 / Number(m[1]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^In parallelogram ABCD, angle A measures (\d+)°\. What is the measure of the (OPPOSITE|CONSECUTIVE) angle/))) {
    const e = m[2] === 'OPPOSITE' ? Number(m[1]) : 180 - Number(m[1]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/diagonals of parallelogram ABCD intersect at P\. If AC = (\d+), what is AP\?$/))) {
    const e = Number(m[1]) / 2;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A trapezoid has parallel bases of length (\d+) and (\d+)\. How long is its MIDSEGMENT\?$/))) {
    const e = (Number(m[1]) + Number(m[2])) / 2;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A trapezoid's midsegment measures (\d+), and one base measures (\d+)\. How long is the other base\?$/))) {
    const e = 2 * Number(m[1]) - Number(m[2]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^In an ISOSCELES trapezoid, one base angle measures (\d+)°\. What is the measure of the other angle on the SAME base\?$/))) {
    checked++; if (!eq(it.answer.value, Number(m[1]))) fail(it, Number(m[1])); continue;
  }
  if ((m = p.match(/Angle A \(at base AB\) measures (\d+)°\. What is the measure of angle D/))) {
    const e = 180 - Number(m[1]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Find the geometric mean of (\d+) and (\d+)\.$/))) {
    const e = Math.sqrt(Number(m[1]) * Number(m[2]));
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/altitude to the hypotenuse splits the hypotenuse into segments of length (\d+) and (\d+)\. How long is the altitude\?$/))) {
    const e = Math.sqrt(Number(m[1]) * Number(m[2]));
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/segments of length (\d+) and (\d+), with the segment of length (\d+) adjacent to leg L\. How long is leg L\?$/))) {
    const pSeg = Number(m[3]), whole = Number(m[1]) + Number(m[2]);
    if (pSeg !== Number(m[1])) { fail(it, `adjacent segment ${pSeg} should be the first-listed segment ${m[1]}`); continue; }
    const e = Math.sqrt(pSeg * whole);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }

  // ── ACT strategies ───────────────────────────────────────────────────────
  if ((m = p.match(/^Backsolve from the answer choices: if (\d+)x \+ (\d+) = (\d+), which value of x works\?$/))) {
    const [a, b, rhs] = m.slice(1).map(Number);
    if ((rhs - b) % a !== 0) { fail(it, `non-integer solution (${rhs} − ${b})/${a}`); continue; }
    const e = (rhs - b) / a;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Backsolve: which value of n satisfies n\(n − 1\) = (\d+)\?$/))) {
    const v = Number(m[1]);
    const e = Math.round((1 + Math.sqrt(1 + 4 * v)) / 2);
    if (e * (e - 1) !== v) { fail(it, `no integer solves n(n−1) = ${v}`); continue; }
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/test the middle one, x = (\d+)\. The result comes out too (SMALL|LARGE)\./))) {
    const e = m[2] === 'SMALL' ? `${m[1]} and every choice smaller` : `${m[1]} and every choice larger`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^(\d+)% of (\d+)% of a number x is what percent of x\?$/))) {
    const e = `${(Number(m[1]) * Number(m[2])) / 100}%`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Without a calculator: √(\d+) is between which two consecutive integers\?$/))) {
    const k = Math.floor(Math.sqrt(Number(m[1])));
    if (k * k === Number(m[1])) { fail(it, `${m[1]} is a perfect square — nothing to bracket`); continue; }
    const e = `${k} and ${k + 1}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Estimate without computing exactly: ([\d.]+)% of (\d+) is closest to which value\?$/))) {
    const exact = (Number(m[1]) / 100) * Number(m[2]);
    const stated = Number(it.answer.value);
    // The estimate must be the closest option to the true value.
    const opts = (it.options || []).map((o) => Number(o.text));
    const best = opts.reduce((x, y) => (Math.abs(y - exact) < Math.abs(x - exact) ? y : x));
    checked++; if (stated !== best) fail(it, `closest option to ${exact.toFixed(1)} is ${best}`); continue;
  }
  if ((m = p.match(/Which is the best estimate of 13\/25 of (\d+)\?$/))) {
    const exact = (13 * Number(m[1])) / 25;
    const opts = (it.options || []).map((o) => Number(o.text));
    const best = opts.reduce((x, y) => (Math.abs(y - exact) < Math.abs(x - exact) ? y : x));
    checked++; if (Number(it.answer.value) !== best) fail(it, `closest option to ${exact} is ${best}`); continue;
  }
  if ((m = p.match(/you spend (\d+) seconds on each of the first (\d+) questions\. How many minutes remain/))) {
    const e = 60 - (Number(m[1]) * Number(m[2])) / 60;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/you have finished (\d+) questions after (\d+) minutes\. Are you ahead of pace or behind/))) {
    const q = Number(m[1]), t = Number(m[2]);
    const e = q > t ? `Ahead by ${q - t} minutes` : `Behind by ${t - q} minutes`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }

  // ── Calculus (AB top-ups + new families) ─────────────────────────────────
  if ((m = p.match(/^Evaluate: the limit as x → ∞ of \((\d+)x² \+ \d+x\)\/\((\d+)x² \+ \d+\)\.$/))) {
    const e = reduceStr(Number(m[1]), Number(m[2]));
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if (/^Evaluate: the limit as x → ∞ of \(\d+x \+ \d+\)\/\(\d+x² \+ \d+x\)\.$/.test(p)) {
    checked++; if (!eq(it.answer.value, 0)) fail(it, 0); continue;
  }
  if ((m = p.match(/^What is the horizontal asymptote of y = \((\d+)x² − \d+\)\/\((\d+)x² \+ \d+x\)\?$/))) {
    const e = `y = ${reduceStr(Number(m[1]), Number(m[2]))}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^f is continuous on \[\d+, \d+\] with f\(\d+\) = (-?\d+) and f\(\d+\) = (-?\d+)\./))) {
    const e = Number(m[1]) < 0 !== Number(m[2]) < 0 ? 'Yes' : 'No';
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^For x near 0, g satisfies (\d+) − x² ≤ g\(x\) ≤ \d+ \+ x²\./))) {
    checked++; if (!eq(it.answer.value, Number(m[1]))) fail(it, Number(m[1])); continue;
  }
  if (/^Evaluate the limit as x → 0 of x² · sin\(\d+\/x\)\.$/.test(p)) {
    checked++; if (!eq(it.answer.value, 0)) fail(it, 0); continue;
  }
  if ((m = p.match(/difference quotient for f\(x\) = x² at x = (\d+) simplifies/))) {
    const e = 2 * Number(m[1]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Simplify the difference quotient \[f\(x \+ h\) − f\(x\)\]\/h for f\(x\) = (\d+)x \+ \d+\.$/))) {
    checked++; if (!eq(it.answer.value, Number(m[1]))) fail(it, Number(m[1])); continue;
  }
  if ((m = p.match(/^The limit as h → 0 of \[\((\d+) \+ h\)² − (\d+)\]\/h/))) {
    if (Number(m[1]) ** 2 !== Number(m[2])) { fail(it, `inconsistent: ${m[1]}² ≠ ${m[2]}`); continue; }
    const e = `x² at x = ${m[1]}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Differentiate: y = \((\d+)x \+ (\d+)\)([³⁴⁵])\.$/))) {
    const a = Number(m[1]), b = Number(m[2]);
    const n0 = { '³': 3, '⁴': 4, '⁵': 5 }[m[3]];
    const down = { 3: '²', 4: '³', 5: '⁴' }[n0];
    const e = `${n0 * a}(${a}x + ${b})${down}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Differentiate: y = sin\((\d+)x\)\.$/))) {
    const e = `${m[1]}cos(${m[1]}x)`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^g\(x\) = f\((\d+)x\) where f′\((\d+)\) = (\d+)\. Using the chain rule, what is g′\((\d+)\)\?$/))) {
    const [a, arg, f1, x0] = m.slice(1).map(Number);
    if (a * x0 !== arg) { fail(it, `f′ evaluated at ${arg} but inner value is ${a * x0}`); continue; }
    const e = f1 * a;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Each side of a square is growing at (\d+) cm\/s\. How fast is the AREA growing when the side is (\d+) cm/))) {
    const e = 2 * Number(m[2]) * Number(m[1]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A (\d+) m ladder leans against a wall\. Its base, (\d+) m from the wall, slides away at (\d+) m\/s/))) {
    const c0 = Number(m[1]), x = Number(m[2]), rate = Number(m[3]);
    const y = Math.sqrt(c0 * c0 - x * x);
    if (!Number.isInteger(y)) { fail(it, `non-integer wall height √(${c0}² − ${x}²)`); continue; }
    const e = reduceStr(x * rate, y);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A cube's volume grows at (\d+) cm³\/s\. How fast is its side length growing when the side is (\d+) cm/))) {
    const e = reduceStr(Number(m[1]), 3 * Number(m[2]) ** 2);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A particle's position is s\(t\) = (\d*)t² \+ (\d+)t \(meters, seconds\)\. What is its velocity at t = (\d+)\?$/))) {
    const a = m[1] === '' ? 1 : Number(m[1]);
    const e = 2 * a * Number(m[3]) + Number(m[2]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A particle moves with velocity v\(t\) = (\d+)t² − (\d+)\. At what positive time t is the particle AT REST\?$/))) {
    const t0 = Math.sqrt(Number(m[2]) / Number(m[1]));
    if (!Number.isInteger(t0)) { fail(it, `non-integer rest time √(${m[2]}/${m[1]})`); continue; }
    checked++; if (!eq(it.answer.value, t0)) fail(it, t0); continue;
  }
  if ((m = p.match(/^A particle's velocity is v\(t\) = (\d*)t² \(m\/s\)\. What is its ACCELERATION at t = (\d+)\?$/))) {
    const a = m[1] === '' ? 1 : Number(m[1]);
    const e = 2 * a * Number(m[2]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Use the linearization of f\(x\) = √x at x = (\d+) to estimate √(\d+)\./))) {
    const k = Number(m[1]), root = Math.sqrt(k), dx = Number(m[2]) - k;
    if (!Number.isInteger(root)) { fail(it, `${k} is not a perfect square`); continue; }
    const e = `${root} + ${reduceStr(dx, 2 * root)}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Find the equation of the tangent line to y = (\d*)x² \+ (\d+) at x = (\d+)\.$/))) {
    const a = m[1] === '' ? 1 : Number(m[1]);
    const b = Number(m[2]), x0 = Number(m[3]);
    const slope = 2 * a * x0, icept = a * x0 * x0 + b - slope * x0;
    const e = `y = ${slope}x ${icept >= 0 ? '+' : '−'} ${Math.abs(icept)}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^f\(x\) = x² on \[0, (\d+)\]\. The Mean Value Theorem/))) {
    const e = reduceStr(Number(m[1]), 2);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^f\(x\) = (\d*)x³ − (\d+)x² \+ \d+x\. At what x-value does f have an inflection point\?$/))) {
    const a = m[1] === '' ? 1 : Number(m[1]);
    const e = Number(m[2]) / (3 * a);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^f″\(x\) = (−?)(\d+) for all x/))) {
    const e = m[1] === '−' ? 'Concave down everywhere' : 'Concave up everywhere';
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Two positive numbers add to (\d+)\. What is the LARGEST their product can be\?$/))) {
    const e = (Number(m[1]) / 2) ** 2;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A rectangle has perimeter (\d+)\. What dimensions maximize its area/))) {
    const side = Number(m[1]) / 4;
    const e = `${side} by ${side}, area ${side * side}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Evaluate the indefinite integral: ∫ (\d+)\((\d+)x \+ (\d+)\)([²³]) dx/))) {
    const outer = Number(m[1]), a = Number(m[2]), b = Number(m[3]);
    const n0 = m[4] === '²' ? 2 : 3;
    if (outer !== a) { fail(it, `outer factor ${outer} must equal du's factor ${a}`); continue; }
    const e = `(${a}x + ${b})${n0 === 2 ? '³' : '⁴'}/${n0 + 1} + C`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Evaluate: ∫ 2x·cos\(x² \+ (\d+)\) dx\.$/))) {
    const e = `sin(x² + ${m[1]}) + C`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A slope field is drawn for dy\/dx = x \+ y\. What slope does the segment at the point \((\d+), (\d+)\) have\?$/))) {
    const e = Number(m[1]) + Number(m[2]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Solve the initial value problem: dy\/dx = (\d+)y, y\(0\) = (\d+)\.$/))) {
    const e = `y = ${m[2]}e^(${m[1]}x)`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Solve: dy\/dx = (\d+)x\/y with y\(0\) = (\d+)/))) {
    const e = `y = √(${m[1]}x² + ${Number(m[2]) ** 2})`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Find the average value of f\(x\) = (\d+)x \+ (\d+) on \[0, (\d+)\]\.$/))) {
    const e = (Number(m[1]) * Number(m[3])) / 2 + Number(m[2]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Find the average value of f\(x\) = x² on \[0, (\d+)\]\.$/))) {
    const e = Number(m[1]) ** 2 / 3;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A particle's velocity is v\(t\) = (\d+)t \(m\/s\)\. What is its DISPLACEMENT from t = 0 to t = (\d+)\?$/))) {
    const e = (Number(m[1]) / 2) * Number(m[2]) ** 2;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^v\(t\) = (\d*)\(t − (\d+)\) on \[0, (\d+)\]\./))) {
    const k = m[1] === '' ? 1 : Number(m[1]);
    const t0 = Number(m[2]), T = Number(m[3]);
    if (T !== 2 * t0) { fail(it, `interval [0, ${T}] is not symmetric about ${t0}`); continue; }
    const e = k * t0 * t0;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^What is the reference angle of (\d+)°\?$/))) {
    const th = Number(m[1]);
    const e = th <= 90 ? th : th <= 180 ? 180 - th : th <= 270 ? th - 180 : 360 - th;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^In which quadrant does an angle of (\d+)° \(standard position\) terminate\?$/))) {
    const th = Number(m[1]);
    const e = th < 90 ? 'I' : th < 180 ? 'II' : th < 270 ? 'III' : 'IV';
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Is (sin|cos|tan) θ positive or negative for an angle θ in Quadrant (II|III|IV)\?$/))) {
    const pos = { II: ['sin'], III: ['tan'], IV: ['cos'] };
    const e = pos[m[2]].includes(m[1]) ? 'Positive' : 'Negative';
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A table gives f\((\d+)\) = (\d+) and f\((\d+)\) = (\d+)\. Use the values to estimate f′\(\d+\) with a difference quotient\.$/))) {
    const e = (Number(m[4]) - Number(m[2])) / (Number(m[3]) - Number(m[1]));
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A table gives f\((\d+)\) = (\d+), and f\((\d+)\) = (\d+)\. Estimate f′\((\d+)\) using the symmetric/))) {
    const x1 = Number(m[1]), x2 = Number(m[3]), mid = Number(m[5]);
    if (x2 - mid !== mid - x1) { fail(it, `${mid} is not centered between ${x1} and ${x2}`); continue; }
    const e = (Number(m[4]) - Number(m[2])) / (x2 - x1);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Evaluate the derivative of arctan\(x\) at x = (\d+)\.$/))) {
    const e = `1/${1 + Number(m[1]) ** 2}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Differentiate y = arctan\((\d+)x\)\.$/))) {
    const k = Number(m[1]);
    const e = `${k}/(1 + ${k * k}x²)`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^f\(x\) = (\d*)x³ \+ (\d*)x² \+ \d+x\. Find f″\(x\)\.$/))) {
    const a = m[1] === '' ? 1 : Number(m[1]);
    const b = m[2] === '' ? 1 : Number(m[2]);
    const e = `${6 * a}x + ${2 * b}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^f\(x\) = (\d*)x⁴\. Evaluate f‴\((\d+)\)/))) {
    const a = m[1] === '' ? 1 : Number(m[1]);
    const e = 24 * a * Number(m[2]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^What is the (third|fourth|fifth) derivative of f\(x\) = x([³⁴⁵])\?$/))) {
    const n0 = { '³': 3, '⁴': 4, '⁵': 5 }[m[2]];
    const ord = { third: 3, fourth: 4, fifth: 5 }[m[1]];
    if (n0 !== ord) { fail(it, `order ${ord} ≠ degree ${n0}`); continue; }
    const e = [1, 1, 2, 6, 24, 120][n0];
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Find the general antiderivative: ∫ (\d+)x([²³⁴]) dx\.$/))) {
    const a = Number(m[1]);
    const n0 = { '²': 2, '³': 3, '⁴': 4 }[m[2]];
    if (a % (n0 + 1) !== 0) { fail(it, `${a} not divisible by ${n0 + 1}`); continue; }
    const cNew = a / (n0 + 1);
    const e = `${cNew === 1 ? '' : cNew}x${{ 2: '³', 3: '⁴', 4: '⁵' }[n0]} + C`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^∫ \((\d+)x \+ (\d+)\) dx = \?$/))) {
    const a = Number(m[1]);
    if (a % 2 !== 0) { fail(it, `${a} odd — half-coefficient not whole`); continue; }
    const e = `${a / 2}x² + ${m[2]}x + C`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^f′\(x\) = (\d+)x and f\(0\) = (\d+)\. Find f\(x\)\.$/))) {
    const a = Number(m[1]);
    if (a % 2 !== 0) { fail(it, `${a} odd`); continue; }
    const e = `f(x) = ${a / 2}x² + ${m[2]}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A student evaluates the limit of \(x² − (\d+)\)\/\(x − (\d+)\) as x → (\d+)/))) {
    const sq = Number(m[1]), a = Number(m[2]);
    if (a * a !== sq || Number(m[3]) !== a) { fail(it, `inconsistent limit setup`); continue; }
    const e = `Factor and cancel; the limit is ${2 * a}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }

  // ── Calculus BC (series, parametric, polar, DE methods) ──────────────────
  if ((m = p.match(/^Decompose into partial fractions: (\d+)\/\(x\(x \+ (\d+)\)\)\.$/))) {
    if (m[1] !== m[2]) { fail(it, `numerator ${m[1]} must equal the root gap ${m[2]}`); continue; }
    const e = `1/x − 1/(x + ${m[2]})`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^In the decomposition \(x( [−+] \d+)?\)\/\(\(x − (\d+)\)\(x − (\d+)\)\) = A\/\(x − \d+\) \+ B\/\(x − \d+\), find (A|B)\.$/))) {
    const c0 = m[1] ? Number(m[1].replace(' − ', '-').replace(' + ', '')) : 0;
    const p1 = Number(m[2]), q1 = Number(m[3]);
    const e = m[4] === 'A' ? (p1 + c0) / (p1 - q1) : (q1 + c0) / (q1 - p1);
    if (!Number.isInteger(e)) { fail(it, `non-integer residue ${e}`); continue; }
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Does ∫₁\^∞ 1\/x([²³⁴⁵]?) dx converge or diverge\?$/))) {
    const p1 = m[1] === '' ? 1 : { '²': 2, '³': 3, '⁴': 4, '⁵': 5 }[m[1]];
    const e = p1 > 1 ? 'Converges' : 'Diverges';
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Evaluate: ∫₁\^∞ 1\/x([²³⁵]) dx\.$/))) {
    const p1 = { '²': 2, '³': 3, '⁵': 5 }[m[1]];
    const e = reduceStr(1, p1 - 1);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if (/^Evaluate: ∫₀¹ 1\/√x dx/.test(p)) {
    checked++; if (!eq(it.answer.value, 2)) fail(it, 2); continue;
  }
  if ((m = p.match(/^dy\/dx = x \+ y with y\(0\) = (\d+)\. Using Euler's method with step size h = 1, estimate y\(1\)\.$/))) {
    const e = 2 * Number(m[1]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^dy\/dx = x \+ y with y\(0\) = (\d+)\. Using Euler's method with TWO steps of h = 1, estimate y\(2\)\.$/))) {
    const y0 = Number(m[1]);
    const y1 = y0 + (0 + y0);
    const e = y1 + (1 + y1);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A population follows dP\/dt = kP\(1 − P\/(\d+)\) with 0 < P\(0\) < \d+\. What is the limit/))) {
    checked++; if (!eq(it.answer.value, Number(m[1]))) fail(it, Number(m[1])); continue;
  }
  if ((m = p.match(/^A population follows the logistic equation dP\/dt = kP\(1 − P\/(\d+)\)\. At what population is it growing FASTEST\?$/))) {
    const e = Number(m[1]) / 2;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^dP\/dt = (\d+)P\(1 − P\/(\d+)\)\. Compute dP\/dt when P = (\d+)\.$/))) {
    const [k, L, P] = m.slice(1).map(Number);
    const e = k * P * (1 - P / L);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^x = (\d+)t, y = (\d*)t²\. Find dy\/dx at t = (\d+)\.$/))) {
    const a = Number(m[1]), b = m[2] === '' ? 1 : Number(m[2]), t0 = Number(m[3]);
    const e = reduceStr(2 * b * t0, a);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^x = t², y = t³\. Find the slope of the tangent line at t = (\d+)\.$/))) {
    const e = reduceStr(3 * Number(m[1]), 2);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^x = (\d+)t, y = (\d+)t for 0 ≤ t ≤ (\d+)\. Find the length of the curve\.$/))) {
    const c0 = Math.sqrt(Number(m[1]) ** 2 + Number(m[2]) ** 2);
    if (!Number.isInteger(c0)) { fail(it, 'non-integer speed'); continue; }
    const e = c0 * Number(m[3]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A particle moves along x = (\d+)t, y = (\d+)t \+ \d+\. What is its SPEED/))) {
    const e = Math.sqrt(Number(m[1]) ** 2 + Number(m[2]) ** 2);
    if (!Number.isInteger(e)) { fail(it, 'non-integer speed'); continue; }
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/find the area enclosed by the circle r = (\d+)\.$/))) {
    const e = `${Number(m[1]) ** 2}π`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Find the area enclosed by the cardioid r = (\d+)\(1 \+ cos θ\)\.$/))) {
    const a = Number(m[1]);
    const e = `${(3 * a * a) / 2}π`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^r\(t\) = ⟨(\d+)t, (\d*)t²⟩\. Find the velocity vector r′\((\d+)\)\.$/))) {
    const a = Number(m[1]), b = m[2] === '' ? 1 : Number(m[2]), t0 = Number(m[3]);
    const e = `⟨${a}, ${2 * b * t0}⟩`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^r\(t\) = ⟨(\d+)t, (\d+)t⟩ \+ ⟨\d+, \d+⟩ \(a constant shift\)\. What is the particle's SPEED/))) {
    const e = Math.sqrt(Number(m[1]) ** 2 + Number(m[2]) ** 2);
    if (!Number.isInteger(e)) { fail(it, 'non-integer speed'); continue; }
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A particle has velocity r′\(t\) = ⟨(\d+)t, (\d+)⟩\. Find its acceleration vector\.$/))) {
    const e = `⟨${m[1]}, 0⟩`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Find the limit of the sequence aₙ = \((\d+)n \+ \d+\)\/\((\d+)n \+ \d+\)\.$/))) {
    const e = reduceStr(Number(m[1]), Number(m[2]));
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if (/^Find the limit of the sequence aₙ = \d+\/n[²³]?\.$/.test(p)) {
    checked++; if (!eq(it.answer.value, 0)) fail(it, 0); continue;
  }
  if (/^Does the p-series Σ 1\/n[²³⁴] converge or diverge\?$/.test(p)) {
    checked++; if (!eq(it.answer.value, 'Converges')) fail(it, 'Converges'); continue;
  }
  if (/^Does the harmonic series Σ 1\/n converge or diverge\?$/.test(p)) {
    checked++; if (!eq(it.answer.value, 'Diverges')) fail(it, 'Diverges'); continue;
  }
  if ((m = p.match(/^Evaluate the geometric series: Σₙ₌₀\^∞ (?:(\d+)·)?\(1\/(\d+)\)ⁿ\.$/))) {
    const a0 = m[1] ? Number(m[1]) : 1, denom = Number(m[2]);
    const e = (a0 * denom) / (denom - 1);
    if (!Number.isInteger(e)) { fail(it, `non-integer sum ${e}`); continue; }
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/approximated by its first (\d+) terms\. What is the alternating series error bound\?$/))) {
    const e = `1/${Number(m[1]) + 1}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^How many terms of Σ \(−1\)ⁿ⁺¹\/n guarantee .* an error less than 1\/(\d+)\?$/))) {
    checked++; if (!eq(it.answer.value, Number(m[1]))) fail(it, Number(m[1])); continue;
  }
  if ((m = p.match(/approximated by its terms through n = (\d+)\. What is the alternating series error bound\?$/))) {
    const n0 = Number(m[1]);
    const e = `1/${[1, 1, 2, 6, 24, 120][n0 + 1]}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^f\(0\) = \d+, f′\(0\) = \d+, f″\(0\) = (\d+)\. What is the coefficient of x²/))) {
    const e = Number(m[1]) / 2;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^A Maclaurin polynomial has x³ coefficient equal to (\d+)\. What is f‴\(0\)\?$/))) {
    const e = 6 * Number(m[1]);
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^Using the series for eˣ, what is the coefficient of x² in the Maclaurin series of e\^\((\d+)x\)\?$/))) {
    const e = Number(m[1]) ** 2 / 2;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^What is the radius of convergence of Σₙ₌₀\^∞ xⁿ\/(\d+)ⁿ\?$/))) {
    checked++; if (!eq(it.answer.value, Number(m[1]))) fail(it, Number(m[1])); continue;
  }
  if ((m = p.match(/^The series Σₙ₌₀\^∞ \(x − (\d+)\)ⁿ\/(\d+)ⁿ converges on which interval\?$/))) {
    const a = Number(m[1]), k = Number(m[2]);
    const e = `(${a - k}, ${a + k})`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^sin\(1\) is approximated by its degree-(\d+) Maclaurin polynomial\./))) {
    const n0 = Number(m[1]);
    const e = `1/${[1, 1, 2, 6, 24, 120][n0 + 1]}`;
    checked++; if (!eq(it.answer.value, e)) fail(it, e); continue;
  }
  if ((m = p.match(/^\|f⁽(\d+)⁾\(x\)\| ≤ (\d+) on the interval, and f is approximated at x with \|x − a\| = 1 by its degree-(\d+) Taylor polynomial/))) {
    const ord = Number(m[1]), M = Number(m[2]), n0 = Number(m[3]);
    if (ord !== n0 + 1) { fail(it, `bound uses f⁽${ord}⁾ but degree is ${n0} — mismatch`); continue; }
    const e = reduceStr(M, [1, 1, 2, 6, 24, 120][n0 + 1]);
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
