/**
 * GET /api/student/my-classes — the My Class panel on chat.html (public/js/my-class.js):
 * every active class the student is in, its teacher's name, and the solo drill hub that
 * fits the class's course. Real database (mongodb-memory-server), like joinClassLink.
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const EnrollmentCode = require('../../models/enrollmentCode');

let mem, currentUser, app;
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = currentUser; req.isAuthenticated = () => !!currentUser; next(); });
  app.use('/api/student', require('../../routes/student').router);
}, 60000);
afterAll(async () => { await mongoose.disconnect(); if (mem) await mem.stop(); });

test('my classes: teacher, period, the matching drill hub; inactive classes and other students left out', async () => {
  const teacher = await User.create({ username: `t${uniq()}`, email: `t${uniq()}@e.com`, firstName: 'Jason', lastName: 'Nappier', role: 'teacher', roles: ['teacher'] });
  const student = await User.create({ username: `s${uniq()}`, email: `s${uniq()}@e.com`, firstName: 'Ava', lastName: 'N', role: 'student', roles: ['student'] });
  const other = await User.create({ username: `o${uniq()}`, email: `o${uniq()}@e.com`, firstName: 'Ben', lastName: 'O', role: 'student', roles: ['student'] });
  const geo = await EnrollmentCode.create({ code: `GEO${uniq()}`.slice(0, 12), teacherId: teacher._id, className: 'Honors Geometry', period: 'P3', mathCourse: 'Honors Geometry' });
  const alg = await EnrollmentCode.create({ code: `ALG${uniq()}`.slice(0, 12), teacherId: teacher._id, className: 'Algebra 1' });
  const calc = await EnrollmentCode.create({ code: `CAL${uniq()}`.slice(0, 12), teacherId: teacher._id, className: 'Pre-Calculus' });
  const gone = await EnrollmentCode.create({ code: `OLD${uniq()}`.slice(0, 12), teacherId: teacher._id, className: 'Last year', isActive: false });
  for (const c of [geo, alg, calc, gone]) await c.enrollStudent(student._id);
  const theirs = await EnrollmentCode.create({ code: `THR${uniq()}`.slice(0, 12), teacherId: teacher._id, className: 'Not mine' });
  await theirs.enrollStudent(other._id);

  currentUser = await User.findById(student._id);
  const { body } = await supertest(app).get('/api/student/my-classes').expect(200);
  expect(body.success).toBe(true);
  const byName = Object.fromEntries(body.classes.map((c) => [c.className, c]));
  expect(Object.keys(byName).sort()).toEqual(['Algebra 1', 'Honors Geometry', 'Pre-Calculus']);
  expect(byName['Honors Geometry']).toMatchObject({ teacherName: 'Jason Nappier', period: 'P3', drills: { hub: 'geometry', url: '/drill/geometry' } });
  expect(byName['Honors Geometry'].drills.games).toContain('Proof Reasons');
  expect(byName['Algebra 1'].drills).toMatchObject({ hub: 'algebra', url: '/drill/algebra' });
  expect(byName['Pre-Calculus'].drills).toEqual({ hub: null, url: '/drill' });
  expect(byName['Honors Geometry'].joinedAt).toBeTruthy();
});

test('a student in no class gets an empty list, not an error; a teacher is refused', async () => {
  const student = await User.create({ username: `n${uniq()}`, email: `n${uniq()}@e.com`, firstName: 'New', lastName: 'K', role: 'student', roles: ['student'] });
  currentUser = await User.findById(student._id);
  expect((await supertest(app).get('/api/student/my-classes').expect(200)).body).toEqual({ success: true, classes: [] });
  const teacher = await User.create({ username: `tt${uniq()}`, email: `tt${uniq()}@e.com`, firstName: 'T', lastName: 'T', role: 'teacher', roles: ['teacher'] });
  currentUser = await User.findById(teacher._id);
  expect((await supertest(app).get('/api/student/my-classes')).status).toBe(403);
});
