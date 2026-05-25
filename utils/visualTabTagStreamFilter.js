// ============================================================
// visualTabTagStreamFilter.js — SSE-safe chunk filter for the
// <GRAPH> and <TILES> tag pair (Phase D).
//
// Same shape as boardTagStreamFilter / xpTagStreamFilter. Holds back
// any trailing partial opener so "<GRAPH" or "<TILES" can never leak
// as raw text; suppresses open tags until their closer arrives.
//
// "<TILES " is 7 chars (matches the BOARD holdback width); "<GRAPH "
// is 7 too. Hold back enough to guard both.
// ============================================================

'use strict';

const PREFIX_HOLDBACK = 7; // longest of "<GRAPH " / "<TILES "
const TAG_OPEN_RE = /<(GRAPH|TILES)\b/i;
// Lowercase candidates the trailing buffer could grow into.
const OPENERS = ['<graph ', '<graph/', '<tiles ', '<tiles/'];

function isPotentialTagPrefix(s) {
    if (!s) return false;
    const lower = s.toLowerCase();
    return OPENERS.some(function (op) {
        return lower.length <= op.length && op.startsWith(lower);
    });
}

// Build a closer regex that matches either <GRAPH/> family or <TILES/>
// family. We need both forms — self-close (`/>`) and full close
// (`</GRAPH>` / `</TILES>`).
const FULL_CLOSE_RE = /<\/(GRAPH|TILES)>/i;

function createVisualTabTagStreamFilter() {
    let buffer = '';
    let insideTag = false;

    function processBuffer() {
        let out = '';
        while (buffer.length > 0) {
            if (insideTag) {
                const selfClose = buffer.indexOf('/>');
                const fullClose = buffer.search(FULL_CLOSE_RE);
                let endIdx = -1;
                let endLen = 0;
                if (selfClose !== -1 && (fullClose === -1 || selfClose < fullClose)) {
                    endIdx = selfClose;
                    endLen = 2;
                } else if (fullClose !== -1) {
                    // Compute the actual closer length (e.g. "</GRAPH>" or "</TILES>").
                    const closerMatch = buffer.slice(fullClose).match(FULL_CLOSE_RE);
                    endIdx = fullClose;
                    endLen = closerMatch ? closerMatch[0].length : '</GRAPH>'.length;
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
    createVisualTabTagStreamFilter,
};
