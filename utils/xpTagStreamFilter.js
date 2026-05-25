// ============================================================
// xpTagStreamFilter.js — SSE-safe chunk filter for <XP> tags.
//
// Same shape as utils/boardTagStreamFilter.js: hold back any
// trailing partial-opener so `<XP` can never leak as raw text, and
// suppress open tags until their closer arrives.
//
// `<XP ` (with the trailing space) is 4 chars — much shorter than
// `<BOARD `, so the holdback is correspondingly smaller. The
// stream-time cost of suppressing 4 chars is negligible.
// ============================================================

'use strict';

const PREFIX_HOLDBACK = 4; // length of "<XP "
const TAG_OPEN_RE = /<XP\b/i;

function isPotentialTagPrefix(s) {
    if (!s) return false;
    const lower = s.toLowerCase();
    const opener = '<xp ';
    if (lower.length > opener.length) return false;
    return opener.startsWith(lower);
}

function createXpTagStreamFilter() {
    let buffer = '';
    let insideTag = false;

    function processBuffer() {
        let out = '';
        while (buffer.length > 0) {
            if (insideTag) {
                const selfClose = buffer.indexOf('/>');
                const openClose = buffer.search(/<\/XP>/i);
                let endIdx = -1;
                let endLen = 0;
                if (selfClose !== -1 && (openClose === -1 || selfClose < openClose)) {
                    endIdx = selfClose;
                    endLen = 2;
                } else if (openClose !== -1) {
                    endIdx = openClose;
                    endLen = '</XP>'.length;
                }
                if (endIdx === -1) return out;
                buffer = buffer.slice(endIdx + endLen);
                insideTag = false;
                continue;
            }

            const openMatch = buffer.match(TAG_OPEN_RE);
            if (!openMatch) {
                let safeLen = buffer.length;
                for (let k = Math.min(PREFIX_HOLDBACK - 1, buffer.length); k > 0; k--) {
                    if (isPotentialTagPrefix(buffer.slice(buffer.length - k))) {
                        safeLen = buffer.length - k;
                        break;
                    }
                }
                out += buffer.slice(0, safeLen);
                buffer = buffer.slice(safeLen);
                return out;
            }

            const openIdx = openMatch.index;
            out += buffer.slice(0, openIdx);
            buffer = buffer.slice(openIdx);
            insideTag = true;
        }
        return out;
    }

    return {
        push(chunk) {
            if (chunk == null) return '';
            buffer += String(chunk);
            return processBuffer();
        },
        flush() {
            if (insideTag) {
                buffer = '';
                insideTag = false;
                return '';
            }
            const remaining = buffer;
            buffer = '';
            return remaining;
        },
        _bufferLength() { return buffer.length; },
    };
}

module.exports = {
    createXpTagStreamFilter,
};
