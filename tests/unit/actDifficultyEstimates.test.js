/**
 * Content-based difficulty estimates (seeds/act-difficulty-estimates.json,
 * scripts/estimateActDifficulty.js, utils/actDifficultyEstimates.js).
 *
 * Until real responses calibrate them, forms are ordered by these. The file
 * has to cover every item that can reach a form, stay on the Fable scale, and
 * keep agreeing with Fable's own per-item ratings well enough to be worth
 * using (the validation the script records). And the order of precedence is
 * pinned: a measured difficulty beats an estimate beats an authored rating.
 */
const fs = require('fs');
const path = require('path');
const { estimatedDifficulty } = require('../../utils/actDifficultyEstimates');
const { preciseDifficulty } = require('../../utils/actTestAssembler');

const ROOT = path.join(__dirname, '..', '..');
const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'seeds', 'act-difficulty-estimates.json'), 'utf8'));
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'seeds', f), 'utf8'));
const items = [
  ...read('act-fable-items.generated.json'),
  ...read('act-ies-expansion/ies-items.generated.json'),
  ...read('act-enhanced/act-items.generated.json'),
  ...read('act-visual/act-visual-items.generated.json'),
  ...read('act-reasoning/act-reasoning-items.generated.json'),
  ...read('act-sets/act-set-items.generated.json'),
];

test('every item that can reach a form has an estimate', () => {
  expect(items.filter((it) => file.estimates[it.problemId] == null).map((it) => it.problemId)).toEqual([]);
});

test('the estimates agree with Fable\'s per-item ratings well enough to order by', () => {
  const v = file._meta.validation;
  expect(v.n).toBeGreaterThanOrEqual(400);
  // Measured at ρ 0.59 / 67% within one level over 615 Fable items. Fable's
  // ratings are themselves one author's judgment, so this is agreement between
  // two raters, not accuracy; the floors only stop a worse re-run shipping.
  expect(v.spearman).toBeGreaterThanOrEqual(0.55);
  expect(v.within1).toBeGreaterThanOrEqual(0.6);
  expect(file._meta.map).toEqual({ a: expect.any(Number), b: expect.any(Number) });
});

test('mapped estimates stay on the 1-5 scale', () => {
  items.forEach((it) => {
    const e = estimatedDifficulty(it.problemId);
    expect(e).toBeGreaterThanOrEqual(1);
    expect(e).toBeLessThanOrEqual(5);
  });
});

test('the recipe ratio the audit found at #41 is estimated as an easy item', () => {
  // Authored 4 by its position in the IES bank; it is a one-step ratio.
  expect(estimatedDifficulty('act-ies-numforms-011')).toBeLessThan(3);
});

test('precedence: measured beats estimated beats authored', () => {
  const id = 'act-ies-numforms-011';
  const est = estimatedDifficulty(id);
  expect(preciseDifficulty({ problemId: id, source: 'act-ies-expansion', difficulty: 4 })).toBe(est);
  expect(preciseDifficulty({ problemId: id, source: 'act-ies-expansion', difficulty: 4, calibration: { calibratedAt: new Date(), theta: 2 } })).toBeGreaterThan(4);
  expect(preciseDifficulty({ problemId: 'not-estimated', source: 'act-fable', difficulty: 4 })).toBe(4);
  // Fable: the two independent ratings are averaged.
  const fid = 'act-fable-t1q21';
  expect(preciseDifficulty({ problemId: fid, source: 'act-fable', difficulty: 3 })).toBeCloseTo((estimatedDifficulty(fid) + 3) / 2, 2);
});
