// utils/plainMath.js
//
// LaTeX → readable plain-text math, for surfaces that cannot typeset.
//
// Session summaries are LLM output and arrive full of `\(5x - 7 = 13\)` and
// `\(\sqrt[5]{x^5y^{15}}\)`. The parent dashboard loads no KaTeX, so a parent
// read the raw source. Rather than ship a typesetter to a page whose only math
// is a sentence or two of summary, the server rewrites the math into Unicode
// a parent can read: 5x − 7 = 13, ⁵√(x⁵y¹⁵).
//
// Pure and dependency-free. Deliberately forgiving: an unknown command loses
// its backslash rather than throwing, an unbalanced brace is read to the end
// of the string, and text that contains no LaTeX comes back unchanged.

const SYMBOLS = {
    cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓',
    le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
    lt: '<', gt: '>', approx: '≈', equiv: '≡', sim: '~', cong: '≅', propto: '∝',
    pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ',
    Delta: 'Δ', lambda: 'λ', mu: 'μ', sigma: 'σ', Sigma: 'Σ', phi: 'φ', omega: 'ω',
    infty: '∞', circ: '°', degree: '°', angle: '∠', triangle: '△',
    perp: '⊥', parallel: '∥', cap: '∩', cup: '∪', in: '∈', notin: '∉',
    subset: '⊂', subseteq: '⊆', emptyset: '∅', sum: 'Σ', prod: 'Π',
    to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', implies: '⇒',
    leftrightarrow: '↔', iff: '⇔',
    ldots: '…', cdots: '…', dots: '…',
    quad: ' ', qquad: ' ', ',': ' ', ';': ' ', ':': ' ', '!': '', ' ': ' ',
    '%': '%', '$': '$', '&': '&', '#': '#', '_': '_', '{': '{', '}': '}',
    '\\': ' ', lbrace: '{', rbrace: '}', vert: '|', mid: '|',
};

// Commands that just wrap their argument in a style.
const PASSTHROUGH = new Set([
    'text', 'textrm', 'textbf', 'textit', 'mathrm', 'mathbf', 'mathit', 'mathsf',
    'operatorname', 'mbox', 'boldsymbol', 'displaystyle', 'overline', 'underline',
    'bar', 'vec', 'hat', 'tilde', 'widehat', 'overrightarrow', 'boxed',
]);
// Commands that take no argument and print nothing.
const SILENT = new Set(['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'displaystyle', 'limits', 'nolimits']);

const SUPERSCRIPT = {
    0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
    '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ', y: 'ʸ',
};
const SUBSCRIPT = {
    0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉',
    '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
};

function mapAll(s, table) {
    let out = '';
    for (const ch of s) {
        if (!(ch in table)) return null;
        out += table[ch];
    }
    return out;
}

// A single "token" needs no parentheses around it: 12, x, 3x, π.
const isAtom = (s) => /^[\p{L}\p{N}.]+$/u.test(s);
const wrap = (s) => (isAtom(s) ? s : `(${s})`);
// A radical only stays unbracketed over a plain number or one letter: √2x
// reads as (√2)x, so √(2x).
const wrapRadicand = (s) => (/^(\d+(\.\d+)?|\p{L})$/u.test(s) ? s : `(${s})`);

/**
 * Read one argument at position i: a {balanced group}, or one character
 * (skipping leading spaces). Returns [rawArg, nextIndex].
 */
function readArg(src, i) {
    while (src[i] === ' ') i++;
    if (src[i] === '{') {
        let depth = 1;
        let j = i + 1;
        while (j < src.length && depth > 0) {
            if (src[j] === '\\') { j += 2; continue; }
            if (src[j] === '{') depth++;
            else if (src[j] === '}') depth--;
            j++;
        }
        return [src.slice(i + 1, depth === 0 ? j - 1 : j), j];
    }
    if (src[i] === '\\') {
        // A command as the argument (x^\pi) — take the command name.
        const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
        if (m) return [m[0], i + m[0].length];
    }
    return [src[i] || '', i + 1];
}

/**
 * Convert a LaTeX fragment. `math` is true inside a math segment, where ^ _
 * { } and - carry math meaning; outside one (bare prose that happens to hold
 * a \frac) only backslash commands are rewritten.
 */
function convert(src, math) {
    let out = '';
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        if (ch === '\\') {
            const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
            if (!m) { i++; continue; }
            const name = m[1];
            i += m[0].length;
            if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
                const [a, i1] = readArg(src, i);
                const [b, i2] = readArg(src, i1);
                i = i2;
                out += `${wrap(convert(a, true))}/${wrap(convert(b, true))}`;
            } else if (name === 'sqrt') {
                let index = '';
                let k = i;
                while (src[k] === ' ') k++;
                if (src[k] === '[') {
                    const close = src.indexOf(']', k);
                    if (close !== -1) { index = convert(src.slice(k + 1, close), true); i = close + 1; }
                }
                const [a, i1] = readArg(src, i);
                i = i1;
                const radicand = convert(a, true);
                const prefix = index ? (mapAll(index, SUPERSCRIPT) || `${index}th root of `) : '';
                out += prefix.endsWith('root of ') ? `${prefix}${wrapRadicand(radicand)}` : `${prefix}√${wrapRadicand(radicand)}`;
            } else if (PASSTHROUGH.has(name)) {
                const [a, i1] = readArg(src, i);
                i = i1;
                out += convert(a, math && !name.startsWith('text'));
            } else if (SILENT.has(name)) {
                // \left. and \right. are invisible delimiters.
                if ((name === 'left' || name === 'right') && src[i] === '.') i++;
            } else if (Object.prototype.hasOwnProperty.call(SYMBOLS, name)) {
                out += SYMBOLS[name];
            } else if (/^[a-zA-Z]+$/.test(name)) {
                out += name; // unknown command: keep the word, drop the backslash
            } else {
                out += name;
            }
            continue;
        }
        if (math && (ch === '^' || ch === '_')) {
            const [a, i1] = readArg(src, i + 1);
            i = i1;
            const inner = convert(a, true);
            const mapped = mapAll(inner, ch === '^' ? SUPERSCRIPT : SUBSCRIPT);
            if (mapped !== null && inner.length > 0) out += mapped;
            else out += `${ch}${inner.length === 1 ? inner : `(${inner})`}`;
            continue;
        }
        if (math && (ch === '{' || ch === '}')) { i++; continue; }
        if (math && ch === '-') { out += '−'; i++; continue; }
        if (math && ch === '*') { out += '×'; i++; continue; }
        out += ch;
        i++;
    }
    return out;
}

// Math segments, in the order we try them. `$…$` only counts when the inside
// looks like LaTeX, so "$5 and $10" stays money.
const SEGMENTS = [
    /\\\(([\s\S]*?)\\\)/g,
    /\\\[([\s\S]*?)\\\]/g,
    /\$\$([\s\S]*?)\$\$/g,
    /\$([^$\n]*[\\^_{}][^$\n]*)\$/g,
];

/**
 * Rewrite every LaTeX math segment in `text` as plain Unicode math.
 * Non-strings pass through untouched.
 */
function plainMath(text) {
    if (typeof text !== 'string' || text === '') return text;
    if (!/[\\$]/.test(text)) return text;
    let out = text;
    for (const re of SEGMENTS) {
        out = out.replace(re, (_, inner) => convert(inner, true)
            .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim());
    }
    // Bare commands left in prose (\frac{1}{2} with no delimiters).
    if (out.includes('\\')) out = convert(out, false);
    return out.replace(/[ \t]{2,}/g, ' ');
}

module.exports = { plainMath };
