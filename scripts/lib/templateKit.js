'use strict';
/**
 * templateKit — shared helpers for parameterised problem generation.
 *
 * The point of templating: the ANSWER IS COMPUTED, never authored. A template
 * picks numbers, derives the answer from those numbers in code, and writes the
 * explanation from the same values. That makes a wrong answer a programming
 * error rather than a typo, which is the only way to add hundreds of items
 * without hand-checking every one.
 *
 * Determinism is required, not incidental: the generator is committed output,
 * so a re-run must reproduce the same file byte-for-byte or every rebuild looks
 * like a content change. Hence a seeded PRNG, never Math.random.
 */

/** Mulberry32 — small, fast, deterministic. */
function rngFrom(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (rng, arr) => arr[int(rng, 0, arr.length - 1)];
const nonZero = (rng, lo, hi) => { let v = 0; while (v === 0) v = int(rng, lo, hi); return v; };

const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a, b) => Math.abs(a * b) / gcd(a, b);

/** Format a signed term for display: 3 → "+ 3", -3 → "− 3". */
const signed = (n) => (n < 0 ? `− ${Math.abs(n)}` : `+ ${n}`);

/** "3x", "-x", "x" — coefficient attached to a variable. */
function coefTerm(c, v = 'x') {
  if (c === 1) return v;
  if (c === -1) return `-${v}`;
  return `${c}${v}`;
}

/** Reduce a fraction to lowest terms, keeping the sign on the numerator. */
function reduce(n, d) {
  if (d === 0) throw new Error('zero denominator');
  const g = gcd(n, d) || 1;
  let num = n / g;
  let den = d / g;
  if (den < 0) { num = -num; den = -den; }
  return [num, den];
}

/** Render a rational as "3", "3/4" or "-3/4". */
function frac(n, d) {
  const [a, b] = reduce(n, d);
  return b === 1 ? String(a) : `${a}/${b}`;
}

/** Largest perfect square dividing n (for radical simplification). */
function largestSquareFactor(n) {
  let best = 1;
  for (let k = 1; k * k <= n; k++) if (n % (k * k) === 0) best = k * k;
  return best;
}

/**
 * ASCII / whitespace surface forms so exact-match grading accepts what the
 * student actually types (the U+2212 defect fixed in PR #1409).
 */
function equivalentsFor(value) {
  const v = String(value);
  const out = new Set([
    v.replace(/[−–]/g, '-').replace(/×/g, '*').replace(/÷/g, '/'),
    v.replace(/\s+/g, ''),
    v.replace(/[−–]/g, '-').replace(/\s+/g, ''),
  ]);
  out.delete(v);
  return [...out].filter(Boolean);
}

/**
 * Build a schema-valid Problem from a template's output.
 * Multiple-choice when `options` is supplied; constructed-response otherwise.
 */
function buildItem({ skillId, prompt, value, explanation, difficulty, gradeBand, options, correctOption, source, idx }) {
  const crypto = require('crypto');
  const item = {
    problemId: `${source}-${skillId}-${String(idx).padStart(3, '0')}`,
    skillId,
    prompt,
    svg: null,
    answer: { type: 'exact', value: String(value), equivalents: equivalentsFor(value) },
    answerType: options ? 'multiple-choice' : 'constructed-response',
    difficulty,
    gradeBand,
    explanation,
    tags: [source, `subskill:${skillId}`],
    source,
    contentHash: crypto.createHash('sha256').update(`${skillId}|${prompt}|${value}`).digest('hex'),
    isActive: true,
  };
  if (options) {
    item.options = options.map((text, i) => ({ label: 'ABCD'[i], text: String(text) }));
    item.correctOption = correctOption;
  }
  return item;
}

module.exports = {
  rngFrom, int, pick, nonZero, gcd, lcm, signed, coefTerm, reduce, frac,
  largestSquareFactor, equivalentsFor, buildItem,
};
