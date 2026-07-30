// tests/unit/bankTopup.test.js
const fs = require('fs');
const path = require('path');
const Problem = require('../../models/problem');

const file = path.join(__dirname, '..', '..', 'seeds', 'bank-topup-items.generated.json');
const items = JSON.parse(fs.readFileSync(file, 'utf8'));

const SOURCE = 'bank-topup-2026-07';
const EXPECTED_SKILLS = 42;
const EXPECTED_PER_SKILL = 10;

describe('low-volume bank top-up', () => {
  test('contains 420 unique items: exactly 10 for each of 42 skills', () => {
    expect(items).toHaveLength(EXPECTED_SKILLS * EXPECTED_PER_SKILL);
    expect(new Set(items.map((item) => item.problemId)).size).toBe(items.length);
    expect(new Set(items.map((item) => item.prompt.trim().toLowerCase())).size).toBe(items.length);

    const counts = new Map();
    for (const item of items) counts.set(item.skillId, (counts.get(item.skillId) || 0) + 1);
    expect(counts.size).toBe(EXPECTED_SKILLS);
    expect([...counts.values()].every((count) => count === EXPECTED_PER_SKILL)).toBe(true);
  });

  test('all items validate against the Problem schema', () => {
    const failures = items
      .map((item) => ({ id: item.problemId, error: new Problem(item).validateSync() }))
      .filter(({ error }) => error)
      .map(({ id, error }) => `${id}: ${Object.keys(error.errors).join(',')}`);
    expect(failures).toEqual([]);
  });

  // Unlike the low-volume-expansion bank this one is mostly constructed-response,
  // matching the answer modality of the legacy items for these K-12 skills.
  // Only the calc3 block is multiple-choice.
  test('multiple-choice items have a valid four-choice answer key', () => {
    const mc = items.filter((item) => item.answerType === 'multiple-choice');
    expect(mc).toHaveLength(60);
    const bad = mc.filter((item) => {
      const keyed = item.options?.find((option) => option.label === item.correctOption);
      return item.options?.length !== 4
        || item.options.map((option) => option.label).join('') !== 'ABCD'
        || new Set(item.options.map((option) => String(option.text).trim())).size !== 4
        || !keyed
        || String(keyed.text) !== String(item.answer?.value);
    });
    expect(bad.map((item) => item.problemId)).toEqual([]);
  });

  test('constructed-response items list their own answer among the accepted forms', () => {
    const cr = items.filter((item) => item.answerType === 'constructed-response');
    expect(cr).toHaveLength(360);
    const bad = cr.filter((item) => {
      const equivalents = item.answer?.equivalents || [];
      return !equivalents.includes(item.answer?.value)
        || new Set(equivalents).size !== equivalents.length
        || equivalents.some((form) => form !== form.trim())
        || (item.options || []).length !== 0;
    });
    expect(bad.map((item) => item.problemId)).toEqual([]);
  });

  test('answer checking accepts every keyed and equivalent form', () => {
    for (const item of items) {
      const doc = new Problem(item);
      expect(doc.checkAnswer(item.answer.value)).toBe(true);
      if (item.answerType === 'multiple-choice') {
        expect(doc.checkAnswer(item.correctOption)).toBe(true);
      }
    }
  });

  test('every item carries an explanation and a 1-5 difficulty', () => {
    const bad = items.filter((item) => !item.explanation
      || item.explanation.length < 12
      || !Number.isInteger(item.difficulty)
      || item.difficulty < 1
      || item.difficulty > 5);
    expect(bad.map((item) => item.problemId)).toEqual([]);
  });

  test('each skill spans at least three difficulty levels', () => {
    const spread = new Map();
    for (const item of items) {
      if (!spread.has(item.skillId)) spread.set(item.skillId, new Set());
      spread.get(item.skillId).add(item.difficulty);
    }
    const flat = [...spread.entries()].filter(([, levels]) => levels.size < 3).map(([skill]) => skill);
    expect(flat).toEqual([]);
  });

  test('source and content hashes make the bank safely reseedable', () => {
    expect(items.every((item) => item.source === SOURCE)).toBe(true);
    expect(items.every((item) => /^[a-f0-9]{64}$/.test(item.contentHash))).toBe(true);
  });

  test('does not collide with the low-volume-expansion bank', () => {
    const dir = path.join(__dirname, '..', '..', 'seeds', 'low-volume-expansion');
    if (!fs.existsSync(dir)) return;
    const zlib = require('zlib');
    const other = ['act-items.generated.json.gz', 'calc3-items.generated.json.gz', 'general-items.generated.json.gz']
      .flatMap((name) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, name))).toString('utf8')));
    const otherIds = new Set(other.map((item) => item.problemId));
    const otherPrompts = new Set(other.map((item) => item.prompt.trim().toLowerCase()));
    expect(items.filter((item) => otherIds.has(item.problemId))).toEqual([]);
    expect(items.filter((item) => otherPrompts.has(item.prompt.trim().toLowerCase()))).toEqual([]);
  });
});
