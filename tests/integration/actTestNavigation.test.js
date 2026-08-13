/**
 * ACT practice test — free within-section navigation, like the real ACT.
 *
 * The runner used to be a one-way rail (next-problem → submit-answer, graded
 * per item at submit time). The real ACT lets students move back and forth
 * inside the timed section, change answers, and flag questions for review —
 * so the rail became: GET /problem?position= (any question), POST /save-answer
 * (ungraded upsert), GET /overview (palette state), with ALL grading deferred
 * to /complete. These tests pin that contract:
 *
 *   1. Any position is servable; a saved answer comes back on revisit.
 *   2. A changed answer replaces the old one — the FINAL answer is graded.
 *   3. save-answer never returns correctness (with answers still editable,
 *      that would put the key one network-tab peek away).
 *   4. Flag-only and never-visited questions score as skipped/wrong, and both
 *      appear in the diagnostics (unanswered = wrong on the real ACT).
 *   5. The clock anchors to startedAt: expired sessions refuse new answers.
 *   6. The legacy one-way rail still works (stale cached clients), and its
 *      sessions grade identically through the same /complete pass.
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

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { _id: USER_ID }; next(); });
  app.use('/api/act-test', require('../../routes/actTest'));
  return app;
}

function makeProblems(n) {
  const docs = [];
  for (let i = 1; i <= n; i++) {
    docs.push({
      problemId: `nav-p${i}`,
      skillId: `nav-skill-${i}`,
      prompt: `Question ${i}?`,
      answer: { value: `${i}` },
      answerType: 'multiple-choice',
      options: [
        { label: 'A', text: `${i}` },        // A is always correct
        { label: 'B', text: `${i + 10}` },
        { label: 'C', text: `${i + 20}` },
        { label: 'D', text: `${i + 30}` },
      ],
      correctOption: 'A',
      difficulty: 3,
      isActive: true,
      source: 'test',
    });
  }
  return docs;
}

function makeSession(overrides = {}) {
  return ActTestSession.create({
    userId: USER_ID,
    testId: 'act-math',
    items: [1, 2, 3, 4].map((i) => ({
      position: i,
      problemId: `nav-p${i}`,
      skillId: `nav-skill-${i}`,
      category: 'algebra',
      content: `Question ${i}?`,
      answerType: 'multiple-choice',
      options: [
        { label: 'A', text: `${i}` },
        { label: 'B', text: `${i + 10}` },
        { label: 'C', text: `${i + 20}` },
        { label: 'D', text: `${i + 30}` },
      ],
    })),
    timeLimitMinutes: 60,
    ...overrides,
  });
}

let mem; let app;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  await Problem.insertMany(makeProblems(4));
  app = makeApp();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

afterEach(async () => {
  await ActTestSession.deleteMany({});
});

test('navigate anywhere, change an answer, flag — final state is what gets graded', async () => {
  const session = await makeSession();
  const sid = String(session._id);

  // Jump straight to question 2 — no forced order.
  let res = await supertest(app).get(`/api/act-test/problem?sessionId=${sid}&position=2`);
  expect(res.status).toBe(200);
  expect(res.body.problem.problemId).toBe('nav-p2');
  expect(res.body.response).toBeNull();
  expect(res.body.total).toBe(4);

  // Answer it wrong (B)…
  res = await supertest(app).post('/api/act-test/save-answer')
    .send({ sessionId: sid, problemId: 'nav-p2', position: 2, answer: 'B', responseTime: 1000 });
  expect(res.status).toBe(200);
  expect(res.body.saved).toBe(true);
  // …and the response must NOT leak correctness mid-test.
  expect(res.body).not.toHaveProperty('correct');

  // Revisit shows the saved selection.
  res = await supertest(app).get(`/api/act-test/problem?sessionId=${sid}&position=2`);
  expect(res.body.response).toEqual({ answer: 'B', flagged: false });

  // Go back and change it to the right answer — the change must stick.
  res = await supertest(app).post('/api/act-test/save-answer')
    .send({ sessionId: sid, problemId: 'nav-p2', position: 2, answer: 'A' });
  expect(res.body.answered).toBe(1);          // still ONE response row, not two

  // Answer question 1 correctly; flag question 3 without answering.
  await supertest(app).post('/api/act-test/save-answer')
    .send({ sessionId: sid, problemId: 'nav-p1', position: 1, answer: 'A' });
  await supertest(app).post('/api/act-test/save-answer')
    .send({ sessionId: sid, problemId: 'nav-p3', position: 3, answer: null, flagged: true });

  // Overview drives the palette: answered/flagged only, never correctness.
  res = await supertest(app).get(`/api/act-test/overview?sessionId=${sid}`);
  expect(res.status).toBe(200);
  expect(res.body.items).toEqual([
    { position: 1, answered: true, flagged: false },
    { position: 2, answered: true, flagged: false },
    { position: 3, answered: false, flagged: true },
    { position: 4, answered: false, flagged: false },
  ]);
  expect(res.body.remainingSeconds).toBeGreaterThan(0);

  // Complete: the CHANGED answer on Q2 grades correct; flag-only Q3 and
  // never-visited Q4 are skipped-wrong but present in the diagnostics.
  res = await supertest(app).post('/api/act-test/complete').send({ sessionId: sid });
  expect(res.status).toBe(200);
  expect(res.body.report.rawScore).toBe(2);
  expect(res.body.report.totalItems).toBe(4);
  expect(res.body.report.byCategory.algebra).toEqual({ correct: 2, total: 4 });

  const saved = await ActTestSession.findById(sid).lean();
  expect(saved.responses).toHaveLength(4);
  const byPos = Object.fromEntries(saved.responses.map((r) => [r.position, r]));
  expect(byPos[2].correct).toBe(true);        // final answer, not the first one
  expect(byPos[3].skipped).toBe(true);
  expect(byPos[3].flagged).toBe(true);
  expect(byPos[4].skipped).toBe(true);
  expect(byPos[4].correct).toBe(false);
});

test('position out of range and problemId mismatch are rejected', async () => {
  const session = await makeSession();
  const sid = String(session._id);

  let res = await supertest(app).get(`/api/act-test/problem?sessionId=${sid}&position=99`);
  expect(res.status).toBe(400);

  res = await supertest(app).post('/api/act-test/save-answer')
    .send({ sessionId: sid, problemId: 'nav-p1', position: 2, answer: 'A' });
  expect(res.status).toBe(409);
});

test('pencils down: an expired session refuses new answers', async () => {
  const session = await makeSession({
    startedAt: new Date(Date.now() - 61 * 60000),   // started 61 min ago, 60-min limit
  });
  const sid = String(session._id);

  const res = await supertest(app).post('/api/act-test/save-answer')
    .send({ sessionId: sid, problemId: 'nav-p1', position: 1, answer: 'A' });
  expect(res.status).toBe(409);
  expect(res.body.timeUp).toBe(true);

  // But scoring an expired test still works (that's how time-up ends).
  const done = await supertest(app).post('/api/act-test/complete').send({ sessionId: sid });
  expect(done.status).toBe(200);
  expect(done.body.report.rawScore).toBe(0);
});

test('legacy one-way rail still works and grades through the same final pass', async () => {
  const session = await makeSession();
  const sid = String(session._id);

  // Old client: next-problem → submit-answer, in order.
  let res = await supertest(app).get(`/api/act-test/next-problem?sessionId=${sid}`);
  expect(res.body.problem.problemId).toBe('nav-p1');
  await supertest(app).post('/api/act-test/submit-answer')
    .send({ sessionId: sid, problemId: 'nav-p1', answer: 'A' });
  await supertest(app).post('/api/act-test/submit-answer')
    .send({ sessionId: sid, problemId: 'nav-p2', answer: 'C' });
  await supertest(app).post('/api/act-test/submit-answer')
    .send({ sessionId: sid, problemId: 'nav-p3', skipped: true });
  await supertest(app).post('/api/act-test/submit-answer')
    .send({ sessionId: sid, problemId: 'nav-p4', answer: 'A' });

  res = await supertest(app).post('/api/act-test/complete').send({ sessionId: sid });
  expect(res.status).toBe(200);
  expect(res.body.report.rawScore).toBe(2);
  expect(res.body.report.totalItems).toBe(4);
});
