// ============================================================
// boardTagStreamFilter.js — SSE-safe chunk filter for <BOARD>
// tags.
//
// Pipeline streams the LLM's text chunk-by-chunk into the chat
// bubble. If a `<BOARD …/>` tag spans two chunks, naive forwarding
// leaks raw tag fragments (`<BOAR` then `D …`) into the visible
// message. This filter holds back:
//   (a) the trailing ≥7 chars (length of "<BOARD ") so a partial
//       opener can never flush, and
//   (b) any open <BOARD …> with no closer yet — entire tag is
//       suppressed until the `/>` or `</BOARD>` arrives.
//
// At end-of-stream call `.flush()` to drain any remaining safe
// text. If we're sitting on an unclosed tag at flush time, the
// content is dropped (the trailing parse + complete-event payload
// will deliver the final cleaned text to the client).
// ============================================================

'use strict';

// `<BOARD ` (with the trailing space) is 7 chars. Anything shorter
// at the tail of our buffer could still grow into a tag opener.
const PREFIX_HOLDBACK = 7;
const TAG_OPEN_RE = /<BOARD\b/i;

// True if `s` could still grow into the tag opener `<BOARD ` — i.e.
// the lowercase opener starts with `s`. Used to decide whether the
// trailing characters of a chunk must be held back.
function isPotentialTagPrefix(s) {
    if (!s) return false;
    const lower = s.toLowerCase();
    const opener = '<board ';
    if (lower.length > opener.length) return false;
    return opener.startsWith(lower);
}

/**
 * Build a stateful filter for one streaming response.
 *
 * Each push() returns whatever text is safe to write to res.write()
 * immediately. Any partial / unclosed tag stays in the buffer until
 * either the closer arrives (and the tag gets stripped) or flush()
 * is called.
 */
function createBoardTagStreamFilter() {
    let buffer = '';
    let insideTag = false; // we've seen `<BOARD` but not yet a closer

    function processBuffer() {
        let out = '';

        while (buffer.length > 0) {
            if (insideTag) {
                // Look for end of self-closing or open/close form.
                const selfClose = buffer.indexOf('/>');
                const openClose = buffer.search(/<\/BOARD>/i);
                let endIdx = -1;
                let endLen = 0;
                if (selfClose !== -1 && (openClose === -1 || selfClose < openClose)) {
                    endIdx = selfClose;
                    endLen = 2;
                } else if (openClose !== -1) {
                    endIdx = openClose;
                    endLen = '</BOARD>'.length;
                }
                if (endIdx === -1) {
                    // Closer not in buffer yet — wait for more.
                    return out;
                }
                // Tag complete; drop it from the buffer and resume normal mode.
                buffer = buffer.slice(endIdx + endLen);
                insideTag = false;
                continue;
            }

            // Not currently inside a tag. Look for the next opener.
            const openMatch = buffer.match(TAG_OPEN_RE);
            if (!openMatch) {
                // No opener in buffer. Flush everything except a possible
                // partial-opener tail.
                let safeLen = buffer.length;
                // Walk back to find the longest suffix that could grow
                // into an opener. Anything <= PREFIX_HOLDBACK-1 chars
                // ending in a partial of `<BOARD ` must be held.
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

            // Opener found. Emit everything before it, then enter tag mode.
            const openIdx = openMatch.index;
            out += buffer.slice(0, openIdx);
            buffer = buffer.slice(openIdx);
            insideTag = true;
            // Loop again — the closer might already be in buffer.
        }

        return out;
    }

    return {
        /**
         * Feed a new chunk. Returns the text safe to emit immediately
         * (with any complete <BOARD> tags stripped and any partial tag
         * held back). The empty string means "nothing safe yet, keep
         * accumulating."
         */
        push(chunk) {
            if (chunk == null) return '';
            buffer += String(chunk);
            return processBuffer();
        },

        /**
         * End-of-stream drain. Returns whatever text is still safe to
         * emit. If we end mid-tag the in-flight tag is dropped — the
         * complete event will deliver the final cleaned text anyway.
         */
        flush() {
            if (insideTag) {
                // We never saw a closer. Discard the in-flight tag —
                // it's better to lose a malformed tag than to leak it.
                buffer = '';
                insideTag = false;
                return '';
            }
            // No partial-opener guard at flush time — the stream is
            // truly done, so a trailing "<" or "<BOAR" is just text.
            const remaining = buffer;
            buffer = '';
            return remaining;
        },

        /** Test hook — current buffered length (no public guarantee). */
        _bufferLength() { return buffer.length; },
    };
}

module.exports = {
    createBoardTagStreamFilter,
};
