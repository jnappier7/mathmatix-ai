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
