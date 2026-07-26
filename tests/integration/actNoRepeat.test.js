/**
 * No re-test ever repeats an item the student has already seen.
 *
 * Repeating an item measures memory of the question, not the skill — it inflates
 * the round-over-round comparison the whole ACT bootcamp loop rests on. This
 * drives the REAL assembler against a real (in-memory) Problem collection with a
 * tiny blueprint, plays several rounds feeding each round's items back as the
 * seen-ledger, and asserts: zero overlap ever, and graceful exhaustion (not a
 * silent repeat) once the bank is used up.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Problem = require('../../models/problem');
const { assembleForm } = require('../../utils/actTestAssembler');

// 3 slots per form, one skill, N distinct items -> exhausts after N/3 rounds.
const BLUEPRINT = {
  testId: 'test-act', title: 'T', totalItems: 3, timeLimitMinutes: 5,
  categoryWeights: { 'cat-a': 3 },
  skillsByCategory: { 'cat-a': ['skill-1'] },
  difficultyRamp: [{ fromPosition: 1, toPosition: 45, targetDifficulty: 3 }],
};

let mem;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  const docs = [];
  for (let i = 1; i <= 9; i++) {
    docs.push({
      problemId: `p${i}`,
      skillId: 'skill-1',
      prompt: `Distinct question number ${i}?`,
      answer: { value: `${i}` },
      answerType: 'multiple-choice',
      options: [{ label: 'A', text: `${i}` }, { label: 'B', text: `${i + 1}` }, { label: 'C', text: `${i + 2}` }, { label: 'D', text: `${i + 3}` }],
      correctOption: 'A',
      difficulty: 3,
      isActive: true,
      source: 'test',
    });
  }
  await Problem.insertMany(docs);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

test('across rounds, no item is ever served twice; exhaustion is graceful', async () => {
  const seen = new Set();
  let round = 0;
  let lastCoverage = null;

  // Play until the assembler can no longer fill any slot with a fresh item.
  while (round < 10) {
    const form = await assembleForm({ blueprint: BLUEPRINT, seed: `u-${round}`, excludeIds: [...seen] });
    lastCoverage = form.coverage;
    const ids = form.items.map((it) => it.problemId);

    // (1) No item in this form was seen in ANY prior round.
    ids.forEach((id) => expect(seen.has(id)).toBe(false));
    // (2) No item repeats WITHIN the form either.
    expect(new Set(ids).size).toBe(ids.length);

    if (form.coverage.filled === 0) break;   // bank exhausted for this student
    ids.forEach((id) => seen.add(id));
    round++;
  }

  // 9 items / 3 per form = exactly 3 fresh rounds, then a 4th that fills nothing.
  expect(seen.size).toBe(9);
  expect(round).toBe(3);
  // The empty round reports it as EXHAUSTED (excluded>0), not "unseeded" (excluded=0).
  expect(lastCoverage.filled).toBe(0);
  expect(lastCoverage.excluded).toBe(9);
});

test('excludeIds defaults to none (unchanged behavior when omitted)', async () => {
  const form = await assembleForm({ blueprint: BLUEPRINT, seed: 'plain' });
  expect(form.coverage.excluded).toBe(0);
  expect(form.items.length).toBe(3);
});
