/**
 * Parent-set learning supports, against a real database.
 *
 * The properties worth guarding are all security or provenance ones:
 *   - a parent may only touch their own linked child
 *   - a parent may only write the nine known switches, never iepPlan, and never
 *     an arbitrary field smuggled through the request body
 *   - the school IEP is reported as locked so the UI cannot invite a parent to
 *     "change" something a teacher owns
 *   - a write is audited as a modification, not as a read
 */

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const EducationRecordAccessLog = require('../../models/educationRecordAccessLog');

let mem;
let app;
let parentId;
let childId;
let otherChildId;
let currentUserId;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());

  const router = require('../../routes/parent');
  app = express();
  app.use(express.json());
  app.use(async (req, _res, next) => {
    req.user = await User.findById(currentUserId);
    next();
  });
  app.use('/api/parent', router);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await EducationRecordAccessLog.deleteMany({});

  const child = await User.create({
    firstName: 'Maya', lastName: 'R',
    username: 'maya', email: 'maya@test.dev', passwordHash: 'x'.repeat(20),
    role: 'student', roles: ['student'],
    iepPlan: { accommodations: { extendedTime: true } }   // school owns extendedTime
  });
  childId = child._id;

  const other = await User.create({
    firstName: 'Sam', lastName: 'T',
    username: 'sam', email: 'sam@test.dev', passwordHash: 'x'.repeat(20),
    role: 'student', roles: ['student']
  });
  otherChildId = other._id;

  const parent = await User.create({
    firstName: 'Dana', lastName: 'R',
    username: 'dana', email: 'dana@test.dev', passwordHash: 'x'.repeat(20),
    role: 'parent', roles: ['parent'],
    children: [child._id]
  });
  parentId = parent._id;
  currentUserId = parent._id;
});

describe('GET /child/:childId/supports', () => {
  test('reports which switches the school already owns', async () => {
    const res = await supertest(app).get(`/api/parent/child/${childId}/supports`).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.lockedBySchool.extendedTime).toBe(true);
    expect(res.body.lockedBySchool.chunkedAssignments).toBe(false);
    expect(res.body.hasSchoolIep).toBe(true);
    expect(res.body.childName).toBe('Maya');
  });

  test('refuses a child the parent is not linked to', async () => {
    await supertest(app).get(`/api/parent/child/${otherChildId}/supports`).expect(403);
  });
});

describe('PUT /child/:childId/supports', () => {
  test('persists the switches a parent sets', async () => {
    await supertest(app)
      .put(`/api/parent/child/${childId}/supports`)
      .send({ chunkedAssignments: true, breaksAsNeeded: true })
      .expect(200);

    const child = await User.findById(childId).lean();
    expect(child.learningProfile.familySupports.chunkedAssignments).toBe(true);
    expect(child.learningProfile.familySupports.breaksAsNeeded).toBe(true);
    expect(child.learningProfile.familySupports.updatedBy.toString()).toBe(parentId.toString());
  });

  test('cannot reach iepPlan — the school record is not writable here', async () => {
    await supertest(app)
      .put(`/api/parent/child/${childId}/supports`)
      .send({
        iepPlan: { accommodations: { calculatorAllowed: true } },
        'iepPlan.accommodations.extendedTime': false,
        chunkedAssignments: true
      })
      .expect(200);

    const child = await User.findById(childId).lean();
    // The school's accommodation is untouched, and nothing new appeared on it.
    expect(child.iepPlan.accommodations.extendedTime).toBe(true);
    expect(child.iepPlan.accommodations.calculatorAllowed).toBe(false);
    // The legitimate switch still applied.
    expect(child.learningProfile.familySupports.chunkedAssignments).toBe(true);
  });

  test('ignores unknown keys rather than trusting the body', async () => {
    await supertest(app)
      .put(`/api/parent/child/${childId}/supports`)
      .send({ subscriptionTier: 'unlimited', role: 'admin', notAThing: true, breaksAsNeeded: true })
      .expect(200);

    const child = await User.findById(childId).lean();
    expect(child.subscriptionTier).not.toBe('unlimited');
    expect(child.role).toBe('student');
    expect(child.learningProfile.familySupports.notAThing).toBeUndefined();
    expect(child.learningProfile.familySupports.breaksAsNeeded).toBe(true);
  });

  test('coerces truthy junk to real booleans', async () => {
    await supertest(app)
      .put(`/api/parent/child/${childId}/supports`)
      .send({ calculatorAllowed: 'yes', audioReadAloud: 1 })
      .expect(200);

    const child = await User.findById(childId).lean();
    // Only a literal true enables a switch.
    expect(child.learningProfile.familySupports.calculatorAllowed).toBe(false);
    expect(child.learningProfile.familySupports.audioReadAloud).toBe(false);
  });

  test('caps the free-text note', async () => {
    await supertest(app)
      .put(`/api/parent/child/${childId}/supports`)
      .send({ note: 'x'.repeat(900) })
      .expect(200);

    const child = await User.findById(childId).lean();
    expect(child.learningProfile.familySupports.note).toHaveLength(500);
  });

  test('refuses a child the parent is not linked to', async () => {
    await supertest(app)
      .put(`/api/parent/child/${otherChildId}/supports`)
      .send({ breaksAsNeeded: true })
      .expect(403);

    const other = await User.findById(otherChildId).lean();
    expect(other.learningProfile?.familySupports?.breaksAsNeeded).not.toBe(true);
  });

  test('audits the write as a modification, not a read', async () => {
    await supertest(app)
      .put(`/api/parent/child/${childId}/supports`)
      .send({ breaksAsNeeded: true })
      .expect(200);

    // logRecordAccess writes on res 'finish', so let the event loop drain.
    await new Promise(r => setTimeout(r, 150));

    const entries = await EducationRecordAccessLog.find({ studentId: childId }).lean();
    const write = entries.find(e => e.accessType === 'modify');
    expect(write).toBeTruthy();
    expect(write.recordType).toBe('learning_profile');
    expect(write.legitimateInterest).toBe('parental_right_of_access');
    expect(write.accessedBy.toString()).toBe(parentId.toString());
  });
});
