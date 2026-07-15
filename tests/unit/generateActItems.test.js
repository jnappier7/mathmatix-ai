// tests/unit/generateActItems.test.js
// Correctness gate for the ACT item generator. Runs in CI without a DB
// (generate()/assemblyProof() don't touch mongoose). If any template ever
// emits an item whose key doesn't match its options, this fails loudly — the
// whole point is that a wrong answer key cannot ship.

const { generate, assemblyProof } = require('../../scripts/generateActItems');
const blueprint = require('../../seeds/act-math-blueprint.json');

describe('generateActItems', () => {
  const { items } = generate(8);

  test('produces items for every content skill in the blueprint', () => {
    const expected = new Set(Object.values(blueprint.skillsByCategory).flat());
    const got = new Set(items.map(i => i.skillId));
    for (const s of expected) expect(got.has(s)).toBe(true);
  });

  test('every item is structurally valid and self-consistent', () => {
    for (const it of items) {
      expect(typeof it.problemId).toBe('string');
      expect(it.skillId.startsWith('act-')).toBe(true);
      expect(typeof it.prompt).toBe('string');
      expect(it.prompt.length).toBeGreaterThan(0);
      expect(it.answerType).toBe('multiple-choice');
      expect(it.options).toHaveLength(5);
      expect(it.difficulty).toBeGreaterThanOrEqual(1);
      expect(it.difficulty).toBeLessThanOrEqual(5);
      expect(it.gradeBand).toBe('8-12');

      // The correct letter must exist and map to the stored answer value…
      const chosen = it.options.find(o => o.label === it.correctOption);
      expect(chosen).toBeDefined();
      expect(chosen.text).toBe(it.answer.value);

      // …and EXACTLY ONE option may equal the answer (no ambiguous keys).
      const matches = it.options.filter(o => o.text === it.answer.value);
      expect(matches).toHaveLength(1);

      // Options are distinct.
      const texts = new Set(it.options.map(o => o.text));
      expect(texts.size).toBe(5);
    }
  });

  test('the bank fills a complete 60-item form', () => {
    const proof = assemblyProof(items);
    expect(proof.filled).toBe(proof.total);
    expect(proof.total).toBe(60);
  });
});
