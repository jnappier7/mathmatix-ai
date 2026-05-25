/**
 * graphTitleSync — keep graph card titles/captions in sync with fn.
 *
 * The bug this guards against: a [FUNCTION_GRAPH:fn=x^2,title="Graph
 * of y=x^2 + 4x - 12"] tag renders a y=x^2 parabola with the label
 * "Graph of y=x^2 + 4x - 12" — curve and label disagree on screen.
 *
 * The helper compares the math embedded in the title against fn and
 * replaces mismatches with the canonical "Graph of y = ${fn}".
 */

const {
  syncGraphTitle,
  syncGraphCaption,
  _extractMathFromTitle,
  _normalizeMath,
} = require('../../public/js/graphTitleSync');

describe('graphTitleSync — extractMathFromTitle', () => {
  test('pulls "x^2 + 4x - 12" out of "Graph of y=x^2 + 4x - 12"', () => {
    expect(_extractMathFromTitle('Graph of y=x^2 + 4x - 12')).toBe('x^2 + 4x - 12');
  });

  test('pulls expression with spaces around =', () => {
    expect(_extractMathFromTitle('Graph of y = x^2 - 4')).toBe('x^2 - 4');
  });

  test('handles f(x) = form', () => {
    expect(_extractMathFromTitle('Plot of f(x) = sin(x)')).toBe('sin(x)');
  });

  test('returns null for a purely descriptive title', () => {
    expect(_extractMathFromTitle('Quadratic Function')).toBeNull();
    expect(_extractMathFromTitle('Where it crosses zero')).toBeNull();
    expect(_extractMathFromTitle('Position, Velocity & Acceleration')).toBeNull();
  });

  test('returns null for empty / non-string input', () => {
    expect(_extractMathFromTitle('')).toBeNull();
    expect(_extractMathFromTitle(null)).toBeNull();
    expect(_extractMathFromTitle(undefined)).toBeNull();
    expect(_extractMathFromTitle(42)).toBeNull();
  });
});

describe('graphTitleSync — normalizeMath', () => {
  test('strips whitespace and lowercases', () => {
    expect(_normalizeMath('X^2 + 4X - 12')).toBe('x^2+4x-12');
  });

  test('folds ** to ^', () => {
    expect(_normalizeMath('x**2 + 4*x - 12')).toBe('x^2+4*x-12');
  });

  test('folds Unicode minus to ASCII -', () => {
    expect(_normalizeMath('x − 4')).toBe('x-4');     // U+2212
    expect(_normalizeMath('x – 4')).toBe('x-4');     // en dash
  });

  test('folds × and ⋅ to *', () => {
    expect(_normalizeMath('2×x')).toBe('2*x');
    expect(_normalizeMath('2⋅x')).toBe('2*x');
  });

  test('folds ² and ³ to ^2 and ^3', () => {
    expect(_normalizeMath('x²')).toBe('x^2');
    expect(_normalizeMath('x³')).toBe('x^3');
  });

  test('empty / non-string returns empty', () => {
    expect(_normalizeMath('')).toBe('');
    expect(_normalizeMath(null)).toBe('');
    expect(_normalizeMath(undefined)).toBe('');
  });
});

describe('graphTitleSync — syncGraphTitle (the bug)', () => {
  test('the failing case: fn="x^2" + title="Graph of y=x^2 + 4x - 12" → canonical override', () => {
    expect(syncGraphTitle('Graph of y=x^2 + 4x - 12', 'x^2')).toBe('Graph of y = x^2');
  });

  test('matching title passes through verbatim (no normalization on output)', () => {
    expect(syncGraphTitle('Graph of y = x^2', 'x^2')).toBe('Graph of y = x^2');
  });

  test('match through whitespace/case differences passes through', () => {
    expect(syncGraphTitle('Graph of Y=X^2', 'x^2')).toBe('Graph of Y=X^2');
  });

  test('descriptive-only title passes through unchanged', () => {
    expect(syncGraphTitle('Quadratic crossing zero', 'x^2 - 4')).toBe('Quadratic crossing zero');
    expect(syncGraphTitle('Position, Velocity & Acceleration', '4*x^3-6*x^2+2*x')).toBe('Position, Velocity & Acceleration');
  });

  test('missing title falls back to canonical', () => {
    expect(syncGraphTitle('', 'x^2 + 4x - 12')).toBe('Graph of y = x^2 + 4x - 12');
    expect(syncGraphTitle(null, 'x^2 + 4x - 12')).toBe('Graph of y = x^2 + 4x - 12');
    expect(syncGraphTitle(undefined, 'x^2 + 4x - 12')).toBe('Graph of y = x^2 + 4x - 12');
  });

  test('Unicode-equivalent forms match', () => {
    // Title uses ² unicode, fn uses ^2 — same math, should pass through.
    expect(syncGraphTitle('Graph of y = x²', 'x^2')).toBe('Graph of y = x²');
  });

  test('missing fn returns title unchanged (no anchor)', () => {
    expect(syncGraphTitle('Some title', '')).toBe('Some title');
    expect(syncGraphTitle('Some title', null)).toBe('Some title');
  });
});

describe('graphTitleSync — syncGraphCaption', () => {
  test('drops a mismatched caption (returns null)', () => {
    expect(syncGraphCaption('y = x^2 + 4x - 12', 'x^2')).toBeNull();
  });

  test('keeps a matching caption', () => {
    expect(syncGraphCaption('y = x^2 - 4', 'x^2 - 4')).toBe('y = x^2 - 4');
  });

  test('keeps a descriptive caption', () => {
    expect(syncGraphCaption('Where it crosses zero', 'x^2 - 4')).toBe('Where it crosses zero');
  });

  test('missing caption returns null', () => {
    expect(syncGraphCaption('', 'x^2')).toBeNull();
    expect(syncGraphCaption(null, 'x^2')).toBeNull();
  });

  test('missing fn returns caption unchanged', () => {
    expect(syncGraphCaption('y = x^2', '')).toBe('y = x^2');
  });
});
