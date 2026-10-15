/**
 * A "Watch for This" reminder reaches the notebook only once it has RECURRED
 * (QA handoff 2026-10-14 §2.4). The persist stage already held a first sighting
 * back from the live turn (REMINDER_ACTIVATION_COUNT); the list endpoint didn't,
 * so students saw every one-off, AI-guessed diagnosis — 217 of 229 in prod —
 * many of them false. This lives in the QUERY, so it needs a database.
 */

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const LearningCard = require('../../models/learningCard');
const { REMINDER_ACTIVATION_COUNT } = require('../../utils/pipeline/learningCards');

let mem;
let app;
let meId;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  const router = require('../../routes/notebook');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { _id: meId }; req.isAuthenticated = () => true; next(); });
  app.use('/api/notebook', router);
}, 60000);

afterAll(async () => { await mongoose.disconnect(); if (mem) await mem.stop(); });
beforeEach(async () => {
  meId = new mongoose.Types.ObjectId();
  await LearningCard.create([
    { userId: meId, type: 'reminder', title: 'Watch for This: one-off guess', seenCount: 1 },
    { userId: meId, type: 'reminder', title: 'Watch for This: real pattern', seenCount: REMINDER_ACTIVATION_COUNT, body: 'sign slips' },
    { userId: meId, type: 'note', source: 'student', title: 'my note', body: 'sign rules' },
    { userId: meId, type: 'aha', title: 'AHA', seenCount: 1 },
  ]);
});
afterEach(async () => { await LearningCard.deleteMany({}); });

const list = (qs = '') => supertest(app).get(`/api/notebook${qs}`);
const titles = (res) => res.body.cards.map(c => c.title).sort();

test('a first-sighting reminder is held back; a recurring one shows', async () => {
  const res = await list();
  expect(res.status).toBe(200);
  expect(titles(res)).toEqual(['AHA', 'Watch for This: real pattern', 'my note']);
});

test('the Reminders filter applies the same rule', async () => {
  expect(titles(await list('?type=reminder'))).toEqual(['Watch for This: real pattern']);
});

test('search composes with the rule instead of replacing it', async () => {
  // "sign" matches the recurring reminder AND the note; the one-off never leaks in
  expect(titles(await list('?q=sign'))).toEqual(['Watch for This: real pattern', 'my note']);
  expect(titles(await list('?q=one-off'))).toEqual([]);
});
