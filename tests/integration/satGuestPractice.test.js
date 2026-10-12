/**
 * Public SAT practice test (/sat) — the ACT's guest funnel, for the SAT.
 *
 * The guest router (routes/actTest.js `guestRouter`) is mounted a second time
 * at /api/sat-practice behind useTest('sat-math'). Pinned here, against the
 * REAL SAT bank and blueprint:
 *
 *   1. A guest gets an SAT form (44 items, 70 minutes, grid-ins included) and,
 *      at the end, the locked report: score and domains, never which questions.
 *   2. The two guest rails never cross: an SAT guest session is not found on
 *      the ACT rail and the reverse, and each rail's cookie is its own.
 *   3. /api/sat-test/claim attaches the finished SAT test to the account and
 *      unlocks the full report; /api/act-test/claim cannot claim it.
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
const { useTest } = require('../../utils/practiceTests');
const SAT_ITEMS = require('../../seeds/sat-items.generated.json');

const USER = new mongoose.Types.ObjectId();

function makeApp() {
  const app = express();
  app.use(express.json());
  const routes = require('../../routes/actTest');
  const signedIn = (req, _res, next) => { req.user = { _id: USER }; next(); };
  app.use('/api/act-test', signedIn, routes);
  app.use('/api/sat-test', signedIn, useTest('sat-math'), routes);
  app.use('/api/act-practice', routes.guestRouter);
  app.use('/api/sat-practice', useTest('sat-math'), routes.guestRouter);
  return app;
}

let mem; let app;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  await Problem.insertMany(SAT_ITEMS);
  app = makeApp();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

afterEach(async () => {
  await ActTestSession.deleteMany({});
});

async function guestStart() {
  const res = await supertest(app).post('/api/sat-practice/start').send({});
  expect(res.status).toBe(200);
  return res;
}

test('a guest gets a full SAT form, and the guest cookie belongs to the SAT rail', async () => {
  const res = await guestStart();
  // Module 1 of 2, as on the real SAT.
  expect(res.body.totalItems).toBe(22);
  expect(res.body.timeLimitMinutes).toBe(35);
  expect(res.body.module).toMatchObject({ current: 1, count: 2, totalItems: 44 });
  expect(res.body.guestToken).toMatch(/^[a-f0-9]{64}$/);
  const session = await ActTestSession.findById(res.body.sessionId).lean();
  expect(session.testId).toBe('sat-math');
  expect(session.userId == null).toBe(true);
  expect(session.items.some((it) => it.answerType === 'constructed-response')).toBe(true);
  const cookie = (res.headers['set-cookie'] || []).join(';');
  expect(cookie).toMatch(/Path=\/api\/sat-practice/);
});

test('the guest result is the locked report: score and domains, never which questions', async () => {
  const start = await guestStart();
  const sid = String(start.body.sessionId);
  const token = start.body.guestToken;
  // The guest rail runs the adaptive step too.
  const next = await supertest(app).post('/api/sat-practice/next-module')
    .set('X-Act-Guest-Token', token).send({ sessionId: sid, answers: [] });
  expect(next.status).toBe(200);
  expect(next.body.module.current).toBe(2);
  expect(next.body).not.toHaveProperty('route');      // the route is never told mid-test
  const res = await supertest(app).post('/api/sat-practice/complete')
    .set('X-Act-Guest-Token', token).send({ sessionId: sid, answers: [] });
  expect(res.status).toBe(200);
  const r = res.body.report;
  expect(r.locked).toBe(true);
  expect(r.scaledScore).toBe(200);
  expect(r.totalItems).toBe(44);
  expect(r.missedCount).toBe(44);
  expect(Object.keys(r.byCategory).sort()).toEqual(['advanced-math', 'algebra', 'geometry-trig', 'problem-solving-data']);
  expect(r).not.toHaveProperty('missedByGroup');
  expect(r).not.toHaveProperty('weakSkills');
});

test('the SAT and ACT guest rails never open each other\'s tests', async () => {
  const start = await guestStart();
  const sid = String(start.body.sessionId);
  const token = start.body.guestToken;
  // The SAT test, with its own valid token, through the ACT rail: not found.
  let res = await supertest(app).get(`/api/act-practice/overview?sessionId=${sid}`).set('X-Act-Guest-Token', token);
  expect(res.status).toBe(404);
  // And through its own rail it is fine.
  res = await supertest(app).get(`/api/sat-practice/overview?sessionId=${sid}`).set('X-Act-Guest-Token', token);
  expect(res.status).toBe(200);
  expect(res.body.items).toHaveLength(22);            // Module 1's questions
  // Resuming on the ACT rail with the SAT session's id never resumes it.
  res = await supertest(app).post('/api/act-practice/start').set('X-Act-Guest-Token', token).send({ sessionId: sid });
  expect(res.body.resumed).toBeFalsy();
});

test('signing up claims the SAT test on the SAT rail only, and unlocks the full report', async () => {
  const start = await guestStart();
  const sid = String(start.body.sessionId);
  const token = start.body.guestToken;
  await supertest(app).post('/api/sat-practice/complete').set('X-Act-Guest-Token', token).send({ sessionId: sid, answers: [] });

  // The ACT runner's claim cannot take an SAT test.
  let res = await supertest(app).post('/api/act-test/claim').send({ sessionId: sid, guestToken: token });
  expect(res.status).toBe(404);
  expect((await ActTestSession.findById(sid).lean()).userId == null).toBe(true);

  // The SAT runner's claim does, and the full report comes back.
  res = await supertest(app).post('/api/sat-test/claim').send({ sessionId: sid, guestToken: token });
  expect(res.status).toBe(200);
  expect(res.body.claimed).toBe(true);
  expect(res.body.report.missedByGroup.length).toBeGreaterThan(0);
  expect(res.body.report.plan).toBeNull();
  const saved = await ActTestSession.findById(sid).lean();
  expect(String(saved.userId)).toBe(String(USER));

  // It is now the student's own SAT attempt.
  const hist = await supertest(app).get('/api/sat-test/history');
  expect(hist.body.count).toBe(1);
});
