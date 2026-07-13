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
              // Not a valid \uXXXX. Rather than bail to POST_CHAT
              // (which used to strand finalize() into the raw-envelope
              // fallback), keep `\u` literally and read on. finalize()'s
              // tolerant recovery handles the malformed buffer.
              emitted += '\\u';
              scanIdx += 2;
              continue;
            }
            emitted += String.fromCharCode(parseInt(hex, 16));
            scanIdx += 6;
            continue;
          }
          const decoded = SIMPLE_ESCAPES[next];
          if (decoded === undefined) {
            // Invalid JSON escape — almost always LaTeX written with a
            // single backslash (\times, \boxed, \3x). The model emits
            // this constantly, and strict JSON.parse rejects it. Rather
            // than bail to POST_CHAT (which stranded finalize() into the
            // raw-envelope fallback that leaked the whole payload into
            // the chat bubble), keep the backslash + char literally so
            // the LaTeX survives and streaming stays complete. finalize()
            // repairs the buffer to recover board_commands.
            emitted += '\\' + next;
            scanIdx += 2;
            continue;
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
      return recoverStructuredResponse(fullBuffer);
    },

    getRawBuffer() {
      return fullBuffer;
    },

    getState() {
      return state;
    },
  };
}

/* ============================================================
   Tolerant recovery + envelope guard
   ------------------------------------------------------------
   The tutor's structured response is a JSON envelope
   `{ turn_type, chat_message, board_commands }`. When the model
   emits LaTeX with single backslashes (\times, \boxed, \3x), the
   body is not valid JSON. Under a provider that does not enforce
   strict escaping at the API boundary (e.g. the Claude adapter's
   output_config), the malformed body reaches us and a naive
   JSON.parse throws.

   The dangerous failure mode this guards against: on parse
   failure the old code fell back to a plain LLM call whose prompt
   still asked for the JSON envelope, then rendered/persisted that
   raw envelope verbatim — the whole `{ "chat_message": ... }`
   blob showing up in the student's chat bubble and saved to
   history.

   These helpers make failure graceful: recover the chat text
   (LaTeX-preserving) plus best-effort board commands, and, as a
   last-line guard, strip a raw envelope back down to its chat
   text before anything is shown or saved.
   ============================================================ */

// Double only backslashes that do NOT begin a valid JSON escape,
// making a LaTeX-corrupted body parseable without disturbing the
// structural escapes (\" \\ \uXXXX) that hold the JSON together.
function repairInvalidEscapes(s) {
  return s.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
}

// Pull the chat_message string value out of a (possibly malformed)
// envelope by hand, decoding valid JSON escapes and keeping any
// invalid ones (LaTeX) literal. Returns null if no chat_message
// key is present.
function extractChatMessageLoose(raw) {
  if (typeof raw !== 'string') return null;
  const m = CHAT_KEY_RE.exec(raw);
  if (!m) return null;
  let i = m.index + m[0].length;
  let out = '';
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\') {
      const next = raw[i + 1];
      if (next === undefined) break;
      if (next === 'u') {
        const hex = raw.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        out += '\\u';
        i += 2;
        continue;
      }
      const decoded = SIMPLE_ESCAPES[next];
      if (decoded !== undefined) {
        out += decoded;
      } else {
        // Invalid escape → LaTeX; keep it literal.
        out += '\\' + next;
      }
      i += 2;
      continue;
    }
    if (ch === '"') break; // unescaped closing quote ends the value
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Parse a structured-tutor envelope tolerantly.
 *
 * @param {string} raw - The full accumulated response body.
 * @returns {{turn_type?, chat_message, board_commands}|null}
 *   A parsed/recovered object, or null only when there is no
 *   recognizable chat_message at all (caller must then use a safe
 *   generic message — never the raw text).
 */
function recoverStructuredResponse(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;

  // 1. Strict parse — the common case (valid JSON from a strict
  //    provider). Returns the full object untouched.
  try {
    return JSON.parse(raw);
  } catch { /* fall through to recovery */ }

  // 2. Recover chat text reliably and LaTeX-preserving.
  const chat = extractChatMessageLoose(raw);
  if (chat == null) return null;

  // 3. Best-effort board recovery from an escape-repaired parse.
  //    If it still fails, we drop the board rather than leak — a
  //    missing card is recoverable, a JSON dump in the bubble is not.
  let boardCommands = [];
  let turnType;
  try {
    const repaired = JSON.parse(repairInvalidEscapes(raw));
    if (Array.isArray(repaired.board_commands)) boardCommands = repaired.board_commands;
    if (typeof repaired.turn_type === 'string') turnType = repaired.turn_type;
  } catch { /* board dropped; chat still shows */ }

  return { turn_type: turnType, chat_message: chat, board_commands: boardCommands };
}

// Does this text look like a raw tutor JSON envelope rather than
// prose? Narrow on purpose: must start with `{` and carry the
// chat_message key, so ordinary chat that merely mentions braces
// is never touched.
function looksLikeEnvelope(text) {
  if (typeof text !== 'string') return false;
  const t = text.trimStart();
  return t.charCodeAt(0) === 0x7b /* { */ && /"chat_message"\s*:/.test(t);
}

/**
 * Last-line guard applied to any text about to be shown to the
 * student or persisted. If a raw envelope slipped through (e.g. a
 * fallback LLM call that still returned the JSON shape), reduce it
 * to just its chat text. Ordinary prose passes through untouched.
 *
 * @param {string} text
 * @returns {string}
 */
function deEnvelope(text) {
  if (!looksLikeEnvelope(text)) return text;
  const recovered = recoverStructuredResponse(text);
  const chat = recovered && typeof recovered.chat_message === 'string'
    ? recovered.chat_message.trim()
    : '';
  // Envelope-shaped but unrecoverable → safe generic, never raw.
  return chat || "I'm not sure how to respond.";
}

module.exports = {
  createStructuredChatStreamExtractor,
  recoverStructuredResponse,
  extractChatMessageLoose,
  deEnvelope,
  looksLikeEnvelope,
};
