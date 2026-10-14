/**
 * The concurrent-course cap is PER AUDIENCE.
 *
 * THE BUG: POST /api/course-sessions/enroll counted every open CourseSession
 * against MAX_CONCURRENT_COURSES (2) before it even loaded the pathway. A parent
 * who also holds the student role — with two student courses running (sat-prep,
 * act-prep) — got "You can take up to 2 courses at a time" on every parent guide.
 *
 * The fix (utils/courseAudience.js): load the pathway first, then count only
 * open sessions of the same audience. Student courses keep their cap of 2;
 * parent guides are uncapped (three guides, one per grade band). Old session
 * docs have no stored `audience`, so it is resolved from courseId.
 */

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const CourseSession = require('../../models/courseSession');
const { courseAudience, sessionAudience, maxConcurrentFor } = require('../../utils/courseAudience');

let mem;
let app;
let currentUser;

async function makeUser(roles) {
  return User.create({
    username: `u${Date.now()}${Math.floor(Math.random() * 1e6)}`,
    email: `u${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`,
    firstName: 'Pat',
    lastName: 'Multi',
    role: roles[0],
    roles,
  });
}

// An OLD session doc: written before CourseSession had an `audience` field.
async function legacySession(userId, courseId) {
  const doc = await CourseSession.create({
    userId, courseId, courseName: courseId, pathwayId: `${courseId}-pathway`,
    modules: [], status: 'active',
  });
  await CourseSession.collection.updateOne({ _id: doc._id }, { $unset: { audience: '' } });
  return doc;
}

function enroll(courseId) {
  return supertest(app).post('/api/course-sessions/enroll').send({ courseId });
}

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());

  const router = require('../../routes/courseSession');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = currentUser;
    req.isAuthenticated = () => true;
    next();
  });
  app.use('/api/course-sessions', router);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

afterEach(async () => {
  await CourseSession.deleteMany({});
  await User.deleteMany({});
});

describe('courseAudience helper', () => {
  test('reads audience from the pathway file; unknown/unsafe ids are student', () => {
    expect(courseAudience('parent-math-k2')).toBe('parent');
    expect(courseAudience('sat-prep')).toBe('student');
    expect(courseAudience('no-such-course')).toBe('student');
    expect(courseAudience('../../package')).toBe('student');
    expect(courseAudience(undefined)).toBe('student');
  });

  test('stored audience wins; legacy docs fall back to the pathway', () => {
    expect(sessionAudience({ courseId: 'sat-prep', audience: 'parent' })).toBe('parent');
    expect(sessionAudience({ courseId: 'parent-math-35' })).toBe('parent');
    expect(sessionAudience({ courseId: 'act-prep' })).toBe('student');
  });

  test('student cap is 2, parent guides are uncapped', () => {
    expect(maxConcurrentFor('student')).toBe(2);
    expect(maxConcurrentFor('parent')).toBeNull();
  });
});

describe('POST /enroll — per-audience cap', () => {
  test('multi-role parent with 2 active student courses CAN enroll in a parent guide', async () => {
    const user = await makeUser(['student', 'parent']);
    currentUser = user.toObject();
    await legacySession(user._id, 'sat-prep');
    await legacySession(user._id, 'act-prep');

    const res = await enroll('parent-math-k2');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const created = await CourseSession.findOne({ userId: user._id, courseId: 'parent-math-k2' }).lean();
    expect(created.audience).toBe('parent');
  });

  test('a 3rd student course is still blocked, with the courses that count', async () => {
    const user = await makeUser(['student', 'parent']);
    currentUser = user.toObject();
    await legacySession(user._id, 'sat-prep');
    await legacySession(user._id, 'act-prep');
    // A parent guide does not count toward (or rescue) the student cap.
    await legacySession(user._id, 'parent-math-35');

    const res = await enroll('algebra-1');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COURSE_CAP_REACHED');
    expect(res.body.message).toMatch(/up to 2 courses/);
    expect(res.body.activeCourses.map(c => c.courseId).sort()).toEqual(['act-prep', 'sat-prep']);
    expect(res.body.activeCourses.every(c => typeof c.sessionId === 'string')).toBe(true);
  });

  test('parent guides are uncapped: a 3rd guide enrolls', async () => {
    const user = await makeUser(['parent']);
    currentUser = user.toObject();
    expect((await enroll('parent-math-k2')).status).toBe(200);
    expect((await enroll('parent-math-35')).status).toBe(200);
    const third = await enroll('parent-math-68');
    expect(third.status).toBe(200);
    expect(await CourseSession.countDocuments({ userId: user._id, audience: 'parent' })).toBe(3);
  });

  test('a student-only account is still refused a parent guide', async () => {
    const user = await makeUser(['student']);
    currentUser = user.toObject();
    const res = await enroll('parent-math-k2');
    expect(res.status).toBe(403);
  });

  test('an unknown or unsafe courseId 404s before any counting', async () => {
    const user = await makeUser(['student']);
    currentUser = user.toObject();
    expect((await enroll('no-such-course')).status).toBe(404);
    expect((await enroll('../../package')).status).toBe(404);
  });
});
