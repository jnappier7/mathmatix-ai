'use strict';
/**
 * VERIFY TOPIC — label the posed problem for the verifier metrics ring.
 *
 * Why this exists: verifyMetrics records how often answer verification fails to
 * resolve, but not on WHAT, so any decision about widening solver/CAS coverage is
 * guesswork. This produces the ranking key.
 *
 * Two-level taxonomy, because one level isn't actionable:
 *   1. mathSolver's own parse type ('quadratic_equation', 'derivative', …) when
 *      the deterministic solver recognises the problem.
 *   2. 'unparsed:<shape>' when it doesn't. The unparsed set is precisely the
 *      population worth subdividing — trig identities, integrals, proofs, word
 *      problems and interval notation all land there, and lumping them into one
 *      bucket would say "most failures are unparsed", which is already known and
 *      tells you nothing about where to spend effort.
 *
 * Everything here is a bounded label. The problem TEXT never leaves this module —
 * only a taxonomy string, so nothing student-authored reaches the logs.
 *
 * @module pipeline/verifyTopic
 */

const { parseCleanProblem } = require('../mathSolver');

// Coarse shape of a problem the deterministic solver could not parse. Ordered:
// first match wins, most specific first. These are deliberately the classes that
// map to concrete coverage work — mostly latexToExpr rules in symbolicVerifier —
// not a general topic ontology.
const SHAPES = [
  // \int(?![a-z]) not \\int\b — in '\int_0^1' the next char is '_', a word
  // character, so \b never fires and the commonest integral form scored 'other'.
  ['integral', /\\int(?![a-z])|∫|\bantiderivative\b|\bintegrat(e|ion)\b|\bintegral\b/i],
  ['limit', /\\lim\b|\blimit\s+(of|as)\b/i],
  ['derivative', /\bd\s*\/\s*d[a-z]\b|\\frac\s*\{\s*d\s*\}|\bderivative\b|\bdifferentiate\b|f'\s*\(/i],
  ['matrix', /\\begin\{[pbv]?matrix\}|\bmatrix\b|\bdeterminant\b|\beigen/i],
  ['proof', /\bprove\b|\bproof\b|\bshow that\b|\bjustify\b/i],
  ['trig', /\\?(sin|cos|tan|csc|sec|cot|arcsin|arccos|arctan)\b|\bidentity\b|\bradians?\b|\btheta\b|θ/i],
  ['logarithm', /\\log|\\ln\b|\blog_|\blogarithm/i],
  ['interval_notation', /interval notation|[[(]\s*-?\s*\\?infty|\\?infty\s*[)\]]|\bdomain\b|\brange\b/i],
  ['system', /\bsystem of\b|\\begin\{cases\}|\bsimultaneous\b/i],
  ['inequality', /[<>≤≥]|\\le\b|\\ge\b|\\leq|\\geq|\binequality\b/i],
  ['sequence_series', /\bsequence\b|\bseries\b|\\sum\b|∑|\bnth term\b|\brecursive\b/i],
  ['geometry', /\btriangle\b|\bcircle\b|\bangle\b|\bperimeter\b|\barea\b|\bvolume\b|\bradius\b|\bcongruent\b|\bsimilar\b/i],
  ['probability_stats', /\bprobability\b|\bmean\b|\bmedian\b|\bmode\b|\bstandard deviation\b|\bodds\b/i],
  ['word_problem', /\bhow (many|much|far|long|old)\b|\btotal cost\b|\bper (hour|day|week|item)\b|\bmph\b|\baltogether\b/i],
];

/**
 * Shape of an unparsed problem.
 * @param {string} text
 * @returns {string} one of the SHAPES keys, or 'other'
 */
function unparsedShape(text) {
  for (const [name, re] of SHAPES) {
    if (re.test(text)) return name;
  }
  return 'other';
}

/**
 * Label the posed problem for the metrics ring.
 * Never throws — a metrics label must not be able to fail a tutoring turn.
 * @param {string|null} problemText - the problem the tutor posed
 * @returns {string|null} e.g. 'quadratic_equation', 'unparsed:integral', or null
 *   when there is no problem to label
 */
function mathTypeOf(problemText) {
  if (!problemText || typeof problemText !== 'string') return null;
  try {
    // The type lives on .problem, not the top level — parseCleanProblem returns
    // { hasMath, problem, solution }. Reading .type directly labels every turn
    // unparsed, which reads as total solver failure instead of a field typo.
    const parsedType = parseCleanProblem(problemText)?.problem?.type;
    if (parsedType) return parsedType;
  } catch {
    // Fall through to the shape label — a parse crash is still an unparsed turn.
  }
  return `unparsed:${unparsedShape(problemText)}`;
}

module.exports = { mathTypeOf, unparsedShape, SHAPES };
