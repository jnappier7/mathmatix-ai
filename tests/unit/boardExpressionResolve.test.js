const { _detectIntermediateExpression: detect } = require('../../utils/pipeline/boardSynthesizer');

describe('detectIntermediateExpression (factoring/expression-form resolve steps)', () => {
  it('matches the regrouping step from the live session', () => {
    expect(detect('3x^2 +7x-3x-7')).toBe('3x^2 +7x-3x-7');
  });

  it('matches a factored form', () => {
    expect(detect('(x-1)(3x+7)')).toBe('(x-1)(3x+7)');
    expect(detect('(3x+7)(x-1)')).toBe('(3x+7)(x-1)');
  });

  // --- prose must never reach the board ---
  it('rejects the student explaining their work in words', () => {
    expect(detect('an x comes out of the first group, and a -1 out of the second')).toBeNull();
  });
  it('rejects single-word replies', () => {
    expect(detect('factor')).toBeNull();
    expect(detect('yes')).toBeNull();
  });
  it('rejects "7 and -3" (the "and" is prose)', () => {
    expect(detect('7 and -3')).toBeNull();
  });

  // --- forms handled by other detectors ---
  it('rejects equations (handled by equation/final detectors)', () => {
    expect(detect('3x^2 + 4x - 7 = 0')).toBeNull();
    expect(detect('x = 1')).toBeNull();
  });
  it('rejects questions', () => {
    expect(detect('is it (x-1)(3x+7)?')).toBeNull();
  });

  // --- guards against trivial/degenerate input ---
  it('rejects a lone term with no multi-term/grouping structure', () => {
    expect(detect('3x^2')).toBeNull();
  });
  it('rejects pure numbers (no variable)', () => {
    expect(detect('3 + 4 - 7')).toBeNull();
  });
  it('rejects empty / overlong input', () => {
    expect(detect('')).toBeNull();
    expect(detect('x+'.repeat(100))).toBeNull();
  });
});
