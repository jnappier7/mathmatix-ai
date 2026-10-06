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

describe('the seed banks have no blocking defects', () => {
  // The form builder skips a blocked item, so one that ships is a question no
  // student ever sees. The last 21 were repaired; keep it at zero. A new
  // finding means fix the item (or the checker, if it is wrong), not this list.
  const FILES = {
    'act-fable': 'seeds/act-fable-items.generated.json',
    'act-ies-expansion': 'seeds/act-ies-expansion/ies-items.generated.json',
    'act-enhanced': 'seeds/act-enhanced/act-items.generated.json',
    'act-visual': 'seeds/act-visual/act-visual-items.generated.json',
  };
  test.each(Object.keys(FILES))('%s', (bank) => {
    const file = path.join(__dirname, '..', '..', FILES[bank]);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const items = Array.isArray(data) ? data : data.items;
    const report = auditBank(items);
    const blocking = [];
    Object.entries(report.byCode)
      .filter(([, v]) => v.severity === 'blocking')
      .forEach(([code, v]) => v.items.forEach((x) => blocking.push(`${x.problemId} ${code}: ${x.detail}`)));
    expect(blocking).toEqual([]);
  });
});

describe('equal expressions and impossible probabilities', () => {
  const key = (texts, keyIdx, prompt) => ({
    answerType: 'multiple-choice',
    options: texts.map((text, i) => ({ label: 'ABCD'[i], text })),
    correctOption: 'ABCD'[keyIdx],
    prompt,
  });
  const issueCodes = (p) => assessOptions(p).issues.map((i) => i.code);

  test('one expression written two ways is flagged', () => {
    expect(issueCodes(key(['x⁶', 'x⁵', '|x⁶|', 'x⁹'], 0, 'Simplify √(x¹²).'))).toContain('equivalent_options');
    expect(issueCodes(key(['(x - 3)(x + 3)', '(x - 3)(x - 3)', '(x + 3)(x - 3)', '(x + 9)(x - 1)'], 0, 'Factor completely: x^2 - 9')))
      .toContain('equivalent_options');
    expect(issueCodes(key(['28.8 × 10^9', '2.88 × 10^10', '3.6 × 10^10', '2.88 × 10^24'], 1, '(2.4 × 10^6)(1.2 × 10^4) = ?')))
      .toContain('equivalent_options');
  });

  test('a form question keeps its wrong-form distractor', () => {
    expect(issueCodes(key(['1.69 × 10^6', '1.69 × 10^7', '1.69 × 10^-6', '16.9 × 10^5'], 0, 'Write 1,690,000 in scientific notation.')))
      .not.toContain('equivalent_options');
    expect(issueCodes(key(['18', '3√2', '√9', '√18'], 1, 'Simplify: √3 · √6'))).not.toContain('equivalent_options');
    expect(issueCodes(key(['2 × 2', '2 × 3', '3 × 4', '4 × 3'], 2, 'What are the dimensions of AB?'))).not.toContain('equivalent_options');
  });

  test('a probability above 1 is flagged only when a probability is asked for', () => {
    expect(issueCodes(key(['3/22', '23/22', '1/2', '1/4'], 0, 'What is the probability that both are red?')))
      .toContain('impossible_probability');
    expect(issueCodes(key(['60', '0.3', '90', '30'], 0, 'The probability of rain is 0.3. On how many of 200 days would you expect rain?')))
      .not.toContain('impossible_probability');
  });
});

describe('figures', () => {
  const root = path.join(__dirname, '..', '..');
  const fable = JSON.parse(fs.readFileSync(path.join(root, 'seeds/act-fable-items.generated.json'), 'utf8'));

  test('every figure carries a written description for screen readers', () => {
    const missing = fable.filter((it) => it.svg && !(it.figureAlt && it.figureAlt.length > 40)).map((it) => it.problemId);
    expect(missing).toEqual([]);
  });

  test('coordinate graphs keep the ticks they are answered from', () => {
    // The ingest used to turn every figure's axes off, erasing these.
    for (const id of ['act-fable-t1q31', 'act-fable-t4q37', 'act-fable-t5q38']) {
      const svg = fable.find((it) => it.problemId === id).svg;
      expect((svg.match(/id="xtick_\d+"/g) || []).length).toBeGreaterThan(2);
      expect((svg.match(/id="ytick_\d+"/g) || []).length).toBeGreaterThan(1);
    }
  });
});
