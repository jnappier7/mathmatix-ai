/**
 * Does a reply carry an IDEA in words, or is it math with some filler?
 *
 * Both conceptual-routing gates (observe's conceptualReply, llmVerifier's
 * isProseAnswer) counted any run of letters as words. Function names are
 * letters, so "oh so 2x sinx + x^2 cosx" — a correct product-rule answer —
 * read as prose, went to the conceptual judge, and was rejected at 0.95
 * (live, AP Calculus, 2026-11-03). Any answer with sin/cos/tan/log/ln/sqrt and
 * no "x =" was exposed to the same misgrade.
 *
 * A word counts only when it is neither math vocabulary (a function name, even
 * glued to its argument as in "sinx" or "cos2x"; a spelled-out operation or
 * number) nor conversational filler ("oh so", "i think it's"). One idea word is
 * enough — "it's a hole" is a conceptual answer.
 *
 * @module pipeline/ideaWords
 */

const MATH_FUNCTION = /^(?:arc)?(?:sin|cos|tan|sec|csc|cot)h?|^(?:log|ln|exp|sqrt|lim|max|min|abs|mod|det)/i;

const MATH_WORDS = new Set([
  'pi', 'theta', 'alpha', 'beta', 'delta', 'lambda', 'sigma', 'infinity', 'inf', 'dx', 'dy', 'dt',
  'sine', 'cosine', 'tangent', 'secant', 'cosecant', 'cotangent',
  'plus', 'minus', 'times', 'over', 'divided', 'by', 'equals', 'squared', 'cubed', 'power',
  'root', 'square', 'cube', 'negative', 'positive', 'half', 'third', 'quarter', 'point',
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
]);

const FILLER = new Set([
  'oh', 'ok', 'okay', 'so', 'um', 'uh', 'hmm', 'well', 'wait', 'then', 'now', 'like', 'yeah', 'yes',
  'i', 'im', "i'm", 'think', 'guess', 'maybe', 'its', "it's", 'it', 'is', 'be', 'would', 'should',
  'the', 'a', 'an', 'answer', 'and', 'that', 'this', 'get', 'got', 'gives', 'thats', "that's",
]);

function isMathToken(word) {
  const w = word.toLowerCase();
  if (MATH_WORDS.has(w)) return true;
  // A function name with its argument glued on: "sinx", "cos2x", "ln(x)" (the
  // parens are stripped before we get here). The tail must be short math, so
  // "minimum" or "cosmic" stay words.
  const fn = w.match(MATH_FUNCTION);
  if (fn) return /^[a-z]?\d*[a-z]?$/.test(w.slice(fn[0].length));
  return false;
}

/**
 * @param {string} text
 * @returns {boolean} true when at least one word is neither math nor filler
 */
function hasIdeaWords(text) {
  if (!text || typeof text !== 'string') return false;
  const words = text.toLowerCase().match(/[a-z][a-z']*/g) || [];
  return words.some(w => w.length >= 2 && !FILLER.has(w) && !isMathToken(w));
}

module.exports = { hasIdeaWords };
