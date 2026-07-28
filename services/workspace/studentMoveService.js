'use strict';
/* ============================================================
   studentMoveService.js — the deterministic brain of P1.

   Responsibilities (and ONLY these — spec §4 P1 / critique stage 2):
     1. validate the untrusted inbound StudentMove (client can't
        forge validity),
     2. VERIFY it server-side per element type (the authoritative
        math verdict),
     3. build a schema-valid VerifiedMove,
     4. normalize it into the canonical stated-step string the
        tutoring pipeline consumes.

   It deliberately does NOT: acquire a lock, build prompts, or call
   the pipeline. Those belong to the shared chat turn so there is ONE
   lock and ONE tutoring brain (see docs/BOARD_STUDENT_MOVES_INTEGRATION.md).
   ============================================================ */

const { validateInbound, VerifiedMove, ELEMENT_TYPES } = require('../../shared/workspace');
const { verifyAlgebraTileMove } = require('../../utils/workspace/algebraTileVerifier');
const { verifyConceptModelMove } = require('../../utils/workspace/conceptModelMoveVerifier');
const { normalizeTileMove } = require('./moveNormalizer');
const { applyMove: applyMoveWithState, hasTileState } = require('./workspaceStateService');

// element type → its server-authoritative verifier. Extend as elements ship.
const VERIFIERS = {
  [ELEMENT_TYPES.ALGEBRA_TILES]: (move) => verifyAlgebraTileMove(move.previousState, move.operation),
};

/**
 * Process one inbound student-move payload.
 * @returns {{ ok:boolean, status:number, errors?:string[],
 *             verifiedMove?:object, normalized?:object }}
 */
function processStudentMove(rawPayload) {
  // 1. untrusted-input validation (rejects unknown + serverOnly fields)
  const inbound = validateInbound(rawPayload);
  if (!inbound.valid) {
    return { ok: false, status: 400, errors: inbound.errors };
  }
  const move = inbound.value;

  // 1b. AUTHORITATIVE tile-state path (P7 server half): when the move carries a
  // tile snapshot in previousState, the server holds the state and applies the
  // move through the engine — resolving tiles by reference, not trusting the
  // client's operand values. Returns the same envelope + the new `snapshot`.
  // Moves without a snapshot fall through to the stateless verdict path below
  // (backward-compatible with the P1 contract). See workspaceStateService.js.
  if (hasTileState(move)) {
    return applyMoveWithState(move);
  }

  // Concept-model exploration (spec §6.9): still no mathematical claim and
  // still NO pipeline entry (anti-leak stays structurally closed) — but the
  // server judges whether the manipulation MEANT something. Meaningful ones
  // surface an evidenceContext the route records against the transfer pillar.
  if (move.mode === 'exploration' && move.elementType === ELEMENT_TYPES.MODEL) {
    const verdict = verifyConceptModelMove(move);
    const vm = buildVerifiedMove(move, {
      accepted: verdict.interactionValid,
      interactionValid: verdict.interactionValid,
      mathematicallyValid: null,
      committed: false,
      classification: verdict.classification,
      canonicalMove: verdict.canonicalMove,
    });
    return {
      ok: true, status: 200, verifiedMove: vm, normalized: null,
      modelEvidence: verdict.evidenceContext ? { context: verdict.evidenceContext } : null,
    };
  }

  // reposition / undo carry no mathematical claim — accept without a math verdict
  if (move.mode === 'reposition' || move.mode === 'exploration') {
    const vm = buildVerifiedMove(move, {
      accepted: true, interactionValid: true, mathematicallyValid: null,
      committed: move.mode === 'reposition', classification: 'no_op',
    });
    return { ok: true, status: 200, verifiedMove: vm, normalized: null };
  }

  // 2. authoritative server verification, per element type
  const verifier = VERIFIERS[move.elementType];
  if (!verifier) {
    return { ok: false, status: 422, errors: [`no server verifier for elementType "${move.elementType}"`] };
  }
  const verdict = verifier(move);

  // 3. build the schema-valid VerifiedMove (server context → serverOnly fields allowed)
  const vm = buildVerifiedMove(move, {
    accepted: verdict.interactionValid,        // a real interaction is "accepted" even if wrong
    interactionValid: verdict.interactionValid,
    mathematicallyValid: verdict.mathematicallyValid,
    // commit only a verified-correct move; a wrong move stays provisional (the "?" state)
    committed: verdict.mathematicallyValid === true,
    classification: verdict.classification,
    canonicalMove: verdict.canonicalMove,
    misconceptionCode: verdict.misconceptionCode,
    resultingState: verdict.resultingState,
  });

  // 4. normalize into the pipeline's stated-step string (for the tutor turn)
  const normalized = normalizeTileMove(move, vm);

  return { ok: true, status: 200, verifiedMove: vm, normalized };
}

function buildVerifiedMove(move, fields) {
  const candidate = Object.assign({ schemaVersion: 1, moveId: move.moveId }, fields);
  // strip undefineds so optional serverOnly fields validate cleanly
  Object.keys(candidate).forEach((k) => candidate[k] === undefined && delete candidate[k]);
  const res = VerifiedMove.validate(candidate, { context: 'server' });
  // server-built; if this ever fails it's a programming error, surface it loudly
  if (!res.valid) throw new Error('VerifiedMove build invalid: ' + res.errors.join('; '));
  return res.value;
}

module.exports = { processStudentMove };
