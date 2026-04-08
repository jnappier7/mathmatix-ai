const { normalizeMathUnicode } = require('../../utils/mathUnicodeNormalizer');

describe('normalizeMathUnicode', () => {
  test('converts superscript digits to caret notation', () => {
    expect(normalizeMathUnicode('x²')).toBe('x^2');
    expect(normalizeMathUnicode('x³')).toBe('x^3');
    expect(normalizeMathUnicode('x⁴')).toBe('x^4');
    expect(normalizeMathUnicode('x⁰')).toBe('x^0');
    expect(normalizeMathUnicode('x⁹')).toBe('x^9');
  });

  test('converts Unicode minus and operators', () => {
    expect(normalizeMathUnicode('3x² − 5x')).toBe('3x^2 - 5x');
    expect(normalizeMathUnicode('2 × 3')).toBe('2 * 3');
    expect(normalizeMathUnicode('6 ÷ 2')).toBe('6 / 2');
    expect(normalizeMathUnicode('a ⋅ b')).toBe('a * b');
  });

  test('converts Unicode inequality symbols', () => {
    expect(normalizeMathUnicode('x ≤ 5')).toBe('x <= 5');
    expect(normalizeMathUnicode('x ≥ 3')).toBe('x >= 3');
  });

  test('converts Unicode fractions', () => {
    expect(normalizeMathUnicode('½')).toBe('(1/2)');
    expect(normalizeMathUnicode('¾')).toBe('(3/4)');
    expect(normalizeMathUnicode('⅓')).toBe('(1/3)');
  });

  test('converts Greek letters', () => {
    expect(normalizeMathUnicode('π')).toBe('pi');
    expect(normalizeMathUnicode('θ')).toBe('theta');
    expect(normalizeMathUnicode('∞')).toBe('Infinity');
  });

  test('converts LaTeX commands', () => {
    expect(normalizeMathUnicode('\\frac{3}{4}')).toBe('(3)/(4)');
    expect(normalizeMathUnicode('\\cdot')).toBe('*');
  });

  test('handles full polynomial with Unicode', () => {
    expect(normalizeMathUnicode('3x³ − 5x² + 2x − 7')).toBe('3x^3 - 5x^2 + 2x - 7');
  });

  test('handles null and empty input', () => {
    expect(normalizeMathUnicode(null)).toBe('');
    expect(normalizeMathUnicode(undefined)).toBe('');
    expect(normalizeMathUnicode('')).toBe('');
  });

  test('passes through plain ASCII unchanged', () => {
    expect(normalizeMathUnicode('3x^2 + 2x - 1')).toBe('3x^2 + 2x - 1');
  });

  test('handles mixed Unicode and ASCII', () => {
    expect(normalizeMathUnicode('x² + x^3 − 1')).toBe('x^2 + x^3 - 1');
  });
});
