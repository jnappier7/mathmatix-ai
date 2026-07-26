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

// Keep only the fields the client replay needs — the EXACT field names the
// board schema emits (utils/boardResponseSchema.js) and the P5 adapter reads
// (legacyBoardAdapter.mapCommand). Board commands are already schema-checked
// upstream; this is belt-and-braces against oversized payloads riding into
// Mongo. A field missing here silently breaks replay fidelity for its card
// type (graphs once lost their `fn` this way), so keep the two lists in sync.
const COMMAND_FIELDS = [
  'action', 'tex', 'op', 'check', 'caption',
  'fn',                              // graph
  'query',                           // image
  'diagram_type', 'diagram_params',  // diagram
  'model', 'spec', 'prompt',         // interactive concept model
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
    // Max assistance level (spec §12 ladder) across the problem's turns —
    // what the collapsed-card summary and teacher view read. Null when the
    // ladder never reported (e.g. entries written before this field existed).
    assistance: cur.assistance || null,
    // Where the problem came from (spec §5.4): {uploadId, region} when it was
    // selected off a docked source; the card keeps its link forever.
    sourceRef: cur.sourceRef || null,
    completedAt: now,
  });
  while (ledger.completed.length > MAX_COMPLETED) ledger.completed.shift();
}

// Validate/normalize a client-supplied source reference: an uploadId plus a
// normalized region ({x,y,w,h} in [0,1]) inside that source. Returns null for
// anything malformed — a bad ref must never poison the ledger.
function sanitizeSourceRef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.uploadId || '').trim();
  if (!id || id.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  const r = raw.region;
  if (!r || typeof r !== 'object') return { uploadId: id, region: null };
  const clamp = v => Math.max(0, Math.min(1, Number(v)));
  const x = clamp(r.x); const y = clamp(r.y);
  const w = clamp(r.w); const h = clamp(r.h);
  if (!(w > 0) || !(h > 0)) return { uploadId: id, region: null };
  return { uploadId: id, region: { x, y, w, h } };
}

/**
 * Fold one turn's verified board commands into the ledger.
 *
 * @param {object|null} prev - conversation.boardLedger (may be null/malformed)
 * @param {Array} commands - the turn's verified board commands, in order
 * @param {Date} [now] - injectable clock for tests
 * @param {number|object|null} [turnOpts] - this turn's context: a bare number
 *   is the assistance level (back-compat); an object may carry
 *   { assistance, sourceRef } — sourceRef links a problem POSED this turn to
 *   the docked source it was selected from (spec §5.4)
 * @returns {object} a new ledger object
 */
function applyTurnToLedger(prev, commands, now = new Date(), turnOpts = null) {
  const opts = (turnOpts && typeof turnOpts === 'object') ? turnOpts : { assistance: turnOpts };
  const ledger = {
    current: prev && prev.current && prev.current.problemTex
      ? {
          problemTex: prev.current.problemTex,
          posedAt: prev.current.posedAt || now,
          steps: Array.isArray(prev.current.steps) ? prev.current.steps.slice() : [],
          assistance: prev.current.assistance || null,
          sourceRef: prev.current.sourceRef || null,
        }
      : null,
    completed: prev && Array.isArray(prev.completed) ? prev.completed.slice() : [],
  };
  if (!Array.isArray(commands)) return ledger;
  const assist = Number(opts.assistance) > 0 ? Number(opts.assistance) : null;
  const sourceRef = sanitizeSourceRef(opts.sourceRef);
  let posedThisTurn = false;

  for (const raw of commands) {
    if (!raw || typeof raw !== 'object' || !raw.action) continue;
    const cmd = sanitizeCommand(raw);

    if (cmd.action === 'pose') {
      if (!cmd.tex) continue;
      if (ledger.current && normTex(cmd.tex) === normTex(ledger.current.problemTex)) {
        continue; // same problem re-drawn (board-reference backstop etc.)
      }
      archiveCurrent(ledger, now);
      ledger.current = { problemTex: cmd.tex, posedAt: now, steps: [], assistance: null, sourceRef: null };
      posedThisTurn = true;
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

  // The turn's assistance belongs to whichever problem ended the turn in
  // focus — max-folded, so one heavily-supported turn marks the whole problem.
  if (ledger.current && assist) {
    ledger.current.assistance = Math.max(ledger.current.assistance || 0, assist) || null;
  }

  // A source link only attaches to a problem POSED this turn — the turn the
  // student selected the region and asked. Stamping an ongoing problem would
  // mislink whatever happened to be in focus when a stray ref arrived.
  if (ledger.current && sourceRef && posedThisTurn && !ledger.current.sourceRef) {
    ledger.current.sourceRef = sourceRef;
  }

  return ledger;
}

/**
 * The assistance level of the problem the student is (or just was) working
 * on: the one in focus, else the most recently completed. What the mastery
 * engine reads when a verified answer lands. Null when nothing is known.
 */
function problemAssistance(ledger) {
  if (!ledger || typeof ledger !== 'object') return null;
  if (ledger.current && ledger.current.assistance) return ledger.current.assistance;
  const done = Array.isArray(ledger.completed) ? ledger.completed : [];
  for (let i = done.length - 1; i >= 0; i--) {
    if (done[i] && done[i].assistance) return done[i].assistance;
  }
  return null;
}

/**
 * Teacher-facing summary of a student's board (Live Workspace spec §20):
 * what they're working on, how it's going, and how much support each
 * finished problem took — WITHOUT the step-by-step contents (that lives in
 * the student's own board; the teacher view is a progress read, not a feed).
 * Pure; null-safe for students who have never touched the board.
 */
function summarizeLedger(ledger) {
  const empty = { current: null, completed: [], independentSolves: 0, supportedSolves: 0 };
  if (!ledger || typeof ledger !== 'object') return empty;

  const cur = ledger.current && ledger.current.problemTex ? {
    problemTex: String(ledger.current.problemTex).slice(0, 200),
    stepCount: Array.isArray(ledger.current.steps) ? ledger.current.steps.length : 0,
    solved: Array.isArray(ledger.current.steps) && ledger.current.steps.some(c => c && c.action === 'verify'),
    assistance: ledger.current.assistance || null,
    fromWorksheet: !!ledger.current.sourceRef,
  } : null;

  const completed = (Array.isArray(ledger.completed) ? ledger.completed : [])
    .filter(e => e && e.problemTex)
    .map(e => ({
      problemTex: String(e.problemTex).slice(0, 200),
      solved: !!e.solved,
      assistance: e.assistance || null,
      fromWorksheet: !!e.sourceRef,
      completedAt: e.completedAt || null,
    }));

  let independentSolves = 0;
  let supportedSolves = 0;
  for (const e of completed) {
    if (!e.solved) continue;
    if (e.assistance != null && e.assistance <= 4) independentSolves += 1;
    else if (e.assistance != null) supportedSolves += 1;
  }

  return { current: cur, completed, independentSolves, supportedSolves };
}

/**
 * Voice-turn preamble (Live Workspace): voice speaks only derivation lines —
 * it has no pose concept. With no problem in focus the ledger drops every
 * line as a stray, so a voice-FIRST session would persist nothing. When the
 * board is empty, the first math line IS the problem being worked: promote
 * it to a pose. No-op when a problem is already in focus (chat posed it, or
 * an earlier voice turn did). Pure; returns a new array.
 */
function promoteLeadingResolveToPose(ledger, commands) {
  const cmds = Array.isArray(commands) ? commands : [];
  if (!cmds.length || !cmds[0] || cmds[0].action !== 'resolve' || !cmds[0].tex) return cmds;
  if (ledger && ledger.current && ledger.current.problemTex) return cmds;
  return [{ action: 'pose', tex: cmds[0].tex }].concat(cmds.slice(1));
}

/**
 * Voice re-sends its board CUMULATIVELY every turn (its protocol: the full
 * step list, typically one new line at the end). Folding that raw into the
 * ledger would re-append the problem and every prior step each turn. Drop
 * resolves that match the problem in focus or a step already ledgered;
 * everything genuinely new passes through. Pure; returns a new array.
 */
function dedupeCumulativeResolves(ledger, commands) {
  const cmds = Array.isArray(commands) ? commands : [];
  const cur = ledger && ledger.current;
  if (!cur || !cur.problemTex) return cmds;
  const seen = new Set([normTex(cur.problemTex)]);
  for (const st of Array.isArray(cur.steps) ? cur.steps : []) {
    if (st && st.action === 'resolve' && st.tex) seen.add(normTex(st.tex));
  }
  return cmds.filter(c => {
    if (!c || c.action !== 'resolve' || !c.tex) return true;
    const k = normTex(c.tex);
    if (seen.has(k)) return false;
    seen.add(k);           // also collapses dupes within one turn
    return true;
  });
}

module.exports = {
  applyTurnToLedger,
  promoteLeadingResolveToPose,
  dedupeCumulativeResolves,
  problemAssistance,
  sanitizeSourceRef,
  summarizeLedger,
  emptyLedger,
  MAX_COMPLETED,
  MAX_STEPS,
};
