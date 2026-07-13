'use strict';
/* node utils/workspace/__selftest_verifier__.js  (exits non-zero on failure) */
const { verifyAlgebraTileMove } = require('./algebraTileVerifier');

let failures = 0;
const ok = (c, m) => c ? console.log('  ✓ ' + m) : (console.error('  ✗ ' + m), failures++);

const x = (coefficient, variable = 'x') => ({ coefficient, variable });

// 2x + 3x -> 5x  (the valid case)
const good = verifyAlgebraTileMove({}, { type: 'combine_like_terms', operands: [x(2), x(3)] });
ok(good.interactionValid && good.mathematicallyValid, '2x + 3x is valid');
ok(good.classification === 'combine_like_terms', '  classified combine_like_terms');
ok(good.canonicalMove === '2x + 3x -> 5x', `  canonicalMove = "${good.canonicalMove}"`);
ok(good.resultingState && good.resultingState.lastResult.coefficient === 5, '  result is 5x');

// 2x + 3 -> "5x"  (the misconception — lands, doesn't reject)
const bad = verifyAlgebraTileMove({}, { type: 'combine_like_terms', operands: [x(2), x(3, '')] });
ok(bad.interactionValid, '2x + 3 is a real interaction (not rejected)');
ok(bad.mathematicallyValid === false, '  but mathematically invalid');
ok(bad.classification === 'combine_unlike_terms', '  classified combine_unlike_terms');
ok(bad.misconceptionCode === 'COMBINED_UNLIKE_TERMS', '  carries a misconception code');
ok(bad.resultingState === null, '  never fabricates the wrong claim as a committed state');

// x + (-x) -> 0
const zero = verifyAlgebraTileMove({}, { type: 'create_zero_pair', operands: [x(1), x(-1)] });
ok(zero.mathematicallyValid && zero.classification === 'create_zero_pair', 'x + (-x) is a valid zero pair');

// bad shapes
ok(!verifyAlgebraTileMove({}, { type: 'combine_like_terms', operands: [x(2)] }).interactionValid, 'combine with one term is invalid_interaction');
ok(verifyAlgebraTileMove({}, { type: 'teleport' }).classification === 'invalid_interaction', 'unknown op is invalid_interaction');

console.log('');
if (failures) { console.error(`FAILED: ${failures}`); process.exit(1); }
console.log('algebra-tile verifier: all self-tests passed.');
