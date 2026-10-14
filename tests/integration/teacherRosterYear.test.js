/**
 * School-year rollover (routes/teacherRoster.js + scoped getStudentIdsForTeacher),
 * against a real database.
 *
 * The contract a teacher relies on:
 *   - archiving takes last year's students out of every CURRENT aggregate
 *     (roster, announcements) but deletes nothing: history stays readable
 *     (scope=archived / access checks), restore is one call;
 *   - a student who signs in after being archived comes back on their own;
 *   - you can only archive your own current students;
 *   - classes carry a school year; "all my students" includes students who
 *     joined by class code (it used to 403 them).
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const EnrollmentCode = require('../../models/enrollmentCode');
const Conversation = require('../../models/conversation');
const { getStudentIdsForTeacher } = require('../../services/userService');
const { currentSchoolYear } = require('../../utils/schoolYear');

const DAY = 24 * 60 * 60 * 1000;
let mem, app, currentUser;
let teacher, otherTeacher, fresh, oldA, oldB, coded, stranger;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = currentUser; req.isAuthenticated = () => true; next(); });
  app.use('/api/teacher/roster', require('../../routes/teacherRoster'));
  app.use('/api/teacher', require('../../routes/teacher'));
  app.use('/api/announcements', require('../../routes/announcements'));
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

let n = 0;
const mk = (roles, extra = {}) => {
  n += 1;
  return User.create({ username: `r${n}${Date.now()}`, email: `r${n}${Date.now()}@e.com`, firstName: extra.firstName || `F${n}`, lastName: 'L', role: roles[0], roles, ...extra });
};
const old = new Date(Date.now() - 400 * DAY);

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), EnrollmentCode.deleteMany({}), Conversation.deleteMany({})]);
  teacher = await mk(['teacher']);
  otherTeacher = await mk(['teacher']);
  fresh = await mk(['student'], { firstName: 'Fresh', teacherId: teacher._id, lastLogin: new Date(Date.now() - DAY) });
  oldA = await mk(['student'], { firstName: 'OldA', teacherId: teacher._id, lastLogin: new Date(Date.now() - 300 * DAY) });
  oldB = await mk(['student'], { firstName: 'OldB', teacherId: teacher._id });
  coded = await mk(['student'], { firstName: 'Coded', lastLogin: new Date(Date.now() - 2 * DAY) });
  stranger = await mk(['student'], { firstName: 'Stranger', teacherId: otherTeacher._id, lastLogin: new Date(Date.now() - 300 * DAY) });
  await User.collection.updateMany({ _id: { $in: [oldA._id, oldB._id, stranger._id] } }, { $set: { createdAt: old } });
  await EnrollmentCode.create({ code: `OLD${n}`, teacherId: teacher._id, className: 'Alg 1 (last year)', createdAt: old, enrolledStudents: [{ studentId: coded._id }] });
  currentUser = teacher;
});

const names = rows => rows.map(r => r.firstName).sort();

test('year summary: candidates are last year\'s inactive students only, and it prompts', async () => {
  const { body } = await supertest(app).get('/api/teacher/roster/year').expect(200);
  expect(body.currentYear).toBe(currentSchoolYear());
  expect(body.counts).toMatchObject({ current: 4, archived: 0, lastYearCandidates: 2 });
  expect(body.hasCurrentYearClass).toBe(false);
  expect(body.classes[0].schoolYear).not.toBe(body.currentYear);
});

test('archive → gone from current aggregates, visible under archived, still accessible', async () => {
  const { body: cand } = await supertest(app).get('/api/teacher/roster/archive-candidates').expect(200);
  expect(names(cand.students.map(s => ({ firstName: s.name.split(' ')[0] })))).toEqual(['OldA', 'OldB']);

  const { body: arch } = await supertest(app).post('/api/teacher/roster/archive')
    .send({ studentIds: cand.students.map(s => s._id) }).expect(200);
  expect(arch.archived).toBe(2);

  const { body: current } = await supertest(app).get('/api/teacher/students?fields=roster').expect(200);
  expect(names(current)).toEqual(['Coded', 'Fresh']);
  const { body: archived } = await supertest(app).get('/api/teacher/students?fields=roster&scope=archived').expect(200);
  expect(names(archived)).toEqual(['OldA', 'OldB']);

  // Access (scope 'all') is unchanged: the teacher can still open their history.
  const all = await getStudentIdsForTeacher(teacher._id);
  expect(all).toEqual(expect.arrayContaining([String(oldA._id), String(oldB._id)]));
});

test('restore puts them back', async () => {
  await supertest(app).post('/api/teacher/roster/archive').send({ studentIds: [oldA._id, oldB._id] }).expect(200);
  const { body } = await supertest(app).post('/api/teacher/roster/restore').send({ studentIds: [oldA._id] }).expect(200);
  expect(body.restored).toBe(1);
  const ids = await getStudentIdsForTeacher(teacher._id, { scope: 'current' });
  expect(ids).toContain(String(oldA._id));
  expect(ids).not.toContain(String(oldB._id));
});

test('a student who signs in after being archived comes back on their own', async () => {
  await supertest(app).post('/api/teacher/roster/archive').send({ studentIds: [oldA._id] }).expect(200);
  expect(await getStudentIdsForTeacher(teacher._id, { scope: 'current' })).not.toContain(String(oldA._id));
  await User.updateOne({ _id: oldA._id }, { $set: { lastLogin: new Date(Date.now() + 1000) } });
  expect(await getStudentIdsForTeacher(teacher._id, { scope: 'current' })).toContain(String(oldA._id));
});

test('cannot archive another teacher\'s student', async () => {
  const res = await supertest(app).post('/api/teacher/roster/archive').send({ studentIds: [stranger._id] }).expect(404);
  expect(res.body.success).toBe(false);
  const t = await User.findById(teacher._id).lean();
  expect(t.archivedStudents || []).toHaveLength(0);
});

test('classes carry a school year (default: this one) and a period', async () => {
  const { body } = await supertest(app).post('/api/teacher/classes').send({ className: 'Algebra 1', period: 'P3' }).expect(200);
  expect(body.class).toMatchObject({ schoolYear: currentSchoolYear(), period: 'P3' });
  const { body: year } = await supertest(app).get('/api/teacher/roster/year').expect(200);
  expect(year.hasCurrentYearClass).toBe(true);
  expect(year.promptNewYear).toBe(false);
});

describe('announcements reach the right students', () => {
  test('students who joined by class code can be messaged individually (used to 403)', async () => {
    const res = await supertest(app).post('/api/announcements/teacher/send')
      .send({ targetType: 'individual', recipientIds: [String(coded._id)], title: 'Hi', body: 'Welcome' });
    expect(res.status).toBe(201);
  });
  test('"all my current students" includes class-code students and excludes archived ones', async () => {
    await supertest(app).post('/api/teacher/roster/archive').send({ studentIds: [oldA._id, oldB._id] }).expect(200);
    const res = await supertest(app).post('/api/announcements/teacher/send')
      .send({ targetType: 'class', title: 'Whole class', body: 'This year only' });
    expect(res.status).toBe(201);
    const Announcement = require('../../models/announcement');
    const a = await Announcement.findOne({ title: 'Whole class' }).lean();
    expect(a.recipientIds.map(String).sort()).toEqual([String(fresh._id), String(coded._id)].sort());
  });
});
