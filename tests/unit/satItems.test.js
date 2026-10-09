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
  // 132 weekly-diagnostic items (sat_w1..5) plus every bank batch
  // (seeds/sat-math/sat_bank_*.json) — bank batches add full-form depth.
  const fs = require('fs');
  const bankDir = path.join(__dirname, '../../seeds/sat-math');
  const bankItems = fs.readdirSync(bankDir)
    .filter((f) => /^sat_bank_.+\.json$/.test(f))
    .reduce((n, f) => n + JSON.parse(fs.readFileSync(path.join(bankDir, f), 'utf8')).items.length, 0);

  test('every weekly and bank item is a Problem doc: unique ids, valid against the schema', () => {
    expect(items.filter((i) => /^sat-math-w\d+q\d+$/.test(i.problemId))).toHaveLength(132);
    expect(items).toHaveLength(132 + bankItems);
    const ids = new Set(items.map((i) => i.problemId));
    expect(ids.size).toBe(items.length);
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

  test('bank items are on no weekly diagnostic, and every bank item is tagged with its batch', () => {
    const onRail = new Set(Object.values(amap).flatMap((wk) => wk.items.map((r) => r.problemId)));
    const bank = items.filter((i) => !/^sat-math-w\d+q\d+$/.test(i.problemId));
    expect(bank.length).toBe(bankItems);
    expect(bank.filter((i) => onRail.has(i.problemId))).toEqual([]);
    for (const it of bank) {
      const m = it.problemId.match(/^sat-math-(.+)q\d+$/);
      expect(m).toBeTruthy();
      expect(it.tags).toContain(`bank-${m[1]}`);
      expect(it.source).toBe('sat-fable');
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
