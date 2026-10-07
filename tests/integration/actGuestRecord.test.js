/**
 * A guest's retake leaves out what that guest already saw, even when the
 * browser's own list of past tests is gone.
 *
 * The runner keeps past guest tests in localStorage and sends them to /start.
 * A private window, cleared storage, or a fresh browser profile loses that
 * list, and retakes repeated questions: five per form, one item on three of
 * four forms (external audit, 2026-10-07; prod sessions confirmed the browser
 * sent no history). The server now keeps its own record: a keyed hash of an
 * httpOnly cookie and of the client IP on each guest session
 * (routes/actTest.js guestPrints / guestRecordSeenProblemIds).
 */
jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => next(),
  isAdmin: (req, _res, next) => next(),
  isTeacher: (req, _res, next) => next(),
}));

const TEST_BLUEPRINT = {
  testId: 'act-math', title: 'T', totalItems: 4, timeLimitMinutes: 50,
  categoryWeights: { algebra: 2, geometry: 2 },
  skillsByCategory: { algebra: ['r-alg'], geometry: ['r-geo'] },
  difficultyRamp: [{ fromPosition: 1, toPosition: 45, targetDifficulty: 3 }],
};
jest.mock('../../utils/actTestAssembler', () => {
  const actual = jest.requireActual('../../utils/actTestAssembler');
  return { ...actual, getBlueprint: () => TEST_BLUEPRINT, assembleForm: (opts) => actual.assembleForm({ ...opts, blueprint: TEST_BLUEPRINT }) };
});

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const cookieParser = require('cookie-parser');
const supertest = require('supertest');
const Problem = require('../../models/problem');
const ActTestSession = require('../../models/actTestSession');

let mem; let app;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  const docs = [];
  for (let i = 1; i <= 24; i++) {
    docs.push({
      problemId: `r-p${i}`, skillId: i % 2 ? 'r-alg' : 'r-geo', prompt: `Record bank question ${i}?`,
      answer: { value: `${i}` }, answerType: 'multiple-choice',
      options: [{ label: 'A', text: `${i}` }, { label: 'B', text: `${i + 100}` }, { label: 'C', text: `${i + 200}` }, { label: 'D', text: `${i + 300}` }],
      correctOption: 'A', difficulty: 3, isActive: true, source: 'test',
    });
  }
  await Problem.insertMany(docs);
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/act-practice', require('../../routes/actTest').guestRouter);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

afterEach(async () => { await ActTestSession.deleteMany({}); });

const itemsOf = async (sid) => (await ActTestSession.findById(sid).lean()).items.map((x) => x.problemId);

test('same browser, no list sent: the next test shares nothing with the last ones', async () => {
  const agent = supertest.agent(app);   // keeps the cookie, like a browser
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    const res = await agent.post('/api/act-practice/start').send({});   // no `previous`: storage was cleared
    expect(res.status).toBe(200);
    const ids = await itemsOf(res.body.sessionId);
    ids.forEach((id) => expect(seen.has(id)).toBe(false));
    ids.forEach((id) => seen.add(id));
  }
});

test('cookie gone too: the network record still keeps a retake fresh', async () => {
  const first = await supertest(app).post('/api/act-practice/start').send({});
  const second = await supertest(app).post('/api/act-practice/start').send({});   // no cookie jar
  const a = new Set(await itemsOf(first.body.sessionId));
  (await itemsOf(second.body.sessionId)).forEach((id) => expect(a.has(id)).toBe(false));
});

test('only keyed hashes are stored, hidden from ordinary reads, and the cookie is httpOnly', async () => {
  const res = await supertest(app).post('/api/act-practice/start').send({});
  const cookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith('mm_act_guest='));
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/Path=\/api\/act-practice/);
  const plain = await ActTestSession.findById(res.body.sessionId).lean();
  expect(plain.guestBrowserHash).toBeUndefined();          // select: false
  const full = await ActTestSession.findById(res.body.sessionId).select('+guestBrowserHash +guestNetHash').lean();
  expect(full.guestBrowserHash).toMatch(/^[0-9a-f]{32}$/);
  expect(full.guestNetHash).toMatch(/^[0-9a-f]{32}$/);
  const raw = cookie.split(';')[0].split('=')[1];
  expect(JSON.stringify(full)).not.toContain(raw);         // never the raw cookie
  expect(JSON.stringify(full)).not.toContain('127.0.0.1'); // never the raw IP
});
