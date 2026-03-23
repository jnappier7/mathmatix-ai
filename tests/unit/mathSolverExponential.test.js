/**
 * MATH SOLVER — Exponential equation tests
 */

const { detectMathProblem, processMathMessage } = require('../../utils/mathSolver');

describe('detectMathProblem — exponential equations', () => {
  test('detects "2^x = 8"', () => {
    const r = detectMathProblem('2^x = 8');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
    expect(r.base).toBe(2);
    expect(r.result).toBe(8);
  });

  test('detects "3^x = 81"', () => {
    const r = detectMathProblem('3^x = 81');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
  });

  test('detects "5^x = 125"', () => {
    const r = detectMathProblem('5^x = 125');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
  });

  test('detects "solve 10^x = 10000"', () => {
    const r = detectMathProblem('solve 10^x = 10000');
    expect(r).not.toBeNull();
    expect(r.type).toBe('exponential_equation');
  });
});

describe('solveExponentialEquation', () => {
  test('2^x = 8 → x = 3', () => {
    const r = processMathMessage('2^x = 8');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('3');
  });

  test('3^x = 81 → x = 4', () => {
    const r = processMathMessage('3^x = 81');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('4');
  });

  test('5^x = 125 → x = 3', () => {
    const r = processMathMessage('5^x = 125');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('3');
  });

  test('10^x = 10000 → x = 4', () => {
    const r = processMathMessage('10^x = 10000');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('4');
  });

  test('2^x = 32 → x = 5', () => {
    const r = processMathMessage('2^x = 32');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('5');
  });

  test('4^x = 16 → x = 2', () => {
    const r = processMathMessage('4^x = 16');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('2');
  });

  test('2^x = 1 → x = 0', () => {
    const r = processMathMessage('2^x = 1');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('0');
  });
});
