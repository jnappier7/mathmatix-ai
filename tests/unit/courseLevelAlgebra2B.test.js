/**
 * Course-level check items, Algebra 2 (part B) — every answer RE-SOLVED from
 * the printed question.
 *
 * Nothing here calls the templates' own maths. The test READS a prompt the way
 * a student does: a small parser for printed math (`compile`) evaluates the
 * expression or equation in the prompt numerically, sequences and sums are
 * added up term by term, money problems are simulated year by year, and the
 * answer is whichever number (or which choice) that work lands on. The rules
 * (|r| < 1, the argument of a log is positive, a = S(1 − r) …) are typed by
 * hand below.
 */

const { expand, validate } = require('../../scripts/buildCourseLevelItems');
const bank = require('../../scripts/lib/courseLevelAlgebra2B');

const ITEMS = {};
for (const t of bank.TEMPLATES) ITEMS[t.skillId] = expand(t, bank.GB);
const ALL = Object.values(ITEMS).flat();

// ── a reader for printed math ──────────────────────────────────────────────

const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const VARS = new Set(['x', 'y', 'a', 'b', 'k', 'n', 'd', 'h', 't', 'L']);
const ROOTS = { '√': 2, '∛': 3, '∜': 4 };

/** "2·log₃(x) + ln(5x^2/y^3)" → (env) => number. Throws on anything it cannot read. */
function compile(src) {
  const s = String(src);
  let i = 0;
  const ws = () => { while (s[i] === ' ') i++; };
  const peek = () => { ws(); return s[i]; };
  const startsFactor = () => {
    const c = peek();
    return c !== undefined && (/[0-9a-zA-Z(]/.test(c) || ROOTS[c] !== undefined);
  };
  function expr() {
    let f = term();
    for (;;) {
      const c = peek();
      if (c === '+') { i++; const g = term(); const p = f; f = (e) => p(e) + g(e); }
      else if (c === '−' || c === '-') { i++; const g = term(); const p = f; f = (e) => p(e) - g(e); }
      else return f;
    }
  }
  function term() {
    let f = factor();
    for (;;) {
      const c = peek();
      if (c === '·') { i++; const g = factor(); const p = f; f = (e) => p(e) * g(e); }
      else if (c === '/') { i++; const g = factor(); const p = f; f = (e) => p(e) / g(e); }
      else if (startsFactor()) { const g = factor(); const p = f; f = (e) => p(e) * g(e); }
      else return f;
    }
  }
  function factor() {
    const c = peek();
    if (c === '−' || c === '-') { i++; const g = factor(); return (e) => -g(e); }
    const base = atom();
    if (peek() === '^') {
      i++;
      let neg = false;
      if (peek() === '−' || peek() === '-') { neg = true; i++; }
      const ex = atom();
      // an odd root of a negative number is real; JS ** is not asked for one here
      return (e) => Math.pow(base(e), neg ? -ex(e) : ex(e));
    }
    return base;
  }
  function atom() {
    const c = peek();
    if (c === undefined) throw new Error(`unexpected end: ${s}`);
    if (c === '(') { i++; const f = expr(); if (peek() !== ')') throw new Error(`missing ) in ${s}`); i++; return f; }
    if (/[0-9]/.test(c)) {
      const m = s.slice(i).match(/^\d+(\.\d+)?/);
      i += m[0].length;
      const v = Number(m[0]);
      return () => v;
    }
    if (ROOTS[c] !== undefined) { i++; const idx = ROOTS[c]; const f = atom(); return (e) => Math.pow(f(e), 1 / idx); }
    if (s.startsWith('ln(', i)) { i += 2; const f = atom(); return (e) => Math.log(f(e)); }
    if (s.startsWith('log', i)) {
      i += 3;
      let base = '';
      while (SUBS.includes(s[i]) && s[i] !== undefined) { base += SUBS.indexOf(s[i]); i++; }
      if (s[i] !== '(') throw new Error(`log without ( in ${s}`);
      const b = base ? Number(base) : 10;
      const f = atom();
      return (e) => Math.log(f(e)) / Math.log(b);
    }
    if (c === 'e') { i++; return () => Math.E; }
    if (VARS.has(c)) {
      i++;
      return (e) => { if (!(c in e)) throw new Error(`no value for ${c} in ${s}`); return e[c]; };
    }
    throw new Error(`cannot read "${c}" in: ${s}`);
  }
  const f = expr();
  ws();
  if (i !== s.length) throw new Error(`cannot read past "${s.slice(i)}" in: ${s}`);
  return f;
}

const ENV = { x: 2.7, y: 1.9, a: Math.log10(2), b: Math.log10(3) };
const ev = (src, env = ENV) => compile(src)(env);
const close = (u, v) => Number.isFinite(u) && Number.isFinite(v) && Math.abs(u - v) <= 1e-9 * Math.max(1, Math.abs(u), Math.abs(v));

/** A number as the bank prints a typed answer: "7", "-3", "7/3", "2.25". */
function show(x) {
  if (!Number.isFinite(x)) throw new Error(`not a number: ${x}`);
  for (let d = 1; d <= 2000; d++) {
    const n = Math.round(x * d);
    if (Math.abs(x - n / d) < 1e-9) {
      if (d === 1) return String(n);
      // a terminating decimal the prompt asked for as a decimal is handled by the caller
      return `${n}/${d}`;
    }
  }
  throw new Error(`not a small fraction: ${x}`);
}
const decimal = (x) => String(Number(x.toFixed(4)));
const num = (t) => Number(String(t).replace(/,/g, '').replace('−', '-'));
/** "3/4", "−2", "12" → number */
const fr = (t) => { const [p, q] = String(t).replace('−', '-').split('/'); return q ? Number(p) / Number(q) : Number(p); };

/** The one choice whose value is `target`. */
function pickValue(options, target, env = ENV, strip = (o) => o) {
  const good = options.filter((o) => close(ev(strip(o), env), target));
  if (good.length !== 1) throw new Error(`${good.length} choices equal ${target}: ${options.join(' | ')}`);
  return good[0];
}
function only(list, what) {
  if (list.length !== 1) throw new Error(`${list.length} ${what}`);
  return list[0];
}

/** Every real solution of lhs = rhs on [lo, hi]: grid hits and sign changes, bisected. */
function solutions(lhs, rhs, lo = -40, hi = 700) {
  const L = compile(lhs), R = compile(rhs);
  const f = (x) => L({ x }) - R({ x });
  // relative, with no floor: far to the left both sides of 9^(x + 4) = 27^x are nearly 0 without being equal
  const zero = (x) => { const u = L({ x }), v = R({ x }); return Number.isFinite(u) && Number.isFinite(v) && Math.abs(u - v) <= 1e-9 * Math.max(Math.abs(u), Math.abs(v)); };
  const found = [];
  const add = (x) => { if (!found.some((v) => Math.abs(v - x) < 1e-6)) found.push(x); };
  let prevX = null, prevF = NaN;
  for (let j = lo * 100; j <= hi * 100; j++) {
    const x = j / 100;
    const fx = f(x);
    if (Number.isFinite(fx)) {
      if (zero(x)) add(x);
      else if (Number.isFinite(prevF) && !zero(prevX) && prevF * fx < 0) {
        let u = prevX, v = x, fu = prevF;
        for (let it = 0; it < 80; it++) {
          const m = (u + v) / 2, fm = f(m);
          if (fu * fm <= 0) v = m; else { u = m; fu = fm; }
        }
        add((u + v) / 2);
      }
    }
    prevX = x; prevF = fx;
  }
  return found;
}

/** "9 − 3 + 1 − …", "2 + 2/3 + 2/9 + …", "5, −10, 20" → the numbers listed. */
function listed(text) {
  const t = text.replace(/\s*[+−,]?\s*…\s*/g, ' ').trim();
  const out = [];
  const re = /(^|[+−,])\s*(−?\d+(?:\/\d+)?)/g;
  let m;
  while ((m = re.exec(t))) out.push((m[1] === '−' ? -1 : 1) * fr(m[2]));
  if (out.length < 2) throw new Error(`no list in: ${text}`);
  return out;
}

// ── domains ────────────────────────────────────────────────────────────────

const GRID = [];
for (let j = -400; j <= 400; j++) GRID.push(j / 4);
/** x is in the domain when every logarithm has a positive argument: the value is a finite real number. */
const inDomain = (fn) => (x) => Number.isFinite(fn({ x }));

/** A printed inequality or interval → a test on x. */
function region(text) {
  const n = (v) => (v === '−∞' ? -Infinity : (v === '∞' ? Infinity : num(v)));
  let m;
  if ((m = text.match(/^x (>|≥|<|≤) (−?\d+)$/))) {
    const c = n(m[2]);
    return { '>': (x) => x > c, '≥': (x) => x >= c, '<': (x) => x < c, '≤': (x) => x <= c }[m[1]];
  }
  if ((m = text.match(/^(−?\d+) < x < (−?\d+)$/))) return (x) => x > n(m[1]) && x < n(m[2]);
  if ((m = text.match(/^x < (−?\d+) or x > (−?\d+)$/))) return (x) => x < n(m[1]) || x > n(m[2]);
  if ((m = text.match(/^([([])(−?\d+|−∞), (−?\d+|∞)([)\]])$/))) {
    const lo = n(m[2]), hi = n(m[3]);
    return (x) => (m[1] === '[' ? x >= lo : x > lo) && (m[4] === ']' ? x <= hi : x < hi);
  }
  throw new Error(`not a region: ${text}`);
}

// ── hand-typed facts ───────────────────────────────────────────────────────

const PER_YEAR = { annually: 1, semiannually: 2, quarterly: 4, monthly: 12, daily: 365, continuously: Infinity };
const dollars = (x) => String(Math.round(x * 100) / 100);

/** Rules: [pattern, solver]; captures arrive as strings. */
function solveBy(rules, prompt, opts) {
  for (const [re, fn] of rules) {
    const m = prompt.match(re);
    if (m) return String(fn(...m.slice(1), opts));
  }
  throw new Error(`no re-solver rule matches: ${prompt}`);
}

const sub = (n) => String(n).split('').map((ch) => SUBS[Number(ch)]).join('');
const sumTo = (n, f) => { let s = 0; for (let k = 1; k <= n; k++) s += f(k); return s; };
const unsub = (s) => s.split('').map((ch) => SUBS.indexOf(ch)).join('');

// ── one re-solver per skill ────────────────────────────────────────────────

const RESOLVE = {
  'a2-compound-interest-modeling': (p, opts) => solveBy([
    [/^\$([\d,]+) is deposited .* pays (\d+)% annual interest, compounded annually\. .* what is the balance, in dollars, after (\d+) years/,
      (P, r, t) => { let b = num(P); for (let y = 0; y < Number(t); y++) b += b * r / 100; return dollars(b); }],
    [/^\$([\d,]+) is deposited .* pays (\d+)% annual interest, compounded annually\. .* how much interest, in dollars, .* first (\d+) years/,
      (P, r, t) => { let b = num(P); for (let y = 0; y < Number(t); y++) b += b * r / 100; return dollars(b - num(P)); }],
    [/^\$([\d,]+) is deposited .* pays (\d+)% annual interest, compounded semiannually \(twice a year\)\. What is the balance, in dollars, after 1 year/,
      (P, r) => { let b = num(P); for (let h = 0; h < 2; h++) b += b * (r / 2) / 100; return dollars(b); }],
    [/^\$([\d,]+) is invested at (\d+)% annual interest, compounded (\w+)\. Which expression gives the balance after (\d+) years/,
      (P, r, word, t) => {
        const n = PER_YEAR[word];
        const target = n === Infinity ? num(P) * Math.exp(r / 100 * t) : num(P) * Math.pow(1 + r / 100 / n, n * t);
        return pickValue(opts, target);
      }],
    [/earns \d+% annual interest compounded (\w+) for (\d+) years\. What is the value of the exponent nt/, (word, t) => PER_YEAR[word] * t],
    [/modeled by A = \d+\(([\d.]+)\)\^t\. What is the annual interest rate, as a percent/, (g) => show((Number(g) - 1) * 100)],
    [/how often interest is compounded: (.+)\. Which account has the (largest|smallest) balance/, (list, which) => {
      const words = list.split(', ').sort((u, v) => PER_YEAR[u] - PER_YEAR[v]);
      return `The account compounded ${which === 'largest' ? words[words.length - 1] : words[0]}`;
    }],
    [/doubles every (\d+) years\. If \$([\d,]+) is invested, what is its value, in dollars, after (\d+) years/,
      (d, P, N) => { let b = num(P); for (let y = Number(d); y <= Number(N); y += Number(d)) b *= 2; return b; }],
    [/^\$([\d,]+) is invested at (\d+)% annual interest, compounded continuously\. .* number of years it takes for the balance to reach \$([\d,]+)/,
      (P, r, A) => pickValue(opts, Math.log(num(A) / num(P)) / (r / 100))],
    [/pays (\d+)% annual interest, compounded annually\. After 2 years the balance is \$([\d,]+)/,
      (r, A) => dollars(num(A) / (1 + r / 100) / (1 + r / 100))],
  ], p, opts),

  'a2-logarithm-evaluation-conversion': (p, opts) => solveBy([
    [/^Evaluate (.+?)(?:, where log is the common \(base-10\) logarithm)?\.$/, (e) => show(ev(e))],
    [/^Which equation is (\d+)\^(\d+) = (\d+) written in logarithmic form/, (b, k, v) => {
      // every choice reads log_B(A) = C; it is a true statement when B^C = A
      const truths = opts.filter((o) => {
        const m = o.match(/^log([₀-₉]+)\((\d+)\) = (\d+)$/);
        return Math.pow(Number(unsub(m[1])), Number(m[3])) === Number(m[2]);
      });
      // the base stays the base and the exponent becomes the value
      const want = `log${sub(b)}(${v}) = ${k}`;
      if (truths.length !== 1 || truths[0] !== want) throw new Error(`true choices: ${truths.join(' | ')}`);
      return want;
    }],
    [/^Which equation is log([₀-₉]+)\((\d+)\) = (\d+) written in exponential form/, (b, v, k) => {
      const truths = opts.filter((o) => {
        const m = o.match(/^(\d+)\^(\d+) = (\d+)$/);
        return Math.pow(Number(m[1]), Number(m[2])) === Number(m[3]);
      });
      const want = `${unsub(b)}^${k} = ${v}`;
      if (truths.length !== 1 || truths[0] !== want) throw new Error(`true choices: ${truths.join(' | ')}`);
      return want;
    }],
    // log_B(x) = c  ⇔  x = B^c
    [/^Solve for x: log([₀-₉]+)\(x\) = (−?\d+(?:\/\d+)?)\.$/, (b, c) => show(Math.pow(Number(unsub(b)), fr(c)))],
    // log_x(V) = k  ⇔  x^k = V
    [/^The base x in logₓ\((\d+)\) = (\d+) is a positive number/, (v, k) => show(Math.pow(Number(v), 1 / Number(k)))],
  ], p, opts),

  'a2-logarithm-properties': (p, opts) => solveBy([
    [/^Use the properties of logarithms to evaluate (.+)\.$/, (e) => show(ev(e))],
    [/(?:expression|logarithm) is equivalent to (.+)\?$/, (e) => {
      // equal at one point is not enough for an identity: ask at two
      const first = pickValue(opts, ev(e));
      const env2 = { ...ENV, x: 5.3, y: 0.8 };
      if (pickValue(opts, ev(e, env2), env2) !== first) throw new Error('the matching choice changes with x');
      return first;
    }],
  ], p, opts),

  'a2-exponential-logarithmic-equations': (p, opts) => solveBy([
    [/^Solve for x: (.+) = (.+)\.$/, (l, r) => show(only(solutions(l, r), `solutions of ${l} = ${r}`))],
    [/^Which is the exact solution of (.+) = (.+)\?$/, (l, r) => pickValue(opts, only(solutions(l, r, -40, 40), 'solutions'))],
  ], p, opts),

  'a2-domain-analysis-logarithms': (p, opts) => {
    const m = p.match(/(?:f\(x\)|y) = (.+?)(?:\?|, in interval notation\?| has a vertical asymptote)/);
    if (!m) throw new Error(`no function in: ${p}`);
    const ok = inDomain(compile(m[1]));
    if (/^What is the domain/.test(p)) {
      return only(opts.filter((o) => { const reg = region(o); return GRID.every((x) => reg(x) === ok(x)); }), 'choices that are the domain');
    }
    if (/^Which of these x-values is in the domain/.test(p)) return only(opts.filter((o) => ok(num(o))), 'choices in the domain');
    if (/vertical asymptote at x = k/.test(p)) {
      // the edge of the domain: a point outside it right next to a point inside it
      const edges = GRID.filter((x, j) => !ok(x) && ((j > 0 && ok(GRID[j - 1])) || (j + 1 < GRID.length && ok(GRID[j + 1]))));
      return show(only(edges, 'edges of the domain'));
    }
    if (/smallest integer in the domain/.test(p)) {
      for (let x = -100; x <= 100; x++) if (ok(x)) return String(x);
    }
    throw new Error(`no re-solver rule matches: ${p}`);
  },

  'a2-rational-exponents': (p, opts) => solveBy([
    [/^Evaluate (.+)\.$/, (e) => show(ev(e))],
    [/^Which is (.+) written (?:in radical form|with a rational exponent|as a single power of x) \(x > 0\)\?$/, (e) => {
      const first = pickValue(opts, ev(e));
      if (pickValue(opts, ev(e, { x: 0.6 }), { x: 0.6 }) !== first) throw new Error('the matching choice changes with x');
      return first;
    }],
    [/^Simplify (.+), where x > 0\.$/, (e) => {
      const first = pickValue(opts, ev(e));
      if (pickValue(opts, ev(e, { x: 0.6 }), { x: 0.6 }) !== first) throw new Error('the matching choice changes with x');
      return first;
    }],
  ], p, opts),

  'a2-simplifying-radicals-variables': (p, opts) => {
    const m = p.match(/^Simplify (.+?)\.(?: Assume all variables are nonnegative\.)?$/) || p.match(/simplify: (.+?)\.(?: Assume x > 0\.)?$/);
    if (!m) throw new Error(`no re-solver rule matches: ${p}`);
    const first = pickValue(opts, ev(m[1]));
    const env2 = { x: 0.7, y: 3.1 };
    if (pickValue(opts, ev(m[1], env2), env2) !== first) throw new Error('the matching choice changes with x');
    return first;
  },

  'a2-radical-applications': (p) => solveBy([
    [/t = √d \/ 4\. How many seconds does an object take to fall (\d+) feet\?/, (d) => show(Math.sqrt(d) / 4)],
    [/t = √d \/ 4\. An object takes (\d+) seconds to reach the ground/, (t) => show((4 * t) ** 2)],
    [/t = √d \/ 4\. How many seconds longer does an object take to fall (\d+) feet than to fall (\d+) feet/, (d2, d1) => show(Math.sqrt(d2) / 4 - Math.sqrt(d1) / 4)],
    [/from the point \((−?\d+), (−?\d+)\) to the point \((−?\d+), (−?\d+)\)/, (x1, y1, x2, y2) => show(Math.hypot(num(x2) - num(x1), num(y2) - num(y1)))],
    [/s = √\(24d\)\. How fast, in miles per hour, was a car going if it skidded (\d+) feet/, (d) => show(Math.sqrt(24 * d))],
    [/s = √\(24d\)\. A car was traveling (\d+) miles per hour/, (s) => show(s * s / 24)],
    [/d = √\(1\.5h\)\. How many miles can a person see from a height of (\d+) feet/, (h) => show(Math.sqrt(1.5 * h))],
    [/T = 2√L\. What is the period, in seconds, of a pendulum that is ([\d.]+) meters long/, (L) => decimal(2 * Math.sqrt(Number(L)))],
    [/T = 2√L\. How many meters long is a pendulum whose period is ([\d.]+) seconds/, (T) => decimal((Number(T) / 2) ** 2)],
    [/v = √\(64h\)\. How many feet has an object fallen when its speed is (\d+) feet per second/, (v) => show(v * v / 64)],
    [/h = (\d+)√\(t \+ (\d+)\) \+ (\d+)\. After how many days is the seedling (\d+) centimeters tall/, (a, c, b, H) => show(((H - b) / a) ** 2 - c)],
    [/between the points \((−?\d+), (−?\d+)\) and \((−?\d+), y\) is (\d+) units, and y > (−?\d+)/, (x1, y1, x2, D, floor) => {
      if (num(floor) !== num(y1)) throw new Error('y is bounded by something other than the first point');
      return show(num(y1) + Math.sqrt(D * D - (num(x2) - num(x1)) ** 2));
    }],
  ], p),

  'a2-arithmetic-sequences-series': (p) => solveBy([
    [/^What is the (\d+)\w\w term of the arithmetic sequence (.+), …\?$/, (n, list) => {
      const t = listed(list);
      let v = t[0];
      for (let j = 1; j < Number(n); j++) v += t[1] - t[0];
      return v;
    }],
    [/first term (\d+) and (\d+)\w\w term (\d+)\. What is the sum of its first (\d+) terms/, (a, n, last, n2) => {
      if (n !== n2) throw new Error('the term given is not the last one summed');
      // pair the terms from both ends: n/2 pairs, each a + last
      return show(Number(n) * (Number(a) + Number(last)) / 2);
    }],
    [/the (\d+)\w\w term is (−?\d+) and the (\d+)\w\w term is (−?\d+)\. What is the (common difference|sum of the first (\d+) terms|(\d+)\w\w term)/,
      (i, ti, j, tj, what, nSum, nTerm) => {
        const d = (num(tj) - num(ti)) / (j - i);
        const term = (n) => num(ti) + (n - i) * d;
        if (what === 'common difference') return show(d);
        if (nTerm) return show(term(Number(nTerm)));
        return show(sumTo(Number(nSum), term));
      }],
    [/sum of the first (\d+) terms of the arithmetic series (\d+) \+ (\d+) \+ (\d+) \+ …\.$/, (n, a, b) => sumTo(Number(n), (k) => Number(a) + (k - 1) * (b - a))],
    [/^The number (−?\d+) is a term of the arithmetic sequence (.+), …\. Which term is it/, (target, list) => {
      const t = listed(list);
      for (let n = 1; n < 500; n++) if (t[0] + (n - 1) * (t[1] - t[0]) === num(target)) return n;
      throw new Error('never reached');
    }],
    [/sum of the arithmetic series (\d+) \+ (\d+) \+ (\d+) \+ … \+ (\d+)\.$/, (a, b, c, last) => {
      let s = 0;
      let v = Number(a);
      for (; v < Number(last); v += b - a) s += v;
      if (v !== Number(last)) throw new Error('the last term is not in the series');
      return s + v;
    }],
    [/has (\d+) seats in the first row, and each row has (\d+) more seats .* There are (\d+) rows/, (a, d, n) => sumTo(Number(n), (k) => Number(a) + (k - 1) * d)],
    [/first term (\d+) and common difference (\d+)\. How many terms must be added, .* equal (\d+)\?/, (a, d, S) => {
      let s = 0;
      for (let n = 1; n < 500; n++) { s += Number(a) + (n - 1) * d; if (s === Number(S)) return n; }
      throw new Error('never reached');
    }],
    [/^In the arithmetic sequence (.+), …, which term is the first negative term/, (list) => {
      const t = listed(list);
      for (let n = 1; n < 500; n++) if (t[0] + (n - 1) * (t[1] - t[0]) < 0) return n;
      throw new Error('never negative');
    }],
    [/sum of all positive multiples of (\d+) that are less than (\d+)/, (m, N) => { let s = 0; for (let v = Number(m); v < Number(N); v += Number(m)) s += v; return s; }],
  ], p),

  'a2-geometric-sequences-series': (p, opts) => solveBy([
    [/^What is the (\d+)\w\w term of the geometric sequence (.+), …\?/, (n, list) => {
      const t = listed(list);
      return show(t[0] * Math.pow(t[1] / t[0], n - 1));
    }],
    [/^What is the common ratio of the geometric sequence (.+), …\?$/, (list) => { const t = listed(list); return show(t[1] / t[0]); }],
    [/sum of the first (\d+) terms of the geometric series (.+) …\./, (n, list) => {
      const t = listed(list);
      return show(sumTo(Number(n), (k) => t[0] * Math.pow(t[1] / t[0], k - 1)));
    }],
    [/^Which formula gives the nth term of the geometric sequence (.+), …\?$/, (list) => {
      const t = listed(list);
      return only(opts.filter((o) => {
        const f = compile(o.replace(/^a_n = /, ''));
        return t.every((v, j) => close(f({ n: j + 1 }), v));
      }), 'formulas that give the listed terms');
    }],
    [/the (\d+)\w\w term is (−?\d+) and the (\d+)\w\w term is (−?\d+)\. What is the (common ratio|(\d+)\w\w term)/, (i, ti, j, tj, what, n) => {
      if (j - i !== 3) throw new Error('an even gap would leave two possible ratios');
      const r = Math.cbrt(num(tj) / num(ti));
      return what === 'common ratio' ? show(r) : show(num(ti) * Math.pow(r, n - i));
    }],
    [/sent to (\d+) people in round 1\. In each later round, (\d+) times as many .* after (\d+) rounds/, (a, r, n) => sumTo(Number(n), (k) => a * Math.pow(r, k - 1))],
    [/^How many terms of the geometric series (.+) … must be added, .* equal (\d+)\?/, (list, S) => {
      const t = listed(list);
      let s = 0;
      for (let n = 1; n < 60; n++) { s += t[0] * Math.pow(t[1] / t[0], n - 1); if (s === Number(S)) return n; }
      throw new Error('never reached');
    }],
  ], p, opts),

  'a2-sigma-notation': (p, opts) => {
    const total = (termSrc, lo, hi) => { const f = compile(termSrc); let s = 0; for (let k = lo; k <= hi; k++) s += f({ k }); return s; };
    return solveBy([
      [/^Evaluate the sum Σ (.+), where k runs from k = (\d+) to k = (\d+)\.$/, (term, lo, hi) => show(total(term, Number(lo), Number(hi)))],
      [/^How many terms are in the sum Σ .+, where k runs from k = (\d+) to k = (\d+)\?$/, (lo, hi) => { let c = 0; for (let k = Number(lo); k <= Number(hi); k++) c++; return c; }],
      [/^Which of these is the series (.+) written in sigma notation\?$/, (series) => {
        const want = series.split(' + ').map(Number);
        return only(opts.filter((o) => {
          const m = o.match(/^Σ (.+), from k = (\d+) to k = (\d+)$/);
          const f = compile(m[1]);
          const terms = [];
          for (let k = Number(m[2]); k <= Number(m[3]) && terms.length <= want.length; k++) terms.push(f({ k }));
          return terms.length === want.length && terms.every((v, j) => v === want[j]);
        }), 'choices that expand to the series');
      }],
      [/^The sum Σ (.+), where k runs from k = 1 to k = n, equals (\d+)\. What is n\?$/, (term, S) => {
        for (let n = 1; n < 200; n++) if (total(term, 1, n) === Number(S)) return n;
        throw new Error('never reached');
      }],
    ], p, opts);
  },

  'a2-infinite-geometric-series': (p, opts) => {
    const ratio = (text) => { const t = listed(text); if (!close(t[2] / t[1], t[1] / t[0])) throw new Error(`not geometric: ${text}`); return t[1] / t[0]; };
    // a sum to infinity exists only when |r| < 1, and then it is a / (1 − r)
    const toInfinity = (a, r) => { if (!(Math.abs(r) < 1)) throw new Error('diverges'); return a / (1 - r); };
    return solveBy([
      [/^Which of these infinite geometric series converges/, () => only(opts.filter((o) => Math.abs(ratio(o)) < 1), 'convergent choices')],
      [/^Find the sum of the infinite geometric series (.+) …\./, (text) => show(toInfinity(listed(text)[0], ratio(text)))],
      [/first term (\d+) and common ratio (\d+\/\d+)\. What is its sum/, (a, r) => show(toInfinity(Number(a), fr(r)))],
      [/^What is the common ratio of the infinite geometric series (.+) …\?$/, (text) => show(ratio(text))],
      [/^The repeating decimal (0\.\d+)… can be written as the infinite geometric series (.+) …\. Write/, (dec, text) => {
        const v = toInfinity(listed(text)[0], ratio(text));
        if (Math.abs(v - Number(dec)) > 2e-3 && dec.length < 6) throw new Error('the series is not the decimal');
        if (Math.abs(v - Number(dec)) > Math.pow(10, -(dec.length - 2))) throw new Error('the series is not the decimal');
        return show(v);
      }],
      [/first term \d+ and common ratio r\. For which of these values of r/, () => only(opts.filter((o) => Math.abs(fr(o)) < 1), 'choices with |r| < 1')],
      [/common ratio (\d+\/\d+) and sum (\d+)\. What is its first term/, (r, S) => show(Number(S) * (1 - fr(r)))],
      [/dropped from a height of (\d+) feet\. .* bounces up to (\d+\/\d+) of the height/, (h, r) => {
        let fall = Number(h), total = 0;
        for (let j = 0; j < 4000; j++) { total += fall; const rise = fall * fr(r); total += rise; fall = rise; }
        return show(Math.round(total * 1e6) / 1e6);
      }],
      [/first term (\d+) and sum (\d+)\. What is its common ratio/, (a, S) => {
        const r = 1 - a / S;
        if (!(Math.abs(r) < 1)) throw new Error('no such convergent series');
        return show(r);
      }],
      [/^The repeating decimal (0\.\d+)… equals (\d+\/\d+) \+ \((.+) …\)\. Write/, (dec, head, text) => {
        const v = fr(head) + toInfinity(listed(text)[0], ratio(text));
        if (Math.abs(v - Number(dec)) > Math.pow(10, -(dec.length - 2))) throw new Error('the series is not the decimal');
        return show(v);
      }],
      [/^Evaluate the infinite sum Σ (.+), where k runs from k = 1 to infinity\.$/, (term) => {
        const f = compile(term);
        let s = 0;
        for (let k = 1; k <= 3000; k++) s += f({ k });
        return show(Math.round(s * 1e6) / 1e6);
      }],
    ], p, opts);
  },

  'a2-financial-applications': (p, opts) => {
    const grown = (D, pct, n) => { let b = 0; for (let y = 0; y < n; y++) b = b * (1 + pct / 100) + D; return b; };
    return solveBy([
      [/deposits \$([\d,]+) into savings in week 1, and each week deposits \$([\d,]+) more .* over the first (\d+) weeks/,
        (a, d, n) => sumTo(Number(n), (k) => num(a) + (k - 1) * num(d))],
      [/^A (?:car|machine) bought for \$([\d,]+) loses (\d+)% of its value each year\. What is its value, in dollars, after (\d+) years/,
        (P, pct, n) => { let v = num(P); for (let y = 0; y < Number(n); y++) v -= v * pct / 100; return dollars(v); }],
      [/pays \$([\d,]+) in the first year, with a raise of \$([\d,]+) each year after that\. What is the salary, in dollars, in year (\d+)/,
        (S, R, n) => { let v = num(S); for (let y = 2; y <= Number(n); y++) v += num(R); return v; }],
      // a percent change multiplies: up p% is ×(1 + p/100), down p% is ×(1 − p/100)
      [/with a (\d+)% raise each year\. The yearly salaries form which kind of sequence/, (pct) => `A geometric sequence with common ratio ${(100 + Number(pct)) / 100}`],
      [/loses (\d+)% of its value each year\. The machine's values .* form which kind of sequence/, (pct) => `A geometric sequence with common ratio ${(100 - Number(pct)) / 100}`],
      [/pays \$([\d,]+) in the first year, with a raise of \$([\d,]+) each year after that\. What is the total pay, in dollars, over the first (\d+) years/,
        (S, R, n) => sumTo(Number(n), (k) => num(S) + (k - 1) * num(R))],
      [/saves \$(\d+) in week 1 and then saves (twice|three times) as much each week .* after (\d+) weeks/,
        (a, word, n) => sumTo(Number(n), (k) => a * Math.pow(word === 'twice' ? 2 : 3, k - 1))],
      [/^At the end of each year, \$([\d,]+) is deposited .* pays (\d+)% annual interest, compounded annually\. What is the balance, in dollars, just after the 3rd deposit/,
        (D, pct) => dollars(grown(num(D), Number(pct), 3))],
      [/^Job A pays \$([\d,]+) in the first year with a raise of \$([\d,]+) each year\. Job B pays \$([\d,]+) in the first year with a (\d+)% raise each year\. Over the first 3 years/,
        (S, R, S2, pct) => {
          const A = sumTo(3, (k) => num(S) + (k - 1) * num(R));
          const B = sumTo(3, (k) => num(S2) * Math.pow(1 + pct / 100, k - 1));
          if (close(A, B)) throw new Error('the jobs pay the same');
          return dollars(Math.abs(A - B));
        }],
      [/^A \$([\d,]+) loan charges (\d+)% interest per year .* a payment of \$([\d,]+) is made\. .* right after the 2nd payment/,
        (L, pct, pay) => { let b = num(L); for (let y = 0; y < 2; y++) { b += b * pct / 100; b -= num(pay); } return dollars(b); }],
      [/^At the end of each year, \$([\d,]+) is deposited .* pays (\d+)% annual interest, compounded annually\. Which expression gives the balance just after the (\d+)th deposit/,
        (D, pct, n) => pickValue(opts, grown(num(D), Number(pct), Number(n)))],
      [/saves \$(\d+) in week 1 and each week saves \$(\d+) more .* exactly \$([\d,]+)\?/, (a, d, S) => {
        let s = 0;
        for (let n = 1; n < 500; n++) { s += Number(a) + (n - 1) * d; if (s === num(S)) return n; }
        throw new Error('never reached');
      }],
    ], p, opts);
  },
};

// ── the tests ──────────────────────────────────────────────────────────────

describe('course-level items: Algebra 2 (part B)', () => {
  test('the reader of printed math reads what the prompts print', () => {
    expect(ev('2·log₃(x) + log₃(y)', { x: 9, y: 3 })).toBeCloseTo(5);
    expect(ev('log(0.001)')).toBeCloseTo(-3);
    expect(ev('ln(1/e^4)')).toBeCloseTo(-4);
    expect(ev('16^(−3/4)')).toBeCloseTo(1 / 8);
    expect(ev('6x^2y√(2x)', { x: 2, y: 3 })).toBeCloseTo(144);
    expect(ev('3x^2∛(2x)', { x: 4 })).toBeCloseTo(96);
    expect(ev('5√x/x', { x: 4 })).toBeCloseTo(2.5);
    expect(ev('2000(1 + 0.06/12)^(12·5)')).toBeCloseTo(2000 * Math.pow(1.005, 60));
    expect(ev('ln(7)/ln(2) − 3')).toBeCloseTo(Math.log2(7) - 3);
    expect(ev('−x^2', { x: 3 })).toBe(-9);
    expect(ev('k(k + 3)', { k: 2 })).toBe(10);
    expect(() => compile('x > 3')).toThrow();
    expect(() => compile('The account')).toThrow();
    expect(show(-1.5)).toBe('-3/2');
    expect(listed('9 − 3 + 1 − …')).toEqual([9, -3, 1]);
    expect(listed('2 + 2/3 + 2/9 + …')[1]).toBeCloseTo(2 / 3);
    expect(listed('5, −10, 20')).toEqual([5, -10, 20]);
    expect(solutions('log₂(x) + log₂(x − 2)', '3')).toHaveLength(1);
    expect(solutions('x^2', '4', -10, 10).sort()).toEqual([-2, 2]);
  });

  test('every template makes 12 items: three tiers of four', () => {
    expect(bank.TEMPLATES).toHaveLength(13);
    for (const [skill, items] of Object.entries(ITEMS)) {
      expect([skill, items.length]).toEqual([skill, 12]);
      for (const d of [2, 3, 4]) expect(items.filter((i) => i.difficulty === d)).toHaveLength(4);
    }
  });

  test('every template has a re-solver', () => {
    for (const t of bank.TEMPLATES) {
      expect(typeof RESOLVE[t.skillId]).toBe('function');
      expect(t.skillId).toBe(`a2-${t.courseSkill}`);
    }
    expect(Object.keys(RESOLVE).sort()).toEqual(bank.TEMPLATES.map((t) => t.skillId).sort());
  });

  test('the builder accepts every item', () => {
    expect(validate(ALL)).toEqual([]);
  });

  test.each(ALL.map((it) => [it.problemId, it]))('%s re-solves from its own text', (_id, item) => {
    const options = (item.options || []).map((o) => o.text);
    const expected = RESOLVE[item.skillId](item.prompt, options);
    expect(item.answer.value).toBe(String(expected));
    if (item.options) {
      const keyed = item.options.find((o) => o.label === item.correctOption);
      expect(keyed.text).toBe(String(expected));
    }
  });

  test('no two choices of a question have the same value', () => {
    const envs = [ENV, { ...ENV, x: 0.6, y: 3.1 }];
    let checked = 0;
    for (const it of ALL.filter((i) => i.options)) {
      let fns;
      try { fns = it.options.map((o) => compile(o.text.replace(/^a_n = /, ''))); } catch { continue; }
      checked += 1;
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          const same = envs.every((env) => {
            const e = { ...env, n: 3, k: 3 };
            return close(fns[i](e), fns[j](e));
          });
          expect([it.problemId, it.options[i].text, it.options[j].text, same]).toEqual([it.problemId, it.options[i].text, it.options[j].text, false]);
        }
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  test('a simplified radical is fully simplified', () => {
    const cubeFree = (n) => { for (let c = 2; c * c * c <= n; c++) if (n % (c * c * c) === 0) return false; return true; };
    const squareFree = (n) => { for (let c = 2; c * c <= n; c++) if (n % (c * c) === 0) return false; return true; };
    let seen = 0;
    for (const it of ITEMS['a2-simplifying-radicals-variables']) {
      const key = it.answer.value;
      expect(key).not.toMatch(/\/[√∛(]/);                       // no radical left in a denominator
      for (const m of key.matchAll(/([√∛])(?:\((\d*)((?:[a-z](?:\^\d+)?)*)\)|(\d+)|([a-z]))/g)) {
        seen += 1;
        const index = m[1] === '√' ? 2 : 3;
        const coef = Number(m[2] || m[4] || 1);
        expect([key, index === 2 ? squareFree(coef) : cubeFree(coef)]).toEqual([key, true]);
        for (const v of (m[3] || '').matchAll(/[a-z](?:\^(\d+))?/g)) expect(Number(v[1] || 1)).toBeLessThan(index);
      }
    }
    expect(seen).toBeGreaterThan(6);
  });

  test('a typed answer is one number or fraction; everything else is multiple choice', () => {
    for (const it of ALL) {
      if (it.answerType === 'constructed-response') expect(it.answer.value).toMatch(/^-?\d+(\.\d{1,4}|\/\d+)?$/);
      else expect(it.options).toHaveLength(4);
    }
  });

  test('a typed fraction is in lowest terms and never a whole number in disguise', () => {
    const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
    for (const it of ALL) {
      const m = it.answer.value.match(/^-?(\d+)\/(\d+)$/);
      if (m && !it.options) {
        expect(gcd(Number(m[1]), Number(m[2]))).toBe(1);
        expect(Number(m[2])).toBeGreaterThan(1);
      }
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
