/**
 * Practice-test answers survive a fast student (QA on prod, 2026-10-13).
 *
 * Navigating a PSAT at ~1 question a second drew 429s from
 * POST /api/psat-practice/save-answer: the runner shared the global
 * apiLimiter (300 / 15 min, and a guest is keyed on the IP — a whole school
 * shares one). The answers never reached the server and the report counted
 * them skipped.
 *
 * Pinned here:
 *   1. 60 rapid save-answer calls in ONE session — a full 45-item form plus
 *      15 changed answers, fired at once — all return 200 and all persist,
 *      each question holding its LAST answer.
 *   2. The runner's per-question calls are exempt from the global limiter
 *      (config/middleware.js) and carry their own, keyed on the session
 *      owner: one token over budget gets 429 + retryAfter; another token on
 *      the same network does not.
 */

jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => next(),
  isAdmin: (req, _res, next) => next(),
  isTeacher: (req, _res, next) => next(),
}));

const TEST_BLUEPRINT = {
  testId: 'act-math', title: 'T', totalItems: 45, timeLimitMinutes: 50,
  categoryWeights: { algebra: 23, geometry: 22 },
  skillsByCategory: { algebra: ['rl-skill-alg'], geometry: ['rl-skill-geo'] },
  difficultyRamp: [{ fromPosition: 1, toPosition: 45, targetDifficulty: 3 }],
};
jest.mock('../../utils/actTestAssembler', () => {
  const actual = jest.requireActual('../../utils/actTestAssembler');
  return {
    ...actual,
    getBlueprint: () => TEST_BLUEPRINT,
    assembleForm: (opts) => actual.assembleForm({ ...opts, blueprint: TEST_BLUEPRINT }),
  };
});

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const supertest = require('supertest');

const Problem = require('../../models/problem');
const ActTestSession = require('../../models/actTestSession');
const {
  makeRunnerLimiters, isPracticeTestRunnerPath, PER_OWNER_MAX,
} = require('../../middleware/practiceTestLimiter');

function makeApp() {
  const app = express();
  app.use(express.json());
  const actTest = require('../../routes/actTest');
  app.use('/api/act-practice', actTest.guestRouter);
  return app;
}

function bank() {
  const docs = [];
  for (let i = 1; i <= 120; i++) {
    const geo = i % 2 === 0;
    docs.push({
      problemId: `rl-p${i}`,
      skillId: geo ? 'rl-skill-geo' : 'rl-skill-alg',
      prompt: `Rate-limit bank question ${i}: what is ${i} + ${i}?`,
      answer: { value: `${2 * i}` },
      answerType: 'multiple-choice',
      options: [
        { label: 'A', text: `${2 * i}` },
        { label: 'B', text: `${2 * i + 1}` },
        { label: 'C', text: `${2 * i + 2}` },
        { label: 'D', text: `${2 * i + 3}` },
      ],
      correctOption: 'A',
      difficulty: 3,
      isActive: true,
      source: 'test',
    });
  }
  return docs;
}

let mem; let app;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  await Problem.insertMany(bank());
  app = makeApp();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

const guest = (token) => ({ 'X-Act-Guest-Token': token });

test('60 rapid save-answer calls within one session all persist', async () => {
  const start = await supertest(app).post('/api/act-practice/start').send({});
  expect(start.status).toBe(200);
  const sid = String(start.body.sessionId);
  const token = start.body.guestToken;
  const total = start.body.totalItems;
  expect(total).toBe(45);

  const doc = await ActTestSession.findById(sid).lean();
  const idByPos = new Map(doc.items.map((it) => [it.position, it.problemId]));

  // Every question answered once, then 15 of them changed — 60 saves, all
  // in flight together, the way a fast student's clicks overlap.
  const saves = [];
  const finalAnswer = new Map();
  for (let pos = 1; pos <= 45; pos++) {
    saves.push({ position: pos, answer: 'B', seq: 1 });
    finalAnswer.set(pos, 'B');
  }
  for (let pos = 1; pos <= 15; pos++) {
    saves.push({ position: pos, answer: 'D', seq: 2 });
    finalAnswer.set(pos, 'D');
  }
  expect(saves).toHaveLength(60);

  const results = await Promise.all(saves.map((s) => supertest(app)
    .post('/api/act-practice/save-answer')
    .set(guest(token))
    .send({ sessionId: sid, problemId: idByPos.get(s.position), position: s.position, answer: s.answer, seq: s.seq })));

  results.forEach((r) => expect(r.status).toBe(200));

  const after = await ActTestSession.findById(sid).lean();
  const stored = new Map(after.responses.map((r) => [r.position, r.answer]));
  expect(stored.size).toBe(45);
  for (const [pos, ans] of finalAnswer) expect(stored.get(pos)).toBe(ans);

  const ov = await supertest(app).get(`/api/act-practice/overview?sessionId=${sid}`).set(guest(token));
  expect(ov.status).toBe(200);
  expect(ov.body.items.filter((it) => it.answered)).toHaveLength(45);

  // And the score counts none of them as skipped.
  const done = await supertest(app).post('/api/act-practice/complete').set(guest(token)).send({ sessionId: sid, answers: [] });
  expect(done.status).toBe(200);
  const graded = await ActTestSession.findById(sid).lean();
  expect(graded.responses.filter((r) => r.skipped)).toHaveLength(0);
}, 60000);

describe('the runner\'s own limiter', () => {
  test('the per-question runner calls are exempt from the global apiLimiter; nothing else is', () => {
    for (const exam of ['act', 'sat', 'psat', 'preact']) {
      for (const rail of ['test', 'practice']) {
        for (const ep of ['problem', 'save-answer', 'overview', 'next-module', 'complete']) {
          expect(isPracticeTestRunnerPath(`/${exam}-${rail}/${ep}`)).toBe(true);
        }
        // /start has its own guest limiter; /history and /claim are ordinary calls.
        expect(isPracticeTestRunnerPath(`/${exam}-${rail}/start`)).toBe(false);
        expect(isPracticeTestRunnerPath(`/${exam}-${rail}/history`)).toBe(false);
        expect(isPracticeTestRunnerPath(`/${exam}-${rail}/claim`)).toBe(false);
      }
    }
    expect(isPracticeTestRunnerPath('/chat')).toBe(false);
    expect(isPracticeTestRunnerPath('/gre-test/save-answer')).toBe(false);
    expect(isPracticeTestRunnerPath('/admin/problem')).toBe(false);
  });

  test('config/middleware.js routes the global limiter around the runner', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'config', 'middleware.js'), 'utf8');
    expect(src).toMatch(/isPracticeTestRunnerPath\(req\.path\)/);
  });

  test('is sized for a timed test and keyed on the session owner', async () => {
    // Room for a 44–45 item test taken at 1 question a second, with an
    // answer change on every one, for the whole window.
    expect(PER_OWNER_MAX).toBeGreaterThanOrEqual(600);

    const mini = express();
    mini.use(makeRunnerLimiters());
    mini.post('/save-answer', (req, res) => res.json({ saved: true }));
    mini.get('/history', (req, res) => res.json({ ok: true }));

    const a = 'a'.repeat(64);
    const b = 'b'.repeat(64);
    for (let i = 0; i < PER_OWNER_MAX; i++) {
      const r = await supertest(mini).post('/save-answer').set(guest(a)).send({});
      if (r.status !== 200) throw new Error(`request ${i + 1} of ${PER_OWNER_MAX} got ${r.status}`);
    }
    const over = await supertest(mini).post('/save-answer').set(guest(a)).send({});
    expect(over.status).toBe(429);
    expect(over.body.retryAfter).toBeGreaterThan(0);

    // A classmate on the same network (same IP) is unaffected.
    const other = await supertest(mini).post('/save-answer').set(guest(b)).send({});
    expect(other.status).toBe(200);

    // Non-runner paths are not counted here.
    const hist = await supertest(mini).get('/history').set(guest(a));
    expect(hist.status).toBe(200);
  }, 60000);
});
