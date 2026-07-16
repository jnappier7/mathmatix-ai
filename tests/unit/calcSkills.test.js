// tests/unit/calcSkills.test.js
// Guards the AP Calc bootcamp skill wiring: every generated MC Problem references
// a real AP Calc catalog skillId (so BKT / mastery / skillFocus recognize it), the
// weekly assessment map is well-formed, and each week is a 15-MC + 9-point-FRQ
// diagnostic. Requiring the Problem model loads mongoose but needs no DB.

const path = require('path');
const Problem = require('../../models/problem');

const seed = (f) => require(path.join('../../seeds', f));

const catalog = seed('skills-ap-calculus-ab.json');
const items = seed('calc-items.generated.json');
const amap = seed('calc-assessment-map.json');

const catalogIds = new Set(catalog.map((s) => s.skillId));

describe('AP Calc bootcamp bank', () => {
  test('75 MC Problem docs, unique ids, valid against the Problem schema', () => {
    expect(items).toHaveLength(75);
    const ids = new Set(items.map((i) => i.problemId));
    expect(ids.size).toBe(75);
    const failures = items
      .map((it) => new Problem(it).validateSync())
      .filter(Boolean)
      .map((e) => Object.keys(e.errors).join(','));
    expect(failures).toEqual([]);
  });

  test('every item maps to a real AP Calc catalog skillId', () => {
    const unknown = [...new Set(items.map((i) => i.skillId))].filter((id) => !catalogIds.has(id));
    expect(unknown).toEqual([]);
  });

  test('every MC item is 4-choice with a valid answer key', () => {
    const bad = items.filter(
      (i) => i.answerType !== 'multiple-choice'
        || (i.options || []).length !== 4
        || !['A', 'B', 'C', 'D'].includes(i.correctOption),
    );
    expect(bad.map((i) => i.problemId)).toEqual([]);
  });

  test('5 weekly diagnostics, each 15 MC + a 9-point rubric-scored FRQ', () => {
    const weeks = Object.keys(amap).sort();
    expect(weeks).toEqual(['1', '2', '3', '4', '5']);
    for (const w of weeks) {
      const wk = amap[w];
      expect(wk.mc).toHaveLength(15);
      expect(wk.frq.points).toBe(9);
      expect(wk.frq.parts.length).toBeGreaterThanOrEqual(3);
      // each FRQ part carries rubric point descriptors
      expect(wk.frq.parts.every((p) => Array.isArray(p.rubric) && p.rubric.length > 0)).toBe(true);
      // the FRQ maps to a catalog skill too
      expect(catalogIds.has(wk.frq.skillId)).toBe(true);
    }
  });
});
