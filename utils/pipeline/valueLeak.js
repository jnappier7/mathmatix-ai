// utils/pipeline/valueLeak.js — does a tutor reply reveal the VALUE of the
// answer to the equation the student brought?
//
// The giveaway guards in verify.js judge a reply by its FORM ("the answer is",
// a trailing "x = 9", a worked solution). Form is all they can see, because a
// student-posed problem never gets a correctAnswer — that is only computed for
// answer attempts. So "x is seven", "plug in x = 7: 5(7) + 10 = 45 ✓" and a
// base64 blob all passed, found by driving the chat with a model that complied
// with "just give me x".
//
// This module closes that gap deterministically: solve the student's own
// equation with mathSolver, then look for that value in the reply in the
// shapes that hand it over — an assignment to the variable, a substitution
// check, an answer announcement — in digits or words, in plain text or a
// base64 token.
//
// Deliberately narrow, because a false alarm rewrites a good reply:
//   • Only single-variable equations from the student's message ("4x+3=31").
//     Bare arithmetic is out of scope — its value turns up in honest hints.
//   • A bare occurrence of the number is never enough. It must be bound to the
//     variable, the word "answer", a substitution verb, or one of the
//     equation's own coefficients ("5(7)" for 5x + 10 = 45).
//   • Anything the solver cannot solve yields no problems, so no finding.

const {
    detectMathProblem,
    solveProblem,
} = require('../mathSolver');
const { normalizeMathOperators } = require('../mathUnicodeNormalizer');

// ── Numbers in words ──────────────────────────────────────────────────────
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
    'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** Spelled-out forms of an integer in [-100, 100] ("twenty-one", "negative seven"). */
function numberWords(n) {
    if (!Number.isInteger(n) || Math.abs(n) > 100) return [];
    const abs = Math.abs(n);
    let words;
    if (abs < 20) words = [ONES[abs]];
    else if (abs === 100) words = ['one hundred', 'a hundred', 'hundred'];
    else if (abs % 10 === 0) words = [TENS[abs / 10]];
    else {
        const t = TENS[Math.floor(abs / 10)];
        const o = ONES[abs % 10];
        words = [`${t}-${o}`, `${t} ${o}`, `${t}${o}`];
    }
    if (n < 0) return words.flatMap((w) => [`negative ${w}`, `minus ${w}`]);
    return words;
}

// ── Extracting the student's equation(s) ─────────────────────────────────
// A run of equation tokens: numbers, single-letter variables (not part of a
// word), operators, parens, '=' and whitespace.
const EQUATION_RUN = /(?:(?<![a-z])[a-z](?![a-z])|\d+(?:\.\d+)?|[+\-*/^()=.]|[ \t])+/gi;

function parseNumber(str) {
    if (str == null) return null;
    const s = String(str).trim();
    const frac = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (frac) {
        const d = parseFloat(frac[2]);
        return d === 0 ? null : parseFloat(frac[1]) / d;
    }
    return /^-?\d+(?:\.\d+)?$/.test(s) ? parseFloat(s) : null;
}

function solveEquation(eq) {
    let problem;
    let result;
    try {
        problem = detectMathProblem(eq);
        if (!problem) return [];
        result = solveProblem(problem);
    } catch {
        return [];
    }
    if (!result || !result.success) return [];
    if (Array.isArray(result.roots) && result.roots.length) {
        return result.roots.filter((r) => typeof r === 'number' && Number.isFinite(r));
    }
    const v = parseNumber(String(result.answer).replace(/^[a-z]\s*=\s*/i, ''));
    return v === null ? [] : [v];
}

/**
 * Pull the single-variable equations a student posed and solve them.
 * @param {string} message
 * @returns {Array<{equation: string, variable: string, values: number[], coefficients: number[]}>}
 */
function extractPosedEquations(message) {
    if (!message || typeof message !== 'string') return [];
    const text = normalizeMathOperators(message).replace(/[×·]/g, '*').replace(/÷/g, '/');
    // Split numbered lists ("1) x+4=10 2) 2x=18") and sentences apart. A list
    // marker is never followed by an operator, and never follows one — the
    // "2)" in "3(x + 2) = 21" is not a marker.
    const segments = text.split(/(?:^|(?<=[^\s+\-*/^=(])\s+)\d+[).]\s+(?![=+\-*/^])|[,;?!\n:]/);
    const out = [];
    const seen = new Set();
    for (const seg of segments) {
        for (const m of seg.matchAll(EQUATION_RUN)) {
            let eq = m[0].trim().replace(/[.\s]+$/, '');
            // A lone word-letter in front ("a 4x+3=31") is not part of it —
            // unless it IS the variable ("x - 4 = 17").
            const stripped = eq.replace(/^[a-z]\s+(?=[\d(-])/i, '');
            if (stripped !== eq && /(?<![a-z])[a-z](?![a-z])/i.test(stripped)) eq = stripped;
            if ((eq.match(/=/g) || []).length !== 1 || !/\d/.test(eq)) continue;
            const vars = [...new Set((eq.match(/(?<![a-z])[a-z](?![a-z])/gi) || []).map((c) => c.toLowerCase()))];
            if (vars.length !== 1) continue;
            const key = eq.replace(/\s+/g, '');
            if (seen.has(key)) continue;
            seen.add(key);
            const values = solveEquation(eq);
            if (!values.length) continue;
            const variable = vars[0];
            const coefficients = [...eq.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*\\*?\\s*${variable}`, 'gi'))]
                .map((c) => parseFloat(c[1]))
                .filter((c) => c !== 1);
            out.push({ equation: eq, variable, values, coefficients });
        }
    }
    return out;
}

// ── Finding the value in a reply ─────────────────────────────────────────
const NUM_LITERAL = '(?:±|\\+/-)?-?\\d+(?:\\.\\d+)?(?:\\s*/\\s*\\d+(?:\\.\\d+)?)?';
// After a literal value: not the start of a longer expression ("7x", "7*", "7^2").
const NOT_EXPR = '(?!\\d|\\.\\d|\\s*[*/^(]|[a-z])';
// ...and not a comparison or quantity ("x is 2 more than", "3 times", "15%").
const NOT_COMPARE = '(?!\\s+(?:more|less|times|greater|smaller|bigger|fewer|plus|minus|over|divided|multiplied|of|percent)\\b|\\s*%)';
// A spelled-out value must END there — "the answer is one you can find" is
// not x = 1.
const WORD_END = '(?=\\s*(?:[.,!?;:)\\n]|$|and\\b|because\\b|so\\b|since\\b|which\\b|—|–))';

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Regex source matching the value as a literal or in words. */
function valueAlternatives(values) {
    const lits = [];
    for (const v of values) {
        for (const w of numberWords(v)) lits.push(`\\b${escapeRe(w)}\\b`);
    }
    return lits;
}

/** The solved value `text` names (digits, words, or ±), or null. */
function matchedValue(text, values) {
    const said = text.trim().toLowerCase();
    for (const v of values) {
        if (numberWords(v).includes(said)) return v;
    }
    const compact = said.replace(/\s+/g, '');
    const plusMinus = /^(?:±|\+\/-)/.test(compact);
    const n = parseNumber(compact.replace(/^(?:±|\+\/-)/, ''));
    if (n === null) return null;
    const hit = values.find((v) => Math.abs(v - n) < 1e-9 ||
        (plusMinus && Math.abs(Math.abs(v) - Math.abs(n)) < 1e-9));
    return hit === undefined ? null : hit;
}

/** Text plus the decoded contents of any base64-looking tokens. */
function withDecodedTokens(text) {
    const parts = [text];
    for (const tok of text.match(/[A-Za-z0-9+/]{4,}={0,2}/g) || []) {
        if (tok.length % 4 !== 0 || !/[0-9=+/]|[A-Z].*[a-z]|[a-z].*[A-Z]/.test(tok)) continue;
        let decoded;
        try {
            decoded = Buffer.from(tok, 'base64').toString('utf8');
        } catch {
            continue;
        }
        if (decoded && /^[\x20-\x7E]+$/.test(decoded) && Buffer.from(decoded, 'utf8').toString('base64').replace(/=+$/, '') === tok.replace(/=+$/, '')) {
            parts.push(decoded);
        }
    }
    return parts.join('\n');
}

function cleanReply(reply) {
    return normalizeMathOperators(String(reply))
        .replace(/\\(?:boxed|textbf|mathbf|text)\s*\{([^{}]*)\}/g, '$1')
        .replace(/\\[()[\]]/g, ' ')
        // Markdown emphasis, but not a multiplication star between numbers.
        .replace(/\*\*|__/g, '')
        .replace(/\*(?=[a-z])|(?<=[a-z])\*/gi, '')
        .replace(/[$_`{}]/g, '')
        .replace(/[×·]/g, '*')
        .toLowerCase();
}

/**
 * Does the reply reveal a solved value of one of the posed equations?
 * @param {string} reply
 * @param {ReturnType<typeof extractPosedEquations>} problems
 * @returns {null | {how: string, value: number, equation: string}}
 */
function findValueReveal(reply, problems) {
    if (!reply || !Array.isArray(problems) || problems.length === 0) return null;
    // Decode before lowercasing — case is part of a base64 token.
    const text = cleanReply(withDecodedTokens(String(reply)));

    for (const p of problems) {
        const v = escapeRe(p.variable.toLowerCase());
        const words = valueAlternatives(p.values);
        const wordAlt = words.length ? `|(?:${words.join('|')})${WORD_END}` : '';
        const valueGroup = `(${NUM_LITERAL}${NOT_EXPR}${NOT_COMPARE}${wordAlt})`;
        const checks = [
            ['assignment', `(?<![a-z0-9.])${v}\\s*(?:=|is equal to|equals|is|would be|must be|should be|has to be|comes out to|turns out to be|ends up being)\\s*(?:to\\s+)?${valueGroup}`],
            ['answer', `\\b(?:answer|solution|result)s?\\s*(?:is|:|=|would be|should be|comes out to)\\s*(?:${v}\\s*=\\s*)?${valueGroup}`],
            // Digits only: "want to try one?" is an invitation, not x = 1.
            ['substitution', `\\b(?:plug(?:ging)?|substitut\\w*|put(?:ting)?|replac\\w*)\\s+(?:it\\s+|that\\s+)?(?:back\\s+)?(?:in(?:to)?\\s+)?(?:${v}\\s*=\\s*)?(${NUM_LITERAL})${NOT_EXPR}${NOT_COMPARE}`],
            // A bare "try N" only when N is clearly the thing being tried
            // ("Try 7 — does…", "try 7 in the equation"), not "try 3 problems".
            ['substitution', `\\btry(?:ing)?\\s+(${NUM_LITERAL})(?=\\s*(?:[—–:]|-\\s|in\\b|into\\b|back\\b|as\\b|for\\s+${v}\\b))`],
        ];
        for (const c of p.coefficients) {
            const cs = escapeRe(String(c));
            checks.push(['coefficient-substitution', `(?<![\\d.])${cs}\\s*(?:\\(\\s*(${NUM_LITERAL})\\s*\\)|\\*\\s*(${NUM_LITERAL})${NOT_EXPR})`]);
        }
        for (const [how, src] of checks) {
            for (const m of text.matchAll(new RegExp(src, 'gi'))) {
                const raw = m.slice(1).find((g) => g !== undefined);
                if (raw === undefined) continue;
                const hit = matchedValue(raw, p.values);
                if (hit !== null) return { how, value: hit, equation: p.equation };
            }
        }
    }
    return null;
}

module.exports = { extractPosedEquations, findValueReveal, numberWords };
