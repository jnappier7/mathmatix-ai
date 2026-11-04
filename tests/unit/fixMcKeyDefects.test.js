/**
 * The 2026-11-03 MC key/option repair (scripts/fixMcKeyDefects.js) and the
 * Algebra 1 ingester fix behind it (scripts/ingestAlg1Items.py).
 *
 * Every Algebra 1 multiple-choice item is re-solved here from its own prompt —
 * never from its stored key — so a regenerated seed that drifts fails CI.
 */

const { RESOLVERS, keyWitness, planFix, checkAfter } = require('../../scripts/fixMcKeyDefects');
const { validateOptions, bankDefect } = require('../../scripts/regenerateStaleMcOptions');
const { compareAnswer } = require('../../utils/answerComparison');

const ALG1 = require('../../seeds/alg1-items.generated.json');
const alg1Mc = ALG1.filter((p) => p.answerType === 'multiple-choice');
const NUMLINES = require('../../seeds/alg1-assessments/alg1_m6.json');

const asSpec = (p) => ({ options: p.options, correctOption: p.correctOption, answer: p.answer });
const uminus = (s) => String(s).replace(/−/g, '-');

describe('RESOLVERS re-solve from the prompt alone', () => {
  test.each([
    ['volume-rectangular-prisms', 'Find the volume of a rectangular prism: length=4, width=6, height=4', '96 cubic units'],
    ['comparing-fractions', 'Compare: 7/8 ___ 6/7', '7/8 > 6/7'],
    ['comparing-fractions', 'Compare: 2/9 ___ 1/3', '2/9 < 1/3'],
    ['pythagorean-theorem', 'Is a triangle with sides 12, 16, 20 a right triangle?', 'Yes'],
    ['pythagorean-theorem', 'Is a triangle with sides 4, 5, 6 a right triangle?', 'No'],
    ['subtract-fractions', 'Subtract: 2/7 - 1/6', '5/42'],
    ['multiply-fractions', 'Multiply: 5/3 × 4/5', '4/3'],
    ['ratios', 'Simplify the ratio: 6:8', '3:4'],
    ['ratios', 'Simplify the ratio: 9:11', '9:11'],
    ['proportional-relationships', 'A recipe uses 2 cups flour for 24 cookies. How much for 36 cookies?', '3 cups'],
    ['simplify-rational-expressions', 'Simplify: (2x + 4)/2', 'x + 2'],
    ['ratio-concepts', 'The ratio 3:5 means:', '3 parts to 5 parts']
  ])('%s: %s', (skill, prompt, want) => {
    expect(RESOLVERS[skill](prompt)).toBe(want);
  });
});

describe('planFix: a wrong correctOption', () => {
  // The real shape: value is a letter, equivalents carry the letter AND its text
  const conceptItem = (over = {}) => ({
    skillId: 'box-plots',
    source: 'generated-2026-02',
    prompt: 'The five-number summary includes: min, Q1, median, Q3, and:',
    answer: { value: 'D', equivalents: ['D', 'max'] },
    answerType: 'multiple-choice',
    options: [{ label: 'A', text: 'range' }, { label: 'B', text: 'mode' }, { label: 'C', text: 'mean' }, { label: 'D', text: 'max' }],
    correctOption: 'B',
    ...over
  });

  test('before: BOTH the right pick and the wrongly keyed one grade correct', () => {
    const p = conceptItem();
    const spec = { ...p.answer, answerType: p.answerType, options: p.options, correctOption: p.correctOption };
    expect(['A', 'B', 'C', 'D'].filter((L) => compareAnswer(L, spec))).toEqual(['B', 'D']);
    expect(bankDefect(p)).toBe('correctOption does not grade correct');
  });

  test('re-points correctOption at the option the key names, and only that letter passes after', () => {
    const p = conceptItem();
    const plan = planFix(p, new Map());
    expect(plan.set).toEqual({ correctOption: 'D' });
    expect(checkAfter(p, plan.set)).toEqual([]);
  });

  test('refuses when the letter key and its text disagree (nothing to trust)', () => {
    const p = conceptItem({ answer: { value: 'D', equivalents: ['D', 'mode'] } });
    expect(keyWitness(p)).toBeNull();
    expect(planFix(p, new Map()).error).toBeDefined();
  });

  test('a computable item needs the re-solve to agree with the key', () => {
    const good = {
      skillId: 'subtract-fractions',
      prompt: 'Subtract: 4/5 - 1/5',
      answer: { value: '3/5', equivalents: ['0.6', '3/5'] },
      answerType: 'multiple-choice',
      options: [{ label: 'A', text: '5' }, { label: 'B', text: '2' }, { label: 'C', text: '4' }, { label: 'D', text: '3/5' }],
      correctOption: 'A'
    };
    expect(planFix(good, new Map()).set).toEqual({ correctOption: 'D' });
    const wrongKey = { ...good, answer: { value: '4', equivalents: [] }, prompt: 'Subtract: 4/5 - 1/5' };
    expect(planFix(wrongKey, new Map()).error).toMatch(/not independently confirmed/);
  });
});

describe('Algebra 1 seed: every MC item is keyed by its choice text and re-solves', () => {
  test('there are MC items to check', () => {
    expect(alg1Mc.length).toBeGreaterThanOrEqual(24);
  });

  test.each(alg1Mc.map((p) => [p.problemId, p]))('%s: one option grades correct, and it is the keyed one', (_, p) => {
    expect(validateOptions(asSpec(p))).toEqual([]);
    expect(bankDefect(p)).toBeNull();
    const keyed = p.options.find((o) => o.label === p.correctOption);
    expect(keyed.text).toBe(p.answer.value);
  });

  test('no choice prints its own letter ("A) A) …")', () => {
    for (const p of alg1Mc) {
      for (const o of p.options) expect(o.text).not.toMatch(new RegExp(`^${o.label}\\)\\s`));
    }
  });

  test('ordered-pair keys grade with an ASCII minus too', () => {
    const p = alg1Mc.find((x) => x.problemId === 'alg1-m3-test-core-n7-v3');
    expect(compareAnswer('(-3, 1)', { value: p.answer.value, equivalents: p.answer.equivalents })).toBe(true);
  });

  // Re-solve each family from the prompt
  const solve = {
    'identifying-functions'(p) {
      const xs = [...p.prompt.match(/\{(.+)\}/)[1].matchAll(/\((−?-?\d+), (−?-?\d+)\)/g)].map((m) => Number(uminus(m[1])));
      const breaking = p.options.filter((o) => xs.includes(Number(uminus(o.text.match(/\((−?-?\d+),/)[1]))));
      expect(breaking).toHaveLength(1);
      return breaking[0].text;
    },
    'absolute-value-graphs-transformations'(p) {
      const [, hs, h, ks, k] = uminus(p.prompt).match(/\|x ([+-]) (\d+)\| ([+-]) (\d+)/);
      const unit = (n) => `${n} unit${n === '1' ? '' : 's'}`;
      return `${unit(h)} ${hs === '-' ? 'right' : 'left'} and ${unit(k)} ${ks === '+' ? 'up' : 'down'}`;
    },
    'writing-linear-equations-slope-intercept'(p) {
      const [, x, y, m] = uminus(p.prompt).match(/\((-?\d+), (-?\d+)\) with slope (-?\d+)/).map(Number);
      const b = y - m * x;
      const mx = m === 1 ? 'x' : m === -1 ? '−x' : `${String(m).replace('-', '−')}x`;
      return b === 0 ? `y = ${mx}` : `y = ${mx} ${b < 0 ? '−' : '+'} ${Math.abs(b)}`;
    },
    'matching-inequality-graphs'(p) {
      // ax + b OP c  or  b − ax OP c  →  x OP' bound; then find the drawn line
      const s = uminus(p.prompt).match(/of (.+)\?$/)[1];
      let a; let b; let op; let c;
      let m = s.match(/^(-?\d+)x \+ (\d+) (≥|≤) (-?\d+)$/);
      if (m) { a = +m[1]; b = +m[2]; op = m[3]; c = +m[4]; } else {
        m = s.match(/^(\d+) - (\d+)x (≥|≤) (-?\d+)$/);
        b = +m[1]; a = -m[2]; op = m[3]; c = +m[4];
      }
      const bound = (c - b) / a;
      const geq = (op === '≥') !== (a < 0);
      const drawn = p.figure.params.findIndex((q) => q.point === bound && q.closed && q.direction === (geq ? 'right' : 'left'));
      expect(drawn).toBeGreaterThanOrEqual(0);
      expect(p.figure.params.filter((q) => q.point === bound && q.closed && q.direction === (geq ? 'right' : 'left'))).toHaveLength(1);
      return `Graph ${'ABCD'[drawn]}`;
    }
  };

  test.each(alg1Mc.filter((p) => solve[p.skillId]).map((p) => [p.problemId, p]))('%s re-solves to its key', (_, p) => {
    expect(solve[p.skillId](p)).toBe(p.answer.value);
  });

  test('the "Which graph…" items ship their graphs: one figure, every choice drawn and captioned', () => {
    const graphItems = alg1Mc.filter((p) => p.skillId === 'matching-inequality-graphs');
    expect(graphItems).toHaveLength(6);
    for (const p of graphItems) {
      expect(p.svg).toMatch(/^<svg/);
      for (const o of p.options) expect(p.svg).toContain(`>${o.text}</text>`);
      expect((p.svg.match(/<circle /g) || []).length).toBe(4);
    }
  });

  test('the drawn choices are the source\'s choices_figures, version for version', () => {
    const src = [...NUMLINES.quiz.items, ...NUMLINES.test.items].filter((it) => it.choices_figures);
    const drawn = alg1Mc.filter((p) => p.skillId === 'matching-inequality-graphs').map((p) => p.figure.params);
    expect(drawn).toEqual(src.flatMap((it) => it.choices_figures.params));
  });
});
