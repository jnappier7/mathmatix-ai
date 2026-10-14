/**
 * The junior practice tests — the PSAT and the PreACT 10.
 *
 * Each is its senior exam's runner on its own rail (utils/practiceTests.js
 * 'psat-math' / 'preact-math'), and each feeds that exam's prep course. Pinned
 * here, against the REAL banks:
 *
 *   1. The PSAT is the SAT's shape (two adaptive 22-item modules, grid-ins,
 *      the SAT bank) reported on 160–760; the PreACT is 36 ACT items in 45
 *      minutes, without the topics a tenth grader has not met, reported 1–35.
 *   2. Every test keeps its own sessions: a PSAT is never resumed, abandoned
 *      or reported as an SAT, nor a PreACT as an ACT.
 *   3. A junior test feeds its senior course: a PSAT is a sat-prep baseline and
 *      seeds its review; that bootcamp then names, and retests on, the PSAT.
 *      It never crosses families: a PSAT is not an ACT-prep baseline.
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
const CourseSession = require('../../models/courseSession');
const {
  useTest, practiceTestKeyForCourse, getTestDefByCourse, testDefForCourseSession,
} = require('../../utils/practiceTests');
const { seedBootcampFromLatestTest } = require('../../utils/actBootcampSeed');
const { reassessPromptSection } = require('../../utils/actReview');
const { buildActPracticeGuidance } = require('../../utils/coursePrompt');
const { buildCourseDiagnostic } = require('../../utils/courseDiagnostic');
const PREACT_BLUEPRINT = require('../../seeds/preact-math-blueprint.json');
const SAT_ITEMS = require('../../seeds/sat-items.generated.json');
const ACT_ITEMS = [
  ...require('../../seeds/act-enhanced/act-items.generated.json'),
  ...require('../../seeds/act-fable-items.generated.json'),
];

let userId;

function makeApp() {
  const app = express();
  app.use(express.json());
  const routes = require('../../routes/actTest');
  const signedIn = (req, _res, next) => { req.user = { _id: userId }; next(); };
  app.use('/api/sat-test', signedIn, useTest('sat-math'), routes);
  app.use('/api/psat-test', signedIn, useTest('psat-math'), routes);
  app.use('/api/act-test', signedIn, routes);
  app.use('/api/preact-test', signedIn, useTest('preact-math'), routes);
  app.use('/api/psat-practice', useTest('psat-math'), routes.guestRouter);
  app.use('/api/preact-practice', useTest('preact-math'), routes.guestRouter);
  return app;
}

function newCourse(courseId) {
  return new CourseSession({
    userId, courseId, courseName: courseId, pathwayId: `${courseId}-pathway`,
    modules: [{ moduleId: 'algebra', status: 'available' }],
    currentModuleId: 'algebra', overallProgress: 0, status: 'active',
  });
}

/** Take a whole PSAT, leaving every question blank. */
async function takePsat() {
  const start = await supertest(app).post('/api/psat-test/start').send({});
  expect(start.status).toBe(200);
  const sid = String(start.body.sessionId);
  await supertest(app).post('/api/psat-test/next-module').send({ sessionId: sid, answers: [] });
  const done = await supertest(app).post('/api/psat-test/complete').send({ sessionId: sid, answers: [] });
  expect(done.status).toBe(200);
  return { sid, done: done.body };
}

let mem; let app;
beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  await Problem.insertMany([...SAT_ITEMS, ...ACT_ITEMS], { ordered: false });
  app = makeApp();
}, 120000);
afterAll(async () => { await mongoose.disconnect(); if (mem) await mem.stop(); });
beforeEach(() => { userId = new mongoose.Types.ObjectId(); });
afterEach(async () => { await ActTestSession.deleteMany({}); await CourseSession.deleteMany({}); });

describe('the PSAT', () => {
  test('is the SAT\'s shape, drawn from the SAT bank, and is stored as a PSAT', async () => {
    const res = await supertest(app).post('/api/psat-test/start').send({});
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(22);
    expect(res.body.timeLimitMinutes).toBe(35);
    expect(res.body.module).toMatchObject({ current: 1, count: 2, totalItems: 44 });
    const s = await ActTestSession.findById(res.body.sessionId).lean();
    expect(s.testId).toBe('psat-math');
    const satIds = new Set(SAT_ITEMS.map((p) => p.problemId));
    s.items.forEach((it) => expect(satIds.has(it.problemId)).toBe(true));
  });

  test('a blank paper scores the bottom of 160–760, and a perfect one stays inside it', async () => {
    const { done } = await takePsat();
    expect(done.report.scaledScore).toBe(160);
    const { irtScaled } = require('../../utils/testModules');
    const bp = require('../../seeds/psat-math-blueprint.json');
    const items = Array.from({ length: 44 }, (_, i) => ({ position: i + 1, difficulty: 2 }));
    const perfect = irtScaled(items, items.map((it) => ({ position: it.position, correct: true })), bp);
    expect(perfect.scaled).toBeLessThanOrEqual(760);
    expect(perfect.scaled).toBeGreaterThan(600);
  });

  test('keeps its own sessions: an in-progress PSAT is not the SAT\'s to resume', async () => {
    const psat = await supertest(app).post('/api/psat-test/start').send({});
    const sat = await supertest(app).post('/api/sat-test/start').send({});
    expect(String(sat.body.sessionId)).not.toBe(String(psat.body.sessionId));
    const again = await supertest(app).post('/api/psat-test/start').send({});
    expect(String(again.body.sessionId)).toBe(String(psat.body.sessionId));
    const still = await ActTestSession.findById(psat.body.sessionId).lean();
    expect(still.status).toBe('in_progress');
  });

  test('has a public guest rail of its own', async () => {
    const res = await supertest(app).post('/api/psat-practice/start').send({});
    expect(res.status).toBe(200);
    expect(res.body.guestToken).toMatch(/^[a-f0-9]{64}$/);
    const s = await ActTestSession.findById(res.body.sessionId).lean();
    expect(s.testId).toBe('psat-math');
    expect(s.userId == null).toBe(true);
  });
});

describe('the PreACT', () => {
  test('is 36 ACT questions in 45 minutes, without the topics past tenth grade', async () => {
    const res = await supertest(app).post('/api/preact-test/start').send({});
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(36);
    expect(res.body.timeLimitMinutes).toBe(45);
    const s = await ActTestSession.findById(res.body.sessionId).lean();
    expect(s.testId).toBe('preact-math');
    const allowed = new Set(Object.values(PREACT_BLUEPRINT.skillsByCategory).flat());
    s.items.forEach((it) => expect(allowed.has(it.skillId)).toBe(true));
    ['act-logarithms', 'act-matrices-vectors', 'act-law-of-sines-cosines', 'act-trigonometric-functions']
      .forEach((skill) => expect(allowed.has(skill)).toBe(false));
    // The real PreACT 10 asks about i (students met i^3 on it), so complex
    // numbers are in scope even though the rest of upper-level N&Q is not.
    expect(allowed.has('act-complex-numbers')).toBe(true);
  });

  test('is an easier form than the ACT', async () => {
    const pre = await supertest(app).post('/api/preact-test/start').send({});
    const act = await supertest(app).post('/api/act-test/start').send({});
    const mean = async (sid) => {
      const s = await ActTestSession.findById(sid).lean();
      return s.items.reduce((t, it) => t + Number(it.difficulty || 3), 0) / s.items.length;
    };
    expect(await mean(pre.body.sessionId)).toBeLessThan(await mean(act.body.sessionId));
  });

  test('scores like the ACT: a blank sheet is 1, a perfect one 35, and the curve only climbs', async () => {
    const start = await supertest(app).post('/api/preact-test/start').send({});
    const done = await supertest(app).post('/api/preact-test/complete').send({ sessionId: String(start.body.sessionId), answers: [] });
    expect(done.status).toBe(200);
    expect(done.body.report.scaledScore).toBe(1);
    const table = PREACT_BLUEPRINT.scaledScore.scaledByRaw;
    expect(table).toHaveLength(37);
    expect(table[0]).toBe(1);
    expect(table[36]).toBe(35);
    table.slice(1).forEach((v, i) => expect(v).toBeGreaterThanOrEqual(table[i]));
    // Equated to the ACT, so half right on the EASIER form is below the
    // ACT's half-right score.
    const actTable = require('../../seeds/act-math-blueprint.json').scaledScore.scaledByRaw;
    expect(table[18]).toBeLessThan(actTable[23]);
  });

  test('has a public guest rail of its own', async () => {
    const res = await supertest(app).post('/api/preact-practice/start').send({});
    expect(res.status).toBe(200);
    const s = await ActTestSession.findById(res.body.sessionId).lean();
    expect(s.testId).toBe('preact-math');
  });
});

test('every practice test\'s funnel events are ones the model accepts', () => {
  // A missing enum value fails the write and is only logged — the funnel for
  // that test would read zero with no error anywhere.
  const { CONVERSION_EVENTS } = require('../../models/conversionEvent');
  const { TESTS } = require('../../utils/practiceTests');
  Object.values(TESTS).forEach((d) => ['started', 'completed', 'claimed'].forEach((step) => {
    expect(CONVERSION_EVENTS).toContain(`${d.eventPrefix}_guest_${step}`);
  }));
});

describe('feeding the prep courses', () => {
  test('a PSAT is a sat-prep baseline, and the bootcamp it seeds is the PSAT\'s', async () => {
    const cs = newCourse('sat-prep');
    await cs.save();
    const { done } = await takePsat();
    expect(done.actPrepSessionId).toBe(String(cs._id));
    const seeded = await CourseSession.findById(cs._id).lean();
    expect(seeded.bootcamp.testId).toBe('psat-math');
    expect(seeded.bootcamp.queue.length).toBeGreaterThan(0);
    seeded.bootcamp.queue.forEach((q) => expect(q.qLabel).toMatch(/^Module [12], question \d+$/));

    // Baseline satisfied, and the retest is another PSAT, named as one.
    expect(await buildCourseDiagnostic({ _id: userId }, 'sat-prep')).toBeNull();
    expect(practiceTestKeyForCourse('sat-prep', seeded.bootcamp.testId)).toBe('psat');
    expect(testDefForCourseSession(seeded).testId).toBe('psat-math');
    expect(buildActPracticeGuidance(seeded)).toMatch(/PRACTICE PSAT/);
    expect(reassessPromptSection({ ...seeded.bootcamp, phase: 'reassess' })).toMatch(/practice PSAT/);
  });

  test('a new sat-prep enrollment seeds from an earlier PSAT', async () => {
    await takePsat();
    const sat = newCourse('sat-prep');
    expect(await seedBootcampFromLatestTest(sat, userId)).toBe(true);
    expect(sat.bootcamp.testId).toBe('psat-math');
  });

  test('a junior test never crosses families', async () => {
    await takePsat();
    expect(await buildCourseDiagnostic({ _id: userId }, 'act-prep')).toMatchObject({ type: 'act-practice', blocking: true });
    expect(await seedBootcampFromLatestTest(newCourse('act-prep'), userId)).toBe(false);
    // A bootcamp testId from the other family never picks the retest.
    expect(practiceTestKeyForCourse('act-prep', 'psat-math')).toBe('act');
  });

  test('the courses still belong to the senior exams', () => {
    expect(getTestDefByCourse('sat-prep').testId).toBe('sat-math');
    expect(getTestDefByCourse('act-prep').testId).toBe('act-math');
    expect(practiceTestKeyForCourse('sat-prep')).toBe('sat');
    expect(practiceTestKeyForCourse('act-prep', 'preact-math')).toBe('preact');
  });
});
