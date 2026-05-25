// ============================================================
// visualTabTagParser.js — Phase D inline <GRAPH> / <TILES> tag protocol
//
// Sibling protocol to <BOARD> and <XP>. These two tags switch the
// workspace right slot to a focused tool tab instead of dropping a
// card into the board timeline:
//
//   <GRAPH fn="x^2 - 4" caption="Where it crosses zero" />
//   <TILES expression="2x + 3" />
//
// They COEXIST with the existing <BOARD action="graph"/> and the
// legacy [ALGEBRA_TILES:...] inline syntax. Two distinct uses:
//   - <BOARD action="graph"/>  → drops a small graph card inside the
//                                board timeline as reference content
//   - <GRAPH/>                 → switches the workspace to the Graph
//                                tab so the student can manipulate it
//   - <TILES/>                 → opens the algebra-tiles workspace
//
// Both forms (self-closing and open/close) are accepted. Attributes
// accept both single and double quotes. Tags missing their required
// payload (fn= for GRAPH, no required attr for TILES) are stripped
// from visible text but emit no command.
// ============================================================

'use strict';

// `\s*` (not `\s+`) so we also catch the bare-open forms `<TILES/>`,
// `<TILES />`, and the open/close form `<GRAPH>...</GRAPH>` where no
// whitespace separates the tag name from `>` or `/`. The attribute
// payload `[^<>]*?` is lazy-zero-or-more so it can be empty.
const TAG_REGEX = /<(GRAPH|TILES)\s*([^<>]*?)\s*(?:\/>|>([\s\S]*?)<\/\1>)/gi;

function extractAttr(attrString, name) {
    if (!attrString) return null;
    const pattern = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
    const m = attrString.match(pattern);
    if (!m) return null;
    return (m[2] !== undefined ? m[2] : m[3]).trim();
}

/**
 * Parse <GRAPH> / <TILES> tags from an AI response.
 *
 * @param {string} aiResponseText
 * @returns {{ cleanedText: string, visualTabCommands: Array<{tab:'graph'|'tiles', fn?:string, expression?:string, caption?:string}> }}
 */
function parseVisualTabTags(aiResponseText) {
    if (!aiResponseText || typeof aiResponseText !== 'string') {
        return { cleanedText: aiResponseText || '', visualTabCommands: [] };
    }

    const commands = [];
    let cleanedText = aiResponseText;

    const regex = new RegExp(TAG_REGEX.source, TAG_REGEX.flags);
    let match;
    while ((match = regex.exec(aiResponseText)) !== null) {
        const tagName = (match[1] || '').toLowerCase();
        const attrString = match[2] || '';
        const innerBody = match[3];
        const innerTrim = innerBody ? innerBody.trim() : '';

        if (tagName === 'graph') {
            const fn = extractAttr(attrString, 'fn') || innerTrim || null;
            if (!fn) continue; // graph without a function is meaningless
            const caption = extractAttr(attrString, 'caption');
            const cmd = { tab: 'graph', fn };
            if (caption) cmd.caption = caption;
            commands.push(cmd);
        } else if (tagName === 'tiles') {
            // expression= is optional — the bare-open `<TILES/>` is the
            // common "just launch the workspace" case.
            const expression = extractAttr(attrString, 'expression') || innerTrim || null;
            const cmd = { tab: 'tiles' };
            if (expression) cmd.expression = expression;
            commands.push(cmd);
        }
    }

    cleanedText = cleanedText.replace(TAG_REGEX, '');
    cleanedText = cleanedText
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

    return { cleanedText, visualTabCommands: commands };
}

function hasVisualTabTags(text) {
    if (!text) return false;
    return /<(GRAPH|TILES)\b/i.test(text);
}

module.exports = {
    parseVisualTabTags,
    hasVisualTabTags,
};
