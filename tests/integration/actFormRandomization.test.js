/**
 * Every ACT form draws from the WHOLE bank, not its front slice.
 *
 * The assembler used to build each slot's candidate pool with
 * `Problem.find(query).limit(16)` and no sort, i.e. the first 16 matches in
 * storage order — identical on every form. The seed only rotated which skill
 * each slot asked for, so forms overlapped heavily: on the real ~950-item bank
 * ten guest tests shared ~12 of 45 questions pairwise (up to 25) and used only
 * 173 distinct items. Pools are now a seeded random draw over all matches
 * (utils/actTestAssembler.js drawPool).
 *
 * Pinned here:
 *   1. The same seed still reproduces the same form.
 *   2. Different seeds produce different forms that reach past the first 16
 *      stored items.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Problem = require('../../models/problem');
const { assembleForm } = require('../../utils/actTestAssembler');

const BLUEPRINT = {
  testId: 'test-act', title: 'T', totalItems: 5, timeLimitMinutes: 5,
  categoryWeights: { 'cat-a': 5 },
  skillsByCategory: { 'cat-a': ['skill-1'] },
  difficultyRamp: [{ fromPosition: 1, toPosition: 45, targetDifficulty: 3 }],
};

// Fixed _ids so the seeded shuffle is fully deterministic across runs.
const oid = (i) => new mongoose.Types.ObjectId(i.toString(16).padStart(24, '0'));

let mem;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  const docs = [];
  for (let i = 1; i <= 60; i++) {
    docs.push({
      _id: oid(i),
      problemId: `r${i}`,
      skillId: 'skill-1',
      prompt: `Randomization question ${i}?`,
      answer: { value: `${i}` },
      answerType: 'multiple-choice',
      options: [{ label: 'A', text: `${i}` }, { label: 'B', text: `${i + 1}` }, { label: 'C', text: `${i + 2}` }, { label: 'D', text: `${i + 3}` }],
      correctOption: 'A',
      difficulty: 3,
      isActive: true,
      source: 'test',
    });
  }
  // Inserted in order, so "the first 16 in storage order" is r1..r16.
  await Problem.insertMany(docs);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

const ids = (form) => form.items.map((it) => it.problemId);

test('the same seed reproduces the same form', async () => {
  const a = await assembleForm({ blueprint: BLUEPRINT, seed: 'repeat-me' });
  const b = await assembleForm({ blueprint: BLUEPRINT, seed: 'repeat-me' });
  expect(ids(a)).toHaveLength(5);
  expect(ids(b)).toEqual(ids(a));
});

test('different seeds draw from the whole bank, not the first 16 stored items', async () => {
  const forms = [];
  for (let i = 0; i < 8; i++) {
    forms.push(ids(await assembleForm({ blueprint: BLUEPRINT, seed: `guest-${i}` })));
  }
  const union = new Set(forms.flat());
  const firstSixteen = new Set(Array.from({ length: 16 }, (_, i) => `r${i + 1}`));

  // The old first-N pool gave every seed the same handful of items.
  expect(union.size).toBeGreaterThanOrEqual(20);
  expect([...union].some((id) => !firstSixteen.has(id))).toBe(true);

  // No two forms are the same form.
  const distinctForms = new Set(forms.map((f) => [...f].sort().join(',')));
  expect(distinctForms.size).toBe(forms.length);
});
