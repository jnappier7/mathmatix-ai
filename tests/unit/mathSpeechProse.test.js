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
