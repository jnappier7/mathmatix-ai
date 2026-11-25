/**
 * Course-level check items, Algebra 1 — every answer RE-SOLVED from the
 * printed question.
 *
 * Nothing here calls the templates' own maths. Each re-solver reads the
 * expression, equation, inequality, table or data list out of the prompt a
 * student would see and works the answer a second way: a small evaluator for
 * printed algebra (`ev`) checks expressions and choices numerically, an
 * inequality is solved by testing values, a line or a quadratic is measured
 * from its own equation, and statistics are recomputed from the listed data.
 * Property names and phrase meanings are typed by hand below.
 */

const { expand, validate } = require('../../scripts/buildCourseLevelItems');
const bank = require('../../scripts/lib/courseLevelAlgebra1');

const ITEMS = {};
for (const t of bank.TEMPLATES) ITEMS[t.skillId] = expand(t, bank.GB);
const ALL = Object.values(ITEMS).flat();

// ── a reader's toolkit ─────────────────────────────────────────────────────

/** Evaluate printed algebra: 3x² − 2x, (2x^3y)^2 · x, y^6/(8x^6), (−7 + √73)/4, 5 · (1/2)^x. */
function ev(text, vars = {}) {
  const src = String(text).replace(/\s+/g, '');
  let i = 0;
  const peek = () => src[i];
  const starts = (ch) => ch !== undefined && (/[0-9a-z(√]/.test(ch));
  function primary() {
    const ch = peek();
    if (ch === '(') { i++; const v = expr(); if (peek() !== ')') throw new Error(`expected ) in ${text}`); i++; return v; }
    if (ch === '√') { i++; return Math.sqrt(primary()); }
    if (/[0-9]/.test(ch)) { const m = src.slice(i).match(/^\d+(\.\d+)?/); i += m[0].length; return Number(m[0]); }
    if (/[a-z]/.test(ch)) { i++; if (!(ch in vars)) throw new Error(`no value for ${ch} in ${text}`); return vars[ch]; }
    throw new Error(`cannot read "${text}" at ${i}`);
  }
  function power() {
    let base = primary();
    for (;;) {
      if (peek() === '²') { i++; base **= 2; } else if (peek() === '^') { i++; base **= primary(); } else return base;
    }
  }
  function unary() {
    if (peek() === '−' || peek() === '-') { i++; return -unary(); }
    return power();
  }
  function term() {
    let v = unary();
    for (;;) {
      const ch = peek();
      if (ch === '·' || ch === '*') { i++; v *= unary(); } else if (ch === '/' || ch === '÷') { i++; v /= unary(); } else if (starts(ch)) v *= power();
      else return v;
    }
  }
  function expr() {
    let v = term();
    for (;;) {
      const ch = peek();
      if (ch === '+') { i++; v += term(); } else if (ch === '−' || ch === '-') { i++; v -= term(); } else return v;
    }
  }
  const out = expr();
  if (i !== src.length) throw new Error(`stopped early reading "${text}" at ${i}`);
  return out;
}

const N = (s) => Number(String(s).replace('−', '-'));
const neg = (n) => (n < 0 ? `−${Math.abs(n)}` : `${n}`);
const close = (a, b) => Math.abs(a - b) < 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));
const sum = (a) => a.reduce((s, v) => s + v, 0);
const nums = (s) => s.split(',').map((v) => N(v.trim()));
const sortN = (a) => a.slice().sort((p, q) => p - q);
const medianOf = (a) => { const s = sortN(a); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const whole = (x) => {
  if (Math.abs(x - Math.round(x)) > 1e-7) throw new Error(`expected a whole number, got ${x}`);
  return String(Math.round(x));
};
/** A rational the way a student types it: 7, -3, 5/4, -1/2. */
function asFraction(x) {
  for (let d = 1; d <= 64; d++) if (Math.abs(x * d - Math.round(x * d)) < 1e-9) return d === 1 ? String(Math.round(x)) : `${Math.round(x * d)}/${d}`;
  throw new Error(`not a simple fraction: ${x}`);
}

/** The ONE choice that passes; anything else is a broken item. */
function only(options, pred, what) {
  const hits = options.filter((o) => pred(o));
  if (hits.length !== 1) throw new Error(`${hits.length} choices fit (${what}): ${options.join(' | ')}`);
  return hits[0];
}
/** The one choice equal in value to an expression, tested at several points. */
function sameValue(options, f, names, what) {
  const points = [[1.3, 0.7], [-2.1, 1.9], [0.6, -1.4]];
  return only(options, (o) => points.every((p) => {
    const vars = Object.fromEntries(names.map((n, k) => [n, p[k]]));
    return close(ev(o, vars), f(vars));
  }), what);
}

/** Run the first rule whose pattern matches. */
function solveBy(rules, prompt, options) {
  for (const [re, fn] of rules) {
    const m = prompt.match(re);
    if (m) return String(fn(m, options));
  }
  throw new Error(`no re-solver rule matches: ${prompt}`);
}

// A line from its own equation (any linear form in x and y): y at a given x.
function yOf(eq, x) {
  const [L, R] = eq.split(' = ');
  const f = (y) => ev(L, { x, y }) - ev(R, { x, y });
  return -f(0) / (f(1) - f(0));
}
const holds = (eq, x, y) => { const [L, R] = eq.split(' = '); return close(ev(L, { x, y }), ev(R, { x, y })); };
const lineOf = (eq) => ({ b: yOf(eq, 0), m: yOf(eq, 1) - yOf(eq, 0) });
const point = (o) => { const m = o.match(/^\((−?\d+), (−?\d+)\)$/); if (!m) throw new Error(`not a point: ${o}`); return [N(m[1]), N(m[2])]; };
const describe = (m, b) => `A line that ${m > 0 ? 'rises' : 'falls'} from left to right and crosses the y-axis at ${neg(Math.round(b))}`;

// An inequality as a test on a value.
const CMP = { '<': (a, b) => a < b - 1e-9, '>': (a, b) => a > b + 1e-9, '≤': (a, b) => a <= b + 1e-9, '≥': (a, b) => a >= b - 1e-9 };
function truth(text, name = 'x') {
  const m = text.match(/^(.+) ([<>≤≥]) (.+)$/);
  if (!m) throw new Error(`not an inequality: ${text}`);
  return (v) => CMP[m[2]](ev(m[1], { [name]: v }), ev(m[3], { [name]: v }));
}
const GRID = Array.from({ length: 801 }, (_, k) => -100 + k / 4);
const sameSet = (f, h) => GRID.every((v) => f(v) === h(v));

// A quadratic from its own equation: a, b, c of (left − right) = 0.
function quadOf(eq) {
  const [L, R] = eq.split(' = ');
  const f = (x) => ev(L, { x }) - ev(R, { x });
  const c = f(0), a = (f(1) + f(-1)) / 2 - c, b = (f(1) - f(-1)) / 2;
  return { a, b, c, D: b * b - 4 * a * c };
}
function rootsOf(eq) {
  const { a, b, D } = quadOf(eq);
  return [(-b - Math.sqrt(D)) / (2 * a), (-b + Math.sqrt(D)) / (2 * a)].sort((p, q) => p - q);
}
/** The two values of "x = … ± …". */
function plusMinus(option) {
  const body = option.replace(/^x = /, '');
  return [ev(body.replace('±', '+')), ev(body.replace('±', '−'))].sort((p, q) => p - q);
}

// Tables.
const diffs = (ys) => ys.slice(1).map((y, k) => y - ys[k]);
const ratios = (ys) => ys.slice(1).map((y, k) => y / ys[k]);
const constant = (a) => a.every((v) => close(v, a[0]));
/** Continue a table whose y-values add or multiply by a constant. */
function extend(xs, ys, at) {
  let y = ys[ys.length - 1];
  const linear = constant(diffs(ys)), expo = constant(ratios(ys));
  if (linear === expo) throw new Error(`pattern not clear: ${ys}`);
  for (let x = xs[xs.length - 1]; x < at; x++) y = linear ? y + diffs(ys)[0] : y * ratios(ys)[0];
  return y;
}

// ── hand-typed facts ───────────────────────────────────────────────────────

const CA = 'Commutative Property of Addition';
const AA = 'Associative Property of Addition';
const AM = 'Associative Property of Multiplication';
const DIST = 'Distributive Property';
const IA = 'Additive Identity Property';
const IM = 'Multiplicative Identity Property';
const VA = 'Additive Inverse Property';

// What an equation illustrates, read from its shape.
const SHAPES = [
  [/^(\d+) \+ x = x \+ \1$/, CA],                                   // order of addends
  [/^x \+ (\d+) = \1 \+ x$/, CA],
  [/^\((\d+) · x\) · (\d+) = \1 · \(x · \2\)$/, AM],                // grouping of factors
  [/^\(x \+ (\d+)\) \+ (\d+) = x \+ \(\1 \+ \2\)$/, AA],            // grouping of addends
  [/^(\d+)\(x \+ (\d+)\) = \1x \+ \d+$/, DIST],
  [/^(?:x|\d+) \+ 0 = (?:x|\d+)$/, IA],
  [/^1 · (\d+) = \1$/, IM],
  [/^(\d+) \+ \(−\1\) = 0$/, VA],
];
function illustrates(eq) {
  const hit = SHAPES.find(([re]) => re.test(eq));
  if (!hit) throw new Error(`unknown shape: ${eq}`);
  const [L, R] = eq.split(' = ');
  if (!close(ev(L, { x: 1.7 }), ev(R, { x: 1.7 }))) throw new Error(`not even true: ${eq}`);
  return hit[1];
}

// What a verbal phrase means, as a function of the number n.
const PHRASES = [
  [/^(\d+) less than (\d+) times a number(?: n)?$/, (k, m) => (n) => m * n - k],
  [/^(\d+) more than the product of (\d+) and a number n$/, (k, m) => (n) => m * n + k],
  [/^the product of (\d+) and the sum of a number n and (\d+)$/, (m, k) => (n) => m * (n + k)],
  [/^the quotient of a number n and (\d+), decreased by (\d+)$/, (m, k) => (n) => n / m - k],
  [/^(\d+) times the sum of a number n and (\d+), subtracted from (\d+)$/, (m, k, t) => (n) => t - m * (n + k)],
  [/^(\d+) times the difference of a number and (\d+)$/, (m, k) => (n) => m * (n - k)],
  [/^(\d+) times the difference of (\d+) and a number$/, (m, k) => (n) => m * (k - n)],
  [/^the sum of (\d+) and the difference of a number and (\d+)$/, (m, k) => (n) => m + (n - k)],
];
function meaning(phrase) {
  for (const [re, make] of PHRASES) {
    const m = phrase.match(re);
    if (m) return make(...m.slice(1).map(Number));
  }
  throw new Error(`unknown phrase: ${phrase}`);
}

const DISPLAY_FOR = [
  [/side by side/, 'Box plot'],
  [/every individual value/, 'Dot plot'],
  [/grouped into intervals/, 'Histogram'],
  [/are related/, 'Scatter plot'],
];

const five = (m, k) => [1, 2, 3, 4, 5].map((j) => Number(m[k + j - 1]));
const FIVE = 'minimum (\\d+), first quartile (\\d+), median (\\d+), third quartile (\\d+) and maximum (\\d+)';
const histogram = (p) => [...p.matchAll(/(\d+)–(\d+): (\d+)/g)].map((m) => ({ label: `${m[1]}–${m[2]}`, lo: Number(m[1]), hi: Number(m[2]), n: Number(m[3]) }));
const dots = (p) => [...p.matchAll(/(\d+) dots? above (\d+)/g)].flatMap((m) => Array(Number(m[1])).fill(Number(m[2])));

// ── the re-solvers ─────────────────────────────────────────────────────────

const RESOLVE = {
  'a1-variable-expressions': (p, o) => solveBy([
    [/^Which expression means "(.+)"\?$/, (m) => { const f = meaning(m[1]); return sameValue(o, (v) => f(v.n), ['n'], 'phrase'); }],
    [/^Evaluate (.+) when x = (−?\d+)\.$/, (m) => whole(ev(m[1], { x: N(m[2]) }))],
    [/^Evaluate (.+) when a = (−?\d+) and b = (−?\d+)\.$/, (m) => whole(ev(m[1], { a: N(m[2]), b: N(m[3]) }))],
    // the x-term is the one whose letter part is exactly "x"
    [/^In the expression (.+), what is the coefficient of x\?$/, (m) => {
      const t = m[1].match(/(?:^|([+−]) )(\d*)x(?![²y])/);
      return (t[1] === '−' ? -1 : 1) * (t[2] === '' ? 1 : Number(t[2]));
    }],
    [/^How many terms are in the expression (.+)\?$/, (m) => m[1].split(/ [+−] /).length],
    [/^Which phrase describes the expression (.+)\?$/, (m) => only(o, (opt) => [1.7, -2.3, 5].every((n) => close(meaning(opt)(n), ev(m[1], { n }))), 'phrase')],
    // a one-time fee plus a rate for each unit
    [/\$(\d+)[^$]* plus \$(\d+) per \w+\. .* for (\w) \w+\?$/, (m) => sameValue(o, (v) => Number(m[1]) + Number(m[2]) * v[m[3]], [m[3]], 'cost')],
  ], p, o),

  'a1-algebraic-properties': (p, o) => solveBy([
    [/^Which property is illustrated by (.+)\?$/, (m) => illustrates(m[1])],
    [/^Use the Distributive Property to rewrite (.+)\.$/, (m) => sameValue(o, (v) => ev(m[1], v), ['x'], 'distribute')],
    [/^Which equation illustrates the (.+)\?$/, (m) => only(o, (opt) => illustrates(opt) === m[1], 'illustrates')],
    // a + (x + b) → a + (b + x) is a change of ORDER; → (a + b) + x is a change of GROUPING
    [/^A student simplifies (\d+) \+ \(x \+ (\d+)\)\. Step 1: \1 \+ \(\2 \+ x\)\. Step 2: \(\1 \+ \2\) \+ x\. .*justifies Step (\d)\?$/, (m) => ({ 1: CA, 2: AA })[m[3]]],
    [/^Subtraction and division do not have every property/, () => only(o, (opt) => {
      const [L, R] = opt.split(' = ');
      return [{ a: 2.3, b: 1.7, c: 0.6 }, { a: -5, b: 3, c: 7 }].every((v) => close(ev(L, v), ev(R, v)));
    }, 'true for all')],
    [/^By the Multiplicative Inverse Property, (\d+)\/(\d+) · n = 1/, (m) => `${m[2]}/${m[1]}`],
    // a(x+b) + cx: distribute (1), reorder the addends (2), factor out x — the distributive property again (3)
    [/^A student simplifies (\d+)\(x \+ (\d+)\) \+ (\d+)x\. Step 1: \1x \+ \d+ \+ \3x\. Step 2: \1x \+ \3x \+ \d+\. Step 3: \(\1 \+ \3\)x \+ \d+\. .*justifies Step (\d)\?$/,
      (m) => ({ 1: DIST, 2: CA, 3: DIST })[m[4]]],
    [/= 0 a student concludes that x − \d+ = 0 or x \+ \d+ = 0/, () => 'Zero Product Property'],
    [/^Which expression uses the Distributive Property to rewrite (\d+) · (\d+) for mental math\?$/, (m) => only(o, (opt) => {
      const t = opt.match(/^(\d+) · 100 [+−] (\d+) · \d+$/);
      return !!t && t[1] === m[1] && t[2] === m[1] && close(ev(opt), m[1] * m[2]);
    }, 'mental math')],
    [/ONLY the Commutative Property of Multiplication to (\d+) · \(x \+ (\d+)\)\?$/, (m) => `(x + ${m[2]}) · ${m[1]}`],
  ], p, o),

  'a1-solving-inequalities': (p, o) => solveBy([
    [/^Solve the inequality: (.+)$/, (m) => { const f = truth(m[1]); return only(o, (opt) => sameSet(f, truth(opt)), 'solution set'); }],
    [/^Which value of x is a solution of (.+)\?$/, (m) => { const f = truth(m[1]); return only(o, (opt) => f(N(opt)), 'a solution'); }],
    [/has \$(\d+) saved and saves \$(\d+) more each week\. \w+ wants to have at least \$(\d+)\./, (m) => {
      const f = (w) => Number(m[1]) + Number(m[2]) * w >= Number(m[3]);
      return only(o, (opt) => sameSet(f, truth(opt, 'w')), 'weeks');
    }],
    [/at most (\d+) kg\. A worker who weighs (\d+) kg rides with boxes that weigh (\d+) kg each/, (m) => {
      let n = 0;
      while (Number(m[2]) + Number(m[3]) * (n + 1) <= Number(m[1])) n++;
      return n;
    }],
    [/^What is the (smallest|greatest) integer that satisfies (.+)\?$/, (m) => {
      const f = truth(m[2]);
      const ok = Array.from({ length: 401 }, (_, k) => k - 200).filter((v) => f(v));
      const v = m[1] === 'smallest' ? ok[0] : ok[ok.length - 1];
      if (Math.abs(v) === 200) throw new Error('unbounded');
      return v;
    }],
  ], p, o),

  'a1-graphing-linear-equations-slope-intercept': (p, o) => solveBy([
    [/^What is the slope of the line (y = .+)\?$/, (m) => whole(lineOf(m[1]).m)],
    [/^What is the slope of the line (.+)\?$/, (m) => only(o, (opt) => close(ev(opt), lineOf(m[1]).m), 'slope')],
    [/^The line (.+) crosses the y-axis at (?:the point )?\(0, k\)\. What is k\?$/, (m) => whole(yOf(m[1], 0))],
    [/^Which point lies on the line (.+)\?$/, (m) => only(o, (opt) => holds(m[1], ...point(opt)), 'on the line')],
    [/^Which describes the graph of (.+)\?$/, (m) => { const l = lineOf(m[1]); return describe(l.m, l.b); }],
    [/^What is the x-intercept of the line y = (.+)\? Give/, (m) => { const f = (x) => ev(m[1], { x }); return whole(-f(0) / (f(1) - f(0))); }],
    [/y-intercept (−?\d+) and slope (−?)(\d+)\/(\d+)\. Start at the y-intercept and use the slope once, moving to the right/, (m) => {
      const rise = (m[2] ? -1 : 1) * Number(m[3]);
      return `(${m[4]}, ${neg(N(m[1]) + rise)})`;
    }],
    [/^Which equation is (.+) written in slope-intercept form\?$/, (m) => only(o, (opt) => /^y = /.test(opt) && [0, 1, -3].every((x) => close(yOf(opt, x), yOf(m[1], x))), 'same line')],
    [/slope (−?\d+) and passes through the point \((−?\d+), (−?\d+)\)\. What is its y-intercept/, (m) => N(m[3]) - N(m[1]) * N(m[2])],
    [/y-intercept (−?\d+) and slope (−?)(\d+)\/(\d+)\. What is the y-coordinate of the point on the line where x = (\d+)/, (m) => whole(N(m[1]) + (m[2] ? -1 : 1) * (m[3] / m[4]) * m[5])],
  ], p, o),

  'a1-systems-of-equations-graphing': (p, o) => {
    const count = (e1, e2) => {
      const a = lineOf(e1), b = lineOf(e2);
      if (!close(a.m, b.m)) return 'Exactly one solution';
      return close(a.b, b.b) ? 'Infinitely many solutions' : 'No solution';
    };
    const meet = (e1, e2) => { const a = lineOf(e1), b = lineOf(e2); const x = (b.b - a.b) / (a.m - b.m); return [x, a.m * x + a.b]; };
    return solveBy([
      [/^The lines (.+?) and (.+) are drawn on the same coordinate plane and cross at the point \((−?\d+), (−?\d+)\)/, (m) => {
        if (!holds(m[1], N(m[3]), N(m[4])) || !holds(m[2], N(m[3]), N(m[4]))) throw new Error('the stated point is not on both lines');
        return `x = ${m[3]} and y = ${m[4]} make both equations true`;
      }],
      [/^Which point is the solution of the system (.+?) and (.+)\?$/, (m) => only(o, (opt) => holds(m[1], ...point(opt)) && holds(m[2], ...point(opt)), 'on both')],
      [/^At which point do the lines (.+?) and (.+) intersect\?$/, (m) => only(o, (opt) => holds(m[1], ...point(opt)) && holds(m[2], ...point(opt)), 'on both')],
      [/^How many solutions does the system (.+?) and (.+) have\?$/, (m) => count(m[1], m[2])],
      [/^The lines (.+?) and (.+) intersect at one point\. What is the (x|y)-coordinate/, (m) => whole(meet(m[1], m[2])[m[3] === 'x' ? 0 : 1])],
      [/^Is \((−?\d+), (−?\d+)\) the solution of the system\? First equation: (.+)\. Second equation: (.+)\.$/, (m) => {
        const a = holds(m[3], N(m[1]), N(m[2])), b = holds(m[4], N(m[1]), N(m[2]));
        return a && b ? 'Yes, it makes both equations true' : a ? 'No, it makes only the first equation true' : b ? 'No, it makes only the second equation true' : 'No, it makes neither equation true';
      }],
      // parallel = same slope; the second line's intercept must differ or it would be the same line
      [/^For what value of k does the system (.+) and y = kx ([+−]) (\d+) have no solution\?$/, (m) => {
        const l = lineOf(m[1]);
        if (close(l.b, (m[2] === '−' ? -1 : 1) * m[3])) throw new Error('same line, not parallel');
        return whole(l.m);
      }],
      [/y = (\d+)x \+ (\d+)\. Plan B .* y = (\d+)x\. /, (m) => whole(m[2] / (m[3] - m[1]))],
    ], p, o);
  },

  'a1-exponent-rules-multiplication': (p, o) => solveBy([
    [/^Simplify: (.+)$/, (m) => sameValue(o, (v) => ev(m[1], v), ['x', 'y'], 'simplify')],
    [/^(\d+)\^(\d+) · \1\^(\d+) = \1\^k\. What is k\?$/, (m) => Number(m[2]) + Number(m[3])],
    [/^\(x\^(\d+)\)\^(\d+) · x\^(\d+) = x\^k\. What is k\?$/, (m) => m[1] * m[2] + Number(m[3])],
    [/^For what value of n is x\^n · x\^(\d+) = \(x\^(\d+)\)\^(\d+)\?$/, (m) => m[2] * m[3] - m[1]],
  ], p, o),

  'a1-exponent-rules-division': (p, o) => solveBy([
    [/^Simplify(, using positive exponents only)?: (.+)$/, (m) => {
      const key = sameValue(o, (v) => ev(m[2], v), ['x', 'y'], 'simplify');
      if (m[1] && /\^\(−/.test(key)) throw new Error('negative exponent left in the answer');
      return key;
    }],
    [/^Which expression is equivalent to (.+)\?$/, (m) => sameValue(o, (v) => ev(m[1], v), ['x'], 'equivalent')],
    [/^What is the value of (.+)\?$/, (m) => whole(ev(m[1]))],
    [/^Write (\d+)\^\(−(\d+)\) as a fraction/, (m) => `1/${Number(m[1]) ** Number(m[2])}`],
    [/^Evaluate: (.+)\. Give a whole number or a fraction\.$/, (m) => asFraction(ev(m[1]))],
  ], p, o),

  'a1-quadratic-formula': (p, o) => solveBy([
    [/^To use the quadratic formula on (.+), what is the value of ([bc])\?$/, (m) => whole(quadOf(m[1])[m[2]])],
    [/^What is the value of the discriminant b² − 4ac for (.+)\?$/, (m) => whole(quadOf(m[1]).D)],
    [/^Use the quadratic formula to solve (.+)\. What is the (larger|smaller) solution\?/, (m) => asFraction(rootsOf(m[1])[m[2] === 'larger' ? 1 : 0])],
    [/^Use the quadratic formula to solve (.+)\. What is the sum of the two solutions\?$/, (m) => whole(sum(rootsOf(m[1])))],
    [/^(?:Which expression gives the solutions|What are the exact solutions) of (.+)\?$/, (m) => {
      const r = rootsOf(m[1]);
      return only(o, (opt) => { const v = plusMinus(opt); return close(v[0], r[0]) && close(v[1], r[1]); }, 'roots');
    }],
    [/^The equation (.+) is rewritten as (\d+)x² \+ bx \+ c = 0 .* value of ([bc])\?$/, (m) => {
      const q = quadOf(m[1]);
      if (!close(q.a, Number(m[2]))) throw new Error('leading coefficient does not match');
      return whole(q[m[3]]);
    }],
    [/^When (.+) is solved with the quadratic formula, what number is under the square root sign\?$/, (m) => whole(quadOf(m[1]).D)],
  ], p, o),

  'a1-measures-of-central-tendency': (p, o) => {
    const modeOf = (a) => {
      const n = {};
      a.forEach((v) => { n[v] = (n[v] || 0) + 1; });
      const top = Math.max(...Object.values(n));
      const best = Object.keys(n).filter((k) => n[k] === top);
      return best.length === 1 && top > 1 ? Number(best[0]) : null;
    };
    return solveBy([
      [/^Find the (mean|median|mode|range) of the data set: (.+)$/, (m) => {
        const a = nums(m[2]);
        if (m[1] === 'mean') return whole(sum(a) / a.length);
        if (m[1] === 'median') return medianOf(a);
        if (m[1] === 'range') return Math.max(...a) - Math.min(...a);
        if (modeOf(a) === null) throw new Error('no single mode');
        return modeOf(a);
      }],
      [/^The mean of five test scores is (\d+)\. Four of the scores are (.+)\. What is the fifth score\?$/, (m) => 5 * m[1] - sum(nums(m[2]))],
      [/^The data set (.+) has a mean of (\d+)\. By how much does the mean increase when a sixth value, (\d+), is added\?$/, (m) => {
        const a = nums(m[1]);
        if (sum(a) / a.length !== Number(m[2])) throw new Error('stated mean is wrong');
        return whole((sum(a) + Number(m[3])) / (a.length + 1) - sum(a) / a.length);
      }],
      // skewed by one extreme value → report the median
      [/thousands of dollars: (.+)\. Which measure best describes a typical price/, (m) => {
        const a = nums(m[1]);
        const mean = sum(a) / a.length;
        if (a.filter((v) => v < mean).length < a.length - 1) throw new Error('not skewed by an outlier');
        return only(o, (opt) => /^The median/.test(opt), 'median');
      }],
      [/^Ten students took a quiz\. (\d+) scored (\d+), (\d+) scored (\d+) and (\d+) scored (\d+)\./, (m) => {
        const c = [1, 3, 5].map((k) => Number(m[k])), v = [2, 4, 6].map((k) => Number(m[k]));
        if (sum(c) !== 10) throw new Error('not ten students');
        return String((c[0] * v[0] + c[1] * v[1] + c[2] * v[2]) / 10);
      }],
      [/^After (\d+) quizzes, a student's mean score is (\d+)\. What score on the next quiz will raise the mean to exactly (\d+)\?$/, (m) => (Number(m[1]) + 1) * m[3] - m[1] * m[2]],
      [/^The data set (.+) has a median of ([\d.]+)\. A seventh value, (\d+), is added\. What is the new median\?$/, (m) => {
        const a = nums(m[1]);
        if (medianOf(a) !== Number(m[2])) throw new Error('stated median is wrong');
        return medianOf([...a, Number(m[3])]);
      }],
      [/^For the data set (.+), which statement is true\?$/, (m) => {
        const a = nums(m[1]), mean = sum(a) / a.length, med = medianOf(a);
        const T = {
          'The mean is greater than the median': mean > med,
          'The mean is less than the median': mean < med,
          'The mean is equal to the median': mean === med,
          'The mean is equal to the mode': mean === modeOf(a),
        };
        return only(o, (opt) => { if (!(opt in T)) throw new Error(`unknown statement ${opt}`); return T[opt]; }, 'true statement');
      }],
    ], p, o);
  },

  'a1-data-displays': (p, o) => solveBy([
    [/^A frequency table of quiz scores reads: (.+)\. How many students scored (?:(\d+) or higher|lower than (\d+))\?$/, (m) => {
      const rows = [...m[1].matchAll(/score (\d+): (\d+) students?/g)].map((t) => [Number(t[1]), Number(t[2])]);
      return sum(rows.filter(([s]) => (m[2] ? s >= Number(m[2]) : s < Number(m[3]))).map((t) => t[1]));
    }],
    [new RegExp(`^A box plot of a data set has ${FIVE}\\. What is the (interquartile range|range) of the data\\?$`), (m) => {
      const f = five(m, 1);
      return m[6] === 'range' ? f[4] - f[0] : f[3] - f[1];
    }],
    // each of the four parts between the five numbers holds about a quarter of the data
    [new RegExp(`^A box plot of a large data set has ${FIVE}\\. About what percent of the data values are (greater than|less than|between) (\\d+)(?: and (\\d+))?\\?$`), (m) => {
      const f = five(m, 1);
      const lo = m[6] === 'less than' ? f[0] : Number(m[7]);
      const hi = m[6] === 'greater than' ? f[4] : m[6] === 'less than' ? Number(m[7]) : Number(m[8]);
      if (!f.includes(lo) || !f.includes(hi)) throw new Error('not a quartile');
      return 25 * [0, 1, 2, 3].filter((k) => f[k] >= lo && f[k + 1] <= hi).length;
    }],
    [/^A dot plot .* has (.+)\. What is the (mode|median)/, (m) => {
      const a = dots(m[1]);
      if (m[2] === 'median') return whole(medianOf(a));
      const n = {};
      a.forEach((v) => { n[v] = (n[v] || 0) + 1; });
      const top = Math.max(...Object.values(n));
      const best = Object.keys(n).filter((k) => n[k] === top);
      if (best.length !== 1) throw new Error('two modes');
      return best[0];
    }],
    [/^A teacher wants to (.+)\. Which display is the best choice\?$/, (m) => DISPLAY_FOR.find(([re]) => re.test(m[1]))[1]],
    [/^A histogram of test scores has these bars .*How many students scored at least (\d+)\?$/, (m) => sum(histogram(p).filter((b) => b.lo >= Number(m[1])).map((b) => b.n))],
    [/^A histogram of (\d+) test scores has these bars .*What percent of the students scored below (\d+)\?$/, (m) => {
      const b = histogram(p);
      if (sum(b.map((x) => x.n)) !== Number(m[1])) throw new Error('bars do not add to the total');
      return whole(100 * sum(b.filter((x) => x.hi < Number(m[2])).map((x) => x.n)) / m[1]);
    }],
    [/^A histogram of (\d+) test scores has these bars .*In which interval is the median score\?$/, (m) => {
      const b = histogram(p);
      const all = b.flatMap((x) => Array(x.n).fill(x.label));
      if (all.length !== Number(m[1]) || all.length % 2 === 0) throw new Error('count is off');
      return all[(all.length - 1) / 2];
    }],
    [/girls: (\d+) play a sport and (\d+) do not; boys: (\d+) play a sport and (\d+) do not\. (.+)$/, (m) => {
      const [gy, gn, by] = [1, 2, 3].map((k) => Number(m[k]));
      if (/^How many of the students surveyed play a sport/.test(m[5])) return gy + by;
      if (/^How many girls were surveyed/.test(m[5])) return gy + gn;
      if (/^What percent of the students who play a sport are girls/.test(m[5])) return whole(100 * gy / (gy + by));
      throw new Error('unknown two-way question');
    }],
    [new RegExp(`Class A: ${FIVE}\\. Class B: ${FIVE}\\. Which statement is true\\?$`), (m) => {
      const A = five(m, 1), B = five(m, 6);
      const T = {
        'Class A has the greater median': A[2] > B[2],
        'Class A has the greater range': A[4] - A[0] > B[4] - B[0],
        'Class A has the greater interquartile range': A[3] - A[1] > B[3] - B[1],
        'The two classes have the same interquartile range': A[3] - A[1] === B[3] - B[1],
      };
      return only(o, (opt) => { if (!(opt in T)) throw new Error(`unknown statement ${opt}`); return T[opt]; }, 'true statement');
    }],
  ], p, o),

  'a1-exponential-functions-basics': (p, o) => {
    const fits = (opt, xs, ys) => /^y = /.test(opt) && xs.every((x, k) => close(ev(opt.slice(4), { x }), ys[k]));
    return solveBy([
      [/^For f\(x\) = (.+), what is f\((−?\d+)\)\?$/, (m) => whole(ev(m[1], { x: N(m[2]) }))],
      [/^Which statement about y = (.+) is correct\?$/, (m) => {
        const a = ev(m[1], { x: 0 });
        return `The initial value is ${whole(a)} and the growth factor is ${whole(ev(m[1], { x: 1 }) / a)}`;
      }],
      [/^Which describes the function y = (.+)\?$/, (m) => {
        const factor = ev(m[1], { x: 1 }) / ev(m[1], { x: 0 });
        const key = only(o, (opt) => /^Exponential (growth|decay), because the base /.test(opt), 'names the base');
        if (/growth/.test(key) !== factor > 1) throw new Error('growth/decay is the wrong way round');
        if (!key.includes(`base ${String(factor)} is ${factor > 1 ? 'greater than 1' : 'between 0 and 1'}`)) throw new Error('wrong base or reason');
        return key;
      }],
      [/^A table of an exponential function has x: ([−\d, ]+) and y: ([−\d, ]+)\. Which equation matches the table\?$/, (m) => only(o, (opt) => fits(opt, nums(m[1]), nums(m[2])), 'fits the table')],
      [/(\d+)[^.]* (doubles|triples|is cut in half) every hour\. Which function/, (m) => {
        const f = { doubles: 2, triples: 3, 'is cut in half': 0.5 }[m[2]];
        return only(o, (opt) => fits(opt, [0, 1, 2, 3], [0, 1, 2, 3].map((x) => m[1] * f ** x)), 'fits the story');
      }],
      [/(grows by|loses) (\d+)% of? ?.*y = \d+ · b\^x\. What is the value of b\?$/, (m) => String(Number((m[1] === 'grows by' ? 1 + m[2] / 100 : 1 - m[2] / 100).toFixed(4)))],
      [/^Which table shows an exponential function\?$/, () => only(o, (opt) => {
        const t = opt.match(/^x: ([−\d, ]+) and y: ([−\d, ]+)$/);
        if (!constant(diffs(nums(t[1])))) throw new Error('x-values not evenly spaced');
        return constant(ratios(nums(t[2])));
      }, 'constant ratio')],
    ], p, o);
  },

  'a1-comparing-linear-exponential': (p, o) => {
    const firstAbove = (g, f) => {
      for (let x = 0; x < 60; x++) if (ev(g, { x }) > ev(f, { x })) return x;
      throw new Error('never passes');
    };
    return solveBy([
      [/^A table of values has x: ([−\d, ]+) and y: ([−\d, ]+)\. Is the function linear or exponential, and why\?$/, (m) => {
        const ys = nums(m[2]);
        if (constant(diffs(ys)) === constant(ratios(ys))) throw new Error('pattern not clear');
        return constant(diffs(ys))
          ? `Linear, because the y-values have a constant difference of ${diffs(ys)[0]}`
          : `Exponential, because the y-values have a constant ratio of ${ratios(ys)[0]}`;
      }],
      // a fixed amount each step is linear; a fixed percent each step is exponential
      [/^(.+)\. Which kind of model fits\?$/, (m) => `${/%/.test(m[1]) ? 'Exponential' : 'Linear'} ${/rises/.test(m[1]) ? 'growth' : 'decay'}`],
      [/^Let f\(x\) = (.+) and g\(x\) = (.+)\. What is g\((\d+)\) − f\(\3\)\?$/, (m) => whole(ev(m[2], { x: Number(m[3]) }) - ev(m[1], { x: Number(m[3]) }))],
      [/^A table has x: ([−\d, ]+) and y: ([−\d, ]+)\. The pattern in the y-values continues\. What is y when x = (\d+)\?$/, (m) => whole(extend(nums(m[1]), nums(m[2]), Number(m[3])))],
      [/^Let f\(x\) = (.+) and g\(x\) = (.+)\. What is the smallest whole number x for which g\(x\) is greater than f\(x\)\?$/, (m) => firstAbove(m[2], m[1])],
      [/^Plan A starts with \$(\d+) and adds \$(\d+) each week\. Plan B starts with \$(\d+) and doubles each week\. After (\d+) weeks/, (m) => {
        let A = Number(m[1]), B = Number(m[3]);
        for (let w = 0; w < Number(m[4]); w++) { A += Number(m[2]); B *= 2; }
        return B - A;
      }],
      [/^A table of values has x: ([−\d, ]+) and y: ([−\d, ]+)\. Which describes the function\?$/, (m) => {
        const ys = nums(m[2]), lin = constant(diffs(ys)), exp = constant(ratios(ys));
        if (lin && exp) return 'Both, because the differences and the ratios are constant';
        if (lin) return 'Linear, because the differences between y-values are constant';
        if (exp) return 'Exponential, because the ratios between y-values are constant';
        return 'Neither, because neither the differences nor the ratios are constant';
      }],
      [/For g\(x\) = (.+), by how much does g\(x\) increase from x = (\d+) to x = (\d+)\?$/, (m) => whole(ev(m[1], { x: Number(m[3]) }) - ev(m[1], { x: Number(m[2]) }))],
      [/^Table P has x: ([−\d, ]+) and y: ([−\d, ]+)\. Table Q has x: ([−\d, ]+) and y: ([−\d, ]+)\. Both patterns continue\. At x = (\d+),/, (m) => whole(extend(nums(m[3]), nums(m[4]), Number(m[5])) - extend(nums(m[1]), nums(m[2]), Number(m[5])))],
      [/^As x becomes very large, which function eventually has the greatest values\?$/, () => only(o, (opt) => [300, 600, 900].every((x) => {
        const mine = ev(opt.slice(4), { x });
        return o.every((other) => other === opt || ev(other.slice(4), { x }) < mine);
      }), 'greatest in the long run')],
      [/^A table of values has x: ([−\d, ]+) and y: ([−\d, ]+)\. Which describes the pattern\?$/, (m) => {
        const ys = nums(m[2]);
        if (!constant(ratios(ys)) || constant(diffs(ys))) throw new Error('not exponential');
        return `Exponential, with a growth factor of ${ratios(ys)[0]}`;
      }],
    ], p, o);
  },
};

// ── the tests ──────────────────────────────────────────────────────────────

describe('Algebra 1 course-level items', () => {
  test('twelve items a skill, four at each of three levels', () => {
    expect(bank.TEMPLATES).toHaveLength(12);
    for (const [skill, items] of Object.entries(ITEMS)) {
      expect([skill, items.length]).toEqual([skill, 12]);
      for (const d of [2, 3, 4]) expect([skill, d, items.filter((i) => i.difficulty === d).length]).toEqual([skill, d, 4]);
    }
  });

  test('every skill id is the course skill behind the a1- prefix', () => {
    expect(bank.COURSE_ID).toBe('algebra-1');
    for (const t of bank.TEMPLATES) expect(t.skillId).toBe(`a1-${t.courseSkill}`);
  });

  test('every template has a re-solver', () => {
    for (const t of bank.TEMPLATES) expect(typeof RESOLVE[t.skillId]).toBe('function');
    expect(Object.keys(RESOLVE).sort()).toEqual(bank.TEMPLATES.map((t) => t.skillId).sort());
  });

  test('the builder accepts every item', () => {
    expect(validate(ALL)).toEqual([]);
  });

  test.each(ALL.map((it) => [it.problemId, it]))('%s re-solves from its own text', (_id, item) => {
    const options = (item.options || []).map((o) => o.text);
    const expected = String(RESOLVE[item.skillId](item.prompt, options));
    expect(item.answer.value).toBe(expected);
    if (item.options) {
      const keyed = item.options.find((o) => o.label === item.correctOption);
      expect(keyed.text).toBe(expected);
    }
  });

  test('a typed answer is one number or fraction; anything else is multiple choice', () => {
    for (const it of ALL) {
      if (it.answerType === 'constructed-response') expect(it.answer.value).toMatch(/^-?\d+(\.\d{1,4})?$|^-?\d+\/\d+$/);
      else expect(it.options).toHaveLength(4);
    }
  });

  test('a typed fraction is in lowest terms and is asked for as a fraction', () => {
    const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
    for (const it of ALL) {
      const m = it.answerType === 'constructed-response' && it.answer.value.match(/^-?(\d+)\/(\d+)$/);
      if (m) expect([it.problemId, gcd(Number(m[1]), Number(m[2]))]).toEqual([it.problemId, 1]);
    }
  });

  test('numeric choices of one item never share a value', () => {
    for (const it of ALL) {
      if (!it.options) continue;
      const values = [];
      for (const o of it.options) {
        let v;
        try { v = ev(o.text); } catch { v = null; }
        if (v !== null && Number.isFinite(v)) values.push(v);
      }
      for (let a = 0; a < values.length; a++) for (let b = a + 1; b < values.length; b++) expect([it.problemId, close(values[a], values[b])]).toEqual([it.problemId, false]);
    }
  });

  test('prompts print the real minus sign, never a hyphen before a number', () => {
    for (const it of ALL) {
      expect([it.problemId, /(^|[\s(=])-\d/.test(it.prompt)]).toEqual([it.problemId, false]);
      for (const o of it.options || []) expect([it.problemId, /(^|[\s(=])-\d/.test(o.text)]).toEqual([it.problemId, false]);
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

  test('the evaluator reads printed algebra the way a student does', () => {
    expect(ev('−x² + 2x + 5', { x: -3 })).toBe(-10);                 // −x² is −(x²)
    expect(ev('(−3x^4)^2', { x: 2 })).toBe(2304);
    expect(ev('y^6/(8x^6)', { x: 1, y: 2 })).toBe(8);
    expect(ev('2x^4/y^3', { x: 2, y: 2 })).toBe(4);
    expect(ev('(2^2 · 2^(−3)) / 2^2')).toBe(0.125);
    expect(ev('5 · (1/2)^x', { x: -2 })).toBe(20);
    expect(ev('(−7 + √73)/4')).toBeCloseTo((-7 + Math.sqrt(73)) / 4);
    expect(ev('(−6 − √(6² − 4(4)(−1))) / (2(4))')).toBeCloseTo((-6 - Math.sqrt(52)) / 8);
    expect(ev('−4 + 2√5')).toBeCloseTo(-4 + 2 * Math.sqrt(5));
    expect(ev('n/5 − 3', { n: 20 })).toBe(1);
  });
});
