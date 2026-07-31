// tests/unit/lowVolumeExpansion.test.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Problem = require('../../models/problem');

const dir = path.join(__dirname, '..', '..', 'seeds', 'low-volume-expansion');
const load = (name) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, name))).toString('utf8'));
const items = [
  ...load('act-items.generated.json.gz'),
  ...load('calc3-items.generated.json.gz'),
  ...load('general-items.generated.json.gz'),
];

describe('low-volume problem-bank expansion', () => {
  test('contains 820 unique items: exactly 10 for each of 82 skills', () => {
    expect(items).toHaveLength(820);
    expect(new Set(items.map((item) => item.problemId)).size).toBe(820);
    expect(new Set(items.map((item) => item.prompt.trim().toLowerCase())).size).toBe(820);

    const counts = new Map();
    for (const item of items) counts.set(item.skillId, (counts.get(item.skillId) || 0) + 1);
    expect(counts.size).toBe(82);
    expect([...counts.values()].every((count) => count === 10)).toBe(true);
  });

  test('all items validate against the Problem schema', () => {
    const failures = items
      .map((item) => ({ id: item.problemId, error: new Problem(item).validateSync() }))
      .filter(({ error }) => error)
      .map(({ id, error }) => `${id}: ${Object.keys(error.errors).join(',')}`);
    expect(failures).toEqual([]);
  });

  test('every item has a valid four-choice answer key and explanation', () => {
    const bad = items.filter((item) => {
      const keyed = item.options?.find((option) => option.label === item.correctOption);
      return item.answerType !== 'multiple-choice'
        || item.options?.length !== 4
        || item.options.map((option) => option.label).join('') !== 'ABCD'
        || !keyed
        || String(keyed.text) !== String(item.answer?.value)
        || !item.explanation
        || item.explanation.length < 12;
    });
    expect(bad.map((item) => item.problemId)).toEqual([]);
  });

  test('answer checking accepts each keyed choice and answer text', () => {
    for (const item of items) {
      const doc = new Problem(item);
      expect(doc.checkAnswer(item.correctOption)).toBe(true);
      expect(doc.checkAnswer(item.answer.value)).toBe(true);
    }
  });

  test('source and content hashes make the bank safely reseedable', () => {
    expect(items.every((item) => item.source === 'low-volume-expansion-2026-07')).toBe(true);
    expect(items.every((item) => /^[a-f0-9]{64}$/.test(item.contentHash))).toBe(true);
  });

  // Regression guard. The seeder previously listed '*.generated.json' while the
  // repo tracks '*.generated.json.gz', so it threw "Missing ..." on every run
  // and this suite still reported green -- the test and the seeder disagreed
  // about which files constitute the bank. Assert they agree.
  test('the seeder reads exactly the files this suite validates', () => {
    const seeder = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'seedLowVolumeExpansion.js'),
      'utf8',
    );
    const referenced = [...seeder.matchAll(/'([\w-]+\.generated\.json(?:\.gz)?)'/g)].map((m) => m[1]);
    expect(referenced.sort()).toEqual([
      'act-items.generated.json.gz',
      'calc3-items.generated.json.gz',
      'general-items.generated.json.gz',
    ]);
    for (const name of referenced) {
      expect(fs.existsSync(path.join(dir, name))).toBe(true);
    }
  });

  test('every payload the seeder loads is a non-empty array of this source', () => {
    for (const name of ['act-items.generated.json.gz', 'calc3-items.generated.json.gz', 'general-items.generated.json.gz']) {
      const loaded = load(name);
      expect(Array.isArray(loaded)).toBe(true);
      expect(loaded.length).toBeGreaterThan(0);
      expect(loaded.every((item) => item.source === 'low-volume-expansion-2026-07')).toBe(true);
    }
  });
});
