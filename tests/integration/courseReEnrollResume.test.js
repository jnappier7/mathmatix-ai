/**
 * Leaving a course and coming back picks it up where the student stopped.
 *
 * THE BUG (course QA, 2026-11-21): the leave dialog says "Your progress will be
 * saved and you can re-enroll later", but POST /:id/drop writes status
 * `dropped` and POST /enroll only ever resumed `paused`. So re-enrolling
 * created a brand-new CourseSession at 0% and the old one sat in the
 * collection, unreachable.
 *
 * The fix: /enroll resumes the most recent dropped session for that course —
 * after the concurrent-course cap, because a dropped course gave its seat up.
 */

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const CourseSession = require('../../models/courseSession');

let mem;
let app;
let currentUser;

const post = (url, body) => supertest(app).post(url).send(body || {});
const enroll = (courseId) => post('/api/course-sessions/enroll', { courseId });

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = currentUser; req.isAuthenticated = () => !!currentUser; next(); });
  app.use('/api/course-sessions', require('../../routes/courseSession'));
}, 60000);

afterAll(async () => { await mongoose.disconnect(); if (mem) await mem.stop(); });

beforeEach(async () => {
  const n = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  currentUser = await User.create({
    username: `s${n}`, email: `s${n}@example.com`, firstName: 'Ava', lastName: 'N',
    role: 'student', roles: ['student'],
  });
});

test('leave, then re-enroll: the SAME session comes back with its progress', async () => {
  const first = await enroll('algebra-1');
  expect(first.body.success).toBe(true);
  const sessionId = first.body.session._id;

  // The student finishes the first module before leaving.
  const doc = await CourseSession.findById(sessionId);
  doc.modules[0].status = 'completed';
  doc.modules[0].scaffoldProgress = 100;
  doc.modules[1].status = 'available';
  doc.currentModuleId = doc.modules[1].moduleId;
  doc.markModified('modules');
  await doc.save();

  const drop = await post(`/api/course-sessions/${sessionId}/drop`);
  expect(drop.body.success).toBe(true);
  expect((await CourseSession.findById(sessionId)).status).toBe('dropped');

  const again = await enroll('algebra-1');
  expect(again.body.success).toBe(true);
  expect(again.body.resumed).toBe(true);
  expect(String(again.body.session._id)).toBe(String(sessionId));
  expect(again.body.session.status).toBe('active');
  expect(again.body.session.currentModuleId).toBe(doc.modules[1].moduleId);
  expect(again.body.session.modules[0].status).toBe('completed');
  expect(again.body.session.overallProgress).toBeGreaterThan(0);
  expect(String(again.body.conversationId)).toBe(String(first.body.conversationId));

  // One session for the course, not two.
  expect(await CourseSession.countDocuments({ userId: currentUser._id, courseId: 'algebra-1' })).toBe(1);
  expect(String((await User.findById(currentUser._id)).activeCourseSessionId)).toBe(String(sessionId));
});

test('a dropped course gave up its seat: coming back still has to fit under the cap', async () => {
  const alg = await enroll('algebra-1');
  await post(`/api/course-sessions/${alg.body.session._id}/drop`);
  expect((await enroll('geometry')).body.success).toBe(true);
  expect((await enroll('algebra-2')).body.success).toBe(true);

  const back = await enroll('algebra-1');
  expect(back.status).toBe(400);
  expect(back.body.code).toBe('COURSE_CAP_REACHED');
  expect((await CourseSession.findById(alg.body.session._id)).status).toBe('dropped');
});

test('never enrolled before: a fresh session, not a resume', async () => {
  const res = await enroll('geometry');
  expect(res.body.success).toBe(true);
  expect(res.body.resumed).toBeUndefined();
  expect(res.body.session.overallProgress).toBe(0);
});
