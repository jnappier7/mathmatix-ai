/**
 * Drill usage report against a real database: the read joins the right records, the admin route
 * serves JSON and a CSV download, only admins reach it, and every student read is FERPA-logged.
 */
const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const EnrollmentCode = require('../../models/enrollmentCode');
const DrillResult = require('../../models/drillResult');
const FactFluency = require('../../models/factFluency');
const EducationRecordAccessLog = require('../../models/educationRecordAccessLog');
const { buildDrillUsageReport } = require('../../utils/drillUsageReport');

let mem;
let app;
let currentUser;
let admin, teacher, ada, ben, idle;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  const { isAdmin } = require('../../middleware/auth');
  const { logRecordAccess } = require('../../middleware/ferpaAccessLog');
  // The route as routes/admin.js mounts it, without the rest of that file's dependencies.
  const router = express.Router();
  const { toCsv } = require('../../utils/drillUsageReport');
  router.get('/reports/drill-usage', isAdmin,
    logRecordAccess('progress_data', 'administrative_function', { getStudentIds: (req) => req.accessedStudentIds, accessType: 'export' }),
    async (req, res) => {
      const report = await buildDrillUsageReport({ days: req.query.days });
      req.accessedStudentIds = report.students.map((s) => s.id);
      if (req.query.format === 'csv') {
        res.set('Content-Type', 'text/csv; charset=utf-8');
        res.set('Content-Disposition', 'attachment; filename="drill-usage.csv"');
        return res.send(toCsv(report.students));
      }
      res.json(report);
    });
  app = express();
  app.use((req, _res, next) => { req.user = currentUser; req.isAuthenticated = () => !!currentUser; next(); });
  app.use('/api/admin', router);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

let n = 0;
const mkUser = (roles, extra = {}) => {
  n += 1;
  return User.create({
    username: `du${n}${Date.now()}`, email: `du${n}${Date.now()}@e.com`,
    firstName: extra.firstName || `F${n}`, lastName: extra.lastName || `L${n}`,
    role: roles[0], roles,
  });
};
const daysAgo = (d) => new Date(Date.now() - d * 86400000);
const waitFor = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return v; await new Promise((r) => setTimeout(r, 50)); }
};

beforeEach(async () => {
  await Promise.all([DrillResult.deleteMany({}), FactFluency.deleteMany({}), EducationRecordAccessLog.deleteMany({}), EnrollmentCode.deleteMany({})]);
  admin = await mkUser(['admin']);
  teacher = await mkUser(['teacher'], { firstName: 'Jay', lastName: 'Nappier' });
  ada = await mkUser(['student'], { firstName: 'Ada', lastName: 'Lovelace' });
  ben = await mkUser(['student'], { firstName: 'Ben', lastName: 'Okri' });
  idle = await mkUser(['student']);
  await EnrollmentCode.create({ code: `C${n}${Date.now()}`, teacherId: teacher._id, className: 'Algebra 1', period: 'P3', enrolledStudents: [{ studentId: ada._id }, { studentId: idle._id }] });
  await DrillResult.create([
    { userId: ada._id, hub: 'algebra', drill: 'alg1m11', playbook: 'roots', seconds: 120, score: 50, right: 9, attempted: 10, playedAt: daysAgo(2) },
    { userId: ada._id, hub: 'algebra', drill: 'alg1m11', playbook: 'all', seconds: 120, score: 70, right: 12, attempted: 13, playedAt: daysAgo(1) },
    { userId: ada._id, hub: 'algebra', drill: 'facts', playbook: 'mul', seconds: 60, score: 20, right: 7, attempted: 8, playedAt: daysAgo(100) }, // outside a 30-day window
  ]);
  await FactFluency.create({ userId: ben._id, games: 2, lastGameAt: daysAgo(3), facts: {
    'mul:7,8': { label: '7 × 8', fam: 'mul', a: 7, b: 8, att: 2, right: 2, recent: [{ ok: true, ms: 1500, at: daysAgo(3) }, { ok: true, ms: 1700, at: daysAgo(3) }] },
  } });
});

describe('buildDrillUsageReport', () => {
  test('joins rounds, fluency, names and classes for the window; students with nothing are left out', async () => {
    const r = await buildDrillUsageReport({ days: 30 });
    expect(r.window.days).toBe(30);
    expect(r.students.map((s) => s.name).sort()).toEqual(['Ada Lovelace', 'Ben Okri']);
    const a = r.students.find((s) => s.name === 'Ada Lovelace');
    expect(a).toMatchObject({ soloRounds: 2, soloMinutes: 4, soloBest: 70, classes: 'Algebra 1 · P3', teachers: 'Jay Nappier', liveFactGames: 0 });
    expect(a.soloGames).toBe('Module 11 Review ×2');
    const b = r.students.find((s) => s.name === 'Ben Okri');
    expect(b).toMatchObject({ soloRounds: 0, liveFactGames: 2, factsTried: 1, factsFluent: 1, classes: '' });
    expect(r.totals).toMatchObject({ students: 2, soloPlayers: 1, liveFactPlayers: 1, soloRounds: 2 });
    expect(r.caveats.length).toBeGreaterThan(0);
  });

  test('a wider window brings the old round in', async () => {
    const r = await buildDrillUsageReport({ days: 365 });
    const a = r.students.find((s) => s.name === 'Ada Lovelace');
    expect(a.soloRounds).toBe(3);
    expect(a.soloGames).toBe('Module 11 Review ×2, Math Facts ×1');
  });
});

describe('GET /api/admin/reports/drill-usage', () => {
  test('admin only', async () => {
    currentUser = teacher;
    expect((await supertest(app).get('/api/admin/reports/drill-usage')).status).toBe(403);
    currentUser = ada;
    expect((await supertest(app).get('/api/admin/reports/drill-usage')).status).toBe(403);
  });

  test('JSON report, and every student read lands in the FERPA log as an export', async () => {
    currentUser = admin;
    const r = await supertest(app).get('/api/admin/reports/drill-usage?days=30');
    expect(r.status).toBe(200);
    expect(r.body.students).toHaveLength(2);
    // the log is written after the response, one row per student read
    const logs = await waitFor(async () => { const l = await EducationRecordAccessLog.find({ accessedBy: admin._id }).lean(); return l.length === 2 ? l : null; }) || [];
    expect(logs.map((l) => String(l.studentId)).sort()).toEqual([String(ada._id), String(ben._id)].sort());
    for (const l of logs) expect(l).toMatchObject({ recordType: 'progress_data', accessType: 'export', accessedByRole: 'admin' });
  });

  test('format=csv downloads a spreadsheet with one row per student', async () => {
    currentUser = admin;
    const r = await supertest(app).get('/api/admin/reports/drill-usage?format=csv');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.headers['content-disposition']).toMatch(/attachment/);
    const lines = r.text.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^Student,Username,Email/);
    expect(r.text).toContain('Ada Lovelace');
    expect(r.text).toContain('Ben Okri');
  });
});
