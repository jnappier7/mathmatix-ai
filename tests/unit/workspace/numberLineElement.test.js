'use strict';
/* Living Workspace P13 — number-line element, pure geometry. */
const NL = require('../../../public/js/living-workspace/dom/numberLineElement');

describe('valueToX / xToValue — inverse mapping', () => {
  const min = -5, max = 5, W = 320, PAD = 24;
  test('endpoints land on the padded axis ends', () => {
    expect(NL.valueToX(min, min, max, W)).toBeCloseTo(PAD);
    expect(NL.valueToX(max, min, max, W)).toBeCloseTo(W - PAD);
  });
  test('midpoint is centered', () => {
    expect(NL.valueToX(0, min, max, W)).toBeCloseTo(W / 2);
  });
  test('xToValue inverts valueToX', () => {
    for (const v of [-5, -2, 0, 3, 5]) {
      const x = NL.valueToX(v, min, max, W);
      expect(NL.xToValue(x, min, max, W)).toBeCloseTo(v);
    }
  });
});

describe('snap — nearest step, clamped', () => {
  test('snaps to the nearest integer step', () => {
    expect(NL.snap(2.3, -5, 5, 1)).toBe(2);
    expect(NL.snap(2.7, -5, 5, 1)).toBe(3);
    expect(NL.snap(-1.5, -5, 5, 1)).toBe(-1); // Math.round(-1.5) = -1
  });
  test('respects a non-unit step', () => {
    expect(NL.snap(1.2, 0, 10, 0.5)).toBe(1);
    expect(NL.snap(1.3, 0, 10, 0.5)).toBe(1.5);
  });
  test('clamps outside the domain', () => {
    expect(NL.snap(99, -5, 5, 1)).toBe(5);
    expect(NL.snap(-99, -5, 5, 1)).toBe(-5);
  });
});
