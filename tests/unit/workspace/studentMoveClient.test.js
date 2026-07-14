'use strict';
/* Living Workspace P7 — client side of the close-the-loop.
   The server half (workspaceStateService/studentMoveService) is tested
   elsewhere; this covers the client: optimistic result, schema-valid move
   construction, POST shape, and the two-layer commit/snap-back reconcile. */

const C = require('../../../public/js/living-workspace/dom/studentMoveClient');
const { StudentMove } = require('../../../shared/workspace');

const TILES = [
  { id: 't1', coefficient: 2, variable: 'x' },
  { id: 't2', coefficient: 3, variable: 'x' },
  { id: 't3', coefficient: -2, variable: 'x' },
  { id: 't4', coefficient: 4, variable: '' },
];

describe('applyOptimistic — the intended (not authoritative) result', () => {
  test('combine_like_terms merges coefficients and drops the absorbed tile', () => {
    const out = C.applyOptimistic(TILES, { type: 'combine_like_terms', tileRefs: ['t1', 't2'] });
    expect(out.find(t => t.id === 't1')).toEqual({ id: 't1', coefficient: 5, variable: 'x' });
    expect(out.find(t => t.id === 't2')).toBeUndefined();
    expect(out).toHaveLength(3);
  });
  test('combining to zero removes the result entirely', () => {
    const out = C.applyOptimistic(TILES, { type: 'combine_like_terms', tileRefs: ['t1', 't3'] });
    // 2x + (−2x) = 0 → gone (this could equally be modeled as a zero pair)
    expect(out.find(t => t.id === 't1')).toBeUndefined();
    expect(out.find(t => t.id === 't3')).toBeUndefined();
  });
  test('remove_zero_pair drops both tiles', () => {
    const out = C.applyOptimistic(TILES, { type: 'remove_zero_pair', tileRefs: ['t1', 't3'] });
    expect(out.map(t => t.id).sort()).toEqual(['t2', 't4']);
  });
  test('move_group and missing refs leave state unchanged', () => {
    expect(C.applyOptimistic(TILES, { type: 'move_group', tileRefs: ['t1'] })).toHaveLength(4);
    expect(C.applyOptimistic(TILES, { type: 'combine_like_terms', tileRefs: ['t1', 'nope'] })).toHaveLength(4);
  });
  test('does not mutate the input', () => {
    const before = JSON.stringify(TILES);
    C.applyOptimistic(TILES, { type: 'remove_zero_pair', tileRefs: ['t1', 't3'] });
    expect(JSON.stringify(TILES)).toBe(before);
  });
});

describe('buildMove — schema-valid, client fields only', () => {
  const base = {
    conversationId: 'c1', workspaceId: 'w1', elementId: 'tiles-1',
    previousTiles: TILES, operation: { type: 'combine_like_terms', tileRefs: ['t1', 't2'] },
    source: 'gesture',
  };

  test('passes StudentMove ingest validation (no serverOnly fields)', () => {
    const move = C.buildMove(base);
    const { valid, errors } = StudentMove.validate(move, { context: 'ingest' });
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });
  test('operation carries only type + tileRefs (server rebuilds operands)', () => {
    const move = C.buildMove(base);
    expect(move.operation).toEqual({ type: 'combine_like_terms', tileRefs: ['t1', 't2'] });
    expect(move.intent).toBe('combine_like_terms');
    expect(move.mode).toBe('attempt');
  });
  test('a reposition is mode:reposition (no math attempt)', () => {
    const move = C.buildMove(Object.assign({}, base, { operation: { type: 'move_group', tileRefs: ['t1'] } }));
    expect(move.mode).toBe('reposition');
  });
  test('keyboard source → keyboard pointer type', () => {
    const move = C.buildMove(Object.assign({}, base, { source: 'keyboard' }));
    expect(move.interaction.pointerType).toBe('keyboard');
  });
});

describe('sendMove — POST shape', () => {
  function stubFetch(responseBody, ok = true) {
    const calls = [];
    const fn = (url, init) => { calls.push({ url, init }); return Promise.resolve({ ok, status: ok ? 200 : 400, json: () => Promise.resolve(responseBody) }); };
    fn.calls = calls;
    return fn;
  }

  test('POSTs the move to /api/student-moves?tutor=true and returns verifiedMove', async () => {
    const fetch = stubFetch({ verifiedMove: { moveId: 'x', committed: true }, text: 'Nice — 2x + 3x = 5x.' });
    const res = await C.sendMove({
      conversationId: 'c1', workspaceId: 'w1', elementId: 'tiles-1', previousTiles: TILES,
      operation: { type: 'combine_like_terms', tileRefs: ['t1', 't2'] },
    }, { fetch });
    expect(fetch.calls[0].url).toBe('/api/student-moves?tutor=true');
    expect(fetch.calls[0].init.method).toBe('POST');
    const sent = JSON.parse(fetch.calls[0].init.body);
    expect(sent.operation.tileRefs).toEqual(['t1', 't2']);
    expect(res.verifiedMove.committed).toBe(true);
  });
});

describe('runTileMove — the two-layer loop', () => {
  function mockShell() {
    const calls = [];
    return { calls, updateElement: (id, patch) => calls.push({ id, patch }) };
  }
  function fetchReturning(body) {
    return () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  }
  const element = { id: 'tiles-1', type: 'algebra_tiles', semantic: { tiles: TILES } };
  const ctx = { conversationId: 'c1', workspaceId: 'w1' };

  test('valid move: optimistic provisional → committed (reconcile to server state)', async () => {
    const shell = mockShell();
    let reaction = null;
    await C.runTileMove({
      shell, element, operation: { type: 'combine_like_terms', tileRefs: ['t1', 't2'] }, source: 'gesture', ctx,
      fetch: fetchReturning({ verifiedMove: { committed: true, resultingState: { tiles: [{ id: 't1', coefficient: 5, variable: 'x' }, TILES[2], TILES[3]] } }, text: 'Nice work!' }),
      onReaction: (txt) => { reaction = txt; },
    });
    // Layer 1: provisional true; Layer 2: provisional false (committed)
    expect(shell.calls[0].patch.provisional).toBe(true);
    expect(shell.calls[shell.calls.length - 1].patch.provisional).toBe(false);
    expect(shell.calls[shell.calls.length - 1].patch.semantic.tiles.find(t => t.id === 't1').coefficient).toBe(5);
    expect(reaction).toBe('Nice work!');
  });

  test('misconception (not committed): optimistic → SNAP BACK to previous state', async () => {
    const shell = mockShell();
    let reaction = null;
    await C.runTileMove({
      shell, element, operation: { type: 'combine_like_terms', tileRefs: ['t1', 't4'] }, source: 'gesture', ctx,
      fetch: fetchReturning({ verifiedMove: { committed: false, mathematicallyValid: false, misconceptionCode: 'combine_unlike_terms' }, text: "Careful — 2x and 4 aren't like terms. What's different about them?" }),
      onReaction: (txt) => { reaction = txt; },
    });
    const last = shell.calls[shell.calls.length - 1];
    expect(last.patch.provisional).toBe(false);
    // snapped back → original 4 tiles restored
    expect(last.patch.semantic.tiles).toHaveLength(4);
    expect(reaction).toMatch(/like terms/);
  });

  test('network failure → snap back, surface stays truthful', async () => {
    const shell = mockShell();
    await C.runTileMove({
      shell, element, operation: { type: 'combine_like_terms', tileRefs: ['t1', 't2'] }, source: 'gesture', ctx,
      fetch: () => Promise.reject(new Error('offline')),
    });
    const last = shell.calls[shell.calls.length - 1];
    expect(last.patch.provisional).toBe(false);
    expect(last.patch.semantic.tiles).toHaveLength(4); // reverted
  });
});
