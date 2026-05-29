/* ============================================================
   boardResponseSchema.js — strict JSON schema for the tutor's
   structured response (Phase 1 of the structured-outputs
   migration).

   Why this exists
   ---------------
   The legacy flow has Maya emit `<BOARD action="…" />` tags
   inline inside her chat text, then a regex parser pulls them
   back out in pipeline Stage 5b. Compliance is unreliable: the
   geometry-review session that triggered this work showed Maya
   posing ~10 problems without emitting a single tag. Even with
   "MANDATORY" in caps, side-channel prompt rules degrade as the
   prompt gets long.

   Structured outputs fix the problem at the API boundary. When
   the LLM call sets `response_format: { type: 'json_schema',
   json_schema, strict: true }`, OpenAI guarantees the response
   is a valid instance of the schema. `board_commands` is a
   required field — the model literally cannot return without
   thinking about what goes on the board.

   Strict-mode constraints
   -----------------------
   - additionalProperties MUST be false on every object.
   - Every defined property MUST appear in `required`.
   - There are no optional fields; "not applicable" is expressed
     as `null` via `["string", "null"]`.
   - oneOf / discriminated unions are NOT used here. They work in
     strict mode but constrain field positions in ways that
     complicate streaming. We use a flat "union via nulls" shape
     so a `pose` command and an `image` command share the same
     object schema, just with different fields populated.

   Once the response comes back, `normalizeBoardCommand` strips
   the null fields so downstream code (boardCommandGuard,
   mergeWithLlmCommands, the frontend handler) sees the same
   compact shape it sees today from the legacy tag parser. The
   rest of the pipeline does not change.
   ============================================================ */

'use strict';

const BOARD_ACTIONS = ['pose', 'apply', 'resolve', 'verify', 'clear', 'graph', 'image'];

// The kind of turn Maya is serving. The model self-declares this
// on every structured response. Server-side audit (utils/turnTypeAudit.js)
// flags pedagogical mismatches between the declared turn_type and
// the emitted board_commands — e.g., turn_type='problem_introduction'
// with no pose card is the failure mode the geometry-review session
// surfaced.
//
// OpenAI strict mode supports enum gating but NOT cardinality
// constraints (no minItems), so "turn_type=problem_introduction must
// have a pose card" is enforced in audit, not in schema. The schema
// keeps the field required and limits values to this enum; semantics
// live next door.
const TURN_TYPES = [
  'problem_introduction',  // tutor poses a new problem — pose card expected
  'step_acknowledgment',   // tutor responds to a student step in an open problem — apply/resolve possible
  'verification',          // student stated final answer — verify card expected
  'concept_reference',     // student asked about a concept — image card expected
  'feedback',              // tutor reacts (praise / correction) without advancing the work
  'scaffold',              // tutor lowers difficulty, hints, or breaks into sub-question
  'redirect',              // off-topic redirect back to math
  'small_talk',            // greeting, closing, off-task chitchat
];

const BOARD_COMMAND_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: BOARD_ACTIONS,
      description: 'Which card the WorkBoard renders for this command.',
    },
    tex: {
      type: ['string', 'null'],
      description: 'LaTeX expression. Required for pose, resolve, verify. Null for apply, clear, graph, image.',
    },
    op: {
      type: ['string', 'null'],
      description: 'Operation phrase the student named (e.g., "subtract 4 from both sides"). Required for apply. Null otherwise.',
    },
    check: {
      type: ['string', 'null'],
      description: 'Substitution check the student stated (e.g., "2(8) + 4 = 20"). Optional on verify; null for other actions.',
    },
    fn: {
      type: ['string', 'null'],
      description: 'Function of x for a live graph (e.g., "x^2 - 4"). Required for graph. Null otherwise.',
    },
    query: {
      type: ['string', 'null'],
      description: 'Reference-image search term (e.g., "unit circle labeled"). Required for image. Null otherwise.',
    },
    caption: {
      type: ['string', 'null'],
      description: 'Short caption rendered under a graph or image. Null for other actions.',
    },
  },
  required: ['action', 'tex', 'op', 'check', 'fn', 'query', 'caption'],
  additionalProperties: false,
};

const BOARD_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    turn_type: {
      type: 'string',
      enum: TURN_TYPES,
      description: 'What kind of turn this is. "problem_introduction" when you put a new problem in front of the student (board_commands MUST include a pose). "step_acknowledgment" when responding to a step they took in an open problem. "verification" when they stated a final answer (board_commands SHOULD include verify). "concept_reference" when they asked about a concept and you are showing reference content (board_commands MAY include image). "feedback" for praise or correction without advancing. "scaffold" when lowering difficulty / hinting. "redirect" when steering back to math. "small_talk" for greetings, closings, off-task chitchat.',
    },
    chat_message: {
      type: 'string',
      description: 'The natural-language reply the student sees in the chat bubble. Keep it conversational, in voice — do NOT include any <BOARD>, <XP>, or other system tags; structured fields carry that signal.',
    },
    board_commands: {
      type: 'array',
      description: 'Cards to render on the WorkBoard for this turn, in the order they should appear. Empty array is valid for small-talk turns or feedback that does not advance the work.',
      items: BOARD_COMMAND_SCHEMA,
    },
  },
  required: ['turn_type', 'chat_message', 'board_commands'],
  additionalProperties: false,
};

// The wrapper OpenAI's chat-completions API expects when you pass
// `response_format: { type: 'json_schema', json_schema: {...} }`.
// The `name` field is required and shows up in error traces.
const OPENAI_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'TutorResponse',
    description: 'Mathmatix tutor response with chat text and structured WorkBoard commands.',
    schema: BOARD_RESPONSE_SCHEMA,
    strict: true,
  },
};

/**
 * Strip the null placeholder fields the strict schema requires
 * down to the compact `{ action, tex?, op?, ... }` shape that
 * boardCommandGuard, mergeWithLlmCommands, and the frontend
 * handler all expect.
 *
 * Empty strings are treated the same as null — we do not want
 * `{ action: 'apply', op: '' }` slipping through.
 *
 * @param {object} cmd - One element from board_commands as
 *   returned by the structured LLM call.
 * @returns {object|null} Compact command, or null if `action`
 *   is missing or not in the allowed enum.
 */
function normalizeBoardCommand(cmd) {
  if (!cmd || typeof cmd !== 'object') return null;
  if (!BOARD_ACTIONS.includes(cmd.action)) return null;

  const out = { action: cmd.action };
  const FIELDS = ['tex', 'op', 'check', 'fn', 'query', 'caption'];
  for (const field of FIELDS) {
    const v = cmd[field];
    if (typeof v === 'string' && v.length > 0) {
      out[field] = v;
    }
  }
  return out;
}

/**
 * Normalize an entire structured response. Drops malformed
 * commands silently — the caller should treat the returned
 * `board_commands` as authoritative.
 *
 * @param {object} parsed - Parsed JSON from the structured call.
 * @returns {{ turn_type: string|null, chat_message: string, board_commands: object[] }}
 */
function normalizeStructuredResponse(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { turn_type: null, chat_message: '', board_commands: [] };
  }
  const turnType = typeof parsed.turn_type === 'string' && TURN_TYPES.includes(parsed.turn_type)
    ? parsed.turn_type
    : null;
  const chat = typeof parsed.chat_message === 'string' ? parsed.chat_message : '';
  const rawCmds = Array.isArray(parsed.board_commands) ? parsed.board_commands : [];
  const cmds = rawCmds
    .map(normalizeBoardCommand)
    .filter(Boolean);
  return { turn_type: turnType, chat_message: chat, board_commands: cmds };
}

/**
 * Phase 1 rollout flag. Default OFF. When true, the pipeline's
 * non-streaming generate stage swaps to the structured-output
 * path. Streaming is intentionally NOT covered yet — that's
 * Phase 2. With the flag off, the pipeline runs exactly as it
 * does today.
 *
 * Read the env at call time rather than module load so a test
 * can flip it with `process.env.STRUCTURED_TUTOR_RESPONSE='true'`
 * without needing to reload modules.
 */
function isStructuredModeEnabled() {
  const v = process.env.STRUCTURED_TUTOR_RESPONSE;
  return v === 'true' || v === '1';
}

module.exports = {
  BOARD_ACTIONS,
  TURN_TYPES,
  BOARD_COMMAND_SCHEMA,
  BOARD_RESPONSE_SCHEMA,
  OPENAI_RESPONSE_FORMAT,
  normalizeBoardCommand,
  normalizeStructuredResponse,
  isStructuredModeEnabled,
};
