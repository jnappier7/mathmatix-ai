/**
 * Class Activities (routes/activities.js), against a real database.
 *
 * What's worth guarding:
 *   - Scope: a teacher can only assign to / read results for their own class;
 *     only students enrolled in an assigned class can load the frame or post.
 *   - The sandbox: the frame is served with a CSP sandbox + connect-src 'none'
 *     and same-origin framing, replacing the page CSP.
 *   - The manifest is the contract: unknown items/levels are rejected, and a
 *     message can't claim a solve its own counts contradict.
 *   - The report: solved levels per student, traps counted once per student,
 *     and events from before the assignment excluded.
 */

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const EnrollmentCode = require('../../models/enrollmentCode');
const ActivityAssignment = require('../../models/activityAssignment');
const ActivityAttempt = require('../../models/activityAttempt');

let mem;
let app;
let currentUser;
let teacher, otherTeacher, student, outsider, cls, otherCls;

const SLUG = 'proof-scramble';

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());

  const router = require('../../routes/activities');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = currentUser;
    req.isAuthenticated = () => true;
    next();
  });
  app.use('/api/activities', router);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

let n = 0;
const mkUser = (roles, extra = {}) => {
  n += 1;
  return User.create({
    username: `u${n}${Date.now()}`, email: `u${n}${Date.now()}@e.com`,
    firstName: extra.firstName || `F${n}`, lastName: extra.lastName || `L${n}`,
    role: roles[0], roles
  });
};

beforeEach(async () => {
  teacher = await mkUser(['teacher']);
  otherTeacher = await mkUser(['teacher']);
  student = await mkUser(['student'], { firstName: 'Ada', lastName: 'Lovelace' });
  outsider = await mkUser(['student']);
  cls = await EnrollmentCode.create({
    code: `C${n}${Date.now()}`.slice(0, 12), teacherId: teacher._id, className: 'Honors Geo P3',
    enrolledStudents: [{ studentId: student._id }]
  });
  otherCls = await EnrollmentCode.create({
    code: `D${n}${Date.now()}`.slice(0, 12), teacherId: otherTeacher._id, className: 'Other',
    enrolledStudents: [{ studentId: outsider._id }]
  });
});

afterEach(async () => {
  await Promise.all([
    User.deleteMany({}), EnrollmentCode.deleteMany({}),
    ActivityAssignment.deleteMany({}), ActivityAttempt.deleteMany({})
  ]);
});

const as = (u) => { currentUser = u; return supertest(app); };
const assign = (body = {}) => as(teacher).post('/api/activities/assignments')
  .send({ activitySlug: SLUG, classId: String(cls._id), ...body });
const check = (u, body) => as(u).post(`/api/activities/${SLUG}/events`).send({
  type: 'check', item: 'A', level: 1, correct: 4, total: 4, solved: true, checks: 2, durationMs: 60000, misconceptions: [], ...body
});

describe('assigning', () => {
  test('teacher sees the catalog and assigns to their own class', async () => {
    const cat = await as(teacher).get('/api/activities/catalog');
    expect(cat.status).toBe(200);
    expect(cat.body.activities.map((a) => a.slug)).toContain(SLUG);
    expect(cat.body.activities[0].file).toBeUndefined();

    const res = await assign({ dueDate: '2026-10-01', note: 'Rung 1 on all five' });
    expect(res.status).toBe(201);
    const list = await as(teacher).get('/api/activities/assignments');
    expect(list.body.assignments).toHaveLength(1);
    expect(list.body.assignments[0]).toMatchObject({ className: 'Honors Geo P3', studentCount: 1, activityTitle: 'Proof Scramble' });
  });

  test("cannot assign to another teacher's class, an unknown activity, or twice", async () => {
    expect((await assign({ classId: String(otherCls._id) })).status).toBe(404);
    expect((await assign({ activitySlug: 'nope' })).status).toBe(400);
    expect((await assign()).status).toBe(201);
    expect((await assign()).status).toBe(409);
  });

  test('students cannot use teacher endpoints', async () => {
    expect((await as(student).get('/api/activities/catalog')).status).toBe(403);
    expect((await as(student).post('/api/activities/assignments').send({ activitySlug: SLUG, classId: String(cls._id) })).status).toBe(403);
  });
});

describe('the student side', () => {
  beforeEach(async () => { await assign(); });

  test('an enrolled student sees the assignment; an outsider sees nothing', async () => {
    const mine = await as(student).get('/api/activities/mine');
    expect(mine.body.assignments).toHaveLength(1);
    expect(mine.body.assignments[0]).toMatchObject({ className: 'Honors Geo P3', itemsSolved: 0, itemsTotal: 5 });
    expect((await as(outsider).get('/api/activities/mine')).body.assignments).toHaveLength(0);
  });

  test('the frame is served into a sandbox and logs one open', async () => {
    const res = await as(student).get(`/api/activities/${SLUG}/frame`);
    expect(res.status).toBe(200);
    const csp = res.headers['content-security-policy'];
    expect(csp).toMatch(/^sandbox allow-scripts;/);
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain('allow-same-origin');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.text).toContain('<title>Proof Scramble</title>');
    expect(res.text).toContain('mathmatix-activity');

    await as(student).get(`/api/activities/${SLUG}/frame`);
    expect(await ActivityAttempt.countDocuments({ userId: student._id, kind: 'open' })).toBe(1);
  });

  test('an unassigned student is refused the frame and cannot post', async () => {
    expect((await as(outsider).get(`/api/activities/${SLUG}/frame`)).status).toBe(403);
    expect((await check(outsider)).status).toBe(403);
    expect(await ActivityAttempt.countDocuments({})).toBe(0);
  });

  test('a teacher can preview, and nothing is stored', async () => {
    expect((await as(otherTeacher).get(`/api/activities/${SLUG}/frame`)).status).toBe(200);
    const res = await check(otherTeacher);
    expect(res.body).toEqual({ success: true, stored: false });
    expect(await ActivityAttempt.countDocuments({})).toBe(0);
  });

  test('events are validated against the manifest', async () => {
    expect((await check(student, { item: 'Z' })).status).toBe(400);
    expect((await check(student, { level: 9 })).status).toBe(400);
    expect((await check(student, { type: 'solve' })).status).toBe(400);

    // A solve claim the counts contradict is stored as not solved.
    expect((await check(student, { correct: 3, total: 4, solved: true })).status).toBe(200);
    const [e] = await ActivityAttempt.find({ kind: 'check' }).lean();
    expect(e).toMatchObject({ itemKey: 'A', level: 1, correct: 3, total: 4, solved: false });
  });

  test('progress restores solved levels', async () => {
    await check(student, { level: 2 });
    await check(student, { level: 1 });
    await check(student, { item: 'B', correct: 1, total: 6, solved: false });
    const res = await as(student).get(`/api/activities/${SLUG}/progress`);
    expect(res.body.progress).toEqual({ A: [1, 2] });
    expect((await as(student).get('/api/activities/mine')).body.assignments[0].itemsSolved).toBe(1);
  });
});

describe('results', () => {
  let assignmentId;
  beforeEach(async () => {
    // Work from before the assignment existed must not show up in it.
    await ActivityAttempt.create({
      userId: student._id, activitySlug: SLUG, kind: 'check', itemKey: 'E', level: 1,
      correct: 8, total: 8, solved: true, checks: 1, createdAt: new Date(Date.now() - 86400000)
    });
    assignmentId = (await assign()).body.assignment._id;
  });

  test('roster × items with solved levels and a per-student trap tally', async () => {
    const trap = { key: 'D.S1', label: '∠1 and ∠2 are supplementary' };
    await check(student, { item: 'D', correct: 2, total: 4, solved: false, checks: 1, misconceptions: [trap] });
    await check(student, { item: 'D', correct: 3, total: 4, solved: false, checks: 2, misconceptions: [trap] });
    await check(student, { item: 'D', correct: 4, total: 4, solved: true, checks: 3, durationMs: 240000 });

    const res = await as(teacher).get(`/api/activities/assignments/${assignmentId}/results`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ students: 1, opened: 1, finishedAll: 0 });

    const row = res.body.students[0];
    expect(row.name).toBe('Ada Lovelace');
    expect(row.items.E).toBeUndefined(); // pre-assignment work excluded
    expect(row.items.D).toMatchObject({ checks: 3, solvedLevels: [1], firstSolve: { level: 1, checks: 3, durationMs: 240000 } });

    const d = res.body.items.find((i) => i.key === 'D');
    expect(d.solvedBy).toBe(1);
    expect(d.traps).toEqual([{ key: 'D.S1', label: trap.label, students: 1, times: 2 }]);
  });

  test("another teacher cannot read the results", async () => {
    expect((await as(otherTeacher).get(`/api/activities/assignments/${assignmentId}/results`)).status).toBe(404);
  });

  test('removing the assignment keeps the students\' work', async () => {
    await check(student);
    expect((await as(otherTeacher).delete(`/api/activities/assignments/${assignmentId}`)).status).toBe(404);
    expect((await as(teacher).delete(`/api/activities/assignments/${assignmentId}`)).status).toBe(200);
    expect(await ActivityAttempt.countDocuments({ userId: student._id, kind: 'check' })).toBe(2);
    expect((await as(student).get('/api/activities/mine')).body.assignments).toHaveLength(0);
  });
});
