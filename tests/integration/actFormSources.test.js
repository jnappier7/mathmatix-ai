/**
 * ACT forms draw only from banks written as ACT items.
 *
 * The low-volume expansions carry `act-*` skill tags (they were bulk-generated
 * to give thin skills some practice), so every form query matched them. An
 * external audit of five public forms (2026-10-05) found its two worst item
 * defects there — "multiply both by zero" / "graph a circle" as elimination
 * distractors, and a bare M(2) = 312.5 "membership count". They stay in the
 * bank for tutoring; utils/actTestAssembler.js keeps them off forms on every
 * path: the windowed pool, the any-difficulty fallback, and the same-category
 * fallback.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Problem = require('../../models/problem');
const { assembleForm } = require('../../utils/actTestAssembler');

const BLUEPRINT = {
  testId: 'test-act', title: 'T', totalItems: 6, timeLimitMinutes: 5,
  categoryWeights: { 'cat-a': 6 },
  skillsByCategory: { 'cat-a': ['skill-1', 'skill-2'] },
  difficultyRamp: [{ fromPosition: 1, toPosition: 45, targetDifficulty: 3 }],
};

const doc = (id, skillId, source, difficulty = 3) => ({
  problemId: id,
  skillId,
  prompt: `Question ${id}?`,
  answer: { value: '1' },
  answerType: 'multiple-choice',
  options: [{ label: 'A', text: '1' }, { label: 'B', text: '2' }, { label: 'C', text: '3' }, { label: 'D', text: '4' }],
  correctOption: 'A',
  difficulty,
  isActive: true,
  source,
});

let mem;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  const docs = [];
  // skill-1: ACT items only at difficulty 1 (outside the ±1 window around 3),
  // low-volume items right on target — the any-difficulty fallback must not
  // hand back a low-volume item.
  for (let i = 0; i < 4; i++) docs.push(doc(`act1-${i}`, 'skill-1', 'act-fable', 1));
  for (let i = 0; i < 12; i++) docs.push(doc(`lv1-${i}`, 'skill-1', 'low-volume-expansion-2026-07', 3));
  // skill-2: ACT and low-volume side by side.
  for (let i = 0; i < 4; i++) docs.push(doc(`act2-${i}`, 'skill-2', 'act-enhanced-2026-09', 3));
  for (let i = 0; i < 12; i++) docs.push(doc(`lv2-${i}`, 'skill-2', 'low-volume-2026-08', 3));
  await Problem.insertMany(docs);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

test('no form ever carries a low-volume item, across many seeds', async () => {
  for (let i = 0; i < 12; i++) {
    const form = await assembleForm({ blueprint: BLUEPRINT, seed: `src-${i}` });
    const ids = form.items.map((it) => it.problemId);
    expect(ids.filter((id) => id.startsWith('lv'))).toEqual([]);
    // 8 ACT-authored items cover the 6 slots, through the fallbacks if need be.
    expect(ids).toHaveLength(6);
  }
});
