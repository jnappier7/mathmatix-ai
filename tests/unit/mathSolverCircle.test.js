/**
 * MATH SOLVER — Circle area and circumference tests
 */

const { detectMathProblem, processMathMessage } = require('../../utils/mathSolver');

describe('detectMathProblem — circle', () => {
  test('detects "area of a circle with radius 5"', () => {
    const r = detectMathProblem('area of a circle with radius 5');
    expect(r).not.toBeNull();
    expect(r.type).toBe('circle');
    expect(r.operation).toBe('area');
    expect(r.radius).toBe(5);
  });

  test('detects "circumference of a circle with radius 7"', () => {
    const r = detectMathProblem('circumference of a circle with radius 7');
    expect(r).not.toBeNull();
    expect(r.type).toBe('circle');
    expect(r.operation).toBe('circumference');
    expect(r.radius).toBe(7);
  });

  test('detects "area of circle with diameter 10" → radius 5', () => {
    const r = detectMathProblem('area of circle with diameter 10');
    expect(r).not.toBeNull();
    expect(r.type).toBe('circle');
    expect(r.operation).toBe('area');
    expect(r.radius).toBe(5);
  });

  test('detects "circumference of a circle with diameter 14" → radius 7', () => {
    const r = detectMathProblem('circumference of a circle with diameter 14');
    expect(r).not.toBeNull();
    expect(r.type).toBe('circle');
    expect(r.operation).toBe('circumference');
    expect(r.radius).toBe(7);
  });
});

describe('solveCircle — area', () => {
  test('radius 5 → 25π', () => {
    const r = processMathMessage('area of a circle with radius 5');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('25π');
  });

  test('radius 3 → 9π', () => {
    const r = processMathMessage('area of a circle with radius 3');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('9π');
  });

  test('diameter 10 → 25π', () => {
    const r = processMathMessage('area of circle with diameter 10');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('25π');
  });

  test('radius 1 → 1π', () => {
    const r = processMathMessage('area of a circle with radius 1');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('1π');
  });
});

describe('solveCircle — circumference', () => {
  test('radius 5 → 10π', () => {
    const r = processMathMessage('circumference of a circle with radius 5');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('10π');
  });

  test('radius 7 → 14π', () => {
    const r = processMathMessage('circumference of a circle with radius 7');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('14π');
  });

  test('diameter 14 → 14π', () => {
    const r = processMathMessage('circumference of a circle with diameter 14');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('14π');
  });
});
