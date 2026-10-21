/**
 * Math-facts fluency saved to student accounts — against a real database.
 *
 * What's worth guarding here (the pure logic is tests/unit/liveDrillFluency.test.js):
 *   - the dotted-path upsert really does what fluency.saveGame means on MongoDB: a first game creates
 *     the record, a second adds to it, and `recent` keeps only the last few tries per fact;
 *   - the game-over hook routes/liveDrill.js registers saves a signed-in student, not a guest;
 *   - scope: a teacher reads fluency only for their own class, and only for students in it;
 *   - every read lands in the FERPA access log.
 */
const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const EnrollmentCode = require('../../models/enrollmentCode');
const FactFluency = require('../../models/factFluency');
const EducationRecordAccessLog = require('../../models/educationRecordAccessLog');
const G = require('../../utils/liveDrill/games');
const fluency = require('../../utils/liveDrill/fluency');

let mem;
let app;
let currentUser;
let teacher, otherTeacher, student, outsider, cls, otherCls;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  await FactFluency.init();
  const { hostRouter, mineRouter } = require('../../routes/liveDrill'); // registers the save hook
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = currentUser; req.isAuthenticated = () => true; next(); });
  app.use('/api/live-drill/host', hostRouter);
  app.use('/api/live-drill/mine', mineRouter);
}, 60000);

afterAll(async () => {
  G._reset();
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

let n = 0;
const mkUser = (roles, extra = {}) => {
  n += 1;
  return User.create({
    username: `ff${n}${Date.now()}`, email: `ff${n}${Date.now()}@e.com`,
    firstName: extra.firstName || `F${n}`, lastName: extra.lastName || `L${n}`,
    role: roles[0], roles,
  });
};

beforeEach(async () => {
  teacher = await mkUser(['teacher']);
  otherTeacher = await mkUser(['teacher']);
  student = await mkUser(['student'], { firstName: 'Ada', lastName: 'Lovelace' });
  outsider = await mkUser(['student']);
  cls = await EnrollmentCode.create({
    code: `F${n}${Date.now()}`.slice(0, 12), teacherId: teacher._id, className: 'Algebra 1', period: 'P3',
    enrolledStudents: [{ studentId: student._id }],
  });
  otherCls = await EnrollmentCode.create({
    code: `G${n}${Date.now()}`.slice(0, 12), teacherId: otherTeacher._id, className: 'Other',
    enrolledStudents: [{ studentId: outsider._id }],
  });
});

afterEach(async () => {
  G._reset();
  await Promise.all([User.deleteMany({}), EnrollmentCode.deleteMany({}), FactFluency.deleteMany({}), EducationRecordAccessLog.deleteMany({})]);
});

const as = (u) => { currentUser = u; return supertest(app); };
const waitFor = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return v; await new Promise((r) => setTimeout(r, 50)); }
};

/** Play a Math Facts drive with real answers: `plan` is a list of [rightOrWrong, ms] per answer. */
function playFacts(players, plan) {
  const g = G.createGame({ hostId: String(teacher._id), drill: 'facts', playbook: 'mul', mode: 'drive' });
  const seats = players.map(([name, userId]) => G.join(g, name, { userId }).player);
  G.start(g);
  for (const p of seats) {
    for (const [ok, ms] of plan) {
      const { n: k } = G.currentPlay(g, p);
      p.issuedAt = Date.now() - ms;
      const pl = G.playAt(g, k);
      G.answer(g, p, k, ok ? pl.answer : String(Number(pl.answer) + 1));
    }
  }
  return { g, seats };
}

describe('saving', () => {
  test('a finished game saves a signed-in student (not a guest), and the next game adds to it', async () => {
    const { g } = playFacts([['Ada L.', student._id], ['Guest', null]], [[true, 1000], [true, 1200], [false, 900]]);
    G.endGame(g); // the hook saves; nothing awaited here, as in production
    const doc = await waitFor(() => FactFluency.findOne({ userId: student._id }).lean());
    expect(doc).toBeTruthy();
    expect(doc.games).toBe(1);
    expect(Object.values(doc.facts).reduce((t, r) => t + r.att, 0)).toBe(3);
    expect(await FactFluency.countDocuments()).toBe(1); // the guest has no account to save to

    G.rematch(g); G.start(g);
    const ada = [...g.players.values()].find((p) => p.name === 'Ada L.');
    for (let i = 0; i < 3; i++) {
      const { n: k } = G.currentPlay(g, ada); ada.issuedAt = Date.now() - 1000;
      G.answer(g, ada, k, G.playAt(g, k).answer);
    }
    G.endGame(g);
    const two = await waitFor(async () => { const d = await FactFluency.findOne({ userId: student._id }).lean(); return d && d.games === 2 && d; });
    expect(two.games).toBe(2);
    expect(Object.values(two.facts).reduce((t, r) => t + r.att, 0)).toBe(6);
  });

  test('the dotted upsert keeps only the last few tries of a fact, on MongoDB itself', async () => {
    const p = { userId: student._id, kicked: false, facts: new Map([['mul:7,8', { label: '7 × 8', fam: 'mul', a: 7, b: 8 }]]),
      factLog: Array.from({ length: 4 }, (_, i) => ({ id: 'mul:7,8', ok: true, ms: 1000 + i })) };
    const game = { code: 'TEST01', drill: 'facts', players: new Map([['p', p]]) };
    await fluency.saveGame(game, FactFluency);
    p.factLog = Array.from({ length: 4 }, (_, i) => ({ id: 'mul:7,8', ok: i !== 3, ms: 2000 + i }));
    await fluency.saveGame(game, FactFluency);
    const rec = (await FactFluency.findOne({ userId: student._id }).lean()).facts['mul:7,8'];
    expect(rec).toMatchObject({ label: '7 × 8', fam: 'mul', a: 7, b: 8, att: 8, right: 7 });
    expect(rec.recent.map((r) => r.ms)).toEqual([1003, 2000, 2001, 2002, 2003]);
    expect(fluency.statusOf(rec)).toBe('missed');
  });
});

describe('reading', () => {
  beforeEach(async () => {
    await FactFluency.create({ userId: student._id, games: 2, facts: {
      'mul:7,8': { label: '7 × 8', fam: 'mul', a: 7, b: 8, att: 3, right: 2, recent: [{ ok: true, ms: 900 }, { ok: false, ms: 1000 }] },
      'mul:2,3': { label: '2 × 3', fam: 'mul', a: 2, b: 3, att: 2, right: 2, recent: [{ ok: true, ms: 900 }, { ok: true, ms: 800 }] },
    } });
    await FactFluency.create({ userId: outsider._id, games: 1, facts: {} });
  });

  test('a teacher reads their own class: every student, the class grid, and the read is logged', async () => {
    const r = await as(teacher).get(`/api/live-drill/host/fluency/classes/${cls._id}`);
    expect(r.status).toBe(200);
    expect(r.body.className).toBe('Algebra 1 · P3');
    expect(r.body.students).toHaveLength(1);
    expect(r.body.students[0]).toMatchObject({ name: 'Ada Lovelace', fluent: 1, missed: 1, games: 2 });
    expect(r.body.students[0].rows).toBeUndefined();
    expect(r.body.grids[0].cells['7,8']).toEqual({ tried: 1, fluent: 0, missed: 1 });
    const log = await waitFor(() => EducationRecordAccessLog.findOne({ studentId: student._id }).lean());
    expect(log).toMatchObject({ recordType: 'skill_mastery', legitimateInterest: 'teaching_instruction' });
  });

  test("another teacher's class, or a student outside the class, is a 404", async () => {
    expect((await as(teacher).get(`/api/live-drill/host/fluency/classes/${otherCls._id}`)).status).toBe(404);
    expect((await as(teacher).get('/api/live-drill/host/fluency/classes/not-an-id')).status).toBe(404);
    expect((await as(teacher).get(`/api/live-drill/host/fluency/classes/${cls._id}/students/${outsider._id}`)).status).toBe(404);
    expect(await EducationRecordAccessLog.countDocuments({ studentId: outsider._id })).toBe(0);
  });

  test('one student, fact by fact, with their grid', async () => {
    const r = await as(teacher).get(`/api/live-drill/host/fluency/classes/${cls._id}/students/${student._id}`);
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('Ada Lovelace');
    expect(r.body.practice[0]).toMatchObject({ label: '7 × 8', status: 'missed' });
    expect(r.body.grids[0].cells['2,3'].status).toBe('fluent');
  });

  test('a student reads their own record, logged as self-access', async () => {
    const r = await as(student).get('/api/live-drill/mine/fluency');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ tried: 2, fluent: 1, missed: 1, games: 2 });
    const log = await waitFor(() => EducationRecordAccessLog.findOne({ studentId: student._id }).lean());
    expect(log).toMatchObject({ legitimateInterest: 'student_self_access', ferpaExempt: true });
  });
});
