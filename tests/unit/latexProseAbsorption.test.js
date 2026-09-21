/**
 * "0.8 is 108 or 54." (ACT bootcamp transcript, owner screenshot, 2026-09-21).
 *
 * The tutor wrote plain, correct prose:
 *
 *   "0.8 is \frac{8}{10} or \frac{4}{5}."
 *   "So \frac{125}{100} is the same as 1.25."
 *
 * normalizeLatex step 4 wraps a bare \command and the math following it in
 * \( … \). Its tail ended with a character-at-a-time catch-all,
 * `[0-9a-zA-Z_^{}()\s](?![a-zA-Z]{3})`, whose only brake was a lookahead for
 * three consecutive letters. Short words slipped through it one letter at a
 * time, so the scan walked out of the expression and into the sentence:
 *
 *   "0.8 is \(\frac{8}{10} or \frac{4}{5}\)."
 *   "So \(\frac{125}{100} is the\) same as 1.25."
 *
 * KaTeX discards spaces in math mode, so the absorbed English arrived on the
 * student's screen as "108or54" and "100123isthe". (The digits also reverse
 * when a rendered fraction is copied as text: KaTeX lays a \frac out
 * denominator-first in the DOM. That part is a copy artifact; the glued words
 * are real and visible.)
 *
 * The catch-all had no '.' either, so it stopped inside decimals and closed
 * the delimiter mid-number: "\frac{1}{2} of x is 0.5x" became
 * "\(\frac{1}{2} of x is 0\).5x".
 *
 * The tail now admits only self-delimiting math atoms, so the scan stops at
 * the first real word rather than guessing where the math ends.
 */
const { normalizeLatex } = require('../../utils/pipeline/verify');

describe('prose is never pulled inside the math delimiters', () => {
  test('the production line: "0.8 is \\frac{8}{10} or \\frac{4}{5}."', () => {
    const out = normalizeLatex('0.8 is \\frac{8}{10} or \\frac{4}{5}.');
    expect(out).toBe('0.8 is \\(\\frac{8}{10}\\) or \\(\\frac{4}{5}\\).');
    // The word that got eaten must sit outside every math block.
    expect(out).not.toMatch(/\\\([^)]*\bor\b/);
  });

  test('the production line: "So \\frac{125}{100} is the same as 1.25."', () => {
    const out = normalizeLatex('So \\frac{125}{100} is the same as 1.25.');
    expect(out).toBe('So \\(\\frac{125}{100}\\) is the same as 1.25.');
    expect(out).toContain('is the same as');
  });

  test.each([
    ['Remember \\frac{1}{2} of x is 0.5x.', 'Remember \\(\\frac{1}{2}\\) of x is 0.5x.'],
    ['That is \\frac{3}{4} of the total.', 'That is \\(\\frac{3}{4}\\) of the total.'],
    ['We get \\sqrt{16} is 4 and that is it.', 'We get \\(\\sqrt{16}\\) is 4 and that is it.'],
  ])('%s', (input, expected) => {
    expect(normalizeLatex(input)).toBe(expected);
  });

  test('a decimal is never split across the closing delimiter', () => {
    const out = normalizeLatex('Remember \\frac{1}{2} of x is 0.5x.');
    expect(out).not.toMatch(/0\\\)\.5/);
    expect(out).toContain('0.5x');
  });

  test('a trailing period or comma belongs to the sentence, not the formula', () => {
    expect(normalizeLatex('The answer is \\frac{22}{7}.')).toBe('The answer is \\(\\frac{22}{7}\\).');
    expect(normalizeLatex('Try \\frac{1}{2}, then \\frac{1}{3}.'))
      .toBe('Try \\(\\frac{1}{2}\\), then \\(\\frac{1}{3}\\).');
  });
});

describe('real expressions are still wrapped whole', () => {
  test.each([
    // the two cases the function\'s own comment documents
    ['\\frac{3}{4} + \\frac{1}{4} = 1', '\\(\\frac{3}{4} + \\frac{1}{4} = 1\\)'],
    ['\\lim_{x \\to 2} (3x+1) = 7', '\\(\\lim_{x \\to 2} (3x+1) = 7\\)'],
    ['\\sqrt{x^2 + y^2} = 5', '\\(\\sqrt{x^2 + y^2} = 5\\)'],
    ['\\frac{1}{2} = 0.5', '\\(\\frac{1}{2} = 0.5\\)'],
  ])('%s', (input, expected) => {
    expect(normalizeLatex(input)).toBe(expected);
  });

  test('a lone variable still joins its expression, a word never does', () => {
    expect(normalizeLatex('\\frac{1}{2} x = 4')).toBe('\\(\\frac{1}{2} x = 4\\)');
    expect(normalizeLatex('\\frac{1}{2} of 4')).toBe('\\(\\frac{1}{2}\\) of 4');
  });

  test('already-delimited math is left alone', () => {
    const wrapped = '\\(\\frac{1}{2}\\) already wrapped';
    expect(normalizeLatex(wrapped)).toBe(wrapped);
  });
});
