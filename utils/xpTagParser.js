// ============================================================
// xpTagParser.js — Phase C inline <XP> ceremony tag protocol
//
// Extracts <XP size="..." reason="..." /> tags from the tutor's reply
// and strips them from the visible text. Mirrors the shape of
// utils/boardTagParser.js so the pipeline can treat both
// symmetrically.
//
// `<XP>` is a VISUAL ceremony tag — it does NOT award XP. Real XP
// grants still come from <CORE_BEHAVIOR_XP:N,behavior> (parsed in
// utils/pipeline/verify.js) and the automatic Tier 1/2 paths. The
// model uses <XP> to amplify a moment with confetti + an optional
// caption when it deserves more celebration than the underlying
// XP grant alone would provide, OR when there's no grant but the
// moment is still worth recognizing (a student catches their own
// error, or has a breakthrough mid-explanation).
//
// Syntax (locked, distinct from <BOARD> and from legacy [TAG:csv]):
//   <XP size="small" />
//   <XP size="medium" reason="caught your own mistake" />
//   <XP size="large" reason="breakthrough on factoring" />
//
// Both self-closing and open/close forms are accepted. Attributes
// accept both single and double quotes. The reason= attribute is
// optional; if supplied it surfaces as a brief caption above the
// confetti.
// ============================================================

'use strict';

const VALID_SIZES = new Set(['small', 'medium', 'large']);

const XP_TAG_REGEX = /<XP\s+([^<>]*?)(?:\/>|>([\s\S]*?)<\/XP>)/gi;

function extractAttr(attrString, name) {
    if (!attrString) return null;
    const pattern = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
    const m = attrString.match(pattern);
    if (!m) return null;
    return (m[2] !== undefined ? m[2] : m[3]).trim();
}

/**
 * Parse <XP> tags from an AI response.
 *
 * @param {string} aiResponseText - raw model output
 * @returns {{ cleanedText: string, xpCommands: Array<{size:string, reason?:string}> }}
 */
function parseXpTags(aiResponseText) {
    if (!aiResponseText || typeof aiResponseText !== 'string') {
        return { cleanedText: aiResponseText || '', xpCommands: [] };
    }

    const xpCommands = [];
    let cleanedText = aiResponseText;

    const regex = new RegExp(XP_TAG_REGEX.source, XP_TAG_REGEX.flags);
    let match;
    while ((match = regex.exec(aiResponseText)) !== null) {
        const attrString = match[1] || '';
        const innerBody = match[2];

        const size = (extractAttr(attrString, 'size') || '').toLowerCase();
        if (!VALID_SIZES.has(size)) {
            // Malformed size — drop the tag from visible text but skip emit.
            continue;
        }

        // reason= can come from attr or inner body (open/close form).
        const reasonAttr = extractAttr(attrString, 'reason');
        const innerTrim = innerBody ? innerBody.trim() : '';
        const reason = reasonAttr || innerTrim || null;

        const command = { size };
        if (reason) command.reason = reason;
        xpCommands.push(command);
    }

    cleanedText = cleanedText.replace(XP_TAG_REGEX, '');
    cleanedText = cleanedText
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

    return { cleanedText, xpCommands };
}

function hasXpTags(text) {
    if (!text) return false;
    return /<XP\b/i.test(text);
}

module.exports = {
    parseXpTags,
    hasXpTags,
    VALID_SIZES,
};
