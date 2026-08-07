/**
 * MC option normalization — the shape seam between the item bank and every
 * quiz surface.
 *
 * These pin the four stored shapes that actually exist in the bank, and the two
 * properties the whole thing rests on: serving never leaks the answer key, and
 * the label the student sees resolves back to the option the grader means.
 */

const { normalizeOptions, resolveChoice, correctLabelOf, optionText } = require('../../utils/mcOptions');

describe('normalizeOptions', () => {
  test('passes the modern { label, text } shape straight through', () => {
    expect(normalizeOptions([{ label: 'A', text: '100' }, { label: 'B', text: '99' }]))
      .toEqual([{ label: 'A', text: '100' }, { label: 'B', text: '99' }]);
  });

  test('labels the convertToMC shape, which keys the letter as `id`', () => {
    // The population behind the owner-hit bug: no `label` anywhere, so a client
    // reading opt.label painted "undefined. 100" on every choice.
    const stored = [
      { id: 'A', text: '102', isCorrect: false },
      { id: 'B', text: '100', isCorrect: true }
    ];
    expect(normalizeOptions(stored)).toEqual([
      { label: 'A', text: '102' },
      { label: 'B', text: '100' }
    ]);
  });

  test('never serves isCorrect — that is the answer key', () => {
    const served = normalizeOptions([{ id: 'A', text: '100', isCorrect: true }]);
    expect(served[0]).not.toHaveProperty('isCorrect');
    expect(Object.keys(served[0]).sort()).toEqual(['label', 'text']);
  });

  test('labels the generateProblems shape, which keys the letter as `letter`', () => {
    expect(normalizeOptions([{ letter: 'A', text: '7', isCorrect: true }]))
      .toEqual([{ label: 'A', text: '7' }]);
  });

  test('labels bare strings positionally', () => {
    expect(normalizeOptions(['Higher', 'Lower'])).toEqual([
      { label: 'A', text: 'Higher' },
      { label: 'B', text: 'Lower' }
    ]);
  });

  test('keeps positions stable, so a blank option cannot re-index correctOption', () => {
    const out = normalizeOptions([{ text: '' }, { text: '100' }]);
    expect(out.map((o) => o.label)).toEqual(['A', 'B']);
    expect(out[1].text).toBe('100');
  });

  test('empty and missing option arrays normalize to nothing', () => {
    expect(normalizeOptions([])).toEqual([]);
    expect(normalizeOptions(undefined)).toEqual([]);
    expect(normalizeOptions(null)).toEqual([]);
  });

  test('reads text out of every stored key', () => {
    expect(optionText({ text: '1' })).toBe('1');
    expect(optionText({ value: '2' })).toBe('2');
    expect(optionText('3')).toBe('3');
    expect(optionText(null)).toBe('');
  });
});

describe('resolveChoice', () => {
  const opts = [{ id: 'A', text: '102' }, { id: 'B', text: '100' }];

  test('resolves a submitted label', () => {
    expect(resolveChoice(opts, 'B')).toEqual({ label: 'B', text: '100' });
  });

  test('resolves a submitted option text, for clients that send the text', () => {
    expect(resolveChoice(opts, '100')).toEqual({ label: 'B', text: '100' });
  });

  test('is case- and whitespace-tolerant on the label', () => {
    expect(resolveChoice(opts, ' b ')).toEqual({ label: 'B', text: '100' });
  });

  test('returns null for a pick that is not on the card', () => {
    // The literal string "undefined" is what the broken client submitted.
    expect(resolveChoice(opts, 'undefined')).toBeNull();
    expect(resolveChoice(opts, '')).toBeNull();
    expect(resolveChoice(opts, null)).toBeNull();
  });
});

describe('correctLabelOf', () => {
  test('maps straight across when stored letters are already positional', () => {
    const p = { options: [{ label: 'A', text: '1' }, { label: 'B', text: '2' }], correctOption: 'B' };
    expect(correctLabelOf(p)).toBe('B');
  });

  test('follows the STORED letter when a shuffle left it out of position', () => {
    // generate-all-pattern-problems.js shuffles options with their labels still
    // attached, then reads the correct letter off the shuffled array — so 'C'
    // here means slot 0, and reading it positionally marks a correct pick wrong.
    const p = {
      options: [{ label: 'C', text: '100' }, { label: 'A', text: '102' }, { label: 'B', text: '99' }],
      correctOption: 'C'
    };
    expect(correctLabelOf(p)).toBe('A');
  });

  test('reads correctOption positionally when no option carries a letter', () => {
    const p = { options: [{ text: '102' }, { text: '100' }], correctOption: 'B' };
    expect(correctLabelOf(p)).toBe('B');
  });

  test('returns null when the item has no correctOption', () => {
    expect(correctLabelOf({ options: [{ text: '1' }] })).toBeNull();
    expect(correctLabelOf({ options: [{ text: '1' }], correctOption: '' })).toBeNull();
  });

  test('returns null when correctOption names a letter no option has', () => {
    const p = { options: [{ label: 'A', text: '1' }, { label: 'B', text: '2' }], correctOption: 'D' };
    expect(correctLabelOf(p)).toBeNull();
  });
});
