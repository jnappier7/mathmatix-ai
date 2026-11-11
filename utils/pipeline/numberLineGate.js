// utils/pipeline/numberLineGate.js
//
// A number line can hand over an answer as surely as a sentence can.
//
// The inline graph gate (inlineGraphGate.js) stops a plot of the student's own
// unsolved function, because the crossing points ARE the roots. Number lines
// were left out as "not a function" — true, and not the point. Two of them
// answer the question outright:
//
//   • HOPS.   A student asks "what is -3 + 8?" and the tutor, now nudged to
//             draw (visualDirective.js), replies with a hop from -3 that lands
//             on 5. The landing spot is the answer.
//   • SHADING. A student is solving 2x + 3 > 7 and the reply shades x > 2.
//             The endpoint and the direction are the whole solution.
//
// This gate is deterministic and narrow, because a false alarm costs a good
// picture:
//
//   • It protects only what the STUDENT posed and has not yet answered:
//     arithmetic they asked about, an inequality they brought, the pinned
//     problem. A tutor's own example with different numbers is untouched.
//   • Hops are not removed, they are CUT SHORT: the hop that lands on the
//     answer is dropped and the earlier hops stay, so the picture now shows
//     where the student is standing and leaves the last move to them. A
//     single-hop problem keeps its start point.
//   • A shaded inequality is removed only when its boundary is the solved
//     boundary of an inequality the student brought UNSOLVED. "x > 2" typed by
//     the student and drawn back to them is a picture of what they said.
//   • Anything it cannot parse or solve is left alone.
//
// Pure and synchronous. Runs in the verify stage next to the graph gate, so
// the edit lands in the text the client renders visuals from.

const { evaluate } = require('mathjs');
const { extractPosedEquations } = require('./valueLeak');
const { normalizeMathOperators } = require('../mathUnicodeNormalizer');

// Params can nest one level of brackets (jumps=[(0,3,"+3")], points=[-3,3]).
const NESTED = '(?:[^\\[\\]]|\\[[^\\]]*\\])';
const TAG_RX = new RegExp(`\\[\\s*(NUMBER_LINE|INEQUALITY)\\s*:(${NESTED}+)\\]`, 'g');
const HOP_RX = /\(\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*,[^)]*\)/g;
const JUMPS_PARAM_RX = /jumps\s*=\s*(\[(?:[^[\]]|\[[^\]]*\])*\]|"[^"]*")/;

// One side of an inequality: single-letter variables, numbers, operators — the same tokens
// valueLeak's EQUATION_RUN accepts, so prose around it ("so 2x + 3 > 7 right") falls away.
const SIDE = '(?:(?<![a-z])[a-z](?![a-z])|\\d+(?:\\.\\d+)?|[+\\-*/^().]|[ \\t])+';
const INEQUALITY_RUN = new RegExp(`(${SIDE})(<=|>=|<|>)(${SIDE})`, 'gi');

const EPS = 1e-9;
const same = (a, b) => Math.abs(a - b) < EPS;
const num = (s) => {
    const m = String(s).trim().match(/^(-?\d+(?:\.\d+)?)(?:\/(\d+))?$/);
    if (!m) return null;
    return m[2] ? parseFloat(m[1]) / parseFloat(m[2]) : parseFloat(m[1]);
};
// Student prose and pinned TeX both arrive here: fold the TeX spellings into plain operators.
const clean = (s) => normalizeMathOperators(String(s || ''))
    .replace(/\\(?:leq?|leqslant)\b/g, '<=').replace(/\\(?:geq?|geqslant)\b/g, '>=')
    .replace(/\\lt\b/g, '<').replace(/\\gt\b/g, '>')
    .replace(/\\(?:times|cdot)\b/g, '*').replace(/\\div\b/g, '/')
    .replace(/\\(?:left|right)\b/g, '')
    .replace(/[×·]/g, '*').replace(/÷/g, '/');

/** Cheap pre-check, so a turn without a number line pays nothing. */
function containsNumberLineTag(text) {
    return typeof text === 'string' && /\[\s*(?:NUMBER_LINE|INEQUALITY)\s*:/.test(text);
}

/**
 * The values of the arithmetic a student asked about: "what is -3 + 8" → 5.
 * Only expressions with a real operation between two numbers; a lone number,
 * a date, a problem number or a decimal is not a question.
 */
function posedArithmeticValues(message) {
    const out = [];
    const text = clean(message);
    // a run of numbers, operators and parentheses that is not glued to a letter (so "2x + 3" is out)
    const runs = text.match(/(?<![A-Za-z\d.])[-(]*\d+(?:\.\d+)?(?:\s*[-+*/]\s*[-(]*\d+(?:\.\d+)?\)*)+(?![A-Za-z\d]|\s*[=<>])/g) || [];
    for (const run of runs) {
        if (/^\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?$/.test(run.trim())) continue; // a date or a bare fraction
        let v;
        try { v = evaluate(run); } catch { continue; }
        if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    }
    return out;
}

/**
 * Boundaries of the inequalities a student brought UNSOLVED: "2x + 3 > 7" → 2.
 * An inequality already in solved form ("x > 2", "5 <= y") protects nothing —
 * drawing it is drawing what they said.
 */
function posedInequalityBoundaries(message) {
    const out = [];
    const text = clean(message).replace(/≤/g, '<=').replace(/≥/g, '>=');
    for (const m of text.matchAll(INEQUALITY_RUN)) {
        const left = m[1].trim(); const right = m[3].trim();
        if (!left || !right) continue;
        const isVar = (s) => /^[a-z]$/i.test(s); const isNum = (s) => num(s) !== null;
        // solved form: a lone variable on one side and a lone number on the other
        if ((isVar(left) && isNum(right)) || (isNum(left) && isVar(right))) continue;
        for (const p of extractPosedEquations(`${left} = ${right}`)) out.push(...p.values);
    }
    return out;
}

/** The boundary a tag shades from: inequality=">2", inequality="x > -1", expression="x <= 2", value=5. */
function tagBoundary(name, params) {
    const p = clean(params).replace(/≤/g, '<=').replace(/≥/g, '>=');
    const key = name === 'INEQUALITY' ? '(?:expression|inequality)' : 'inequality';
    const m = p.match(new RegExp(`${key}\\s*=\\s*"?[^",\\]]*?(?:<=|>=|<|>)\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'));
    if (m) return parseFloat(m[1]);
    if (name === 'INEQUALITY') {
        const v = p.match(/(?:^|,)\s*(?:value|x)\s*=\s*(-?\d+(?:\.\d+)?)/i);
        if (v) return parseFloat(v[1]);
    }
    return null;
}

/** Drop the final hop of a NUMBER_LINE tag; a one-hop line keeps its start as a point. */
function cutLastHop(raw, hops, answer) {
    const jm = raw.match(JUMPS_PARAM_RX);
    if (!jm) return raw;
    const last = hops[hops.length - 1];
    // Rebuilt from the hops that stay (never edited in place: a hop's own commas and quotes
    // make that fragile). A one-hop line keeps where it started.
    const jumps = hops.length === 1
        ? `points=[${last.from}]`
        : (jm[1][0] === '"'
            ? `jumps="${hops.slice(0, -1).map((h) => h.text).join(',')}"`
            : `jumps=[${hops.slice(0, -1).map((h) => h.text).join(',')}]`);
    let out = raw.replace(jm[0], jumps);
    // a label that states the result ("3 + 4 = 7") would say what the picture no longer does
    out = out.replace(/,?\s*label\s*=\s*"([^"]*)"/, (whole, label) => {
        const said = clean(label).match(/=\s*(-?\d+(?:\.\d+)?)\s*$/);
        return said && same(parseFloat(said[1]), answer) ? '' : whole;
    });
    return out.replace(/\[\s*NUMBER_LINE\s*:\s*,/, '[NUMBER_LINE:');
}

/**
 * Gate every number-line tag in a tutor reply.
 *
 * @param {object} args
 * @param {string}   args.text             the tutor's reply
 * @param {string[]} [args.studentMessages] the student's current message and their recent ones
 * @param {string}   [args.pinnedTex]      the problem in focus, if one is pinned
 * @param {*}        [args.correctAnswer]  the graded answer for this turn, when there is one
 * @param {boolean}  [args.solved]         the student already has it right — nothing left to give away
 * @returns {{ text: string, changes: Array<{ tag: string, action: 'cut_hop'|'strip', value: number }> }}
 */
function gateNumberLineTags({ text, studentMessages = [], pinnedTex = null, correctAnswer = null, solved = false } = {}) {
    const changes = [];
    if (solved || !containsNumberLineTag(text)) return { text, changes };

    const sources = [...studentMessages, pinnedTex].filter((s) => typeof s === 'string' && s);
    const answers = sources.flatMap(posedArithmeticValues);
    const known = num(String(correctAnswer == null ? '' : correctAnswer).replace(/^[a-z]\s*=\s*/i, ''));
    if (known !== null) answers.push(known);
    const boundaries = sources.flatMap(posedInequalityBoundaries);
    if (!answers.length && !boundaries.length) return { text, changes };

    const out = text.replace(TAG_RX, (raw, name, params) => {
        if (name === 'NUMBER_LINE' && JUMPS_PARAM_RX.test(raw) && answers.length) {
            const hops = [...params.matchAll(HOP_RX)].map((m) => ({ text: m[0], from: num(m[1]), to: num(m[2]) }))
                .filter((h) => h.from !== null && h.to !== null);
            if (hops.length) {
                const landing = hops[hops.length - 1].to;
                const hit = answers.find((a) => same(a, landing));
                if (hit !== undefined) {
                    changes.push({ tag: name, action: 'cut_hop', value: hit });
                    return cutLastHop(raw, hops, hit);
                }
            }
        }
        if (boundaries.length) {
            const b = tagBoundary(name, params);
            if (b !== null && boundaries.some((x) => same(x, b))) {
                changes.push({ tag: name, action: 'strip', value: b });
                return '';
            }
        }
        return raw;
    });

    const tidy = changes.some((c) => c.action === 'strip')
        ? out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim()
        : out;
    return { text: tidy, changes };
}

module.exports = {
    gateNumberLineTags,
    containsNumberLineTag,
    posedArithmeticValues,
    posedInequalityBoundaries,
    tagBoundary,
};
