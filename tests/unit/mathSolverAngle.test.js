/**
 * MATH SOLVER — Angle conversion tests (degrees ↔ radians)
 */

const { detectMathProblem, processMathMessage } = require('../../utils/mathSolver');

describe('detectMathProblem — angle conversion', () => {
  test('detects "convert 180 degrees to radians"', () => {
    const r = detectMathProblem('convert 180 degrees to radians');
    expect(r).not.toBeNull();
    expect(r.type).toBe('angle_conversion');
    expect(r.direction).toBe('deg_to_rad');
    expect(r.value).toBe(180);
  });

  test('detects "45 degrees in radians"', () => {
    const r = detectMathProblem('45 degrees in radians');
    expect(r).not.toBeNull();
    expect(r.type).toBe('angle_conversion');
    expect(r.direction).toBe('deg_to_rad');
  });

  test('detects "convert π/4 to degrees"', () => {
    const r = detectMathProblem('convert π/4 to degrees');
    expect(r).not.toBeNull();
    expect(r.type).toBe('angle_conversion');
    expect(r.direction).toBe('rad_to_deg');
  });

  test('detects "2π/3 radians to degrees"', () => {
    const r = detectMathProblem('2π/3 radians to degrees');
    expect(r).not.toBeNull();
    expect(r.type).toBe('angle_conversion');
    expect(r.direction).toBe('rad_to_deg');
    expect(r.piCoeff).toBe(2);
    expect(r.divisor).toBe(3);
  });

  test('detects "convert 1.5 radians to degrees"', () => {
    const r = detectMathProblem('convert 1.5 radians to degrees');
    expect(r).not.toBeNull();
    expect(r.type).toBe('angle_conversion');
    expect(r.direction).toBe('num_rad_to_deg');
  });
});

describe('solveAngleConversion — degrees to radians', () => {
  test('180° → π', () => {
    const r = processMathMessage('convert 180 degrees to radians');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('π');
  });

  test('90° → π/2', () => {
    const r = processMathMessage('convert 90 degrees to radians');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('π/2');
  });

  test('45° → π/4', () => {
    const r = processMathMessage('45 degrees to radians');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('π/4');
  });

  test('60° → π/3', () => {
    const r = processMathMessage('60 degrees in radians');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('π/3');
  });

  test('360° → 2π', () => {
    const r = processMathMessage('convert 360 degrees to radians');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('2π');
  });

  test('30° → π/6', () => {
    const r = processMathMessage('30 degrees to radians');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('π/6');
  });

  test('120° → 2π/3', () => {
    const r = processMathMessage('120 degrees to radians');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('2π/3');
  });

  test('270° → 3π/2', () => {
    const r = processMathMessage('convert 270 degrees to radians');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('3π/2');
  });
});

describe('solveAngleConversion — radians to degrees', () => {
  test('π → 180°', () => {
    const r = processMathMessage('convert π to degrees');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('180°');
  });

  test('π/4 → 45°', () => {
    const r = processMathMessage('convert π/4 to degrees');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('45°');
  });

  test('2π/3 → 120°', () => {
    const r = processMathMessage('2π/3 radians to degrees');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('120°');
  });

  test('3π/2 → 270°', () => {
    const r = processMathMessage('3π/2 to degrees');
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('270°');
  });
});
