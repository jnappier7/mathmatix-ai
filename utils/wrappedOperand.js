// ── Wrapped-operand demotion ──
//
// A pure-numeric expression that the text states as the OPERAND of a unary
// wrapper ("the absolute value of 3 - 10", "the opposite of 3 - 10", "the square
// root of 16 - 7", "|3 - 10|") is not the problem; f(operand) is.
//
// Production, 2026-09-30 (Absolute Value warm-up): the tutor asked "What is the
// absolute value of \(3 - 10\)?". The catch-all grabbed 3 - 10, persist stored
// -7 as the answer, and the student's correct 7 was rejected on two consecutive
// turns. Absolute value now has its own detector in mathSolver; this guard is
// the safety net for every wrapper we DON'T model and for the ambiguous
// ungrouped prose forms the detector deliberately leaves alone. Callers emit no
// parse and no verdict, so grading falls through to the LLM verifier, which
// sees the wording. Never a wrong number.
//
// Shared by mathSolver.parseCleanProblem (the persist/diagnose target scan) and
// symbolicVerifier.detectPosedArithmetic (the sub-step tier that runs when that
// scan found nothing) — both must refuse the same shape, or the second one
// re-creates the verdict the first removed. It lives in its own module so a
// test that mocks mathSolver wholesale still leaves the verifier a real guard.
//
// Judged on the flattened text (spaces removed, Unicode/LaTeX normalized), so
// "absolute value of \(3 - 10\)" and "absolutevalueof3-10" are the same shape.

const { normalizeMathOperators, normalizeMathUnicode } = require('./mathUnicodeNormalizer');

const WRAPPER_BEFORE_OPERAND_RX = new RegExp(
    '(?:absolutevalueof|absolutevalue|abs|oppositeof|negativeof|negationof|negative'
    + '|reciprocalof|squareof|cubeof|squarerootof|cuberootof|sqrt|cbrt|rootof'
    + '|halfof|thirdof|quarterof|double|twice|triple'
    + '|(?:additive|multiplicative)?inverseof|magnitudeof|distancefromzeroof)'
    // Opening delimiters, or the sign a lossy pattern dropped from the operand
    // ("absolute value of -7 minus 3" parsed as 7 - 3: the hay reads "…of-7-3").
    + '[-(|\\\\]*$',
    'i'
);

function flattenMath(s) {
    return normalizeMathOperators(normalizeMathUnicode(String(s || ''))).replace(/\s+/g, '');
}

// Spoken operators → symbols, so "-7 minus 3" and "-7 - 3" flatten alike.
function wordOperatorsToSymbols(s) {
    return String(s || '')
        .replace(/\bplus\b/gi, '+')
        .replace(/\bminus\b/gi, '-')
        .replace(/\btimes\b|\bmultiplied\s+by\b/gi, '*')
        .replace(/\bdivided\s+by\b/gi, '/');
}

/**
 * Is `expression` (pure arithmetic) stated in `text` as the operand of a unary
 * wrapper — pipes on both sides, or a wrapper phrase directly before it?
 * @param {string} expression - e.g. "3 - 10"
 * @param {string} text - the whole message it was pulled from
 * @returns {boolean}
 */
function isWrappedOperand(expression, text) {
    if (!expression || !text) return false;
    const expr = flattenMath(expression);
    // Arithmetic only: an operator beyond a leading sign, and no variable.
    if (!expr || /[a-z]/i.test(expr)) return false;
    if (!/[-+*/^]/.test(expr.replace(/^-/, ''))) return false;
    const hay = flattenMath(wordOperatorsToSymbols(text));
    let from = 0;
    for (;;) {
        const i = hay.indexOf(expr, from);
        if (i === -1) return false;
        const before = hay.slice(0, i);
        const after = hay[i + expr.length] || '';
        // "|3-10|" — pipes on both sides.
        if (before.endsWith('|') && after === '|') return true;
        // "…absolutevalueof(3-10" / "…sqrt(16-7" / "…oppositeof3-10"
        if (WRAPPER_BEFORE_OPERAND_RX.test(before)) return true;
        from = i + 1;
    }
}

module.exports = { isWrappedOperand, flattenMath };
