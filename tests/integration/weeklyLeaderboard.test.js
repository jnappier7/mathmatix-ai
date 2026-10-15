/**
 * GET /api/leaderboard?period=week, against a real database.
 * Owner decision 2026-10-15: a weekly board (Monday 00:00 Eastern), all XP
 * counts, shown on the Progress tab with the viewer's own row pinned.
 */

jest.mock('../../utils/demoClone', () => ({ cleanupDemoClone: jest.fn().mockResolvedValue(undefined) }));

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { weekKey, previousWeekKey } = require('../../utils/weeklyXp');

let mem, User, app, viewer;
const W = weekKey();
const LAST = previousWeekKey(W);

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  User = require('../../models/user');
  app = express();
  app.use((req, _res, next) => { req.user = viewer; req.isAuthenticated = () => true; next(); });
  app.use('/api/leaderboard', require('../../routes/leaderboard'));
}, 60000);
afterAll(async () => { await mongoose.disconnect(); if (mem) await mem.stop(); });
afterEach(async () => { await User.deleteMany({}); });

const make = async (firstName, weekly, extra = {}) => {
  const r = await User.collection.insertOne({
    username: firstName.toLowerCase(), firstName, lastName: 'Xu', email: `${firstName}@x.test`,
    role: 'student', roles: ['student'], level: 1, xp: 0, weeklyXp: weekly, ...extra,
  });
  return r.insertedId;
};
const get = () => supertest(app).get('/api/leaderboard?period=week');

test('ranks THIS week only — a 20k all-time account with no XP this week is absent', async () => {
  await make('Veteran', { [LAST]: 900 }, { xp: 20027, level: 55 });
  await make('Newbie', { [W]: 40 }, { xp: 40 });
  await make('Ava', { [W]: 120, [LAST]: 5 });
  await make('Ben', { [W]: 75 });
  const me = await make('Cal', { [W]: 60 });
  viewer = { _id: me, role: 'student', roles: ['student'], teacherId: null };

  const res = await get();
  expect(res.status).toBe(200);
  expect(res.body.period).toBe('week');
  expect(res.body.weekKey).toBe(W);
  expect(res.body.entries.map((e) => [e.rank, e.name, e.points, e.isYou])).toEqual([
    [1, 'Ava X.', 120, false], [2, 'Ben X.', 75, false], [3, 'Cal X.', 60, true], [4, 'Newbie X.', 40, false],
  ]);
  expect(res.body.you).toEqual({ rank: 3, name: 'Cal X.', points: 60 });
  expect(res.body.viewerStaff).toBe(false);
});

test('the viewer outside the Top 10 still gets their row; with 0 points, no rank yet', async () => {
  for (let i = 0; i < 12; i++) await make(`S${i}`, { [W]: 100 + i });
  const low = await make('Low', { [W]: 3 });
  viewer = { _id: low, role: 'student', roles: ['student'] };
  let res = await get();
  expect(res.body.entries).toHaveLength(10);
  expect(res.body.you).toEqual({ rank: 13, name: 'Low X.', points: 3 });

  const zero = await make('Zero', { [LAST]: 50 });
  viewer = { _id: zero, role: 'student', roles: ['student'] };
  res = await get();
  expect(res.body.you).toEqual({ rank: null, name: 'Zero X.', points: 0 });
});

test('staff are never ranked and get no "you" row', async () => {
  // A staff account is scoped to its own class (existing rule) — and is never
  // on that board itself, however much XP it earned.
  const adminId = new mongoose.Types.ObjectId();
  await make('Kid', { [W]: 10 }, { teacherId: adminId });
  const admin = await User.collection.insertOne({ _id: adminId, username: 'owner', firstName: 'Owner', lastName: 'Xu',
    email: 'o@x.test', role: 'student', roles: ['student', 'teacher', 'parent', 'admin'], teacherId: adminId, weeklyXp: { [W]: 999 } })
    .then(() => adminId);
  viewer = { _id: admin, role: 'student', roles: ['student', 'teacher', 'parent', 'admin'] };
  const res = await get();
  expect(res.body.entries.map((e) => e.name)).toEqual(['Kid X.']);
  expect(res.body.you).toBeNull();
  // …and is told so, instead of an unexplained missing row.
  expect(res.body.viewerStaff).toBe(true);
});

test('a class board stays a class board', async () => {
  const teacherA = new mongoose.Types.ObjectId();
  await make('InClass', { [W]: 10 }, { teacherId: teacherA });
  await make('OtherClass', { [W]: 500 }, { teacherId: new mongoose.Types.ObjectId() });
  const me = await make('Me', { [W]: 5 }, { teacherId: teacherA });
  viewer = { _id: me, role: 'student', roles: ['student'], teacherId: teacherA };
  const res = await get();
  expect(res.body.entries.map((e) => e.name)).toEqual(['InClass X.', 'Me X.']);
});

test('the all-time board (no ?period) is unchanged', async () => {
  await make('Ava', { [W]: 1 }, { xp: 300, level: 3 });
  viewer = { _id: new mongoose.Types.ObjectId(), role: 'admin', roles: ['admin'] };
  const res = await supertest(app).get('/api/leaderboard');
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body[0]).toMatchObject({ rank: 1, name: 'Ava X.', xp: 300 });
});
