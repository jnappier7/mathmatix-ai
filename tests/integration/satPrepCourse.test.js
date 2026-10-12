/**
 * The SAT prep course (sat-prep) — the ACT bootcamp loop, on the SAT.
 *
 * Test → review every miss with the tutor → transfer practice → retest. The
 * loop machinery is shared with ACT prep; what makes this one the SAT's is the
 * course's exam (utils/practiceTests.js getTestDefByCourse). Pinned here,
 * against the REAL SAT bank:
 *
 *   1. A finished SAT seeds the sat-prep bootcamp: the SAT plan (domains →
 *      sat-prep modules), a review queue stamped with the exam and with
 *      questions named the way the student saw them ("Module 2, question 3").
 *   2. The exams never cross: an SAT test neither seeds ACT prep nor counts as
 *      the ACT baseline, and the SAT baseline is required for sat-prep until an
 *      SAT is taken.
 *   3. The tutor's prompts are the SAT's: practice SAT, A–D letters (never the
 *      ACT's F–G–H–J), the Desmos/grid-in strategy; and a retest opens the SAT.
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
const { useTest, practiceTestKeyForCourse } = require('../../utils/practiceTests');
const { seedBootcampFromLatestTest } = require('../../utils/actBootcampSeed');
const { reviewPromptSection, reassessPromptSection } = require('../../utils/actReview');
const { buildActPracticeGuidance } = require('../../utils/coursePrompt');
const { buildCourseDiagnostic } = require('../../utils/courseDiagnostic');
const SAT_ITEMS = require('../../seeds/sat-items.generated.json');

let userId;
const KEY = new Map(SAT_ITEMS.map((p) => [p.problemId, p]));

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { _id: userId }; next(); });
  app.use('/api/sat-test', useTest('sat-math'), require('../../routes/actTest'));
  return app;
}

function wrong(it) {
  const key = KEY.get(it.problemId);
  if (it.answerType === 'constructed-response') return '99999';
  const right = key.options.find((o) => o.label === key.correctOption).text;
  return it.options.find((o) => o.text !== right).label;
}

/** Take a whole SAT, answering about half of each module wrong. */
async function takeSat(app) {
  const start = await supertest(app).post('/api/sat-test/start').send({});
  const sid = String(start.body.sessionId);
  let s = await ActTestSession.findById(sid).lean();
  const sheet = (items) => items.map((it, i) => ({ position: it.position, problemId: it.problemId, answer: i % 2 ? wrong(it) : null, seq: 1 }));
  await supertest(app).post('/api/sat-test/next-module').send({ sessionId: sid, answers: sheet(s.items.filter((it) => it.module === 1)) });
  s = await ActTestSession.findById(sid).lean();
  const done = await supertest(app).post('/api/sat-test/complete').send({ sessionId: sid, answers: sheet(s.items.filter((it) => it.module === 2)) });
  return { sid, done: done.body };
}

function newCourse(courseId) {
  return new CourseSession({
    userId, courseId, courseName: courseId, pathwayId: `${courseId}-pathway`,
    modules: [{ moduleId: 'algebra', status: 'available' }, { moduleId: 'advanced_math', status: 'available' }],
    currentModuleId: 'algebra', overallProgress: 0, status: 'active',
  });
}

let mem; let app;
beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  await Problem.insertMany(SAT_ITEMS);
  app = makeApp();
}, 60000);
afterAll(async () => { await mongoose.disconnect(); if (mem) await mem.stop(); });
beforeEach(() => { userId = new mongoose.Types.ObjectId(); });

test('a finished SAT seeds the sat-prep bootcamp with an SAT review queue', async () => {
  const cs = newCourse('sat-prep');
  await cs.save();
  const { done } = await takeSat(app);
  // Enrolled: /complete seeds the course and hands back its session for review.
  expect(done.actPrepSessionId).toBe(String(cs._id));
  const seeded = await CourseSession.findById(cs._id).lean();
  const bc = seeded.bootcamp;
  expect(bc.phase).toBe('review');
  expect(bc.testId).toBe('sat-math');
  expect(bc.queue.length).toBeGreaterThan(5);
  bc.queue.forEach((q) => {
    expect(q.testId).toBe('sat-math');
    expect(q.qLabel).toMatch(/^Module [12], question \d+$/);
  });
  // A Module 2 miss is named by its module, never by its stored position.
  const m2 = bc.queue.find((q) => q.position > 22);
  expect(m2.qLabel).toBe(`Module 2, question ${m2.position - 22}`);
  // The SAT plan, not the ACT's.
  expect(['algebra', 'advanced_math', 'problem_solving_data', 'geometry_trig']).toContain(seeded.diagnosticPlan.startModuleId);
});

test('the exams never cross: an SAT neither seeds ACT prep nor counts as its baseline', async () => {
  await takeSat(app);
  const act = newCourse('act-prep');
  expect(await seedBootcampFromLatestTest(act, userId)).toBe(false);
  const user = { _id: userId };
  expect(await buildCourseDiagnostic(user, 'act-prep')).toMatchObject({ type: 'act-practice', blocking: true });
  // …while the SAT course is satisfied by it, and seeds from it on enroll.
  expect(await buildCourseDiagnostic(user, 'sat-prep')).toBeNull();
  const sat = newCourse('sat-prep');
  expect(await seedBootcampFromLatestTest(sat, userId)).toBe(true);
  expect(sat.bootcamp.testId).toBe('sat-math');
});

test('a new student owes the SAT baseline before sat-prep teaching starts', async () => {
  const diag = await buildCourseDiagnostic({ _id: userId }, 'sat-prep');
  expect(diag).toMatchObject({ type: 'sat-practice', required: true, blocking: true, cta: 'Take the practice SAT' });
});

test('the tutor\'s prompts are the SAT\'s, and a retest opens the SAT', async () => {
  const cs = newCourse('sat-prep');
  await cs.save();
  await takeSat(app);
  const bc = (await CourseSession.findById(cs._id).lean()).bootcamp;
  const mc = bc.queue.find((q) => q.options && q.options.length && q.position % 2 === 0 && q.theirAnswer);
  const prompt = reviewPromptSection(mc, 0, bc.queue.length, []);
  expect(prompt).toMatch(/practice SAT/);
  expect(prompt).not.toMatch(/practice ACT/);
  expect(prompt).toMatch(/Desmos/);
  expect(prompt).toMatch(new RegExp(`Module 2, question ${mc.position - 22}|Module 1, question ${mc.position}`));
  // Even-numbered SAT questions keep A–D: no F/G/H/J anywhere in the choices.
  expect(prompt).toMatch(/OPTIONS: A\) .*B\) .*C\) .*D\) /);
  expect(prompt).not.toMatch(/\b[FGHJ]\) /);

  const reassess = reassessPromptSection({ ...bc, phase: 'reassess' });
  expect(reassess).toMatch(/practice SAT/);
  expect(reassess).toMatch(/two 22-question modules/);
  expect(buildActPracticeGuidance({ courseId: 'sat-prep' })).toMatch(/PRACTICE SAT/);
  expect(practiceTestKeyForCourse('sat-prep')).toBe('sat');
  expect(practiceTestKeyForCourse('act-prep')).toBe('act');
});
