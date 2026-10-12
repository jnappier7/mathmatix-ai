/**
 * The SAT's two adaptive modules (routes/actTest.js /next-module,
 * utils/testModules.js), against the REAL SAT bank and blueprint.
 *
 *   1. Routing follows Module 1: strong → the HARDER Module 2, weak → the
 *      EASIER one — and the harder module really is harder (bank difficulty).
 *   2. Module 1 closes: its questions can't be read or changed once Module 2
 *      starts, a late answer sheet for it is ignored, and there is no third
 *      module.
 *   3. The score prices in the route: a perfect EASIER Module 2 after a weak
 *      Module 1 scores well below a perfect run through the HARDER one, and a
 *      strong Module 1 with a middling Module 2 still beats it.
 *   4. Module 2 starts its own 35-minute clock.
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

let userId = new mongoose.Types.ObjectId();
const KEY = new Map(SAT_ITEMS.map((p) => [p.problemId, p]));

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { _id: userId }; next(); });
  app.use('/api/sat-test', useTest('sat-math'), require('../../routes/actTest'));
  return app;
}

/** The correct entry for an item, or a wrong one. */
function answerFor(it, right) {
  const key = KEY.get(it.problemId);
  if (it.answerType === 'constructed-response') return right ? String(key.answer.value) : '99999';
  const correctText = key.options.find((o) => o.label === key.correctOption).text;
  const pick = it.options.find((o) => (right ? o.text === correctText : o.text !== correctText));
  return pick.label;
}
const sheet = (items, rightIf) => items.map((it, i) => ({ position: it.position, problemId: it.problemId, answer: answerFor(it, rightIf(it, i)), seq: 1 }));

let mem; let app;
beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  await Problem.insertMany(SAT_ITEMS);
  app = makeApp();
}, 60000);
afterAll(async () => { await mongoose.disconnect(); if (mem) await mem.stop(); });
beforeEach(() => { userId = new mongoose.Types.ObjectId(); });   // a fresh student, a fresh seen-ledger

/** Run a whole test: Module 1 right-rate r1, Module 2 right-rate r2. */
async function runTest(r1, r2) {
  const start = await supertest(app).post('/api/sat-test/start').send({});
  const sid = String(start.body.sessionId);
  let s = await ActTestSession.findById(sid).lean();
  const m1 = s.items.filter((it) => it.module === 1);
  const next = await supertest(app).post('/api/sat-test/next-module')
    .send({ sessionId: sid, answers: sheet(m1, (it, i) => i < Math.round(r1 * m1.length)) });
  expect(next.status).toBe(200);
  s = await ActTestSession.findById(sid).lean();
  const m2 = s.items.filter((it) => it.module === 2);
  const done = await supertest(app).post('/api/sat-test/complete')
    .send({ sessionId: sid, answers: sheet(m2, (it, i) => i < Math.round(r2 * m2.length)) });
  expect(done.status).toBe(200);
  return { sid, next: next.body, report: done.body.report, session: await ActTestSession.findById(sid).lean() };
}

const meanDifficulty = (items) => items.reduce((a, it) => a + Number(it.difficulty || 3), 0) / items.length;

test('a strong Module 1 earns the harder Module 2, a weak one the easier — and harder really is harder', async () => {
  const strong = await runTest(1, 0.5);
  const weak = await runTest(0.2, 0.5);
  expect(strong.session.modules.find((m) => m.n === 2).route).toBe('harder');
  expect(weak.session.modules.find((m) => m.n === 2).route).toBe('easier');
  expect(strong.report.moduleRoute).toBe('harder');
  expect(weak.report.moduleRoute).toBe('easier');
  const hardM2 = strong.session.items.filter((it) => it.module === 2);
  const easyM2 = weak.session.items.filter((it) => it.module === 2);
  expect(meanDifficulty(hardM2)).toBeGreaterThan(meanDifficulty(easyM2) + 0.5);
  // The route is never told mid-test.
  expect(strong.next).not.toHaveProperty('route');
});

test('Module 2 starts its own 35-minute clock, at positions 23–44', async () => {
  const start = await supertest(app).post('/api/sat-test/start').send({});
  const sid = String(start.body.sessionId);
  const next = await supertest(app).post('/api/sat-test/next-module').send({ sessionId: sid, answers: [] });
  expect(next.body.timeLimitMinutes).toBe(35);
  expect(next.body.remainingSeconds).toBeGreaterThan(35 * 60 - 5);
  const s = await ActTestSession.findById(sid).lean();
  expect(s.items.filter((it) => it.module === 2).map((it) => it.position).sort((a, b) => a - b))
    .toEqual(Array.from({ length: 22 }, (_, i) => 23 + i));
  expect(s.modules.find((m) => m.n === 1).submittedAt).toBeTruthy();
});

test('Module 1 closes: no reading or changing it, no late sheet for it, no third module', async () => {
  const start = await supertest(app).post('/api/sat-test/start').send({});
  const sid = String(start.body.sessionId);
  let s = await ActTestSession.findById(sid).lean();
  const q1 = s.items.find((it) => it.position === 1);
  // Before: Module 1 is open, Module 2 positions do not exist yet.
  let res = await supertest(app).get(`/api/sat-test/problem?sessionId=${sid}&position=1`);
  expect(res.status).toBe(200);
  await supertest(app).post('/api/sat-test/save-answer')
    .send({ sessionId: sid, problemId: q1.problemId, position: 1, answer: answerFor(q1, false), seq: 1 });

  await supertest(app).post('/api/sat-test/next-module').send({ sessionId: sid, answers: [] });

  res = await supertest(app).get(`/api/sat-test/problem?sessionId=${sid}&position=1`);
  expect(res.status).toBe(409);
  expect(res.body.moduleLocked).toBe(true);
  res = await supertest(app).post('/api/sat-test/save-answer')
    .send({ sessionId: sid, problemId: q1.problemId, position: 1, answer: answerFor(q1, true), seq: 5 });
  expect(res.status).toBe(409);
  res = await supertest(app).get(`/api/sat-test/overview?sessionId=${sid}`);
  expect(res.body.items.map((x) => x.position)).toEqual(Array.from({ length: 22 }, (_, i) => 23 + i));

  res = await supertest(app).post('/api/sat-test/next-module').send({ sessionId: sid, answers: [] });
  expect(res.status).toBe(409);
  expect(res.body.lastModule).toBe(true);

  // A sheet at /complete that tries to fix question 1 is ignored.
  res = await supertest(app).post('/api/sat-test/complete')
    .send({ sessionId: sid, answers: [{ position: 1, problemId: q1.problemId, answer: answerFor(q1, true), seq: 9 }] });
  s = await ActTestSession.findById(sid).lean();
  expect(s.responses.find((r) => r.position === 1).correct).toBe(false);
});

test('the score prices in the route', async () => {
  const perfectHarder = await runTest(1, 1);
  const weakThenPerfectEasier = await runTest(0.2, 1);
  const strongThenMiddling = await runTest(1, 0.5);
  expect(perfectHarder.report.scaledScore).toBe(800);
  // The report's clock is the whole section's, not Module 2's.
  expect(perfectHarder.report.timeLimitMinutes).toBe(70);
  // A perfect easier module after a weak first module is a long way from 800…
  expect(weakThenPerfectEasier.report.scaledScore).toBeLessThan(700);
  // …and below a strong first module with only half of the harder module right.
  expect(weakThenPerfectEasier.report.scaledScore).toBeLessThan(strongThenMiddling.report.scaledScore);
  // Every score carries a likely range around it.
  for (const r of [perfectHarder, weakThenPerfectEasier, strongThenMiddling].map((x) => x.report)) {
    expect(r.scaledRange.low).toBeLessThanOrEqual(r.scaledScore);
    expect(r.scaledRange.high).toBeGreaterThanOrEqual(r.scaledScore);
  }
});
