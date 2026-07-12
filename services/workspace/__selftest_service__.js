'use strict';
/* node services/workspace/__selftest_service__.js  (exits non-zero on failure) */
const { processStudentMove } = require('./studentMoveService');
const { ELEMENT_TYPES } = require('../../shared/workspace');

let failures = 0;
const ok = (c, m) => c ? console.log('  ✓ ' + m) : (console.error('  ✗ ' + m), failures++);

const x = (coefficient, variable = 'x') => ({ coefficient, variable });
const move = (over = {}) => Object.assign({
  schemaVersion: 1, moveId: 'm-1', conversationId: 'c-1', workspaceId: 'w-1', elementId: 'tiles-1',
  elementType: ELEMENT_TYPES.ALGEBRA_TILES, source: 'gesture', mode: 'attempt',
  intent: 'combine_like_terms',
  previousState: {}, proposedState: {},
  operation: { type: 'combine_like_terms', operands: [x(2), x(3)] },
  interaction: { gestureType: 'drag', pointerType: 'touch', startedAt: '2026-07-12T00:00:00Z', completedAt: '2026-07-12T00:00:01Z' },
  clientSequence: 1, idempotencyKey: 'k-1',
}, over);

console.log('valid combine (2x + 3x):');
const good = processStudentMove(move());
ok(good.ok && good.status === 200, 'accepted');
ok(good.verifiedMove.mathematicallyValid === true, 'verdict: valid');
ok(good.verifiedMove.committed === true, 'committed (correct move)');
ok(good.normalized.pipelineMessage === '2x + 3x = 5x', `normalized → "${good.normalized.pipelineMessage}"`);

console.log('misconception (2x + 3):');
const bad = processStudentMove(move({ operation: { type: 'combine_like_terms', operands: [x(2), x(3, '')] } }));
ok(bad.ok && bad.status === 200, 'still accepted (allow-and-teach)');
ok(bad.verifiedMove.mathematicallyValid === false, 'verdict: invalid');
ok(bad.verifiedMove.committed === false, 'NOT committed → stays provisional "?"');
ok(bad.verifiedMove.misconceptionCode === 'COMBINED_UNLIKE_TERMS', 'misconception code present');
ok(bad.normalized.pipelineMessage === '2x + 3 = 5x', `normalized shows the CLAIM → "${bad.normalized.pipelineMessage}"`);

console.log('reposition (no math verdict):');
const repo = processStudentMove(move({ mode: 'reposition' }));
ok(repo.ok && repo.verifiedMove.mathematicallyValid === null && repo.verifiedMove.classification === 'no_op', 'reposition = no_op, no math judgment');

console.log('untrusted input rejected:');
ok(processStudentMove(move({ mathematicallyValid: true })).status === 400, 'smuggled mathematicallyValid → 400');
ok(processStudentMove(move({ elementType: 'wormhole' })).status === 400, 'bad elementType → 400');
ok(processStudentMove(move({ elementType: ELEMENT_TYPES.GRAPH })).status === 422, 'no verifier yet for graph → 422');

console.log('');
if (failures) { console.error(`FAILED: ${failures}`); process.exit(1); }
console.log('studentMoveService: all self-tests passed.');
