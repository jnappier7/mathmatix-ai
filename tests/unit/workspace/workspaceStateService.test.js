// tests/unit/workspace/workspaceStateService.test.js
// Server-authoritative tile-state layer (P7 server half). The engine (P2) holds
// and TRANSITIONS the snapshot; the move references tiles by id and the server
// rebuilds operands from ITS OWN previous state — a forged operand value can't
// change the verdict. Driven through processStudentMove so we also prove the
// additive routing in studentMoveService and backward-compat with the P1 path.

const { processStudentMove } = require('../../../services/workspace/studentMoveService');
const { applyMove, hasTileState, toEngineOp } = require('../../../services/workspace/workspaceStateService');
const { ELEMENT_TYPES } = require('../../../shared/workspace');

const tile = (id, coefficient, variable = 'x') => ({ id, coefficient, variable });

const move = (over = {}) => Object.assign({
  schemaVersion: 1, moveId: 'm1', conversationId: 'c1', workspaceId: 'w1', elementId: 'e1',
  elementType: ELEMENT_TYPES.ALGEBRA_TILES, source: 'gesture', mode: 'attempt', intent: 'combine_like_terms',
  previousState: { schemaVersion: 1, tiles: [tile('t1', 2), tile('t2', 3)], selection: [] },
  proposedState: {},
  operation: { type: 'combine_like_terms', tileRefs: ['t1', 't2'], resultId: 't3' },
  interaction: { gestureType: 'drag', pointerType: 'touch', startedAt: '2026-07-13T00:00:00Z', completedAt: '2026-07-13T00:00:01Z' },
  clientSequence: 1, idempotencyKey: 'k1',
}, over);

describe('routing: hasTileState decides authoritative vs stateless path', () => {
  test('a move with previousState.tiles routes to the authoritative path (returns a snapshot)', () => {
    const r = processStudentMove(move());
    expect(r.ok).toBe(true);
    expect(r.snapshot).toBeDefined();
  });
  test('a legacy move (operands, no tile snapshot) keeps the stateless path (no snapshot)', () => {
    const r = processStudentMove(move({
      previousState: {},
      operation: { type: 'combine_like_terms', operands: [{ coefficient: 2, variable: 'x' }, { coefficient: 3, variable: 'x' }] },
    }));
    expect(r.ok).toBe(true);
    expect(r.snapshot).toBeUndefined();
    expect(r.normalized.pipelineMessage).toBe('I combined 2x + 3x to get 5x');
  });
  test('hasTileState only fires when tiles is an array', () => {
    expect(hasTileState(move())).toBe(true);
    expect(hasTileState(move({ previousState: {} }))).toBe(false);
  });
});

describe('authoritative valid combine transitions state', () => {
  const r = processStudentMove(move());
  test('commits and merges into a new snapshot (2x + 3x → 5x)', () => {
    expect(r.verifiedMove.committed).toBe(true);
    expect(r.verifiedMove.mathematicallyValid).toBe(true);
    expect(r.snapshot.tiles).toEqual([tile('t3', 5)]);
  });
  test('produces the ANSWER_ATTEMPT stated step for the tutor turn', () => {
    expect(r.normalized.pipelineMessage).toBe('I combined 2x + 3x to get 5x');
  });
  test('resultingState carries the authoritative post-move snapshot', () => {
    expect(r.verifiedMove.resultingState.snapshot.tiles).toEqual([tile('t3', 5)]);
  });
});

describe('the authority guarantee: server ignores forged operand values', () => {
  test('operands the client sends are irrelevant — the verdict uses the real tiles', () => {
    // Client smuggles a bogus operand claim alongside the refs; server reads t1,t2
    // from ITS snapshot (2x, 3x), so the stated step reflects reality, not the lie.
    const forged = move({
      operation: { type: 'combine_like_terms', tileRefs: ['t1', 't2'], resultId: 't3', operands: [{ coefficient: 99, variable: 'x' }, { coefficient: 99, variable: 'x' }] },
    });
    const r = processStudentMove(forged);
    expect(r.normalized.pipelineMessage).toBe('I combined 2x + 3x to get 5x');
    expect(r.snapshot.tiles).toEqual([tile('t3', 5)]);
  });

  test('a stale/nonexistent ref is rejected (snap back), never silently applied', () => {
    const r = processStudentMove(move({ operation: { type: 'combine_like_terms', tileRefs: ['t1', 'ghost'] } }));
    expect(r.ok).toBe(false);
    expect(r.status).toBe(422);
    expect(r.verifiedMove.interactionValid).toBe(false);
    expect(r.snapshot.tiles).toHaveLength(2); // unchanged
  });
});

describe('unlike terms land provisionally (allow-and-teach), state untouched', () => {
  const r = processStudentMove(move({
    previousState: { schemaVersion: 1, tiles: [tile('t1', 2, 'x'), tile('t2', 3, '')], selection: [] },
    operation: { type: 'combine_like_terms', tileRefs: ['t1', 't2'] },
  }));
  test('not committed, flagged with a misconception', () => {
    expect(r.verifiedMove.committed).toBe(false);
    expect(r.verifiedMove.mathematicallyValid).toBe(false);
    expect(r.verifiedMove.misconceptionCode).toBe('COMBINED_UNLIKE_TERMS');
  });
  test('the authoritative snapshot is unchanged', () => {
    expect(r.snapshot.tiles).toEqual([tile('t1', 2, 'x'), tile('t2', 3, '')]);
  });
  test('still produces a stated step so the tutor can coach the wrong claim', () => {
    expect(r.normalized.pipelineMessage).toBe('I combined 2x + 3 to get 5x');
  });
});

describe('zero pairs, split, and undo via the authoritative path', () => {
  test('remove_zero_pair cancels opposites and shrinks the snapshot', () => {
    const r = processStudentMove(move({
      intent: 'remove_zero_pair',
      previousState: { schemaVersion: 1, tiles: [tile('t1', 1), tile('t2', -1)], selection: [] },
      operation: { type: 'remove_zero_pair', tileRefs: ['t1', 't2'] },
    }));
    expect(r.verifiedMove.committed).toBe(true);
    expect(r.snapshot.tiles).toEqual([]);
  });

  test('split_group decomposes with conservation', () => {
    const r = processStudentMove(move({
      intent: 'split_group',
      previousState: { schemaVersion: 1, tiles: [tile('t1', 5)], selection: [] },
      operation: { type: 'split_group', tileRefs: ['t1'], parts: [{ id: 'a', coefficient: 2 }, { id: 'b', coefficient: 3 }] },
    }));
    expect(r.verifiedMove.committed).toBe(true);
    expect(r.snapshot.tiles).toEqual([tile('a', 2), tile('b', 3)]);
  });

  test('undo on empty history is a clean rejection, not a crash', () => {
    const r = processStudentMove(move({
      mode: 'undo', intent: 'undo',
      previousState: { schemaVersion: 1, tiles: [tile('t1', 5)], selection: [] },
      operation: { type: 'undo' },
    }));
    expect(r.ok).toBe(false);
    expect(r.status).toBe(422);
  });
});

describe('mode semantics: exploration keeps the anti-leak gate closed', () => {
  test('exploration produces NO stated step (never delegated / injected)', () => {
    const r = processStudentMove(move({ mode: 'exploration' }));
    expect(r.normalized).toBeNull();
  });
  test('reposition (move_group) is a no-op with no stated step', () => {
    const r = processStudentMove(move({
      mode: 'reposition', intent: 'move_group',
      operation: { type: 'move_group', tileRefs: ['t1'] },
    }));
    expect(r.normalized).toBeNull();
    expect(r.verifiedMove.committed).toBe(false);
  });
});

describe('toEngineOp mapping', () => {
  test('maps intent/operation to the engine op shape', () => {
    expect(toEngineOp(move())).toMatchObject({ type: 'combine_like_terms', tileIds: ['t1', 't2'], resultId: 't3' });
    expect(toEngineOp(move({ operation: { type: 'undo' } }))).toEqual({ type: 'undo', moveId: 'm1' });
    expect(toEngineOp(move({ intent: 'split_group', operation: { type: 'split_group', tileRefs: ['t1'], parts: [] } })))
      .toMatchObject({ type: 'split_group', tileId: 't1' });
  });
});

describe('direct applyMove returns the full envelope', () => {
  test('ok, status, verifiedMove, normalized, snapshot, engineResult', () => {
    const r = applyMove(move());
    expect(r).toEqual(expect.objectContaining({ ok: true, status: 200 }));
    expect(r.verifiedMove).toBeDefined();
    expect(r.snapshot).toBeDefined();
    expect(r.engineResult.committed).toBe(true);
  });
});
