'use strict';
/* ============================================================
   algebraTileEngine.js — the HEADLESS algebra-tile engine
   (Living Math Workspace, spec §3.3/B2, milestone P2).

   No Fabric, no browser, no DOM. A pure, deterministic state
   machine over a set of algebra tiles. Two consumers share it:
     • the CLIENT renders a move within one animation frame (the
       engine is deterministic, so the UI never waits on the server);
     • the SERVER applies the same op to hold the authoritative
       semantic state that gets snapshotted / resumed.
   "Client proposes, server disposes" (spec §3.4): the browser's
   optimistic apply is a suggestion; this same code, run server-side
   with the untrusted operands rebuilt from committed state, is the
   authority.

   ── Semantic state (snapshot-serializable, spec §3bis) ──
     {
       schemaVersion: 1,
       tiles:     [ { id, coefficient, variable } ],  // variable '' = unit/constant
       selection: [ tileId, ... ]
     }
   A tile is one term. `2x` is a single tile {coefficient:2, variable:'x'};
   splitting it yields two tiles. This is exactly the { coefficient,
   variable } shape the verifier and moveNormalizer already speak, so a
   tile drops straight into a StudentMove operand with no translation.

   ── Ownership boundary ──
   The engine owns STATE TRANSITIONS and STRUCTURAL validity (a tile
   exists, a split conserves quantity, a zero-pair truly cancels). The
   pedagogically-loaded MATH verdict for combine / zero-pair is delegated
   to utils/workspace/algebraTileVerifier — the single source of "is this
   move mathematically valid" truth, so the engine and the server route
   can never diverge on what "2x + 3 = 5x" means.

   The engine NEVER awards XP, fires celebrations, or decides reward. It
   emits a NEUTRAL `event` name; the central EngagementEngine (spec §3.10,
   milestone P9) owns tier/sound/XP so the "reward effort, not correctness"
   rule lives in exactly one auditable, farm-proof place.

   ── Transaction model (spec §3.4) ──
   A mathematically-invalid move (combine unlike terms) does NOT mutate
   committed state — it returns a PROVISIONAL claim (the student's "?"),
   for the tutor to coach and the student to revise/undo. Only a valid
   move commits + pushes undo history. A physics-invalid interaction
   (tile id doesn't exist, split that doesn't conserve) is rejected
   outright (snap back) — neither committed nor provisional.
   ============================================================ */

const { verifyAlgebraTileMove, termToString } = require('./algebraTileVerifier');

const SCHEMA_VERSION = 1;
const MAX_HISTORY = 50; // bound undo memory; oldest states fall off

// ── term / tile helpers ────────────────────────────────────
function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}
function isTileShape(t) {
  return t && typeof t === 'object'
    && typeof t.id === 'string' && t.id.length > 0
    && isFiniteNumber(t.coefficient)
    && typeof t.variable === 'string';
}
function cloneTile(t) {
  return { id: t.id, coefficient: t.coefficient, variable: t.variable };
}
function termOf(t) {
  return { coefficient: t.coefficient, variable: t.variable };
}

/**
 * Normalize an untrusted semantic payload into a valid engine state,
 * RECOVERING instead of throwing on corruption (spec §3.8 corrupt-snapshot
 * graceful fallback). Unknown/garbage tiles are dropped; a totally malformed
 * payload yields a clean empty state.
 * @returns {{ state:object, recovered:boolean }}
 */
function normalizeState(raw) {
  let recovered = false;
  const base = { schemaVersion: SCHEMA_VERSION, tiles: [], selection: [] };
  if (!raw || typeof raw !== 'object') {
    return { state: base, recovered: raw != null };
  }

  const seenIds = new Set();
  const tiles = [];
  const srcTiles = Array.isArray(raw.tiles) ? raw.tiles : (recovered = raw.tiles != null, []);
  for (const t of srcTiles) {
    if (!isTileShape(t) || seenIds.has(t.id)) { recovered = true; continue; }
    seenIds.add(t.id);
    // Zero-coefficient tiles are "nothing" — drop them so state stays canonical.
    if (t.coefficient === 0) { recovered = true; continue; }
    tiles.push(cloneTile(t));
  }

  // selection: keep only ids that reference a surviving tile
  let selection = [];
  if (Array.isArray(raw.selection)) {
    selection = raw.selection.filter((id) => typeof id === 'string' && seenIds.has(id));
    if (selection.length !== raw.selection.length) recovered = true;
  } else if (raw.selection != null) {
    recovered = true;
  }

  return { state: { schemaVersion: SCHEMA_VERSION, tiles, selection }, recovered };
}

function canonicalSum(tiles) {
  if (!tiles.length) return '0';
  return tiles.map(termToString).join(' + ').replace(/\+ -/g, '- ');
}

// ── the engine ─────────────────────────────────────────────
class AlgebraTileEngine {
  /**
   * @param {object} [semantic]  a semantic payload to hydrate from (safe/recovering)
   */
  constructor(semantic) {
    const { state, recovered } = normalizeState(semantic);
    this._state = state;
    this._history = [];              // stack of committed-state snapshots for undo
    this._appliedMoveIds = new Map(); // moveId → result, for idempotent replay
    this.recovered = recovered;      // true if hydration had to repair the input
  }

  static fromSemantic(semantic) {
    return new AlgebraTileEngine(semantic);
  }

  /** Deep copy of the committed semantic state (safe to persist / hand out). */
  toSemantic() {
    return {
      schemaVersion: SCHEMA_VERSION,
      tiles: this._state.tiles.map(cloneTile),
      selection: this._state.selection.slice(),
    };
  }

  get tiles() { return this._state.tiles.map(cloneTile); }
  get selection() { return this._state.selection.slice(); }
  get canUndo() { return this._history.length > 0; }

  _findTile(id) { return this._state.tiles.find((t) => t.id === id); }

  _pushHistory() {
    this._history.push(this.toSemantic());
    if (this._history.length > MAX_HISTORY) this._history.shift();
  }

  // Result builders — one consistent shape everywhere.
  _reject(type, error, extra = {}) {
    return Object.assign({ ok: false, committed: false, provisional: false, type, error, state: this.toSemantic() }, extra);
  }
  _accept(type, extra = {}) {
    return Object.assign({ ok: true, committed: false, provisional: false, type, error: null, state: this.toSemantic() }, extra);
  }

  /**
   * Apply one operation. Op shape:
   *   { type, moveId?, ...args }
   * Returns a result object:
   *   { ok, committed, provisional, type, state, error,
   *     verdict?, canonicalMove?, misconceptionCode?, provisionalResult?, event? }
   */
  apply(op) {
    if (!op || typeof op !== 'object' || typeof op.type !== 'string') {
      return this._reject('unknown', 'MALFORMED_OP');
    }

    // Idempotency: a replayed moveId returns the original result, no re-apply
    // (spec §3.4 dup/replay protection via idempotencyKey — mirrored here so the
    // engine is safe against double-fire from the client OR a retried request).
    if (op.moveId != null && this._appliedMoveIds.has(op.moveId)) {
      return Object.assign({}, this._appliedMoveIds.get(op.moveId), { duplicate: true });
    }

    let result;
    switch (op.type) {
      case 'combine_like_terms': result = this._combineLikeTerms(op); break;
      case 'remove_zero_pair':   result = this._removeZeroPair(op); break;
      case 'create_zero_pair':   result = this._createZeroPair(op); break;
      case 'split_group':        result = this._splitGroup(op); break;
      case 'select_group':       result = this._selectGroup(op); break;
      case 'move_group':         result = this._moveGroup(op); break;
      case 'undo':               result = this.undo(); break;
      default:                   result = this._reject(op.type, 'UNSUPPORTED_OP'); break;
    }

    if (op.moveId != null) this._appliedMoveIds.set(op.moveId, result);
    return result;
  }

  // combine_like_terms(tileIds:[aId,bId]) — merge two tiles into one.
  // Math verdict delegated to the verifier; unlike terms land PROVISIONALLY.
  _combineLikeTerms(op) {
    const ids = Array.isArray(op.tileIds) ? op.tileIds : [];
    if (ids.length !== 2) return this._reject('combine_like_terms', 'COMBINE_NEEDS_TWO_TILES');
    const a = this._findTile(ids[0]);
    const b = this._findTile(ids[1]);
    // Physics-invalid: referencing a tile that isn't on the board → snap back.
    if (!a || !b || ids[0] === ids[1]) return this._reject('combine_like_terms', 'TILE_NOT_FOUND');

    // Rebuild operands from COMMITTED state (never trust caller-supplied terms).
    const verdict = verifyAlgebraTileMove(this._state, { type: 'combine_like_terms', operands: [termOf(a), termOf(b)] });

    if (verdict.mathematicallyValid !== true) {
      // Unlike terms: a real interaction, a wrong CLAIM. Do not mutate committed
      // state; hand back what the student asserted for provisional "?" render.
      const claimCoefficient = a.coefficient + b.coefficient;
      return this._accept('combine_like_terms', {
        provisional: true,
        verdict,
        canonicalMove: verdict.canonicalMove,
        misconceptionCode: verdict.misconceptionCode,
        provisionalResult: { coefficient: claimCoefficient, variable: a.variable },
        event: null, // a wrong claim earns nothing; revising it may (EngagementEngine)
      });
    }

    // Valid combine → commit. New tile id must be supplied for determinism.
    const newId = typeof op.resultId === 'string' && op.resultId.length ? op.resultId : `${a.id}+${b.id}`;
    const combined = { id: newId, coefficient: a.coefficient + b.coefficient, variable: a.variable };
    this._pushHistory();
    // Land the merged tile where the FIRST operand was (positional stability),
    // so combining doesn't reshuffle the row. Capture the index before removal.
    const at = this._state.tiles.indexOf(a);
    this._state.tiles = this._state.tiles.filter((t) => t !== a && t !== b);
    // 2x + (-2x) → 0x is nothing; drop it rather than leaving a 0-tile.
    if (combined.coefficient !== 0) {
      const idx = Math.min(Math.max(at, 0), this._state.tiles.length);
      this._state.tiles.splice(idx, 0, combined);
    }
    this._pruneSelection();
    return this._accept('combine_like_terms', {
      committed: true,
      verdict,
      canonicalMove: verdict.canonicalMove,
      event: 'valid_combine',
    });
  }

  // remove_zero_pair(tileIds:[aId,bId]) — two opposite tiles (x and -x)
  // cancel and are removed. The verifier's cancel-check is (historically)
  // named 'create_zero_pair'; at the INTENT layer this is REMOVING a pair
  // that sums to zero. Naming bridge documented here on purpose.
  _removeZeroPair(op) {
    const ids = Array.isArray(op.tileIds) ? op.tileIds : [];
    if (ids.length !== 2) return this._reject('remove_zero_pair', 'ZERO_PAIR_NEEDS_TWO_TILES');
    const a = this._findTile(ids[0]);
    const b = this._findTile(ids[1]);
    if (!a || !b || ids[0] === ids[1]) return this._reject('remove_zero_pair', 'TILE_NOT_FOUND');

    const verdict = verifyAlgebraTileMove(this._state, { type: 'create_zero_pair', operands: [termOf(a), termOf(b)] });
    if (verdict.mathematicallyValid !== true) {
      // Not actually opposites — a wrong claim. Provisional, don't commit.
      return this._accept('remove_zero_pair', {
        provisional: true,
        verdict,
        misconceptionCode: verdict.misconceptionCode,
        event: null,
      });
    }

    this._pushHistory();
    this._state.tiles = this._state.tiles.filter((t) => t !== a && t !== b);
    this._pruneSelection();
    return this._accept('remove_zero_pair', {
      committed: true,
      verdict,
      canonicalMove: verdict.canonicalMove,
      event: 'valid_zero_pair',
    });
  }

  // create_zero_pair({ term:{coefficient,variable}, ids:[posId,negId] }) —
  // introduce +term and -term (net zero) to set up a later move. Always
  // structurally valid; engine-owned (no math verdict needed).
  _createZeroPair(op) {
    const term = op.term;
    if (!term || !isFiniteNumber(term.coefficient) || typeof term.variable !== 'string' || term.coefficient === 0) {
      return this._reject('create_zero_pair', 'BAD_ZERO_PAIR_TERM');
    }
    const ids = Array.isArray(op.ids) ? op.ids : [];
    if (ids.length !== 2 || typeof ids[0] !== 'string' || typeof ids[1] !== 'string' || ids[0] === ids[1]) {
      return this._reject('create_zero_pair', 'ZERO_PAIR_NEEDS_TWO_IDS');
    }
    if (this._findTile(ids[0]) || this._findTile(ids[1])) {
      return this._reject('create_zero_pair', 'DUPLICATE_TILE_ID');
    }
    this._pushHistory();
    this._state.tiles.push({ id: ids[0], coefficient: term.coefficient, variable: term.variable });
    this._state.tiles.push({ id: ids[1], coefficient: -term.coefficient, variable: term.variable });
    return this._accept('create_zero_pair', { committed: true, event: 'valid_zero_pair' });
  }

  // split_group({ tileId, parts:[{id,coefficient}] }) — decompose one tile
  // into N tiles of the SAME variable whose coefficients sum to the original
  // (conservation). A non-conserving split is a physics/logic error → snap back.
  _splitGroup(op) {
    const src = this._findTile(op.tileId);
    if (!src) return this._reject('split_group', 'TILE_NOT_FOUND');
    const parts = Array.isArray(op.parts) ? op.parts : [];
    if (parts.length < 2) return this._reject('split_group', 'SPLIT_NEEDS_TWO_PARTS');

    let sum = 0;
    const seen = new Set();
    for (const p of parts) {
      if (!p || typeof p.id !== 'string' || !p.id.length || !isFiniteNumber(p.coefficient) || p.coefficient === 0) {
        return this._reject('split_group', 'BAD_SPLIT_PART');
      }
      if (seen.has(p.id) || (this._findTile(p.id) && p.id !== src.id)) {
        return this._reject('split_group', 'DUPLICATE_TILE_ID');
      }
      seen.add(p.id);
      sum += p.coefficient;
    }
    if (sum !== src.coefficient) {
      return this._reject('split_group', 'SPLIT_NOT_CONSERVED', {
        canonicalMove: `${termToString(src)} ↛ ${parts.map((p) => termToString({ coefficient: p.coefficient, variable: src.variable })).join(' + ')}`,
      });
    }

    this._pushHistory();
    const idx = this._state.tiles.indexOf(src);
    const newTiles = parts.map((p) => ({ id: p.id, coefficient: p.coefficient, variable: src.variable }));
    this._state.tiles.splice(idx, 1, ...newTiles);
    this._pruneSelection();
    return this._accept('split_group', { committed: true, event: 'valid_split' });
  }

  // select_group(tileIds:[...]) — set selection. Not a math move; no history,
  // no commit. Selecting a tile that doesn't exist is rejected (snap back).
  _selectGroup(op) {
    const ids = Array.isArray(op.tileIds) ? op.tileIds : [];
    const unique = [...new Set(ids)];
    if (!unique.every((id) => typeof id === 'string' && this._findTile(id))) {
      return this._reject('select_group', 'TILE_NOT_FOUND');
    }
    this._state.selection = unique;
    return this._accept('select_group', { selection: this.selection });
  }

  // move_group — pure reposition; semantic state is position-free at the tile
  // level (canvas coords live on the WorkspaceElement envelope), so this is a
  // recognized no-op that keeps the command-equivalent vocabulary complete.
  _moveGroup(op) {
    const ids = Array.isArray(op.tileIds) ? op.tileIds : [];
    if (!ids.every((id) => typeof id === 'string' && this._findTile(id))) {
      return this._reject('move_group', 'TILE_NOT_FOUND');
    }
    return this._accept('move_group', { noop: true });
  }

  /** Revert the last committed op. */
  undo() {
    if (!this._history.length) {
      return this._reject('undo', 'NOTHING_TO_UNDO');
    }
    const prev = this._history.pop();
    this._state = { schemaVersion: SCHEMA_VERSION, tiles: prev.tiles.map(cloneTile), selection: prev.selection.slice() };
    return this._accept('undo', { committed: true, event: null });
  }

  /** Canonical string of the current committed tiles, e.g. "2x + 3 - y". */
  canonical() { return canonicalSum(this._state.tiles); }

  // ── internals ──
  _pruneSelection() {
    const ids = new Set(this._state.tiles.map((t) => t.id));
    this._state.selection = this._state.selection.filter((id) => ids.has(id));
  }
}

module.exports = { AlgebraTileEngine, normalizeState, canonicalSum, SCHEMA_VERSION };
