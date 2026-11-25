/**
 * Course-level check items, Pre-Calculus (part A) — every answer RE-SOLVED
 * from the printed question.
 *
 * Nothing here calls the templates' own maths. The test READS a question the
 * way a student does: a small parser below turns the printed rule ("−2(x − 3)²
 * + 5", "log₂(x + 7)", "e^(2x) − 5e^x + 6") into a function, and the answer is
 * then worked a second way — numerically. A domain is found by trying numbers,
 * a range by collecting outputs, end behaviour by evaluating far out, a
 * multiplicity by how fast f vanishes at the zero, an equation's solutions by
 * hunting for sign changes. For multiple choice the choices are read the same
 * way, and exactly ONE of them may fit — so a wrong choice that is secretly
 * right fails here too.
 */

const { expand, validate } = require('../../scripts/buildCourseLevelItems');
const bank = require('../../scripts/lib/courseLevelPrecalcA');

const ITEMS = {};
for (const t of bank.TEMPLATES) ITEMS[t.skillId] = expand(t, bank.GB);
const ALL = Object.values(ITEMS).flat();

// ── reading printed maths ──────────────────────────────────────────────────

const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUBS = '₀₁₂₃₄₅₆₇₈₉';

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ') { i += 1; continue; }
    if (/\d/.test(ch)) {
      let j = i;
      while (j < src.length && /[\d.]/.test(src[j])) j += 1;
      out.push({ t: 'num', v: Number(src.slice(i, j)) });
      i = j; continue;
    }
    if (SUPS.includes(ch) || ch === '⁻') {
      let j = i, s = '';
      while (j < src.length && (SUPS.includes(src[j]) || src[j] === '⁻')) { s += src[j] === '⁻' ? '-' : SUPS.indexOf(src[j]); j += 1; }
      out.push({ t: 'sup', v: Number(s) });
      i = j; continue;
    }
    if (src.startsWith('ln', i)) { out.push({ t: 'fn', base: Math.E }); i += 2; continue; }
    if (src.startsWith('log', i)) {
      let j = i + 3, s = '';
      while (j < src.length && SUBS.includes(src[j])) { s += SUBS.indexOf(src[j]); j += 1; }
      out.push({ t: 'fn', base: s ? Number(s) : 10 });
      i = j; continue;
    }
    if (/[a-z]/.test(ch)) { out.push({ t: 'id', v: ch }); i += 1; continue; }
    if ('−-'.includes(ch)) { out.push({ t: '-' }); i += 1; continue; }
    if ('+/^()|√∛·'.includes(ch)) { out.push({ t: ch }); i += 1; continue; }
    throw new Error(`cannot read "${ch}" in: ${src}`);
  }
  return out;
}

/** The value of a printed expression. Undefined things come back NaN or ±Infinity. */
function ev(src, env = {}) {
  const tk = tokenize(src);
  let p = 0;
  let inAbs = 0;
  const peek = () => tk[p] || { t: 'end' };
  const startsAtom = () => {
    const t = peek().t;
    return t === 'num' || t === 'id' || t === 'fn' || t === '(' || t === '√' || t === '∛' || (t === '|' && !inAbs);
  };
  function expr() {
    let v = term();
    while (peek().t === '+' || peek().t === '-') { const op = tk[p++].t; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  function term() {
    let v = unary();
    for (;;) {
      if (peek().t === '·') { p += 1; v *= unary(); }
      else if (peek().t === '/') { p += 1; v /= unary(); }
      else if (startsAtom()) v *= power();
      else return v;
    }
  }
  function unary() {
    if (peek().t === '-') { p += 1; return -unary(); }
    return power();
  }
  function power() {
    const base = atom();
    if (peek().t === 'sup') return base ** tk[p++].v;
    if (peek().t === '^') {
      p += 1;
      const e = peek().t === '-' ? unary() : atom();
      return base ** e;
    }
    return base;
  }
  function atom() {
    const t = tk[p++];
    if (!t) throw new Error(`ran out of tokens: ${src}`);
    if (t.t === 'num') return t.v;
    if (t.t === 'id') {
      if (t.v === 'e' && !('e' in env)) return Math.E;
      if (!(t.v in env)) throw new Error(`no value for ${t.v} in: ${src}`);
      return env[t.v];
    }
    if (t.t === '(') { const v = expr(); if (tk[p++].t !== ')') throw new Error(`unclosed ( in: ${src}`); return v; }
    if (t.t === '|') { inAbs += 1; const v = expr(); inAbs -= 1; if (tk[p++].t !== '|') throw new Error(`unclosed | in: ${src}`); return Math.abs(v); }
    if (t.t === 'fn') {
      if (tk[p++].t !== '(') throw new Error(`log without ( in: ${src}`);
      const v = expr();
      if (tk[p++].t !== ')') throw new Error(`unclosed log in: ${src}`);
      return v > 0 ? Math.log(v) / Math.log(t.base) : NaN;
    }
    if (t.t === '√') { const v = atom(); return v >= 0 ? Math.sqrt(v) : NaN; }
    if (t.t === '∛') return Math.cbrt(atom());
    throw new Error(`unexpected ${t.t} in: ${src}`);
  }
  const v = expr();
  if (p !== tk.length) throw new Error(`left over after reading: ${src}`);
  return v;
}

const fnOf = (src) => (x) => ev(src, { x });
const num = (s) => Number(String(s).replace('−', '-'));
const close = (a, b) => Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));
const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/** A number as a student would type it: "7", "-3", "14/3". */
function typed(x) {
  for (let d = 1; d <= 64; d++) {
    const n = Math.round(x * d);
    if (Math.abs(n / d - x) < 1e-8) return d === 1 ? String(n) : `${n}/${d}`;
  }
  throw new Error(`not a simple fraction: ${x}`);
}

/** The one choice that fits. Fails when none fits — or when two do. */
function only(item, fits) {
  const hits = item.options.filter((o) => { try { return fits(o.text); } catch { return false; } });
  if (hits.length !== 1) throw new Error(`${hits.length} choices fit (need exactly 1): ${item.prompt} → ${hits.map((h) => h.text).join(' | ')}`);
  return hits[0].text;
}

const POINTS = [0.37, 1.91, -2.53, 3.3];
/** Two printed expressions in x agree wherever both were tried. */
const sameInX = (a, b) => POINTS.every((x) => close(ev(a, { x }), ev(b, { x })));
const ENVS = [{ x: 1.7, y: 2.3, z: 3.1 }, { x: 0.6, y: 1.4, z: 5.2 }, { x: 4.1, y: 0.8, z: 0.3 }];
const sameInXYZ = (a, b) => ENVS.every((env) => close(ev(a, env), ev(b, env)));

// ── sets of numbers, as printed ────────────────────────────────────────────

/** "(−∞, 3) ∪ [5, ∞)" or "All real numbers except x = −6 and x = 6" → a membership test. */
function setOf(text) {
  const ex = text.match(/^All real numbers except (.+)$/);
  if (ex) {
    const out = [...ex[1].matchAll(/x = (−?\d+)/g)].map((m) => num(m[1]));
    return (x) => !out.includes(x);
  }
  const parts = text.split(' ∪ ').map((part) => {
    const m = part.match(/^([([])(−?∞|−?\d+), (−?∞|−?\d+)([)\]])$/);
    if (!m) throw new Error(`not an interval: ${part}`);
    const end = (s) => (s === '∞' ? Infinity : s === '−∞' ? -Infinity : num(s));
    return { lo: end(m[2]), hi: end(m[3]), loIn: m[1] === '[', hiIn: m[4] === ']' };
  });
  const test = (x) => parts.some((q) => (x > q.lo || (q.loIn && x === q.lo)) && (x < q.hi || (q.hiIn && x === q.hi)));
  test.parts = parts;
  return test;
}

const GRID = [];
for (let i = -400; i <= 400; i++) GRID.push(i / 4);          // −100 … 100 in quarters

/** The choice whose set is exactly where the rule gives a real number. */
const domainChoice = (item, f) => only(item, (text) => {
  const inSet = setOf(text);
  return GRID.every((x) => Number.isFinite(f(x)) === inSet(x));
});

/** The choice that holds every output found and ends exactly at the extreme one. */
function rangeChoice(item, f) {
  const ys = GRID.map(f).filter(Number.isFinite);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  return only(item, (text) => {
    const inSet = setOf(text);
    const [q] = inSet.parts;
    if (inSet.parts.length !== 1 || !ys.every(inSet)) return false;
    return (q.lo === lo && q.hi === Infinity) || (q.hi === hi && q.lo === -Infinity);
  });
}

// ── polynomials, read numerically ──────────────────────────────────────────

const intZeros = (f, lo = -40, hi = 40) => {
  const out = [];
  for (let x = lo; x <= hi; x++) if (Math.abs(f(x)) < 1e-9) out.push(x);
  return out;
};
/** How fast f vanishes at z: |f(z + h)| ~ h^m. */
const multiplicity = (f, z) => Math.round(Math.log10(Math.abs(f(z + 1e-2) / f(z + 1e-3))));
const degree = (f) => Math.round(Math.log10(Math.abs(f(1e5) / f(1e4))));
const INF = '∞', NINF = '−∞';
const endOf = (f) => [f(-1000) > 0 ? INF : NINF, f(1000) > 0 ? INF : NINF];
const endLine = ([l, r]) => `As x → −∞, f(x) → ${l}; as x → ∞, f(x) → ${r}`;

// ── equations, solved by looking for sign changes ──────────────────────────

function roots(lhs, rhs, lo = -40, hi = 40, step = 0.01) {
  const h = (x) => ev(lhs, { x }) - ev(rhs, { x });
  // "Equal" is judged against the size of the two sides: far to the left both
  // sides of an exponential equation are next to nothing without being equal.
  const equal = (x) => {
    const l = ev(lhs, { x }), r = ev(rhs, { x });
    return r === 0 ? Math.abs(l) < 1e-11 : Math.abs(l - r) <= 1e-11 * Math.max(Math.abs(l), Math.abs(r));
  };
  const out = [];
  const add = (x) => { if (!out.some((r) => Math.abs(r - x) < 1e-6)) out.push(x); };
  const n = Math.round((hi - lo) / step);
  let px = lo, pv = h(lo);
  for (let i = 1; i <= n; i++) {
    const x = lo + i * step, v = h(x);
    if (Number.isFinite(v) && equal(x)) add(x);
    else if (Number.isFinite(v) && Number.isFinite(pv) && !equal(px) && pv * v < 0) {
      let a = px, b = x, fa = pv;
      for (let k = 0; k < 80; k++) {
        const m = (a + b) / 2, fm = h(m);
        if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
      }
      // A sign change across a pole is not a root.
      if (Math.abs(h((a + b) / 2)) < 1e-6) add((a + b) / 2);
    }
    px = x; pv = v;
  }
  return out.sort((a, b) => a - b);
}
const splitEq = (s) => { const i = s.lastIndexOf(' = '); return [s.slice(0, i), s.slice(i + 3)]; };
/** "x = ln(2) or x = ln(3)" → [0.69…, 1.09…] */
const namedValues = (text) => text.split(' or ').map((part) => ev(part.replace(/^x = /, '')));
const sameSet = (a, b) => a.length === b.length && a.slice().sort((p, q) => p - q).every((v, i) => close(v, b.slice().sort((p, q) => p - q)[i]));

function solveItem(item, eq, lo, hi) {
  const [lhs, rhs] = splitEq(eq);
  const found = roots(lhs, rhs, lo, hi);
  if (item.options) return only(item, (text) => sameSet(namedValues(text), found));
  if (found.length !== 1) throw new Error(`${found.length} solutions found for: ${eq}`);
  return typed(found[0]);
}

const baseOf = (word) => (word === 'ln' ? Math.E : word === 'log' ? 10 : Number([...word.slice(3)].map((c) => SUBS.indexOf(c)).join('')));
const LOGW = '(ln|log[₀-₉]*)';

const shiftWords = (h, k) => `${h > 0 ? 'right' : 'left'} ${Math.abs(h)} unit${Math.abs(h) === 1 ? '' : 's'} and ${k > 0 ? 'up' : 'down'} ${Math.abs(k)} unit${Math.abs(k) === 1 ? '' : 's'}`;

/** Where a logarithmic rule stops being defined: the whole number c with f undefined at c and defined just right of it. */
function logEdge(f) {
  for (let c = -150; c <= 150; c++) if (!Number.isFinite(f(c)) && Number.isFinite(f(c + 1e-6))) return c;
  throw new Error('no left edge found');
}

// ── the re-solvers ─────────────────────────────────────────────────────────

const RESOLVE = {
  'pc-algebraic-fluency-review'(item, q) {
    let m;
    if ((m = q.match(/^Factor completely: (.+)$/))) return only(item, (t) => sameInX(t, m[1]));
    if ((m = q.match(/^Solve (.+) = 0\. Enter the larger solution\.$/))) return String(Math.max(...intZeros(fnOf(m[1]))));
    if ((m = q.match(/^Evaluate (\d+)\^\((\d+)\/(\d+)\)\.$/))) {
      const [base, p, root] = m.slice(1).map(Number);
      for (let r = 1; r <= 20; r++) if (r ** root === base) return String(r ** p);
      throw new Error('no whole root');
    }
    if ((m = q.match(/^Simplify: (\(.+\)\/\(.+\))$/))) return only(item, (t) => sameInX(t, m[1]));
    if ((m = q.match(/^Solve: (\d+)\/\((.+)\) = (\d+)\/\((.+)\)$/))) {
      // a/(D1) = b/(D2)  →  a·D2 − b·D1 = 0, a straight line in x.
      const h = (x) => m[1] * ev(m[4], { x }) - m[3] * ev(m[2], { x });
      const x0 = -h(0) / (h(1) - h(0));
      expect(ev(m[2], { x: x0 })).not.toBe(0);
      expect(ev(m[4], { x: x0 })).not.toBe(0);
      return typed(x0);
    }
    if ((m = q.match(/^Simplify: √(\d+)$/))) {
      const n = Number(m[1]);
      return only(item, (t) => {
        const o = t.match(/^(\d+)√(\d+)$/);
        const [k, r] = [Number(o[1]), Number(o[2])];
        const squareFree = ![4, 9, 25, 49].some((s) => r % s === 0);
        return k * k * r === n && squareFree;
      });
    }
    if ((m = q.match(/^Solve: (1\/.+) = (.+\/\(x² − \d+\))$/))) {
      const found = roots(m[1], m[2], -30, 30, 0.013);
      expect(found).toHaveLength(1);
      return typed(found[0]);
    }
    if ((m = q.match(/^Solve using the quadratic formula: (.+) = 0$/))) {
      const f = fnOf(m[1]);
      return only(item, (t) => {
        const o = t.match(/^x = (.+) ± (.+)$/);
        const [c, d] = [ev(o[1]), ev(o[2])];
        return Math.abs(f(c + d)) < 1e-9 && Math.abs(f(c - d)) < 1e-9;
      });
    }
    if ((m = q.match(/^Simplify, writing the answer with positive exponents: (.+)$/))) {
      return only(item, (t) => !t.includes('⁻') && sameInXYZ(t, m[1]));
    }
    throw new Error(`no re-solver: ${q}`);
  },

  'pc-combining-functions'(item, q) {
    const m = q.match(/^Let f\(x\) = (.+) and g\(x\) = (.+?)\. (.+)$/);
    const f = fnOf(m[1]), g = fnOf(m[2]), ask = m[3];
    const combine = { '+': (x) => f(x) + g(x), '−': (x) => f(x) - g(x), '·': (x) => f(x) * g(x), '/': (x) => f(x) / g(x) };
    let a;
    if ((a = ask.match(/^Find \(f ?([+−·/]) ?g\)\((−?\d+)\)\./))) return typed(combine[a[1]](num(a[2])));
    if ((a = ask.match(/^Which is \(f ([−·]) g\)\(x\)\?$/))) return only(item, (t) => POINTS.every((x) => close(ev(t, { x }), combine[a[1]](x))));
    if (/^What is the domain of \(f\/g\)\(x\)\?$/.test(ask)) return domainChoice(item, combine['/']);
    if (/^Which is \(f\/g\)\(x\), with its domain restriction\?$/.test(ask)) {
      return only(item, (t) => {
        const o = t.match(/^(.+), for x ≠ (−?\d+)$/);
        return g(num(o[2])) === 0 && POINTS.every((x) => close(ev(o[1], { x }), f(x) / g(x)));
      });
    }
    throw new Error(`no re-solver: ${q}`);
  },

  'pc-domain-range-analysis'(item, q) {
    let m;
    if ((m = q.match(/^What value of x is excluded from the domain of f\(x\) = (.+)\?$/))) {
      const bad = intZeros((x) => (Number.isFinite(ev(m[1], { x })) ? 1 : 0));
      expect(bad).toHaveLength(1);
      return String(bad[0]);
    }
    if ((m = q.match(/^What is the domain of f\(x\) = (.+)\?$/))) return domainChoice(item, fnOf(m[1]));
    if ((m = q.match(/^What is the range of f\(x\) = (.+)\?$/))) return rangeChoice(item, fnOf(m[1]));
    if ((m = q.match(/^f\(x\) = (.+) has two values of x that are not in its domain\. Enter the larger one\.$/))) {
      const bad = intZeros((x) => (Number.isFinite(ev(m[1], { x })) ? 1 : 0));
      expect(bad).toHaveLength(2);
      return String(Math.max(...bad));
    }
    throw new Error(`no re-solver: ${q}`);
  },

  'pc-polynomial-end-behavior'(item, q) {
    let m;
    if ((m = q.match(/^Which describes the end behavior of f\(x\) = (.+)\?$/))) return endLine(endOf(fnOf(m[1])));
    if ((m = q.match(/degree (\d+) and leading coefficient (−?\d+)\./))) {
      // Typed by hand: the right end follows the sign; the left end matches it for an even degree.
      const [n, a] = [Number(m[1]), num(m[2])];
      const right = a > 0 ? INF : NINF;
      const left = n % 2 === 0 ? right : (a > 0 ? NINF : INF);
      return endLine([left, right]);
    }
    const body = (t) => fnOf(t.replace(/^f\(x\) = /, ''));
    if ((m = q.match(/which polynomial function (rises|falls) to the left and (rises|falls) to the right\?$/))) {
      const want = [m[1] === 'rises' ? INF : NINF, m[2] === 'rises' ? INF : NINF];
      return only(item, (t) => endOf(body(t)).join() === want.join());
    }
    if ((m = q.match(/does f\(x\) → (−?∞) as x → −∞ and f\(x\) → (−?∞) as x → ∞\?$/))) {
      return only(item, (t) => endOf(body(t)).join() === [m[1], m[2]].join());
    }
    throw new Error(`no re-solver: ${q}`);
  },

  'pc-polynomial-zeros-multiplicity'(item, q) {
    let m;
    if ((m = q.match(/^For f\(x\) = (.+), what is the multiplicity of the zero x = (−?\d+)\?$/))) {
      expect(fnOf(m[1])(num(m[2]))).toBe(0);
      return String(multiplicity(fnOf(m[1]), num(m[2])));
    }
    if ((m = q.match(/^At which zero does the graph of f\(x\) = (.+) touch the x-axis and turn back/))) {
      const f = fnOf(m[1]);
      const touch = intZeros(f).filter((z) => multiplicity(f, z) % 2 === 0);
      expect(touch).toHaveLength(1);
      return String(touch[0]);
    }
    if ((m = q.match(/^What are the zeros of f\(x\) = (.+)\?$/))) {
      const zs = intZeros(fnOf(m[1]));
      return only(item, (t) => t === `x = ${zs.map((z) => String(z).replace('-', '−')).join(', ')}`);
    }
    if ((m = q.match(/^What is the greatest number of turning points the graph of f\(x\) = (.+) can have\?$/))) {
      return String(degree(fnOf(m[1])) - 1);
    }
    if ((m = q.match(/zero at x = (−?\d+) with multiplicity 2 and a zero at x = (−?\d+) with multiplicity 1\?$/))) {
      const [z2, z1] = [num(m[1]), num(m[2])];
      return only(item, (t) => {
        const f = fnOf(t.replace(/^f\(x\) = /, ''));
        const leadingOne = Math.abs(f(1e6) / 1e18 - 1) < 1e-3;
        return degree(f) === 3 && leadingOne && f(z2) === 0 && f(z1) === 0 && multiplicity(f, z2) === 2 && multiplicity(f, z1) === 1;
      });
    }
    if ((m = q.match(/^What is the sum of the distinct zeros of f\(x\) = (.+)\?$/))) {
      return String(intZeros(fnOf(m[1])).reduce((s, z) => s + z, 0));
    }
    if ((m = q.match(/^Which describes the graph of f\(x\) = (.+) at its x-intercepts\?$/))) {
      const f = fnOf(m[1]);
      const zs = intZeros(f);
      expect(zs).toHaveLength(2);
      const touch = zs.find((z) => multiplicity(f, z) % 2 === 0);
      const cross = zs.find((z) => multiplicity(f, z) % 2 === 1);
      const s = (v) => String(v).replace('-', '−');
      return `Touches the x-axis at x = ${s(touch)} and crosses it at x = ${s(cross)}`;
    }
    if ((m = q.match(/multiplicity 2 at x = (−?\d+) and a zero at x = (−?\d+), and f\(0\) = (−?\d+)\./))) {
      // f(x) = a(x − p)²(x − q), so f(0) = a·p²·(−q).
      const [p2, q1, c] = m.slice(1).map(num);
      return typed(c / (p2 * p2 * -q1));
    }
    if ((m = q.match(/^Find the zeros of f\(x\) = (.+) and their multiplicities\.$/))) {
      const f = fnOf(m[1]);
      const want = intZeros(f).map((z) => `${z}:${multiplicity(f, z)}`).sort().join();
      return only(item, (t) => [...t.matchAll(/x = (−?\d+) \(multiplicity (\d)\)/g)].map((o) => `${num(o[1])}:${o[2]}`).sort().join() === want);
    }
    if ((m = q.match(/of degree (\d+) has only real zeros.*with multiplicity (\d+), x = −?\d+ with multiplicity (\d+), and x = /))) {
      return String(m[1] - m[2] - m[3]);
    }
    if ((m = q.match(/^At how many of its x-intercepts does the graph of f\(x\) = (.+) cross the x-axis\?$/))) {
      const f = fnOf(m[1]);
      const zs = intZeros(f);
      expect(zs.reduce((s, z) => s + multiplicity(f, z), 0)).toBe(degree(f) - 2);     // x² + q adds 2 and no zero
      return String(zs.filter((z) => multiplicity(f, z) % 2 === 1).length);
    }
    throw new Error(`no re-solver: ${q}`);
  },

  'pc-exponential-functions-properties'(item, q) {
    let m;
    const body = (t) => fnOf(t.replace(/^[fgy](\(x\))? = /, ''));
    if ((m = q.match(/^What is the horizontal asymptote of f\(x\) = (.+)\?$/))) return `y = ${String(fnOf(m[1])(-300)).replace('-', '−')}`;
    if (/^Which function models exponential decay\?$/.test(q)) {
      return only(item, (t) => { const f = body(t); return f(0) > 0 && f(3) < f(0) && f(6) < f(3); });
    }
    if ((m = q.match(/^What is the y-coordinate of the y-intercept of f\(x\) = (.+?)\?/))) return typed(fnOf(m[1])(0));
    if ((m = q.match(/^What is the range of f\(x\) = (.+)\?$/))) {
      // An exponential never reaches the value it levels off at, and lies wholly on one side of it.
      const f = fnOf(m[1]);
      const level = f(-300);
      const s = String(level).replace('-', '−');
      return f(0) > level ? `(${s}, ∞)` : `(−∞, ${s})`;
    }
    if ((m = q.match(/^Which function is (increasing|decreasing) on its entire domain\?$/))) {
      const up = m[1] === 'increasing';
      return only(item, (t) => { const f = body(t); return [-3, -1, 0, 2].every((x) => (up ? f(x + 1) > f(x) : f(x + 1) < f(x))); });
    }
    if ((m = q.match(/^How is the graph of g\(x\) = (.+) obtained from the graph of f\(x\) = (\d+)\^x\?$/))) {
      const gf = fnOf(m[1]), b = Number(m[2]);
      const k = gf(-300);                                      // b^(x − h) + k levels off at k
      const h = -Math.log(gf(0) - k) / Math.log(b);            // g(0) − k = b^(−h)
      return `Shifted ${shiftWords(Math.round(h), k)}`;
    }
    if ((m = q.match(/^Let f\(x\) = (.+)\. What value does f\(x\) approach as x → −∞\?$/))) return typed(fnOf(m[1])(-300));
    if ((m = q.match(/passes through \(0, (\d+)\) and \((\d+), (\d+)\)\. What is b\?$/))) return typed((m[3] / m[1]) ** (1 / m[2]));
    if ((m = q.match(/^Which function is equivalent to f\(x\) = (.+)\?$/))) return only(item, (t) => sameInX(t.replace(/^g\(x\) = /, ''), m[1]));
    if ((m = q.match(/^Which function has horizontal asymptote y = (\d+) and range \(−∞, \1\)\?$/))) {
      const k = Number(m[1]);
      return only(item, (t) => {
        const f = body(t);
        return (close(f(-300), k) || close(f(300), k)) && [-4, -1, 0, 1, 4].every((x) => f(x) < k);
      });
    }
    throw new Error(`no re-solver: ${q}`);
  },

  'pc-logarithmic-functions-properties'(item, q) {
    let m;
    if ((m = q.match(/^Evaluate:? (.+?)\.?(?: Enter a fraction in lowest terms\.)?$/)) && !/\?/.test(q)) return typed(ev(m[1].replace(/\.$/, '')));
    if ((m = q.match(new RegExp(`^Which exponential equation is equivalent to ${LOGW}\\((\\d+)\\) = (\\d+)\\?$`)))) {
      // log_b(N) = n says b^n = N.
      const b = baseOf(m[1]);
      expect(b ** m[3]).toBe(Number(m[2]));
      return only(item, (t) => t === `${b}^${m[3]} = ${m[2]}`);
    }
    if ((m = q.match(/^What is the vertical asymptote of f\(x\) = (.+)\?$/))) return `x = ${String(logEdge(fnOf(m[1]))).replace('-', '−')}`;
    if ((m = q.match(/^What is the inverse of f\(x\) = (.+)\?$/))) {
      const f = fnOf(m[1]);
      return only(item, (t) => [-1, 0.5, 2].every((y) => close(f(ev(t.replace(/^f⁻¹\(x\) = /, ''), { x: y })), y)));
    }
    if ((m = q.match(/^What is the x-intercept of f\(x\) = (.+)\? Enter the x-value\.$/))) {
      const found = roots(m[1], '0', -20, 160);
      expect(found).toHaveLength(1);
      return typed(found[0]);
    }
    if ((m = q.match(/^What is the domain of f\(x\) = (.+)\?$/))) return domainChoice(item, fnOf(m[1]));
    if ((m = q.match(new RegExp(`^How is the graph of g\\(x\\) = (.+) obtained from the graph of f\\(x\\) = ${LOGW}\\(x\\)\\?$`)))) {
      const gf = fnOf(m[1]), b = baseOf(m[2]);
      const c = logEdge(gf);                       // the asymptote moved from x = 0 to x = c
      const k = gf(c + 1);                         // log(1) = 0, so this is the vertical shift
      const flipped = close(gf(c + b) - k, -1);    // log_b(b) = 1 unless the outputs were negated
      expect(flipped || close(gf(c + b) - k, 1)).toBe(true);
      return `Reflected across the ${flipped ? 'x' : 'y'}-axis, then shifted ${shiftWords(c, Math.round(k))}`;
    }
    if ((m = q.match(/^What is the y-coordinate of the y-intercept of f\(x\) = (.+)\?$/))) return typed(fnOf(m[1])(0));
    if ((m = q.match(/^Which line correctly describes f\(x\) = (.+)\?$/))) {
      const c = String(logEdge(fnOf(m[1]))).replace('-', '−');
      // A logarithm is defined right of its asymptote and takes every real value.
      return only(item, (t) => t === `Domain (${c}, ∞); range (−∞, ∞); vertical asymptote x = ${c}`);
    }
    throw new Error(`no re-solver: ${q}`);
  },

  'pc-logarithm-rules-expansion'(item, q) {
    let m;
    if ((m = q.match(/^(?:Expand|Expand and simplify|Write as a single logarithm): (.+)$/))) return only(item, (t) => sameInXYZ(t, m[1]));
    if ((m = q.match(/^Evaluate: (.+)$/))) return typed(ev(m[1]));
    if ((m = q.match(/which expression equals (.+)\?$/))) return only(item, (t) => close(ev(t), ev(m[1])));
    if ((m = q.match(new RegExp(`^If ${LOGW}\\(x\\) = (−?\\d+) and ${LOGW}\\(y\\) = (−?\\d+), what is (.+)\\?$`)))) {
      // log_b(x) = p means x = b^p.
      const b = baseOf(m[1]);
      return typed(ev(m[5], { x: b ** num(m[2]), y: b ** num(m[4]) }));
    }
    throw new Error(`no re-solver: ${q}`);
  },

  'pc-solving-exponential-equations'(item, q) {
    let m;
    if ((m = q.match(/starts with (\d+) cells and (doubles|triples) every (\d+) hours.* there be (\d+) cells\?$/))) {
      const b = m[2] === 'doubles' ? 2 : 3;
      expect(q).toContain(`P(t) = ${m[1]}·${b}^(t/${m[3]})`);
      return typed(m[3] * Math.log(m[4] / m[1]) / Math.log(b));
    }
    if ((m = q.match(/half-life of (\d+) years, so a sample of (\d+) grams has A\(t\) = \2·\(1\/2\)\^\(t\/\1\).* are (\d+) grams left\?$/))) {
      return typed(m[1] * Math.log2(m[2] / m[3]));
    }
    if ((m = q.match(/^Solve: (.+?)(?:\. Enter a fraction in lowest terms\.| \(Enter a fraction in lowest terms\.\))?$/))) return solveItem(item, m[1], -30, 30);
    throw new Error(`no re-solver: ${q}`);
  },

  'pc-solving-logarithmic-equations'(item, q) {
    let m;
    if ((m = q.match(new RegExp(`^Solving ${LOGW}\\((.+?)\\) \\+ ${LOGW}\\((.+?)\\) = (\\d+) by condensing`)))) {
      // (A)(B) = b^n with A = x + p, B = x + q: a quadratic. The root that makes an argument ≤ 0 goes.
      const A = fnOf(m[2]), B = fnOf(m[4]), rhs = baseOf(m[1]) ** m[5];
      const c1 = A(0) + B(0), c0 = A(0) * B(0) - rhs;
      const d = Math.sqrt(c1 * c1 - 4 * c0);
      const both = [(-c1 + d) / 2, (-c1 - d) / 2];
      const bad = both.filter((x) => A(x) <= 0 || B(x) <= 0);
      expect(bad).toHaveLength(1);
      return typed(bad[0]);
    }
    if ((m = q.match(/^Solve: (.+? = .+?)(?: \(Enter a fraction in lowest terms\.\))?$/))) return solveItem(item, m[1], -40, 1200);
    throw new Error(`no re-solver: ${q}`);
  },
};

// ── tests ──────────────────────────────────────────────────────────────────

describe('course-level check items — Pre-Calculus A', () => {
  test('the reader reads printed maths', () => {
    expect(ev('−2(x − 3)² + 5', { x: 1 })).toBe(-3);
    expect(ev('−3^x + 1', { x: 2 })).toBe(-8);
    expect(ev('(1/2)^(−x)', { x: 3 })).toBe(8);
    expect(ev('3·2^(x − 1) − 4', { x: 3 })).toBe(8);
    expect(ev('log₂(x + 7) + 4', { x: 1 })).toBe(7);
    expect(ev('log₂₅(5)')).toBeCloseTo(0.5);
    expect(ev('2x³y⁻²', { x: 2, y: 2 })).toBe(4);
    expect(ev('4|x + 1| + 9', { x: -3 })).toBe(17);
    expect(ev('x²·∛y/z²', { x: 3, y: 8, z: 3 })).toBeCloseTo(2);
    expect(ev('ln(√x/(y²z))', { x: 4, y: 1, z: 2 })).toBeCloseTo(0);
    expect(ev('e^(2x) − 5e^x + 6', { x: Math.log(2) })).toBeCloseTo(0);
    expect(ev('2·ln(2)/(ln(3) − ln(2))')).toBeCloseTo(3.419, 3);
    expect(Number.isNaN(ev('ln(x − 3)', { x: 3 }))).toBe(true);
    expect(Number.isNaN(ev('√(x − 3)', { x: 2 }))).toBe(true);
    expect(setOf('[5, 10) ∪ (10, ∞)')(5)).toBe(true);
    expect(setOf('[5, 10) ∪ (10, ∞)')(10)).toBe(false);
    expect(setOf('All real numbers except x = −6 and x = 6')(-6)).toBe(false);
  });

  test('every template has a re-solver', () => {
    for (const t of bank.TEMPLATES) expect(typeof RESOLVE[t.skillId]).toBe('function');
    expect(Object.keys(RESOLVE).sort()).toEqual(bank.TEMPLATES.map((t) => t.skillId).sort());
  });

  test('ten skills, twelve items each, for the course', () => {
    expect(bank.COURSE_ID).toBe('precalculus');
    expect(bank.TEMPLATES).toHaveLength(10);
    for (const t of bank.TEMPLATES) {
      expect(t.skillId).toBe(`pc-${t.courseSkill}`);
      expect(ITEMS[t.skillId]).toHaveLength(12);
    }
  });

  test('the builder accepts every item', () => {
    expect(validate(ALL)).toEqual([]);
  });

  test.each(ALL.map((it) => [it.problemId, it]))('%s re-solves from its own text', (_id, item) => {
    const expected = RESOLVE[item.skillId](item, item.prompt);
    expect(item.answer.value).toBe(String(expected));
    if (item.options) {
      const keyed = item.options.find((o) => o.label === item.correctOption);
      expect(keyed.text).toBe(String(expected));
    }
  });

  test('a typed answer is one integer or one fraction; anything else is multiple choice', () => {
    for (const it of ALL) {
      if (it.answerType === 'constructed-response') {
        expect(it.answer.value).toMatch(/^-?\d+(\/\d+)?$/);
        const f = it.answer.value.match(/^-?(\d+)\/(\d+)$/);
        if (f) {
          expect(gcd(Number(f[1]), Number(f[2]))).toBe(1);
          expect(it.prompt).toMatch(/fraction in lowest terms/);
        }
      } else expect(it.options).toHaveLength(4);
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
});
