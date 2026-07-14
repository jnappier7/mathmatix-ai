'use strict';
/* ============================================================
   workspaceStateService.js — the SERVER-authoritative tile-state
   layer (Living Math Workspace, spec §3.3/§3.4, the server half
   of milestone P7).

   studentMoveService verifies a single op's operands in isolation.
   THIS goes further: it holds the authoritative tile-set SNAPSHOT
   and applies an inbound move through the headless AlgebraTileEngine
   (P2), so "client proposes, server disposes" covers the whole STATE
   TRANSITION — not just a single-op verdict.

   The authority win: the move references tiles BY ID; the server
   rebuilds the operands from ITS OWN previous snapshot (never the
   client's claimed operand values). A forged "this tile is 2x" can't
   change the verdict, because the server reads the real tile.

   ── Transport convention (NO schema change) ──
   StudentMove.operation and StudentMove.previousState are opaque to
   the P0 contract (each element engine owns their shape). For the
   algebra-tile element:
     previousState = { schemaVersion, tiles:[{id,coefficient,variable}], selection }
     operation     = { type, tileRefs?:[tileId], parts?, term?, newIds?, resultId? }
   `tileRefs` point into previousState.tiles. `type` is the engine op
   (falls back to the move's canonical `intent`).

   Returns the same envelope studentMoveService does, PLUS the new
   committed `snapshot` so the client can reconcile its optimistic
   render and the caller can persist it (P12).
   ============================================================ */

const { AlgebraTileEngine } = require('../../utils/workspace/algebraTileEngine');
const { VerifiedMove } = require('../../shared/workspace');
const { normalizeTileMove } = require('./moveNormalizer');

/** Does this move carry an authoritative tile snapshot to apply against? */
function hasTileState(move) {
  return !!(move && move.previousState && Array.isArray(move.previousState.tiles)
    && move.operation && typeof move.operation === 'object');
}

/** The engine op type — explicit operation.type wins, else the move's intent. */
function opTypeOf(move) {
  const t = move.operation && move.operation.type;
  return (typeof t === 'string' && t) ? t : move.intent;
}

/**
 * Resolve referenced tiles from the AUTHORITATIVE previous snapshot (not the
 * client's operand claims). Missing ids simply drop out — the engine then
 * rejects the under-referenced move (snap back), so a stale/forged ref can't
 * silently succeed.
 */
function resolveTerms(previousTiles, ids) {
  return (ids || [])
    .map((id) => previousTiles.find((t) => t && t.id === id))
    .filter(Boolean)
    .map((t) => ({ coefficient: t.coefficient, variable: t.variable }));
}

/** Map an inbound (validated) StudentMove → an engine op. */
function toEngineOp(move) {
  const type = opTypeOf(move);
  const o = move.operation || {};
  const moveId = move.moveId;
  switch (type) {
    case 'combine_like_terms':
    case 'remove_zero_pair':
    case 'select_group':
    case 'move_group':
      return { type, tileIds: Array.isArray(o.tileRefs) ? o.tileRefs : [], moveId, resultId: o.resultId };
    case 'create_zero_pair':
      return { type, term: o.term, ids: o.newIds, moveId };
    case 'split_group':
      return { type, tileId: Array.isArray(o.tileRefs) ? o.tileRefs[0] : o.tileId, parts: o.parts, moveId };
    case 'undo':
      return { type: 'undo', moveId };
    default:
      return { type: String(type), moveId }; // engine rejects unknown ops
  }
}

const CLASSIFICATION_BY_TYPE = {
  create_zero_pair: 'create_zero_pair',
  split_group: 'no_op',
  select_group: 'no_op',
  move_group: 'no_op',
  undo: 'no_op',
};

/**
 * Build a schema-valid VerifiedMove from the engine result. Server context →
 * serverOnly fields allowed. The verdict fields come from the engine (which
 * itself delegates the math judgment to algebraTileVerifier), never the client.
 */
function buildVerifiedMove(move, result, snapshot) {
  const v = result.verdict || null;
  const type = opTypeOf(move);

  let mathematicallyValid;
  if (v) mathematicallyValid = v.mathematicallyValid;         // combine / zero-pair verdict
  else if (result.committed) mathematicallyValid = true;      // structural valid move (split/create/undo)
  else mathematicallyValid = null;                            // select/move/no-op or reject

  const candidate = {
    schemaVersion: 1,
    moveId: move.moveId,
    accepted: !!result.ok,
    interactionValid: !!result.ok,
    mathematicallyValid,
    committed: !!result.committed,
    classification: v ? v.classification : (result.ok ? (CLASSIFICATION_BY_TYPE[type] || 'no_op') : 'invalid_interaction'),
    canonicalMove: result.canonicalMove || (v && v.canonicalMove) || undefined,
    misconceptionCode: result.misconceptionCode || (v && v.misconceptionCode) || (result.ok ? undefined : result.error),
    // Authoritative post-move state. lastResult (when the verifier produced one)
    // rides along so downstream can render the canonical result directly.
    resultingState: result.ok
      ? Object.assign({ snapshot }, v && v.resultingState && v.resultingState.lastResult ? { lastResult: v.resultingState.lastResult } : {})
      : undefined,
  };
  Object.keys(candidate).forEach((k) => candidate[k] === undefined && delete candidate[k]);

  const res = VerifiedMove.validate(candidate, { context: 'server' });
  if (!res.valid) throw new Error('VerifiedMove build invalid: ' + res.errors.join('; '));
  return res.value;
}

/**
 * Apply a tile move against the authoritative snapshot.
 * @param {object} move  a VALIDATED inbound StudentMove carrying tile state
 * @returns {{ ok:boolean, status:number, verifiedMove:object,
 *             normalized:(object|null), snapshot:object, engineResult:object }}
 */
function applyMove(move) {
  const engine = AlgebraTileEngine.fromSemantic(move.previousState);
  const type = opTypeOf(move);

  // Resolve operands from committed state BEFORE applying (tiles still present).
  const refIds = Array.isArray(move.operation.tileRefs) ? move.operation.tileRefs : [];
  const resolvedTerms = resolveTerms(engine.tiles, refIds);

  const result = engine.apply(toEngineOp(move));
  const snapshot = engine.toSemantic();
  const verifiedMove = buildVerifiedMove(move, result, snapshot);

  // A stated step for the tutor turn is produced ONLY for an `attempt` that
  // carried a math verdict on two resolved terms. reposition/exploration never
  // yield one → the P1 seam won't delegate → the anti-leak gate stays closed
  // on exploration exactly as before (built from REAL tile values, not claims).
  let normalized = null;
  if (move.mode === 'attempt' && result.verdict && resolvedTerms.length === 2) {
    normalized = normalizeTileMove({ operation: { type, operands: resolvedTerms } }, verifiedMove);
  }

  return { ok: result.ok, status: result.ok ? 200 : 422, verifiedMove, normalized, snapshot, engineResult: result };
}

module.exports = { applyMove, hasTileState, toEngineOp, resolveTerms };
