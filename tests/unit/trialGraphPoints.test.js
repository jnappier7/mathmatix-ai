// Unit tests for server-side plot-point generation (trial living board).
// Correctness matters: a wrong plot would violate the board's "never display
// wrong math" guarantee, so every y is evaluated by the vetted rational engine.

const { samplePoints, normalizeImplicitMult } = require('../../utils/trialGraphPoints');

// Evaluate a single x by sampling a 1-wide window at that x.
function yAt(fn, x) {
  const r = samplePoints(fn, { xMin: x, xMax: x + 1, steps: 1 });
  return r ? r.points[0] : null;
}

describe('samplePoints', () => {
  test('plots a line correctly', () => {
    expect(yAt('2x-5', 0)).toEqual([0, -5]);
    expect(yAt('2x-5', 1)).toEqual([1, -3]);
    expect(yAt('2x-5', 5)).toEqual([5, 5]);
  });

  test('plots a quadratic correctly (roots at ±2 for x^2-4)', () => {
    expect(yAt('x^2-4', 0)).toEqual([0, -4]);
    expect(yAt('x^2-4', 2)).toEqual([2, 0]);
    expect(yAt('x^2-4', -2)).toEqual([-2, 0]);
  });

  test('handles implicit multiplication', () => {
    expect(normalizeImplicitMult('3(x+1)')).toBe('3*(x+1)');
    expect(yAt('3(x+1)', 2)).toEqual([2, 9]);
  });

  test('tolerates a leading y= / f(x)=', () => {
    expect(yAt('y=2x-5', 3)).toEqual([3, 1]);
    expect(yAt('f(x)=x^2', 3)).toEqual([3, 9]);
  });

  test('gaps out asymptotes instead of drawing a spike', () => {
    expect(yAt('1/x', 0)).toBeNull(); // 1/0 → no point
    const r = samplePoints('1/x'); // still plottable away from 0
    expect(r).not.toBeNull();
    expect(r.points).toContain(null); // has a gap near the asymptote
  });

  test('fails SAFE on unsupported functions (returns null, never a guess)', () => {
    expect(samplePoints('sqrt(x)')).toBeNull();
    expect(samplePoints('sin(x)')).toBeNull();
    expect(samplePoints('')).toBeNull();
    expect(samplePoints(null)).toBeNull();
  });

  test('returns a usable range for a full sweep', () => {
    const r = samplePoints('x^2-4');
    expect(r.xMin).toBe(-10);
    expect(r.xMax).toBe(10);
    expect(r.yMin).toBeCloseTo(-4, 1);
    expect(r.points.length).toBe(101);
  });
});
