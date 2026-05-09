// utils/orchestrator/answerEvaluator.js
// Quick math-equivalence evaluator for the answer-attempt path. Used in
// parallel with the interrupt classifier on every STT-final — when the
// classifier says "answer_attempt" the verdict here decides routing, and
// when the evaluator has no `expect` it returns 'cannot-evaluate' so the
// classifier wins.
//
// No mathjs in this build — we normalize both sides and compare. That
// covers the vast majority of K-12 cases (linear equations, simple
// fractions, integers, decimals). Extend with a CAS later if needed;
// the API stays the same.

'use strict';

/**
 * @param {string} studentText            What the student said/typed.
 * @param {import('./types').ExpectSpec|null} expect
 * @returns {{verdict:'correct'|'incorrect'|'cannot-evaluate', confidence:number, normalizedStudent?:string, normalizedTarget?:string, reason?:string}}
 */
function evaluate(studentText, expect) {
  if (!expect || !expect.kind) {
    return { verdict: 'cannot-evaluate', confidence: 0, reason: 'no_expect' };
  }
  const text = (studentText || '').trim();
  if (!text) return { verdict: 'cannot-evaluate', confidence: 0, reason: 'empty_student' };

  switch (expect.kind) {
    case 'choice':         return evaluateChoice(text, expect);
    case 'free-text':      return evaluateFreeText(text, expect);
    case 'math-equiv':     return evaluateMath(text, expect);
    case 'any':            return { verdict: 'cannot-evaluate', confidence: 0, reason: 'kind_any' };
    default:               return { verdict: 'cannot-evaluate', confidence: 0, reason: 'unknown_kind' };
  }
}

function evaluateChoice(text, expect) {
  const candidates = [expect.target, ...(expect.acceptable || [])].filter(Boolean);
  if (!candidates.length) return { verdict: 'cannot-evaluate', confidence: 0, reason: 'no_target' };
  const norm = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const c of candidates) {
    const cnorm = String(c).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cnorm && norm === cnorm) {
      return { verdict: 'correct', confidence: 0.95, normalizedStudent: norm, normalizedTarget: cnorm };
    }
  }
  return { verdict: 'incorrect', confidence: 0.85, normalizedStudent: norm };
}

function evaluateFreeText(text, expect) {
  const candidates = [expect.target, ...(expect.acceptable || [])].filter(Boolean);
  if (!candidates.length) return { verdict: 'cannot-evaluate', confidence: 0, reason: 'no_target' };
  const norm = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const c of candidates) {
    const cnorm = String(c).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cnorm && norm === cnorm) {
      return { verdict: 'correct', confidence: 0.85, normalizedStudent: norm, normalizedTarget: cnorm };
    }
    // Substring containment with a length floor — guards against "yes" matching "yes I think 4 is the answer"
    if (cnorm && cnorm.length >= 3 && norm.includes(cnorm)) {
      return { verdict: 'correct', confidence: 0.7, normalizedStudent: norm, normalizedTarget: cnorm };
    }
  }
  return { verdict: 'incorrect', confidence: 0.65, normalizedStudent: norm };
}

function evaluateMath(text, expect) {
  const candidates = [expect.target, ...(expect.acceptable || [])].filter(Boolean);
  if (!candidates.length) return { verdict: 'cannot-evaluate', confidence: 0, reason: 'no_target' };
  const studentNum = extractNumeric(text);
  for (const c of candidates) {
    const targetNum = extractNumeric(c);
    if (studentNum != null && targetNum != null) {
      const tol = (expect.domain && expect.domain.tolerance) || 1e-6;
      if (Math.abs(studentNum - targetNum) <= tol) {
        return {
          verdict: 'correct', confidence: 0.92,
          normalizedStudent: String(studentNum),
          normalizedTarget: String(targetNum),
        };
      }
    }
    // Symbolic string compare as fallback
    const sNorm = normalizeMathString(text);
    const tNorm = normalizeMathString(c);
    if (sNorm && tNorm && sNorm === tNorm) {
      return {
        verdict: 'correct', confidence: 0.85,
        normalizedStudent: sNorm, normalizedTarget: tNorm,
      };
    }
  }
  // Could not match — but only call it incorrect if we successfully
  // extracted SOMETHING from the student. If we got nothing, it's
  // cannot-evaluate (e.g. student said "I think so").
  if (studentNum != null || normalizeMathString(text)) {
    return { verdict: 'incorrect', confidence: 0.75 };
  }
  return { verdict: 'cannot-evaluate', confidence: 0, reason: 'no_extraction' };
}

/**
 * Extract a single numeric value from natural-language student input.
 * Handles "x equals 6", "the answer is 6", "6", "six", "negative 3", "1/2",
 * "0.5". Returns null if nothing parseable found.
 */
function extractNumeric(input) {
  if (input == null) return null;
  let s = String(input).trim().toLowerCase();

  // Strip equation prefix: "x = 6" → "6", "y equals 12" → "12"
  s = s.replace(/^.*?(=|equals|is)\s+/i, '');

  // Words → digits for small numbers (covers most K-8 spoken answers)
  const WORD_TO_NUM = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
    seventy: 70, eighty: 80, ninety: 90, hundred: 100,
    half: 0.5, third: 1 / 3, quarter: 0.25,
  };
  // "negative six" → "-6", "minus six" → "-6"
  let sign = 1;
  s = s.replace(/^\s*(negative|minus)\s+/i, () => { sign = -1; return ''; });

  // Direct numeric: "6", "-3.14", "1/2"
  const fracMatch = s.match(/^\s*(-?\d+)\s*\/\s*(-?\d+)\s*$/);
  if (fracMatch) {
    const num = parseFloat(fracMatch[1]);
    const den = parseFloat(fracMatch[2]);
    if (den !== 0) return sign * (num / den);
  }
  const numMatch = s.match(/-?\d+(?:\.\d+)?/);
  if (numMatch) return sign * parseFloat(numMatch[0]);

  // Word match
  const word = s.match(/[a-z]+/);
  if (word && WORD_TO_NUM[word[0]] != null) return sign * WORD_TO_NUM[word[0]];

  return null;
}

/**
 * Loose symbolic normalizer — strips whitespace, LaTeX delimiters, and
 * common cosmetic differences. NOT a real CAS; equivalent expressions
 * with different forms (e.g. "2(x+1)" vs "2x+2") will not match.
 */
function normalizeMathString(input) {
  if (input == null) return '';
  let s = String(input).toLowerCase();
  // Strip LaTeX delimiters
  s = s.replace(/\\\(|\\\)|\\\[|\\\]|\$\$|\$/g, '');
  // Strip LaTeX backslash commands (\\frac → frac, etc.) — keep the word
  s = s.replace(/\\([a-z]+)/g, '$1');
  // Strip braces
  s = s.replace(/[{}]/g, '');
  // "x equals 6" → "x=6"
  s = s.replace(/\bequals\b/g, '=');
  // Spoken operators
  s = s.replace(/\bplus\b/g, '+').replace(/\bminus\b/g, '-')
       .replace(/\btimes\b/g, '*').replace(/\bdivided by\b/g, '/');
  // Whitespace
  s = s.replace(/\s+/g, '').trim();
  return s;
}

module.exports = { evaluate, extractNumeric, normalizeMathString };
