/* ============================================================
   structuredChatStreamExtractor.js — incrementally extract the
   `chat_message` value from an OpenAI structured-output stream.

   Why this exists
   ---------------
   Phase 2 of the structured-tutor-response migration. With
   `response_format: { type: 'json_schema', strict: true }` and
   `stream: true`, OpenAI streams the JSON body token-by-token.
   The user shouldn't notice — they expect chat text to appear
   word-by-word, the same as today's free-text streaming.

   This extractor sits between the raw stream and the SSE
   forwarder. It receives delta.content strings, scans for the
   `chat_message` string value, and returns newly-decoded chat
   text on each push. When the stream finishes, the full buffer
   is JSON-parsed to recover board_commands.

   Why a hand-rolled state machine
   -------------------------------
   The schema is fixed (chat_message before board_commands by
   declared field order, both at the top level). The string we
   need to extract is a single JSON string value. A general
   streaming JSON parser would handle 20× more than this needs
   and would be the largest new dependency in months. A hand-
   rolled scanner with a 3-state machine is 80 lines and easy to
   audit.

   Robustness
   ----------
   - Tolerant of whitespace around the colon (`"chat_message" : "...`).
   - Tolerant of OpenAI emitting the fields in unexpected order.
     Looks for the key by name, not by position.
   - Handles all JSON escape sequences in the value, including
     `\uXXXX` unicode escapes that may split across deltas.
   - On JSON-parse failure at finalize, returns null so the
     caller can fall back to the legacy free-text path.
   ============================================================ */

'use strict';

const STATE_PRE_CHAT = 'PRE_CHAT';
const STATE_IN_CHAT = 'IN_CHAT';
const STATE_POST_CHAT = 'POST_CHAT';

const CHAT_KEY_RE = /"chat_message"\s*:\s*"/;

const SIMPLE_ESCAPES = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
};

/**
 * Create a new extractor. Single-use — one instance per stream.
 * Returns:
 *   - push(delta): consume an OpenAI delta.content string. Returns
 *     newly-decoded chat text to forward (may be ''). Safe to call
 *     after the value has ended; later pushes simply append to the
 *     internal buffer so finalize can JSON.parse the full body.
 *   - finalize(): call after the stream's last chunk. Returns the
 *     parsed JSON object or null on malformed input.
 *   - getRawBuffer(): the full accumulated text (for diagnostics).
 */
function createStructuredChatStreamExtractor() {
  let fullBuffer = '';
  let scanIdx = 0;
  let state = STATE_PRE_CHAT;

  function scan() {
    let emitted = '';

    while (scanIdx < fullBuffer.length) {
      if (state === STATE_PRE_CHAT) {
        // Look for `"chat_message" : "` anywhere in the buffer at or
        // past scanIdx. If absent, stay parked until more arrives.
        const slice = fullBuffer.slice(scanIdx);
        const m = CHAT_KEY_RE.exec(slice);
        if (!m) {
          // Marker not found yet. Move scanIdx forward to a safe
          // floor so we never re-scan an unbounded prefix, but
          // leave enough overlap that a marker split across deltas
          // still matches on the next push. The marker is at most
          // about 22 chars after whitespace normalization.
          const SAFE_OVERLAP = 32;
          if (slice.length > SAFE_OVERLAP) {
            scanIdx += slice.length - SAFE_OVERLAP;
          }
          return emitted;
        }
        scanIdx += m.index + m[0].length;
        state = STATE_IN_CHAT;
        continue;
      }

      if (state === STATE_IN_CHAT) {
        const ch = fullBuffer[scanIdx];
        if (ch === '\\') {
          // Escape sequence. Need at least one more char to dispatch.
          if (scanIdx + 1 >= fullBuffer.length) return emitted;
          const next = fullBuffer[scanIdx + 1];
          if (next === 'u') {
            // \uXXXX — need four more hex digits beyond `\u`.
            if (scanIdx + 5 >= fullBuffer.length) return emitted;
            const hex = fullBuffer.slice(scanIdx + 2, scanIdx + 6);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
              // Malformed escape. Bail out of structured extraction
              // by transitioning to POST_CHAT — the eventual
              // finalize() JSON.parse will fail and the caller
              // will fall back. Don't emit garbage chat text.
              state = STATE_POST_CHAT;
              return emitted;
            }
            emitted += String.fromCharCode(parseInt(hex, 16));
            scanIdx += 6;
            continue;
          }
          const decoded = SIMPLE_ESCAPES[next];
          if (decoded === undefined) {
            // Unknown escape. JSON spec rejects it; we mirror by
            // bailing to POST_CHAT and letting finalize fail.
            state = STATE_POST_CHAT;
            return emitted;
          }
          emitted += decoded;
          scanIdx += 2;
          continue;
        }
        if (ch === '"') {
          // End of chat_message value.
          state = STATE_POST_CHAT;
          scanIdx += 1;
          continue;
        }
        emitted += ch;
        scanIdx += 1;
        continue;
      }

      // POST_CHAT — ignore the rest. board_commands JSON will be
      // recovered by finalize()'s JSON.parse over the full buffer.
      return emitted;
    }

    return emitted;
  }

  return {
    push(delta) {
      if (typeof delta !== 'string' || delta.length === 0) return '';
      fullBuffer += delta;
      return scan();
    },

    finalize() {
      try {
        return JSON.parse(fullBuffer);
      } catch {
        return null;
      }
    },

    getRawBuffer() {
      return fullBuffer;
    },

    getState() {
      return state;
    },
  };
}

module.exports = {
  createStructuredChatStreamExtractor,
};
