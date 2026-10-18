/**
 * Students joining a teacher's class: the /join/:code link (every auth state)
 * and POST /api/student/join-class, against a real database.
 *
 * Before: a student who already had an account could only enter a code on
 * student-dashboard.html, which nothing in the chat links to.
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const EnrollmentCode = require('../../models/enrollmentCode');

let mem, currentUser;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = currentUser; req.isAuthenticated = () => !!currentUser; next(); });
app.use('/join', require('../../routes/joinLink'));

describe('/join/:code', () => {
  beforeEach(() => { currentUser = null; });

  test('signed out → sign-up with the code, onboarding skipped, code kept in a cookie', async () => {
    const res = await supertest(app).get('/join/alge-3f13b0').expect(302);
    expect(res.headers.location).toBe('/signup.html?code=ALGE-3F13B0&skipOnboarding=1');
    expect(res.headers['set-cookie'].join(';')).toMatch(/mm_join_code=ALGE-3F13B0/);
  });
  test('signed-in student → chat with the join dialog', async () => {
    currentUser = { _id: 's', role: 'student', roles: ['student'] };
    expect((await supertest(app).get('/join/ALGE-3F13B0').expect(302)).headers.location).toBe('/chat.html?join=ALGE-3F13B0');
  });
  test('a teacher testing their own link goes home, not into a student sign-up', async () => {
    currentUser = { _id: 't', role: 'teacher', roles: ['teacher'] };
    expect((await supertest(app).get('/join/ALGE-3F13B0').expect(302)).headers.location).toBe('/teacher-dashboard.html');
  });
  test('junk never reaches a cookie or a query string', async () => {
    const res = await supertest(app).get('/join/%3Cscript%3E').expect(302);
    expect(res.headers.location).toBe('/signup.html');
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('POST /api/student/join-class', () => {
  let japp, teacher, student, cls;
  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    japp = express();
    japp.use(express.json());
    japp.use((req, _res, next) => { req.user = currentUser; req.isAuthenticated = () => true; next(); });
    japp.use('/api/student', require('../../routes/student').router);
  }, 60000);
  afterAll(async () => { await mongoose.disconnect(); if (mem) await mem.stop(); });

  test('joining a class takes the student out of that teacher\'s archive', async () => {
    teacher = await User.create({ username: `jt${Date.now()}`, email: `jt${Date.now()}@e.com`, firstName: 'Sam', lastName: 'T', role: 'teacher', roles: ['teacher'] });
    student = await User.create({ username: `js${Date.now()}`, email: `js${Date.now()}@e.com`, firstName: 'Ava', lastName: 'N', role: 'student', roles: ['student'] });
    await User.updateOne({ _id: teacher._id }, { $set: { archivedStudents: [{ studentId: student._id, archivedAt: new Date(), schoolYear: '2025-26' }] } });
    cls = await EnrollmentCode.create({ code: `GEOM${Date.now()}`.slice(0, 12), teacherId: teacher._id, className: 'Geometry' });
    currentUser = await User.findById(student._id);
    const { body } = await supertest(japp).post('/api/student/join-class').send({ code: cls.code.toLowerCase() }).expect(200);
    expect(body).toMatchObject({ success: true, className: 'Geometry' });
    expect((await User.findById(teacher._id).lean()).archivedStudents).toHaveLength(0);
    expect((await EnrollmentCode.findById(cls._id).lean()).enrolledStudents.map(e => String(e.studentId))).toContain(String(student._id));
  });
});

describe('chat wiring', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../public/chat.html'), 'utf8');
  test('"Join a class" and "Assignments" live in the More menu (the legacy sidebar is hidden in the redesign)', () => {
    const menu = html.slice(html.indexOf('id="more-tools-menu"'));
    expect(menu).toMatch(/data-trigger="open-join-class-btn"/);
    expect(menu).toMatch(/id="more-assignments"/);
    expect(html).toMatch(/<button id="open-join-class-btn"/);
    expect(html).toMatch(/\/js\/join-class\.js\?v=/);
  });
  test('the wizard shares /join/ links', () => {
    expect(fs.readFileSync(path.join(__dirname, '../../public/js/teacher-school-year.js'), 'utf8')).toMatch(/origin \+ '\/join\/'/);
  });
});
