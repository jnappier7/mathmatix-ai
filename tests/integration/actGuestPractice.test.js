/**
 * Public ACT practice test — take it with no account, see the score, sign up
 * to see what you missed.
 *
 * The guest rail (/api/act-practice, routes/actTest.js `guestRouter`) runs the
 * same form, navigation and grading as the signed-in rail, owned by a bearer
 * token instead of a user. These tests pin the parts that make it a hook and
 * not a leak:
 *
 *   1. A guest gets the score and category bars — never WHICH questions were
 *      missed, never per-question correctness, never the answer key.
 *   2. Ownership is the token: no token, a wrong token, or a signed-in user
 *      on the wrong rail all fail; only a hash of the token is stored.
 *   3. /claim attaches a FINISHED guest test to the signed-in account exactly
 *      once, unlocks the full report, and makes the test the student's own
 *      (history, seen-ledger). A token cannot be replayed onto a second account.
 *   4. A new ACT-prep enrollment seeds the boot camp review from a test that
 *      already exists (utils/actBootcampSeed.js), so a claimed test leads
 *      straight into reviewing its misses.
 */

jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => next(),
  isAdmin: (req, _res, next) => next(),
  isTeacher: (req, _res, next) => next(),
}));

// A 4-question blueprint so the real assembler can build forms from a tiny
// in-memory bank. rawToScaled stays real.
const TEST_BLUEPRINT = {
  testId: 'act-math', title: 'T', totalItems: 4, timeLimitMinutes: 50,
  categoryWeights: { algebra: 2, geometry: 2 },
  skillsByCategory: { algebra: ['g-skill-alg'], geometry: ['g-skill-geo'] },
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
const { seedBootcampFromLatestTest } = require('../../utils/actBootcampSeed');

const USER_A = new mongoose.Types.ObjectId();
const USER_B = new mongoose.Types.ObjectId();

function makeApp() {
  const app = express();
  app.use(express.json());
  // Signed-in rail: the acting user comes from a test header.
  app.use('/api/act-test', (req, _res, next) => {
    req.user = { _id: req.get('X-Test-User') === 'B' ? USER_B : USER_A };
    next();
  });
  const actTest = require('../../routes/actTest');
  app.use('/api/act-test', actTest);
  app.use('/api/act-practice', actTest.guestRouter);
  return app;
}

function bank() {
  const docs = [];
  for (let i = 1; i <= 16; i++) {
    const geo = i % 2 === 0;
    docs.push({
      problemId: `g-p${i}`,
      skillId: geo ? 'g-skill-geo' : 'g-skill-alg',
      prompt: `Guest bank question ${i}?`,
      answer: { value: `${i}` },
      answerType: 'multiple-choice',
      options: [
        { label: 'A', text: `${i}` },          // A is always the key
        { label: 'B', text: `${i + 100}` },
        { label: 'C', text: `${i + 200}` },
        { label: 'D', text: `${i + 300}` },
      ],
      correctOption: 'A',
      explanation: `Secret explanation ${i}`,
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

afterEach(async () => {
  await ActTestSession.deleteMany({});
});

const guest = (token) => ({ 'X-Act-Guest-Token': token });

async function startGuest() {
  const res = await supertest(app).post('/api/act-practice/start').send({});
  expect(res.status).toBe(200);
  expect(res.body.guestToken).toMatch(/^[0-9a-f]{64}$/);
  return { sid: String(res.body.sessionId), token: res.body.guestToken, total: res.body.totalItems };
}

// Answer question 1 right (A) and question 2 wrong (B); leave the rest blank.
// Answers ride the submitted answer sheet, exactly as the runner sends them
// at submit (save-answer has its own test below).
async function playAndFinish(sid, token) {
  const answers = [];
  for (const [pos, ans] of [[1, 'A'], [2, 'B']]) {
    const p = await supertest(app).get(`/api/act-practice/problem?sessionId=${sid}&position=${pos}`).set(guest(token));
    expect(p.status).toBe(200);
    expect(p.body.problem).not.toHaveProperty('correctOption');
    answers.push({ position: pos, problemId: p.body.problem.problemId, answer: ans, seq: 1 });
  }
  return supertest(app).post('/api/act-practice/complete').set(guest(token)).send({ sessionId: sid, answers });
}

describe('guest rail: take the test with no account', () => {
  test('start stores only a token hash, no user, and an expiry', async () => {
    const { sid, token, total } = await startGuest();
    expect(total).toBe(4);
    const doc = await ActTestSession.findById(sid).select('+guestTokenHash').lean();
    expect(doc.userId == null).toBe(true);
    expect(doc.guestTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.guestTokenHash).not.toBe(token);
    expect(doc.guestExpiresAt.getTime()).toBeGreaterThan(Date.now() + 13 * 24 * 3600 * 1000);
  });

  test('the TTL index on guestExpiresAt exists', () => {
    const ttl = ActTestSession.schema.indexes()
      .find(([fields, opts]) => fields.guestExpiresAt === 1 && opts && opts.expireAfterSeconds === 0);
    expect(ttl).toBeTruthy();
  });

  test('ownership is the token: missing or wrong token gets 404', async () => {
    const { sid } = await startGuest();
    let res = await supertest(app).get(`/api/act-practice/problem?sessionId=${sid}&position=1`);
    expect(res.status).toBe(404);
    res = await supertest(app).get(`/api/act-practice/problem?sessionId=${sid}&position=1`).set(guest('f'.repeat(64)));
    expect(res.status).toBe(404);
    res = await supertest(app).post('/api/act-practice/complete').set(guest('f'.repeat(64))).send({ sessionId: sid });
    expect(res.status).toBe(404);
  });

  test('save-answer works on the guest rail with the token, and never says right or wrong', async () => {
    const { sid, token } = await startGuest();
    const p = await supertest(app).get(`/api/act-practice/problem?sessionId=${sid}&position=1`).set(guest(token));
    const body = { sessionId: sid, problemId: p.body.problem.problemId, position: 1, answer: 'B', seq: 1 };

    const anon = await supertest(app).post('/api/act-practice/save-answer').send(body);
    expect(anon.status).toBe(404);

    const res = await supertest(app).post('/api/act-practice/save-answer').set(guest(token)).send(body);
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
    expect(res.body).not.toHaveProperty('correct');
    const ov = await supertest(app).get(`/api/act-practice/overview?sessionId=${sid}`).set(guest(token));
    expect(ov.body.items.find((it) => it.position === 1).answered).toBe(true);
  });

  test('the rails do not cross: a user cannot open a guest test, a guest cannot open a user test', async () => {
    const { sid } = await startGuest();
    let res = await supertest(app).get(`/api/act-test/problem?sessionId=${sid}&position=1`);
    expect(res.status).toBe(403);

    const mine = await supertest(app).post('/api/act-test/start').send({});
    expect(mine.status).toBe(200);
    res = await supertest(app)
      .get(`/api/act-practice/problem?sessionId=${mine.body.sessionId}&position=1`)
      .set(guest('a'.repeat(64)));
    expect(res.status).toBe(404);
  });

  test('a guest result is the score and categories only — no misses, no key', async () => {
    const { sid, token } = await startGuest();
    const res = await playAndFinish(sid, token);
    expect(res.status).toBe(200);
    const r = res.body.report;
    expect(r.locked).toBe(true);
    expect(r.rawScore).toBe(1);
    expect(r.totalItems).toBe(4);
    expect(typeof r.scaledScore).toBe('number');
    expect(r.missedCount).toBe(3);
    expect(r.skippedCount).toBe(2);
    expect(Object.keys(r.byCategory).sort()).toEqual(['algebra', 'geometry']);
    // What signing up unlocks never leaves the server for a guest.
    expect(r).not.toHaveProperty('missedByGroup');
    expect(r).not.toHaveProperty('weakSkills');
    expect(r).not.toHaveProperty('bySkill');
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/g-p\d+/);           // no problem ids
    expect(raw).not.toMatch(/Secret explanation/);
    expect(raw).not.toMatch(/correctOption/);
  });

  test('completing twice returns the same report without regrading', async () => {
    const { sid, token } = await startGuest();
    const first = await playAndFinish(sid, token);
    const before = await ActTestSession.findById(sid).lean();
    const again = await supertest(app).post('/api/act-practice/complete').set(guest(token)).send({ sessionId: sid, answers: [] });
    const after = await ActTestSession.findById(sid).lean();
    expect(again.body.report).toEqual(first.body.report);
    expect(after.completedAt.getTime()).toBe(before.completedAt.getTime());
  });

  test('start with the same token resumes the test in progress; a wrong token does not', async () => {
    const { sid, token } = await startGuest();
    let res = await supertest(app).post('/api/act-practice/start').set(guest(token)).send({ sessionId: sid });
    expect(res.body.resumed).toBe(true);
    expect(String(res.body.sessionId)).toBe(sid);
    expect(res.body).not.toHaveProperty('guestToken');

    res = await supertest(app).post('/api/act-practice/start').set(guest('b'.repeat(64))).send({ sessionId: sid });
    expect(res.body.resumed).toBeUndefined();
    expect(String(res.body.sessionId)).not.toBe(sid);
  });
});

describe('claim: signing up unlocks what you missed', () => {
  test('an unfinished guest test cannot be claimed', async () => {
    const { sid, token } = await startGuest();
    const res = await supertest(app).post('/api/act-test/claim').send({ sessionId: sid, guestToken: token });
    expect(res.status).toBe(404);
    expect(res.body.gone).toBe(true);
  });

  test('a wrong token cannot claim', async () => {
    const { sid, token } = await startGuest();
    await playAndFinish(sid, token);
    const res = await supertest(app).post('/api/act-test/claim').send({ sessionId: sid, guestToken: 'c'.repeat(64) });
    expect(res.status).toBe(404);
    const doc = await ActTestSession.findById(sid).lean();
    expect(doc.userId == null).toBe(true);
  });

  test('claiming attaches the test once, returns the full report, and becomes the student\'s own', async () => {
    const { sid, token } = await startGuest();
    await playAndFinish(sid, token);

    const res = await supertest(app).post('/api/act-test/claim').send({ sessionId: sid, guestToken: token });
    expect(res.status).toBe(200);
    expect(res.body.claimed).toBe(true);
    const r = res.body.report;
    expect(r.rawScore).toBe(1);
    // The unlocked part: which questions, grouped by skill.
    const positions = r.missedByGroup.flatMap((g) => g.positions.map((p) => p.position)).sort();
    expect(positions).toEqual([2, 3, 4]);
    expect(r.weakSkills.length).toBeGreaterThan(0);

    const doc = await ActTestSession.findById(sid).select('+guestTokenHash').lean();
    expect(String(doc.userId)).toBe(String(USER_A));
    expect(doc.guestTokenHash).toBeUndefined();
    expect(doc.guestExpiresAt).toBeUndefined();
    expect(doc.claimedAt).toBeTruthy();

    // It is now in the student's history...
    const hist = await supertest(app).get('/api/act-test/history');
    expect(hist.body.count).toBe(1);
    // ...and the guest rail can no longer reach it.
    const gone = await supertest(app).post('/api/act-practice/complete').set(guest(token)).send({ sessionId: sid });
    expect(gone.status).toBe(404);
  });

  test('re-claiming your own test is a no-op; another account cannot replay the token', async () => {
    const { sid, token } = await startGuest();
    await playAndFinish(sid, token);
    await supertest(app).post('/api/act-test/claim').send({ sessionId: sid, guestToken: token });

    const again = await supertest(app).post('/api/act-test/claim').send({ sessionId: sid, guestToken: token });
    expect(again.status).toBe(200);
    expect(again.body.claimed).toBe(false);

    const other = await supertest(app).post('/api/act-test/claim').set('X-Test-User', 'B').send({ sessionId: sid, guestToken: token });
    expect(other.status).toBe(404);
    const doc = await ActTestSession.findById(sid).lean();
    expect(String(doc.userId)).toBe(String(USER_A));
  });

  test('a claimed test joins the seen-ledger: the next test repeats none of its questions', async () => {
    const { sid, token } = await startGuest();
    await playAndFinish(sid, token);
    await supertest(app).post('/api/act-test/claim').send({ sessionId: sid, guestToken: token });
    const claimedIds = (await ActTestSession.findById(sid).lean()).items.map((it) => it.problemId);

    const next = await supertest(app).post('/api/act-test/start').send({ restart: true });
    expect(next.status).toBe(200);
    const nextIds = (await ActTestSession.findById(next.body.sessionId).lean()).items.map((it) => it.problemId);
    nextIds.forEach((id) => expect(claimedIds).not.toContain(id));
  });
});

describe('enrolling in ACT prep after the test seeds the boot camp review', () => {
  const fakeCourse = () => ({
    modules: [], overallProgress: 0, currentModuleId: null, bootcamp: null,
    markModified() {},
  });

  test('the latest real attempt becomes the review queue', async () => {
    const { sid, token } = await startGuest();
    await playAndFinish(sid, token);
    await supertest(app).post('/api/act-test/claim').send({ sessionId: sid, guestToken: token });

    const cs = fakeCourse();
    const seeded = await seedBootcampFromLatestTest(cs, USER_A);
    expect(seeded).toBe(true);
    expect(cs.bootcamp.phase).toBe('review');
    expect(cs.bootcamp.testSessionId).toBe(sid);
    expect(cs.bootcamp.queue.map((q) => q.position).sort()).toEqual([2, 3, 4]);
    expect(cs.bootcamp.round).toBe(1);
  });

  test('no test, or a bootcamp already under way, leaves the course alone', async () => {
    const empty = fakeCourse();
    expect(await seedBootcampFromLatestTest(empty, USER_B)).toBe(false);
    expect(empty.bootcamp).toBeNull();

    const busy = fakeCourse();
    busy.bootcamp = { phase: 'reassess', round: 2 };
    expect(await seedBootcampFromLatestTest(busy, USER_A)).toBe(false);
    expect(busy.bootcamp.round).toBe(2);
  });
});
