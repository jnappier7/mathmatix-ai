/**
 * Exact-rational expression evaluator — the single numeric engine for mathSolver.
 *
 * WHY: the math engine historically had five separate hand-rolled evaluators
 * (two-operand arithmetic, fraction arithmetic, a Function()-based multi-operand
 * chain, a bespoke mixed-number solver, and an embedded last-resort regex). Each
 * had its own parser, its own bugs, and its own answer format — and every
 * "tutor rejected a correct answer" incident traced to one of them mis-computing
 * (16/4*2 → 4, −34+6 → 40, mixed numbers unsupported).
 *
 * This replaces all of that with ONE correct core: parse to exact rationals
 * (BigInt numerator/denominator, so 0.1 + 0.2 = 0.3 and 38/3 - 17/4 = 101/12 with
 * no floating-point error), then format per domain (decimal / fraction / mixed).
 * Mixed numbers, vulgar fractions, operator precedence, parentheses, and Unicode
 * operators all fall out of the same engine.
 *
 * @module rationalEvaluator
 */

const { normalizeMathOperators } = require('./mathUnicodeNormalizer');

// ── Exact rational: { n: BigInt, d: BigInt }, d > 0, reduced ──
function bgcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; }
function rat(n, d = 1n) {
  n = BigInt(n); d = BigInt(d);
  if (d === 0n) return null;
  if (d < 0n) { n = -n; d = -d; }
  const g = bgcd(n < 0n ? -n : n, d) || 1n;
  return { n: n / g, d: d / g };
}
const rAdd = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
const rSub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
const rMul = (a, b) => rat(a.n * b.n, a.d * b.d);
const rDiv = (a, b) => (b.n === 0n ? null : rat(a.n * b.d, a.d * b.n));
function rPow(a, b) {
  if (b.d !== 1n) return null; // only integer exponents (no radicals here)
  let e = b.n;
  const neg = e < 0n; if (neg) e = -e;
  let acc = rat(1n);
  for (let i = 0n; i < e; i++) acc = rMul(acc, a);
  return neg ? rDiv(rat(1n), acc) : acc;
}

// ── Vulgar fraction glyph → [num, den] ──
const VULGAR = {
  '½': [1, 2], '⅓': [1, 3], '⅔': [2, 3], '¼': [1, 4], '¾': [3, 4],
  '⅕': [1, 5], '⅖': [2, 5], '⅗': [3, 5], '⅘': [4, 5], '⅙': [1, 6],
  '⅚': [5, 6], '⅐': [1, 7], '⅛': [1, 8], '⅜': [3, 8], '⅝': [5, 8],
  '⅞': [7, 8], '⅑': [1, 9], '⅒': [1, 10],
};
const VC = Object.keys(VULGAR).join('');

// Rewrite mixed numbers and vulgar fractions as explicit parenthesised rationals:
//   "12 2/3" → "(12+2/3)"   "12⅔" → "(12+2/3)"   "⅔" → "(2/3)"
function preprocess(expr) {
  return expr
    .replace(new RegExp(`(\\d+)\\s*([${VC}])`, 'g'), (_, w, g) => { const [n, d] = VULGAR[g]; return `(${w}+${n}/${d})`; })
    .replace(new RegExp(`[${VC}]`, 'g'), (g) => { const [n, d] = VULGAR[g]; return `(${n}/${d})`; })
    .replace(/(\d+)\s+(\d+\s*\/\s*\d+)/g, '($1+$2)')
    // Implicit multiplication: a value abutting a parenthesis means multiply.
    // Students write derivative/substitution work this way — "f'(2) = 2(2) - 5" —
    // and without this the exact engine returns null, so a correct "-1" can't be
    // verified deterministically and falls back to the (fallible) LLM grader.
    //   "2(2)" → "2*(2)",  ")(" → ")*(",  "(2)3" → "(2)*3"
    // Runs AFTER the fraction/mixed rewrites so the parens they introduce (e.g.
    // "(12+2/3)") get the same treatment. Letters never reach the engine (tokenize
    // rejects them), so function-call forms like "f(2)" are unaffected.
    .replace(/(\d|\))\s*\(/g, '$1*(')
    .replace(/\)\s*(\d|\.)/g, ')*$1');
}

function tokenize(s) {
  const toks = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    if ('+-*/^()'.includes(c)) { toks.push(c); i++; continue; }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i; while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j++;
      const num = s.slice(i, j);
      if ((num.match(/\./g) || []).length > 1) return null; // "1.2.3"
      toks.push(num); i = j; continue;
    }
    return null; // letters or anything non-numeric
  }
  return toks;
}
function numToRat(num) {
  if (!num.includes('.')) return rat(num);
  const [intp, frac] = num.split('.');
  return rat(BigInt((intp || '0') + frac), 10n ** BigInt(frac.length));
}

// Recursive descent: expr(+ -) → term(* /) → pow(^) → unary(±) → atom(number|parens)
function evaluate(exprRaw) {
  const toks = tokenize(exprRaw);
  if (!toks || toks.length === 0) return null;
  let pos = 0, failed = false;
  const peek = () => toks[pos];
  const next = () => toks[pos++];

  function parseExpr() {
    let left = parseTerm(); if (left === null) return null;
    while (peek() === '+' || peek() === '-') { const op = next(); const r = parseTerm(); if (r === null) return null; left = op === '+' ? rAdd(left, r) : rSub(left, r); }
    return left;
  }
  function parseTerm() {
    let left = parsePow(); if (left === null) return null;
    while (peek() === '*' || peek() === '/') { const op = next(); const r = parsePow(); if (r === null) return null; left = op === '*' ? rMul(left, r) : rDiv(left, r); if (left === null) return null; }
    return left;
  }
  function parsePow() {
    const base = parseUnary(); if (base === null) return null;
    if (peek() === '^') { next(); const exp = parsePow(); if (exp === null) return null; return rPow(base, exp); }
    return base;
  }
  function parseUnary() {
    if (peek() === '-') { next(); const v = parseUnary(); return v === null ? null : rat(-v.n, v.d); }
    if (peek() === '+') { next(); return parseUnary(); }
    return parseAtom();
  }
  function parseAtom() {
    const t = peek();
    if (t === '(') { next(); const v = parseExpr(); if (v === null) return null; if (peek() !== ')') { failed = true; return null; } next(); return v; }
    if (t !== undefined && /^[\d.]+$/.test(t)) { next(); return numToRat(t); }
    failed = true; return null;
  }
  const result = parseExpr();
  if (failed || pos !== toks.length || result === null) return null;
  return result;
}

// Format an exact rational per domain mode: 'decimal' | 'fraction' | 'mixed'.
function formatRat(r, mode) {
  if (!r) return null;
  if (mode === 'decimal') {
    const val = Number(r.n) / Number(r.d);
    return Number.isInteger(val) ? String(val) : String(parseFloat(val.toFixed(4)));
  }
  if (r.d === 1n) return String(r.n);
  const neg = r.n < 0n, an = neg ? -r.n : r.n, sgn = neg ? '-' : '';
  if (mode === 'mixed' && an >= r.d) {
    const whole = an / r.d, rem = an % r.d;
    return rem === 0n ? `${sgn}${whole}` : `${sgn}${whole} ${rem}/${r.d}`;
  }
  return `${sgn}${an}/${r.d}`; // proper or improper fraction
}

// Which representation does this expression call for?
function detectMode(originalExpr) {
  if (/\d\s+\d+\s*\/\s*\d+/.test(originalExpr) || new RegExp(`\\d\\s*[${VC}]`).test(originalExpr)) return 'mixed';
  if (/\d\.\d/.test(originalExpr)) return 'decimal';
  if (/\//.test(originalExpr) || new RegExp(`[${VC}]`).test(originalExpr)) return 'fraction';
  return 'decimal';
}

/**
 * Evaluate a numeric expression exactly. Returns { rat, answer, mode } or null
 * if the string isn't a pure numeric expression (letters, malformed, /0).
 * @param {string} originalExpr
 * @param {string} [modeOverride] - force 'decimal' | 'fraction' | 'mixed'
 */
function evalExpression(originalExpr, modeOverride) {
  if (typeof originalExpr !== 'string') return null;
  const normalized = normalizeMathOperators(originalExpr);
  const r = evaluate(preprocess(normalized));
  if (r === null) return null;
  const mode = modeOverride || detectMode(normalized);
  return { rat: r, answer: formatRat(r, mode), mode };
}

/**
 * Numeric value of a mixed number / fraction / decimal / expression, or null.
 * Used by verifyAnswer to grade "8 5/12", "101/12", and "8.4167" as equal.
 */
function expressionValue(str) {
  if (typeof str !== 'string') return null;
  const t = normalizeMathOperators(str).trim();
  if (!t || /[a-z]/i.test(t)) return null;
  const r = evaluate(preprocess(t));
  return r ? Number(r.n) / Number(r.d) : null;
}

module.exports = { evalExpression, expressionValue, evaluate, preprocess, formatRat, detectMode, rat };
