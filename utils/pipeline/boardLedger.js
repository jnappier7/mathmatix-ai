/**
 * boardLedger.js — persistent Problem Card lifecycle for the Living Workspace.
 *
 * The DerivationView (public/js/living-workspace/dom/derivationView.js) keeps a
 * per-page-load archive: the problem in focus plus a rail of finished problems.
 * A reload or session switch loses all of it, because nothing server-side
 * records what the board displayed — `conversation.boardProblem` is only the
 * anti-cheat pin ({tex, posedAt}), dropped the moment a cycle closes.
 *
 * This module maintains `conversation.boardLedger`, a compact mirror of the
 * board's lifecycle that the client can replay after a reload:
 *
 *   {
 *     current:   { problemTex, posedAt, steps: [boardCommand] } | null,
 *     completed: [ { problemTex, steps, solved, completedAt } ]   // oldest first
 *   }
 *
 * Transitions intentionally mirror the client's own archive rules, so a
 * replayed board matches what the student last saw:
 *   • pose of DIFFERENT math  → archive current, start a new current
 *   • pose of the same math   → no-op on the ledger (re-draw, not a new problem)
 *   • clear                   → archive current, current = null
 *   • anything else           → append to current.steps (verify marks it solved)
 * A problem that was posed but never worked (no steps) is dropped on archive,
 * matching DerivationView._archiveCurrent.
 *
 * Pure and side-effect free: returns a NEW ledger object; callers persist it.
 * Steps are stored as the schema-checked board commands themselves, so the
 * client replays them through the same adapter path as live turns.
 */
'use strict';

// Mirror of DerivationView.MAX_ARCHIVE — the rail shows a session's worth of
// recent work, not an unbounded archive, and the conversation doc stays small.
const MAX_COMPLETED = 12;
// Safety cap per problem: a marathon derivation should not bloat the document.
// Oldest steps fall off; the problem statement and the newest work survive.
const MAX_STEPS = 60;

// Same normalization the client uses to decide "is this the same problem".
function normTex(s) {
  return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();
}

function emptyLedger() {
  return { current: null, completed: [] };
}

// Keep only the fields the client replay needs. Board commands are already
// schema-checked upstream; this is belt-and-braces against oversized payloads
// riding into Mongo (e.g. an unexpected extra field on a graph card).
const COMMAND_FIELDS = [
  'action', 'tex', 'op', 'caption', 'label', 'plain',
  // visual/block cards
  'graphType', 'expression', 'expressions', 'points', 'window', 'imageQuery',
  'shape', 'params', 'highlight', 'steps',
];
function sanitizeCommand(cmd) {
  const out = {};
  for (const k of COMMAND_FIELDS) {
    if (cmd[k] !== undefined) out[k] = cmd[k];
  }
  return out;
}

function archiveCurrent(ledger, now) {
  const cur = ledger.current;
  ledger.current = null;
  if (!cur || !cur.problemTex) return;
  if (!Array.isArray(cur.steps) || cur.steps.length === 0) return; // posed, never worked
  ledger.completed.push({
    problemTex: cur.problemTex,
    steps: cur.steps,
    solved: cur.steps.some(c => c && c.action === 'verify'),
    completedAt: now,
  });
  while (ledger.completed.length > MAX_COMPLETED) ledger.completed.shift();
}

/**
 * Fold one turn's verified board commands into the ledger.
 *
 * @param {object|null} prev - conversation.boardLedger (may be null/malformed)
 * @param {Array} commands - the turn's verified board commands, in order
 * @param {Date} [now] - injectable clock for tests
 * @returns {object} a new ledger object
 */
function applyTurnToLedger(prev, commands, now = new Date()) {
  const ledger = {
    current: prev && prev.current && prev.current.problemTex
      ? {
          problemTex: prev.current.problemTex,
          posedAt: prev.current.posedAt || now,
          steps: Array.isArray(prev.current.steps) ? prev.current.steps.slice() : [],
        }
      : null,
    completed: prev && Array.isArray(prev.completed) ? prev.completed.slice() : [],
  };
  if (!Array.isArray(commands)) return ledger;

  for (const raw of commands) {
    if (!raw || typeof raw !== 'object' || !raw.action) continue;
    const cmd = sanitizeCommand(raw);

    if (cmd.action === 'pose') {
      if (!cmd.tex) continue;
      if (ledger.current && normTex(cmd.tex) === normTex(ledger.current.problemTex)) {
        continue; // same problem re-drawn (board-reference backstop etc.)
      }
      archiveCurrent(ledger, now);
      ledger.current = { problemTex: cmd.tex, posedAt: now, steps: [] };
      continue;
    }

    if (cmd.action === 'clear') {
      archiveCurrent(ledger, now);
      continue;
    }

    // apply / resolve / verify / scaffold / example / graph / image / diagram / model
    if (ledger.current) {
      ledger.current.steps.push(cmd);
      while (ledger.current.steps.length > MAX_STEPS) ledger.current.steps.shift();
    }
    // No pinned problem → a stray line with nothing to attach it to; the live
    // board would float it, but it is not part of any problem's lifecycle.
  }

  return ledger;
}

module.exports = {
  applyTurnToLedger,
  emptyLedger,
  MAX_COMPLETED,
  MAX_STEPS,
};
