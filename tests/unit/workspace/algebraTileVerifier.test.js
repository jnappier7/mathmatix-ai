// tests/unit/workspace/algebraTileVerifier.test.js
// Promoted from utils/workspace/__selftest_verifier__.js.
// The authoritative, deterministic tile verdict: valid combine, the classic
// unlike-terms misconception (allow-and-teach), zero pairs, invalid shapes.

const { verifyAlgebraTileMove } = require('../../../utils/workspace/algebraTileVerifier');

const x = (coefficient, variable = 'x') => ({ coefficient, variable });

describe('verifyAlgebraTileMove — valid combine (2x + 3x)', () => {
  const good = verifyAlgebraTileMove({}, { type: 'combine_like_terms', operands: [x(2), x(3)] });
  test('is a valid interaction and mathematically valid', () => {
    expect(good.interactionValid).toBe(true);
    expect(good.mathematicallyValid).toBe(true);
  });
  test('classified combine_like_terms', () => {
    expect(good.classification).toBe('combine_like_terms');
  });
  test('canonicalMove renders the step', () => {
    expect(good.canonicalMove).toBe('2x + 3x -> 5x');
  });
  test('resulting state is 5x', () => {
    expect(good.resultingState.lastResult.coefficient).toBe(5);
  });
});

describe('verifyAlgebraTileMove — misconception (2x + 3, allow-and-teach)', () => {
  const bad = verifyAlgebraTileMove({}, { type: 'combine_like_terms', operands: [x(2), x(3, '')] });
  test('is a real interaction, not rejected', () => {
    expect(bad.interactionValid).toBe(true);
  });
  test('but mathematically invalid', () => {
    expect(bad.mathematicallyValid).toBe(false);
  });
  test('classified combine_unlike_terms with a misconception code', () => {
    expect(bad.classification).toBe('combine_unlike_terms');
    expect(bad.misconceptionCode).toBe('COMBINED_UNLIKE_TERMS');
  });
  test('never fabricates the wrong claim as a committed state', () => {
    expect(bad.resultingState).toBeNull();
  });
});

describe('verifyAlgebraTileMove — zero pairs and invalid shapes', () => {
  test('x + (-x) is a valid zero pair', () => {
    const zero = verifyAlgebraTileMove({}, { type: 'create_zero_pair', operands: [x(1), x(-1)] });
    expect(zero.mathematicallyValid).toBe(true);
    expect(zero.classification).toBe('create_zero_pair');
  });
  test('combine with one term is invalid_interaction', () => {
    expect(verifyAlgebraTileMove({}, { type: 'combine_like_terms', operands: [x(2)] }).interactionValid).toBe(false);
  });
  test('unknown op is invalid_interaction', () => {
    expect(verifyAlgebraTileMove({}, { type: 'teleport' }).classification).toBe('invalid_interaction');
  });
});
