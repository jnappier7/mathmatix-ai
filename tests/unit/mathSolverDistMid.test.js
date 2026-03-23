/**
 * MATH SOLVER — Distance and midpoint formula tests
 */

const { detectMathProblem, processMathMessage, verifyAnswer } = require('../../utils/mathSolver');

// ── Distance ──

describe('detectMathProblem — distance', () => {
  test('detects "distance between (1,2) and (4,6)"', () => {
    const r = detectMathProblem('distance between (1,2) and (4,6)');
    expect(r).not.toBeNull();
    expect(r.type).toBe('distance');
  });

  test('detects "find the distance from (0,0) to (3,4)"', () => {
    const r = detectMathProblem('find the distance from (0,0) to (3,4)');
    expect(r).not.toBeNull();
    expect(r.type).toBe('distance');
  });

  test('does NOT detect without "distance" keyword', () => {
    // Should not trigger distance for bare point pairs
    const r = detectMathProblem('slope between (0,0) and (3,4)');
    expect(r).not.toBeNull();
    expect(r.type).not.toBe('distance');
  });
});

describe('solveDistance', () => {
  test('(0,0) to (3,4) → 5', () => {
    const r = processMathMessage('distance between (0,0) and (3,4)');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('5');
  });

  test('(1,2) to (4,6) → 5', () => {
    const r = processMathMessage('distance between (1,2) and (4,6)');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('5');
  });

  test('(0,0) to (1,1) → √2', () => {
    const r = processMathMessage('distance between (0,0) and (1,1)');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('√2');
  });

  test('(0,0) to (0,5) → 5 (vertical)', () => {
    const r = processMathMessage('distance between (0,0) and (0,5)');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('5');
  });

  test('(1,1) to (4,5) → 5', () => {
    const r = processMathMessage('distance from (1,1) to (4,5)');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('5');
  });

  test('(0,0) to (2,2) → 2√2', () => {
    const r = processMathMessage('distance between (0,0) and (2,2)');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('2√2');
  });
});

// ── Midpoint ──

describe('detectMathProblem — midpoint', () => {
  test('detects "midpoint of (2,4) and (6,8)"', () => {
    const r = detectMathProblem('midpoint of (2,4) and (6,8)');
    expect(r).not.toBeNull();
    expect(r.type).toBe('midpoint');
  });

  test('detects "find the midpoint between (0,0) and (10,10)"', () => {
    const r = detectMathProblem('find the midpoint between (0,0) and (10,10)');
    expect(r).not.toBeNull();
    expect(r.type).toBe('midpoint');
  });
});

describe('solveMidpoint', () => {
  test('(2,4) and (6,8) → (4, 6)', () => {
    const r = processMathMessage('midpoint of (2,4) and (6,8)');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('(4, 6)');
  });

  test('(0,0) and (10,10) → (5, 5)', () => {
    const r = processMathMessage('midpoint between (0,0) and (10,10)');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('(5, 5)');
  });

  test('(1,3) and (5,7) → (3, 5)', () => {
    const r = processMathMessage('midpoint of (1,3) and (5,7)');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('(3, 5)');
  });

  test('(-2,4) and (6,-2) → (2, 1)', () => {
    const r = processMathMessage('midpoint of (-2,4) and (6,-2)');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('(2, 1)');
  });

  test('(1,2) and (4,5) → (2.5, 3.5)', () => {
    const r = processMathMessage('midpoint of (1,2) and (4,5)');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('(2.5, 3.5)');
  });
});
