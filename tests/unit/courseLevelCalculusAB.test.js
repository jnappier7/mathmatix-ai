/**
 * Course-level check items, AP Calculus AB — every answer RE-SOLVED from the
 * printed question.
 *
 * Nothing here calls the templates' own maths. Each re-solver reads the
 * numbers, the table, the formula or the description out of the prompt a
 * student would see and works the answer a second way: integrals by numerical
 * quadrature of the printed integrand, sign questions by evaluating the
 * printed derivative on either side of its zeros, Riemann sums straight from
 * the printed table, over/under-estimates by trying the rule on a real
 * function, and the interpretation questions by rules typed by hand below.
 * A multiple-choice key is found by testing every option against that result:
 * exactly one may pass.
 */

const { expand, validate } = require('../../scripts/buildCourseLevelItems');
const bank = require('../../scripts/lib/courseLevelCalculusAB');

const ITEMS = {};
for (const t of bank.TEMPLATES) ITEMS[t.skillId] = expand(t, bank.GB);
const ALL = Object.values(ITEMS).flat();

// ── a reader's toolkit ─────────────────────────────────────────────────────

const N = '(−?\\d+(?:\\.\\d+)?)';
const num = (s) => Number(String(s).replace(/−/g, '-'));
const rx = (src) => new RegExp(src.replace(/#/g, N));
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const sign = (x) => (Math.abs(x) < 1e-9 ? 0 : (x > 0 ? 1 : -1));
const show = (n) => String(n).replace(/-/g, '−');

/** The one option that passes a test; anything else is a broken item. */
function only(options, pred) {
  const hits = options.filter((o) => { try { return pred(o); } catch { return false; } });
  if (hits.length !== 1) throw new Error(`expected exactly one option to pass, got ${hits.length}: ${JSON.stringify(options)}`);
  return hits[0];
}

/** Printed maths → a number: handles ln, e^, π, a variable, implied products. */
function evalExpr(text, vars = {}) {
  let s = String(text).replace(/−/g, '-')
    .replace(/²/g, '**2').replace(/³/g, '**3')
    .replace(/√x/g, 'Math.sqrt(x)')
    .replace(/(sin|cos) x/g, 'Math.$1(x)')
    .replace(/ln (\d+(?:\.\d+)?)/g, 'Math.log($1)')
    .replace(/e\^\(([^)]*)\)/g, 'Math.exp($1)')
    .replace(/e\^(\d+|x)/g, 'Math.exp($1)')
    .replace(/π/g, 'Math.PI');
  s = s.replace(/(\d|\))\s*(?=Math|\(|[a-z])/g, '$1*').replace(/([a-z])(?=\()/g, (mm, ch, i, all) => (/[a-zA-Z.]/.test(all[i - 1] || '') ? ch : `${ch}*`));
  s = s.replace(/^-/, '-1*').replace(/\(-\(/g, '(-1*(');
  const names = Object.keys(vars);
  const v = Function(...names, `"use strict"; return (${s});`)(...names.map((k) => vars[k]));
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`cannot evaluate ${text}`);
  return v;
}
const fnOf = (text, v = 'x') => (x) => evalExpr(text, { [v]: x });

/** Simpson's rule. */
function integrate(f, a, b, n = 4000) {
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return s * h / 3;
}
const deriv = (f, x, h = 1e-5) => (f(x + h) - f(x - h)) / (2 * h);

/** "x: 1, 2, 3 and f(x): 4, 5, 6" → [[1,2,3],[4,5,6]]. */
function table(prompt) {
  const mm = prompt.match(/(?:x|t): ([−\d., ]+?) and \w\((?:x|t)\): ([−\d., ]+?)\. /);
  if (!mm) throw new Error(`no table in: ${prompt}`);
  return [mm[1], mm[2]].map((row) => row.split(', ').map(num));
}

/** Integer zeros of a printed factored expression, and its sign on each side. */
function zeros(f) {
  const out = [];
  for (let x = -12; x <= 12; x++) if (Math.abs(f(x)) < 1e-9) out.push({ x, before: sign(f(x - 0.01)), after: sign(f(x + 0.01)) });
  return out;
}
const minima = (f) => zeros(f).filter((z) => z.before < 0 && z.after > 0).map((z) => z.x);
const maxima = (f) => zeros(f).filter((z) => z.before > 0 && z.after < 0).map((z) => z.x);
const one = (arr) => { if (arr.length !== 1) throw new Error(`expected one, got ${arr}`); return arr[0]; };

/** Is x inside "(−∞, 2) and (5, ∞)"? */
function inside(option, x) {
  const parts = option.split(' and ').map((p) => p.match(/^\((−∞|−?\d+(?:\.\d+)?), (∞|−?\d+(?:\.\d+)?)\)$/));
  if (parts.some((p) => !p)) throw new Error(`not intervals: ${option}`);
  return parts.some((p) => (p[1] === '−∞' || x > num(p[1])) && (p[2] === '∞' || x < num(p[2])));
}
const GRID = Array.from({ length: 97 }, (_, i) => -12.125 + i * 0.25);
/** The option whose intervals are exactly where `test` holds. */
const whereExactly = (options, test) => only(options, (o) => GRID.every((x) => inside(o, x) === test(x)));

// ── the re-solvers ─────────────────────────────────────────────────────────

const RESOLVE = {
  'calc-limits-graphical-numerical': (item, p, options) => {
    let mm;
    if (/lists x:/.test(p)) {
      const [xs, ys] = table(p);
      const a = num(p.match(rx('as x approaches #'))[1]);
      const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x]) => x !== a);
      const nearest = (side) => pairs.filter(([x]) => side * (x - a) > 0).sort((u, v) => Math.abs(u[0] - a) - Math.abs(v[0] - a))[0][1];
      const L = nearest(-1), R = nearest(1);
      if (/from the right\?$/.test(p)) return Math.round(R);
      if (Math.abs(L) > 1000 && Math.abs(R) > 1000) return only(options, (o) => /^No finite limit exists/.test(o));
      if (Math.round(L) !== Math.round(R)) return only(options, (o) => o.includes(`does not exist, because f(x) approaches ${show(Math.round(L))} from the left and ${show(Math.round(R))} from the right`));
      return Math.round(L);
    }
    if ((mm = p.match(rx('open circle \\(a hole\\) at the point \\(#, #\\), and a single filled dot at \\(#, #\\)\\. What is (the limit|f\\()')))) {
      return mm[5] === 'the limit' ? num(mm[2]) : num(mm[4]);
    }
    if ((mm = p.match(rx('from the left, the heights approach #, .*from the right, the heights approach #, .*as x approaches # from the left\\?$')))) return num(mm[1]);
    if ((mm = p.match(rx('open circle at \\(#, #\\); from the right it approaches a filled dot at \\(#, #\\)')))) {
      if (mm[2] === mm[4]) throw new Error('no jump');
      return only(options, (o) => o.includes(`does not exist, because f(x) approaches ${mm[2]} from the left and ${mm[4]} from the right`));
    }
    if ((mm = p.match(rx('from the left is #, the limit from the right is #, and f\\(#\\) = #\\.')))) {
      if (mm[1] !== mm[2] || mm[1] === mm[4]) throw new Error('unexpected case');
      return only(options, (o) => o.includes(`is ${mm[1]}, and f is not continuous`));
    }
    if ((mm = p.match(/from the left, the graph (rises|falls) without bound; as x approaches \S+ from the right, the graph (rises|falls)/))) {
      if (mm[1] !== mm[2]) return only(options, (o) => /does not exist$/.test(o));
      return only(options, (o) => o.endsWith(mm[1] === 'rises' ? ' is ∞' : ' is −∞'));
    }
    if ((mm = p.match(rx('graph of f has a hole at \\(#, #\\).*graph of g has a hole at \\(#, #\\).*limit of f\\(x\\) \\+ #g\\(x\\)')))) {
      return num(mm[2]) + num(mm[5]) * num(mm[4]);
    }
    throw new Error(`no rule: ${p}`);
  },

  'calc-derivative-as-rate-of-change': (item, p, options) => {
    let mm;
    if ((mm = p.match(rx('\\w\\(#\\) = # and \\w\\(#\\) = #\\. What is the average rate')))) return (num(mm[4]) - num(mm[2])) / (num(mm[3]) - num(mm[1]));
    if ((mm = p.match(rx('cost of producing.*interpretation of C′\\(#\\) = #\\?')))) {
      return only(options, (o) => o === `After ${mm[1]} units, producing one more unit raises the total cost by about $${mm[2]}`);
    }
    if ((mm = p.match(rx('interpretation of \\w′\\(#\\) = #\\?')))) {
      const v = num(mm[2]);
      return only(options, (o) => new RegExp(`^At t = ${mm[1]} \\w+, .* is ${v > 0 ? 'increasing' : 'decreasing'} at a rate of ${Math.abs(v)} .* per \\w+$`).test(o));
    }
    if ((mm = p.match(/is \w\(t\) (.+?), where t is the time in (\w+)s\. What are the units/))) return only(options, (o) => o === `${mm[1]} per ${mm[2]}`);
    if ((mm = p.match(/f\(x\) = (x² [+−] \d+x)\. What is the average rate of change of f on the interval \[(\d+), (\d+)\]/))) {
      const f = fnOf(mm[1]);
      return (f(num(mm[3])) - f(num(mm[2]))) / (num(mm[3]) - num(mm[2]));
    }
    if ((mm = p.match(/s\(t\) = (.+?) metres after t seconds.*at t = (\d+),/))) return Math.round(deriv(fnOf(mm[1], 't'), num(mm[2])) * 1e6) / 1e6;
    if ((mm = p.match(/f\(x\) = x²\. How much greater.*at x = (\d+) than.*\[(\d+), (\d+)\]/))) {
      const [q0, a, b] = mm.slice(1).map(num);
      return 2 * q0 - (b * b - a * a) / (b - a);
    }
    if (/Which statement is true\?$/.test(p) && /the graph of a continuous function f/.test(p)) {
      const tail = /sharp corner/.test(p) ? 'does not exist' : /horizontal/.test(p) ? '= 0' : /rising/.test(p) ? 'is positive' : /falling/.test(p) ? 'is negative' : null;
      return only(options, (o) => o.endsWith(tail));
    }
    if ((mm = p.match(rx('passes through the points \\(#, #\\) and \\(#, #\\)')))) return (num(mm[4]) - num(mm[2])) / (num(mm[3]) - num(mm[1]));
    if ((mm = p.match(rx('\\w\\(#\\) = # and \\w′\\(#\\) = #\\. Using the rate.*estimate of \\w\\(#\\)\\?')))) {
      return num(mm[2]) + num(mm[4]) * (num(mm[5]) - num(mm[1]));
    }
    if ((mm = p.match(/f\(x\) = (x² [+−] \d+x)\. At what value of x is the instantaneous.*\[(\d+), (\d+)\]/))) {
      const f = fnOf(mm[1]), a = num(mm[2]), b = num(mm[3]);
      const avg = (f(b) - f(a)) / (b - a);
      // f′ is a line: find where it equals the average rate.
      const d0 = deriv(f, 0), d1 = deriv(f, 1);
      return Math.round(((avg - d0) / (d1 - d0)) * 1e6) / 1e6;
    }
    if ((mm = p.match(/v\(t\) = (.+?) metres per second\..*from t = (\d+) to t = (\d+)/))) {
      const v = fnOf(mm[1], 't');
      return (v(num(mm[3])) - v(num(mm[2]))) / (num(mm[3]) - num(mm[2]));
    }
    throw new Error(`no rule: ${p}`);
  },

  'calc-riemann-sums-approximation': (item, p, options) => {
    let mm;
    const rules = {
      left: (f, a, w) => w * f(a),
      right: (f, a, w) => w * f(a + w),
      midpoint: (f, a, w) => w * f(a + w / 2),
      trapezoidal: (f, a, w) => w * (f(a) + f(a + w)) / 2,
    };
    const sumOver = (rule, f, cuts) => cuts.slice(0, -1).reduce((s, a, i) => s + rules[rule](f, a, cuts[i + 1] - a), 0);
    if (/Selected values/.test(p)) {
      const [xs, ys] = table(p);
      const f = (x) => { const i = xs.findIndex((v) => Math.abs(v - x) < 1e-9); if (i < 0) throw new Error(`x = ${x} is not in the table`); return ys[i]; };
      if (/midpoint Riemann sum with two subintervals/.test(p)) return sumOver('midpoint', f, [xs[0], xs[2], xs[4]]);
      const rule = p.match(/Use a (left|right|trapezoidal)/)[1];
      return sumOver(rule, f, xs);
    }
    if ((mm = p.match(/f\(x\) = (x² \+ \d+)\. Use a (right|midpoint) Riemann sum with (\d+) subintervals of equal width to approximate ∫ from (\d+) to (\d+) of/))) {
      const n = num(mm[3]), a = num(mm[4]), b = num(mm[5]);
      return sumOver(mm[2], fnOf(mm[1]), Array.from({ length: n + 1 }, (_, i) => a + i * (b - a) / n));
    }
    const verdict = (approx, exact) => only(options, (o) => o === (approx > exact + 1e-9 ? 'an overestimate' : approx < exact - 1e-9 ? 'an underestimate' : 'exact?'));
    if ((mm = p.match(/positive and (increasing|decreasing) on the interval \[(\d+), (\d+)\]\. A (left|right) Riemann sum/))) {
      // Try it on a real function of that kind (neither concave-only nor linear).
      const a = num(mm[2]), b = num(mm[3]);
      const f = mm[1] === 'increasing' ? (x) => 2 + x + Math.sin(x) / 2 : (x) => 30 - x - Math.sin(x) / 2;
      const cuts = Array.from({ length: 6 }, (_, i) => a + i * (b - a) / 5);
      return verdict(sumOver(mm[4], f, cuts), integrate(f, a, b));
    }
    if ((mm = p.match(/concave (up|down) on the interval \[(\d+), (\d+)\]\. A (trapezoidal|midpoint)/))) {
      const a = num(mm[2]), b = num(mm[3]);
      const f = mm[1] === 'up' ? (x) => Math.exp(x / 3) : (x) => Math.sqrt(x + 1);
      const cuts = Array.from({ length: 6 }, (_, i) => a + i * (b - a) / 5);
      return verdict(sumOver(mm[4], f, cuts), integrate(f, a, b));
    }
    if ((mm = p.match(/left Riemann sum with \d+ equal subintervals gives (\d+), and a right Riemann sum with the same subintervals gives (\d+)/))) {
      return (num(mm[1]) + num(mm[2])) / 2;
    }
    throw new Error(`no rule: ${p}`);
  },

  'calc-ftc-part-2': (item, p, options) => {
    let mm;
    if ((mm = p.match(/^Evaluate ∫ from (\S+) to (\S+) of (.+) dx\.$/))) {
      const val = integrate(fnOf(mm[3]), evalExpr(mm[1]), evalExpr(mm[2]));
      if (options.length) return only(options, (o) => close(evalExpr(o), val, 1e-7));
      return val;
    }
    if ((mm = p.match(rx('f\\(#\\) = # and f\\(#\\) = #, what is ∫ from # to # of f′\\(x\\) dx\\?')))) {
      if (mm[1] !== mm[5] || mm[3] !== mm[6]) throw new Error('bounds do not match the values given');
      return num(mm[4]) - num(mm[2]);
    }
    if ((mm = p.match(rx('f\\(#\\) = # and ∫ from # to # of f′\\(x\\) dx = #, what is f\\(#\\)\\?')))) {
      if (mm[1] !== mm[3] || mm[4] !== mm[6]) throw new Error('bounds do not match');
      return num(mm[2]) + num(mm[5]);
    }
    if ((mm = p.match(rx('f\\(#\\) = # and f′\\(x\\) = (.+) for all x\\. What is f\\(#\\)\\?')))) {
      return num(mm[2]) + integrate(fnOf(mm[3]), num(mm[1]), num(mm[4]));
    }
    throw new Error(`no rule: ${p}`);
  },

  'calc-definite-integral-as-accumulation': (item, p, options) => {
    let mm;
    if ((mm = p.match(/What does ∫ from (\d+) to (\d+) of \w\(t\) dt represent\?/))) {
      return only(options, (o) => /^The number of /.test(o) && o.endsWith(` from t = ${mm[1]} to t = ${mm[2]}`));
    }
    if ((mm = p.match(/at a rate of \w\(t\) (\w+) per \w+, where.*What are the units of ∫/))) return only(options, (o) => o === mm[1]);
    if ((mm = p.match(/from the point \(0, 0\) to the point \((\d+), (\d+)\)\. What is ∫ from 0 to (\d+) of/))) {
      const b = num(mm[1]), h = num(mm[2]);
      if (mm[3] !== mm[1]) throw new Error('bounds');
      return integrate((x) => h * x / b, 0, b);
    }
    if ((mm = p.match(rx('Suppose ∫ from # to # of f\\(x\\) dx = # and ∫ from # to # of f\\(x\\) dx = #\\. What is ∫ from # to # of')))) {
      if (mm[2] !== mm[4] || mm[1] !== mm[7] || mm[5] !== mm[8]) throw new Error('intervals do not chain');
      return num(mm[3]) + num(mm[6]);
    }
    if ((mm = p.match(/tank holds (\d+) litres at t = 0, and ∫ from 0 to (\d+) of R\(t\) dt = (\d+)\. How many litres are in the tank at t = (\d+)/))) {
      if (mm[2] !== mm[4]) throw new Error('times');
      return num(mm[1]) + num(mm[3]);
    }
    if ((mm = p.match(/triangle with base (\d+) and height (\d+)\. On \[\d+, (\d+)\] it lies below the x-axis and, with the axis, forms a rectangle with width (\d+) and height (\d+)/))) {
      return num(mm[1]) * num(mm[2]) / 2 - num(mm[4]) * num(mm[5]);
    }
    if ((mm = p.match(/upper half of the circle of radius (\d+) centred at the origin/))) {
      const R = num(mm[1]);
      const val = integrate((x) => Math.sqrt(Math.max(0, R * R - x * x)), -R, R, 200000);
      return only(options, (o) => close(evalExpr(o), val, 1e-4));
    }
    if ((mm = p.match(rx('∫ from \\d+ to (\\d+) of v\\(t\\) dt = #, which statement must be true')))) {
      const d = num(mm[2]);
      return only(options, (o) => o.startsWith(`At t = ${mm[1]} the car is ${Math.abs(d)} metres ${d > 0 ? 'ahead of' : 'behind'} where it was`));
    }
    if ((mm = p.match(/holds (\d+) litres at t = 0\. If ∫ from 0 to \d+ of E\(t\) dt = (\d+) and ∫ from 0 to \d+ of L\(t\) dt = (\d+)/))) {
      return num(mm[1]) + num(mm[2]) - num(mm[3]);
    }
    if ((mm = p.match(/crosses the x-axis at x = (\d+) and x = (\d+)\. Between x = 0 and x = \d+ the graph is above the axis and encloses a region of area (\d+) with the axis; between x = \d+ and x = \d+ it is below the axis and encloses a region of area (\d+); between x = \d+ and x = (\d+) it is above the axis and encloses a region of area (\d+)\. What is ∫ from (\d+) to (\d+) of/))) {
      const [a, , P, Q, c, S, from, to] = mm.slice(1).map(num);
      if (to !== c) throw new Error('upper bound');
      if (from === 0) return P - Q + S;
      if (from === a) return -Q + S;
      throw new Error('lower bound');
    }
    if ((mm = p.match(rx('If ∫ from # to # of f\\(x\\) dx = #, what is ∫ from # to # of \\((\\d+)f\\(x\\) ([+−]) (\\d+)\\) dx\\?')))) {
      if (mm[1] !== mm[4] || mm[2] !== mm[5]) throw new Error('bounds');
      const c = (mm[7] === '−' ? -1 : 1) * num(mm[8]);
      return num(mm[6]) * num(mm[3]) + c * (num(mm[2]) - num(mm[1]));
    }
    if ((mm = p.match(/semicircle of radius (\d+) lying below the x-axis.*triangle with base (\d+) and height (\d+)/))) {
      const val = num(mm[2]) * num(mm[3]) / 2 - Math.PI * num(mm[1]) ** 2 / 2;
      return only(options, (o) => close(evalExpr(o), val, 1e-9));
    }
    throw new Error(`no rule: ${p}`);
  },

  'calc-first-second-derivative-tests': (item, p, options) => {
    let mm;
    if ((mm = p.match(/is (positive|negative) just to the left of x = \S+ and (positive|negative) just to the right/))) {
      // First Derivative Test, typed by hand.
      const kind = mm[1] === mm[2] ? 'neither a local maximum nor a local minimum' : (mm[1] === 'positive' ? 'a local maximum' : 'a local minimum');
      return only(options, (o) => o === kind);
    }
    if (/What does the Second Derivative Test say/.test(p)) {
      if (!/f″\(\S+\) = 0\./.test(p)) throw new Error('expected f″ = 0');
      return only(options, (o) => /inconclusive/.test(o));
    }
    if ((mm = p.match(rx('with f′\\(#\\) = 0 and f″\\(#\\) = #\\. At x')))) {
      // Second Derivative Test: concave down at a critical point is a hill.
      return only(options, (o) => o === (num(mm[3]) < 0 ? 'a local maximum' : 'a local minimum'));
    }
    if ((mm = p.match(rx('f\\(x\\) = (x³ − \\d+x), so that .* at x = # f has$')))) {
      const f = fnOf(mm[1]), c = num(mm[2]);
      if (Math.abs(deriv(f, c)) > 1e-4) throw new Error('not a critical point');
      const f2 = (f(c + 0.01) - 2 * f(c) + f(c - 0.01)) / 1e-4;
      return only(options, (o) => o === `a local ${f2 < 0 ? 'maximum' : 'minimum'}, because f″(${mm[2]}) is ${f2 < 0 ? 'negative' : 'positive'}`);
    }
    if ((mm = p.match(rx('only at x = #, x = # and x = #\\. The sign of f′ is: (\\w+) for x < \\S+, (\\w+) on \\(.*?\\), (\\w+) on \\(.*?\\), and (\\w+) for x >')))) {
      const xs = mm.slice(1, 4).map(num), s = mm.slice(4, 8);
      return one(xs.filter((_, i) => s[i] === 'negative' && s[i + 1] === 'positive'));
    }
    if ((mm = p.match(rx('f″\\(#\\) = #, f″\\(#\\) = #, f″\\(#\\) = #\\. Which conclusion')))) {
      const pts = [[mm[1], num(mm[2])], [mm[3], num(mm[4])], [mm[5], num(mm[6])]];
      return only(options, (o) => pts.every(([x, v]) => (v === 0
        ? o.endsWith(`the test gives no conclusion at x = ${x}`)
        : o.toLowerCase().includes(`local ${v > 0 ? 'minimum' : 'maximum'} at x = ${x}`))));
    }
    if ((mm = p.match(/f′\(x\) = (.+?), so f′\((\S+)\) = 0 and f″/))) {
      const z = one(zeros(fnOf(mm[1])));
      if (z.x !== num(mm[2])) throw new Error('wrong zero');
      return only(options, (o) => o.startsWith(`a local ${z.before < 0 ? 'minimum' : 'maximum'}, by the First Derivative Test`));
    }
    if ((mm = p.match(/f′\(x\) = (.+?)\. (At what value of x does f have a local (minimum|maximum|extremum)|How many local extrema)/))) {
      const f = fnOf(mm[1]);
      if (mm[3] === 'minimum') return one(minima(f));
      if (mm[3] === 'maximum') return one(maxima(f));
      if (mm[3] === 'extremum') return one([...minima(f), ...maxima(f)]);
      return minima(f).length + maxima(f).length;
    }
    throw new Error(`no rule: ${p}`);
  },

  'calc-curve-sketching-from-derivatives': (item, p, options) => {
    let mm;
    if ((mm = p.match(/f′\(x\) = (.+?)\. Which choice gives every interval on which f is (increasing|decreasing)/))) {
      const d = fnOf(mm[1]);
      return whereExactly(options, (x) => (mm[2] === 'increasing' ? d(x) > 0 : d(x) < 0));
    }
    if ((mm = p.match(/f″\(x\) = (.+?)\. On which interval is the graph of f concave up/))) {
      const d2 = fnOf(mm[1]);
      return whereExactly(options, (x) => d2(x) > 0);
    }
    if ((mm = p.match(/satisfies f′\(x\) ([<>]) 0 and f″\(x\) ([<>]) 0\. On this interval/))) {
      return only(options, (o) => o === `${mm[1] === '>' ? 'rising' : 'falling'} and concave ${mm[2] === '>' ? 'up' : 'down'}`);
    }
    if ((mm = p.match(rx('It is (\\w+) for x < #, (\\w+) on \\(.*?\\), and (\\w+) for x > #\\. At what value of x does the graph of f have an inflection')))) {
      const hits = [];
      if (mm[1] !== mm[3]) hits.push(num(mm[2]));
      if (mm[3] !== mm[4]) hits.push(num(mm[5]));
      return one(hits);
    }
    if ((mm = p.match(/f′\(x\) = (.+?)\. On which interval is the graph of f both (increasing|decreasing) and concave (up|down)/))) {
      const d = fnOf(mm[1]);
      const want = (x) => (mm[2] === 'increasing' ? d(x) > 0 : d(x) < 0) && (mm[3] === 'up' ? deriv(d, x) > 0 : deriv(d, x) < 0);
      // Every point of the right interval has both properties; the other intervals fail somewhere.
      return only(options, (o) => GRID.filter((x) => inside(o, x)).every(want));
    }
    if ((mm = p.match(/f″\(x\) = (.+?)\. At what value of x does the graph of f have an inflection/))) {
      return one(zeros(fnOf(mm[1])).filter((z) => z.before * z.after < 0).map((z) => z.x));
    }
    if ((mm = p.match(/f′\(x\) ([<>]) 0 for x < (\S+), f′\(x\) ([<>]) 0 for x > \S+, and f″\(x\) ([<>]) 0 for all x/))) {
      if (mm[1] === mm[3]) throw new Error('no turn');
      const shape = mm[1] === '>' ? `It rises to a peak at x = ${mm[2]} and then falls` : `It falls to a valley at x = ${mm[2]} and then rises`;
      return only(options, (o) => o.startsWith(shape) && o.includes(`(concave ${mm[4] === '>' ? 'up' : 'down'})`));
    }
    if ((mm = p.match(/straight line with (positive|negative) slope that crosses the x-axis at x = (\S+)\./))) {
      // f′ is a line: negative then positive (a minimum) when it slopes up; its slope is f″.
      const up = mm[1] === 'positive';
      return only(options, (o) => o === `f has a local ${up ? 'minimum' : 'maximum'} at x = ${mm[2]}, and its graph is concave ${up ? 'up' : 'down'} everywhere`);
    }
    if ((mm = p.match(/It (rises|falls) for x < (\S+) and (rises|falls) for x > /))) {
      // Concave up exactly where f′ is increasing.
      return only(options, (o) => o === `Only for x ${mm[1] === 'rises' ? '<' : '>'} ${mm[2]}`);
    }
    if ((mm = p.match(/f′\(x\) = (.+?)\. At what value of x does the graph of f have an inflection point/))) {
      const d = fnOf(mm[1]);
      const g0 = deriv(d, 0), g1 = deriv(d, 1);
      return Math.round((-g0 / (g1 - g0)) * 1e6) / 1e6;
    }
    if ((mm = p.match(rx('f′\\(x\\) ([<>]) 0 for x < # and for x > #, and f′\\(x\\) [<>] 0 on .*Also f″\\(x\\) ([<>]) 0 for x < # and')))) {
      const first = mm[1] === '>' ? 'maximum' : 'minimum', second = mm[1] === '>' ? 'minimum' : 'maximum';
      return only(options, (o) => o === `Local ${first} at x = ${mm[2]}, local ${second} at x = ${mm[3]}, inflection point at x = ${mm[5]}`);
    }
    throw new Error(`no rule: ${p}`);
  },

  'calc-exponential-growth-decay-models': (item, p, options) => {
    let mm;
    const byValue = (val) => only(options, (o) => close(evalExpr(o), val, 1e-9));
    if ((mm = p.match(rx('dy/dt = #y, with y\\(0\\) = #\\. Which function is y\\(t\\)')))) {
      const k = num(mm[1]), y0 = num(mm[2]);
      return only(options, (o) => {
        const y = fnOf(o.replace(/^y = /, ''), 't');
        return close(y(0), y0) && [0.3, 1, 2.2].every((t) => close(deriv(y, t), k * y(t), 1e-5));
      });
    }
    if ((mm = p.match(/equal to (\d+)% of its current size per year/))) return only(options, (o) => o === `dP/dt = ${num(mm[1]) / 100}P`);
    if ((mm = p.match(/doubles every (\d+) hours\. If there are (\d+) bacteria at t = 0, how many are there at t = (\d+) hours/))) {
      return num(mm[2]) * 2 ** (num(mm[3]) / num(mm[1]));
    }
    if ((mm = p.match(/half-life of (\d+) days\. If the sample has a mass of (\d+) grams at t = 0, how many grams remain at t = (\d+) days/))) {
      return num(mm[2]) * 0.5 ** (num(mm[3]) / num(mm[1]));
    }
    if ((mm = p.match(/y = (\d+)e\^\(kt\)\. If y = (\d+) when t = (\d+), what is k/))) return byValue(Math.log(num(mm[2]) / num(mm[1])) / num(mm[3]));
    if ((mm = p.match(/dy\/dt = ([\d.]+)y, where t is in years\. How many years does it take the quantity to double/))) return byValue(Math.log(2) / num(mm[1]));
    if ((mm = p.match(/dy\/dt = −([\d.]+)y, where t is in days\. What is its half-life/))) return byValue(Math.log(2) / num(mm[1]));
    if ((mm = p.match(/If y\(0\) = (\d+) and y\((\d+)\) = (\d+), what is y\((\d+)\)\?/))) {
      const k = Math.log(num(mm[3]) / num(mm[1])) / num(mm[2]);
      return Math.round(num(mm[1]) * Math.exp(k * num(mm[4])) * 1e6) / 1e6;
    }
    if ((mm = p.match(/y = y₀e\^\(kt\), with t in years, and has a half-life of (\d+) years\. What is k/))) return byValue(-Math.log(2) / num(mm[1]));
    if ((mm = p.match(/it (doubles|triples) every (\d+) years\. Starting from a population of (\d+), how many years does it take to reach (\d+)/))) {
      const c = mm[1] === 'doubles' ? 2 : 3;
      return Math.round(num(mm[2]) * Math.log(num(mm[4]) / num(mm[3])) / Math.log(c) * 1e6) / 1e6;
    }
    if ((mm = p.match(/dy\/dt = −([\d.]+)y with y\(0\) = (\d+)\. What is y\((\d+)\)\?/))) return byValue(num(mm[2]) * Math.exp(-num(mm[1]) * num(mm[3])));
    if ((mm = p.match(/dy\/dt = ([\d.]+)y with y\(0\) = (\d+)\. At what time t does y reach (\d+)\?/))) return byValue(Math.log(num(mm[3]) / num(mm[2])) / num(mm[1]));
    throw new Error(`no rule: ${p}`);
  },
};

/** A typed answer as a number: "7", "-3", "2/3", "24.5". */
function typed(value) {
  const mm = String(value).match(/^(-?\d+(?:\.\d+)?)(?:\/(\d+))?$/);
  if (!mm) throw new Error(`not a typeable number: ${value}`);
  return mm[2] ? Number(mm[1]) / Number(mm[2]) : Number(mm[1]);
}

// ── the tests ──────────────────────────────────────────────────────────────

describe('course-level items — AP Calculus AB', () => {
  test('the bank is for the AB course, eight skills, twelve items each', () => {
    expect(bank.COURSE_ID).toBe('ap-calculus-ab');
    expect(bank.GB).toBe('9-12');
    expect(bank.TEMPLATES).toHaveLength(8);
    for (const t of bank.TEMPLATES) {
      expect(t.skillId).toBe(`calc-${t.courseSkill}`);
      expect(t.tiers.map((x) => x.difficulty)).toEqual([2, 3, 4]);
      expect(ITEMS[t.skillId]).toHaveLength(12);
    }
  });

  test('every template has a re-solver', () => {
    expect(Object.keys(RESOLVE).sort()).toEqual(bank.TEMPLATES.map((t) => t.skillId).sort());
  });

  test('the builder accepts every item', () => {
    expect(validate(ALL)).toEqual([]);
  });

  test.each(ALL.map((it) => [it.problemId, it]))('%s re-solves from its own text', (_id, item) => {
    const options = (item.options || []).map((o) => o.text);
    const expected = RESOLVE[item.skillId](item, item.prompt, options);
    if (item.options) {
      expect(typeof expected).toBe('string');
      expect(item.answer.value).toBe(expected);
      expect(item.options.find((o) => o.label === item.correctOption).text).toBe(expected);
    } else {
      expect(typeof expected).toBe('number');
      expect(Math.abs(typed(item.answer.value) - expected)).toBeLessThan(1e-3);
    }
  });

  test('a typed answer is one number; anything else is multiple choice', () => {
    for (const it of ALL) {
      if (it.answerType === 'constructed-response') expect(it.answer.value).toMatch(/^-?\d+(\.\d{1,2})?(\/\d+)?$/);
      else expect(it.options).toHaveLength(4);
    }
  });

  test('options that are pure numbers or formulas are all different in value', () => {
    for (const it of ALL.filter((i) => i.options)) {
      const vals = [];
      for (const o of it.options) { try { vals.push(evalExpr(o.text)); } catch { vals.length = 0; break; } }
      for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) expect([it.problemId, close(vals[i], vals[j], 1e-9)]).toEqual([it.problemId, false]);
    }
  });

  test('no prompt leans on a picture', () => {
    for (const it of ALL) {
      expect(it.prompt).not.toMatch(/\b(shown|figure|diagram|pictured)\b|\b(graph|table|chart|number line) (above|below)\b/i);
    }
  });

  test('the key is not parked on one letter', () => {
    for (const [skill, items] of Object.entries(ITEMS)) {
      const letters = new Set(items.filter((i) => i.options).map((i) => i.correctOption));
      if (items.filter((i) => i.options).length >= 4) expect([skill, letters.size >= 2]).toEqual([skill, true]);
    }
  });

  test('the evaluator reads printed maths the way a student would', () => {
    expect(evalExpr('(ln 2)/0.25')).toBeCloseTo(Math.log(2) / 0.25);
    expect(evalExpr('−(ln 2)/5')).toBeCloseTo(-Math.log(2) / 5);
    expect(evalExpr('30e^(−3)')).toBeCloseTo(30 * Math.exp(-3));
    expect(evalExpr('2(e^6 − 1)')).toBeCloseTo(2 * (Math.exp(6) - 1));
    expect(evalExpr('9 − 8π')).toBeCloseTo(9 - 8 * Math.PI);
    expect(evalExpr('9π/2')).toBeCloseTo(4.5 * Math.PI);
    expect(evalExpr('−(x − 4)³', { x: 6 })).toBe(-8);
    expect(evalExpr('(x + 2)x', { x: 3 })).toBe(15);
    expect(evalExpr('(x − 5)(7 − x)', { x: 6 })).toBe(1);
    expect(evalExpr('−2(x + 3)', { x: 1 })).toBe(-8);
    expect(evalExpr('29e^(−0.3t)', { t: 0 })).toBe(29);
    expect(evalExpr('8 sin x', { x: Math.PI / 2 })).toBeCloseTo(8);
    expect(evalExpr('2/√x', { x: 4 })).toBe(1);
    expect(integrate(fnOf('3x² + 4x'), 0, 2)).toBeCloseTo(16);
  });
});
