/**
 * The exact-rational evaluator — the single numeric engine that replaced the five
 * hand-rolled evaluators in mathSolver. These tests pin the core contract: exact
 * arithmetic (no floating-point drift), domain-aware formatting, and a clean null
 * for anything that isn't a pure numeric expression.
 */
const { evalExpression, expressionValue } = require('../../utils/rationalEvaluator');

const ans = (expr, mode) => { const r = evalExpression(expr, mode); return r ? r.answer : null; };

describe('rationalEvaluator — exact arithmetic', () => {
  test('integers and precedence', () => {
    expect(ans('15 + 27')).toBe('42');
    expect(ans('2+3*4')).toBe('14');
    expect(ans('(2+3)*4')).toBe('20');
    expect(ans('100 - 10 - 5')).toBe('85');
    expect(ans('2^3 * 4')).toBe('32');
    expect(ans('-34+6')).toBe('-28');
  });

  test('no floating-point error (the reason for BigInt rationals)', () => {
    expect(ans('0.1 + 0.2')).toBe('0.3');          // not 0.30000000000000004
    expect(ans('1/3 + 1/3 + 1/3')).toBe('1');       // not 0.9999...
  });

  test('fraction domain keeps exact fractions', () => {
    expect(ans('1/2 + 1/4')).toBe('3/4');
    expect(ans('3/4 * 2')).toBe('3/2');
    expect(ans('1/2 - 3/4')).toBe('-1/4');
    expect(ans('16/4')).toBe('4');
  });

  test('mixed-number domain', () => {
    expect(ans('12 2/3 - 4 1/4')).toBe('8 5/12');
    expect(ans('12⅔ - 4¼')).toBe('8 5/12');
    expect(ans('2 1/2 + 3')).toBe('5 1/2');
    expect(ans('1½ + 2¼')).toBe('3 3/4');
    expect(ans('2 1/4 - 3 1/2')).toBe('-1 1/4');
    expect(ans('1 1/2 + 1 1/2')).toBe('3');
  });

  test('decimal domain', () => {
    expect(ans('2.75 * 5')).toBe('13.75');
    expect(ans('2.5 + 1.5')).toBe('4');
  });

  test('mode override forces representation', () => {
    expect(ans('7/2', 'decimal')).toBe('3.5');
    expect(ans('7/2', 'fraction')).toBe('7/2');
    expect(ans('5/4', 'mixed')).toBe('1 1/4');
  });

  test('Unicode operators normalize through the engine', () => {
    expect(ans('16/4 ⋅ 2')).toBe('8');   // U+22C5 dot
    expect(ans('16 ÷ 4 × 2')).toBe('8');
    expect(ans('−34 + 6')).toBe('-28');  // U+2212 minus
  });

  test('returns null for non-numeric / malformed input (no fabrication)', () => {
    expect(evalExpression('x + 1')).toBeNull();
    expect(evalExpression('Solve 4x+3=27')).toBeNull();
    expect(evalExpression('(1+2')).toBeNull();
    expect(evalExpression('1/0')).toBeNull();
    expect(evalExpression('')).toBeNull();
    expect(evalExpression(null)).toBeNull();
  });
});

describe('expressionValue — numeric value for grading', () => {
  test('equivalent forms share a value', () => {
    expect(expressionValue('8 5/12')).toBeCloseTo(101 / 12, 6);
    expect(expressionValue('101/12')).toBeCloseTo(101 / 12, 6);
    expect(expressionValue('8.4167')).toBeCloseTo(8.4167, 4);
    expect(expressionValue('16/4 ⋅ 2')).toBe(8);
    expect(expressionValue('−28')).toBe(-28);
  });

  test('null for algebra or non-numeric', () => {
    expect(expressionValue('2x')).toBeNull();
    expect(expressionValue('hello')).toBeNull();
  });
});
