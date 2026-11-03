/**
 * scripts/regenerateStaleMcOptions.js rebuilds MC options for the 435 items
 * whose key was corrected on 2026-11-03 after their options had been built from
 * the old wrong key. These pin the two halves that make that safe: each skill's
 * re-solve + misconception distractors, and the validator that refuses any item
 * where the key isn't exactly one option.
 */

const {
  buildOptions,
  validateOptions,
  bankDefect
} = require('../../scripts/regenerateStaleMcOptions');
const { compareAnswer } = require('../../utils/answerComparison');

const item = (skillId, prompt, value, equivalents = [value], _id = `${skillId}:${prompt}`) => ({
  _id, skillId, prompt, answer: { type: 'auto', value, equivalents }
});

// Real tagged prod items, with their corrected keys
const CASES = [
  item('one-step-equations', 'Solve for x: x ÷ 9 = 5', '45', ['45', '45/1']),
  item('one-step-equations', 'Solve for x: x ÷ 2 = 2', '4'), // a + b collides with the key
  item('one-step-inequalities', 'Solve for x: x ÷ 5 < 6', 'x < 30'),
  item('one-step-inequalities', 'Solve for x: x ÷ 12 ≤ 9', 'x ≤ 108'),
  item('solving-inequalities', 'Solve: 3x < 22', 'x < 22/3', ['x < 22/3', 'x < 7 1/3']),
  item('equations-with-variables-both-sides', 'Solve for x: 5x + 18 = x + 17', '-1/4', ['-0.25', '-1/4']),
  item('equations-with-variables-both-sides', 'Solve for x: 5x + 15 = 3x + 2', '-13/2', ['-13/2', '-6 1/2', '-6.5']),
  item('mean', 'Find the mean: 8, 1, 8', '17/3', ['17/3', '5 2/3']),
  item('mode', 'Find the mode: 12, 8, 12, 12, 8', '12', ['12', '12/1']),
  item('slope-from-two-points', 'Find the slope between (5, 4) and (8, 12)', '8/3', ['2 2/3', '8/3']),
  item('slope-from-two-points', 'Find the slope between (1, 1) and (3, 3)', '1'), // reciprocal == key
  item('estimate-sums', 'About how much is 21 + 24? (Round to nearest 10)', '40', ['40', '40/1'])
];

describe('buildOptions', () => {
  test.each(CASES.map((c) => [c.prompt, c]))('%s → 4 options, exactly one correct', (_, p) => {
    const r = buildOptions(p);
    expect(r.error).toBeUndefined();
    expect(r.options).toHaveLength(4);
    expect(r.options.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D']);

    // The key option IS the stored value, so the exact-text path matches
    const keyed = r.options.find((o) => o.label === r.correctOption);
    expect(keyed.text).toBe(p.answer.value);

    const spec = { ...p.answer, answerType: 'multiple-choice', options: r.options, correctOption: r.correctOption };
    for (const o of r.options) {
      expect(compareAnswer(o.label, spec)).toBe(o.label === r.correctOption);
      expect(compareAnswer(o.text, p.answer)).toBe(o.label === r.correctOption);
    }
    expect(new Set(r.options.map((o) => o.text)).size).toBe(4);
    expect(validateOptions({ ...r, answer: p.answer })).toEqual([]);
  });

  test('distractors are the named misconceptions', () => {
    const texts = (p) => buildOptions(p).options.map((o) => o.text).sort();
    // flipped sign, divided instead of multiplying, boundary only
    expect(texts(CASES[2])).toEqual(['x < 30', 'x < 6/5', 'x = 30', 'x > 30'].sort());
    // reciprocal, negative, negative reciprocal
    expect(texts(CASES[9])).toEqual(['8/3', '3/8', '-8/3', '-3/8'].sort());
    // other value, frequency, range
    expect(texts(CASES[8])).toEqual(['12', '8', '3', '4'].sort());
    // median, divided by n-1, slipped adding
    expect(texts(CASES[7])).toEqual(['17/3', '8', '17/2', '6'].sort());
  });

  test('fractions are canonical — never "-1/-4" or "6/1"', () => {
    for (const p of CASES) {
      for (const o of buildOptions(p).options) {
        expect(o.text).not.toMatch(/\/-|\/1(?!\d)|\+ -/);
      }
    }
  });

  test('deterministic per item, and the key moves between items', () => {
    expect(buildOptions(CASES[0])).toEqual(buildOptions(CASES[0]));
    const letters = new Set(CASES.map((p) => buildOptions(p).correctOption));
    expect(letters.size).toBeGreaterThan(1);
  });

  test('refuses an item whose stored key disagrees with the re-solve', () => {
    const wrong = item('one-step-equations', 'Solve for x: x ÷ 9 = 5', '5/9');
    expect(buildOptions(wrong).error).toMatch(/re-solved 45/);
  });

  test('refuses prompts and skills it does not recognise', () => {
    expect(buildOptions(item('mean', 'What is the average of the class?', '7')).error).toMatch(/not recognised/);
    expect(buildOptions(item('histograms', 'x', '1')).error).toMatch(/no solver/);
    // bimodal data has no single mode to key
    expect(buildOptions(item('mode', 'Find the mode: 1, 1, 2, 2, 3', '1')).error).toBeTruthy();
  });
});

describe('validateOptions', () => {
  const answer = { value: '17/3', equivalents: ['17/3', '5 2/3'] };
  const opts = (...t) => t.map((text, i) => ({ label: 'ABCD'[i], text }));

  test('accepts one correct option among distinct distractors', () => {
    expect(validateOptions({ answer, options: opts('6', '17/3', '17/2', '8'), correctOption: 'B' })).toEqual([]);
  });

  test('rejects no correct option (the stale-key state)', () => {
    const errs = validateOptions({ answer, options: opts('5.7', '6.70', '4.70', '7.70'), correctOption: 'A' });
    expect(errs.join()).toMatch(/0 options grade correct/);
  });

  test('rejects a distractor equivalent to the key', () => {
    const errs = validateOptions({ answer, options: opts('17/3', '5 2/3', '6', '8'), correctOption: 'A' });
    expect(errs.join()).toMatch(/2 options grade correct/);
  });

  test('rejects two distractors that say the same thing', () => {
    const errs = validateOptions({ answer, options: opts('17/3', '6', '12/2', '8'), correctOption: 'A' });
    expect(errs.join()).toMatch(/same/);
    const ineq = { value: 'x < 30', equivalents: ['x < 30'] };
    const e2 = validateOptions({ answer: ineq, options: opts('x < 30', 'x <= 6', 'x ≤ 6', 'x > 30'), correctOption: 'A' });
    expect(e2.join()).toMatch(/same/);
  });

  test('rejects a correctOption pointing at a distractor', () => {
    const errs = validateOptions({ answer, options: opts('6', '17/3', '17/2', '8'), correctOption: 'A' });
    expect(errs.join()).toMatch(/keyed A/);
  });
});

describe('bankDefect', () => {
  test('flags a key matching no option, and a correctOption on the wrong option', () => {
    const base = { answer: { value: '3/5', equivalents: ['0.6', '3/5'] } };
    expect(bankDefect({ ...base, options: [{ text: '5' }, { text: '2' }] })).toMatch(/no option/);
    expect(bankDefect({ ...base, options: [{ label: 'A', text: '5' }, { label: 'B', text: '3/5' }], correctOption: 'A' }))
      .toMatch(/correctOption/);
    expect(bankDefect({ ...base, options: [{ label: 'A', text: '5' }, { label: 'B', text: '3/5' }], correctOption: 'B' }))
      .toBeNull();
  });
});
