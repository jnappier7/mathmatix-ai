/**
 * A retake never re-serves a question under a different id, and a form never
 * carries one template twice when another is available.
 *
 * The no-repeat ledger excludes by problemId, but the same question can sit in
 * two banks (or two Fable practice tests) under two ids: "product of the
 * solutions of |2x − 5| = 11" came back on a retake (external audit,
 * 2026-10-07). utils/actTestAssembler.js now also excludes near-copies of
 * anything the student has seen: same skill, same template, same choices,
 * same (or no) figure.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Problem = require('../../models/problem');
const { assembleForm } = require('../../utils/actTestAssembler');

const BLUEPRINT = {
  testId: 't', title: 'T', totalItems: 3, timeLimitMinutes: 5,
  categoryWeights: { 'cat-a': 3 },
  skillsByCategory: { 'cat-a': ['abs'] },
  difficultyRamp: [{ fromPosition: 1, toPosition: 45, targetDifficulty: 3 }],
};
const mc = (texts) => texts.map((text, i) => ({ label: 'ABCD'[i], text }));
const item = (problemId, prompt, options) => ({
  problemId, skillId: 'abs', prompt, answer: { value: options[0] }, answerType: 'multiple-choice',
  options: mc(options), correctOption: 'A', difficulty: 3, isActive: true, source: 'test',
});

let mem;
beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  await Problem.insertMany([
    item('copy-1', 'What is the product of the two solutions of the equation |2x − 5| = 11?', ['−24', '−5', '5', '24']),
    item('copy-2', 'What is the product of all real solutions of the equation |2x − 5| = 11?', ['−24', '−5', '5', '24']),
    item('other-1', 'How many real solutions does |x + 4| = −2 have?', ['0', '1', '2', 'Infinitely many']),
    item('other-2', 'Which values of x satisfy |x − 3| < 5?', ['−2 < x < 8', 'x < 8', 'x > −2', '−8 < x < 2']),
    item('other-3', 'For what value of k does |x| = k have exactly one solution?', ['0', '1', '−1', 'No value']),
  ]);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

test('having seen one copy, the student is never served the other', async () => {
  for (let i = 0; i < 15; i++) {
    const form = await assembleForm({ blueprint: BLUEPRINT, seed: `copy-${i}`, excludeIds: ['copy-1'] });
    expect(form.items.map((x) => x.problemId)).not.toContain('copy-2');
    expect(form.items).toHaveLength(3);
  }
});

test('one form never holds both copies while other items remain', async () => {
  for (let i = 0; i < 15; i++) {
    const ids = (await assembleForm({ blueprint: BLUEPRINT, seed: `both-${i}` })).items.map((x) => x.problemId);
    expect(ids.includes('copy-1') && ids.includes('copy-2')).toBe(false);
  }
});
