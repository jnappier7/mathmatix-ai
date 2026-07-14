// ============================================================
// boardJsonParser.js — recover board commands the model emitted as
// raw JSON instead of the locked <BOARD .../> tag syntax.
//
// The board contract is <BOARD action="verify" tex="…" />
// (utils/boardTagParser.js). Some models ignore that and write the
// command as a JSON object in their prose:
//     {"action":"verify","tex":"h = 3","check":"5 \times 4 \times 3 = 60"}
// The tag parser doesn't recognize that shape, so historically it
// (a) leaked as visible text and (b) never reached the board.
//
// This parser recovers those objects into the SAME command shape the
// tag parser produces, so index.js can route them through the identical
// concept-model resolve + pedagogy guard. It also returns cleanedText
// with the objects removed so nothing leaks.
//
// Why not JSON.parse?
//   1. LaTeX braces collide with JSON braces — "tex":"\frac{1}{2}" has
//      `{}` inside the string. A naive brace count breaks; we track
//      string state so in-string braces don't count.
//   2. Models emit single-backslash LaTeX ("\times"), which is invalid
//      JSON and would be mangled (\t → TAB) by JSON.parse. We extract
//      field values by regex and preserve backslashes literally,
//      unescaping only \" and \\ — exactly what KaTeX wants.
// ============================================================

'use strict';

const { VALID_ACTIONS } = require('./boardTagParser');

const BOARD_VERBS = Array.from(VALID_ACTIONS);

/**
 * Scan for balanced, string-aware top-level {...} objects. In-string
 * braces (LaTeX) and escaped characters do not affect depth. Returns
 * the raw slices with their positions.
 */
function scanJsonObjects(text) {
    const objects = [];
    const n = text.length;
    let i = 0;

    while (i < n) {
        if (text[i] !== '{') { i++; continue; }

        let depth = 0;
        let inStr = false;
        let esc = false;
        let end = -1;

        for (let j = i; j < n; j++) {
            const c = text[j];
            if (esc) { esc = false; continue; }
            if (inStr) {
                if (c === '\\') { esc = true; }
                else if (c === '"') { inStr = false; }
                continue;
            }
            if (c === '"') { inStr = true; continue; }
            if (c === '{') { depth++; }
            else if (c === '}') {
                depth--;
                if (depth === 0) { end = j; break; }
            }
        }

        if (end === -1) {
            // Unbalanced from here — no complete object. Stop scanning
            // (a lone '{' with no closer won't become one later either).
            break;
        }
        objects.push({ start: i, end: end + 1, raw: text.slice(i, end + 1) });
        i = end + 1;
    }

    return objects;
}

/**
 * Extract a string field's raw value, preserving backslashes. Unescapes
 * only \" and \\ (the two escapes that would otherwise misread the
 * value); \times and friends survive intact for KaTeX.
 */
function extractField(raw, key) {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i');
    const m = raw.match(re);
    if (!m) return null;
    return m[1].replace(/\\(["\\])/g, '$1').trim();
}

/**
 * Parse raw-JSON board commands out of text.
 *
 * @param {string} text - tutor text (AFTER <BOARD> tag stripping)
 * @returns {{ cleanedText: string, boardCommands: Array<Object> }}
 */
function parseBoardJsonCommands(text) {
    if (!text || typeof text !== 'string') {
        return { cleanedText: text || '', boardCommands: [] };
    }

    const objects = scanJsonObjects(text);
    if (objects.length === 0) return { cleanedText: text, boardCommands: [] };

    const boardCommands = [];
    const stripRanges = [];

    for (const obj of objects) {
        const action = (extractField(obj.raw, 'action') || '').toLowerCase();
        if (!VALID_ACTIONS.has(action)) continue; // not a board command — leave it

        // From here the object IS a (possibly malformed) board command.
        // Strip it either way so it can't leak; only emit if well-formed.
        stripRanges.push(obj);

        const tex = extractField(obj.raw, 'tex');
        const op = extractField(obj.raw, 'op');
        const check = extractField(obj.raw, 'check');
        const fn = extractField(obj.raw, 'fn');
        const query = extractField(obj.raw, 'query');
        const caption = extractField(obj.raw, 'caption');

        const command = { action };
        if (action === 'pose' || action === 'resolve' || action === 'verify'
            || action === 'scaffold' || action === 'example') {
            if (!tex) continue; // required
            command.tex = tex;
        }
        if (action === 'example' && caption) command.caption = caption;
        if (action === 'apply') {
            if (!op) continue;
            command.op = op;
        }
        if (action === 'verify' && check) command.check = check;
        if (action === 'graph') {
            if (!fn) continue;
            command.fn = fn;
            if (caption) command.caption = caption;
        }
        if (action === 'image') {
            if (!query) continue;
            command.query = query;
            if (caption) command.caption = caption;
        }
        if (action === 'model') {
            const spec = extractField(obj.raw, 'spec');
            const modelName = extractField(obj.raw, 'model');
            const prompt = extractField(obj.raw, 'prompt');
            if (!spec && !modelName) continue;
            if (spec) command.spec = spec;
            if (modelName) command.model = modelName;
            if (prompt) command.prompt = prompt;
        }
        boardCommands.push(command);
    }

    if (stripRanges.length === 0) return { cleanedText: text, boardCommands: [] };

    // Remove stripped objects back-to-front so earlier indices stay valid.
    let cleanedText = text;
    for (let k = stripRanges.length - 1; k >= 0; k--) {
        const { start, end } = stripRanges[k];
        cleanedText = cleanedText.slice(0, start) + cleanedText.slice(end);
    }

    // Heal whitespace scars — same normalization as boardTagParser.
    cleanedText = cleanedText
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

    return { cleanedText, boardCommands };
}

module.exports = {
    parseBoardJsonCommands,
    scanJsonObjects,
    BOARD_VERBS,
};
