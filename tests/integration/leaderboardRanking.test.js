/**
 * Leaderboard ranking + who is on it, against a real database
 * (QA handoff 2026-10-14 §2.6, witnessed on prod data):
 *   - every row came back `rank: 0` (hard-coded);
 *   - a staff account that also holds the student role was ranked against
 *     the kids (the owner's admin account sat at #3 of the global board).
 * The staff rule lives in the QUERY, so it needs Mongo, not a mock.
 */

jest.mock('../../utils/demoClone', () => ({ cleanupDemoClone: jest.fn().mockResolvedValue(undefined) }));

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mem;
let User;
let app;
let viewer;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  User = require('../../models/user');
  const router = require('../../routes/leaderboard');
  app = express();
  app.use((req, _res, next) => { req.user = viewer; req.isAuthenticated = () => true; next(); });
  app.use('/api/leaderboard', router);
}, 60000);

afterAll(async () => { await mongoose.disconnect(); if (mem) await mem.stop(); });
afterEach(async () => { await User.deleteMany({}); });

const make = (o) => User.collection.insertOne({ username: o.firstName.toLowerCase(), lastName: 'X', ...o });

test('ranks are 1..n in board order, and staff holding student are excluded', async () => {
  await make({ firstName: 'Ava', role: 'student', roles: ['student'], level: 9, xp: 900 });
  await make({ firstName: 'Ben', role: 'student', roles: ['student'], level: 12, xp: 1200 });
  await make({ firstName: 'Cal', role: 'student', roles: ['student'], level: 12, xp: 1300 });
  // staff who also hold student — on any dashboard
  await make({ firstName: 'Owner', role: 'student', roles: ['student', 'teacher', 'parent', 'admin'], level: 20, xp: 3683 });
  await make({ firstName: 'Teach', role: 'teacher', roles: ['student', 'teacher'], level: 30, xp: 9000 });
  // a parent who also holds student is not staff — stays
  await make({ firstName: 'Pat', role: 'parent', roles: ['student', 'parent'], level: 5, xp: 400 });
  await make({ firstName: 'Demo', role: 'student', roles: ['student'], level: 99, xp: 99999, isDemo: true });

  viewer = { _id: new mongoose.Types.ObjectId(), role: 'student', roles: ['student'], teacherId: null };
  const res = await supertest(app).get('/api/leaderboard');
  expect(res.status).toBe(200);
  expect(res.body.map(r => [r.rank, r.name])).toEqual([
    [1, 'Cal X.'], [2, 'Ben X.'], [3, 'Ava X.'], [4, 'Pat X.'],
  ]);
});
