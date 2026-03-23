/**
 * MATH SOLVER — Slope calculation tests
 */

const {
  detectMathProblem,
  processMathMessage,
  verifyAnswer,
} = require('../../utils/mathSolver');

// ── Detection ──

describe('detectMathProblem — slope', () => {
  test('detects "find the slope through (1,2) and (3,6)"', () => {
    const result = detectMathProblem('find the slope through (1,2) and (3,6)');
    expect(result).not.toBeNull();
    expect(result.type).toBe('slope');
    expect(result.x1).toBe(1);
    expect(result.y1).toBe(2);
    expect(result.x2).toBe(3);
    expect(result.y2).toBe(6);
  });

  test('detects "what is the slope between (0,0) and (4,8)"', () => {
    const result = detectMathProblem('what is the slope between (0,0) and (4,8)');
    expect(result).not.toBeNull();
    expect(result.type).toBe('slope');
  });

  test('detects "slope of the line through (-1,3) and (2,-4)"', () => {
    const result = detectMathProblem('slope of the line through (-1,3) and (2,-4)');
    expect(result).not.toBeNull();
    expect(result.type).toBe('slope');
    expect(result.x1).toBe(-1);
    expect(result.y1).toBe(3);
    expect(result.x2).toBe(2);
    expect(result.y2).toBe(-4);
  });

  test('detects "find the slope: (2,5) to (6,13)"', () => {
    const result = detectMathProblem('find the slope: (2,5) to (6,13)');
    expect(result).not.toBeNull();
    expect(result.type).toBe('slope');
  });
});

// ── Solving ──

describe('solveSlope', () => {
  test('(1,2) and (3,6) → slope = 2', () => {
    const result = processMathMessage('find the slope through (1,2) and (3,6)');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('2');
  });

  test('(0,0) and (4,8) → slope = 2', () => {
    const result = processMathMessage('slope between (0,0) and (4,8)');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('2');
  });

  test('(-1,3) and (2,-4) → slope = -7/3', () => {
    const result = processMathMessage('slope through (-1,3) and (2,-4)');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('-7/3');
  });

  test('(2,5) and (6,13) → slope = 2', () => {
    const result = processMathMessage('slope: (2,5) to (6,13)');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('2');
  });

  test('(0,0) and (3,1) → slope = 1/3', () => {
    const result = processMathMessage('slope through (0,0) and (3,1)');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('1/3');
  });

  test('(1,4) and (1,8) → undefined (vertical)', () => {
    const result = processMathMessage('slope through (1,4) and (1,8)');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('undefined');
  });

  test('(2,5) and (6,5) → slope = 0 (horizontal)', () => {
    const result = processMathMessage('slope through (2,5) and (6,5)');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('0');
  });

  test('negative slope: (0,4) and (2,0) → slope = -2', () => {
    const result = processMathMessage('slope through (0,4) and (2,0)');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toBe('-2');
  });
});

// ── Verification ──

describe('verifyAnswer — slope answers', () => {
  test('"2" matches "2"', () => {
    expect(verifyAnswer('2', '2').isCorrect).toBe(true);
  });

  test('"1/3" matches "1/3"', () => {
    expect(verifyAnswer('1/3', '1/3').isCorrect).toBe(true);
  });

  test('"-7/3" matches "-7/3"', () => {
    expect(verifyAnswer('-7/3', '-7/3').isCorrect).toBe(true);
  });
});
