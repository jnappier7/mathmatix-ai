/**
 * One notation on screen in the ACT runner (public/js/act-test.js prettyMath).
 *
 * The banks type math several ways — x^7 next to x⁷, log_2(2x), a hyphen as a
 * minus sign — which a full run of the public test called out as unpolished.
 * The runner normalizes what it DISPLAYS; grading, stored items and the
 * screen-reader labels keep the original text. Words with hyphens must survive.
 */
const fs = require('fs');
const path = require('path');

function loadPrettyMath() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'act-test.js'), 'utf8');
  const win = { addEventListener() {} };
  const doc = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} }, addEventListener() {} };
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'location', 'localStorage', src)(win, doc, { search: '' }, { getItem: () => null });
  return win;
}
const win = loadPrettyMath();
const pm = win.__actPrettyMath;
const stem = win.__actStemHtml;

test('exponents and subscripts display as super- and subscripts', () => {
  expect(pm('x^7 + 2x^-3')).toBe('x<sup>7</sup> + 2x<sup>−3</sup>');
  expect(pm('(x-3)^(2)')).toBe('(x−3)<sup>2</sup>');
  expect(pm('log_2(2x) = 5')).toBe('log<sub>2</sub>(2x) = 5');
  expect(pm('a_1 and a_n')).toBe('a<sub>1</sub> and a<sub>n</sub>');
});

test('a hyphen doing a minus sign\'s job becomes a minus sign', () => {
  expect(pm('Solve -3x - 4 = 8')).toBe('Solve −3x − 4 = 8');
  expect(pm('x-4')).toBe('x−4');
  expect(pm('3-4')).toBe('3−4');
});

test('hyphenated words are left alone', () => {
  expect(pm('x-axis, two-step, T-shirt, 20-sided, e-mail')).toBe('x-axis, two-step, T-shirt, 20-sided, e-mail');
});

// External audit 2026-10-05: exponent division and scientific-notation
// products showed unmatched parentheses. The bank text was balanced; the
// optional ")" in the superscript rule ate each group's closing paren.
test('a group that ends in an exponent keeps its closing paren', () => {
  expect(pm('(x^5)/(x^2)')).toBe('(x<sup>5</sup>)/(x<sup>2</sup>)');
  expect(pm('(2.4 × 10^6)(1.2 × 10^4)')).toBe('(2.4 × 10<sup>6</sup>)(1.2 × 10<sup>4</sup>)');
  expect(pm('(3a^2b)^3')).toBe('(3a<sup>2</sup>b)<sup>3</sup>');
});

test('every displayed stem and choice in a sample keeps its parens balanced', () => {
  const bal = (s) => {
    const t = s.replace(/<[^>]+>/g, '');
    let d = 0;
    for (const c of t) { if (c === '(') d++; if (c === ')' && --d < 0) return false; }
    return d === 0;
  };
  ['x^(2/3) · x^(1/2)', '(x^12)/(x^4)', '(4.5 × 10^-3)(2 × 10^8)', 'f(x) = (x - 1)^(2) + 3', '(2^3)^(4)']
    .forEach((s) => expect(bal(pm(s))).toBe(true));
});

test('pipe-separated lines in a stem render as a table', () => {
  const html = stem('The table below gives values of f.\n\nx | 2 | 4 | 6\nf(x) | 11 | 19 | 27\n\nWhat is f(10)?');
  expect(html).toBe(
    'The table below gives values of f.'
    + '<table class="actt-table"><thead><tr><th scope="col">x</th><th scope="col">2</th><th scope="col">4</th><th scope="col">6</th></tr></thead>'
    + '<tbody><tr><th scope="row">f(x)</th><td>11</td><td>19</td><td>27</td></tr></tbody></table>'
    + 'What is f(10)?');
});

test('absolute value bars and a lone pipe line are not tables', () => {
  expect(stem('Solve |2x - 5| = 9')).toBe('Solve |2x - 5| = 9');
  expect(stem('y = -2|x + 3| + 5\nWhich is true?')).toBe('y = -2|x + 3| + 5\nWhich is true?');
  expect(stem('a | b\nnext line')).toBe('a | b\nnext line');
});

test('fractional and variable exponents display whole', () => {
  expect(pm('x^(2/3) · x^(1/2)')).toBe('x<sup>2/3</sup> · x<sup>1/2</sup>');
  expect(pm('5^(2x) = 5^10')).toBe('5<sup>2x</sup> = 5<sup>10</sup>');
  expect(pm('2^x + e^-x')).toBe('2<sup>x</sup> + e<sup>−x</sup>');
  expect(pm('(x+1)^(n-1)')).toBe('(x+1)<sup>n−1</sup>');
});

// External audit 2026-10-07: "[[1, 3], [2, 0]]" with a note explaining the
// notation; a junior does not read that as a matrix. The runner draws grids.
describe('matrices display as bracketed grids', () => {
  const mx = win.__actMatrixHtml;
  const cells = (html) => [...html.matchAll(/<span>([^<]*)<\/span>/g)].map((m) => m[1]);

  test('[[a, b], [c, d]] becomes a 2×2 grid', () => {
    const h = mx('A = [[1, 3], [2, 0]] and B = [[4, −1], [2, 5]]');
    expect((h.match(/class="actt-mat"/g) || []).length).toBe(2);
    expect(cells(h)).toEqual(['1', '3', '2', '0', '4', '−1', '2', '5']);
    expect(h).not.toContain('[[');
  });

  test('[a b; c d] becomes a grid too', () => {
    const h = mx('A = [2 −1; 3 0]');
    expect(cells(h)).toEqual(['2', '−1', '3', '0']);
  });

  test('a determinant typed as |a b| lines becomes a barred grid', () => {
    const h = mx('What is the determinant of the matrix below?\n\n|5 −2|\n|3 4|');
    expect(h).toContain('actt-det');
    expect(cells(h)).toEqual(['5', '−2', '3', '4']);
  });

  test('the full display pipeline keeps the markup intact', () => {
    const h = stem(win.__actPrettyMath(mx('If A = [[3, −2], [1, 5]], what is 4A?')));
    expect(h).not.toMatch(/actt-nw/);           // keepMath never reached into the grid markup
    expect(h).toContain('aria-label="matrix, row 1: 3, −2; row 2: 1, 5"');
  });

  test('absolute value, intervals and lists are not matrices', () => {
    ['|x − 3| < 5', 'the interval [2, 5]', 'f(x) = |2x| + 1', 'choices [a; b]'].forEach((t) => expect(mx(t)).toBe(t));
  });
});
