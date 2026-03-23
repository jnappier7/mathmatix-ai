/**
 * MATH SOLVER — Logarithm evaluation tests
 */

const { detectMathProblem, processMathMessage } = require('../../utils/mathSolver');

describe('detectMathProblem — logarithms', () => {
  test('detects "log base 2 of 8"', () => {
    const r = detectMathProblem('log base 2 of 8');
    expect(r).not.toBeNull();
    expect(r.type).toBe('logarithm');
    expect(r.base).toBe(2);
    expect(r.argument).toBe(8);
  });

  test('detects "log_10(1000)"', () => {
    const r = detectMathProblem('log_10(1000)');
    expect(r).not.toBeNull();
    expect(r.type).toBe('logarithm');
    expect(r.base).toBe(10);
  });

  test('detects "log(100)"', () => {
    const r = detectMathProblem('log(100)');
    expect(r).not.toBeNull();
    expect(r.type).toBe('logarithm');
    expect(r.base).toBe(10);
    expect(r.argument).toBe(100);
  });

  test('detects "ln(1)"', () => {
    const r = detectMathProblem('ln(1)');
    expect(r).not.toBeNull();
    expect(r.type).toBe('logarithm');
    expect(r.base).toBeCloseTo(Math.E);
  });
});

describe('solveLogarithm', () => {
  test('log₂(8) = 3', () => {
    const r = processMathMessage('log base 2 of 8');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('3');
  });

  test('log₁₀(1000) = 3', () => {
    const r = processMathMessage('log_10(1000)');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('3');
  });

  test('log₁₀(100) = 2', () => {
    const r = processMathMessage('log(100)');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('2');
  });

  test('log₂(16) = 4', () => {
    const r = processMathMessage('log base 2 of 16');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('4');
  });

  test('log₃(27) = 3', () => {
    const r = processMathMessage('log base 3 of 27');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('3');
  });

  test('log₅(125) = 3', () => {
    const r = processMathMessage('log base 5 of 125');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('3');
  });

  test('ln(1) = 0', () => {
    const r = processMathMessage('ln(1)');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('0');
  });

  test('log₂(1) = 0', () => {
    const r = processMathMessage('log base 2 of 1');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('0');
  });

  test('log₁₀(10) = 1', () => {
    const r = processMathMessage('log(10)');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('1');
  });
});
