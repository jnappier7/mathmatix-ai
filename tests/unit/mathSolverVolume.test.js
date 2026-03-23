/**
 * MATH SOLVER — Volume (rectangular prism & cylinder) tests
 */

const { detectMathProblem, processMathMessage } = require('../../utils/mathSolver');

describe('detectMathProblem — volume', () => {
  test('detects "volume of a rectangular prism length 8 width 5 height 6"', () => {
    const r = detectMathProblem('volume of a rectangular prism length 8 width 5 height 6');
    expect(r).not.toBeNull();
    expect(r.type).toBe('volume');
    expect(r.shape).toBe('rectangular_prism');
    expect(r.length).toBe(8);
    expect(r.width).toBe(5);
    expect(r.height).toBe(6);
  });

  test('detects "volume of a box length 10 width 4 height 3"', () => {
    const r = detectMathProblem('volume of a box length 10 width 4 height 3');
    expect(r).not.toBeNull();
    expect(r.type).toBe('volume');
    expect(r.shape).toBe('rectangular_prism');
  });

  test('detects "volume of a cylinder radius 3 height 10"', () => {
    const r = detectMathProblem('volume of a cylinder radius 3 height 10');
    expect(r).not.toBeNull();
    expect(r.type).toBe('volume');
    expect(r.shape).toBe('cylinder');
    expect(r.radius).toBe(3);
    expect(r.height).toBe(10);
  });

  test('detects "volume of cylinder r = 5 h = 8"', () => {
    const r = detectMathProblem('volume of cylinder r = 5 h = 8');
    expect(r).not.toBeNull();
    expect(r.type).toBe('volume');
    expect(r.shape).toBe('cylinder');
  });
});

describe('solveVolume — rectangular prism', () => {
  test('l=8, w=5, h=6 → 240', () => {
    const r = processMathMessage('volume of a rectangular prism length 8 width 5 height 6');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('240');
  });

  test('l=10, w=4, h=3 → 120', () => {
    const r = processMathMessage('volume of a box length 10 width 4 height 3');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('120');
  });

  test('l=2, w=3, h=4 → 24', () => {
    const r = processMathMessage('volume of rectangular prism length 2 width 3 height 4');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('24');
  });
});

describe('solveVolume — cylinder', () => {
  test('r=3, h=10 → 90π', () => {
    const r = processMathMessage('volume of a cylinder radius 3 height 10');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('90π');
  });

  test('r=5, h=8 → 200π', () => {
    const r = processMathMessage('volume of cylinder r = 5 h = 8');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('200π');
  });

  test('r=1, h=1 → 1π', () => {
    const r = processMathMessage('volume of a cylinder radius 1 height 1');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('1π');
  });
});
