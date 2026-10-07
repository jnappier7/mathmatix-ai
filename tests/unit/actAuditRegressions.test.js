/**
 * Every defect the external audits of the live ACT practice test found
 * (2026-10-05 → 2026-10-07), pinned to the exact item or behaviour that showed
 * it. A sampled form can't confirm a fix ("the earlier rounding case did not
 * appear, so this run cannot confirm that fix"), so these check the banks and
 * the code paths directly, on every CI run. Each block names the audit finding
 * and the PR that fixed it; the deeper tests live beside each fix.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'seeds', f), 'utf8'));
const BANKS = {
  fable: read('act-fable-items.generated.json'),
  ies: read('act-ies-expansion/ies-items.generated.json'),
  enhanced: read('act-enhanced/act-items.generated.json'),
  visual: read('act-visual/act-visual-items.generated.json'),
  reasoning: read('act-reasoning/act-reasoning-items.generated.json'),
};
const ALL = Object.values(BANKS).flat();
const byId = (prefix) => ALL.find((i) => i.problemId.startsWith(prefix));
const keyOf = (i) => i.options.find((o) => o.label === i.correctOption).text;

describe('audit 2026-10-07 #2: rounding (PR #1650)', () => {
  test.each([
    ['9473bd2f', '903', '1000 × 0.95² = 902.5 rounds UP to 903'],
    ['0edf8463', '2,457', '4000 × 0.85³ = 2456.5'],
    ['f525f27b', '$72.23', '$75 × 0.9 × 1.07 = $72.225'],
  ])('%s is keyed %s (%s)', (id, key) => {
    const it = byId(id);
    expect(keyOf(it)).toBe(key);
    expect(it.answer.value).toBe(key);
  });
});

describe('audit 2026-10-07 #3: matrices, choice order, repeats (PR #1654)', () => {
  test('no stem explains its matrix notation any more', () => {
    ALL.forEach((it) => expect(it.prompt).not.toMatch(/row 1, row 2|listed by rows|separated by semicolons/));
  });

  test('Q12-style radical choices are in ascending order in every bank', () => {
    const { sortPermutation } = require('../../utils/actChoiceOrder');
    const out = ALL.filter((it) => it.options.some((o) => /√|π/.test(o.text)) && sortPermutation(it.options.map((o) => o.text)));
    expect(out.map((i) => i.problemId)).toEqual([]);
  });

  test('the |2x − 5| = 11 twin in Fable tests 3 and 4 is recognised as one question', () => {
    const A = require('../../utils/actTestAssembler');
    expect(A.nearCopy(A.fingerprint(byId('act-fable-t3q32')), A.fingerprint(byId('act-fable-t4q33')))).toBe(true);
  });
});

describe('audit 2026-10-07 #4: weak choices, overlap, ordering', () => {
  test('the train question offers no absurd time (D × S or D − S hours)', () => {
    BANKS.enhanced.filter((i) => /^A train covers/.test(i.prompt)).forEach((it) => {
      const [d, s] = it.prompt.match(/covers ([\d/]+) miles at a constant (\d+)/).slice(1).map((x) => (x.includes('/') ? x.split('/')[0] / x.split('/')[1] : Number(x)));
      const t = d / s;
      it.options.forEach((o) => {
        const v = o.text.replace(/ hours?$/, '');
        const n = v.includes('/') ? v.split('/')[0] / v.split('/')[1] : Number(v);
        expect(n).toBeLessThan(t * 3);   // nothing a student would rule out on sight
      });
    });
  });

  test('a trig-ratio area and a Pythagorean area are the same task on one form', () => {
    const A = require('../../utils/actTestAssembler');
    const a = A.fingerprint({ skillId: 'act-right-triangle-trigonometry', prompt: 'In right triangle ABC, angle C is the right angle, sin A = 5/13, and the hypotenuse AB is 52 units long. What is the area of triangle ABC, in square units?' });
    const b = A.fingerprint({ skillId: 'act-triangles-pythagorean-theorem', prompt: 'A right triangle has a hypotenuse of length 26 and one leg of length 10. What is the area of the triangle?' });
    expect(A.similarTask(a, b)).toBe(true);
  });

  test('two changing-mean questions are the same task, though they share no words', () => {
    const A = require('../../utils/actTestAssembler');
    const a = A.fingerprint({ skillId: 'act-average-median', prompt: 'The mean of 4 numbers is 19. When one of the numbers is removed, the mean of the remaining 3 numbers is 20. What number was removed?' });
    const b = A.fingerprint({ skillId: 'act-multi-step-arithmetic', prompt: "After 5 tests, Lena's average score is 84. She wants her average over 6 tests to be exactly 86. What score must she earn on the 6th test?" });
    expect(A.similarTask(a, b)).toBe(true);
    const c = A.fingerprint({ skillId: 'act-percentages', prompt: 'A jacket costs $60. What is 20% of the price?' });
    expect(A.similarTask(a, c)).toBe(false);
  });

  test('an IES item rated 4 by position no longer sorts among the hardest questions', () => {
    const { preciseDifficulty } = require('../../utils/actTestAssembler');
    const recipe = { source: 'act-ies-expansion', difficulty: 4 };
    expect(preciseDifficulty(recipe)).toBeLessThan(3.25);
    expect(preciseDifficulty({ source: 'act-fable', difficulty: 4 })).toBe(4);
    // A measured item ignores the authored scale entirely.
    expect(preciseDifficulty({ source: 'act-ies-expansion', difficulty: 4, calibration: { calibratedAt: new Date(), theta: 2 } })).toBeGreaterThan(4);
  });
});

describe('earlier audits (2026-10-05)', () => {
  test('ticket prices: no child ticket costs more than an adult one (PR #1644)', () => {
    BANKS.enhanced.filter((i) => /^Adult tickets cost \$/.test(i.prompt)).forEach((it) => {
      const [adult, child] = it.prompt.match(/\$(\d+)/g).slice(0, 2).map((x) => Number(x.slice(1)));
      expect(adult).toBeGreaterThan(child);
    });
  });

  test('the low-volume bank stays off forms (PR #1644)', () => {
    const { NOT_ON_FORMS } = require('../../utils/actTestAssembler');
    expect(NOT_ON_FORMS.test('low-volume-expansion-2026-07')).toBe(true);
  });
});
