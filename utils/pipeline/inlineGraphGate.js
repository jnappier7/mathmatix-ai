// utils/pipeline/inlineGraphGate.js
//
// Visual-gate coverage for LEGACY INLINE graph tags.
//
// The Visual Gate (utils/visualGate.js) makes <BOARD action="graph"> safe, but
// the tutor can also emit legacy inline tags — [FUNCTION_GRAPH:fn=...],
// [SLIDER_GRAPH:...], [DERIVATIVE_GRAPH:...], [RATIONAL_GRAPH:...],
// [VELOCITY_GRAPH:...] — directly in its chat text. Those bypass the board gate
// entirely and render on the client from the tutor's message. That leaves the
// same hole the board gate closes: a graph of the student's OWN unsolved
// function reveals its roots geometrically (a parabola crossing at x=2 and x=3
// *is* the answer), and — with the value judge on — decorative/off-topic graphs
// (the canonical "sin(x)/x" reflex on an unrelated worksheet).
//
// This module extracts those tags from the tutor text and runs each through the
// SAME applyVisualGate, then strips (or, in experimental mode, swaps) any the
// gate blocks. One gate, both surfaces.
//
// Runs in the verify stage so the edit lands in the authoritative text the
// client renders inline visuals from (pipelineResult.text). Worst case is a
// brief literal-tag flash during streaming — never a rendered leak.

const { applyVisualGate, defaultValueJudge } = require('../visualGate');

// The function-plotting tag family. These take fn= (a function of x) and are the
// only inline visuals that can leak roots or graph an off-topic function. The
// geometry/fraction/tile tags don't plot a function and are out of scope here.
const GRAPH_TAG_NAMES = ['FUNCTION_GRAPH', 'SLIDER_GRAPH', 'DERIVATIVE_GRAPH', 'RATIONAL_GRAPH', 'VELOCITY_GRAPH'];

// Mirror the frontend's tolerant matcher (inlineChatVisuals.js): tag name,
// optional whitespace, colon, then params up to the closing bracket.
const TAG_REGEX = new RegExp(`\\[\\s*(${GRAPH_TAG_NAMES.join('|')})\\s*:\\s*([^\\]]+)\\]`, 'g');

/** Cheap pre-check so the pipeline only pays for parsing when a tag exists. */
function containsInlineGraphTag(text) {
    if (!text || typeof text !== 'string') return false;
    return new RegExp(`\\[\\s*(?:${GRAPH_TAG_NAMES.join('|')})\\s*:`).test(text);
}

/**
 * Split a tag's param string on top-level commas, respecting double-quoted
 * values (so title="a, b" and params="m:1:-5:5,b:0:-5:5" stay intact).
 * @param {string} paramStr
 * @returns {string[]}
 */
function splitParams(paramStr) {
    const parts = [];
    let cur = '';
    let inQuote = false;
    for (const ch of String(paramStr)) {
        if (ch === '"') { inQuote = !inQuote; cur += ch; continue; }
        if (ch === ',' && !inQuote) { parts.push(cur); cur = ''; continue; }
        cur += ch;
    }
    if (cur.length) parts.push(cur);
    return parts;
}

/**
 * Extract the fn= and title= values from a tag's param string.
 * @param {string} paramStr
 * @returns {{ fn: string|null, title: string|null }}
 */
function parseTagParams(paramStr) {
    let fn = null;
    let title = null;
    for (const part of splitParams(paramStr)) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        const key = part.slice(0, eq).trim().toLowerCase();
        let val = part.slice(eq + 1).trim();
        if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) val = val.slice(1, -1);
        if (key === 'fn' && fn === null) fn = val;
        else if (key === 'title' && title === null) title = val;
    }
    return { fn, title };
}

/**
 * Gate every legacy inline graph tag in the tutor text through applyVisualGate.
 * Blocked tags are removed from the text; in live_experimental a transformable
 * leak is swapped for the gate's safe parallel graph. In shadow/audit_only/off
 * the gate returns the command unchanged, so the text is never modified — only
 * decision records are produced.
 *
 * @param {object} args
 * @param {string} args.text            the tutor's message text
 * @param {object} args.activeProblem   same shape the board gate builds
 * @param {object} [args.learningState]
 * @param {object} [args.user]          for transform dedup
 * @param {string} [args.mode]          VISUAL_GATE_MODE
 * @param {boolean} [args.enableValueJudge]
 * @param {function} [args.valueJudge]  injectable (tests)
 * @returns {Promise<{ text: string, records: object[] }>}
 */
async function gateInlineGraphTags({ text, activeProblem, learningState = null, user = null, mode, enableValueJudge = false, valueJudge = defaultValueJudge } = {}) {
    const records = [];
    if (!text || typeof text !== 'string') return { text, records };

    // Collect matches first (regex is stateful; don't mutate while iterating).
    const matches = [];
    let m;
    TAG_REGEX.lastIndex = 0;
    while ((m = TAG_REGEX.exec(text)) !== null) {
        matches.push({ raw: m[0], name: m[1], params: m[2] });
    }
    if (!matches.length) return { text, records };

    // raw tag string -> replacement string ('' = strip). Dedup identical tags so
    // the same decision applies once and every occurrence is replaced together.
    const replacements = new Map();

    for (const match of matches) {
        if (replacements.has(match.raw)) continue;
        const { fn, title } = parseTagParams(match.params);
        const command = { action: 'graph', fn: fn || null, caption: title || null };

        let gateResult;
        try {
            gateResult = await applyVisualGate({
                command, activeProblem, learningState, tutorMessage: text,
                user, mode, enableValueJudge, valueJudge,
            });
        } catch (_) {
            // Fail SAFE for a leak-shaped tag would mean stripping, but a gate
            // CRASH is not evidence of a leak — leave the tag and record nothing,
            // matching the board gate's "never break a response" contract.
            continue;
        }

        records.push(gateResult.record);
        const rendered = gateResult.command;

        if (rendered === null) {
            // Blocked → strip the tag entirely.
            replacements.set(match.raw, '');
        } else if (rendered !== command && rendered.action === 'graph' && rendered.fn) {
            // Transformed (live_experimental) → swap in the safe parallel graph.
            const cap = rendered.caption ? `,title="${rendered.caption}"` : '';
            replacements.set(match.raw, `[FUNCTION_GRAPH:fn=${rendered.fn}${cap}]`);
        }
        // else: allowed (or shadow/off) → no text change.
    }

    let outText = text;
    for (const [raw, replacement] of replacements) {
        outText = outText.split(raw).join(replacement);
    }
    // Tidy whitespace left by a stripped tag (double spaces / spaces before newline).
    if (outText !== text) {
        outText = outText.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
    }

    return { text: outText, records };
}

module.exports = {
    gateInlineGraphTags,
    containsInlineGraphTag,
    parseTagParams,
    splitParams,
    GRAPH_TAG_NAMES,
};
