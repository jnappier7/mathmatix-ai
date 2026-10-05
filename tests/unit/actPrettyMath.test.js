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
  return win.__actPrettyMath;
}
const pm = loadPrettyMath();

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
