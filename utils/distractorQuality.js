/* ============================================================
   distractorQuality.js — detect broken multiple-choice options
   before they reach a student.

   Motivated by QA P0-3: the Starting Point screener served
   questions whose distractors were never authored, so they
   fell back to placeholder text ("Wrong 1", "Wrong 2", "Wrong
   3") or were the wrong type entirely (integer distractors for
   a sub-1 fraction answer, so the one fraction option gave it
   away). A test-savvy student could place well without knowing
   the math.

   Same discipline as the JSON-envelope leak (P0-1): never render
   an un-authored placeholder to the user. This module is the
   shared detector used in three places:
     - routes/screener.js  — skip a broken question at serve time
     - scripts/checkDistractorQuality.js — read-only bank audit
     - scripts/fixPlaceholderDistractors.js — backfill/deactivate

   It is intentionally HIGH-PRECISION: every check flags a defect
   a human would agree is broken, so the serve-time guard can act
   on it without wrongly dropping good questions. "Answer-
   revealing option text" (e.g. an option written as "0/n = 0")
   is NOT auto-detected here — it needs content/LLM review — so we
   don't risk false positives on it.
   ============================================================ */

'use strict';

// "Wrong", "Wrong 1", "Wrong 3", "wrong  2 " — the un-authored
// distractor placeholder. Anchored so it never matches a real
// answer that merely contains the word "wrong".
const PLACEHOLDER_RE = /^\s*wrong\s*\d*\s*$/i;

function optionText(opt) {
  if (opt == null) return '';
  if (typeof opt === 'object') return String(opt.text ?? '').trim();
  return String(opt).trim();
}

function isPlaceholderOption(opt) {
  return PLACEHOLDER_RE.test(optionText(opt));
}

// Integer literal: "12", "-3".
function looksInteger(s) {
  return /^-?\d+$/.test(String(s).trim());
}

// A value that is genuinely fractional (not an integer in disguise):
// a proper fraction "11/20" or a decimal with a fractional part "0.05".
function looksFractionalOrDecimal(s) {
  const t = String(s).trim();
  const frac = t.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const n = parseInt(frac[1], 10);
    const d = parseInt(frac[2], 10);
    return d !== 0 && n % d !== 0; // proper (non-integer) fraction
  }
  if (/^-?\d*\.\d+$/.test(t)) return parseFloat(t) % 1 !== 0;
  return false;
}

// Which option index is correct — prefer the stored letter, fall
// back to matching option text against the answer value.
/**
 * The numeric value of an option that is ONLY a number: an integer, decimal
 * or simple fraction, optionally signed (hyphen or U+2212), with an optional
 * leading $ or trailing %. Anything else — units, radicals, π, expressions —
 * is null, so the checks built on this never guess.
 */
function numericValue(text) {
  const t = String(text == null ? '' : text).trim().replace(/−/g, '-').replace(/,/g, '');
  const m = /^(-)?\$?(\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*(\d+(?:\.\d+)?))?%?$/.exec(t);
  if (!m) return null;
  const num = parseFloat(m[2]);
  const den = m[3] != null ? parseFloat(m[3]) : 1;
  if (!den) return null;
  const v = num / den;
  return m[1] ? -v : v;
}

// ── Symbolic equality ────────────────────────────────────────────────────
// x⁶ and |x⁶| (or 2√3 and √12) are one answer written two ways, which is as
// much a giveaway as 2/5 next to 4/10. Choices are parsed with mathjs and
// evaluated at fixed sample points; two DIFFERENT texts that agree at every
// point are the same expression. Anything that does not parse to a real
// number (words, equations, coordinates, inequalities) is skipped, never
// guessed at.
let mathjs = null;
function loadMath() {
  if (mathjs === null) { try { mathjs = require('mathjs'); } catch { mathjs = false; } }
  return mathjs || null;
}
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
function toMathjs(text) {
  let t = String(text == null ? '' : text).trim();
  if (!t || t.length > 40 || /[=<>≤≥,;:]|[a-z]{3,}/i.test(t.replace(/\b(sqrt|abs|pi)\b/g, ''))) return null;
  t = t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => '^(' + m.split('').map((c) => SUP[c]).join('') + ')')
    .replace(/−/g, '-').replace(/×|·/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi')
    .replace(/√\s*\(/g, 'sqrt(').replace(/√\s*([0-9.]+|[a-z])/gi, 'sqrt($1)')
    .replace(/\|([^|]+)\|/g, 'abs($1)');
  return t;
}
const SAMPLES = [-2.7, -1.3, 0.6, 1.9, 3.4];

// Equal VALUE is the point of some questions, which test FORM:
//   "Write 1,690,000 in scientific notation"  — 16.9 × 10⁵ is the classic
//     wrong-form distractor next to the key 1.69 × 10⁶;
//   "Simplify: √3 · √6"                         — √18 is the unsimplified form
//     next to the key 3√2.
// Such a pair is allowed only when one member IS the key and the other is
// the recognisable wrong form. Everything else equal stays a defect: two
// orderings of one factorisation, x⁶ next to |x⁶|, or 28.8 × 10⁹ next to
// 2.88 × 10¹⁰ on a question that never asked for scientific notation.
function hasSquareFactor(n) {
  for (let k = 2; k * k <= n; k++) if (n % (k * k) === 0) return true;
  return false;
}
function isWrongFormOf(prompt, other) {
  const t = String(other || '').replace(/−/g, '-');
  if (/scientific notation/i.test(prompt)) {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*[×x*]\s*10/.exec(t);
    if (m) { const c = Math.abs(parseFloat(m[1])); return c < 1 || c >= 10; }
  }
  if (/\bsimplif|simplest/i.test(prompt)) {
    const m = /√\s*\(?\s*(\d+)\s*\)?/.exec(t);
    if (m) return hasSquareFactor(parseInt(m[1], 10));
  }
  return false;
}
// "3 × 4" as an answer is a dimension (a matrix, a rectangle), not a product.
const DIMENSION = /^\s*\d+\s*[×x]\s*\d+\s*$/;
function expressionSignature(text) {
  const math = loadMath();
  const src = toMathjs(text);
  if (!math || !src) return null;
  let node;
  try { node = math.parse(src); } catch { return null; }
  const vars = new Set();
  node.traverse((n) => { if (n.isSymbolNode && !['pi', 'e', 'sqrt', 'abs'].includes(n.name)) vars.add(n.name); });
  if (vars.size > 1) return null;
  const v = [...vars][0];
  let code;
  try { code = node.compile(); } catch { return null; }
  const out = [];
  for (const x of (v ? SAMPLES : [0])) {
    let y;
    try { y = code.evaluate(v ? { [v]: x } : {}); } catch { return null; }
    if (typeof y !== 'number' || !Number.isFinite(y)) return null;
    out.push(y);
  }
  return { variable: v || null, values: out };
}
function sameSignature(a, b) {
  if (!a || !b || a.variable !== b.variable || a.values.length !== b.values.length) return false;
  return a.values.every((y, i) => Math.abs(y - b.values[i]) <= 1e-9 * Math.max(1, Math.abs(y), Math.abs(b.values[i])));
}

// A stem that asks for a probability ("What is the probability that…?",
// "find the probability"). Not one that merely mentions it on the way to a
// count ("…how many of the 200 days?").
const ASKS_PROBABILITY = /\b(?:what is the probability|find the probability|probability (?:that|of)[^?]*\?\s*$)/i;
function asProbability(text) {
  const t = String(text == null ? '' : text).trim();
  const v = numericValue(t);
  if (v == null) return null;
  return /%$/.test(t) ? v / 100 : v;
}

function correctOptionIndex(problem) {
  const options = Array.isArray(problem.options) ? problem.options : [];
  const co = problem.correctOption;
  if (typeof co === 'string' && /^[a-fA-F]$/.test(co.trim())) {
    const idx = co.trim().toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) return idx;
  }
  const answerValue = String(problem.answer?.value ?? problem.answer ?? '').trim().toLowerCase();
  if (answerValue) {
    for (let i = 0; i < options.length; i++) {
      if (optionText(options[i]).toLowerCase() === answerValue) return i;
    }
  }
  return null;
}

/**
 * Assess the multiple-choice options of a problem.
 *
 * @param {object} problem - a Problem doc or plain object with
 *   { answerType, options:[{label,text}], answer:{value}, correctOption }
 * @returns {{ ok: boolean, issues: Array<{code:string, detail?:string}> }}
 *   `ok` is true when nothing is wrong. For non-MC problems with no
 *   options, always `ok` (nothing to assess).
 */
function assessOptions(problem) {
  const issues = [];
  const options = Array.isArray(problem.options) ? problem.options : [];
  const isMC = problem.answerType === 'multiple-choice' || options.length > 0;

  if (!isMC) return { ok: true, issues };

  if (options.length < 2) {
    issues.push({ code: 'too_few_options', detail: `${options.length} option(s)` });
    return { ok: false, issues };
  }

  const texts = options.map(optionText);

  // 1) Un-authored placeholder distractors.
  const placeholders = texts.filter((t) => PLACEHOLDER_RE.test(t));
  if (placeholders.length) {
    issues.push({ code: 'placeholder_option', detail: placeholders.join(', ') });
  }

  // 2) Structural defects.
  if (texts.some((t) => t === '')) issues.push({ code: 'blank_option' });
  const lowered = texts.map((t) => t.toLowerCase());
  if (new Set(lowered).size < lowered.length) {
    issues.push({ code: 'duplicate_option' });
  }

  // 2b) Two different-looking choices with the same value (2/5 and 4/10,
  //     0.5 and 1/2). Only one answer can be right, so a student can strike
  //     both without doing the problem — and if the key is one of them, the
  //     item has two right answers. Exempt: "Which is NOT equal to…" /
  //     "EXCEPT" items, where several equal choices are the design.
  const prompt = String(problem.prompt || problem.content || '');
  const negated = /\b(NOT|EXCEPT)\b/.test(prompt);
  const values = negated ? [] : texts.map(numericValue);
  const seen = new Map();
  const equal = [];
  values.forEach((v, i) => {
    if (v == null) return;
    const key = v.toFixed(9);
    if (seen.has(key) && lowered[seen.get(key)] !== lowered[i]) equal.push(`${texts[seen.get(key)]} = ${texts[i]}`);
    else seen.set(key, i);
  });
  // Same idea for expressions: x⁶ and |x⁶|, 2√3 and √12.
  if (!negated && !equal.length) {
    const keyIdx = correctOptionIndex(problem);
    const sigs = texts.map((t) => (DIMENSION.test(t) ? null : expressionSignature(t)));
    for (let i = 0; i < sigs.length; i++) {
      for (let j = i + 1; j < sigs.length; j++) {
        if (lowered[i] === lowered[j] || values[i] != null || !sameSignature(sigs[i], sigs[j])) continue;
        const formPair = (i === keyIdx && isWrongFormOf(prompt, texts[j]))
          || (j === keyIdx && isWrongFormOf(prompt, texts[i]));
        if (!formPair) equal.push(`${texts[i]} = ${texts[j]}`);
      }
    }
  }
  if (equal.length) issues.push({ code: 'equivalent_options', detail: equal.join('; ') });

  // 2c) A probability question offering a "probability" above 1 or below 0
  //     (23/22, 140%): a free elimination. Only when the key itself is a valid
  //     probability, so a count asked about in a probability setting is safe.
  if (ASKS_PROBABILITY.test(prompt)) {
    const probs = texts.map(asProbability);
    const keyIdx = correctOptionIndex(problem);
    const keyP = keyIdx != null ? probs[keyIdx] : null;
    if (keyP != null && keyP >= 0 && keyP <= 1) {
      const impossible = texts.filter((t, i) => probs[i] != null && (probs[i] < 0 || probs[i] > 1));
      if (impossible.length) issues.push({ code: 'impossible_probability', detail: impossible.join(', ') });
    }
  }

  // 3) Wrong-type distractors: the correct answer is a proper
  //    fraction/decimal but EVERY distractor is a plain integer, so
  //    the odd-one-out is trivially identifiable without the math.
  const correctIdx = correctOptionIndex(problem);
  if (correctIdx != null) {
    const correctText = texts[correctIdx];
    const distractors = texts.filter((_, i) => i !== correctIdx);
    if (
      looksFractionalOrDecimal(correctText) &&
      distractors.length > 0 &&
      distractors.every(looksInteger)
    ) {
      issues.push({
        code: 'wrong_type_distractors',
        detail: `fraction/decimal answer "${correctText}" among integer-only distractors [${distractors.join(', ')}]`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

// Convenience predicate for hot paths.
function hasBadDistractors(problem) {
  return !assessOptions(problem).ok;
}

module.exports = {
  PLACEHOLDER_RE,
  assessOptions,
  isPlaceholderOption,
  hasBadDistractors,
  numericValue,
  // exported for tests / scripts
  correctOptionIndex,
  looksFractionalOrDecimal,
  looksInteger,
};
