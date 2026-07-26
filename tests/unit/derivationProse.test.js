/**
 * Prose detection for the derivation view. Word/geometry problems arrive as
 * \text{…} or natural-language sentences; KaTeX renders them as one
 * non-wrapping line that runs off the board. These must be detected as prose
 * (→ rendered as wrapping text), while real math must NOT be (→ KaTeX).
 */
const { looksLikeProse, unwrapText } = require('../../public/js/living-workspace/dom/derivationView.js');

describe('looksLikeProse', () => {
  it('flags \\text{…} wrappers and long natural-language sentences', () => {
    expect(looksLikeProse('\\text{Four less than twelve times a number, n, is 44.}')).toBe(true);
    expect(looksLikeProse('The triangle has legs of length 3 and 4; find the hypotenuse.')).toBe(true);
    expect(looksLikeProse('After how much time will the two cars be the same distance apart')).toBe(true);
  });

  it('does NOT flag real math (equations, short expressions)', () => {
    expect(looksLikeProse('4(x + 9) = 6x - 4')).toBe(false);
    expect(looksLikeProse('x = 20')).toBe(false);
    expect(looksLikeProse('\\frac{1}{5}m + 6 = 11')).toBe(false);
    expect(looksLikeProse('2x^2 + 5x - 3 = 0')).toBe(false);
    expect(looksLikeProse('|2b + 1| = 5')).toBe(false);
    // math with LaTeX command words (\quad, \Rightarrow, inline \text) is NOT prose
    expect(looksLikeProse('12n = 48 \\quad\\Rightarrow\\quad n = 4 \\text{ check}')).toBe(false);
  });

  it('does not flag short labels/fragments', () => {
    expect(looksLikeProse('Problem')).toBe(false);
    expect(looksLikeProse('distribute')).toBe(false);
    expect(looksLikeProse('')).toBe(false);
  });
});

describe('unwrapText', () => {
  it('extracts the sentence from a \\text{…} wrapper', () => {
    expect(unwrapText('\\text{Four less than twelve times a number is 44.}'))
      .toBe('Four less than twelve times a number is 44.');
  });
  it('collapses KaTeX spacing escapes and braces', () => {
    expect(unwrapText('\\text{Solve\\, for\\; d}')).toBe('Solve for d');
  });
  it('passes plain prose through unchanged', () => {
    expect(unwrapText('Find the height of the screen')).toBe('Find the height of the screen');
  });
});

// Production regression (owner screenshot, 2026-07-25): ratio poses like
// \frac{3 \text{ cups}}{2 \text{ batches}} were mis-detected as prose (the
// \text labels counted as words), routed down the inline-math splitter that
// can't handle their nested braces, and shipped raw "\frac3 cups2 batches"
// onto the rail. \text contents are math-mode labels — KaTeX's job.
describe('looksLikeProse × \\text labels', () => {
  const { looksLikeProse } = require('../../public/js/living-workspace/dom/derivationView.js');

  it('a ratio with \\text unit labels is MATH, not prose', () => {
    expect(looksLikeProse('\\frac{3 \\text{ cups}}{2 \\text{ batches}} = \\frac{x \\text{ cups}}{5 \\text{ batches}}')).toBe(false);
    expect(looksLikeProse('2 \\text{ batches of cookies}')).toBe(false);
  });

  it('a whole-sentence \\text{…} wrapper is still prose', () => {
    expect(looksLikeProse('\\text{Sarah bakes 3 batches of cookies every morning}')).toBe(true);
  });

  it('bare word-problem sentences (no \\text) are still prose', () => {
    expect(looksLikeProse('Sarah has 3 cups of flour and needs enough for 5 batches')).toBe(true);
  });
});
