/**
 * The act-enhanced-2026-09 drop, mapped onto this blueprint's taxonomy.
 *
 * The drop carries its own 84-skill taxonomy and NOT ONE of those ids appears
 * in seeds/act-math-blueprint.json. assembleForm builds every slot from the
 * blueprint's skillsByCategory, so ingested as-is all 1,200 items would sit in
 * the bank permanently undrawable — seeded, counted, and never served, with
 * nothing failing to say so. The mapping is the whole point of the ingest, so
 * it is what this file guards.
 *
 * Owner's call (2026-09-21) was to map the finer taxonomy DOWN onto ours rather
 * than adopt it, because the review flow is built on naming a pattern: three
 * misses split across `percent-change`, `percent-applications` and
 * `reverse-percent` read as three unrelated accidents, which is the exact
 * failure skill-clustered review exists to end.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '../..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const { SKILL_MAP, promptSignature } = require('../../scripts/ingestActEnhancedItems');
const blueprint = read('seeds/act-math-blueprint.json');
const items = read('seeds/act-enhanced/act-items.generated.json');
const BLUEPRINT_SKILLS = new Set(Object.values(blueprint.skillsByCategory).flat());

describe('the mapping lands on skills the assembler can actually draw', () => {
  test('every mapping target is a blueprint skill', () => {
    Object.entries(SKILL_MAP).forEach(([fine, act]) => {
      expect(BLUEPRINT_SKILLS.has(act)).toBe(true);
      expect(fine).not.toBe(act);
    });
  });

  test('every ingested item carries a blueprint skill', () => {
    items.forEach((p) => expect(BLUEPRINT_SKILLS.has(p.skillId)).toBe(true));
  });

  test('no item kept the drop\'s own skill id', () => {
    const fine = new Set(Object.keys(SKILL_MAP));
    items.forEach((p) => expect(fine.has(p.skillId)).toBe(false));
  });

  test('the finer id is preserved as a tag, so splitting a skill later is a data decision', () => {
    items.forEach((p) => {
      expect(p.tags.some((t) => t.startsWith('fine:'))).toBe(true);
    });
    const fineTags = new Set(items.flatMap((p) => p.tags.filter((t) => t.startsWith('fine:'))));
    expect(fineTags.size).toBeGreaterThan(50);
  });
});

describe('the payload speaks this bank\'s dialect', () => {
  test('options are {label,text} with A-D labels, not bare strings', () => {
    items.forEach((p) => {
      expect(p.options).toHaveLength(4);
      expect(p.options.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D']);
      p.options.forEach((o) => expect(typeof o.text).toBe('string'));
    });
  });

  test('correctOption is a LETTER, never the drop\'s 0-based index', () => {
    // CLAUDE.md: "MC answers travel as the letter label ('C'), not the option
    // index." Leaving the index in place would mark students wrong against a
    // grader that compares letters.
    items.forEach((p) => {
      expect(['A', 'B', 'C', 'D']).toContain(p.correctOption);
      expect(typeof p.correctOption).not.toBe('number');
    });
  });

  test('the keyed option text equals answer.value on every item', () => {
    items.forEach((p) => {
      const key = p.options.find((o) => o.label === p.correctOption);
      expect(key).toBeTruthy();
      expect(key.text.trim()).toBe(String(p.answer.value).trim());
    });
  });

  test('no duplicate option text within an item', () => {
    items.forEach((p) => expect(new Set(p.options.map((o) => o.text)).size).toBe(4));
  });

  test('difficulty is in range, and the drop\'s ceiling is recorded honestly', () => {
    const levels = new Set(items.map((p) => p.difficulty));
    levels.forEach((d) => { expect(d).toBeGreaterThanOrEqual(1); expect(d).toBeLessThanOrEqual(5); });
    // The drop tops out at 3. It cannot fill the hard end of the blueprint's
    // ramp, so the existing banks still have to — worth failing loudly if a
    // future drop is assumed to cover the whole ramp.
    expect(Math.max(...levels)).toBeLessThanOrEqual(3);
  });

  test('every item is tagged to its source and active', () => {
    items.forEach((p) => {
      expect(p.source).toBe('act-enhanced-2026-09');
      expect(p.isActive).toBe(true);
      expect(p.answerType).toBe('multiple-choice');
    });
  });
});

describe('nothing collides with what the bank already holds', () => {
  const existing = [
    ...read('seeds/act-fable-items.generated.json'),
    ...JSON.parse(zlib.gunzipSync(fs.readFileSync(
      path.join(ROOT, 'seeds/low-volume-expansion/act-items.generated.json.gz'))).toString('utf8')),
    ...read('seeds/act-ies-expansion/ies-items.generated.json'),
  ];

  test('problemIds are unique within the drop', () => {
    const ids = items.map((p) => p.problemId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('and do not collide with any existing ACT bank', () => {
    const have = new Set(existing.map((p) => p.problemId));
    items.forEach((p) => expect(have.has(p.problemId)).toBe(false));
  });

  test('no ingested item repeats a prompt SHAPE already in the bank', () => {
    // pickDiverse dedups a FORM by this signature; a shape already in the bank
    // would let two look-alikes reach one student across two tests.
    const have = new Set(existing.map((p) => promptSignature(p.prompt)));
    items.forEach((p) => expect(have.has(promptSignature(p.prompt))).toBe(false));
  });
});

describe('what it buys, stated plainly', () => {
  test('it more than doubles the fully-fresh forms a student can sit', () => {
    const existing = [
      ...read('seeds/act-fable-items.generated.json'),
      ...JSON.parse(zlib.gunzipSync(fs.readFileSync(
        path.join(ROOT, 'seeds/low-volume-expansion/act-items.generated.json.gz'))).toString('utf8')),
      ...read('seeds/act-ies-expansion/ies-items.generated.json'),
    ];
    const skillToCat = {};
    Object.entries(blueprint.skillsByCategory).forEach(([cat, skills]) => {
      skills.forEach((s) => { skillToCat[s] = cat; });
    });
    const depth = (bank) => {
      const per = {};
      bank.forEach((b) => { const c = skillToCat[b.skillId]; if (c) per[c] = (per[c] || 0) + 1; });
      return Math.min(...Object.entries(blueprint.categoryWeights)
        .map(([c, slots]) => Math.floor((per[c] || 0) / slots)));
    };
    const before = depth(existing);
    const after = depth([...existing, ...items]);
    expect(after).toBeGreaterThan(before * 1.8);
    expect(after).toBeGreaterThanOrEqual(30);
  });

  test('coverage is counted in distinct SHAPES, not raw item count', () => {
    // Most of the drop is numeric variants of a smaller set of templates. That
    // is real value — it is what keeps a re-test fresh — but it is not the same
    // as 1,195 distinct questions, and saying so stops the next person
    // over-reading the number.
    const shapes = new Set(items.map((p) => promptSignature(p.prompt))).size;
    expect(shapes).toBeLessThan(items.length / 2);
    expect(shapes).toBeGreaterThan(250);
  });
});

describe('the seed plan runs it in the one order that works', () => {
  const plan = fs.readFileSync(path.join(ROOT, 'scripts/seedAll.js'), 'utf8');

  test('the enhanced bank is registered', () => {
    expect(plan).toMatch(/key: 'act-enhanced-items'/);
    expect(plan).toMatch(/seedActEnhancedItems\.js/);
  });

  test('and runs BEFORE the answer.equivalents backfill', () => {
    // CLAUDE.md: each bank re-upserts answer.value from JSON, so a backfill
    // that runs first has its typography equivalents dropped — and students
    // get marked wrong for correct answers again.
    expect(plan.indexOf("key: 'act-enhanced-items'"))
      .toBeLessThan(plan.indexOf("key: 'answer-equivalents'"));
  });
});
