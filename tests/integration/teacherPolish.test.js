/**
 * QA polish pass against a real database: per-class AI settings end to end,
 * school-grade editing, and the analytics "no data is not risk" fix.
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const EnrollmentCode = require('../../models/enrollmentCode');
const { getEffectiveAISettings, calculatorAccessFor } = require('../../utils/effectiveAISettings');

let mem, app, currentUser;
let teacher, other, kidA, kidB, idle, stranger, clsA, clsB;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = currentUser; req.isAuthenticated = () => true; next(); });
  app.use('/api/teacher/roster', require('../../routes/teacherRoster'));
  app.use('/api/teacher', require('../../routes/teacher'));
  app.use('/api/analytics', require('../../routes/analytics'));
}, 60000);

afterAll(async () => { await mongoose.disconnect(); if (mem) await mem.stop(); });

let n = 0;
const mk = (roles, extra = {}) => { n += 1; return User.create({ username: `pl${n}${Date.now()}`, email: `pl${n}${Date.now()}@e.com`, firstName: extra.firstName || `F${n}`, lastName: 'L', role: roles[0], roles, ...extra }); };

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), EnrollmentCode.deleteMany({})]);
  teacher = await mk(['teacher'], { classAISettings: { calculatorAccess: 'skill-based', scaffoldingLevel: 3, vocabularyPreferences: { orderOfOperations: 'GEMS' } } });
  other = await mk(['teacher']);
  kidA = await mk(['student'], { firstName: 'Ada', teacherId: teacher._id, learningEngines: { bkt: { 'one-step-equations': { pLearned: 0.2 }, undefined: { pLearned: 0.9 } } } });
  kidB = await mk(['student'], { firstName: 'Ben', teacherId: teacher._id });
  idle = await mk(['student'], { firstName: 'Ida', teacherId: teacher._id });
  stranger = await mk(['student'], { firstName: 'Zed', teacherId: other._id });
  clsA = await EnrollmentCode.create({ code: `PA${n}${Date.now()}`.slice(0, 12), teacherId: teacher._id, className: 'Alg 1', enrolledStudents: [{ studentId: kidA._id, enrolledAt: new Date() }] });
  clsB = await EnrollmentCode.create({ code: `PB${n}${Date.now()}`.slice(0, 12), teacherId: teacher._id, className: 'Geometry', enrolledStudents: [{ studentId: kidB._id, enrolledAt: new Date() }] });
  currentUser = teacher;
});

describe('per-class AI settings', () => {
  test('a class override reaches that class\'s students — tutor AND calculator — and no one else', async () => {
    const { body: before } = await supertest(app).get(`/api/teacher/class-ai-settings?classId=${clsA._id}`).expect(200);
    expect(before).toMatchObject({ hasOverride: false, settings: { calculatorAccess: 'skill-based' } });

    const edited = { ...before.settings, calculatorAccess: 'never' };
    const { body: saved } = await supertest(app).put(`/api/teacher/class-ai-settings?classId=${clsA._id}`).send(edited).expect(200);
    expect(saved.override).toEqual({ calculatorAccess: 'never' });

    expect((await getEffectiveAISettings(await User.findById(kidA._id).lean())).settings).toMatchObject({ calculatorAccess: 'never', scaffoldingLevel: 3 });
    expect((await calculatorAccessFor(await User.findById(kidA._id).lean())).calculatorAccess).toBe('never');
    expect((await calculatorAccessFor(await User.findById(kidB._id).lean())).calculatorAccess).toBe('skill-based');

    // Later default changes still flow to keys the class didn't touch.
    await User.updateOne({ _id: teacher._id }, { $set: { 'classAISettings.scaffoldingLevel': 5 } });
    expect((await getEffectiveAISettings(await User.findById(kidA._id).lean())).settings.scaffoldingLevel).toBe(5);

    await supertest(app).delete(`/api/teacher/class-ai-settings/class/${clsA._id}`).expect(200);
    expect((await calculatorAccessFor(await User.findById(kidA._id).lean())).calculatorAccess).toBe('skill-based');
  });

  test('another teacher\'s class is a 404 for read, write and reset', async () => {
    const theirs = await EnrollmentCode.create({ code: `PX${n}${Date.now()}`.slice(0, 12), teacherId: other._id, className: 'Theirs' });
    await supertest(app).get(`/api/teacher/class-ai-settings?classId=${theirs._id}`).expect(404);
    await supertest(app).put(`/api/teacher/class-ai-settings?classId=${theirs._id}`).send({ calculatorAccess: 'never' }).expect(404);
    await supertest(app).delete(`/api/teacher/class-ai-settings/class/${theirs._id}`).expect(404);
  });
});

describe('school grade', () => {
  test('sets grade for my students only; validates the value', async () => {
    const { body } = await supertest(app).post('/api/teacher/roster/grade').send({ studentIds: [kidA._id, kidB._id, stranger._id], gradeLevel: '9' }).expect(200);
    expect(body).toMatchObject({ updated: 2, skipped: 1 });
    expect((await User.findById(kidA._id).lean()).gradeLevel).toBe('9');
    expect((await User.findById(stranger._id).lean()).gradeLevel).toBeUndefined();
    await supertest(app).post('/api/teacher/roster/grade').send({ studentIds: [kidA._id], gradeLevel: '13' }).expect(400);
  });
});

describe('analytics', () => {
  test('no learning data is not "at risk"; junk "undefined" skill keys are dropped', async () => {
    const { body: radar } = await supertest(app).get('/api/analytics/class/risk-radar').expect(200);
    expect(radar.students.map(s => s.name.split(' ')[0])).toEqual(['Ada']);
    expect(radar.noDataCount).toBe(2);
    const { body: heat } = await supertest(app).get('/api/analytics/class/knowledge-heatmap').expect(200);
    expect(heat.skillIds).toEqual(['one-step-equations']);
    // The catalog is mocked empty here; the resolver falls back to the shipped
    // seed files' real name before prettifying the id.
    expect(heat.skillNames['one-step-equations']).toBe('One-Step Equations');
    expect(heat.studentsWithData).toBe(1);
  });
});
