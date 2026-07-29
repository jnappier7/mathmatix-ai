/**
 * BOARD TOOLS — the WorkBoard as a structured tool call.
 *
 * Third (and target) protocol for board commands, after inline <BOARD/> tags
 * and STRUCTURED_TUTOR_RESPONSE JSON mode. The model calls `update_board`
 * with a commands array instead of weaving tags through its prose. Tool
 * arguments are schema-validated at the API boundary, so there is no
 * half-streamed-tag / mangled-JSON failure mode — a board update either
 * parses or never happened.
 *
 * Server-side translation only: tool calls are mapped into the SAME compact
 * command shape the tag parser and structured mode produce
 * (normalizeBoardCommand), then returned from generate() as
 * `structuredBoardCommands`. Stage 5b in pipeline/index.js picks those up
 * unconditionally, so the pedagogy guard, synthesizer, visual gate, and the
 * client's `complete`-event contract are all unchanged.
 *
 * Rolled out behind BOARD_TOOL_CALLS (default off). Mutually exclusive with
 * STRUCTURED_TUTOR_RESPONSE in practice: generate.js skips structured mode
 * whenever tools are wired (response_format and tools cannot combine).
 *
 * Requires the provider to support tool calls — openaiClient natively, and
 * anthropicClient via its tool translation (added together with this module).
 *
 * @module boardTools
 */

'use strict';

const { BOARD_ACTIONS, normalizeBoardCommand } = require('./boardResponseSchema');

const BOARD_TOOL_NAME = 'update_board';

// Tool-call schema. Unlike the strict structured-output schema (which needs
// every field required + null-unions), tool arguments allow plain optional
// fields — simpler for the model and identical after normalization.
const BOARD_TOOL = {
  type: 'function',
  function: {
    name: BOARD_TOOL_NAME,
    description:
      'Render cards on the WorkBoard beside the chat. Call ONCE per turn with all cards for the turn, in order. ' +
      'The board mirrors the STUDENT\'s reasoning: pose when a new problem starts, apply/resolve only AFTER the student states the move/result, verify when the answer is checked. ' +
      'Never write a step the student has not said, and never pose the answer.',
    parameters: {
      type: 'object',
      properties: {
        commands: {
          type: 'array',
          description: 'Cards to render, in order. Empty array is valid (small talk, feedback that does not advance the work).',
          items: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: BOARD_ACTIONS,
                description: 'Which card to render.',
              },
              tex: {
                type: 'string',
                description: 'LaTeX. Required for pose/resolve/verify/scaffold/example. A scaffold MUST contain at least one empty \\boxed{} slot for the student to fill.',
              },
              op: {
                type: 'string',
                description: 'Operation phrase the student named (e.g. "subtract 4 from both sides"). Required for apply.',
              },
              check: {
                type: 'string',
                description: 'Substitution check the student stated (e.g. "2(8) + 4 = 20"). Optional on verify.',
              },
              fn: {
                type: 'string',
                description: 'Function of x for a live graph (e.g. "x^2 - 4"). Required for graph.',
              },
              query: {
                type: 'string',
                description: 'Reference-image search term (e.g. "unit circle labeled"). Required for image.',
              },
              caption: {
                type: 'string',
                description: 'Short caption under a graph/image, or an optional step label on an example card.',
              },
              model: {
                type: 'string',
                description: 'Curated concept-model name for a "model" card (e.g. "slope_intercept_line").',
              },
              spec: {
                type: 'string',
                description: 'Complete concept-model spec as a JSON string, for a "model" card no curated name covers.',
              },
              prompt: {
                type: 'string',
                description: 'Short teaching intention above a concept model (e.g. "Slide m up — what happens?").',
              },
            },
            required: ['action'],
          },
        },
      },
      required: ['commands'],
    },
  },
};

const BOARD_TOOLS = [BOARD_TOOL];

function isBoardToolCall(name) {
  return name === BOARD_TOOL_NAME;
}

/**
 * Rollout flag, read at call time so tests can flip it without module
 * reloads (same convention as isStructuredModeEnabled).
 */
function isBoardToolModeEnabled() {
  const v = process.env.BOARD_TOOL_CALLS;
  return v === 'true' || v === '1';
}

/**
 * Map accumulated OpenAI-shaped tool calls to compact board commands.
 * Non-board calls are ignored; malformed arguments/commands drop silently
 * (normalizeBoardCommand is the same gate structured mode uses).
 *
 * @param {Array} toolCalls - [{ id, type, function: { name, arguments } }]
 * @returns {Array} compact board commands, [] when none
 */
function boardCommandsFromToolCalls(toolCalls) {
  const commands = [];
  for (const call of toolCalls || []) {
    if (!isBoardToolCall(call?.function?.name)) continue;
    let parsed;
    try {
      parsed = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      continue;
    }
    for (const cmd of Array.isArray(parsed?.commands) ? parsed.commands : []) {
      const normalized = normalizeBoardCommand(cmd);
      if (normalized) commands.push(normalized);
    }
  }
  return commands;
}

/**
 * System-prompt section for tool mode. Appended by assemblePrompt() only when
 * BOARD_TOOL_CALLS is on; overrides the legacy WORKBOARD TAG PROTOCOL the
 * same way structured mode's instructions do. Stable across calls (no
 * per-request data) so it stays inside the cacheable prefix.
 */
function buildBoardToolInstructions() {
  return `--- BOARD TOOL MODE (OVERRIDES THE WORKBOARD TAG PROTOCOL) ---
The WorkBoard is driven by the ${BOARD_TOOL_NAME} tool now. Do NOT write <BOARD .../> tags or raw JSON board commands in your prose — call the tool instead, once per turn, with every card for the turn in order. Your chat text stays pure conversation. (The other inline tags still work normally: <XP/>, <GRAPH/>, <TILES/>, and the silent signal tags.)

The pedagogy is unchanged:
- pose — at the moment a NEW problem is put in front of the student, once per problem. If you give them something to work on, the pose card is mandatory, every time.
- apply — AFTER the student names a move; op restates THEIR move (e.g. "subtract 4 from both sides").
- resolve — AFTER the student states a result; tex is what THEY wrote.
- verify — when a final answer is checked; optionally include their substitution check.
- clear — only on a new problem or right after a verify lands.
- graph / image — reference aids (fn of x, or a safe image query) with an optional caption.
- scaffold — the NEXT step's structure on the student's own problem with the new terms left as empty \\boxed{} slots for THEM to fill. Every scaffold MUST contain at least one \\boxed{} blank; never fill the blanks yourself. The blank marks EXACTLY what you are asking them to produce: never blank a known value while displaying the result (asking "what's 0.3 × 1000?" → "0.3 \\times 1000 = \\boxed{}", NOT "0.3 \\times \\boxed{} = 300"), and never write "?" as the unknown — the empty box IS the unknown.
- example — ONE step of a derivation YOU are teaching, in order, one card per step — only on a teaching example that is NOT the student's graded problem.

The board mirrors the STUDENT's reasoning: never emit an apply/resolve for a step they haven't said, and never pose the answer. If the student references the board ("show me on the board", "draw it"), you MUST call the tool with a relevant card. Small-talk and pure-feedback turns need no tool call at all.`;
}

module.exports = {
  BOARD_TOOL_NAME,
  BOARD_TOOL,
  BOARD_TOOLS,
  isBoardToolCall,
  isBoardToolModeEnabled,
  boardCommandsFromToolCalls,
  buildBoardToolInstructions,
};
