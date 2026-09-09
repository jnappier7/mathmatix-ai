/**
 * The answer sheet the student SAW is the answer sheet that gets graded.
 *
 * Owner evaluation 2026-09-09 (production, session 6aa134f7…): two questions
 * showed D and A selected on screen and were graded as "B". The keys were
 * right; the stored answers were not. /save-answer was fire-and-forget and
 * load-modify-save, so of two saves in flight for one question, whichever the
 * server finished LAST won — not whichever the student clicked last.
 *
 * Pinned here:
 *   1. A save carrying an older seq than the stored row is dropped.
 *   2. Two racing first-saves produce exactly one row.
 *   3. /complete accepts the runner's whole sheet and grades what it says
 *      where it is at least as new as what is stored.
 *   4. The sheet can neither answer after time nor pick a letter the item
 *      does not have.
 *   5. A test that expired while the student was away is abandoned (never
 *      scored) by /start and by /complete; a fully answered one is graded.
 *   6. /history flags legacy auto-submitted partials and returns the
 *      same-form comparison.
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
const MIN = 60000;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { _id: USER_ID }; next(); });
  app.use('/api/act-test', require('../../routes/actTest'));
  return app;
}

const opts = (i) => [
  { label: 'A', text: `${i}` },
  { label: 'B', text: `${i + 10}` },
  { label: 'C', text: `${i + 20}` },
  { label: 'D', text: `${i + 30}` },
];

// Question i's key is the letter at index (i % 4): p1 → B, p2 → C, p3 → D, p4 → A.
const KEY = ['A', 'B', 'C', 'D'];
function keyFor(i) { return KEY[i % 4]; }

function makeProblems(n) {
  const docs = [];
  for (let i = 1; i <= n; i++) {
    const k = keyFor(i);
    docs.push({
      problemId: `sheet-p${i}`,
      skillId: `sheet-skill-${i}`,
      prompt: `Question ${i}?`,
      answer: { value: opts(i)[KEY.indexOf(k)].text },
      answerType: 'multiple-choice',
      options: opts(i),
      correctOption: k,
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
      problemId: `sheet-p${i}`,
      skillId: `sheet-skill-${i}`,
      category: i % 2 ? 'geometry' : 'algebra',
      content: `Question ${i}?`,
      answerType: 'multiple-choice',
      options: opts(i),
    })),
    timeLimitMinutes: 50,
    ...overrides,
  });
}

const save = (app, body) => supertest(app).post('/api/act-test/save-answer').send(body);

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

describe('save-answer is sequence-guarded', () => {
  test('an older save arriving after a newer one does not overwrite it', async () => {
    const s = await makeSession();
    const sid = String(s._id);
    // The correction (seq 2, "D") lands first…
    let res = await save(app, { sessionId: sid, problemId: 'sheet-p3', position: 3, answer: 'D', seq: 2 });
    expect(res.body.saved).toBe(true);
    // …then the mis-tap (seq 1, "B") arrives late.
    res = await save(app, { sessionId: sid, problemId: 'sheet-p3', position: 3, answer: 'B', seq: 1 });
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(false);
    expect(res.body.stale).toBe(true);

    const doc = await ActTestSession.findById(sid).lean();
    const row = doc.responses.find((r) => r.position === 3);
    expect(row.answer).toBe('D');
    expect(row.seq).toBe(2);
    expect(doc.responses.filter((r) => r.position === 3)).toHaveLength(1);
  });

  test('two first-saves racing for one question leave exactly one row, with the higher seq', async () => {
    const s = await makeSession();
    const sid = String(s._id);
    await Promise.all([
      save(app, { sessionId: sid, problemId: 'sheet-p1', position: 1, answer: 'B', seq: 1 }),
      save(app, { sessionId: sid, problemId: 'sheet-p1', position: 1, answer: 'D', seq: 2 }),
    ]);
    const doc = await ActTestSession.findById(sid).lean();
    const rows = doc.responses.filter((r) => r.position === 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].answer).toBe('D');
  });

  test('a legacy client without seq still saves, and cannot clobber a sequenced row', async () => {
    const s = await makeSession();
    const sid = String(s._id);
    let res = await save(app, { sessionId: sid, problemId: 'sheet-p2', position: 2, answer: 'A' });
    expect(res.body.saved).toBe(true);
    res = await save(app, { sessionId: sid, problemId: 'sheet-p2', position: 2, answer: 'C' });
    expect(res.body.saved).toBe(true);                       // unsequenced replaces unsequenced
    res = await save(app, { sessionId: sid, problemId: 'sheet-p2', position: 2, answer: 'B', seq: 5 });
    expect(res.body.saved).toBe(true);
    res = await save(app, { sessionId: sid, problemId: 'sheet-p2', position: 2, answer: 'A' });
    expect(res.body.saved).toBe(false);                      // unsequenced cannot beat seq 5
    const doc = await ActTestSession.findById(sid).lean();
    expect(doc.responses.find((r) => r.position === 2).answer).toBe('B');
  });
});

describe('/complete grades the submitted sheet', () => {
  test('the production case: server holds a stale "B", the screen showed the right letter', async () => {
    const s = await makeSession();
    const sid = String(s._id);
    // What the server ended up with after the race — "B" for #1 and #3.
    await save(app, { sessionId: sid, problemId: 'sheet-p1', position: 1, answer: 'B', seq: 1 });
    await save(app, { sessionId: sid, problemId: 'sheet-p3', position: 3, answer: 'B', seq: 1 });
    await save(app, { sessionId: sid, problemId: 'sheet-p2', position: 2, answer: 'C', seq: 1 });
    await save(app, { sessionId: sid, problemId: 'sheet-p4', position: 4, answer: 'A', seq: 1 });
    // What the student's screen showed at submit: #1 = B (the key), #3 = D (the key).
    const res = await supertest(app).post('/api/act-test/complete').send({
      sessionId: sid,
      answers: [
        { position: 1, answer: 'B', flagged: false, seq: 1 },
        { position: 2, answer: 'C', flagged: false, seq: 1 },
        { position: 3, answer: 'D', flagged: false, seq: 2 },
        { position: 4, answer: 'A', flagged: false, seq: 1 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.report.rawScore).toBe(4);
    expect(res.body.report.sheetApplied).toBe(1);
    const doc = await ActTestSession.findById(sid).lean();
    expect(doc.responses.find((r) => r.position === 3).answer).toBe('D');
    expect(doc.responses.find((r) => r.position === 3).correct).toBe(true);
  });

  test('the sheet cannot roll a question back to an older seq', async () => {
    const s = await makeSession();
    const sid = String(s._id);
    await save(app, { sessionId: sid, problemId: 'sheet-p3', position: 3, answer: 'D', seq: 4 });
    const res = await supertest(app).post('/api/act-test/complete').send({
      sessionId: sid,
      answers: [{ position: 3, answer: 'A', seq: 2 }],
    });
    expect(res.body.report.sheetApplied).toBe(0);
    const doc = await ActTestSession.findById(sid).lean();
    expect(doc.responses.find((r) => r.position === 3).answer).toBe('D');
  });

  test('the sheet rejects letters the item does not have and unknown positions', async () => {
    const s = await makeSession();
    const sid = String(s._id);
    const res = await supertest(app).post('/api/act-test/complete').send({
      sessionId: sid,
      answers: [
        { position: 1, answer: 'F', seq: 1 },      // no such choice (positional labels are A–D)
        { position: 9, answer: 'A', seq: 1 },      // no such question
        { position: 2, answer: 'C', seq: 1 },      // valid
      ],
    });
    expect(res.body.report.sheetApplied).toBe(1);
    expect(res.body.report.rawScore).toBe(1);
  });

  test('the sheet is ignored once the section clock is well past time', async () => {
    const s = await makeSession({ startedAt: new Date(Date.now() - 52 * MIN) });   // 2 min over the 50-min limit
    const sid = String(s._id);
    // Present at the deadline: 45 answered? No — 4 of 4 here, so it grades, but
    // the late sheet must not be what it grades.
    await ActTestSession.updateOne({ _id: sid }, { $set: { responses: [1, 2, 3, 4].map((i) => ({ position: i, problemId: `sheet-p${i}`, answer: 'A', seq: 1 })) } });
    const res = await supertest(app).post('/api/act-test/complete').send({
      sessionId: sid,
      answers: [{ position: 1, answer: 'B', seq: 2 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.report.sheetApplied).toBe(0);
    expect(res.body.report.rawScore).toBe(1);   // only #4 (key A) is right
  });
});

describe('a test that expired while the student was away is not an attempt', () => {
  test('/complete on a resumed, long-expired partial sheet abandons it instead of scoring 3/45', async () => {
    const s = await makeSession({ startedAt: new Date(Date.now() - 3 * 24 * 60 * MIN) });
    const sid = String(s._id);
    await ActTestSession.updateOne({ _id: sid }, { $set: { responses: [{ position: 1, problemId: 'sheet-p1', answer: 'B', seq: 1 }] } });
    const res = await supertest(app).post('/api/act-test/complete').send({ sessionId: sid, answers: [] });
    expect(res.status).toBe(200);
    expect(res.body.abandoned).toBe(true);
    expect(res.body.reason).toBe('expired');
    const doc = await ActTestSession.findById(sid).lean();
    expect(doc.status).toBe('abandoned');
    expect(doc.abandonedReason).toBe('expired');
    expect(doc.scaledScore).toBeUndefined();
  });

  test('/start does not resume it — it abandons it and starts fresh', async () => {
    const s = await makeSession({ startedAt: new Date(Date.now() - 3 * 24 * 60 * MIN) });
    const sid = String(s._id);
    await ActTestSession.updateOne({ _id: sid }, { $set: { responses: [{ position: 1, problemId: 'sheet-p1', answer: 'B', seq: 1 }] } });
    const res = await supertest(app).post('/api/act-test/start').send({});
    expect(res.body.resumed).toBeUndefined();
    const old = await ActTestSession.findById(sid).lean();
    expect(old.status).toBe('abandoned');
    expect(old.abandonedReason).toBe('expired');
  });

  test('/start grades a long-expired sheet that was fully answered (only Submit was missed)', async () => {
    const s = await makeSession({ startedAt: new Date(Date.now() - 3 * 24 * 60 * MIN) });
    const sid = String(s._id);
    await ActTestSession.updateOne({ _id: sid }, { $set: { responses: [1, 2, 3, 4].map((i) => ({ position: i, problemId: `sheet-p${i}`, answer: keyFor(i), seq: 1 })) } });
    await supertest(app).post('/api/act-test/start').send({});
    const old = await ActTestSession.findById(sid).lean();
    expect(old.status).toBe('completed');
    expect(old.rawScore).toBe(4);
  });

  test('a minute past the deadline still scores — that is how time-up ends', async () => {
    const s = await makeSession({ startedAt: new Date(Date.now() - 51 * MIN) });
    const sid = String(s._id);
    const res = await supertest(app).post('/api/act-test/complete').send({ sessionId: sid });
    expect(res.status).toBe(200);
    expect(res.body.report.rawScore).toBe(0);
  });
});

describe('/history keeps auto-submitted partials off the trend', () => {
  test('flags them as incomplete and returns the same-form comparison', async () => {
    const day = 24 * 60 * MIN;
    const full = (i, scaled, correct, ago) => ActTestSession.create({
      userId: USER_ID, testId: 'act-math', status: 'completed',
      items: [1, 2, 3, 4].map((k) => ({ position: k, problemId: `sheet-p${k}`, category: 'algebra' })),
      responses: [1, 2, 3, 4].map((k) => ({ position: k, problemId: `sheet-p${k}`, category: 'algebra', answer: 'A', correct: k <= correct })),
      timeLimitMinutes: 50, rawScore: correct, scaledScore: scaled,
      startedAt: new Date(Date.now() - ago), completedAt: new Date(Date.now() - ago + 40 * MIN),
    });
    await full(1, 30, 3, 9 * day);
    // The polluting shape: 1 of 4 answered, "completed" two days after it started.
    await ActTestSession.create({
      userId: USER_ID, testId: 'act-math', status: 'completed',
      items: [1, 2, 3, 4].map((k) => ({ position: k, problemId: `sheet-p${k}`, category: 'algebra' })),
      responses: [
        { position: 1, problemId: 'sheet-p1', category: 'algebra', answer: 'A', correct: true },
        ...[2, 3, 4].map((k) => ({ position: k, problemId: `sheet-p${k}`, category: 'algebra', answer: null, skipped: true, correct: false })),
      ],
      timeLimitMinutes: 50, rawScore: 1, scaledScore: 7,
      startedAt: new Date(Date.now() - 5 * day), completedAt: new Date(Date.now() - 3 * day),
    });
    await full(3, 34, 4, 1 * day);

    const res = await supertest(app).get('/api/act-test/history');
    expect(res.status).toBe(200);
    expect(res.body.attempts.map((a) => a.incomplete)).toEqual([false, true, false]);
    expect(res.body.attempts[1].answered).toBe(1);
    expect(res.body.comparison.trend).toEqual([30, 34]);
    expect(res.body.comparison.delta).toBe(4);
    expect(res.body.comparison.hidden).toBe(1);
    expect(res.body.comparison.categories[0].comparable).toBe(false);   // 4 items — too few
  });
});
