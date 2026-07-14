'use strict';
/* Living Workspace P14 — graph element, pure geometry. */
const G = require('../../../public/js/living-workspace/dom/graphElement');

describe('sampleCurve', () => {
  test('samples the evaluator across the domain, marks undefined as null', () => {
    const pts = G.sampleCurve((x) => x, -2, 2, 4);
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual({ x: -2, y: -2 });
    expect(pts[4]).toEqual({ x: 2, y: 2 });
  });
  test('non-finite results become null (asymptote / undefined)', () => {
    const pts = G.sampleCurve((x) => (x === 0 ? Infinity : 1 / x), -1, 1, 2);
    expect(pts.find((p) => p.x === 0).y).toBeNull();
  });
});

describe('fitYWindow — frames features, not exploding tails', () => {
  test('parabola x^2-4x+3 frames near the vertex, not [-40,160]', () => {
    const f = (x) => x * x - 4 * x + 3;
    const w = G.fitYWindow(G.sampleCurve(f, -6, 10, 240));
    expect(w.yMin).toBeGreaterThan(-8);
    expect(w.yMax).toBeLessThan(12);
    expect(w.yMin).toBeLessThan(-1); // vertex at y=-1 is inside
  });
  test('a line keeps the global envelope (no turning points)', () => {
    const w = G.fitYWindow(G.sampleCurve((x) => x, -10, 10, 100));
    expect(w.yMin).toBeLessThan(-9);
    expect(w.yMax).toBeGreaterThan(9);
  });
});

describe('coordinate mapping is invertible', () => {
  test('xToPx / pxToX round-trip', () => {
    for (const x of [-6, -2, 0, 3, 6]) {
      expect(G.pxToX(G.xToPx(x, -6, 6), -6, 6)).toBeCloseTo(x);
    }
  });
});
