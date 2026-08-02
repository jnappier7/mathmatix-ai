// tests/unit/mathTTS.test.js
// Locks in the spoken-math preprocessing that keeps a TTS engine from reading
// "80°" as "circ", "=" as "equal sign", and "-" as a bare pause.

const { cleanTextForTTS, convertLatexToSpeech } = require('../../utils/mathTTS');

describe('cleanTextForTTS — undelimited (bare) math', () => {
  test('degree symbol (unicode) → "degrees"', () => {
    expect(cleanTextForTTS('The angle is 80° wide')).toBe('The angle is 80 degrees wide');
  });

  test('LaTeX degrees leaking outside delimiters → "degrees" (^\\circ, ^{\\circ})', () => {
    expect(cleanTextForTTS('A right angle is 90^\\circ here')).toBe('A right angle is 90 degrees here');
    expect(cleanTextForTTS('It is 90^{\\circ} exactly')).toBe('It is 90 degrees exactly');
  });

  test('"=" is spoken as "equals", not "equal sign"', () => {
    expect(cleanTextForTTS('So A-B=34 here')).toBe('So A minus B equals 34 here');
  });

  test('"-" between operands is subtraction, not a pause', () => {
    expect(cleanTextForTTS('That gives 8 - 3 = 5')).toBe('That gives 8 minus 3 equals 5');
    expect(cleanTextForTTS('Compute A - B now')).toBe('Compute A minus B now');
  });

  test('a coefficient does not hide the subtraction: 2x-4', () => {
    expect(cleanTextForTTS('Solve 2x-4=3')).toBe('Solve 2x minus 4 equals 3');
    expect(cleanTextForTTS('Simplify 3y-7 and 2x-y')).toBe('Simplify 3y minus 7 and 2x minus y');
    expect(cleanTextForTTS('Factor 4a-(2b-1)')).toBe('Factor 4a minus (2b minus 1)');
  });

  test('a leading "-" is a negative sign', () => {
    expect(cleanTextForTTS('The value is -7 today')).toBe('The value is negative 7 today');
    expect(cleanTextForTTS('x = -5 works')).toBe('x equals negative 5 works');
  });

  // Regression guard: ordinary hyphenated words must NOT become "minus".
  test.each([
    ['Great, well-done on that!', 'Great, well-done on that!'],
    ['Try the x-ray problem', 'Try the x-ray problem'],
    ['Send an e-mail later', 'Send an e-mail later'],
    ['twenty-one apples', 'twenty-one apples'],
    ['Use a 3D-printed model', 'Use a 3D-printed model'],
    ['She got 1st-place today', 'She got 1st-place today'],
    ['The 5k-run is Saturday', 'The 5k-run is Saturday'],
  ])('word hyphen preserved: %s', (input, expected) => {
    expect(cleanTextForTTS(input)).toBe(expected);
  });
});

describe('convertLatexToSpeech — delimited math', () => {
  test('degrees', () => {
    expect(convertLatexToSpeech('45^\\circ')).toBe('45 degrees');
    expect(convertLatexToSpeech('90^{\\circ}')).toBe('90 degrees');
  });

  test('negative vs subtraction', () => {
    expect(convertLatexToSpeech('x = -5')).toBe('x equals negative 5');
    expect(convertLatexToSpeech('3x^2 + 2x - 5')).toBe('3x squared plus 2x minus 5');
  });
});

describe('cleanTextForTTS — numbered lists get a beat between items', () => {
  test('markdown list: each item is closed and its number labeled', () => {
    expect(cleanTextForTTS('Try these:\n1. 2x-4=3\n2. 8x-9=43\n3. x^2=4'))
      .toBe('Try these: Number one. 2x minus 4 equals 3. Number two. 8x minus 9 equals 43. Number three. x squared equals 4');
  });

  test('list written inline on one line', () => {
    expect(cleanTextForTTS('Try these: 1. First, 2. Second'))
      .toBe('Try these: Number one. First, Number two. Second');
  });

  test('items that already end in a period are not double-punctuated', () => {
    expect(cleanTextForTTS('Steps:\n1. Distribute the 2.\n2. Combine like terms.'))
      .toBe('Steps: Number one. Distribute the 2. Number two. Combine like terms.');
  });

  test('")" markers work too', () => {
    expect(cleanTextForTTS('1) First one\n2) Second one'))
      .toBe('Number one. First one. Number two. Second one');
  });

  // Regression guard: ordinary prose that merely contains "<digit>. " must not
  // be rewritten — only an ascending run of two or more markers is a list.
  test.each([
    ['Look at problem 3. It uses the same idea.', 'Look at problem 3. It uses the same idea.'],
    ['The answer is 7. That matches.', 'The answer is 7. That matches.'],
    ['Great work! 2. is the tricky one.', 'Great work! 2. is the tricky one.'],
    ['Do 4. Then do 4. again.', 'Do 4. Then do 4. again.'],
  ])('prose left alone: %s', (input, expected) => {
    expect(cleanTextForTTS(input)).toBe(expected);
  });
});

describe('formulas — spoken in word order, not symbol order', () => {
  // The reference case: the fraction bar has to be heard, which is what
  // "all over" does. Nested braces inside the numerator used to defeat the
  // \frac match entirely, running the numerator into the denominator.
  test('quadratic formula', () => {
    expect(cleanTextForTTS('$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$'))
      .toBe('x equals negative b, plus or minus the square root of b squared minus 4ac, all over 2a');
  });

  test('quadratic formula written without math delimiters', () => {
    expect(cleanTextForTTS('Use x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a} to solve.'))
      .toBe('Use x equals negative b, plus or minus the square root of b squared minus 4ac, all over 2a to solve.');
  });

  test('slope formula keeps its subscripts', () => {
    expect(cleanTextForTTS('$m = \\frac{y_2 - y_1}{x_2 - x_1}$'))
      .toBe('m equals y sub 2 minus y sub 1, all over x sub 2 minus x sub 1');
  });

  test('distance formula', () => {
    expect(cleanTextForTTS('$d = \\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$'))
      .toBe('d equals the square root of (x sub 2 minus x sub 1) squared plus (y sub 2 minus y sub 1) squared');
  });

  test('a lone term keeps "over"; only a built-up numerator gets "all over"', () => {
    expect(cleanTextForTTS('$\\frac{r}{n}$')).toBe('r over n');
    expect(cleanTextForTTS('$\\frac{a+b}{2}$')).toBe('a plus b, all over 2');
  });

  test('numeric fractions are named the way a teacher says them', () => {
    expect(cleanTextForTTS('$\\frac{1}{2}$')).toBe('one half');
    expect(cleanTextForTTS('$\\frac{3}{4}$ of the pie')).toBe('three fourths of the pie');
    expect(cleanTextForTTS('$A = \\frac{1}{2}bh$')).toBe('A equals one half bh');
    expect(cleanTextForTTS('$\\frac{-1}{2}$')).toBe('negative one half');
    // Past a tenth the name stops helping.
    expect(cleanTextForTTS('$\\frac{4}{13}$')).toBe('four over 13');
  });

  test('nested fractions resolve innermost first', () => {
    expect(cleanTextForTTS('$\\frac{\\frac{1}{2}}{3}$')).toBe('one half, all over 3');
  });

  test('roots: square, cube, nth', () => {
    expect(cleanTextForTTS('$\\sqrt{16}$')).toBe('the square root of 16');
    expect(cleanTextForTTS('$\\sqrt[3]{27} = 3$')).toBe('the cube root of 27 equals 3');
    expect(cleanTextForTTS('$\\sqrt[5]{32}$')).toBe('the fifth root of 32');
  });

  test('\\frac{d}{dx} is an operator, not a fraction', () => {
    expect(cleanTextForTTS('$\\frac{d}{dx}(x^2) = 2x$'))
      .toBe('the derivative with respect to x of (x squared) equals 2x');
  });

  // Regression: "{}" used to be stripped before the command strip, so an
  // unhandled command swallowed its own argument and the variable vanished.
  test('an unhandled command keeps its argument', () => {
    expect(cleanTextForTTS('$\\bar{x} = 5$')).toBe('x equals 5');
    expect(cleanTextForTTS('$\\text{slope} = 3$')).toBe('slope equals 3');
  });

  // Regression: markdown italics used to span two subscripts.
  test('underscore emphasis still works, and does not eat subscripts', () => {
    expect(cleanTextForTTS('That is _really_ close')).toBe('That is really close');
    expect(cleanTextForTTS('That is __very__ close')).toBe('That is very close');
    expect(cleanTextForTTS('Check user_id_field now')).toBe('Check user_id_field now');
  });

  test('a digit and a Greek letter do not run together', () => {
    expect(cleanTextForTTS('$C = 2\\pi r$')).toBe('C equals 2 pi r');
  });
});
