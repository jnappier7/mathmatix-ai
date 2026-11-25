// utils/pipeline/statedProblem.js
//
// What problem did the student just bring? — for the visual gate, on the turns
// it has nothing else to go on.
//
// The gate (utils/visualGate.js) stops a graph of the student's OWN unsolved
// problem: a parabola crossing at 2 and 3 IS the roots. It knows the problem
// from the board pin or a graded answer. Neither exists on the turn a problem
// is first stated (the pin is written after the gate runs), and a problem
// worded "find the roots of x^2-5x+6" is never pinned at all. With both
// missing the gate's status was 'unknown' and every graph passed — in the
// signed-in chat, and since #1943 on the landing preview, to anyone.
//
// This reads the student's recent messages for the math they wrote next to a
// request a graph would answer (roots, intercepts, a vertex, an equation or a
// system to solve). It returns the written forms; the gate compares a graph
// with them as whole expressions — the same function, a side of the same
// equation, or the same function rearranged — never as a substring, so the
// tutor's simpler cousin (x^2 for a student on x^2-5x+6) still draws.
//
// Deliberately narrow, like valueLeak: a false alarm removes a good picture.
//   • a message that asks FOR the graph ("graph y = …", "plot", "sketch",
//     "draw") is the assignment, not a leak — nothing is returned;
//   • a message that only talks about an expression ("why is x^2 always
//     positive?") poses nothing to give away;
//   • only x / y forms are read. Anything else is left to the pin.

const { extractPosedEquations } = require('./valueLeak');

// The student asked for the picture itself.
const WANTS_THE_GRAPH = /\b(graph(?:ing|ed|s)?|plot(?:ting|ted|s)?|sketch(?:ing|ed)?|draw(?:ing|n)?)\b/i;

// Requests whose answer can be read straight off a curve.
const GRAPH_ANSWERS_IT = /\b(solve[sd]?|solving|solutions?|roots?|zeros?|zeroes|intercepts?|vertex|vertices|factor(?:s|ed|ing|ise|ize)?|minimum|maximum|min|max|axis of symmetry|turning point|cross(?:es|ing)?|intersect(?:s|ion|ing)?|meets?|asymptotes?|holes?|system|find x|value of x|what is x|what's x)\b/i;

/**
 * The x / y math a message contains, as written: "x^2-5x+6", "3x + 7 = 22",
 * "y = 2x + 1". Words are separators; so is sentence punctuation.
 * @param {string} message
 * @returns {string[]}
 */
function writtenForms(message) {
    if (!message || typeof message !== 'string') return [];
    const text = message
        .replace(/[−–—]/g, '-')
        .replace(/²/g, '^2').replace(/³/g, '^3')
        .replace(/\\\(|\\\)|\\\[|\\\]|\$/g, ' ')
        // f(x) = … / g(x) = … name the function; keep what it equals.
        .replace(/\b[fgh]\s*\(\s*x\s*\)\s*=/gi, ' | ')
        .replace(/[a-z]{2,}/gi, ' | ')
        .replace(/(?<![a-z])[a-wz](?![a-z])/gi, ' | ')
        .replace(/[,;?!:]|\.(?=\s|$)/g, ' | ');
    const out = [];
    for (const piece of text.split('|')) {
        const form = piece.trim().replace(/^[=\s]+|[=.\s]+$/g, '');
        if (form.length < 3 || !/\d/.test(form) || !/[xy]/i.test(form)) continue;
        if ((form.match(/=/g) || []).length > 1) continue;
        if (!out.includes(form)) out.push(form);
    }
    return out;
}

/** Is the message nothing but its math ("x^2 - 5x + 6 = 0")? */
function isBareMath(message, forms) {
    return forms.length === 1 && !/[a-z]{2,}/i.test(String(message));
}

/**
 * @param {string[]} messages  the student's messages, CURRENT FIRST, then recent ones
 * @returns {{ problemText: string, forms: string[] } | null}
 */
function problemFromStudentText(messages) {
    const list = (Array.isArray(messages) ? messages : [])
        .filter((m) => typeof m === 'string' && m.trim());
    if (!list.length) return null;
    // Asked for the picture this turn: drawing it is the task.
    if (WANTS_THE_GRAPH.test(list[0])) return null;

    const forms = [];
    const texts = [];
    for (const message of [...new Set(list)]) {
        if (WANTS_THE_GRAPH.test(message)) continue;
        const found = writtenForms(message);
        if (!found.length) continue;
        const posesIt = GRAPH_ANSWERS_IT.test(message)
            || extractPosedEquations(message).length > 0
            || isBareMath(message, found);
        if (!posesIt) continue;
        texts.push(message);
        for (const f of found) if (!forms.includes(f)) forms.push(f);
    }
    return forms.length ? { problemText: texts.join(' ; '), forms } : null;
}

module.exports = { problemFromStudentText, writtenForms };
