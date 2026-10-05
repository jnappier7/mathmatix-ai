/**
 * ACT item content checks (scripts/actItemAudit.js + utils/distractorQuality).
 *
 * A full run of the public practice test found an item whose choices included
 * both 2/5 and 4/10 — two different-looking choices with one value, so a
 * student can strike both without doing the math. The form builder now skips
 * items with blocking choice defects, and this suite keeps new ones out of the
 * seed banks: the blocking count per bank may only go down.
 */

const { assessOptions, numericValue } = require('../../utils/distractorQuality');
const { auditItem, auditBank, isMonotonic } = require('../../scripts/actItemAudit');
const fs = require('fs');
const path = require('path');

const mc = (texts, extra = {}) => ({
  answerType: 'multiple-choice',
  options: texts.map((text, i) => ({ label: 'ABCD'[i], text })),
  ...extra,
});
const codes = (p) => assessOptions(p).issues.map((i) => i.code);

describe('equal-valued choices', () => {
  test('2/5 and 4/10 are the same choice twice', () => {
    expect(codes(mc(['4/9', '2/5', '4/10', '44/100'], { prompt: '0.444… equals which fraction?' })))
      .toContain('equivalent_options');
    expect(codes(mc(['0.5', '1/2', '2', '3']))).toContain('equivalent_options');
    expect(codes(mc(['−3', '-3', '1', '2']))).toContain('equivalent_options'); // two minus glyphs, one value
  });

  test('a "which is NOT equal" item is allowed its equal choices', () => {
    expect(codes(mc(['6/25', '24%', '2.4 × 10⁻²', '12/50'], { prompt: 'Which of the following is NOT equal to 0.24?' })))
      .not.toContain('equivalent_options');
  });

  test('only plain numbers are compared — no guessing on expressions', () => {
    expect(numericValue('3√17')).toBeNull();
    expect(numericValue('x + 1')).toBeNull();
    expect(numericValue('$1,200')).toBe(1200);
    expect(numericValue('−1/2')).toBe(-0.5);
    expect(codes(mc(['$276', '$288', '$300', '$312']))).toEqual([]);
  });
});

describe('audit warnings', () => {
  test('numeric choices out of order are reported, ordered ones are not', () => {
    expect(isMonotonic([1, 2, 3])).toBe(true);
    expect(isMonotonic([3, 2, 1])).toBe(true);
    const unsorted = auditItem(mc(['165', '205', '185', '285']));
    expect(unsorted.map((f) => f.code)).toEqual(['unsorted_numeric']);
    expect(auditItem(mc(['165', '185', '205', '285']))).toEqual([]);
  });

  test('a stem that says "figure above" is reported now that figures render below', () => {
    const f = auditItem({ ...mc(['1', '2', '3', '4']), svg: '<svg></svg>', prompt: 'In the figure above, find x.' });
    expect(f.map((x) => x.code)).toContain('figure_position');
  });
});

describe('the seed banks do not gain blocking defects', () => {
  // Known at the time this gate landed; repair them and lower the number.
  const BASELINE = { 'act-fable': 1, 'act-ies-expansion': 4, 'act-enhanced': 7 };
  const FILES = {
    'act-fable': 'seeds/act-fable-items.generated.json',
    'act-ies-expansion': 'seeds/act-ies-expansion/ies-items.generated.json',
    'act-enhanced': 'seeds/act-enhanced/act-items.generated.json',
  };
  test.each(Object.keys(FILES))('%s', (bank) => {
    const file = path.join(__dirname, '..', '..', FILES[bank]);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const items = Array.isArray(data) ? data : data.items;
    const report = auditBank(items);
    const blocking = new Set();
    Object.values(report.byCode)
      .filter((v) => v.severity === 'blocking')
      .forEach((v) => v.items.forEach((x) => blocking.add(x.problemId)));
    expect(blocking.size).toBeLessThanOrEqual(BASELINE[bank]);
  });
});
