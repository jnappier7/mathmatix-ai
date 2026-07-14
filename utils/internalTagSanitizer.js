// ============================================================
// internalTagSanitizer.js — last-line defense against internal
// scaffolding leaking into the student-facing bubble.
//
// Two classes of leak this strips from the tutor's FINAL text:
//
//   1. Internal instruction tags we INJECT into the model's
//      context and that the model sometimes parrots back:
//        [ANSWER_PRE_CHECK: VERIFIED CORRECT ...]   (pipeline/generate.js)
//        [CHECK MY WORK — INDEPENDENTLY VERIFIED ...] (routes/chat.js)
//      These are directives, never meant for the student. When
//      echoed they also render badly — KaTeX turns the
//      `ANSWER_PRE_CHECK` underscores into subscripts.
//
//   2. Board commands the model emitted as raw JSON instead of the
//      locked <BOARD .../> tag syntax (boardTagParser.js). The tag
//      parser doesn't recognize the JSON shape, so a stray
//        {"action":"verify","tex":"h = 3","check":"5*4*3 = 60"}
//      leaks as visible text AND never reaches the board. We strip
//      it here so it can't leak; recovering it as a real board
//      command is a separate, guarded concern (boardCommandGuard).
//
// IMPORTANT: this is a PURE post-processor, not a streaming filter.
// A brace-aware stream filter would be unsafe — LaTeX is full of
// `{}` (\frac{1}{2}, \boxed{}) and we'd corrupt math mid-stream.
// The JSON pattern here is safe precisely because it requires an
// "action":"<board-verb>" pair inside the braces, which LaTeX never
// contains. Transient stream flicker is overwritten by the
// authoritative `complete`/replacement event, which carries the
// sanitized final text.
// ============================================================

'use strict';

// Internal instruction tags injected into model context. Matched by
// their distinctive opener up to the closing `]` (the injected tags
// never contain a `]` themselves).
const INTERNAL_BRACKET_TAGS = [
    /\[ANSWER_PRE_CHECK\b[^\]]*\]/gi,
    /\[CHECK MY WORK\b[^\]]*\]/gi,
];

// Board verbs (mirror of boardTagParser.VALID_ACTIONS). A JSON object
// carrying one of these as its "action" is a mis-formatted board
// command, not prose.
const BOARD_VERBS = 'pose|apply|resolve|verify|clear|graph|image|scaffold|model|example';

// A flat JSON object (no nested braces) whose keys include
// "action":"<board-verb>". `[^{}]*?` bans nested braces so this can
// never span across / swallow legitimate LaTeX braces around it.
// Kept as a source string so each use builds a fresh RegExp — sharing
// a /g regex across .test()/.replace() would leak lastIndex state.
const BOARD_JSON_SRC = `\\{[^{}]*?"action"\\s*:\\s*"(?:${BOARD_VERBS})"[^{}]*?\\}`;

/**
 * Remove leaked internal scaffolding from a tutor message.
 *
 * @param {string} text - the model's (already board-tag-stripped) text
 * @returns {string} text safe to show the student
 */
function stripInternalTags(text) {
    if (!text || typeof text !== 'string') return text || '';

    let out = text;
    for (const re of INTERNAL_BRACKET_TAGS) {
        out = out.replace(new RegExp(re.source, re.flags), '');
    }
    out = out.replace(new RegExp(BOARD_JSON_SRC, 'gi'), '');

    // Heal whitespace scars left by removal — same normalization the
    // board tag parser applies so the two are visually consistent.
    out = out
        .replace(/[ \t]+\n/g, '\n')   // trailing space before newline
        .replace(/\n[ \t]+/g, '\n')   // leading space after newline
        .replace(/\n{3,}/g, '\n\n')   // collapse 3+ newlines
        .replace(/[ \t]{2,}/g, ' ')   // collapse runs of inline spaces
        .trim();

    return out;
}

/**
 * Cheap predicate — is there anything for stripInternalTags to do?
 * Lets hot-path callers skip the regex work on the common clean case.
 */
function hasInternalTags(text) {
    if (!text || typeof text !== 'string') return false;
    return /\[ANSWER_PRE_CHECK\b/i.test(text)
        || /\[CHECK MY WORK\b/i.test(text)
        || new RegExp(BOARD_JSON_SRC, 'i').test(text);
}

module.exports = {
    stripInternalTags,
    hasInternalTags,
};
