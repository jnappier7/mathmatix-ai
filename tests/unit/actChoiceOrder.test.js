/**
 * Numeric answer choices in ascending order, without breaking tests already
 * taken.
 *
 * The real ACT lists numeric choices in order; 120 bank items did not
 * (165, 205, 185, 285). scripts/sortActNumericChoices.js reorders them in the
 * seed files. A test freezes its items' choices at assembly, and grading and
 * the review queue read the key from the bank later — so a pick made on the
 * old order is carried to the bank's order by its TEXT (relabelByText) before
 * it is compared. These tests pin the reorder itself and that translation.
 */

const fs = require('fs');
const path = require('path');
const { sortPermutation, remapExplanation, permuteItem } = require('../../scripts/sortActNumericChoices');
const { relabelByText } = require('../../utils/mcOptions');
const { buildReviewQueue } = require('../../utils/actReview');
const { auditBank } = require('../../scripts/actItemAudit');

const opts = (...texts) => texts.map((text, i) => ({ label: 'ABCD'[i], text }));

describe('sorting choices', () => {
  test('out-of-order numeric choices sort ascending; ordered ones are left alone', () => {
    expect(sortPermutation(['165', '205', '185', '285'])).toEqual([0, 2, 1, 3]);
    expect(sortPermutation(['165', '185', '205', '285'])).toBeNull();
    expect(sortPermutation(['285', '205', '185', '165'])).toBeNull();     // descending is fine
    expect(sortPermutation(['x + 1', '2', '3', '4'])).toBeNull();          // not all numbers
  });

  test('numbers with a shared unit sort too; mixed units are left alone', () => {
    expect(sortPermutation(['540°', '360°', '720°', '900°'])).toEqual([1, 0, 2, 3]);
    expect(sortPermutation(['12 cm', '3 cm', '5 cm', '9 cm'])).toEqual([1, 2, 3, 0]);
    expect(sortPermutation(['3 cm', '5 in', '1 cm', '2 cm'])).toBeNull();
  });

  test('the key moves with its text', () => {
    const item = { options: opts('16', '2', '4', '8'), correctOption: 'D', explanation: 'Slope is 8.' };
    const out = permuteItem(item, sortPermutation(item.options.map((o) => o.text)));
    expect(out.options.map((o) => o.text)).toEqual(['2', '4', '8', '16']);
    expect(out.options.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(out.options['ABCD'.indexOf(out.correctOption)].text).toBe('8');
  });

  test('choice letters are remapped only where a sentence names a choice', () => {
    const map = { A: 'C', B: 'A', C: 'D', D: 'B' };
    const text = 'In ∠A, sin B = 3/5. Choice B (0.38) is rounded. This rules out A and B. A ratio is a quotient.';
    expect(remapExplanation(text, map))
      .toBe('In ∠A, sin B = 3/5. Choice A (0.38) is rounded. This rules out C and A. A ratio is a quotient.');
  });
});

describe('the seed banks stay sorted', () => {
  test.each([
    ['act-fable', 'seeds/act-fable-items.generated.json'],
    ['act-ies-expansion', 'seeds/act-ies-expansion/ies-items.generated.json'],
  ])('%s has no out-of-order numeric choices', (_bank, rel) => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8'));
    const report = auditBank(Array.isArray(data) ? data : data.items);
    expect(report.byCode.unsorted_numeric).toBeUndefined();
  });

  test('the generated Fable bank matches its source questions', () => {
    const root = path.join(__dirname, '..', '..');
    const gen = JSON.parse(fs.readFileSync(path.join(root, 'seeds/act-fable-items.generated.json'), 'utf8'));
    const src = JSON.parse(fs.readFileSync(path.join(root, 'seeds/fable-act/topup1.json'), 'utf8')).questions;
    const byN = new Map(src.map((q) => [q.n, q]));
    gen.filter((it) => /^act-fable-topup1q\d+$/.test(it.problemId)).forEach((it) => {
      const q = byN.get(Number(it.problemId.split('q').pop()));
      expect(it.options.map((o) => o.text)).toEqual(q.choices);
      expect(it.correctOption).toBe('ABCDE'[q.answer]);
    });
  });
});

describe('tests taken before the reorder', () => {
  const frozen = opts('165', '205', '185', '285');   // what the student saw
  const bank = opts('165', '185', '205', '285');     // the bank after sorting

  test('a pick is carried to the bank by its text', () => {
    expect(relabelByText('B', frozen, bank)).toBe('C');   // "205"
    expect(relabelByText('C', frozen, bank)).toBe('B');   // "185"
    expect(relabelByText('A', frozen, bank)).toBe('A');
    expect(relabelByText('B', opts('1', 'gone'), opts('1', '2'))).toBeNull();
  });

  test('the review explanation follows the order the student saw', () => {
    const o = (...t) => t.map((x, i) => ({ label: 'ABCD'[i], text: x }));
    const session = {
      items: [{ position: 1, problemId: 'g', skillId: 's', category: 'geometry', content: 'Q', options: o('36°', '72°', '108°', '540°') }],
      responses: [{ position: 1, problemId: 'g', skillId: 's', category: 'geometry', answer: 'A', correct: false }],
    };
    const bank = { g: { problemId: 'g', options: o('108°', '72°', '36°', '540°'), correctOption: 'B',
      answer: { value: '72°' }, explanation: 'Each is 72°. Wrong choices: A) 108° is interior; D) 540° is the sum.' } };
    const [miss] = buildReviewQueue(session, bank);
    expect(miss.correctOption).toBe('B');
    expect(miss.explanation).toBe('Each is 72°. Wrong choices: C) 108° is interior; D) 540° is the sum.');
  });

  test('the review queue names the key in the order the student saw', () => {
    const session = {
      items: [{ position: 3, problemId: 'p1', skillId: 's', category: 'algebra', content: 'Q', options: frozen }],
      responses: [{ position: 3, problemId: 'p1', skillId: 's', category: 'algebra', answer: 'A', correct: false }],
    };
    // Key is "205": slot B in the frozen order, slot C in the bank.
    const problems = { p1: { problemId: 'p1', options: bank, correctOption: 'C', answer: { value: '205' } } };
    const [miss] = buildReviewQueue(session, problems);
    expect(miss.correctOption).toBe('B');
  });
});

describe('frozenPickForGrading', () => {
  const { frozenPickForGrading } = require('../../utils/mcOptions');
  const o = (...t) => t.map((text, i) => ({ label: 'ABCD'[i], text }));
  test('a pick still in the bank becomes the bank letter', () => {
    expect(frozenPickForGrading('B', o('1', '3', '2', '4'), o('1', '2', '3', '4'))).toBe('C');
  });
  test('a pick edited out of the bank is graded by its text, never by its old letter', () => {
    expect(frozenPickForGrading('D', o('1/3', '6/13', '7/13', '7/6'), o('3/13', '1/3', '6/13', '7/13'))).toBe('7/6');
  });
  test('with no frozen choices the pick is already a bank letter', () => {
    expect(frozenPickForGrading('C', undefined, o('1', '2', '3', '4'))).toBe('C');
    expect(frozenPickForGrading('C', [], o('1', '2', '3', '4'))).toBe('C');
  });
});
