/**
 * MATH SOLVER — Systems of equations tests
 */

const {
  detectMathProblem,
  solveProblem,
  verifyAnswer,
  processMathMessage,
  parseSystemEquation,
} = require('../../utils/mathSolver');

// ── Detection ──

describe('detectMathProblem — systems of equations', () => {
  test('detects "2x + y = 5 and x - y = 1"', () => {
    const result = detectMathProblem('2x + y = 5 and x - y = 1');
    expect(result).not.toBeNull();
    expect(result.type).toBe('system_of_equations');
  });

  test('detects comma-separated: "2x + y = 5, x - y = 1"', () => {
    const result = detectMathProblem('2x + y = 5, x - y = 1');
    expect(result).not.toBeNull();
    expect(result.type).toBe('system_of_equations');
  });

  test('detects "solve the system: 3x + 2y = 12, x - y = 1"', () => {
    const result = detectMathProblem('solve the system: 3x + 2y = 12, x - y = 1');
    expect(result).not.toBeNull();
    expect(result.type).toBe('system_of_equations');
  });

  test('detects semicolon-separated: "x + y = 10; x - y = 4"', () => {
    const result = detectMathProblem('x + y = 10; x - y = 4');
    expect(result).not.toBeNull();
    expect(result.type).toBe('system_of_equations');
  });

  test('detects "solve the equations: 2x + 3y = 7 and x + y = 3"', () => {
    const result = detectMathProblem('solve the equations: 2x + 3y = 7 and x + y = 3');
    expect(result).not.toBeNull();
    expect(result.type).toBe('system_of_equations');
  });

  test('does NOT detect single equation as system', () => {
    const result = detectMathProblem('2x + 3 = 7');
    expect(result).not.toBeNull();
    expect(result.type).not.toBe('system_of_equations');
  });
});

// ── parseSystemEquation ──

describe('parseSystemEquation', () => {
  test('parses "2x + y = 5" → {xCoeff:2, yCoeff:1, constant:5}', () => {
    const result = parseSystemEquation('2x + y = 5');
    expect(result).toEqual({ xCoeff: 2, yCoeff: 1, constant: 5 });
  });

  test('parses "x - y = 1" → {xCoeff:1, yCoeff:-1, constant:1}', () => {
    const result = parseSystemEquation('x - y = 1');
    expect(result).toEqual({ xCoeff: 1, yCoeff: -1, constant: 1 });
  });

  test('parses "3x + 2y = 12"', () => {
    const result = parseSystemEquation('3x + 2y = 12');
    expect(result).toEqual({ xCoeff: 3, yCoeff: 2, constant: 12 });
  });

  test('parses "y = 2x + 3" → {xCoeff:-2, yCoeff:1, constant:3}', () => {
    const result = parseSystemEquation('y = 2x + 3');
    expect(result).toEqual({ xCoeff: -2, yCoeff: 1, constant: 3 });
  });

  test('parses "-x + 4y = 7"', () => {
    const result = parseSystemEquation('-x + 4y = 7');
    expect(result).toEqual({ xCoeff: -1, yCoeff: 4, constant: 7 });
  });
});

// ── Solving ──

describe('solveSystem', () => {
  test('solves 2x + y = 5 and x - y = 1 → x=2, y=1', () => {
    const result = processMathMessage('2x + y = 5 and x - y = 1');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toContain('x = 2');
    expect(result.solution.answer).toContain('y = 1');
  });

  test('solves x + y = 10 and x - y = 4 → x=7, y=3', () => {
    const result = processMathMessage('x + y = 10 and x - y = 4');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toContain('x = 7');
    expect(result.solution.answer).toContain('y = 3');
  });

  test('solves 3x + 2y = 12 and x - y = 1 → x=2.8, y=1.8', () => {
    const result = processMathMessage('3x + 2y = 12, x - y = 1');
    expect(result.solution.success).toBe(true);
    // 3x + 2y = 12 and x - y = 1 → x = 14/5 = 2.8, y = 9/5 = 1.8
    expect(result.solution.answer).toContain('x = 2.8');
    expect(result.solution.answer).toContain('y = 1.8');
  });

  test('solves 2x + 3y = 7 and x + y = 3 → x=2, y=1', () => {
    const result = processMathMessage('2x + 3y = 7 and x + y = 3');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toContain('x = 2');
    expect(result.solution.answer).toContain('y = 1');
  });

  test('detects parallel (no solution): x + y = 5 and x + y = 7', () => {
    const result = processMathMessage('x + y = 5 and x + y = 7');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toMatch(/no solution/i);
  });

  test('detects dependent (infinite solutions): x + y = 5 and 2x + 2y = 10', () => {
    const result = processMathMessage('x + y = 5 and 2x + 2y = 10');
    expect(result.solution.success).toBe(true);
    expect(result.solution.answer).toMatch(/infinitely many/i);
  });
});

// ── Answer verification for systems ──

describe('verifyAnswer — system solutions', () => {
  test('"x = 2, y = 1" matches "x = 2, y = 1"', () => {
    expect(verifyAnswer('x = 2, y = 1', 'x = 2, y = 1').isCorrect).toBe(true);
  });

  test('"y = 1, x = 2" matches "x = 2, y = 1" (order independent)', () => {
    expect(verifyAnswer('y = 1, x = 2', 'x = 2, y = 1').isCorrect).toBe(true);
  });

  test('"x=7 and y=3" matches "x = 7, y = 3"', () => {
    expect(verifyAnswer('x=7 and y=3', 'x = 7, y = 3').isCorrect).toBe(true);
  });

  test('"x = 3, y = 2" does NOT match "x = 2, y = 1"', () => {
    expect(verifyAnswer('x = 3, y = 2', 'x = 2, y = 1').isCorrect).toBe(false);
  });
});
