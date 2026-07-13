// tests/unit/workspace/contracts.test.js
// Promoted from shared/workspace/__selftest__.js (P0 → jest, per the build plan).
// The load-bearing guarantee: a client CANNOT forge a mathematical verdict —
// serverOnly fields are refused at ingest.

const {
  validateInbound, VerifiedMove,
  WorkspaceElement, WorkspaceSnapshot, safeParseSnapshot,
  LearningEvent, PresenceCommand,
  ELEMENT_TYPES,
} = require('../../../shared/workspace');

function baseMove(over = {}) {
  return Object.assign({
    schemaVersion: 1,
    moveId: 'm-1', conversationId: 'c-1', workspaceId: 'w-1', elementId: 'tiles-1',
    elementType: ELEMENT_TYPES.ALGEBRA_TILES,
    source: 'gesture', intent: 'combine_like_terms', mode: 'attempt',
    previousState: { positiveX: 5 }, proposedState: { positiveX: 0, groups: [{ x: 5 }] },
    operation: { type: 'combine_like_terms', operands: ['2x', '3x'] },
    interaction: { gestureType: 'drag', pointerType: 'touch', startedAt: '2026-07-12T00:00:00Z', completedAt: '2026-07-12T00:00:01Z' },
    clientSequence: 1, idempotencyKey: 'k-1',
  }, over);
}

describe('StudentMove ingest validation', () => {
  test('a well-formed move passes ingest', () => {
    expect(validateInbound(baseMove()).valid).toBe(true);
  });
  test('bad elementType is rejected', () => {
    expect(validateInbound(baseMove({ elementType: 'wormhole' })).valid).toBe(false);
  });
  test('bad mode is rejected', () => {
    expect(validateInbound(baseMove({ mode: 'teleport' })).valid).toBe(false);
  });
  test('missing idempotencyKey is rejected', () => {
    const m = baseMove(); delete m.idempotencyKey;
    expect(validateInbound(m).valid).toBe(false);
  });
});

describe('core guarantee — client cannot forge validity', () => {
  test('a smuggled mathematicallyValid=true is rejected at ingest', () => {
    expect(validateInbound(baseMove({ mathematicallyValid: true })).valid).toBe(false);
  });
  test('smuggled server verdict fields are rejected at ingest', () => {
    expect(validateInbound(baseMove({ accepted: true, canonicalMove: '2x+3->5x' })).valid).toBe(false);
  });
});

describe('VerifiedMove (server-owned)', () => {
  test('server can build a misconception verdict', () => {
    const res = VerifiedMove.validate(
      { moveId: 'm-1', accepted: true, interactionValid: true, mathematicallyValid: false, committed: false, classification: 'combine_unlike_terms', misconceptionCode: 'LIKE_TERMS_OVERGENERALIZED' },
      { context: 'server' }
    );
    expect(res.valid).toBe(true);
  });
  test('a client may NOT post a VerifiedMove (serverOnly fields refused at ingest)', () => {
    const res = VerifiedMove.validate(
      { moveId: 'm-1', accepted: true, interactionValid: true, committed: true },
      { context: 'ingest' }
    );
    expect(res.valid).toBe(false);
  });
});

describe('Element + snapshot round-trip', () => {
  const el = { id: 'tiles-1', type: ELEMENT_TYPES.ALGEBRA_TILES, position: { x: 40, y: 60 }, semantic: { positiveX: 5 }, provisional: true };
  test('a provisional element validates', () => {
    expect(WorkspaceElement.validate(el, { context: 'server' }).valid).toBe(true);
  });
  test('a snapshot validates', () => {
    const snap = { schemaVersion: 1, workspaceId: 'w-1', conversationId: 'c-1', elements: [el], savedAt: '2026-07-12T00:00:00Z' };
    expect(WorkspaceSnapshot.validate(snap, { context: 'server' }).valid).toBe(true);
  });
  test('a corrupt snapshot recovers instead of throwing', () => {
    expect(safeParseSnapshot({ garbage: true }).recovered).toBe(true);
  });
});

describe('Engagement + presence (juice rule: no correctness framing)', () => {
  test('a neutral learning event validates', () => {
    expect(LearningEvent.validate({ type: 'student_self_corrected', difficulty: 0.7, attempts: 3 }, { context: 'server' }).valid).toBe(true);
  });
  test('a correctness-framed event type is rejected', () => {
    expect(LearningEvent.validate({ type: 'student_got_it_right' }, { context: 'server' }).valid).toBe(false);
  });
  test('a presence command validates', () => {
    expect(PresenceCommand.validate({ type: 'circle', targetElementId: 'tiles-1', region: 'lhs' }, { context: 'server' }).valid).toBe(true);
  });
});
