/**
 * GET /api/parent/child/:childId/test-prep against a real (in-memory) database.
 * A parent sees practice-test results for THEIR linked child only — same
 * numbers and flags as the teacher's Test Prep tab, no class data — and every
 * successful read is FERPA-logged as a parental right-of-access read.
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const ActTestSession = require('../../models/actTestSession');
const EducationRecordAccessLog = require('../../models/educationRecordAccessLog');

const MIN = 60000;
let mem, app, currentUserId;
let parent, child, quietChild, strangerChild;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  app = express();
  app.use(express.json());
  app.use(async (req, _res, next) => {
    req.user = await User.findById(currentUserId);
    req.isAuthenticated = () => true;
    next();
  });
  app.use('/api/parent', require('../../routes/parent'));
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

let n = 0;
const mk = (roles, extra = {}) => {
  n += 1;
  return User.create({ username: `ptp${n}${Date.now()}`, email: `ptp${n}${Date.now()}@e.com`, firstName: `F${n}`, lastName: 'L', role: roles[0], roles, ...extra });
};
const take = (userId, o = {}) => {
  const start = o.start || new Date(Date.now() - 3 * 24 * 60 * MIN);
  return ActTestSession.create({
    userId, testId: o.testId || 'act-math', status: 'completed', timeLimitMinutes: 50, startedAt: start,
    completedAt: new Date(start.getTime() + (o.minutes || 45) * MIN),
    items: Array.from({ length: 4 }, (_, i) => ({ position: i, problemId: `p${i}` })),
    responses: Array.from({ length: 4 }, (_, i) => ({ position: i, problemId: `p${i}`, category: 'algebra', correct: i < (o.correct ?? 3), answer: 'A' })),
    rawScore: o.correct ?? 3, scaledScore: o.scaled ?? 24,
  });
};

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), ActTestSession.deleteMany({}), EducationRecordAccessLog.deleteMany({})]);
  child = await mk(['student'], { firstName: 'Ada' });
  quietChild = await mk(['student'], { firstName: 'Bo' });
  strangerChild = await mk(['student'], { firstName: 'Zed' });
  parent = await mk(['parent'], { children: [child._id, quietChild._id] });
  currentUserId = parent._id;
  await take(child._id, { scaled: 20 });
  await take(child._id, { scaled: 26, start: new Date(Date.now() - 24 * 60 * MIN) });
  await take(child._id, { scaled: 30, minutes: 5, start: new Date(Date.now() - 60 * MIN) }); // rushed
  await take(child._id, { testId: 'psat-math', scaled: 480 });
  await take(strangerChild._id, { scaled: 36 });
});

test('linked child → 200 with exams, junior tests first, change over fair attempts only', async () => {
  const { body } = await supertest(app).get(`/api/parent/child/${child._id}/test-prep`).expect(200);
  expect(body.success).toBe(true);
  expect(body.exams.map(e => e.label)).toEqual(['PSAT', 'ACT']);
  const act = body.exams.find(e => e.testId === 'act-math');
  expect(act.attemptCount).toBe(3);
  expect(act.latest.scaledScore).toBe(30);
  expect(act.latest.flags).toContain('rushed');
  expect(act.change).toBe(6); // 20 → 26; the rushed 30 is not growth
  expect(act.best.scaledScore).toBe(26);
  expect(act.latest.byCategory.algebra).toMatchObject({ correct: 3, total: 4 });
  expect(body).not.toHaveProperty('summaries');
});

test('non-linked child → 403 and nothing about them is returned', async () => {
  const res = await supertest(app).get(`/api/parent/child/${strangerChild._id}/test-prep`).expect(403);
  expect(res.body.exams).toBeUndefined();
});

test('a malformed id is a 403, not a cast error', async () => {
  await supertest(app).get('/api/parent/child/not-an-id/test-prep').expect(403);
});

test('linked child with no attempts → empty list', async () => {
  const { body } = await supertest(app).get(`/api/parent/child/${quietChild._id}/test-prep`).expect(200);
  expect(body).toEqual({ success: true, exams: [] });
});

test('a non-parent account is refused', async () => {
  currentUserId = strangerChild._id;
  const res = await supertest(app).get(`/api/parent/child/${child._id}/test-prep`);
  expect(res.status).toBe(403);
});

test('a successful read is FERPA-logged for that child only; a refused one is not', async () => {
  await supertest(app).get(`/api/parent/child/${child._id}/test-prep`).expect(200);
  await supertest(app).get(`/api/parent/child/${strangerChild._id}/test-prep`).expect(403);
  await new Promise(r => setTimeout(r, 200));
  const logs = await EducationRecordAccessLog.find({ accessedBy: parent._id }).lean();
  expect(logs.map(l => String(l.studentId))).toEqual([String(child._id)]);
  expect(logs[0]).toMatchObject({ recordType: 'assessment_results', legitimateInterest: 'parental_right_of_access' });
});
