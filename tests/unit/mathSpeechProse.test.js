/**
 * Spoken-prose math normalization for the voice channel (owner report,
 * 2026-07-29): "=" was read as "equal sign" and variable products like
 * "ax" / "Ax" were pronounced as the word "axe". The voice tutor path
 * (voiceSession → Cartesia) never ran any math-speech cleanup — these
 * cover the new speakMathInProse + its streaming filter.
 */

const { speakMathInProse, createMathSpeechStreamFilter } = require('../../utils/mathTTS');

describe('speakMathInProse', () => {
  test('"=" becomes "equals", not "equal sign"', () => {
    expect(speakMathInProse('So 2x plus 4 = 20 here.')).toBe('So 2x plus 4 equals 20 here.');
  });

  test('ascii comparison pairs are not mangled', () => {
    expect(speakMathInProse('x <= 5')).toBe('x <= 5');
    expect(speakMathInProse('a != b')).toBe('a != b');
  });

  test('variable products split so TTS stops saying "axe"', () => {
    expect(speakMathInProse('The line ax + b crosses zero.')).toBe('The line a x + b crosses zero.');
    expect(speakMathInProse('Solve Ax = b for x.')).toBe('Solve A x equals b for x.');
    expect(speakMathInProse('Try 2ax + 5.')).toBe('Try 2 a x + 5.');
  });

  test('ordinary words are untouched', () => {
    for (const s of [
      'Wax on, wax off.',
      'Divided by 2 gives you 4.',
      'My answer is ready.',
      'Max, nice work today!',
      'That was an excellent try.',
    ]) {
      expect(speakMathInProse(s)).toBe(s);
    }
  });

  test('unicode operators and leaked carets become words', () => {
    expect(speakMathInProse('3 × 4')).toBe('3 times 4');
    expect(speakMathInProse('10 ÷ 2')).toBe('10 divided by 2');
    expect(speakMathInProse('x^2 + 3')).toBe('x squared + 3');
    expect(speakMathInProse('n^4')).toBe('n to the fourth power');
  });
});

describe('createMathSpeechStreamFilter', () => {
  function run(fragments) {
    const f = createMathSpeechStreamFilter();
    let out = '';
    for (const frag of fragments) out += f.push(frag);
    out += f.flush();
    return out;
  }

  test('a whole sentence streams through unchanged except math', () => {
    expect(run(['So 2x plus 4 = 20 here.'])).toBe('So 2x plus 4 equals 20 here.');
  });

  test('"=" split across fragments still becomes equals', () => {
    expect(run(['2x plus 4 ', '= ', '20'])).toBe('2x plus 4 equals 20');
  });

  test('"ax" arriving before its operator still splits', () => {
    // "ax" is held back until the "+" arrives in the next fragment.
    expect(run(['The line ax', ' + b crosses zero'])).toBe('The line a x + b crosses zero');
  });

  test('plain prose is not delayed into oblivion (flush drains the tail)', () => {
    expect(run(['Nice ', 'work ', 'today!'])).toBe('Nice work today!');
  });

  test('empty pushes are safe', () => {
    const f = createMathSpeechStreamFilter();
    expect(f.push('')).toBe('');
    expect(f.flush()).toBe('');
  });
});

// Owner report 2026-10-13: Ms. Maria said "six c dot frac" aloud. The voice
// stream only knew "=" and "^", so leaked LaTeX reached Cartesia verbatim.
describe('leaked markup never reaches the speaker', () => {
  function run(text, size) {
    const f = createMathSpeechStreamFilter();
    let out = '';
    for (let i = 0; i < text.length; i += size) out += f.push(text.slice(i, i + size));
    return out + f.flush();
  }

  const CASES = [
    ['So we have 6 \\cdot \\frac{x}{3} here.', 'So we have 6 times x over 3 here.'],
    ['Look at \\(6x = 18\\) and tell me.', 'Look at 6x equals 18 and tell me.'],
    ['Then $\\frac{6x}{3} = 2x$, right?', 'Then 6x over 3 equals 2x, right?'],
    ['Multiply \\frac{2}{3} by \\frac{3}{4} now.', 'Multiply two thirds by three fourths now.'],
    ['It is \\text{12 cm} wide and \\sqrt{16} is 4.', 'It is 12 cm wide and the square root of 16 is 4.'],
    ['Nice! <BOARD_POINT step="2"/> What next?', 'Nice! What next?'],
  ];

  test.each(CASES)('whole: %s', (input, expected) => {
    expect(speakMathInProse(input)).toBe(expected);
  });

  // Token boundaries land anywhere — mid-command, between a fraction's two
  // groups, inside a tag. Every split must say the same thing.
  test.each(CASES)('streamed in 1-, 3- and 7-char fragments: %s', (input, expected) => {
    for (const size of [1, 3, 7]) expect(run(input, size)).toBe(expected);
  });

  test('no backslash, brace or tag survives into speech', () => {
    const out = run('Now \\left( \\frac{1}{2} \\right) \\times \\mathrm{x} \\unknowncmd{y} </math>', 2);
    expect(out).not.toMatch(/[\\{}<>]|frac|cdot|mathrm|unknowncmd/);
  });

  test('prices and comparisons are not mistaken for markup', () => {
    expect(speakMathInProse('It costs $5 and $6 at the store.')).toBe('It costs $5 and $6 at the store.');
    expect(speakMathInProse('x <= 5 and x < 3 and 3<4.')).toBe('x <= 5 and x < 3 and 3<4.');
    expect(run('It costs $5 and $6 at the store.', 2)).toBe('It costs $5 and $6 at the store.');
  });

  test('an unclosed delimiter cannot silence the tutor forever', () => {
    const long = 'That will cost $5 ' + 'and then we keep talking about it '.repeat(15);
    const f = createMathSpeechStreamFilter();
    let midStream = '';
    for (let i = 0; i < long.length; i += 10) midStream += f.push(long.slice(i, i + 10));
    expect(midStream.length).toBeGreaterThan(0);
  });
});
