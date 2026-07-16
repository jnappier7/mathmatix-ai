// Tests for utils/voiceBoardGuard.js — the "voice explains, board shows"
// enforcement. Style mirrors voiceBoardTranslate.test.js: pure payloads in,
// assertions out.

const {
  findMathSpans,
  containsSpokenMath,
  hasUsableBoardOutput,
  ensureBoardCarriesSpokenMath,
} = require('../../utils/voiceBoardGuard');

describe('findMathSpans — detection', () => {
  test('detects an equation', () => {
    expect(findMathSpans('So now we have 2x = 4 on the left side.')).toEqual(['2x = 4']);
  });

  test('detects a coefficient expression', () => {
    expect(findMathSpans('Look at 12x + 18 again.')).toEqual(['12x + 18']);
  });

  test('detects LaTeX fragments', () => {
    expect(findMathSpans('That gives \\frac{1}{2} exactly')).toEqual(['\\frac{1}{2}']);
  });

  test('detects exponent notation', () => {
    expect(findMathSpans('remember x^2 grows fast')).toEqual(['x^2']);
  });

  test('detects multiple distinct spans', () => {
    const spans = findMathSpans('We went from 3x + 5 = -31 to 3x = -36, nice work.');
    expect(spans).toEqual(['3x + 5 = -31', '3x = -36']);
  });

  test('dedupes repeated spans', () => {
    expect(findMathSpans('2x = 4, yes, 2x = 4!')).toEqual(['2x = 4']);
  });

  test('strips trailing sentence punctuation', () => {
    expect(findMathSpans('and we get x = -12.')).toEqual(['x = -12']);
  });

  test('strips an unbalanced wrapping paren', () => {
    expect(findMathSpans('(so 2x = 4)')).toEqual(['2x = 4']);
  });
});

describe('findMathSpans — conservative negatives', () => {
  test.each([
    ['plain sentence', 'What do both terms share?'],
    ['bare number', 'Try problem 2 next.'],
    ['clock time', 'See you at 3:45 tomorrow.'],
    ['date', 'The quiz is May 12.'],
    ['page range', 'Read pages 10-12 tonight.'],
    ['numbered list count', 'You got 4 of 5 right!'],
    ['grade level', 'This is a grade 7 skill.'],
    ['bare arithmetic between numbers', 'questions 1 - 5 are done'],
  ])('%s does not trigger', (_name, text) => {
    expect(findMathSpans(text)).toEqual([]);
    expect(containsSpokenMath(text)).toBe(false);
  });

  test('empty / null input', () => {
    expect(findMathSpans('')).toEqual([]);
    expect(findMathSpans(null)).toEqual([]);
    expect(findMathSpans(undefined)).toEqual([]);
  });
});

describe('hasUsableBoardOutput', () => {
  test('latex step counts', () => {
    expect(hasUsableBoardOutput([{ latex: '2x = 4' }], [])).toBe(true);
  });

  test('visual step counts', () => {
    expect(hasUsableBoardOutput([{ visual: { fn: 'x^2' } }], [])).toBe(true);
  });

  test('text-only steps are narration, not board output', () => {
    expect(hasUsableBoardOutput([{ text: 'nice work!' }], [])).toBe(false);
  });

  test('write action counts', () => {
    expect(hasUsableBoardOutput([], [{ type: 'write', text: '3x = 9' }])).toBe(true);
  });

  test('a lone clear does not count', () => {
    expect(hasUsableBoardOutput([], [{ type: 'clear' }])).toBe(false);
  });

  test('empty everything', () => {
    expect(hasUsableBoardOutput([], [])).toBe(false);
    expect(hasUsableBoardOutput(null, null)).toBe(false);
  });
});

describe('ensureBoardCarriesSpokenMath', () => {
  test('mirrors spoken math when the board is empty', () => {
    const r = ensureBoardCarriesSpokenMath('So we get 2x = 4 here.', [], []);
    expect(r.mirrored).toEqual(['2x = 4']);
    expect(r.mathSteps).toEqual([
      { latex: '2x = 4', label: 'From what we just said', mirrored: true },
    ]);
  });

  test('passes through untouched when board output already exists', () => {
    const steps = [{ latex: '3x + 5 = -31', label: 'Given' }];
    const r = ensureBoardCarriesSpokenMath('So we get 2x = 4 here.', steps, []);
    expect(r.mirrored).toEqual([]);
    expect(r.mathSteps).toBe(steps);
  });

  test('board actions also satisfy the guard', () => {
    const r = ensureBoardCarriesSpokenMath(
      'So we get 2x = 4 here.', [], [{ type: 'write', x: 0, y: 0, text: '2x = 4' }]
    );
    expect(r.mirrored).toEqual([]);
  });

  test('no math spoken → no change', () => {
    const r = ensureBoardCarriesSpokenMath('Great job! What should we try next?', [], []);
    expect(r.mirrored).toEqual([]);
    expect(r.mathSteps).toEqual([]);
  });

  test('text-only narration steps do not satisfy the guard', () => {
    const r = ensureBoardCarriesSpokenMath(
      'Look at 12x + 18.', [{ text: 'thinking about factors' }], []
    );
    expect(r.mirrored).toEqual(['12x + 18']);
    expect(r.mathSteps).toHaveLength(2);
    expect(r.mathSteps[1].latex).toBe('12x + 18');
  });

  test('caps mirrored lines at 4', () => {
    const text = 'a = 1 then b = 2 then c = 3 then d = 4 then e = 5 wow';
    const r = ensureBoardCarriesSpokenMath(text, [], []);
    expect(r.mirrored).toHaveLength(4);
  });

  test('does not mutate the input array', () => {
    const steps = [];
    ensureBoardCarriesSpokenMath('2x = 4', steps, []);
    expect(steps).toEqual([]);
  });
});
