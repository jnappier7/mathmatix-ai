/**
 * Archiving and deleting a class (routes/teacher.js PATCH/DELETE /classes/:codeId, routes/admin.js
 * PATCH/DELETE /enrollment-codes/:codeId), against a real database.
 *
 * The contract: archiving closes the join code and takes the class off every live surface
 * (isActive false, archivedAt set) but deletes nothing — students keep their enrollment, and
 * Restore brings it all back; a class with students can be ARCHIVED but never DELETED by a
 * teacher (409 → archive instead); an empty class can be deleted; only the owner can touch it.
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const EnrollmentCode = require('../../models/enrollmentCode');

let mem, app, currentUser;
let teacher, other, admin, student;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = currentUser; req.isAuthenticated = () => true; next(); });
  app.use('/api/teacher', require('../../routes/teacher'));
  app.use('/api/admin', require('../../routes/admin'));
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

let n = 0;
const mk = (roles, extra = {}) => {
  n += 1;
  return User.create({ username: `c${n}${Date.now()}`, email: `c${n}${Date.now()}@e.com`, firstName: `F${n}`, lastName: 'L', role: roles[0], roles, ...extra });
};

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), EnrollmentCode.deleteMany({})]);
  teacher = await mk(['teacher']);
  other = await mk(['teacher']);
  admin = await mk(['admin']);
  student = await mk(['student']);
  currentUser = teacher;
});

const req = () => supertest(app);
const full = (n2) => EnrollmentCode.create({ code: `FULL${n2}${n}`, teacherId: teacher._id, className: 'Period 3', enrolledStudents: [{ studentId: student._id }] });
const empty = (n2) => EnrollmentCode.create({ code: `EMPTY${n2}${n}`, teacherId: teacher._id, className: 'Scratch' });

describe('teacher', () => {
  test('archive closes the code and hides the class, keeps the students, and restore brings it back', async () => {
    const cls = await full(1);
    const r = await req().patch(`/api/teacher/classes/${cls._id}`).send({ archived: true });
    expect(r.status).toBe(200);
    expect(r.body.class).toMatchObject({ isActive: false, studentCount: 1 });
    expect(r.body.class.archivedAt).toBeTruthy();
    const saved = await EnrollmentCode.findById(cls._id).lean();
    expect(saved.isActive).toBe(false);
    expect(saved.enrolledStudents).toHaveLength(1); // nothing deleted
    expect(saved.isValidForUse ? saved.isValidForUse().valid : false).toBe(false);
    // the class list still carries it (the dashboard folds it under "Archived classes")
    const list = await req().get('/api/teacher/classes');
    expect(list.body.classes.find((c) => c._id === String(cls._id))).toMatchObject({ isActive: false });
    expect(list.body.classes[0].archivedAt).toBeTruthy();
    // restore
    const back = await req().patch(`/api/teacher/classes/${cls._id}`).send({ archived: false });
    expect(back.body.class).toMatchObject({ isActive: true, archivedAt: null });
    expect((await EnrollmentCode.findById(cls._id)).isValidForUse().valid).toBe(true);
  });

  test('a class with students cannot be deleted — 409, archive instead; an empty one can', async () => {
    const cls = await full(2);
    const r = await req().delete(`/api/teacher/classes/${cls._id}`);
    expect(r.status).toBe(409);
    expect(r.body.students).toBe(1);
    expect(r.body.message).toMatch(/Archive it instead/);
    expect(await EnrollmentCode.findById(cls._id)).toBeTruthy();
    const e = await empty(2);
    expect((await req().delete(`/api/teacher/classes/${e._id}`)).status).toBe(200);
    expect(await EnrollmentCode.findById(e._id)).toBeNull();
  });

  test('only the owner: another teacher gets 404 on archive and delete', async () => {
    const cls = await full(3);
    currentUser = other;
    expect((await req().patch(`/api/teacher/classes/${cls._id}`).send({ archived: true })).status).toBe(404);
    expect((await req().delete(`/api/teacher/classes/${cls._id}`)).status).toBe(404);
    expect((await EnrollmentCode.findById(cls._id)).isActive).toBe(true);
  });

  test('rename rides the same PATCH; junk is ignored', async () => {
    const cls = await empty(4);
    const r = await req().patch(`/api/teacher/classes/${cls._id}`).send({ className: '  Algebra 2 · P5  ', period: 'P5', archived: 'yes' });
    expect(r.body.class).toMatchObject({ className: 'Algebra 2 · P5', period: 'P5', isActive: true, archivedAt: null });
  });
});

describe('admin', () => {
  beforeEach(() => { currentUser = admin; });

  test('archive / restore through the admin PATCH', async () => {
    const cls = await full(5);
    const r = await req().patch(`/api/admin/enrollment-codes/${cls._id}`).send({ archived: true });
    expect(r.status).toBe(200);
    expect(r.body.enrollmentCode).toMatchObject({ isActive: false });
    expect(r.body.enrollmentCode.archivedAt).toBeTruthy();
    const back = await req().patch(`/api/admin/enrollment-codes/${cls._id}`).send({ archived: false });
    expect(back.body.enrollmentCode).toMatchObject({ isActive: true, archivedAt: null });
  });

  test('delete refuses a class with students unless forced; an empty one goes', async () => {
    const cls = await full(6);
    expect((await req().delete(`/api/admin/enrollment-codes/${cls._id}`)).status).toBe(409);
    expect(await EnrollmentCode.findById(cls._id)).toBeTruthy();
    expect((await req().delete(`/api/admin/enrollment-codes/${cls._id}?force=1`)).status).toBe(200);
    expect(await EnrollmentCode.findById(cls._id)).toBeNull();
    expect(await User.findById(student._id)).toBeTruthy(); // the account stays
    const e = await empty(6);
    expect((await req().delete(`/api/admin/enrollment-codes/${e._id}`)).status).toBe(200);
  });
});
