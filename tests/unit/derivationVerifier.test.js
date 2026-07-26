const { verifyDerivation, splitWorkLines } = require('../../utils/derivationVerifier');

describe('derivationVerifier — follow multi-step reasoning', () => {
  test('validates a correct linear chain (the canonical case)', () => {
    const r = verifyDerivation('3x - 5 = 16\n3x = 21\nx = 7', '3x - 5 = 16');
    expect(r.verifiable).toBe(true);
    expect(r.valid).toBe(true);
    expect(r.finalAnswer).toBe('7');
    expect(r.firstBadStepIndex).toBe(-1);
  });

  test('validates a correct arithmetic (order-of-operations) chain', () => {
    const r = verifyDerivation('3 + 6*9 / 3 - 7\n3 + 54/3 - 7\n3 + 18 - 7\n14', '3 + 6*(5+4)/3 - 7');
    expect(r.valid).toBe(true);
    expect(r.finalAnswer).toBe('14');
  });

  test('pinpoints the FIRST broken step instead of failing the whole thing', () => {
    // Student subtracts 5 instead of adding it: 3x-5=16 -> 3x=11 is wrong.
    const r = verifyDerivation('3x - 5 = 16\n3x = 11\nx = 11/3', '3x - 5 = 16');
    expect(r.verifiable).toBe(true);
    expect(r.valid).toBe(false);
    expect(r.firstBadStep).toBe('3x = 11');
  });

  test('works with no posed problem — validates the chain internally', () => {
    const r = verifyDerivation('3x - 5 = 16\n3x = 21\nx = 7');
    expect(r.valid).toBe(true);
    expect(r.target).toBe('7');
  });

  test('a single line is not a derivation — defers to the normal path', () => {
    expect(verifyDerivation('x = 7', '3x - 5 = 16').verifiable).toBe(false);
  });

  test('strips step numbering / bullets when splitting work', () => {
    const lines = splitWorkLines('1) 3x - 5 = 16\n2) 3x = 21\n- x = 7');
    expect(lines).toEqual(['3x - 5 = 16', '3x = 21', 'x = 7']);
  });
});
