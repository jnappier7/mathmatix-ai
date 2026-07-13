'use strict';
/* ============================================================
   workspaceSnapshot.schema.js — SEMANTIC persistence (spec §3.8).

   Persist MEANING, never pixels. No Fabric toJSON, no zoom, no
   pointer trails, no DOM measurements — those are stale on the next
   render change and on a different screen. Keyed to the conversation;
   extends the existing boardProblem / lastProblemState story.

   On return the tutor re-hydrates AND re-frames from this + the
   conversation, so the board and the welcome-back come from one state.
   ============================================================ */

const { makeValidator } = require('./_validator');

const SCHEMA_VERSION = 1;

const WorkspaceSnapshot = makeValidator('WorkspaceSnapshot', {
  schemaVersion:  { type: 'number', required: true, default: SCHEMA_VERSION },
  workspaceId:    { type: 'string', required: true },
  conversationId: { type: 'string', required: true },

  // array of WorkspaceElement (each validated by its own element engine)
  elements: { type: 'array', required: true },

  focus:    { type: 'object', required: false }, // { elementId, semanticAnchor? }
  progress: { type: 'object', required: false }, // { currentProblemId?, currentStep?, unresolvedMoveIds? }

  // hint for "bring everything into view" on resume — NOT a saved viewport
  viewportHint: { type: 'object', required: false }, // { focalElementIds: [] }

  savedAt: { type: 'iso', required: false },
});

/** Corrupt-snapshot guard: never break the conversation on a bad snapshot. */
function safeParseSnapshot(raw) {
  const res = WorkspaceSnapshot.validate(raw, { context: 'server' });
  if (!res.valid) return { snapshot: null, recovered: true, errors: res.errors };
  return { snapshot: res.value, recovered: false, errors: [] };
}

function migrateSnapshot(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return obj; // v1 baseline
}

module.exports = { SCHEMA_VERSION, WorkspaceSnapshot, safeParseSnapshot, migrateSnapshot };
