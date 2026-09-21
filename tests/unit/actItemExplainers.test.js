/**
 * Worked solutions for the act-enhanced bank — derived, not written.
 *
 * The drop shipped 1,195 items with an EMPTY explanation. utils/actReview.js
 * reads that field into the tutor's prompt as "WORKED SOLUTION (for YOUR
 * reference)" and prints "(none stored)" when it is missing. Review still runs
 * without it — the tutor is told to solve the question itself first — but what
 * is lost is the distractor diagnosis, the "C is what you get if you average
 * the two speeds instead of dividing total distance by total time" that makes
 * review teach rather than merely correct.
 *
 * Every explanation here is produced by SOLVING the item from its own prompt,
 * so the derivation doubles as a key audit: an item whose stored key disagrees
 * with the derivation gets no explanation at all and is reported instead.
 * Writing confident prose around a bad key would make the tutor teach the wrong
 * thing with conviction — strictly worse than staying silent.
 */
const fs = require('fs');
const path = require('path');
const { explainItem, EXPLAINERS, parseNum, sameValue } = require('../../utils/actItemExplainers');

const ROOT = path.join(__dirname, '../..');
const items = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'seeds/act-enhanced/act-items.generated.json'), 'utf8'));

const results = items.map((item) => ({ item, r: explainItem(item) }));

describe('the derivation agrees with the bank, item by item', () => {
  test('NO item in the bank has a key the solver contradicts', () => {
    // This is the assertion that matters most. It re-solves 1,000+ items from
    // scratch on every CI run; a future edit that breaks a key, or a bad key in
    // a future drop, fails here rather than in front of a student.
    const bad = results.filter((x) => x.r.status === 'key-mismatch')
      .map((x) => `${x.item.problemId}: derived ${JSON.stringify(x.r.derived)} vs stored ${JSON.stringify(x.r.stored)}`);
    expect(bad).toEqual([]);
  });

  test('no explainer throws or bails on an item it claimed to match', () => {
    const broken = results.filter((x) => x.r.status === 'solve-threw' || x.r.status === 'no-key');
    expect(broken).toEqual([]);
  });
});

describe('coverage', () => {
  const explained = items.filter((p) => p.explanation && p.explanation.trim());

  test('most of the bank is explained', () => {
    expect(explained.length / items.length).toBeGreaterThan(0.85);
  });

  test('every explanation in the bank is one the solver still stands behind', () => {
    // Guards against an explanation going stale: if an explainer changes, the
    // text sitting in the bank must still be what it produces.
    const drifted = results
      .filter((x) => x.item.explanation && x.item.explanation.trim() && x.r.status === 'ok')
      .filter((x) => x.item.explanation !== x.r.explanation)
      .map((x) => x.item.problemId);
    expect(drifted).toEqual([]);
  });

  test('an explanation actually explains — it is not a restated answer', () => {
    explained.forEach((p) => {
      expect(p.explanation.length).toBeGreaterThan(40);
    });
  });

  test('nearly all of them name what a wrong choice rewards', () => {
    // The whole reason this file exists. A worked solution that only shows the
    // right path leaves the student's actual error undiagnosed.
    const named = explained.filter((p) => /Wrong choices:/.test(p.explanation));
    expect(named.length / explained.length).toBeGreaterThan(0.9);
  });

  test('a named distractor is always one of the item\'s real options', () => {
    results.filter((x) => x.r.status === 'ok' && x.r.namedDistractors > 0).forEach(({ item, r }) => {
      const labels = item.options.map((o) => o.label);
      const cited = [...r.explanation.matchAll(/(?:^|; )([A-D])\) /g)].map((mm) => mm[1]);
      cited.forEach((label) => {
        expect(labels).toContain(label);
        expect(label).not.toBe(item.correctOption);   // never "explain" the key as an error
      });
    });
  });
});

describe('the number comparison behind the audit', () => {
  test('reads the units the bank writes', () => {
    expect(parseNum('$25.60')).toBeCloseTo(25.6);
    expect(parseNum('36.7%')).toBeCloseTo(36.7);
    expect(parseNum('52°')).toBe(52);
    expect(parseNum('4/3 hours')).toBeCloseTo(4 / 3);
    expect(parseNum('1,200')).toBe(1200);
  });

  test('is not fooled by things that are not numbers', () => {
    expect(parseNum('9π')).toBeNull();
    expect(parseNum('x + 4')).toBeNull();
    expect(parseNum(null)).toBeNull();
  });

  test('matches to the option\'s own precision, not to float equality', () => {
    // "to the nearest whole number" lands on .5 often enough to matter; which
    // way that tips is a rounding convention, not a disagreement about maths.
    expect(sameValue(902.4999999, '902')).toBe(true);
    expect(sameValue(36.666, '36.7')).toBe(true);
    expect(sameValue(36.6, '36.7')).toBe(false);
  });

  test('compares exact forms as text', () => {
    expect(sameValue('64π/3', '64π/3')).toBe(true);
    expect(sameValue('3√2', '3√2')).toBe(true);
    expect(sameValue('3√2', '√18')).toBe(false);
  });
});

describe('the explainers themselves', () => {
  test('every id is unique', () => {
    const ids = EXPLAINERS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('no explainer fires on a prompt from a different shape', () => {
    // A loose regex that half-matches another template would produce a
    // confident, WRONG worked solution — worse than none at all. Every item is
    // claimed by at most one explainer.
    items.forEach((p) => {
      const hits = EXPLAINERS.filter((e) => e.match.test(p.prompt)).map((e) => e.id);
      expect(hits.length).toBeLessThanOrEqual(1);
    });
  });

  test('a prompt that matches nothing is reported, not guessed at', () => {
    expect(explainItem({ prompt: 'Describe the weather in some detail today.', options: [], correctOption: 'A' }).status)
      .toBe('unmatched');
    expect(explainItem(null).status).toBe('unmatched');
  });
});

describe('worked examples, end to end', () => {
  const run = (prompt, options, correctOption) => explainItem({
    prompt,
    correctOption,
    options: options.map((text, i) => ({ label: 'ABCD'[i], text })),
  });

  test('average speed: names the average-the-speeds trap by its letter', () => {
    const r = run('A driver travels 60 miles at 40 mph, then 120 miles at 20 mph. What is the average speed for the whole trip, in miles per hour?',
      ['7.5', '24', '30', '180'], 'B');
    expect(r.status).toBe('ok');
    expect(r.explanation).toMatch(/total distance ÷ total TIME/);
    expect(r.explanation).toMatch(/C\) 30 averages the two speeds/);
    expect(r.explanation).toMatch(/D\) 180 reports the total distance/);
  });

  test('a mis-keyed item gets no explanation at all', () => {
    // Same question, key deliberately moved to the wrong choice.
    const r = run('A triangle has a base of 10 and a height of 7. What is its area?',
      ['35', '70', '17', '24'], 'B');
    expect(r.status).toBe('key-mismatch');
    expect(r.explanation).toBeUndefined();
    expect(r.derived).toBe(35);
  });
});
