/**
 * Teacher resources pushed to the tutor (utils/teacherAssignments.js,
 * routes/teacherResources.js /assign + /start), against a real database.
 *
 * The contract:
 *   - a pushed resource reaches exactly the students who can SEE it (the
 *     model's one visibility rule) and only inside its window;
 *   - the greeting offers the newest unopened one, throttled;
 *   - a start is recorded once, only by a student who can see it;
 *   - the teacher's list says "N of M started" on the current roster.
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const EnrollmentCode = require('../../models/enrollmentCode');
const TeacherResource = require('../../models/teacherResource');
const { getActiveAssignments, pickAssignmentOffer, renderTeacherResourceSection } = require('../../utils/teacherAssignments');

const DAY = 24 * 60 * 60 * 1000;
let mem, app, currentUser;
let teacher, inClass, otherClassKid, directKid, stranger, clsA, clsB;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = currentUser; req.isAuthenticated = () => true; next(); });
  app.use('/api/teacher-resources', require('../../routes/teacherResources'));
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

let n = 0;
const mk = (roles, extra = {}) => {
  n += 1;
  return User.create({ username: `p${n}${Date.now()}`, email: `p${n}${Date.now()}@e.com`, firstName: extra.firstName || `F${n}`, lastName: 'Rivera', role: roles[0], roles, ...extra });
};
const mkResource = (extra = {}) => TeacherResource.create({
  teacherId: teacher._id, displayName: extra.displayName || 'Two-Step Practice', originalFilename: 'x.png', storedFilename: 'x.png',
  fileType: 'png', mimeType: 'image/png', fileSize: 1, category: 'practice', isPublished: true, extractedText: '1) 3x - 7 = 11', ...extra,
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), EnrollmentCode.deleteMany({}), TeacherResource.deleteMany({})]);
  teacher = await mk(['teacher'], { firstName: 'Sam' });
  inClass = await mk(['student'], { firstName: 'InA', teacherId: teacher._id });
  otherClassKid = await mk(['student'], { firstName: 'InB', teacherId: teacher._id });
  directKid = await mk(['student'], { firstName: 'Direct', teacherId: teacher._id });
  stranger = await mk(['student'], { firstName: 'Stranger' });
  clsA = await EnrollmentCode.create({ code: `A${n}${Date.now()}`.slice(0, 12), teacherId: teacher._id, className: 'Alg A', enrolledStudents: [{ studentId: inClass._id }] });
  clsB = await EnrollmentCode.create({ code: `B${n}${Date.now()}`.slice(0, 12), teacherId: teacher._id, className: 'Alg B', enrolledStudents: [{ studentId: otherClassKid._id }] });
  currentUser = teacher;
});

const push = (id, body) => supertest(app).patch(`/api/teacher-resources/${id}/assign`).send(body);

test('push → offered to exactly the students who can see it', async () => {
  const r = await mkResource({ sharedWithClassIds: [clsA._id] });
  const { body } = await push(r._id, { active: true, note: 'Start with #1' }).expect(200);
  expect(body.audienceCount).toBe(1);
  expect((await getActiveAssignments(await User.findById(inClass._id))).map(a => a.displayName)).toEqual(['Two-Step Practice']);
  expect(await getActiveAssignments(await User.findById(otherClassKid._id))).toEqual([]);
  expect(await getActiveAssignments(await User.findById(stranger._id))).toEqual([]);
  const [a] = await getActiveAssignments(await User.findById(inClass._id));
  expect(a).toMatchObject({ note: 'Start with #1', teacherName: 'Sam Rivera', category: 'practice', started: false });
});

test('shared with everyone → every linked student, including direct links', async () => {
  const r = await mkResource();
  await push(r._id, { active: true }).expect(200);
  for (const s of [inClass, otherClassKid, directKid]) {
    expect(await getActiveAssignments(await User.findById(s._id))).toHaveLength(1);
  }
});

test('only inside the window; stop removes it', async () => {
  const r = await mkResource();
  await push(r._id, { active: true, startsAt: new Date(Date.now() + DAY), endsAt: new Date(Date.now() + 3 * DAY) }).expect(200);
  expect(await getActiveAssignments(await User.findById(directKid._id))).toEqual([]);
  expect(await getActiveAssignments(await User.findById(directKid._id), { now: new Date(Date.now() + 2 * DAY) })).toHaveLength(1);
  await push(r._id, { active: false }).expect(200);
  expect(await getActiveAssignments(await User.findById(directKid._id), { now: new Date(Date.now() + 2 * DAY) })).toEqual([]);
});

test('bad input is refused; another teacher cannot push my resource', async () => {
  const r = await mkResource();
  await push(r._id, { active: true, endsAt: new Date(Date.now() - DAY) }).expect(400);
  await push(r._id, { active: true, endsAt: new Date(Date.now() + 400 * DAY) }).expect(400);
  currentUser = await mk(['teacher']);
  await push(r._id, { active: true }).expect(404);
});

test('a start is recorded once, only by a student who can see it; teacher sees N of M', async () => {
  const r = await mkResource({ sharedWithClassIds: [clsA._id] });
  await push(r._id, { active: true }).expect(200);
  currentUser = otherClassKid;
  await supertest(app).post(`/api/teacher-resources/${r._id}/start`).expect(404);
  currentUser = inClass;
  await supertest(app).post(`/api/teacher-resources/${r._id}/start`).expect(200);
  await supertest(app).post(`/api/teacher-resources/${r._id}/start`).expect(200);
  expect((await TeacherResource.findById(r._id).lean()).tutorAssignment.starts).toHaveLength(1);
  expect((await getActiveAssignments(await User.findById(inClass._id)))[0].started).toBe(true);
  currentUser = teacher;
  const { body } = await supertest(app).get('/api/teacher-resources/list').expect(200);
  expect(body.resources[0].tutorAssignment).toMatchObject({ active: true, startedCount: 1, audienceCount: 1 });
});

test('greeting offer: newest unopened, throttled to once per ~20h', async () => {
  await push((await mkResource({ displayName: 'Older' }))._id, { active: true }).expect(200);
  await push((await mkResource({ displayName: 'Newer' }))._id, { active: true }).expect(200);
  const user = await User.findById(directKid._id);
  const list = await getActiveAssignments(user);
  expect(pickAssignmentOffer(list, user).displayName).toBe('Newer');
  expect(pickAssignmentOffer(list, { teacherAssignmentOfferedAt: new Date() })).toBeNull();
  expect(pickAssignmentOffer(list.map(a => ({ ...a, started: true })), user)).toBeNull();
});

test('the prompt section carries the note and category rules', async () => {
  const r = await mkResource({ category: 'quiz', displayName: 'Quiz 3' });
  await push(r._id, { active: true, note: 'They struggle with negatives' }).expect(200);
  const section = renderTeacherResourceSection(null, await getActiveAssignments(await User.findById(directKid._id)));
  expect(section).toMatch(/"Quiz 3" from Sam Rivera/);
  expect(section).toMatch(/They struggle with negatives/);
  expect(section).toMatch(/Do NOT solve, check, or hint at its actual items/);
});
