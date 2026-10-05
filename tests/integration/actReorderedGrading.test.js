/**
 * A test frozen before the bank reordered its choices still grades the choice
 * the student saw.
 *
 * scripts/sortActNumericChoices.js put 120 items' numeric choices in ascending
 * order. A test assembled before that reseed holds the OLD order on its items,
 * and grading re-reads the key from the bank — so a letter compared as-is
 * would mark the wrong choice. gradeSession carries each pick to the bank by
 * its text first.
 */

jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => next(),
  isAdmin: (req, _res, next) => next(),
  isTeacher: (req, _res, next) => next(),
}));

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const supertest = require('supertest');

const Problem = require('../../models/problem');
const ActTestSession = require('../../models/actTestSession');

const USER_ID = new mongoose.Types.ObjectId();
const opts = (...texts) => texts.map((text, i) => ({ label: 'ABCD'[i], text }));

let mem; let app;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  // The bank AFTER sorting: key "205" is now slot C.
  await Problem.create({
    problemId: 'ro-1', skillId: 'ro-skill', prompt: 'Which?', answer: { value: '205' },
    answerType: 'multiple-choice', options: opts('165', '185', '205', '285'), correctOption: 'C',
    difficulty: 3, isActive: true, source: 'test',
  });
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { _id: USER_ID }; next(); });
  app.use('/api/act-test', require('../../routes/actTest'));
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

afterEach(async () => { await ActTestSession.deleteMany({}); });

// The test as frozen BEFORE sorting: "205" was slot B.
const frozenSession = () => ActTestSession.create({
  userId: USER_ID, testId: 'act-math', timeLimitMinutes: 50,
  items: [{ position: 1, problemId: 'ro-1', skillId: 'ro-skill', category: 'algebra', content: 'Which?',
    answerType: 'multiple-choice', options: opts('165', '205', '185', '285') }],
});

test('the right choice on the old order still grades right', async () => {
  const s = await frozenSession();
  const res = await supertest(app).post('/api/act-test/complete')
    .send({ sessionId: String(s._id), answers: [{ position: 1, problemId: 'ro-1', answer: 'B', seq: 1 }] });
  expect(res.status).toBe(200);
  expect(res.body.report.rawScore).toBe(1);
});

test('a bank item stored out of order is served sorted, and its key still grades right', async () => {
  const { assembleForm } = require('../../utils/actTestAssembler');
  // Bank order puts the key "72°" at D; served sorted, it sits at B.
  await Problem.create({
    problemId: 'ro-unsorted', skillId: 'ro-skill-2', prompt: 'Each exterior angle?', answer: { value: '72°' },
    answerType: 'multiple-choice', options: opts('108°', '540°', '36°', '72°'), correctOption: 'D',
    difficulty: 3, isActive: true, source: 'test',
  });
  const blueprint = {
    testId: 'act-math', title: 'T', totalItems: 1, timeLimitMinutes: 50,
    categoryWeights: { geometry: 1 }, skillsByCategory: { geometry: ['ro-skill-2'] },
    difficultyRamp: [{ fromPosition: 1, toPosition: 45, targetDifficulty: 3 }],
  };
  const form = await assembleForm({ blueprint, seed: 'sort-me' });
  expect(form.items[0].options.map((o) => o.text)).toEqual(['36°', '72°', '108°', '540°']);

  const grade = async (answer) => {
    const s = await ActTestSession.create({ userId: USER_ID, testId: 'act-math', timeLimitMinutes: 50, items: form.items });
    const res = await supertest(app).post('/api/act-test/complete')
      .send({ sessionId: String(s._id), answers: [{ position: 1, problemId: 'ro-unsorted', answer, seq: 1 }] });
    return res.body.report.rawScore;
  };
  expect(await grade('B')).toBe(1);   // "72°" as served — right
  expect(await grade('D')).toBe(0);   // "540°" as served — the bank's key LETTER, but wrong
});

test('the choice that now sits in the key\'s slot does not', async () => {
  const s = await frozenSession();
  // Old C is "185" — it now occupies nothing special, but C IS the bank's key letter.
  const res = await supertest(app).post('/api/act-test/complete')
    .send({ sessionId: String(s._id), answers: [{ position: 1, problemId: 'ro-1', answer: 'C', seq: 1 }] });
  expect(res.body.report.rawScore).toBe(0);
});

describe('a test frozen before a choice was EDITED (blocked-item repair)', () => {
  // The bank after the repair: the impossible "7/6" is gone, and sorting put
  // the key "7/13" at D, the slot "7/6" used to hold.
  beforeAll(async () => {
    await Problem.create({
      problemId: 'ro-edit', skillId: 'ro-skill', prompt: 'P(white)?', answer: { value: '7/13' },
      answerType: 'multiple-choice', options: opts('3/13', '1/3', '6/13', '7/13'), correctOption: 'D',
      difficulty: 3, isActive: true, source: 'test',
    });
    // A key whose wording changed: frozen "(x - 0)/2" is now "x/2".
    await Problem.create({
      problemId: 'ro-rekey', skillId: 'ro-skill', prompt: 'f⁻¹(x)?',
      answer: { value: 'x/2', equivalents: ['(x - 0)/2'] },
      answerType: 'multiple-choice', options: opts('1/(2x)', 'x/2', 'x - 2', '-2x'), correctOption: 'B',
      difficulty: 3, isActive: true, source: 'test',
    });
  });
  const grade = async (problemId, frozen, answer) => {
    const s = await ActTestSession.create({
      userId: USER_ID, testId: 'act-math', timeLimitMinutes: 50,
      items: [{ position: 1, problemId, skillId: 'ro-skill', category: 'algebra', content: '?',
        answerType: 'multiple-choice', options: opts(...frozen) }],
    });
    const res = await supertest(app).post('/api/act-test/complete')
      .send({ sessionId: String(s._id), answers: [{ position: 1, problemId, answer, seq: 1 }] });
    return res.body.report.rawScore;
  };
  const before = ['1/3', '6/13', '7/13', '7/6'];

  test('the removed distractor is wrong, even though its letter is now the key\'s', async () => {
    expect(await grade('ro-edit', before, 'D')).toBe(0);
  });
  test('the key the student saw is still right', async () => {
    expect(await grade('ro-edit', before, 'C')).toBe(1);
  });
  test('a key reworded since the test was built is still right, through its equivalent', async () => {
    const old = ['1/(2x)', '(x - 0)/2', '(x + 0)/2', 'x/2 - 0'];
    expect(await grade('ro-rekey', old, 'B')).toBe(1);
    expect(await grade('ro-rekey', old, 'A')).toBe(0);
  });
});
