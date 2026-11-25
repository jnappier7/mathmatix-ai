/**
 * Course-level check items, Algebra 2 (part A) — every answer RE-SOLVED from
 * the printed question.
 *
 * Nothing here calls the templates' own maths. The test READS a prompt the way
 * a student does: a small parser turns printed algebra ("2x³ − 5x² + x − 3",
 * "3/(x − 2) = 5/(x + 4)", "−(1/2)(x + 3)² + 5") into something that can be
 * evaluated or expanded, matrices are read out of the [[a, b], [c, d]] text,
 * and the answer is then worked a second way with rules typed by hand below
 * (ad − bc, b² − 4ac, long division, a brute-force search for the roots of a
 * rational equation, n!/(n − r)! …). For multiple choice the right option is
 * found by testing every option against the prompt, and exactly one may pass.
 */

const { expand, validate } = require('../../scripts/buildCourseLevelItems');
const bank = require('../../scripts/lib/courseLevelAlgebra2A');

const ITEMS = {};
for (const t of bank.TEMPLATES) ITEMS[t.skillId] = expand(t, bank.GB);
const ALL = Object.values(ITEMS).flat();

// ── reading printed algebra ────────────────────────────────────────────────

const SUPS = { '²': 2, '³': 3, '⁴': 4, '⁵': 5, '⁶': 6, '⁷': 7 };

function tokenize(text) {
  const out = [];
  const s = String(text).replace(/[−–]/g, '-').replace(/\s+/g, '');
  for (let i = 0; i < s.length;) {
    const ch = s[i];
    if (/\d/.test(ch)) {
      let j = i;
      while (j < s.length && /[\d.]/.test(s[j])) j++;
      out.push({ t: 'num', v: Number(s.slice(i, j)) });
      i = j;
    } else if (/[a-z]/i.test(ch)) { out.push({ t: 'id', v: ch }); i++; }
    else if (SUPS[ch]) { out.push({ t: '^', v: SUPS[ch] }); i++; }
    else if ('()+-*/'.includes(ch)) { out.push({ t: ch }); i++; }
    else throw new Error(`cannot read "${ch}" in: ${text}`);
  }
  return out;
}

/** Printed algebra → a tree. −x² is −(x²); "3(x + 1)" and "(x − 1)(x + 2)" multiply. */
function parse(text) {
  const toks = tokenize(text);
  let i = 0;
  const peek = () => toks[i] || { t: 'end' };
  const startsAtom = () => ['num', 'id', '('].includes(peek().t);
  function atom() {
    const tk = toks[i++];
    if (!tk) throw new Error(`ran out of input: ${text}`);
    if (tk.t === 'num') return { k: 'num', v: tk.v };
    if (tk.t === 'id') return { k: 'var', v: tk.v };
    if (tk.t === '(') {
      const e = expr();
      if (peek().t !== ')') throw new Error(`missing ) in: ${text}`);
      i++;
      return e;
    }
    throw new Error(`unexpected ${tk.t} in: ${text}`);
  }
  function power() {
    let base = atom();
    while (peek().t === '^') base = { k: 'pow', a: base, n: toks[i++].v };
    return base;
  }
  function unary() {
    if (peek().t === '-') { i++; return { k: 'neg', a: unary() }; }
    return power();
  }
  function term() {
    let left = unary();
    for (;;) {
      if (peek().t === '*') { i++; left = { k: 'mul', a: left, b: unary() }; }
      else if (peek().t === '/') { i++; left = { k: 'div', a: left, b: unary() }; }
      else if (startsAtom()) left = { k: 'mul', a: left, b: power() };
      else return left;
    }
  }
  function expr() {
    let left = term();
    while (peek().t === '+' || peek().t === '-') {
      const op = toks[i++].t;
      const right = term();
      left = { k: op === '+' ? 'add' : 'sub', a: left, b: right };
    }
    return left;
  }
  const tree = expr();
  if (i !== toks.length) throw new Error(`could not read all of: ${text}`);
  return tree;
}

/** The value of printed algebra at given values of its letters. */
function ev(text, env = {}) {
  const go = (nd) => {
    switch (nd.k) {
      case 'num': return nd.v;
      case 'var': if (!(nd.v in env)) throw new Error(`no value for ${nd.v} in ${text}`); return env[nd.v];
      case 'neg': return -go(nd.a);
      case 'pow': return go(nd.a) ** nd.n;
      case 'add': return go(nd.a) + go(nd.b);
      case 'sub': return go(nd.a) - go(nd.b);
      case 'mul': return go(nd.a) * go(nd.b);
      case 'div': return go(nd.a) / go(nd.b);
      default: throw new Error('bad node');
    }
  };
  return go(typeof text === 'string' ? parse(text) : text);
}

/** Printed algebra in x, expanded: coefficients from the constant up. */
function poly(text) {
  const trim = (p) => { const q = p.slice(); while (q.length > 1 && Math.abs(q[q.length - 1]) < 1e-9) q.pop(); return q; };
  const add = (p, q, s = 1) => trim(Array.from({ length: Math.max(p.length, q.length) }, (_, i) => (p[i] || 0) + s * (q[i] || 0)));
  const mul = (p, q) => {
    const out = new Array(p.length + q.length - 1).fill(0);
    p.forEach((a, i) => q.forEach((b, j) => { out[i + j] += a * b; }));
    return trim(out);
  };
  const go = (nd) => {
    switch (nd.k) {
      case 'num': return [nd.v];
      case 'var': if (nd.v !== 'x') throw new Error(`unexpected letter ${nd.v} in ${text}`); return [0, 1];
      case 'neg': return go(nd.a).map((v) => -v);
      case 'pow': { let out = [1]; const b = go(nd.a); for (let i = 0; i < nd.n; i++) out = mul(out, b); return out; }
      case 'add': return add(go(nd.a), go(nd.b));
      case 'sub': return add(go(nd.a), go(nd.b), -1);
      case 'mul': return mul(go(nd.a), go(nd.b));
      case 'div': { const d = go(nd.b); if (d.length !== 1) throw new Error(`division by a polynomial in ${text}`); return go(nd.a).map((v) => v / d[0]); }
      default: throw new Error('bad node');
    }
  };
  return go(parse(text)).map((v) => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v));
}
const samePoly = (p, q) => p.length === q.length && p.every((v, i) => Math.abs(v - q[i]) < 1e-9);
/** "L = R" as the polynomial L − R. */
function eqPoly(eq) {
  const [l, rhs] = eq.split(' = ');
  const p = poly(l), q = poly(rhs);
  return Array.from({ length: Math.max(p.length, q.length) }, (_, i) => (p[i] || 0) - (q[i] || 0));
}

// ── a reader's toolkit ─────────────────────────────────────────────────────

const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const whole = (x) => {
  if (Math.abs(x - Math.round(x)) > 1e-7) throw new Error(`expected a whole number, got ${x}`);
  return Math.round(x);
};
/** A fraction the way a student types it: "7/3", "-7/3", "4". */
function frac(nu, de) {
  let a = whole(nu), b = whole(de);
  if (b === 0) throw new Error('zero denominator');
  if (b < 0) { a = -a; b = -b; }
  const k = gcd(Math.abs(a), b) || 1;
  return b / k === 1 ? String(a / k) : `${a / k}/${b / k}`;
}
/** A number as the page prints it (with the real minus sign). */
const U = (v) => String(v).replace('-', '−');
const N = (s) => Number(String(s).replace('−', '-'));
const fact = (k) => (k <= 1 ? 1 : k * fact(k - 1));
const perm = (a, b) => fact(a) / fact(a - b);
const comb = (a, b) => perm(a, b) / fact(b);

/** A polynomial as a textbook prints it, highest power first. */
function fmtPoly(low) {
  let out = '';
  for (let d = low.length - 1; d >= 0; d--) {
    const c = low[d];
    if (c === 0) continue;
    const mag = Math.abs(c);
    const body = d === 0 ? String(mag) : `${mag === 1 ? '' : mag}x${d > 1 ? Object.keys(SUPS).find((s) => SUPS[s] === d) : ''}`;
    out += out === '' ? `${c < 0 ? '−' : ''}${body}` : ` ${c < 0 ? '−' : '+'} ${body}`;
  }
  return out || '0';
}

/** The one option that passes a test; more or fewer than one is an error. */
function only(options, test, what) {
  const hits = options.filter((o) => { try { return test(o); } catch { return false; } });
  if (hits.length !== 1) throw new Error(`${hits.length} options pass (${what}): ${options.join(' | ')}`);
  return hits[0];
}

/** Run the first rule whose pattern matches. */
function solveBy(rules, prompt, options) {
  for (const [re, fn] of rules) {
    const m = prompt.match(re);
    if (m) return String(fn(m, options));
  }
  throw new Error(`no re-solver rule matches: ${prompt}`);
}

/** Long division of polynomials (coefficients from the constant up). */
function divide(num, den) {
  const r = num.slice(), q = new Array(Math.max(num.length - den.length + 1, 1)).fill(0);
  for (let d = num.length - den.length; d >= 0; d--) {
    const c = r[d + den.length - 1] / den[den.length - 1];
    q[d] = c;
    den.forEach((v, i) => { r[d + i] -= c * v; });
  }
  const tidy = (p) => p.map((v) => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v));
  return { q: tidy(q), r: tidy(r.slice(0, den.length - 1)) };
}
const at = (low, x) => low.reduce((s, c, i) => s + c * x ** i, 0);

// Lines: "3x − 4y = 12", "y + 5 = −2(x + 1)", "y = −(3/2)x − 4" → A x + B y + C = 0.
function line(eq, env = {}) {
  const [l, r] = eq.split(' = ');
  const g = (x, y) => ev(l, { ...env, x, y }) - ev(r, { ...env, x, y });
  const C = g(0, 0);
  return { A: g(1, 0) - C, B: g(0, 1) - C, C };
}
const slopeOf = (ln) => -ln.A / ln.B;
const point = (s) => s.match(/\((−?\d+), (−?\d+)\)/).slice(1).map(N);
const points = (s) => [...s.matchAll(/\((−?\d+), (−?\d+)\)/g)].map((m) => [N(m[1]), N(m[2])]);
const on = (ln, [x, y]) => Math.abs(ln.A * x + ln.B * y + ln.C) < 1e-9;

// Matrices: "[[1, −2], [3, 4]]" → rows of numbers (letters are kept as letters).
const MAT_INTRO = /^Matrices are written row by row, so \[\[1, 2\], \[3, 4\]\] has first row 1, 2 and second row 3, 4\. /;
const MAT_RE = /\[\[[^\]]*\](?:, \[[^\]]*\])*\]/g;
const cell = (s) => {
  const t = s.trim().replace('−', '-');
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d+\/\d+$/.test(t)) { const [a, b] = t.split('/').map(Number); return a / b; }
  return t;
};
const readM = (s) => s.slice(2, -2).split('], [').map((row) => row.split(',').map(cell));
const mats = (s) => (s.match(MAT_RE) || []).map(readM);
const showM = (m) => `[${m.map((row) => `[${row.map(U).join(', ')}]`).join(', ')}]`;
const times = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
const det2 = (A) => A[0][0] * A[1][1] - A[0][1] * A[1][0];
const rc = (p) => p.match(/row (\d), column (\d)/).slice(1).map((v) => Number(v) - 1);
/** "(1/10)[[7, 3], [−1, 1]]", "10[[…]]", "[[1/18, −1/6], …]" → a numeric matrix. */
function readScaled(text) {
  const m = text.match(/^(?:\(1\/(\d+)\)|(\d+))?(\[\[.*\]\])$/);
  const k = m[1] ? 1 / Number(m[1]) : m[2] ? Number(m[2]) : 1;
  return readM(m[3]).map((row) => row.map((v) => v * k));
}
const isIdentity = (P) => P.every((row, i) => row.every((v, j) => Math.abs(v - (i === j ? 1 : 0)) < 1e-9));

// Equations in x: every rational solution with a small denominator, by search.
function sides(eq) {
  const [l, r] = eq.split(' = ');
  const L = parse(l), R = parse(r);
  return (x) => ev(L, { x }) - ev(R, { x });
}
function rationalRoots(eq) {
  const g = sides(eq);
  const found = [];
  for (let q = 1; q <= 24; q++) {
    for (let p = -480; p <= 480; p++) {
      if (gcd(Math.abs(p), q) !== 1) continue;
      const v = g(p / q);
      if (Number.isFinite(v) && Math.abs(v) < 1e-9) found.push([p, q]);
    }
  }
  return found.sort((a, b) => a[0] / a[1] - b[0] / b[1]);
}
/** Whole numbers at which a side of the equation is undefined. */
function excluded(eq) {
  const g = sides(eq);
  const out = [];
  for (let x = -30; x <= 30; x++) if (!Number.isFinite(g(x))) out.push(x);
  return out;
}
const theEquation = (p) => p.match(/equation: (.+?)\. (?:What|Which|Clearing|It has|Check|Give)/)[1];

/** Roots of a quadratic with rational roots, as [numerator, denominator] pairs, smaller first. */
function quadRoots([c, b, a]) {
  const D = b * b - 4 * a * c;
  const s = whole(Math.sqrt(D));
  const pair = [[-b - s, 2 * a], [-b + s, 2 * a]];
  return pair.sort((u, v) => u[0] / u[1] - v[0] / v[1]);
}

// ── the re-solvers ─────────────────────────────────────────────────────────

const TYPES = { pos: 'Two distinct real solutions', zero: 'Exactly one real solution (a repeated root)', neg: 'Two complex (non-real) solutions' };
const typeOf = (D) => (D > 0 ? TYPES.pos : D === 0 ? TYPES.zero : TYPES.neg);
const disc = ([c, b, a]) => b * b - 4 * a * c;

const side = (h) => (h > 0 ? `right ${h}` : `left ${-h}`);
const lift = (k) => (k > 0 ? `up ${k}` : `down ${-k}`);
const units = (v) => (Math.abs(v) === 1 ? 'unit' : 'units');
/** a, h, k of a parabola from its expanded form. */
function vertexOf(text) {
  const [c, b, a] = poly(text);
  const h = -b / (2 * a);
  return { a, h, k: c - a * h * h };
}
const fnOf = (opt) => opt.replace(/^g\(x\) = /, '');
/** "shifted right 3 units and down 1 unit" → [3, −1]. */
function shiftIn(p) {
  const m = p.match(/shifted (right|left) (\d+) units? and (up|down) (\d+) units?/);
  return [m[1] === 'right' ? Number(m[2]) : -Number(m[2]), m[3] === 'up' ? Number(m[4]) : -Number(m[4])];
}
function stretchIn(p) {
  const a = Number(p.match(/stretched vertically by a factor of (\d+)/)[1]);
  return /reflected over the x-axis, stretched/.test(p) ? -a : a;
}

const COIN = { nickels: 5, dimes: 10, quarters: 25 };

const RESOLVE = {
  'a2-graphing-lines-review': (item, p, options) => solveBy([
    [/^What is the slope of the line through the points/, () => { const [a, b] = points(p); return frac(b[1] - a[1], b[0] - a[0]); }],
    [/^What is the slope of the line (.+)\?$/, (m) => { const l = line(m[1]); return frac(-l.A, l.B); }],
    [/^A line has the equation (.+)\. What is its y-intercept/, (m) => { const l = line(m[1]); return frac(-l.C, l.B); }],
    [/^What is the x-intercept of the line (.+)\? Give/, (m) => { const l = line(m[1]); return frac(-l.C, l.A); }],
    [/^Which is an equation of the line through the points/, () => {
      const [a, b] = points(p);
      return only(options, (o) => { const l = line(o); return on(l, a) && on(l, b); }, 'through both points');
    }],
    [/^What is the slope of a line perpendicular to the line (.+)\?$/, (m) => { const l = line(m[1]); return frac(l.B, l.A); }],
    [/^A line is parallel to (.+) and passes through the point .* y-intercept/, (m) => {
      const l = line(m[1]), [x, y] = point(p.slice(p.indexOf('point')));
      return frac(y * l.B + l.A * x, l.B);                       // y − slope·x, slope = −A/B
    }],
    [/^Which line is perpendicular to (.+) and passes through the point/, (m) => {
      const given = slopeOf(line(m[1])), pnt = point(p.slice(p.indexOf('point')));
      return only(options, (o) => { const l = line(o); return Math.abs(slopeOf(l) * given + 1) < 1e-9 && on(l, pnt); }, 'perpendicular through the point');
    }],
    [/^A line passes through the points .* x-intercept/, () => {
      const [[x1, y1], [x2, y2]] = points(p);
      return frac(x1 * (y2 - y1) - y1 * (x2 - x1), y2 - y1);
    }],
    [/^For what value of k is the line (.+) (parallel|perpendicular) to the line (.+)\?$/, (m) => {
      const l0 = line(m[1], { k: 0 }), l1 = line(m[1], { k: 1 }), other = line(m[3]);
      expect(l1.A - l0.A).toBe(1);                               // the x-coefficient is k itself
      // slope −k/B must equal the other slope (parallel) or its negative reciprocal.
      return m[2] === 'parallel' ? frac(other.A * l0.B, other.B) : frac(-other.B * l0.B, other.A);
    }],
  ], p, options),

  'a2-systems-modeling': (item, p, options) => solveBy([
    [/sold (\d+) tickets in all\. Adult tickets cost \$(\d+) each and student tickets cost \$(\d+) each, and ticket sales totalled \$(\d+)/,
      (m) => { const [n, pa, ps, t] = m.slice(1).map(Number); return whole((t - ps * n) / (pa - ps)); }],
    [/sold (\d+) tickets for a total of \$(\d+)\. Adult tickets cost \$(\d+) and student tickets cost \$(\d+)/,
      (m) => `a + s = ${m[1]} and ${m[3]}a + ${m[4]}s = ${m[2]}`],
    [/holds (\d+) coins, all (\w+) and (\w+)\. Together they are worth \$([\d.]+)\. How many (\w+)/, (m) => {
      const n = Number(m[1]), cents = Math.round(Number(m[4]) * 100), asked = COIN[m[5]];
      const otherCoin = COIN[m[2]] === asked ? COIN[m[3]] : COIN[m[2]];
      return whole((cents - otherCoin * n) / (asked - otherCoin));
    }],
    [/\$(\d+) joining fee plus \$(\d+) per month\. Gym B charges a \$(\d+) joining fee plus \$(\d+) per month/,
      (m) => { const [f1, m1, f2, m2] = m.slice(1).map(Number); return whole((f1 - f2) / (m2 - m1)); }],
    [/mixes a (\d+)% acid solution with a (\d+)% acid solution to make (\d+) liters of a (\d+)% acid solution\. How many liters of the (\d+)%/, (m) => {
      const [c1, c2, L, c, asked] = m.slice(1).map(Number);
      expect(asked).toBe(c1);
      return whole(L * (c2 - c) / (c2 - c1));
    }],
    [/A (\d+)% salt solution is mixed with a (\d+)% salt solution to make (\d+) liters of a (\d+)% salt solution/, (m) => {
      const [c1, c2, L, c] = m.slice(1).map(Number);
      return `x + y = ${L} and ${c1 / 100}x + ${c2 / 100}y = ${Number((c * L / 100).toFixed(4))}`;
    }],
    [/travels (\d+) km downstream in (\d+) hours\. The return trip of (\d+) km upstream, against the same current, takes (\d+) hours\. What is the speed of the (boat in still water|current)/, (m) => {
      const [D, t1, D2, t2] = m.slice(1, 5).map(Number);
      expect(D2).toBe(D);
      const down = D / t1, up = D / t2;
      return whole(m[5] === 'current' ? (down - up) / 2 : (down + up) / 2);
    }],
    [/(\d+) (\w+) and (\d+) [\w ]+? cost \$(\d+), while (\d+) \w+ and (\d+) [\w ]+? cost \$(\d+)\..*one of the (\w+)\?$/, (m) => {
      const [a1, , b1, e, a2, b2, f] = [m[1], 0, m[3], m[4], m[5], m[6], m[7]].map(Number);
      expect(m[8]).toBe(m[2]);                                    // the question asks for the first item named
      const x = (e * b2 - f * b1) / (a1 * b2 - a2 * b1), y = (a1 * f - a2 * e) / (a1 * b2 - a2 * b1);
      whole(y);
      return whole(x);
    }],
    [/splits \$(\d+) between two accounts\. One pays (\d+)% simple interest per year and the other pays (\d+)% per year\..*earned \$(\d+) in interest altogether\. How many dollars were invested at (\d+)%/, (m) => {
      const [P, r1, r2, I, asked] = m.slice(1).map(Number);
      expect(asked).toBe(r1);
      return whole((r2 * P - 100 * I) / (r2 - r1));
    }],
    [/nuts that cost \$(\d+) per pound with raisins that cost \$(\d+) per pound to make (\d+) pounds of trail mix worth \$(\d+) per pound/,
      (m) => { const [a, b, W, c] = m.slice(1).map(Number); return whole(W * (c - b) / (a - b)); }],
    [/travels (\d+) km downstream in (\d+) hours and the same (\d+) km back upstream in (\d+) hours\. Let b/, (m) => {
      const good = `${m[2]}(b + c) = ${m[1]} and ${m[4]}(b − c) = ${m[3]}`;
      // The model must have a sensible answer: boat faster than a positive current.
      const down = m[1] / m[2], up = m[3] / m[4];
      expect((down - up) / 2).toBeGreaterThan(0);
      return good;
    }],
    [/sold (\d+) tickets and collected \$(\d+)\. Floor tickets cost \$(\d+) each and balcony tickets cost \$(\d+) each\. How many dollars/,
      (m) => { const [n, t, pf, pb] = m.slice(1).map(Number); return pf * whole((t - pb * n) / (pf - pb)); }],
  ], p, options),

  'a2-matrix-operations': (item, p, options) => {
    const [A, B] = mats(p);
    return solveBy([
      [/row \d, column \d of A \+ B\?/, () => { const [i, j] = rc(p); return A[i][j] + B[i][j]; }],
      [/Which matrix is A − B\?/, () => showM(A.map((row, i) => row.map((v, j) => v - B[i][j])))],
      [/row \d, column \d of (\d+)A \+ B\?/, (m) => { const [i, j] = rc(p); return Number(m[1]) * A[i][j] + B[i][j]; }],
      [/Matrix A has dimensions (\d) × (\d) .* matrix B has dimensions (\d) × (\d)\. What are the dimensions of the product AB/, (m) => {
        const [r1, c1, r2, c2] = m.slice(1).map(Number);
        return c1 === r2 ? `${r1} × ${c2}` : 'The product AB is not defined';
      }],
      [/row \d, column \d of the product AB\?/, () => { const [i, j] = rc(p); return times(A, B)[i][j]; }],
      [/Which matrix is the product AB\?/, () => showM(times(A, B))],
      [/Matrix A has dimensions (\d) × (\d) .* matrix B has dimensions (\d) × (\d)\. Which statement is true/, (m) => {
        const [r1, c1, r2, c2] = m.slice(1).map(Number);
        const ab = c1 === r2, ba = c2 === r1;
        if (ab && ba) return 'Both AB and BA are defined';
        if (ab) return 'AB is defined, but BA is not';
        if (ba) return 'BA is defined, but AB is not';
        return 'Neither AB nor BA is defined';
      }],
      [/row \d, column \d of (\d+)A − (\d+)B\?/, (m) => { const [i, j] = rc(p); return Number(m[1]) * A[i][j] - Number(m[2]) * B[i][j]; }],
      [/Which matrix is A² \(the product AA\)\?/, () => showM(times(A, A))],
      [/The entry in row (\d), column (\d) of the product AB is (−?\d+)\. What is the value of x\?/, (m) => {
        const i = Number(m[1]) - 1, j = Number(m[2]) - 1;
        const withX = (x) => times(A.map((row) => row.map((v) => (v === 'x' ? x : v))), B)[i][j];
        return whole((N(m[3]) - withX(0)) / (withX(1) - withX(0)));
      }],
      [/row \d, column \d of AB − BA\?/, () => { const [i, j] = rc(p); return times(A, B)[i][j] - times(B, A)[i][j]; }],
    ], p, options);
  },

  'a2-inverse-matrices': (item, p, options) => {
    const [A, B2, B3] = mats(p);
    return solveBy([
      [/^What is the determinant of the matrix/, () => det2(A)],
      [/^Does the matrix .* have an inverse\?/, () => (det2(A) === 0 ? 'No, because its determinant is 0' : `Yes, because its determinant is ${U(det2(A))}`)],
      [/^For what value of k does the matrix .* have no inverse\?/, () => { expect(A[0][0]).toBe('k'); return frac(A[0][1] * A[1][0], A[1][1]); }],
      [/^Which (?:matrix|expression) is the inverse of/, () => only(options, (o) => isIdentity(times(A, readScaled(o))), 'A times the option is the identity')],
      [/row \d, column \d of the inverse matrix A⁻¹\?/, () => {
        const [i, j] = rc(p), D = det2(A);
        const swapped = [[A[1][1], -A[0][1]], [-A[1][0], A[0][0]]];
        return frac(swapped[i][j], D);
      }],
      [/^For what value of k is the determinant of the matrix .* equal to (−?\d+)\?/, (m) => { expect(A[0][0]).toBe('k'); return frac(N(m[1]) + A[0][1] * A[1][0], A[1][1]); }],
      [/^The system (.+) and (.+) is written as the matrix equation AX = B, with A = .* what is the value of x\?/, (m) => {
        // Read the system itself, check the matrices say the same thing, then Cramer's rule.
        const l1 = line(m[1]), l2 = line(m[2]);
        expect([[l1.A, l1.B], [l2.A, l2.B]]).toEqual(A);
        expect([[-l1.C], [-l2.C]]).toEqual(B3);
        expect(B2).toEqual([['x'], ['y']]);
        return frac(-l1.C * l2.B - l1.B * -l2.C, det2(A));
      }],
      [/The inverse of A is A⁻¹ = .* What is the value of y\?/, () => {
        const [, inv, rhs] = mats(p);                             // X, A⁻¹, B
        return times(inv, rhs)[1][0];
      }],
      [/^The inverse of a matrix A is A⁻¹ = .* row \d, column \d of A\?/, () => {
        const [i, j] = rc(p), D = det2(A);
        return frac([[A[1][1], -A[0][1]], [-A[1][0], A[0][0]]][i][j], D);
      }],
    ], p, options);
  },

  'a2-quadratic-discriminant': (item, p, options) => solveBy([
    [/^What is the value of the discriminant of (?:the equation )?(.+? = .+?)(?:\?|, once)/, (m) => disc(eqPoly(m[1]))],
    [/^How many solutions, and of what type, does (?:the equation )?(.+ = .+) have\?/, (m) => typeOf(disc(eqPoly(m[1])))],
    [/^For what value of k does the equation (.+) \+ k = 0 have exactly one real solution/, (m) => { const [, b, a] = poly(m[1]); return frac(b * b, 4 * a); }],
    [/^The coefficients of (.+ = 0) are integers\. Which describes its solutions/, (m) => {
      const D = disc(eqPoly(m[1]));
      if (D < 0) return 'Two complex (non-real) solutions';
      if (D === 0) return 'One rational solution (a repeated root)';
      return Number.isInteger(Math.sqrt(D)) ? 'Two rational solutions' : 'Two irrational solutions';
    }],
    [/^For what positive value of k does the equation (\d+)x² \+ kx \+ (\d+) = 0 have exactly one/, (m) => whole(Math.sqrt(4 * m[1] * m[2]))],
    [/^For which values of k does the equation (.+) \+ k = 0 have (two distinct real solutions|no real solutions)/, (m) => {
      const [, b, a] = poly(m[1]);
      // b² − 4ak > 0 ⇔ k < b²/4a (a > 0).
      expect(a).toBeGreaterThan(0);
      const edge = frac(b * b, 4 * a);
      const good = m[2].startsWith('two') ? `k < ${edge}` : `k > ${edge}`;
      for (const o of options) expect(o).toMatch(/^k [<>] \d+$/);
      return good;
    }],
    [/^For what value of k does the equation kx² (.+) = 0 have exactly one/, (m) => { const [c, b] = poly(m[1]); return frac(b * b, 4 * c); }],
    [/^For what value of k does the equation (.+) = k have exactly one/, (m) => { const [c, b, a] = poly(m[1]); return frac(4 * a * c - b * b, 4 * a); }],
  ], p, options),

  'a2-quadratic-transformations': (item, p, options) => solveBy([
    [/^The graph of g\(x\) = (.+) is a (?:transformation|translation) of the graph of f\(x\) = x²\. Which describes it/, (m) => {
      const v = vertexOf(m[1]);
      expect(v.a).toBe(1);
      return `Shifted ${side(v.h)} ${units(v.h)} and ${lift(v.k)} ${units(v.k)}`;
    }],
    [/^The graph of f\(x\) = x² is (.*)shifted .* Which function is the result/, (m) => {
      const [h, k] = shiftIn(p), a = /stretched/.test(m[1]) ? stretchIn(p) : 1;
      return only(options, (o) => { const v = vertexOf(fnOf(o)); return v.a === a && v.h === h && v.k === k; }, 'has that a, h and k');
    }],
    [/^What is the vertex of the graph of g\(x\) = (.+)\?$/, (m) => { const v = vertexOf(m[1]); return `(${U(v.h)}, ${U(v.k)})`; }],
    [/^How does the graph of g\(x\) = (.+) compare/, (m) => {
      const { a } = vertexOf(m[1]);
      return `Opens ${a < 0 ? 'downward' : 'upward'} and is ${Math.abs(a) > 1 ? 'narrower' : 'wider'} than the graph of f`;
    }],
    [/^Which describes how the graph of g\(x\) = (.+) is obtained/, (m) => {
      const v = vertexOf(m[1]), size = Math.abs(v.a);
      const scale = size > 1 ? `stretch by a factor of ${whole(size)}` : `compression by a factor of 1/${whole(1 / size)}`;
      return `${v.a < 0 ? 'Reflection over the x-axis, vertical' : 'Vertical'} ${scale}, shift ${side(v.h)} and ${lift(v.k)}`;
    }],
    [/to give the graph of g\. What is g\((−?\d+)\)\?/, (m) => { const [h, k] = shiftIn(p); return stretchIn(p) * (N(m[1]) - h) ** 2 + k; }],
    [/^Which is true of the function g\(x\) = (.+)\?$/, (m) => { const v = vertexOf(m[1]); return `It has a ${v.a < 0 ? 'maximum' : 'minimum'} value of ${U(v.k)}`; }],
    [/to give the graph of g\. What is the y-intercept of g/, () => { const [h, k] = shiftIn(p); return stretchIn(p) * h * h + k; }],
    [/Its vertex is .* and it passes through the point .* Which function has this graph/, () => {
      const [[h, k], [px, py]] = points(p);
      return only(options, (o) => { const v = vertexOf(fnOf(o)); return v.h === h && v.k === k && ev(fnOf(o), { x: px }) === py; }, 'has the vertex and the point');
    }],
    [/^The graph of g\(x\) = (.+) is reflected over the x-axis and then shifted (up|down) (\d+) units?\. What is the vertex/, (m) => {
      const v = vertexOf(m[1]);
      // (x, y) → (x, −y), then y moves by the shift.
      return `(${U(v.h)}, ${U(-v.k + (m[2] === 'up' ? 1 : -1) * Number(m[3]))})`;
    }],
  ], p, options),

  'a2-polynomial-operations': (item, p, options) => solveBy([
    [/^(?:Add|Multiply) and simplify: (.+)\.$/, (m) => {
      const want = poly(m[1]);
      const hit = only(options, (o) => samePoly(poly(o), want), 'equals the expression');
      expect(hit).toBe(fmtPoly(want));                            // and it is written simplified, in standard form
      return hit;
    }],
    [/^What is the coefficient of x(²|³)? in the simplified form of (.+)\?$/, (m) => poly(m[2])[m[1] ? SUPS[m[1]] : 1] || 0],
    [/^What is the constant term of the simplified form of (.+)\?$/, (m) => poly(m[1])[0]],
    [/^What is the degree of the product (.+)\?$/, (m) => poly(m[1]).length - 1],
    [/^What is the leading coefficient of the product (.+)\?$/, (m) => poly(m[1]).slice(-1)[0]],
  ], p, options),

  'a2-polynomial-division': (item, p, options) => solveBy([
    [/^What is the remainder when (.+) is divided by \((.+)\)\?$/, (m) => divide(poly(m[1]), poly(m[2])).r[0]],
    [/^Divide: \((.+)\) ÷ \((.+)\)\. Which is the quotient\?$/, (m) => {
      const { q, r } = divide(poly(m[1]), poly(m[2]));
      expect(r.every((v) => v === 0)).toBe(true);
      only(options, (o) => samePoly(poly(o), q), 'is the quotient');
      return fmtPoly(q);
    }],
    [/^Divide: \((.+)\) ÷ \((.+)\)\. Which is the result\?$/, (m) => {
      const { q, r } = divide(poly(m[1]), poly(m[2]));
      const dividend = parse(m[1]);
      // Only one option may equal the dividend over the divisor, as a function.
      const hit = only(options, (o) => [2.5, -1.5, 7].every((x) => Math.abs(ev(o, { x }) - ev(dividend, { x }) / ev(m[2], { x })) < 1e-9), 'equals the quotient of the two');
      expect(hit).toBe(`${fmtPoly(q)} ${r[0] < 0 ? '−' : '+'} ${Math.abs(r[0])}/(${m[2]})`);
      return hit;
    }],
    [/^When (.+) is divided by \((.+)\), what is the coefficient of x in the quotient\?$/, (m) => divide(poly(m[1]), poly(m[2])).q[1]],
    [/^When (.+) \+ k is divided by \((.+)\), the remainder is 0\. What is the value of k\?$/, (m) => {
      const root = -poly(m[2])[0];
      return -at(poly(m[1]), root);                               // Remainder Theorem: f(root) + k = 0
    }],
    [/^When (.+) is divided by \((.+)\), the remainder is (−?\d+)\. What is the value of k\?$/, (m) => {
      const root = -poly(m[2])[0], f = (k) => ev(m[1], { x: root, k });
      return whole((N(m[3]) - f(0)) / (f(1) - f(0)));
    }],
  ], p, options),

  'a2-advanced-factoring': (item, p, options) => solveBy([
    [/^Factor completely(?: by grouping)?: (.+)\.$/, (m) => {
      const want = poly(m[1]);
      const hit = only(options, (o) => samePoly(poly(o), want), 'multiplies back to the polynomial');
      // "Completely": every bracket is linear, or a quadratic with no real roots,
      // and no bracket hides a common whole-number factor.
      for (const [, inner] of hit.matchAll(/\(([^()]+)\)/g)) {
        const f = poly(inner);
        expect(f.length).toBeLessThanOrEqual(3);
        if (f.length === 3) expect(disc(f)).toBeLessThan(0);
        expect(f.reduce((s, v) => gcd(s, Math.abs(v)), 0)).toBe(1);
      }
      return hit;
    }],
  ], p, options),

  'a2-rational-equations': (item, p, options) => {
    const eq = theEquation(p);
    const roots = rationalRoots(eq);
    const bad = excluded(eq);
    /** A value the cleared equation allows but the original does not. */
    const extraneous = bad.filter((e) => {
      const g = sides(eq);
      const cleared = (x) => g(x) * bad.reduce((s, b) => s * (x - b), 1);
      return Math.abs(cleared(e + 1e-7)) < 1e-4 && Math.abs(cleared(e - 1e-7)) < 1e-4;
    });
    return solveBy([
      [/What is the value of x\?/, () => { expect(roots).toHaveLength(1); return frac(...roots[0]); }],
      [/Which values of x can never be solutions/, () => {
        expect(bad).toHaveLength(2);
        const [neg, pos] = bad;
        return `x = ${pos} and x = ${U(neg)}`;
      }],
      [/one of them is extraneous\. What is the solution of the equation\?/, () => {
        expect(roots).toHaveLength(1);
        expect(extraneous).toHaveLength(1);
        return frac(...roots[0]);
      }],
      [/Which one is extraneous\?/, () => { expect(extraneous).toHaveLength(1); expect(roots).toHaveLength(1); return extraneous[0]; }],
      [/It has two solutions\. What is the (larger|smaller) solution\?/, (m) => {
        expect(roots).toHaveLength(2);
        return frac(...roots[m[1] === 'larger' ? 1 : 0]);
      }],
      [/Which describes the solutions\?/, () => {
        expect(roots.length).toBeLessThanOrEqual(1);
        expect(extraneous.length).toBeGreaterThanOrEqual(1);
        return roots.length ? `x = ${U(frac(...roots[0]))}` : 'No solution';
      }],
    ], p, options);
  },

  'a2-solving-quadratics-all-methods': (item, p, options) => solveBy([
    [/^Solve (?:by factoring|using square roots|the equation): (.+ = .+?)\. What is the (larger|smaller) solution\?/, (m) => {
      const r = quadRoots(eqPoly(m[1]));
      expect(r[0][0] / r[0][1]).not.toBe(r[1][0] / r[1][1]);
      return frac(...r[m[2] === 'larger' ? 1 : 0]);
    }],
    [/what number must be added to (.+) to make a perfect-square trinomial/, (m) => { const [c, b, a] = poly(m[1]); expect([c, a]).toEqual([0, 1]); return frac(b * b, 4); }],
    [/^Solve the equation: (.+ = .+)\. Which gives all of its solutions\?/, (m) => {
      const [[n1, d1], [n2, d2]] = quadRoots(eqPoly(m[1]));
      const other = n1 === 0 ? frac(n2, d2) : frac(n1, d1);
      expect(n1 === 0 || n2 === 0).toBe(true);
      return `x = 0 or x = ${U(other)}`;
    }],
    [/^Completing the square rewrites (.+ = 0) in which form\?/, (m) => {
      const [c, b, a] = eqPoly(m[1]);
      expect(a).toBe(1);
      const h = b / 2;
      const good = `(x ${h < 0 ? '−' : '+'} ${Math.abs(h)})² = ${U(h * h - c)}`;
      // It must be the same equation, and the only option that is.
      only(options, (o) => samePoly(eqPoly(o), [c, b, a]), 'is the same equation');
      return good;
    }],
    [/^Solve using the quadratic formula: (.+ = 0)\. Which are the solutions\?/, (m) => {
      const [c, b, a] = eqPoly(m[1]);
      const D = b * b - 4 * a * c;
      if (D > 0) {
        expect(Number.isInteger(Math.sqrt(D))).toBe(false);
        return `x = (${U(-b)} ± √${D})/${2 * a}`;
      }
      const im = whole(Math.sqrt(-D) / 2), re = whole(-b / 2);     // (−b ± √D)/2a with the 2 cancelled
      const i = `${im === 1 ? '' : im}i`;
      return a === 1 ? `x = ${U(re)} ± ${i}` : `x = (${U(re)} ± ${i})/${a}`;
    }],
    [/^Solve by completing the square: (.+ = 0)\. Which are the solutions\?/, (m) => {
      const [c, b, a] = eqPoly(m[1]);
      expect(a).toBe(1);
      return `x = ${U(-b / 2)} ± √${b * b / 4 - c}`;              // (x + b/2)² = b²/4 − c
    }],
  ], p, options),

  'a2-counting-principles': (item, p) => solveBy([
    [/offers (\d+) appetizers, (\d+) main courses and (\d+) desserts/, (m) => m[1] * m[2] * m[3]],
    [/^A code is (\d+) letters long\. Each letter is chosen from the (\d+) letters A through ([A-Z]), and letters may repeat/, (m) => {
      expect(m[3].charCodeAt(0) - 64).toBe(Number(m[2]));
      return Number(m[2]) ** Number(m[1]);
    }],
    [/^In how many different orders can (\d+) /, (m) => fact(Number(m[1]))],
    [/^A code is made of (\d+) different digits chosen from the digits 1 through (\d+)\. No digit may be used more than once/, (m) => perm(Number(m[2]), Number(m[1]))],
    [/^A license plate has (\d) letters? \(A to Z, 26 choices each\) followed by (\d) digits \(0 to 9\)\. Letters and digits may repeat/, (m) => 26 ** m[1] * 10 ** m[2]],
    [/^How many (\d)-digit whole numbers are there( in which no digit is repeated)?\?/, (m) => {
      // Count them outright.
      const d = Number(m[1]);
      let count = 0;
      for (let v = 10 ** (d - 1); v < 10 ** d; v++) if (!m[2] || new Set(String(v)).size === d) count++;
      return count;
    }],
    [/^How many (\d)-digit numbers that are (even|odd) can be formed from the digits 1 through (\d) if no digit may be used more than once/, (m) => {
      const d = Number(m[1]), top = Number(m[3]);
      let count = 0;
      for (let v = 10 ** (d - 1); v < 10 ** d; v++) {
        const ds = String(v).split('').map(Number);
        if (ds.every((x) => x >= 1 && x <= top) && new Set(ds).size === d && (v % 2 === 0) === (m[2] === 'even')) count++;
      }
      return count;
    }],
    [/^Evaluate (\d+)!\/(\d+)!\.$/, (m) => fact(Number(m[1])) / fact(Number(m[2]))],
    [/^In how many ways can (\d+) students stand in a row if two of them, Ana and Ben, must (NOT )?stand next to each other/, (m) => {
      // Count every line-up outright.
      const n = Number(m[1]);
      let together = 0;
      const go = (used, last, anaBen) => {
        if (used.length === n) { together += anaBen ? 1 : 0; return; }
        for (let s = 0; s < n; s++) {
          if (used.includes(s)) continue;
          go(used.concat(s), s, anaBen || (last !== null && ((last === 0 && s === 1) || (last === 1 && s === 0))));
        }
      };
      go([], null, false);
      return m[2] ? fact(n) - together : together;
    }],
    [/^A code is (\d) characters long, and each character is (?:a digit from 0 to 9|one of the (\d) letters A through ([A-Z]))\. Characters may repeat\. How many of the possible codes have at least one repeated/, (m) => {
      const L = Number(m[1]), k = m[2] ? Number(m[2]) : 10;
      if (m[3]) expect(m[3].charCodeAt(0) - 64).toBe(k);
      let count = 0;
      for (let v = 0; v < k ** L; v++) {
        const ds = v.toString(k).padStart(L, '0');
        if (new Set(ds).size < L) count++;
      }
      return count;
    }],
    [/^(\d+) people line up for a photo\. The two tallest people must stand at the two ends/, (m) => 2 * fact(Number(m[1]) - 2)],
    [/^A password is 2 different letters chosen from the first (\d+) letters of the alphabet, followed by 2 digits \(0 to 9\)\. The digits may repeat, but the first digit cannot be 0/, (m) => {
      const k = Number(m[1]);
      return k * (k - 1) * 9 * 10;
    }],
  ], p),

  'a2-permutations-combinations': (item, p) => solveBy([
    [/^Evaluate P\((\d+), (\d+)\)/, (m) => perm(Number(m[1]), Number(m[2]))],
    [/^Evaluate C\((\d+), (\d+)\)/, (m) => comb(Number(m[1]), Number(m[2]))],
    [/Which expression gives the number of ways this can be done\?$/, () => {
      // Hand-typed: does the ORDER of the chosen things make a different outcome?
      const ORDERED = [
        [/A club with (\d+) members elects (a president and a vice-president|a president, a vice-president and a treasurer|a president, a vice-president, a treasurer and a secretary);/, true, (m) => [m[1], m[2].split(/, | and /).length]],
        [/(\d+) runners enter a race, and the first (\d+) finishers are recorded in order/, true, (m) => [m[1], m[2]]],
        [/picks (\d+) of (\d+) different pizza toppings for one pizza/, false, (m) => [m[2], m[1]]],
        [/chooses (\d+) of (\d+) students to form a committee in which every member has the same role/, false, (m) => [m[2], m[1]]],
        [/From (\d+) different books, (\d+) are chosen and lined up in a row/, true, (m) => [m[1], m[2]]],
        [/A (\d+)-letter code is made from (\d+) different letter tiles, each tile used at most once/, true, (m) => [m[2], m[1]]],
        [/packs (\d+) of the (\d+) different shirts she owns/, false, (m) => [m[2], m[1]]],
        [/must answer any (\d+) of the (\d+) questions on a test/, false, (m) => [m[2], m[1]]],
      ];
      for (const [re, ordered, pull] of ORDERED) {
        const m = p.match(re);
        if (m) { const [n, r] = pull(m).map(Number); return `${ordered ? 'P' : 'C'}(${n}, ${r})`; }
      }
      throw new Error(`unknown context: ${p}`);
    }],
    [/^A committee of (\d+) people is chosen from a group of (\d+)\. Every member/, (m) => comb(Number(m[2]), Number(m[1]))],
    [/^A club has (\d+) members\. In how many ways can a president, a vice-president and a treasurer be chosen/, (m) => { const n = Number(m[1]); return n * (n - 1) * (n - 2); }],
    [/^A committee of (\d+) men and (\d+) women is chosen from a group of (\d+) men and (\d+) women/, (m) => comb(Number(m[3]), Number(m[1])) * comb(Number(m[4]), Number(m[2]))],
    [/^At a meeting of (\d+) people, every person shakes hands exactly once/, (m) => { const n = Number(m[1]); return n * (n - 1) / 2; }],
    [/^A committee of (\d+) is chosen from (\d+) men and (\d+) women\. How many of the possible committees include at least one woman/, (m) => {
      // Add up the committees with exactly 1, 2, … women.
      const [k, men, women] = m.slice(1).map(Number);
      let total = 0;
      for (let w = 1; w <= Math.min(k, women); w++) if (k - w <= men) total += comb(women, w) * comb(men, k - w);
      return total;
    }],
    [/^From the (\d+) members of a club, a president, a vice-president and a secretary are chosen .* Alex, one of the members, must hold one of the three offices/, (m) => {
      // All slates minus the slates without Alex.
      const n = Number(m[1]);
      return perm(n, 3) - perm(n - 1, 3);
    }],
    [/^A team of (\d+) is chosen from (\d+) students, two of whom are Maya and Noor\. How many of the possible teams (include both Maya and Noor|do NOT include both Maya and Noor together)/, (m) => {
      const [k, n] = m.slice(1, 3).map(Number);
      // Teams with neither, plus teams with exactly one of the two.
      const neither = comb(n - 2, k), one = 2 * comb(n - 2, k - 1), bothIn = comb(n - 2, k - 2);
      expect(neither + one + bothIn).toBe(comb(n, k));
      return m[3].startsWith('include') ? bothIn : neither + one;
    }],
    [/^If (P|C)\(n, 2\) = (\d+), what is the value of n\?/, (m) => {
      for (let n = 2; n < 200; n++) if ((m[1] === 'P' ? n * (n - 1) : n * (n - 1) / 2) === Number(m[2])) return n;
      throw new Error('no n');
    }],
  ], p),
};

// ── the tests ──────────────────────────────────────────────────────────────

describe('course-level items — Algebra 2 A', () => {
  test('the bank is for the algebra-2 course, thirteen skills, twelve items each', () => {
    expect(bank.COURSE_ID).toBe('algebra-2');
    expect(bank.GB).toBe('9-12');
    expect(bank.TEMPLATES).toHaveLength(13);
    for (const t of bank.TEMPLATES) {
      expect(t.skillId).toBe(`a2-${t.courseSkill}`);
      expect(t.tiers.map((x) => x.difficulty)).toEqual([2, 3, 4]);
      expect(ITEMS[t.skillId]).toHaveLength(12);
    }
  });

  test('every template has a re-solver', () => {
    for (const t of bank.TEMPLATES) expect(typeof RESOLVE[t.skillId]).toBe('function');
    expect(Object.keys(RESOLVE).sort()).toEqual(bank.TEMPLATES.map((t) => t.skillId).sort());
  });

  test('the builder accepts every item', () => {
    expect(validate(ALL)).toEqual([]);
  });

  test('the reader reads printed algebra the way a student does', () => {
    expect(ev('−x²', { x: 3 })).toBe(-9);
    expect(ev('−(1/2)(x + 3)² + 5', { x: 1 })).toBe(-3);
    expect(ev('8/((x − 2)(x + 2))', { x: 4 })).toBeCloseTo(8 / 12);
    expect(ev('9/x + 1/(3x)', { x: 3 })).toBeCloseTo(3 + 1 / 9);
    expect(poly('(2x − 3)(x² + 4x − 5)')).toEqual([15, -22, 5, 2]);
    expect(poly('(4x + 5)² − (3x + 2)(3x − 2)')).toEqual([29, 40, 7]);
    expect(fmtPoly([15, -22, 5, 2])).toBe('2x³ + 5x² − 22x + 15');
    expect(divide([-24, -2, 5, 1], [3, 1])).toEqual({ q: [-8, 2, 1], r: [0] });
    expect(rationalRoots('2/(x + 1) + 1/(x − 1) = 4/(x² − 1)')).toEqual([[5, 3]]);
    expect(rationalRoots('x/(x − 2) − 2/(x + 1) = 6/(x² − x − 2)')).toEqual([]);
    expect(line('y + 5 = −2(x + 1)')).toEqual({ A: 2, B: 1, C: 7 });
    expect(mats('A = [[1, −2], [3, 4]] and B = [[x], [y]]')).toEqual([[[1, -2], [3, 4]], [['x'], ['y']]]);
  });

  test.each(ALL.map((it) => [it.problemId, it]))('%s re-solves from its own text', (_id, item) => {
    const prompt = item.prompt.replace(MAT_INTRO, '');
    const options = (item.options || []).map((o) => o.text);
    const expected = RESOLVE[item.skillId](item, prompt, options);
    expect(item.answer.value).toBe(String(expected));
    if (item.options) {
      const keyed = item.options.find((o) => o.label === item.correctOption);
      expect(keyed.text).toBe(String(expected));
    }
  });

  test('a typed answer is one integer or one fraction in lowest terms; anything else is multiple choice', () => {
    for (const it of ALL) {
      if (it.answerType === 'constructed-response') {
        expect(it.answer.value).toMatch(/^-?\d+(\/\d+)?$/);
        const m = it.answer.value.match(/^-?(\d+)\/(\d+)$/);
        if (m) { expect(gcd(Number(m[1]), Number(m[2]))).toBe(1); expect(Number(m[2])).toBeGreaterThan(1); }
      } else {
        expect(it.options).toHaveLength(4);
      }
    }
  });

  test('every matrix prompt says how a matrix is written', () => {
    for (const it of ALL) {
      if (/\[\[/.test(it.prompt)) expect(it.prompt).toMatch(MAT_INTRO);
    }
  });

  test('no prompt leans on a picture, and prompts use the real minus sign', () => {
    for (const it of ALL) {
      expect(it.prompt).not.toMatch(/\b(shown|figure|diagram|pictured)\b|\b(graph|table|chart|number line) (above|below)\b/i);
      expect(it.prompt).not.toMatch(/\d-\d|[ (]-\d|\+ −|− −/);
      for (const o of it.options || []) expect(o.text).not.toMatch(/[ (]-\d|^-\d|\+ −|− −/);
    }
  });

  test('the key is not parked on one letter', () => {
    for (const [skill, items] of Object.entries(ITEMS)) {
      const letters = new Set(items.filter((i) => i.options).map((i) => i.correctOption));
      if (items.filter((i) => i.options).length >= 4) expect([skill, letters.size >= 2]).toEqual([skill, true]);
    }
  });
});
