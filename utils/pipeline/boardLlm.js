// ============================================================
// boardLlm.js — the Board LLM stage (advisory board-card source)
//
// See docs/BOARD_LLM_STAGE_DESIGN.md. A second, focused LLM call that
// translates the tutor's FINAL chat message into Work Board cards, so the
// tutor model can teach without also having to transcribe its own teaching
// into board commands (a job it does unreliably — see boardResponseSchema.js).
//
// Two rules govern this module:
//   1. Compliance improves because the prompt is short and single-purpose —
//      NOT "near-perfect". No generator is trusted.
//   2. Board LLM output is ADVISORY ONLY. The deterministic guard owns final
//      authority. This module proposes; utils/boardCommandGuard.js disposes.
//
// So this file returns a *proposal*. The pipeline routes it through the exact
// same guard → synthesizer-merge → visual gate as any other board source.
// Nothing here renders to the board directly.
//
// Mirrors the visualGate value-judge precedent: gpt-4o-mini, temperature 0,
// env-gated, fail-safe (here: fail to EMPTY, so the deterministic synthesizer
// fallback fills the board).
// ============================================================

'use strict';

const { callLLMStructured } = require('../llmGateway');
const { BOARD_COMMAND_SCHEMA, normalizeBoardCommand, BOARD_ACTIONS } = require('../boardResponseSchema');
const log = require('../logger');

const boardLlmLogger = log.child({ service: 'board-llm' });

// off → stage skipped (default). shadow → run + log, do not change render.
// live → primary board source (deterministic synthesizer remains the fallback).
const MODES = { OFF: 'off', SHADOW: 'shadow', LIVE: 'live' };

// The app's fast model — the concrete stand-in for the design's "Haiku".
const BOARD_LLM_MODEL = 'gpt-4o-mini';
// Tight bound: this is a secondary call, never worth a 90s hang. On timeout we
// fall back to the deterministic path.
const BOARD_LLM_TIMEOUT_MS = 8000;

// Moves that never carry a board — skip the call entirely (zero latency, zero
// cost). Keyed on the decide stage's action (utils/pipeline/decide.js ACTIONS).
const SKIP_MOVES = new Set([
  'redirect_to_math',
  'acknowledge_frustration',
  'elicit_first',
  'exit_ramp',
]);

// The vocabulary the translator may use: every board action EXCEPT the flag-off
// interactive verbs (diagram/model carry fields this focused schema doesn't
// expose). Derived from BOARD_ACTIONS so it can't silently drift from the
// source of truth — when new actions land (e.g. the worked-example `example`
// card on feat/workboard-worked-example-mirror), they flow in automatically.
const TRANSLATABLE_ACTIONS = BOARD_ACTIONS.filter(a => a !== 'diagram' && a !== 'model');

/**
 * The whitelist of board actions valid for a given move — the alignment lever.
 * This constrains the translator to move-appropriate cards BEFORE the guard
 * runs; it is alignment, not safety (the guard + visual gate own safety).
 *
 * @param {string} moveType - decide stage action (ACTIONS.*)
 * @param {{teachingMode?: boolean}} [opts]
 * @returns {string[]} allowed actions; [] means "skip this move"
 */
function allowedBoardActionsFor(moveType, { teachingMode = false } = {}) {
  if (!moveType || SKIP_MOVES.has(moveType)) return [];
  // "They nailed it" — the board should confirm, not re-pose.
  if (moveType === 'confirm_correct') return ['verify', 'clear'];
  // `example` cards (read-only derivation steps) are teaching-only; include them
  // solely in teaching mode. (No-op until the worked-example card lands.)
  return TRANSLATABLE_ACTIONS.filter(a => a !== 'example' || teachingMode);
}

const BOARD_TRANSLATOR_SYSTEM = [
  'You are the Mathmatix Board Translator. Your ONLY job is to convert the tutor\'s',
  'final chat message into Work Board cards. You are not a tutor: you add nothing,',
  'teach nothing, and answer nothing.',
  '',
  'Rules:',
  '- Mirror ONLY what the tutor actually wrote in chatText. Never invent, extend,',
  '  or complete math the tutor did not state.',
  '- NEVER emit a card that states or reveals the answer to pinnedProblem. If a',
  '  card would show the student\'s own problem solved, omit it.',
  '- Use ONLY the actions listed in allowedBoardActions. If none fit, return an',
  '  empty board_commands array — an empty board is correct when there is nothing',
  '  to mirror.',
  '- Keep the tutor\'s exact math/LaTeX; do not rewrite expressions.',
  '',
  'Card shapes (fill only the fields an action needs; leave the rest null):',
  '- pose:     { action:"pose", tex:"2x+4=20" }                    the problem being worked',
  '- apply:    { action:"apply", op:"subtract 4 from both sides" } an operation the student named',
  '- resolve:  { action:"resolve", tex:"2x=16" }                   an intermediate result the student stated',
  '- verify:   { action:"verify", tex:"x=8", check:"2(8)+4=20" }   a confirmed solution',
  '- scaffold: { action:"scaffold", tex:"x + \\\\boxed{} = 8" }       a hint; MUST contain an empty \\\\boxed{} blank',
  '- graph:    { action:"graph", fn:"x^2-4", caption:"..." }       a function plot',
  '- image:    { action:"image", query:"unit circle labeled", caption:"..." } a reference image',
  '- clear:    { action:"clear" }                                  wipe before a brand-new problem',
  '',
  'Return board_commands in the order the cards should appear on the board.',
].join('\n');

// Focused response schema: just the board_commands array (reuses the canonical
// per-command schema). Strict mode → every property required, no extras.
const BOARD_LLM_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'BoardTranslation',
    description: 'Work Board cards translated from the tutor\'s final message.',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        board_commands: { type: 'array', items: BOARD_COMMAND_SCHEMA },
      },
      required: ['board_commands'],
      additionalProperties: false,
    },
  },
};

/**
 * Build the two-message payload for the translator call.
 */
function buildBoardLlmMessages({ chatText, moveType, pinnedProblem, teachingMode, allowedBoardActions, currentSkill }) {
  const payload = {
    chatText: chatText || '',
    moveType: moveType || null,
    pinnedProblem: pinnedProblem || null,
    teachingMode: !!teachingMode,
    allowedBoardActions,
    currentSkill: currentSkill || null,
  };
  return [
    { role: 'system', content: BOARD_TRANSLATOR_SYSTEM },
    { role: 'user', content: JSON.stringify(payload) },
  ];
}

/**
 * Read the stage mode. Anything other than 'shadow'/'live' is OFF.
 */
function getBoardLlmMode() {
  const v = String(process.env.BOARD_LLM_MODE || 'off').toLowerCase();
  return (v === MODES.SHADOW || v === MODES.LIVE) ? v : MODES.OFF;
}

/**
 * Propose board cards for this turn by translating the tutor's final message.
 * ADVISORY: the returned commands are routed through the pedagogy guard + visual
 * gate by the caller — they are never rendered directly.
 *
 * Skips the call (no latency) when the move carries no board or there is no chat
 * to mirror. Fails to EMPTY on any error so the deterministic synthesizer
 * fallback fills the board.
 *
 * @returns {Promise<{commands: object[], record: object}>}
 */
async function proposeBoardCommands({ chatText, moveType, pinnedProblem, teachingMode, currentSkill } = {}) {
  const allowedBoardActions = allowedBoardActionsFor(moveType, { teachingMode });

  if (allowedBoardActions.length === 0 || !chatText || !String(chatText).trim()) {
    return {
      commands: [],
      record: { status: 'skipped', moveType: moveType || null, allowedBoardActions },
    };
  }

  const messages = buildBoardLlmMessages({
    chatText, moveType, pinnedProblem, teachingMode, allowedBoardActions, currentSkill,
  });

  let parsed;
  try {
    parsed = await callLLMStructured(BOARD_LLM_MODEL, messages, BOARD_LLM_RESPONSE_FORMAT, {
      temperature: 0,
      timeoutMs: BOARD_LLM_TIMEOUT_MS,
    });
  } catch (err) {
    boardLlmLogger.warn('Board LLM call failed; deterministic fallback will fill the board', { error: err.message });
    return { commands: [], record: { status: 'error', error: err.message, moveType: moveType || null } };
  }

  // Normalize to the compact guard shape, then enforce the move whitelist —
  // alignment defense-in-depth before the call ever reaches the guard.
  const allowed = new Set(allowedBoardActions);
  const raw = Array.isArray(parsed && parsed.board_commands) ? parsed.board_commands : [];
  const commands = raw.map(normalizeBoardCommand).filter(Boolean).filter(c => allowed.has(c.action));

  return {
    commands,
    record: {
      status: 'ok',
      moveType: moveType || null,
      allowedBoardActions,
      proposedRaw: raw.length,
      proposedKept: commands.length,
    },
  };
}

module.exports = {
  MODES,
  BOARD_LLM_MODEL,
  BOARD_LLM_RESPONSE_FORMAT,
  getBoardLlmMode,
  allowedBoardActionsFor,
  buildBoardLlmMessages,
  proposeBoardCommands,
  // Exposed for tests
  _SKIP_MOVES: SKIP_MOVES,
  _TRANSLATABLE_ACTIONS: TRANSLATABLE_ACTIONS,
  _BOARD_TRANSLATOR_SYSTEM: BOARD_TRANSLATOR_SYSTEM,
};
