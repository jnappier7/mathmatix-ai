// ============================================================
// boardTagParser.js — Phase B inline <BOARD> tag protocol
//
// Extracts <BOARD action="…" /> tags from the tutor's reply and
// strips them from the visible text. Mirrors the return shape of
// utils/visualTeachingParser.js so chat.js + pipeline can treat
// the two parsers symmetrically.
//
// Syntax (locked, distinct from the legacy [TAG:csv] convention):
//   <BOARD action="pose"    tex="2x + 4 = 20" />
//   <BOARD action="apply"   op="subtract 4 from both sides" />
//   <BOARD action="resolve" tex="2x = 16" />
//   <BOARD action="verify"  tex="x = 8" check="2(8) + 4 = 20" />
//   <BOARD action="clear" />
//
// Both self-closing (<BOARD … />) and open/close (<BOARD …>…</BOARD>)
// forms are accepted. Attributes accept both single and double quotes.
// The pedagogy guard (utils/boardCommandGuard.js) is layered on top —
// this parser is intentionally permissive about which actions it
// accepts; correctness against the #1 rule is enforced separately.
// ============================================================

'use strict';

const VALID_ACTIONS = new Set(['pose', 'apply', 'resolve', 'verify', 'clear']);

// Matches a single <BOARD …/> or <BOARD …>…</BOARD> tag. The `g` flag
// lets us iterate multiple occurrences in one response. The inner
// attribute payload `[^<>]*?` deliberately bans `<` so a stray `<` in
// the tutor's prose can't accidentally swallow the rest of the message.
const BOARD_TAG_REGEX = /<BOARD\s+([^<>]*?)(?:\/>|>([\s\S]*?)<\/BOARD>)/gi;

// Pulls a single attribute. Supports double quotes, single quotes, and
// the open/close form's multi-line value. Returns null if not present.
function extractAttr(attrString, name) {
    if (!attrString) return null;
    const pattern = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
    const m = attrString.match(pattern);
    if (!m) return null;
    return (m[2] !== undefined ? m[2] : m[3]).trim();
}

/**
 * Parse <BOARD> tags from an AI response.
 *
 * @param {string} aiResponseText - raw model output
 * @returns {{ cleanedText: string, boardCommands: Array<{action:string, tex?:string, op?:string, check?:string}> }}
 */
function parseBoardTags(aiResponseText) {
    if (!aiResponseText || typeof aiResponseText !== 'string') {
        return { cleanedText: aiResponseText || '', boardCommands: [] };
    }

    const boardCommands = [];
    let cleanedText = aiResponseText;

    // Iterate without state pollution — build a fresh regex per call.
    const regex = new RegExp(BOARD_TAG_REGEX.source, BOARD_TAG_REGEX.flags);
    let match;
    while ((match = regex.exec(aiResponseText)) !== null) {
        const attrString = match[1] || '';
        const innerBody = match[2]; // present only for open/close form

        const action = (extractAttr(attrString, 'action') || '').toLowerCase();
        if (!VALID_ACTIONS.has(action)) {
            // Malformed action — drop the tag from visible text but skip emit.
            continue;
        }

        // For the open/close form, the inner body can carry the tex
        // payload (handy for multi-line LaTeX that would otherwise need
        // attribute escaping).
        const texAttr = extractAttr(attrString, 'tex');
        const opAttr = extractAttr(attrString, 'op');
        const checkAttr = extractAttr(attrString, 'check');
        const innerTrim = innerBody ? innerBody.trim() : '';

        const command = { action };
        if (action === 'pose' || action === 'resolve' || action === 'verify') {
            const tex = texAttr || innerTrim || null;
            if (!tex) continue; // require tex for these actions
            command.tex = tex;
        }
        if (action === 'apply') {
            const op = opAttr || innerTrim || null;
            if (!op) continue;
            command.op = op;
        }
        if (action === 'verify' && checkAttr) {
            command.check = checkAttr;
        }
        boardCommands.push(command);
    }

    // Strip every tag from the visible text — even malformed ones we
    // skipped above, so they never leak as raw text into the bubble.
    cleanedText = cleanedText.replace(BOARD_TAG_REGEX, '');

    // Trim resulting double spaces and orphan newlines so the tag
    // removal doesn't leave whitespace scars.
    cleanedText = cleanedText
        .replace(/[ \t]+\n/g, '\n')        // trailing space before newline
        .replace(/\n[ \t]+/g, '\n')        // leading space after newline
        .replace(/\n{3,}/g, '\n\n')        // collapse 3+ newlines
        .replace(/[ \t]{2,}/g, ' ')        // collapse runs of inline spaces
        .trim();

    return { cleanedText, boardCommands };
}

/**
 * Quick predicate — does this text contain any <BOARD> tag at all?
 * Used by the streaming filter to skip the heavier parse when nothing
 * is there to extract.
 */
function hasBoardTags(text) {
    if (!text) return false;
    return /<BOARD\b/i.test(text);
}

module.exports = {
    parseBoardTags,
    hasBoardTags,
    VALID_ACTIONS,
};
