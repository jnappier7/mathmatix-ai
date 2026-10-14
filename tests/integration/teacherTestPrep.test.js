/**
 * GET /api/teacher/test-prep/scores and /export.csv against a real database.
 * Scoping is the roster rule: only this teacher's CURRENT students (archived
 * excluded), a class filter only for the teacher's own classes, and each
 * read is logged per student whose results were returned.
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const EnrollmentCode = require('../../models/enrollmentCode');
const ActTestSession = require('../../models/actTestSession');
const EducationRecordAccessLog = require('../../models/educationRecordAccessLog');

const MIN = 60000;
let mem, app, currentUser;
let teacher, other, kidA, kidB, archivedKid, strangerKid, cls;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = currentUser; req.isAuthenticated = () => true; next(); });
  app.use('/api/teacher/test-prep', require('../../routes/teacherTestPrep'));
  app.use('/api/activities', require('../../routes/activities'));
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

let n = 0;
const mk = (roles, extra = {}) => {
  n += 1;
  return User.create({ username: `tp${n}${Date.now()}`, email: `tp${n}${Date.now()}@e.com`, firstName: extra.firstName || `F${n}`, lastName: 'L', role: roles[0], roles, ...extra });
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
  await Promise.all([User.deleteMany({}), EnrollmentCode.deleteMany({}), ActTestSession.deleteMany({}), EducationRecordAccessLog.deleteMany({})]);
  teacher = await mk(['teacher']);
  other = await mk(['teacher']);
  kidA = await mk(['student'], { firstName: 'Ada', teacherId: teacher._id });
  kidB = await mk(['student'], { firstName: 'Ben', teacherId: teacher._id });
  archivedKid = await mk(['student'], { firstName: 'Old', teacherId: teacher._id });
  strangerKid = await mk(['student'], { firstName: 'Zed', teacherId: other._id });
  await User.updateOne({ _id: teacher._id }, { $set: { archivedStudents: [{ studentId: archivedKid._id, archivedAt: new Date(), schoolYear: '2025-26' }] } });
  cls = await EnrollmentCode.create({ code: `TP${n}${Date.now()}`.slice(0, 12), teacherId: teacher._id, className: 'Alg 1', enrolledStudents: [{ studentId: kidA._id }] });
  await take(kidA._id, { scaled: 20 });
  await take(kidA._id, { scaled: 26, start: new Date(Date.now() - 24 * 60 * MIN) });
  await take(kidB._id, { scaled: 30, minutes: 5 }); // rushed
  await take(kidB._id, { testId: 'psat-math', scaled: 480 });
  await take(archivedKid._id, { scaled: 35 });
  await take(strangerKid._id, { scaled: 36 });
  currentUser = teacher;
});

const byName = (body, first) => body.students.find(s => s.name.startsWith(first));

test('current students only, with per-exam first / latest / best / change', async () => {
  const { body } = await supertest(app).get('/api/teacher/test-prep/scores').expect(200);
  expect(body.students.map(s => s.name.split(' ')[0]).sort()).toEqual(['Ada', 'Ben']);
  const ada = byName(body, 'Ada').exams['act-math'];
  expect(ada).toMatchObject({ attemptCount: 2, change: 6 });
  expect(ada.best.scaledScore).toBe(26);
  const ben = byName(body, 'Ben').exams['act-math'];
  expect(ben.latest.flags).toContain('rushed');
  expect(ben.best).toBeNull();
});

test('class average leaves out flagged attempts and says so', async () => {
  const { body } = await supertest(app).get('/api/teacher/test-prep/scores').expect(200);
  const act = body.summaries.find(s => s.testId === 'act-math');
  expect(act).toMatchObject({ studentsTested: 2, averagedOver: 1, excludedFlagged: 1, classAverage: 26 });
  expect(body.exams.map(e => e.label)).toEqual(['PreACT', 'PSAT', 'SAT', 'ACT']);
});

test('class and exam filters; a class that is not mine is a 404', async () => {
  const { body } = await supertest(app).get(`/api/teacher/test-prep/scores?classId=${cls._id}&exam=act-math`).expect(200);
  expect(body.students.map(s => s.name.split(' ')[0])).toEqual(['Ada']);
  expect(body.summaries).toHaveLength(1);
  const theirs = await EnrollmentCode.create({ code: `X${n}${Date.now()}`.slice(0, 12), teacherId: other._id, className: 'Theirs', enrolledStudents: [{ studentId: strangerKid._id }] });
  await supertest(app).get(`/api/teacher/test-prep/scores?classId=${theirs._id}`).expect(404);
});

test('every read is logged for the students whose results were returned', async () => {
  await supertest(app).get('/api/teacher/test-prep/scores').expect(200);
  await new Promise(r => setTimeout(r, 200));
  const logs = await EducationRecordAccessLog.find({ accessedBy: teacher._id }).lean();
  expect(logs.map(l => String(l.studentId)).sort()).toEqual([String(kidA._id), String(kidB._id)].sort());
  expect(logs.every(l => l.recordType === 'assessment_results')).toBe(true);
});

test('CSV: one row per attempt, flags included, logged as an export', async () => {
  const res = await supertest(app).get('/api/teacher/test-prep/export.csv').expect(200);
  expect(res.headers['content-type']).toMatch(/text\/csv/);
  const lines = res.text.replace(/^﻿/, '').split('\r\n');
  expect(lines).toHaveLength(1 + 4);
  expect(lines.find(l => l.startsWith('Ben') && l.includes(',ACT,'))).toMatch(/rushed/);
  await new Promise(r => setTimeout(r, 200));
  expect(await EducationRecordAccessLog.countDocuments({ accessType: 'export' })).toBe(2);
});

test('another teacher sees none of my students', async () => {
  currentUser = other;
  const { body } = await supertest(app).get('/api/teacher/test-prep/scores').expect(200);
  expect(body.students.map(s => s.name.split(' ')[0])).toEqual(['Zed']);
});

describe('assigning a practice test to a class', () => {
  const PracticeTestAssignment = require('../../models/practiceTestAssignment');
  beforeEach(() => PracticeTestAssignment.deleteMany({}));

  test('assign → the student sees it with their activities; status follows their attempts', async () => {
    const { body: made } = await supertest(app).post('/api/teacher/test-prep/assignments')
      .send({ testId: 'sat-math', classId: cls._id, dueDate: '2099-01-15', note: 'One sitting' }).expect(201);
    expect(made.assignment).toMatchObject({ label: 'SAT', className: 'Alg 1' });

    currentUser = kidA;
    let mine = (await supertest(app).get('/api/activities/mine').expect(200)).body;
    expect(mine.practiceTests).toEqual([expect.objectContaining({ testId: 'sat-math', url: '/sat-practice-test', status: 'not-started', note: 'One sitting' })]);

    await ActTestSession.create({ userId: kidA._id, testId: 'sat-math', status: 'in_progress', startedAt: new Date(), items: [], responses: [] });
    mine = (await supertest(app).get('/api/activities/mine').expect(200)).body;
    expect(mine.practiceTests[0].status).toBe('in-progress');

    await take(kidA._id, { testId: 'sat-math', scaled: 610, start: new Date() });
    mine = (await supertest(app).get('/api/activities/mine').expect(200)).body;
    expect(mine.practiceTests[0]).toMatchObject({ status: 'done', scaledScore: 610 });

    currentUser = kidB; // not in the class
    expect((await supertest(app).get('/api/activities/mine').expect(200)).body.practiceTests || []).toEqual([]);
  });

  test('teacher list: per-student status, attempts from BEFORE the assignment do not count', async () => {
    await supertest(app).post('/api/teacher/test-prep/assignments').send({ testId: 'act-math', classId: cls._id }).expect(201);
    const { body } = await supertest(app).get('/api/teacher/test-prep/assignments').expect(200);
    expect(body.assignments).toHaveLength(1);
    // Ada's two ACT attempts were days before the assignment.
    expect(body.assignments[0]).toMatchObject({ label: 'ACT', counts: { done: 0, 'in-progress': 0, 'not-started': 1 } });
    expect(body.assignments[0].students.map(s => s.name.split(' ')[0])).toEqual(['Ada']);
  });

  test('another teacher\'s class is a 404; re-assigning restarts the window; remove keeps attempts', async () => {
    const theirs = await EnrollmentCode.create({ code: `Y${n}${Date.now()}`.slice(0, 12), teacherId: other._id, className: 'Theirs' });
    await supertest(app).post('/api/teacher/test-prep/assignments').send({ testId: 'act-math', classId: theirs._id }).expect(404);
    await supertest(app).post('/api/teacher/test-prep/assignments').send({ testId: 'nope', classId: cls._id }).expect(400);
    const a1 = (await supertest(app).post('/api/teacher/test-prep/assignments').send({ testId: 'act-math', classId: cls._id }).expect(201)).body.assignment;
    const a2 = (await supertest(app).post('/api/teacher/test-prep/assignments').send({ testId: 'act-math', classId: cls._id, note: 'again' }).expect(201)).body.assignment;
    expect(String(a2._id)).toBe(String(a1._id));
    expect(new Date(a2.assignedAt) >= new Date(a1.assignedAt)).toBe(true);
    expect(await PracticeTestAssignment.countDocuments()).toBe(1);
    currentUser = other;
    await supertest(app).delete(`/api/teacher/test-prep/assignments/${a1._id}`).expect(404);
    currentUser = teacher;
    await supertest(app).delete(`/api/teacher/test-prep/assignments/${a1._id}`).expect(200);
    expect(await ActTestSession.countDocuments({ userId: kidA._id })).toBe(2);
  });
});
