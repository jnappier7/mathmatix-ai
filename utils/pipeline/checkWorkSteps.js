// utils/pipeline/checkWorkSteps.js
//
// Deterministic line-by-line check of a student's worked solution.
//
// The check-work grader used to let one vision model read, solve and judge a
// sheet in a single pass, so nothing independent ever looked at the math.
// This module is that independent look: given the student's transcribed
// lines, it finds the FIRST line that does not follow from the one before it
// (or a numeric line that is simply false, like "18 - 4 = 12").
//
// It is deliberately one-sided. A step it can prove is wrong is reported as
// "broken"; anything it cannot prove either way is "unknown", never "broken".
// Squaring both sides, dividing by a variable, a line it cannot parse, prose
// like "x = 2 or x = 3" — all of those are "unknown". The grader treats a
// broken step as ONE witness of an error, never as a verdict on its own.

const math = require('mathjs');

const CONSTANTS = new Set(['pi', 'e', 'i', 'E', 'PI', 'Infinity', 'NaN']);
const SAMPLE_POINTS = [-3.7, -1.3, 0.6, 1.9, 2.8, 4.1, 6.3];
const REL_TOL = 1e-6;

/**
 * Turn a transcribed line into something mathjs can parse, or null if the
 * line isn't a single expression / equation (prose, "or", lists, etc.).
 */
function normalizeLine(raw) {
    if (typeof raw !== 'string') return null;
    let s = raw.trim();
    if (!s) return null;
    s = s
        .replace(/\$|\\\(|\\\)|\\\[|\\\]/g, '')
        .replace(/\\left|\\right/g, '')
        .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
        .replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)')
        .replace(/\\cdot|\\times|[×·∙⋅]/g, '*')
        .replace(/\\div|÷/g, '/')
        .replace(/[−–—]/g, '-')
        .replace(/√\s*\(/g, 'sqrt(')
        .replace(/√\s*([0-9a-z]+)/gi, 'sqrt($1)')
        .replace(/²/g, '^2').replace(/³/g, '^3')
        .replace(/\|([^|]+)\|/g, 'abs($1)')
        .replace(/[{}]/g, m => (m === '{' ? '(' : ')'))
        .replace(/\s+/g, ' ')
        .trim();
    // Multiple results, inequalities, words: not a single checkable line.
    if (/\bor\b|\band\b|,|;|[<>≤≥≠]|\?/.test(s)) return null;
    if (/[a-z]{3,}/i.test(s.replace(/sqrt|abs|log|ln|sin|cos|tan/gi, ''))) return null;
    const eq = s.split('=');
    if (eq.length > 2) return null;
    if (eq.some(side => !side.trim())) return null;
    return s;
}

function variablesOf(node) {
    const vars = new Set();
    node.traverse((n, path, parent) => {
        if (!n.isSymbolNode) return;
        if (parent && parent.isFunctionNode && parent.fn === n) return;
        if (CONSTANTS.has(n.name)) return;
        if (typeof math[n.name] === 'function') return;
        vars.add(n.name);
    });
    return vars;
}

/**
 * Parse a line into { kind: 'equation'|'expression', f, vars, text } where
 * f(scope) is (left - right) for an equation, or the expression's value.
 */
function parseLine(raw) {
    const text = normalizeLine(raw);
    if (!text) return null;
    try {
        const sides = text.split('=');
        if (sides.length === 2) {
            const left = math.parse(sides[0]);
            const right = math.parse(sides[1]);
            const node = new math.OperatorNode('-', 'subtract', [left, right]);
            const code = node.compile();
            const vars = new Set([...variablesOf(left), ...variablesOf(right)]);
            return { kind: 'equation', f: scope => code.evaluate(scope), vars, text };
        }
        const node = math.parse(text);
        const code = node.compile();
        return { kind: 'expression', f: scope => code.evaluate(scope), vars: variablesOf(node), text };
    } catch {
        return null;
    }
}

function evalAt(line, vars, point, offset) {
    const scope = {};
    [...vars].forEach((v, i) => { scope[v] = point + offset * (i + 1); });
    try {
        const v = line.f(scope);
        const n = typeof v === 'number' ? v : (v && typeof v.toNumber === 'function' ? v.toNumber() : Number(v));
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

function close(a, b) {
    return Math.abs(a - b) <= REL_TOL * Math.max(1, Math.abs(a), Math.abs(b));
}

// Real roots of a one-variable f on [-50, 50]: sign changes (bisected) plus
// grid points where f is ~0 (catches double roots like (x - 2)^2).
function rootsOf(line, v) {
    const f = x => evalAt(line, new Set([v]), x, 0);
    const roots = [];
    const push = r => { if (!roots.some(q => Math.abs(q - r) < 1e-4)) roots.push(r); };
    let prevX = -50;
    let prevY = f(prevX);
    for (let x = -50 + 0.05; x <= 50; x += 0.05) {
        const y = f(x);
        if (y !== null && Math.abs(y) < 1e-9) push(x);
        if (y !== null && prevY !== null && prevY * y < 0) {
            let lo = prevX, hi = x, flo = prevY;
            for (let k = 0; k < 60; k++) {
                const mid = (lo + hi) / 2;
                const fm = f(mid);
                if (fm === null) break;
                if (flo * fm <= 0) { hi = mid; } else { lo = mid; flo = fm; }
            }
            const r = (lo + hi) / 2;
            // A sign change across a pole (1/x) is not a root.
            const fr = f(r);
            if (fr !== null && Math.abs(fr) < 1e-6) push(r);
        }
        prevX = x; prevY = y;
        if (roots.length > 12) break;
    }
    return roots;
}

/**
 * Is `next` a valid consequence of `prev`?
 * @returns {'valid'|'broken'|'unknown'}
 */
function compareLines(prev, next) {
    if (!prev || !next || prev.kind !== next.kind) return 'unknown';
    const vars = new Set([...prev.vars, ...next.vars]);

    if (prev.kind === 'expression') {
        // Rewriting an expression must keep its value at every point.
        let checked = 0;
        for (const p of SAMPLE_POINTS) {
            const a = evalAt(prev, vars, p, 0.37);
            const b = evalAt(next, vars, p, 0.37);
            if (a === null || b === null) continue;
            checked++;
            if (!close(a, b)) return 'broken';
        }
        return checked >= 3 ? 'valid' : 'unknown';
    }

    // Equations: the same equation up to a non-zero constant factor is a
    // valid step (adding to / multiplying both sides, expanding, factoring).
    let ratio = null;
    let checked = 0;
    let constantRatio = true;
    for (const p of SAMPLE_POINTS) {
        const a = evalAt(prev, vars, p, 0.37);
        const b = evalAt(next, vars, p, 0.37);
        if (a === null || b === null) continue;
        if (Math.abs(a) < 1e-9 && Math.abs(b) < 1e-9) { checked++; continue; }
        if (Math.abs(a) < 1e-9 || Math.abs(b) < 1e-9) { constantRatio = false; break; }
        const r = b / a;
        if (ratio === null) ratio = r;
        else if (!close(r, ratio)) { constantRatio = false; break; }
        checked++;
    }
    if (constantRatio && checked >= 3) return 'valid';

    // Not a scalar multiple. That's still fine if the solutions agree
    // (squaring, clearing a denominator, taking a root). Only one-variable
    // equations can be decided this way; everything else stays unknown.
    if (vars.size !== 1) return 'unknown';
    const v = [...vars][0];
    const prevRoots = rootsOf(prev, v);
    const nextRoots = rootsOf(next, v);
    if (!prevRoots.length || !nextRoots.length) return 'unknown';
    const satisfies = (line, r) => {
        const y = evalAt(line, new Set([v]), r, 0);
        return y !== null && Math.abs(y) < 1e-5;
    };
    // Valid when one solution set contains the other: squaring can ADD an
    // extraneous root, dividing by the variable can DROP one — teaching
    // points, not wrong steps. A step whose solutions neither contain nor
    // are contained by the previous line's — (x + 2)(x - 3) = 0 written for
    // x^2 - 5x + 6 = 0 — changed the problem.
    const nextWithinPrev = nextRoots.every(r => satisfies(prev, r));
    const prevWithinNext = prevRoots.every(r => satisfies(next, r));
    if (nextWithinPrev || prevWithinNext) return 'valid';
    return 'broken';
}

// A line with no variables is a plain statement ("18 - 4 = 14") that is
// either true or false on its own.
function checkNumericTruth(line) {
    if (!line || line.kind !== 'equation' || line.vars.size !== 0) return 'unknown';
    const v = evalAt(line, new Set(), 0, 0);
    if (v === null) return 'unknown';
    return Math.abs(v) <= REL_TOL * 10 ? 'valid' : 'broken';
}

/**
 * Check a student's worked lines.
 * @param {string[]} steps  transcribed lines, in order (the problem's own
 *                          starting equation may be passed as the first line)
 * @returns {{ status: 'valid'|'broken'|'unknown', badIndex: number|null,
 *             badLine: string|null, reason: string|null, checkedPairs: number }}
 *          checkedPairs counts every verified step and every true numeric line.
 */
function checkSteps(steps) {
    const lines = (Array.isArray(steps) ? steps : []).map(parseLine);
    let checkedPairs = 0;
    let sawUnknown = false;

    for (let i = 0; i < lines.length; i++) {
        const truth = checkNumericTruth(lines[i]);
        if (truth === 'broken') {
            return { status: 'broken', badIndex: i, badLine: steps[i], reason: 'false-arithmetic', checkedPairs };
        }
        if (truth === 'valid') checkedPairs++;
        if (i === 0) continue;
        // A numeric line inside an algebra solution is side arithmetic —
        // it was already checked for truth above; don't chain across it.
        if (lines[i] && lines[i].kind === 'equation' && lines[i].vars.size === 0) continue;
        let prevIdx = i - 1;
        while (prevIdx >= 0 && lines[prevIdx] && lines[prevIdx].kind === 'equation' && lines[prevIdx].vars.size === 0) prevIdx--;
        const result = compareLines(prevIdx >= 0 ? lines[prevIdx] : null, lines[i]);
        if (result === 'broken') {
            return { status: 'broken', badIndex: i, badLine: steps[i], reason: 'does-not-follow', checkedPairs };
        }
        if (result === 'valid') checkedPairs++;
        else sawUnknown = true;
    }
    if (checkedPairs > 0 && !sawUnknown) return { status: 'valid', badIndex: null, badLine: null, reason: null, checkedPairs };
    return { status: 'unknown', badIndex: null, badLine: null, reason: null, checkedPairs };
}

module.exports = { checkSteps, parseLine, compareLines, normalizeLine };
