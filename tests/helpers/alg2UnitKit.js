/**
 * What the Algebra 2 unit suites (tests/unit/liveDrillAlg2Unit*.test.js) share: a way to deal one
 * template many times, the printed card read back as plain text, an evaluator for the math as it
 * is PRINTED (so an answer is re-solved from the question the student sees, never read from the
 * bank), and decoders for the figures (a table, a matrix, the curves and dots on a grid).
 *
 * Nothing here knows an answer. The rules each suite checks against are typed in that suite.
 */

// ---------------------------------------------------------------- the card as text

const ENT = { '&nbsp;': ' ', '&le;': '≤', '&ge;': '≥', '&lt;': '<', '&gt;': '>', '&hellip;': '…', '&ldquo;': '"', '&rdquo;': '"', '&rsquo;': "'", '&mdash;': '—', '&amp;': '&' };
/** Card or choice markup as plain text: x<sup>2</sup> → x^(2), a stacked fraction → ((a)/(b)), <br> → " ; ". */
function plain(h) {
  let s = String(h).replace(/<svg[\s\S]*?<\/svg>/g, ' ');
  s = s.replace(/<sup>([\s\S]*?)<\/sup>/g, '^($1)').replace(/<sub>([\s\S]*?)<\/sub>/g, '_$1');
  for (let i = 0; i < 6; i++) s = s.replace(/<span class="frac"><span>([^<]*)<\/span><span>([^<]*)<\/span><\/span>/g, '(($1)/($2))');
  s = s.replace(/<br>/g, ' ; ').replace(/<[^>]*>/g, '');
  s = s.replace(/&[a-z]+;/g, (m) => (m in ENT ? ENT[m] : m));
  return s.replace(/−/g, '-').replace(/\s+/g, ' ').trim();
}
const promptOf = (p) => plain((p.card.match(/<div class="posed-q[^"]*">([\s\S]*?)<\/div>/) || [])[1] || '');
const askOf = (p) => plain(p.head);
const keyOf = (p) => plain(p.choices.find((c) => c.k === p.answer).html);
const wrongsOf = (p) => p.choices.filter((c) => c.k !== p.answer).map((c) => plain(c.html));
const typedOf = (p) => { if (p.input !== 'number') throw new Error(`${p.id}: not a typed play`); return Number(p.answer); };
/** The lines of a stacked prompt. */
const linesOf = (p) => promptOf(p).split(' ; ');
/** "(3, -4)" → [3, -4]; every point in a string. */
const points = (s) => [...String(s).matchAll(/\((-?\d+(?:\.\d+)?(?:, -?\d+(?:\.\d+)?)+)\)/g)].map((m) => m[1].split(', ').map(Number));
const ints = (s) => (String(s).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);

/** A template dealt n times from its own book, with a fixed seed per template. */
function deal(bank, id, n = 120) {
  let s = 2468 + id.length * 7919 + id.charCodeAt(0) * 31;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const others = Object.keys(bank.TEMPLATES).filter((k) => k !== id);
  const out = [];
  for (let i = 0; i < n; i++) out.push(bank.makePlay(bank.TEMPLATES[id].book, others, rand));
  return out;
}

// ---------------------------------------------------------------- the math as printed

/**
 * Evaluate printed math: calc('2(x - 3)^(2) + 1', { x: 4 }), calc('f(g(2))', { fns: { f, g } }).
 * Juxtaposition multiplies; a single letter is a variable unless `fns` names it and "(" follows;
 * − before a power is applied after it (−x² = −(x²)); √, ∛ and |…| are understood; [ ] are ( ).
 */
function calc(text, env = {}) {
  const src = String(text).replace(/−/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/\[/g, '(').replace(/\]/g, ')');
  const toks = src.match(/\d+(?:\.\d+)?|[a-zA-Z]|[-+*/^()|√∛]/g) || [];
  const fns = env.fns || {};
  let i = 0; let bars = 0;
  const peek = () => toks[i];
  const startsAtom = (t) => t !== undefined && (/^[\da-zA-Z(√∛]/.test(t) || (t === '|' && bars === 0));
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') { const op = toks[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  function term() {
    let v = unary();
    for (;;) {
      if (peek() === '*') { i++; v *= unary(); } else if (peek() === '/') { i++; v /= unary(); } else if (startsAtom(peek())) v *= power();
      else return v;
    }
  }
  function unary() { if (peek() === '-') { i++; return -unary(); } if (peek() === '+') { i++; return unary(); } return power(); }
  function power() { const b = atom(); if (peek() === '^') { i++; return b ** unary(); } return b; }
  function atom() {
    const t = toks[i++];
    if (t === undefined) throw new Error(`calc: ran out of input in "${text}"`);
    if (/^\d/.test(t)) return Number(t);
    if (t === '(') { const v = expr(); if (toks[i++] !== ')') throw new Error(`calc: missing ) in "${text}"`); return v; }
    if (t === '|') { bars++; const v = expr(); bars--; if (toks[i++] !== '|') throw new Error(`calc: missing | in "${text}"`); return Math.abs(v); }
    if (t === '√') return Math.sqrt(atom());
    if (t === '∛') return Math.cbrt(atom());
    if (/^[a-zA-Z]$/.test(t)) {
      if (fns[t] && peek() === '(') { i++; const a = expr(); if (toks[i++] !== ')') throw new Error(`calc: missing ) after ${t}( in "${text}"`); return fns[t](a); }
      if (!(t in env)) throw new Error(`calc: no value for "${t}" in "${text}"`);
      return env[t];
    }
    throw new Error(`calc: unexpected "${t}" in "${text}"`);
  }
  const v = expr();
  if (i !== toks.length) throw new Error(`calc: could not read all of "${text}" (stopped at "${toks[i]}")`);
  return v;
}
const close = (a, b, tol = 1e-6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
/** A function of one variable from printed text. */
const fnOf = (text, v = 'x', env = {}) => (x) => calc(text, { ...env, [v]: x });
/** "f(x) = 3x − 5 ; g(x) = x² + 1" (lines) → { f, g }, each able to call the others. Composition circles are unfolded. */
function defs(lines) {
  const fns = {};
  for (const line of lines) {
    const m = String(line).match(/^([a-z])\(([a-z])\) = (.+)$/);
    if (m) fns[m[1]] = (x) => calc(m[3], { [m[2]]: x, fns });
  }
  return fns;
}
/** (f∘g)(2) → f(g(2)); (f∘g∘h)(2) → f(g(h(2))) */
const unfold = (s) => String(s).replace(/\(([a-z])∘([a-z])∘([a-z])\)\(([^()]*)\)/g, '$1($2($3($4)))').replace(/\(([a-z])∘([a-z])\)\(([^()]*)\)/g, '$1($2($3))');
/** Do two printed expressions agree wherever both are defined? Tried at several values of every letter in `vars`. */
function same(a, b, vars = ['x'], env = {}) {
  const sets = [[1.3, 2.1, 0.7, 1.9], [2.6, 0.9, 1.7, 3.1], [3.4, 1.6, 2.3, 0.8], [0.6, 2.8, 3.3, 1.2], [-1.7, 1.1, 2.9, 2.2]];
  let seen = 0;
  for (const vals of sets) {
    const e = { ...env }; vars.forEach((v, i) => { e[v] = vals[i % vals.length]; });
    const x = calc(a, e); const y = calc(b, e);
    if (!Number.isFinite(x) || !Number.isFinite(y)) { if (Number.isFinite(x) !== Number.isFinite(y)) return false; continue; }
    seen++;
    if (!close(x, y, 1e-7)) return false;
  }
  return seen >= 2;
}
/** The letters (variables) a printed expression uses, leaving out any function names. */
const lettersIn = (s, skip = []) => [...new Set((String(s).match(/[a-zA-Z]/g) || []).filter((c) => !skip.includes(c)))];
/** ax² + bx + c read off a function numerically, with its vertex. */
function quadOf(f) {
  const c = f(0); const a = (f(1) + f(-1)) / 2 - c; const b = (f(1) - f(-1)) / 2;
  const h = a ? -b / (2 * a) : NaN;
  return { a, b, c, h, k: a ? f(h) : NaN };
}
/** A printed equation "L = R" as g(env) = L − R. */
function gap(eq) { const [l, r] = String(eq).split(' = '); return (env) => calc(l, env) - calc(r, env); }
/** The root of a printed equation that is linear in `v`. */
function solveLinear(eq, v = 'x', env = {}) { const g = gap(eq); const g0 = g({ ...env, [v]: 0 }); const g1 = g({ ...env, [v]: 1 }); return -g0 / (g1 - g0); }
/** A printed linear equation in the given variables as [coefficients…, constant] with Σ cᵢvᵢ = constant. */
function linear(eq, vars) {
  const g = gap(eq); const zero = Object.fromEntries(vars.map((v) => [v, 0])); const g0 = g(zero);
  return [...vars.map((v) => g({ ...zero, [v]: 1 }) - g0), -g0].map((v) => (v === 0 ? 0 : v)); // no −0
}
/** Solve a square system given as rows [a, b, …, rhs] (Gauss–Jordan); null when it has no single solution. */
function solve(rows) {
  const m = rows.map((r) => r.slice()); const n = m.length;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-9) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = m[r][c] / m[c][c]; for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k]; }
  }
  return m.map((r, i) => r[n] / r[i]).map((v) => (v === 0 ? 0 : v)); // no −0
}
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a) || 1);
/** A number as the fraction text the banks print: 1.5 → "3/2", −0.25 → "-1/4", 3 → "3". */
function fracText(v) {
  for (let q = 1; q <= 12; q++) { const p = v * q; if (Math.abs(p - Math.round(p)) < 1e-9) { const n = Math.round(p); return q === 1 ? String(n) : `${n}/${q}`; } }
  throw new Error(`fracText: ${v} is not a small fraction`);
}
/** "3/2", "-1/4", "5" → the number; reduced() says whether it is in lowest terms with a positive denominator. */
const fracValue = (s) => { const m = String(s).match(/^(-?\d+)(?:\/(\d+))?$/); if (!m) throw new Error(`not a fraction: "${s}"`); return Number(m[1]) / Number(m[2] || 1); };
const reduced = (s) => { const m = String(s).match(/^(-?\d+)(?:\/(\d+))?$/); return !!m && (!m[2] || (Number(m[2]) > 1 && gcd(Number(m[1]), Number(m[2])) === 1)); };

// ---------------------------------------------------------------- the figures

const figs = (p) => p.card.match(/<svg[\s\S]*?<\/svg>/g) || [];
const BLUE = '#2e6fd8'; const RED = '#c2452d';
/** The grid a figure was drawn on, from its size: px → coordinates. */
function gridOf(svg) {
  const W = Number((svg.match(/viewBox="-6 -6 (\d+)/) || [])[1]) - 12;
  const g = { 300: [10, 15], 288: [6, 24], 280: [5, 28] }[W];
  if (!g) throw new Error(`gridOf: not a known grid (${W})`);
  const [R, U] = g;
  return { R, U, x: (px) => px / U - R, y: (py) => R - py / U };
}
/** Every curve of one colour as lists of [x, y]. */
function curves(svg, color = BLUE) {
  const g = gridOf(svg);
  return [...svg.matchAll(/<polyline points="([^"]+)" fill="none" stroke="(#[0-9a-f]+)"/g)].filter((m) => m[2] === color)
    .map((m) => m[1].trim().split(/\s+/).map((q) => { const [px, py] = q.split(',').map(Number); return [g.x(px), g.y(py)]; }));
}
/** Every dot of one colour as [x, y, open]. */
function dots(svg, color = BLUE) {
  const g = gridOf(svg);
  return [...svg.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="[\d.]+" fill="(#[0-9a-f]+)" stroke="(#[0-9a-f]+)"/g)].filter((m) => m[4] === color)
    .map((m) => [g.x(Number(m[1])), g.y(Number(m[2])), m[3] === '#fff']);
}
const r2 = (v) => Math.round(v * 100) / 100;
/** The corners of a graph drawn with straight pieces (the first curve of that colour), rounded to the lattice. */
const corners = (svg, color = BLUE) => curves(svg, color)[0].map(([x, y]) => [Math.round(x), Math.round(y)]);
/** Does a printed function pass through every point of the drawn curves (inside the window)? */
function onCurve(svg, f, color = BLUE, tol = 0.09) {
  const pts = curves(svg, color).flat();
  // (the tolerance grows with the steepness: a drawn point is rounded to a tenth of a pixel in x as well)
  return pts.length >= 2 && pts.every(([x, y]) => { const m = slopeAt(f, x); return Math.abs(f(x) - y) <= tol * (Number.isFinite(m) ? Math.max(1, Math.abs(m)) : 50); });
}
const slopeAt = (f, x) => (f(x + 1e-4) - f(x - 1e-4)) / 2e-4;
/** A two-row table figure → { top, bottom, xs, ys }. */
function tableOf(svg) {
  const t = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1].replace(/−/g, '-'));
  const xs = []; const ys = [];
  for (let i = 2; i < t.length; i += 2) { xs.push(Number(t[i])); ys.push(Number(t[i + 1])); }
  return { top: t[0], bottom: t[1], xs, ys };
}
/** A matrix figure → its entries, row by row (one column: a flat list). */
const matrixOf = (svg) => [...svg.matchAll(/<text[^>]*text-anchor="middle"[^>]*>([^<]*)<\/text>/g)].map((m) => Number(m[1].replace(/−/g, '-')));

/** Every play of every template is well formed (the same contract the other native suites pin). */
function wellFormed(bank, id, n = 100) {
  for (const p of deal(bank, id, n)) {
    expect(p.id).toBe(id); expect(p.card).toBeTruthy(); expect(p.tell).toBeTruthy(); expect(plain(p.summary)).not.toBe('');
    expect(p.card.replace(/<[^>]*>/g, '')).not.toMatch(/[<>]/);
    expect(p.tell.replace(/<[^>]*>/g, '')).not.toMatch(/[<>]/);
    expect(`${p.card}${p.tell}${JSON.stringify(p.choices)}`).not.toMatch(/undefined|NaN|\[object/);
    if (p.input === 'number') { expect(Number.isInteger(Number(p.answer))).toBe(true); if (Number(p.answer) < 0) expect(p.neg).toBe(true); expect(p.revealCard).toContain('posed-ans'); } else {
      expect(p.choices.length).toBeGreaterThanOrEqual(2); expect(p.choices.length).toBeLessThanOrEqual(4);
      expect(new Set(p.choices.map((c) => plain(c.html))).size).toBe(p.choices.length);
      expect(p.choices.map((c) => c.k)).toContain(p.answer); expect(p.card).not.toContain('posed-ans');
    }
  }
}

module.exports = { plain, promptOf, askOf, keyOf, wrongsOf, typedOf, linesOf, points, ints, deal, calc, close, fnOf, defs, unfold, same, lettersIn, quadOf, gap, solveLinear, linear, solve, gcd, fracText, fracValue, reduced,
  figs, gridOf, curves, dots, corners, onCurve, tableOf, matrixOf, r2, BLUE, RED, wellFormed };
