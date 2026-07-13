// tests/unit/workspace/algebraTileEngine.test.js
// P2 definition-of-done for the headless algebra-tile engine
// (docs/BOARD_LIVING_WORKSPACE_SPEC.md §3.3/B2): like/unlike terms, zero
// pairs (create + remove), split conservation, select/move, empty-space /
// nonexistent-tile drops, undo, duplicate submissions, malformed state,
// snapshot round-trip. Pure/headless — no Fabric, no DOM.

const { AlgebraTileEngine, normalizeState, canonicalSum } = require('../../../utils/workspace/algebraTileEngine');

const tile = (id, coefficient, variable = 'x') => ({ id, coefficient, variable });

describe('hydration + snapshot round-trip', () => {
  test('a clean semantic payload round-trips exactly', () => {
    const semantic = { schemaVersion: 1, tiles: [tile('a', 2), tile('b', 3)], selection: ['a'] };
    const eng = AlgebraTileEngine.fromSemantic(semantic);
    expect(eng.recovered).toBe(false);
    expect(eng.toSemantic()).toEqual(semantic);
  });

  test('toSemantic returns a deep copy (no aliasing of internal state)', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 2)] });
    const snap = eng.toSemantic();
    snap.tiles[0].coefficient = 999;
    expect(eng.tiles[0].coefficient).toBe(2);
  });

  test('empty construction yields a clean empty state', () => {
    const eng = new AlgebraTileEngine();
    expect(eng.tiles).toEqual([]);
    expect(eng.selection).toEqual([]);
    expect(eng.canonical()).toBe('0');
  });
});

describe('malformed state recovery (never throws)', () => {
  test('drops bad tiles, dedupes ids, sanitizes selection, flags recovered', () => {
    const eng = new AlgebraTileEngine({
      tiles: [
        { id: 'a', coefficient: 'bad' }, // wrong type
        null,                             // junk
        tile('a', 1),                     // valid, id 'a'
        tile('b', 0),                     // zero-coefficient → dropped
        tile('c', 4, 'y'),
      ],
      selection: ['c', 'ghost'],          // 'ghost' references nothing
    });
    expect(eng.recovered).toBe(true);
    expect(eng.tiles.map((t) => t.id).sort()).toEqual(['a', 'c']);
    expect(eng.selection).toEqual(['c']);
  });

  test('a totally garbage payload recovers to empty', () => {
    const eng = new AlgebraTileEngine(42);
    expect(eng.tiles).toEqual([]);
    expect(eng.recovered).toBe(true);
  });

  test('normalizeState is pure and reports recovery', () => {
    const { state, recovered } = normalizeState({ tiles: [tile('a', 2)], selection: [] });
    expect(recovered).toBe(false);
    expect(state.tiles).toHaveLength(1);
  });
});

describe('combine_like_terms', () => {
  test('valid like terms commit and merge (2x + 3x → 5x)', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 2), tile('b', 3)] });
    const r = eng.apply({ type: 'combine_like_terms', tileIds: ['a', 'b'], resultId: 'c' });
    expect(r.ok).toBe(true);
    expect(r.committed).toBe(true);
    expect(r.provisional).toBe(false);
    expect(r.canonicalMove).toBe('2x + 3x -> 5x');
    expect(r.event).toBe('valid_combine');
    expect(eng.canonical()).toBe('5x');
    expect(eng.tiles).toEqual([tile('c', 5)]);
  });

  test('unlike terms land PROVISIONALLY — a claim, not committed math (2x + 3)', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 2, 'x'), tile('b', 3, '')] });
    const before = eng.toSemantic();
    const r = eng.apply({ type: 'combine_like_terms', tileIds: ['a', 'b'] });
    expect(r.ok).toBe(true);
    expect(r.committed).toBe(false);
    expect(r.provisional).toBe(true);
    expect(r.misconceptionCode).toBe('COMBINED_UNLIKE_TERMS');
    expect(r.provisionalResult).toEqual({ coefficient: 5, variable: 'x' }); // the student's CLAIM
    expect(r.event).toBeNull();
    expect(eng.toSemantic()).toEqual(before); // committed state untouched
  });

  test('combining opposite like terms to zero drops the tile (2x + -2x → 0)', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 2), tile('b', -2)] });
    const r = eng.apply({ type: 'combine_like_terms', tileIds: ['a', 'b'], resultId: 'c' });
    expect(r.committed).toBe(true);
    expect(eng.tiles).toEqual([]);
    expect(eng.canonical()).toBe('0');
  });

  test('referencing a tile not on the board is rejected (snap back)', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 2)] });
    const r = eng.apply({ type: 'combine_like_terms', tileIds: ['a', 'ghost'] });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('TILE_NOT_FOUND');
    expect(eng.tiles).toHaveLength(1);
  });

  test('the same tile twice is rejected', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 2)] });
    expect(eng.apply({ type: 'combine_like_terms', tileIds: ['a', 'a'] }).error).toBe('TILE_NOT_FOUND');
  });

  test('needs exactly two tiles', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 2), tile('b', 3)] });
    expect(eng.apply({ type: 'combine_like_terms', tileIds: ['a'] }).error).toBe('COMBINE_NEEDS_TWO_TILES');
  });
});

describe('zero pairs', () => {
  test('remove_zero_pair cancels true opposites (x + -x → removed)', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 1), tile('b', -1)] });
    const r = eng.apply({ type: 'remove_zero_pair', tileIds: ['a', 'b'] });
    expect(r.committed).toBe(true);
    expect(r.event).toBe('valid_zero_pair');
    expect(eng.tiles).toEqual([]);
  });

  test('remove_zero_pair on NON-opposites is a provisional claim, not committed', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 1), tile('b', 2)] });
    const r = eng.apply({ type: 'remove_zero_pair', tileIds: ['a', 'b'] });
    expect(r.committed).toBe(false);
    expect(r.provisional).toBe(true);
    expect(r.misconceptionCode).toBe('NOT_A_ZERO_PAIR');
    expect(eng.tiles).toHaveLength(2);
  });

  test('create_zero_pair introduces +t and -t (net zero) with supplied ids', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 3)] });
    const r = eng.apply({ type: 'create_zero_pair', term: { coefficient: 2, variable: 'x' }, ids: ['p', 'n'] });
    expect(r.committed).toBe(true);
    expect(eng.tiles).toEqual([tile('a', 3), tile('p', 2), tile('n', -2)]);
    // net effect is zero
    expect(eng.tiles.reduce((s, t) => s + t.coefficient, 0)).toBe(3);
  });

  test('create_zero_pair rejects a zero term and duplicate/colliding ids', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 3)] });
    expect(eng.apply({ type: 'create_zero_pair', term: { coefficient: 0, variable: 'x' }, ids: ['p', 'n'] }).error).toBe('BAD_ZERO_PAIR_TERM');
    expect(eng.apply({ type: 'create_zero_pair', term: { coefficient: 2, variable: 'x' }, ids: ['p', 'p'] }).error).toBe('ZERO_PAIR_NEEDS_TWO_IDS');
    expect(eng.apply({ type: 'create_zero_pair', term: { coefficient: 2, variable: 'x' }, ids: ['a', 'n'] }).error).toBe('DUPLICATE_TILE_ID');
  });
});

describe('split_group (conservation)', () => {
  test('splits a tile into parts that conserve quantity (5x → 2x + 3x)', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 5)] });
    const r = eng.apply({ type: 'split_group', tileId: 'a', parts: [{ id: 'p1', coefficient: 2 }, { id: 'p2', coefficient: 3 }] });
    expect(r.committed).toBe(true);
    expect(eng.canonical()).toBe('2x + 3x');
    expect(eng.tiles).toEqual([tile('p1', 2), tile('p2', 3)]);
  });

  test('a non-conserving split is rejected (5x ↛ 1x + 5x)', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 5)] });
    const r = eng.apply({ type: 'split_group', tileId: 'a', parts: [{ id: 'p1', coefficient: 1 }, { id: 'p2', coefficient: 5 }] });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('SPLIT_NOT_CONSERVED');
    expect(eng.canonical()).toBe('5x'); // untouched
  });

  test('rejects splitting a missing tile, <2 parts, or a zero part', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 5)] });
    expect(eng.apply({ type: 'split_group', tileId: 'ghost', parts: [{ id: 'p1', coefficient: 2 }, { id: 'p2', coefficient: 3 }] }).error).toBe('TILE_NOT_FOUND');
    expect(eng.apply({ type: 'split_group', tileId: 'a', parts: [{ id: 'p1', coefficient: 5 }] }).error).toBe('SPLIT_NEEDS_TWO_PARTS');
    expect(eng.apply({ type: 'split_group', tileId: 'a', parts: [{ id: 'p1', coefficient: 0 }, { id: 'p2', coefficient: 5 }] }).error).toBe('BAD_SPLIT_PART');
  });
});

describe('select_group and move_group', () => {
  test('select_group sets selection to existing tiles (deduped)', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 2), tile('b', 3)] });
    const r = eng.apply({ type: 'select_group', tileIds: ['a', 'b', 'a'] });
    expect(r.ok).toBe(true);
    expect(r.committed).toBe(false); // selection isn't committed math
    expect(eng.selection).toEqual(['a', 'b']);
  });

  test('select_group rejects a nonexistent tile', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 2)] });
    expect(eng.apply({ type: 'select_group', tileIds: ['ghost'] }).error).toBe('TILE_NOT_FOUND');
  });

  test('move_group is a recognized no-op (reposition changes no semantic state)', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 2)] });
    const before = eng.toSemantic();
    const r = eng.apply({ type: 'move_group', tileIds: ['a'] });
    expect(r.ok).toBe(true);
    expect(r.committed).toBe(false);
    expect(r.noop).toBe(true);
    expect(eng.toSemantic()).toEqual(before);
  });
});

describe('undo', () => {
  test('reverts the last committed op and stacks across multiple ops', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 2), tile('b', 3), tile('c', 4)] });
    eng.apply({ type: 'combine_like_terms', tileIds: ['a', 'b'], resultId: 'ab' }); // → 5x, 4x
    expect(eng.canonical()).toBe('5x + 4x');
    eng.apply({ type: 'combine_like_terms', tileIds: ['ab', 'c'], resultId: 'abc' }); // → 9x
    expect(eng.canonical()).toBe('9x');

    expect(eng.apply({ type: 'undo' }).committed).toBe(true);
    expect(eng.canonical()).toBe('5x + 4x');
    expect(eng.apply({ type: 'undo' }).committed).toBe(true);
    expect(eng.canonical()).toBe('2x + 3x + 4x');
  });

  test('undo with empty history is rejected, not a crash', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 2)] });
    const r = eng.apply({ type: 'undo' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('NOTHING_TO_UNDO');
  });

  test('a provisional (unlike) move does NOT create an undo point', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 2, 'x'), tile('b', 3, '')] });
    eng.apply({ type: 'combine_like_terms', tileIds: ['a', 'b'] }); // provisional, no commit
    expect(eng.canUndo).toBe(false);
    expect(eng.apply({ type: 'undo' }).error).toBe('NOTHING_TO_UNDO');
  });
});

describe('idempotency (duplicate submissions)', () => {
  test('a replayed moveId returns the original result without re-applying', () => {
    const eng = new AlgebraTileEngine({ tiles: [tile('a', 2), tile('b', 3)] });
    const first = eng.apply({ type: 'combine_like_terms', tileIds: ['a', 'b'], resultId: 'c', moveId: 'mv-1' });
    expect(first.committed).toBe(true);
    expect(eng.canonical()).toBe('5x');

    const replay = eng.apply({ type: 'combine_like_terms', tileIds: ['a', 'b'], resultId: 'c', moveId: 'mv-1' });
    expect(replay.duplicate).toBe(true);
    // State did NOT change again (no double-merge, no crash on now-missing tiles).
    expect(eng.canonical()).toBe('5x');
  });
});

describe('malformed / unsupported ops', () => {
  test('a null or typeless op is rejected', () => {
    const eng = new AlgebraTileEngine();
    expect(eng.apply(null).error).toBe('MALFORMED_OP');
    expect(eng.apply({}).error).toBe('MALFORMED_OP');
  });
  test('an unknown op type is rejected', () => {
    const eng = new AlgebraTileEngine();
    expect(eng.apply({ type: 'teleport' }).error).toBe('UNSUPPORTED_OP');
  });
});

describe('canonicalSum helper', () => {
  test('renders mixed terms with sign folding', () => {
    expect(canonicalSum([tile('a', 2), tile('b', -3), { id: 'c', coefficient: 4, variable: '' }])).toBe('2x - 3x + 4');
    expect(canonicalSum([])).toBe('0');
  });
});
