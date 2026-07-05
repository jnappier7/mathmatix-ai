const { normalizeMathUnicode, normalizeMathOperators, OPERATOR_MAP } = require('../../utils/mathUnicodeNormalizer');

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

// ============================================================================
// normalizeMathOperators — the operator/sign source of truth for the math engine
// ============================================================================
//
// This is the layer the regex-based math engine (mathSolver) depends on. The
// recurring class of "tutor rejected a correct answer" bugs all traced to a
// Unicode operator/sign that wasn't mapped to ASCII (U+22C5 dot, U+2212 minus).
// This suite enumerates the ENTIRE map so a new missing variant can never ship
// silently, and pins the invariants mathSolver relies on.
describe('normalizeMathOperators — exhaustive operator/sign coverage', () => {
  test('EVERY entry in OPERATOR_MAP normalizes to its ASCII target in context', () => {
    // Guarantee: whatever operators exist in the single source of truth, the
    // focused normalizer applies all of them. Adding a glyph to OPERATOR_MAP
    // automatically extends this guarantee to every mathSolver call site.
    for (const [glyph, ascii] of Object.entries(OPERATOR_MAP)) {
      expect(normalizeMathOperators(`3 ${glyph} 4`)).toBe(`3 ${ascii} 4`);
    }
  });

  test('normalizes minus-sign family to ASCII "-" (NOT en/em dash)', () => {
    expect(normalizeMathOperators('−34+6')).toBe('-34+6'); // U+2212
    expect(normalizeMathOperators('－5')).toBe('-5');       // U+FF0D fullwidth
    expect(normalizeMathOperators('﹣5')).toBe('-5');       // U+FE63 small
  });

  test('normalizes all multiplication and division glyphs', () => {
    expect(normalizeMathOperators('2 × 3 ⋅ 4 ∙ 5 · 6 ∗ 7')).toBe('2 * 3 * 4 * 5 * 6 * 7');
    expect(normalizeMathOperators('8 ÷ 2 ∕ 2 ／ 2')).toBe('8 / 2 / 2 / 2');
  });

  test('normalizes fullwidth plus and equals', () => {
    expect(normalizeMathOperators('2＋3＝5')).toBe('2+3=5');
  });

  test('LEAVES en dash and em dash alone (prose, not math)', () => {
    expect(normalizeMathOperators('pages 3–5')).toBe('pages 3–5');       // en dash
    expect(normalizeMathOperators("$x$ — next step?")).toBe("$x$ — next step?"); // em dash
  });

  test('does NOT rewrite vulgar fractions or superscripts (mathSolver owns those)', () => {
    expect(normalizeMathOperators('½ + ¼')).toBe('½ + ¼');
    expect(normalizeMathOperators('x²')).toBe('x²');
  });

  test('is idempotent and safe on empty/nullish input', () => {
    expect(normalizeMathOperators(normalizeMathOperators('−34+6'))).toBe('-34+6');
    expect(normalizeMathOperators(null)).toBe('');
    expect(normalizeMathOperators('')).toBe('');
  });
});
