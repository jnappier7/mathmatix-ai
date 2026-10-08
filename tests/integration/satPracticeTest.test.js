/**
 * SAT Math practice test — the ACT runner, mounted as the SAT.
 *
 * routes/actTest.js serves every timed practice test; what makes one the SAT
 * is its definition in utils/practiceTests.js (blueprint, scale, skill names,
 * no prep course). This drives the REAL SAT bank (seeds/sat-items.generated
 * .json) through the REAL blueprint and pins what is new on this mount:
 *
 *   1. A form is the SAT's shape: 44 items, 70 minutes, 15/15/7/7 by domain,
 *      grid-ins included — and only sat-fable items. The SAT's skills are
 *      unified-taxonomy ids shared with the whole tutoring bank, so a decoy
 *      worksheet item under the same skill must never reach a form.
 *   2. The two tests never touch each other's sessions: starting the SAT does
 *      not abandon an in-progress ACT, the ACT still resumes, and an SAT
 *      session is not found through /api/act-test.
 *   3. A typed grid-in answer grades (with equivalents), and the report is on
 *      the 200–800 scale, names weak skills in words, and carries no ACT plan.
 *   4. History is per test, and a retake never repeats an item.
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

const USER_ID = new mongoose.Types.ObjectId();
const DOMAINS = ['algebra', 'advanced-math', 'problem-solving-data', 'geometry-trig'];

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { _id: USER_ID }; next(); });
  const routes = require('../../routes/actTest');
  app.use('/api/act-test', routes);
  app.use('/api/sat-test', useTest('sat-math'), routes);
  return app;
}

// A worksheet item for every SAT skill, under the SAME skillId — exactly what
// the live bank holds. Easy, multiple choice, active: the most attractive
// candidate there is, if the source pin ever leaks.
function decoys() {
  const skills = [...new Set(SAT_ITEMS.map((p) => p.skillId))];
  return skills.flatMap((skillId, i) => [1, 2].map((k) => ({
    problemId: `decoy-${i}-${k}`,
    skillId,
    prompt: `Worksheet practice ${i}-${k}: solve for x.`,
    answer: { value: '1' },
    answerType: 'multiple-choice',
    options: [{ label: 'A', text: '1' }, { label: 'B', text: '2' }, { label: 'C', text: '3' }, { label: 'D', text: '4' }],
    correctOption: 'A',
    difficulty: 3,
    isActive: true,
    source: 'unified-worksheet',
  })));
}

const domainOf = (problemId) => {
  const p = SAT_ITEMS.find((x) => x.problemId === problemId);
  return p && p.tags.find((t) => DOMAINS.includes(t));
};

let mem; let app;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  await Problem.insertMany([...SAT_ITEMS, ...decoys()]);
  app = makeApp();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

afterEach(async () => {
  await ActTestSession.deleteMany({});
});

async function startSat(body = {}) {
  const res = await supertest(app).post('/api/sat-test/start').send(body);
  expect(res.status).toBe(200);
  return ActTestSession.findById(res.body.sessionId).lean();
}

test('a form is the SAT shape, drawn only from the SAT bank', async () => {
  const res = await supertest(app).post('/api/sat-test/start').send({});
  expect(res.status).toBe(200);
  expect(res.body.totalItems).toBe(44);
  expect(res.body.timeLimitMinutes).toBe(70);

  const session = await ActTestSession.findById(res.body.sessionId).lean();
  expect(session.testId).toBe('sat-math');
  expect(session.items).toHaveLength(44);
  // Only SAT items — no decoy under a shared skill id.
  session.items.forEach((it) => expect(it.problemId).toMatch(/^sat-math-/));
  // Domain counts are the blueprint's, and the category stored on each item
  // is the domain the item was written for.
  const counts = {};
  session.items.forEach((it) => {
    counts[it.category] = (counts[it.category] || 0) + 1;
    expect(domainOf(it.problemId)).toBe(it.category);
  });
  expect(counts).toEqual({ 'algebra': 15, 'advanced-math': 15, 'problem-solving-data': 7, 'geometry-trig': 7 });
  // Grid-ins ride along, with no choices sent.
  const gridIns = session.items.filter((it) => it.answerType === 'constructed-response');
  expect(gridIns.length).toBeGreaterThan(0);
  gridIns.forEach((it) => expect(it.options || []).toHaveLength(0));
});

test('SAT and ACT sessions never resume, abandon or open each other', async () => {
  const act = await ActTestSession.create({
    userId: USER_ID,
    testId: 'act-math',
    items: [{ position: 1, problemId: 'act-x', skillId: 'act-algebra', category: 'algebra', content: 'Q?', answerType: 'multiple-choice', options: [{ label: 'A', text: '1' }, { label: 'B', text: '2' }] }],
    timeLimitMinutes: 50,
  });

  const sat = await startSat();
  expect(String(sat._id)).not.toBe(String(act._id));
  // The ACT is still in progress, and the ACT rail resumes it.
  expect((await ActTestSession.findById(act._id).lean()).status).toBe('in_progress');
  const resumed = await supertest(app).post('/api/act-test/start').send({});
  expect(resumed.body.resumed).toBe(true);
  expect(String(resumed.body.sessionId)).toBe(String(act._id));

  // And the SAT rail resumes the SAT, not the ACT.
  const satAgain = await supertest(app).post('/api/sat-test/start').send({});
  expect(satAgain.body.resumed).toBe(true);
  expect(String(satAgain.body.sessionId)).toBe(String(sat._id));

  // Neither mount serves the other's session.
  const cross = await supertest(app).get(`/api/act-test/overview?sessionId=${sat._id}`);
  expect(cross.status).toBe(404);
  const crossBack = await supertest(app).get(`/api/sat-test/overview?sessionId=${act._id}`);
  expect(crossBack.status).toBe(404);
});

test('a typed grid-in grades, and the report is on the SAT scale with no ACT plan', async () => {
  const session = await startSat();
  const keyOf = (problemId) => SAT_ITEMS.find((p) => p.problemId === problemId);

  // Answer every question correctly: the letter for multiple choice, the
  // typed value for a grid-in — with a trailing ".0" on the first grid-in, so
  // an equivalent, not just the stored string, has to grade.
  let paddedOne = false;
  const answers = session.items.map((it) => {
    const key = keyOf(it.problemId);
    let answer;
    if (it.answerType === 'constructed-response') {
      answer = String(key.answer.value);
      if (!paddedOne && /^\d+$/.test(answer)) { answer = `${answer}.0`; paddedOne = true; }
    } else {
      // The form's choices may be reordered; answer by the correct TEXT's letter.
      const correctText = key.options.find((o) => o.label === key.correctOption).text;
      answer = it.options.find((o) => o.text === correctText).label;
    }
    return { position: it.position, problemId: it.problemId, answer, seq: 1 };
  });
  expect(paddedOne).toBe(true);

  const res = await supertest(app).post('/api/sat-test/complete').send({ sessionId: String(session._id), answers });
  expect(res.status).toBe(200);
  const { report } = res.body;
  expect(report.rawScore).toBe(44);
  expect(report.scaledScore).toBe(800);
  expect(report.scaledApproximate).toBe(true);
  expect(report.plan).toBeNull();
  expect(res.body.actPrepSessionId).toBeNull();
  expect(Object.keys(report.byCategory).sort()).toEqual([...DOMAINS].sort());
});

test('weak skills and missed groups are named in words, never a dotted id', async () => {
  const session = await startSat();
  // Leave everything blank: every skill is weak.
  const res = await supertest(app).post('/api/sat-test/complete').send({ sessionId: String(session._id), answers: [] });
  expect(res.status).toBe(200);
  const { report } = res.body;
  expect(report.scaledScore).toBe(200);
  expect(report.weakSkills.length).toBeGreaterThan(0);
  report.weakSkills.forEach((s) => expect(s.name).not.toMatch(/^[A-Z0-9]+\.[A-Z]+\.\d+$/));
  report.missedByGroup.forEach((g) => expect(g.label).not.toMatch(/^[A-Z0-9]+\.[A-Z]+\.\d+$/));
});

test('an over-long typed answer is refused by the answer sheet', async () => {
  const session = await startSat();
  const gridIn = session.items.find((it) => it.answerType === 'constructed-response');
  const res = await supertest(app).post('/api/sat-test/complete').send({
    sessionId: String(session._id),
    answers: [{ position: gridIn.position, problemId: gridIn.problemId, answer: '1'.repeat(40), seq: 1 }],
  });
  expect(res.status).toBe(200);
  expect(res.body.report.sheetApplied).toBe(0);
});

test('history is per test, and a retake never repeats an item', async () => {
  const first = await startSat();
  await supertest(app).post('/api/sat-test/complete').send({ sessionId: String(first._id), answers: [] });
  const second = await startSat({ restart: true });
  const overlap = second.items.filter((it) => first.items.some((f) => f.problemId === it.problemId));
  expect(overlap).toHaveLength(0);
  second.items.forEach((it) => expect(it.problemId).toMatch(/^sat-math-/));

  await ActTestSession.create({
    userId: USER_ID, testId: 'act-math', status: 'completed', completedAt: new Date(),
    items: [{ position: 1, problemId: 'act-x', category: 'algebra' }],
    responses: [{ position: 1, problemId: 'act-x', category: 'algebra', answer: 'A', correct: true }],
    rawScore: 1, scaledScore: 36,
  });
  const satHistory = await supertest(app).get('/api/sat-test/history');
  expect(satHistory.body.count).toBe(1);
  expect(satHistory.body.attempts[0].scaledScore).toBe(200);
  const actHistory = await supertest(app).get('/api/act-test/history');
  expect(actHistory.body.count).toBe(1);
  expect(actHistory.body.attempts[0].scaledScore).toBe(36);
});
