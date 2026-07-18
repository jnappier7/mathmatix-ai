// tests/unit/satItems.test.js
// Guards the Digital SAT Math bank ingested under the UNIFIED taxonomy: every
// generated Problem references a real unified skill_id (so BKT / mastery /
// skillFocus recognize it), MC items carry a 4-choice A-D key, grid-in (SPR)
// items carry an auto-scorable answer value, and the weekly assessment map is
// well-formed. Requiring the Problem model loads mongoose but needs no DB.

const path = require('path');
const Problem = require('../../models/problem');

const seed = (f) => require(path.join('../../seeds', f));

const taxonomy = seed('unified-taxonomy/math_taxonomy.json');
const items = seed('sat-items.generated.json');
const amap = seed('sat-assessment-map.json');

const taxIds = new Set(taxonomy.skills.map((s) => s.skill_id));

describe('SAT Math bank (unified taxonomy)', () => {
  test('132 Problem docs, unique ids, valid against the Problem schema', () => {
    expect(items).toHaveLength(132);
    const ids = new Set(items.map((i) => i.problemId));
    expect(ids.size).toBe(132);
    const failures = items
      .map((it) => new Problem(it).validateSync())
      .filter(Boolean)
      .map((e) => Object.keys(e.errors).join(','));
    expect(failures).toEqual([]);
  });

  test('every item maps to a real unified taxonomy skill_id', () => {
    const unknown = [...new Set(items.map((i) => i.skillId))].filter((id) => !taxIds.has(id));
    expect(unknown).toEqual([]);
  });

  test('every MC item is 4-choice (A-D) with a valid answer key', () => {
    const mc = items.filter((i) => i.answerType === 'multiple-choice');
    expect(mc.length).toBeGreaterThan(0);
    const bad = mc.filter(
      (i) => (i.options || []).length !== 4
        || !['A', 'B', 'C', 'D'].includes(i.correctOption)
        || !i.options.some((o) => o.label === i.correctOption),
    );
    expect(bad.map((i) => i.problemId)).toEqual([]);
  });

  test('every grid-in (SPR) item is auto-scorable', () => {
    const spr = items.filter((i) => i.answerType === 'constructed-response');
    expect(spr.length).toBeGreaterThan(0);
    const bad = spr.filter(
      (i) => i.answer == null
        || i.answer.value == null
        || String(i.answer.value).trim() === ''
        || !Array.isArray(i.answer.equivalents),
    );
    expect(bad.map((i) => i.problemId)).toEqual([]);
    // grid-in items are numeric/fraction — never multiple choice
    expect(spr.every((i) => !i.options || i.options.length === 0)).toBe(true);
  });

  test('grid-in answer checking accepts the canonical value and its equivalents', () => {
    const spr = items.filter((i) => i.answerType === 'constructed-response');
    for (const it of spr) {
      const doc = new Problem(it);
      expect(doc.checkAnswer(it.answer.value)).toBe(true);
      for (const eq of it.answer.equivalents) {
        expect(doc.checkAnswer(eq)).toBe(true);
      }
    }
  });

  test('5 weekly diagnostics, each ~22 auto-scored items with matching refs', () => {
    const weeks = Object.keys(amap).sort();
    expect(weeks).toEqual(['1', '2', '3', '4', '5']);
    const byId = new Map(items.map((i) => [i.problemId, i]));
    for (const w of weeks) {
      const wk = amap[w];
      expect(wk.items.length).toBe(wk.itemCount);
      expect(wk.mcCount + wk.sprCount).toBe(wk.itemCount);
      expect(wk.itemCount).toBeGreaterThanOrEqual(20);
      // every ref points at a seeded Problem with the same unified skillId
      for (const ref of wk.items) {
        const doc = byId.get(ref.problemId);
        expect(doc).toBeTruthy();
        expect(doc.skillId).toBe(ref.skillId);
        expect(taxIds.has(ref.skillId)).toBe(true);
      }
    }
  });
});
