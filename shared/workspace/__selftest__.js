'use strict';
/* Plain-node self-test for the P0 contracts. No jest needed.
   Run: node shared/workspace/__selftest__.js   (exits non-zero on failure)
   Promoted to a proper jest suite in P1. */

const {
  validateInbound, StudentMove, VerifiedMove,
  WorkspaceElement, WorkspaceSnapshot, safeParseSnapshot,
  LearningEvent, PresenceCommand,
  ELEMENT_TYPES,
} = require('./index');

let failures = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.error('  ✗ ' + msg); failures++; }
}

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

console.log('StudentMove ingest:');
ok(validateInbound(baseMove()).valid, 'a well-formed move passes ingest');
ok(!validateInbound(baseMove({ elementType: 'wormhole' })).valid, 'bad elementType is rejected');
ok(!validateInbound(baseMove({ mode: 'teleport' })).valid, 'bad mode is rejected');
{ const m = baseMove(); delete m.idempotencyKey; ok(!validateInbound(m).valid, 'missing idempotencyKey is rejected'); }

console.log('The core guarantee — client cannot forge validity:');
ok(!validateInbound(baseMove({ mathematicallyValid: true })).valid,
   'a smuggled mathematicallyValid=true is REJECTED at ingest');
ok(!validateInbound(baseMove({ accepted: true, canonicalMove: '2x+3->5x' })).valid,
   'smuggled server verdict fields are REJECTED at ingest');

console.log('VerifiedMove (server-owned):');
ok(VerifiedMove.validate({ moveId: 'm-1', accepted: true, interactionValid: true, mathematicallyValid: false, committed: false, classification: 'combine_unlike_terms', misconceptionCode: 'LIKE_TERMS_OVERGENERALIZED' }, { context: 'server' }).valid,
   'server can build a misconception verdict');
ok(!VerifiedMove.validate({ moveId: 'm-1', accepted: true, interactionValid: true, committed: true }, { context: 'ingest' }).valid,
   'a client may NOT post a VerifiedMove (serverOnly fields refused)');

console.log('Element + snapshot round-trip:');
const el = { id: 'tiles-1', type: ELEMENT_TYPES.ALGEBRA_TILES, position: { x: 40, y: 60 }, semantic: { positiveX: 5 }, provisional: true };
ok(WorkspaceElement.validate(el, { context: 'server' }).valid, 'a provisional element validates');
const snap = { schemaVersion: 1, workspaceId: 'w-1', conversationId: 'c-1', elements: [el], savedAt: '2026-07-12T00:00:00Z' };
ok(WorkspaceSnapshot.validate(snap, { context: 'server' }).valid, 'a snapshot validates');
ok(safeParseSnapshot({ garbage: true }).recovered === true, 'a corrupt snapshot recovers instead of throwing');

console.log('Engagement + presence:');
ok(LearningEvent.validate({ type: 'student_self_corrected', difficulty: 0.7, attempts: 3 }, { context: 'server' }).valid, 'a neutral learning event validates');
ok(!LearningEvent.validate({ type: 'student_got_it_right' }, { context: 'server' }).valid, 'a correctness-framed event type is rejected (juice rule)');
ok(PresenceCommand.validate({ type: 'circle', targetElementId: 'tiles-1', region: 'lhs' }, { context: 'server' }).valid, 'a presence command validates');

console.log('');
if (failures) { console.error(`FAILED: ${failures} assertion(s)`); process.exit(1); }
console.log('All contract self-tests passed.');
