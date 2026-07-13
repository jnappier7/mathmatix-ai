'use strict';
/* ============================================================
   studentMove.schema.js — the backbone contract.

   A StudentMove is what a gesture/keyboard/voice action BECOMES
   before it enters the tutoring pipeline. It is a PROPOSAL from an
   untrusted client. The server returns a VerifiedMove — the only
   place mathematical validity is decided.

   Design rules (spec §3.4, external critique adopted):
     • The client CANNOT declare its move correct. StudentMove has no
       validity field; `clientInterpretation` is advisory only; and
       ingest validation is strict (unknown fields rejected), so a
       smuggled `mathematicallyValid` is refused.
     • `mode` separates a mathematical `attempt` from `exploration`
       (no answer-injection), `reposition` (no math), and `undo`.
     • `idempotencyKey` + `clientSequence` guard dup/replayed moves.
     • `previousState`/`proposedState` are opaque here — each element's
       own semantic engine validates them (this contract is element-
       agnostic on purpose).
   ============================================================ */

const { makeValidator } = require('./_validator');
const { ELEMENT_TYPE_LIST } = require('../constants/elementTypes');
const { MOVE_SOURCES, MOVE_MODES, GESTURE_TYPES, POINTER_TYPES } = require('../constants/moveTypes');

const SCHEMA_VERSION = 1;

// ---- StudentMove (client → server) -------------------------------
const StudentMove = makeValidator('StudentMove', {
  schemaVersion: { type: 'number', required: true, default: SCHEMA_VERSION },

  // identity / addressing
  moveId:         { type: 'string', required: true }, // client-generated uuid
  conversationId: { type: 'string', required: true },
  workspaceId:    { type: 'string', required: true },
  elementId:      { type: 'string', required: true },
  elementType:    { type: 'string', required: true, enum: ELEMENT_TYPE_LIST },

  // what happened
  source: { type: 'string', required: true, enum: MOVE_SOURCES },
  intent: { type: 'string', required: true }, // canonical intent per element engine
  mode:   { type: 'string', required: true, enum: MOVE_MODES },

  // element-owned semantic states (opaque to this contract)
  previousState: { type: 'object', required: true },
  proposedState: { type: 'object', required: true },

  // structured operation the client claims it performed
  operation: { type: 'object', required: true }, // { type, operands?, parameters? }

  // interaction telemetry (audit + pointer-aware UX)
  interaction: { type: 'object', required: true }, // { gestureType?, pointerType?, startedAt, completedAt }

  // ADVISORY ONLY — the client's own guess. Never authoritative.
  clientInterpretation: { type: 'object', required: false }, // { confidence, canonicalMove? }

  // dup / ordering protection
  clientSequence: { type: 'number', required: true },
  idempotencyKey: { type: 'string', required: true },
});

// ---- VerifiedMove (server → client) ------------------------------
// Constructed ONLY by trusted server code (context:'server'). Every
// judgmental field is serverOnly so it can never be forged on ingest.
const VerifiedMove = makeValidator('VerifiedMove', {
  schemaVersion: { type: 'number', required: true, default: SCHEMA_VERSION },
  moveId:        { type: 'string', required: true }, // echoes the StudentMove

  accepted:            { type: 'boolean', required: true, serverOnly: true },
  interactionValid:    { type: 'boolean', required: true, serverOnly: true },
  // null when validity is N/A (reposition / exploration / no_op)
  mathematicallyValid: { type: 'boolean', required: false, serverOnly: true, nullable: true },
  committed:           { type: 'boolean', required: true, serverOnly: true },

  canonicalMove:   { type: 'string', required: false, serverOnly: true },
  classification:  { type: 'string', required: false, serverOnly: true }, // MATH_CLASSIFICATIONS
  misconceptionCode: { type: 'string', required: false, serverOnly: true },
  resultingState:  { type: 'object', required: false, serverOnly: true },
}, { strict: false }); // server may attach extra diagnostic fields

/**
 * Validate an untrusted inbound StudentMove at the route boundary.
 * Rejects server-authoritative & unknown fields.
 */
function validateInbound(payload) {
  return StudentMove.validate(payload, { context: 'ingest' });
}

/**
 * v1 has no predecessor. Migration hook kept so future schema bumps
 * have one obvious place to live (spec §3bis, DoD: "version 1 objects
 * include a migration hook").
 */
function migrateStudentMove(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  // if (obj.schemaVersion === 0) { ...upgrade... }
  return obj;
}

module.exports = {
  SCHEMA_VERSION,
  StudentMove,
  VerifiedMove,
  validateInbound,
  migrateStudentMove,
};
