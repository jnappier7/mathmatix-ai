/**
 * Weekly challenges: the page load that creates them must not 500, and the
 * progress they count must survive from one request to the next.
 *
 * Two bugs, both found by walking the chat page (course QA, 2026-11-21):
 *
 *  1. THE RACE. GET /api/weekly-challenges rolled a new week by setting fields
 *     on the loaded user and saving the whole document. The chat page fires it
 *     beside other requests that load and save the same user, so the second
 *     save threw VersionError and the student's challenges answered 500 on the
 *     very load meant to create them.
 *
 *  2. NOTHING WAS COUNTED. `weeklyProgress` is a Mongoose Map but was used as a
 *     plain object, and properties set on a Map are not saved. Every request
 *     started from zero: weekly accuracy "completed" on the first right answer,
 *     and the quest-streak and domains challenges could never pass 1.
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');

let mem;
let app;
let currentUser;

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const get = () => supertest(app).get('/api/weekly-challenges');
const send = (event, data) => supertest(app).post('/api/weekly-challenges/update').send({ event, data });

/** Give the student exactly the challenges a test needs, in the current week. */
async function setChallenges(list) {
  const monday = new Date();
  const day = monday.getDay();
  monday.setDate(monday.getDate() - day + (day === 0 ? -6 : 1));
  monday.setHours(0, 0, 0, 0);
  await User.updateOne({ _id: currentUser._id }, { $set: {
    'weeklyChallenges.weekStartDate': monday,
    'weeklyChallenges.weeklyProgress': {},
    'weeklyChallenges.challenges': list.map((c, i) => ({
      id: `t-${i}`, name: c.targetType, description: '', progress: 0, completed: false, xpReward: 100, ...c,
    })),
  } });
}

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = currentUser; req.isAuthenticated = () => !!currentUser; next(); });
  app.use('/api', require('../../routes/weeklyChallenges'));
}, 60000);

afterAll(async () => { await mongoose.disconnect(); if (mem) await mem.stop(); });

beforeEach(async () => {
  currentUser = await User.create({
    username: `w${uniq()}`, email: `w${uniq()}@example.com`, firstName: 'Ava', lastName: 'N',
    role: 'student', roles: ['student'],
  });
});

afterEach(async () => { await User.deleteMany({}); });

describe('the first load of the week', () => {
  test('creates three challenges', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.challenges).toHaveLength(3);
    expect(res.body.totalCount).toBe(3);
  });

  test('six loads at once all succeed and agree on ONE set', async () => {
    const all = await Promise.all([get(), get(), get(), get(), get(), get()]);
    expect(all.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    const stored = (await User.findById(currentUser._id).lean()).weeklyChallenges.challenges.map((c) => c.id);
    expect(stored).toHaveLength(3);
    // Whatever a request was told, a reload shows the set that was kept.
    expect((await get()).body.challenges.map((c) => c.id)).toEqual(stored);
  });

  test('a save of the same user from another request does not break it', async () => {
    // The shape of the production failure: someone else loaded the user,
    // this route rolled the week, then both wrote.
    const other = await User.findById(currentUser._id);
    const res = await get();
    expect(res.status).toBe(200);
    other.xp = 5;
    await other.save();   // touches no array, so it must not conflict either
    expect((await get()).body.challenges).toHaveLength(3);
    expect((await User.findById(currentUser._id).lean()).xp).toBe(5);
  });

  test('a load later in the same week keeps the set and its progress', async () => {
    const first = (await get()).body.challenges.map((c) => c.id);
    await User.updateOne({ _id: currentUser._id }, { $set: { 'weeklyChallenges.challenges.0.progress': 2 } });
    const again = await get();
    expect(again.body.challenges.map((c) => c.id)).toEqual(first);
    expect(again.body.challenges[0].progress).toBe(2);
  });

  test('last week\'s set is replaced', async () => {
    await User.updateOne({ _id: currentUser._id }, { $set: {
      'weeklyChallenges.weekStartDate': new Date(Date.now() - 21 * 86400000),
      'weeklyChallenges.challenges': [{ id: 'stale', name: 'old', targetType: 'problemsSolved', targetCount: 5 }],
    } });
    const res = await get();
    expect(res.body.challenges).toHaveLength(3);
    expect(res.body.challenges.map((c) => c.id)).not.toContain('stale');
  });
});

describe('progress is counted across requests', () => {
  test('weekly accuracy is a percentage of the WEEK, and needs a sample', async () => {
    await setChallenges([{ targetType: 'weeklyAccuracy', targetCount: 85 }]);

    const first = await send('problemSolved', { correct: true });
    expect(first.status).toBe(200);
    // One right answer used to read as 100% and complete the challenge.
    expect(first.body.challenges[0].completed).toBe(false);

    for (let i = 0; i < 8; i += 1) await send('problemSolved', { correct: true });
    const stored = (await User.findById(currentUser._id)).weeklyChallenges.weeklyProgress;
    expect(stored.get('totalProblems')).toBe(9);
    expect(stored.get('correctProblems')).toBe(9);

    const tenth = await send('problemSolved', { correct: true });
    expect(tenth.body.challenges[0].completed).toBe(true);
  });

  test('a week of misses does not complete it', async () => {
    await setChallenges([{ targetType: 'weeklyAccuracy', targetCount: 85 }]);
    for (let i = 0; i < 12; i += 1) await send('problemSolved', { correct: i % 2 === 0 });
    const user = await User.findById(currentUser._id);
    expect(user.weeklyChallenges.challenges[0].completed).toBe(false);
    expect(user.weeklyChallenges.weeklyProgress.get('totalProblems')).toBe(12);
  });

  test('domains practised accumulate, and the same domain counts once', async () => {
    await setChallenges([{ targetType: 'domainsPracticed', targetCount: 3 }]);
    await send('domainPracticed', { domain: 'fractions' });
    await send('domainPracticed', { domain: 'fractions' });
    const two = await send('domainPracticed', { domain: 'geometry' });
    expect(two.body.challenges[0].progress).toBe(2);
    const three = await send('domainPracticed', { domain: 'ratios' });
    expect(three.body.challenges[0].completed).toBe(true);
  });

  test('a finished challenge pays its XP once', async () => {
    await setChallenges([{ targetType: 'problemsSolved', targetCount: 2, xpReward: 150 }]);
    await send('problemSolved', { correct: true });
    const done = await send('problemSolved', { correct: true });
    expect(done.body.completedChallenges).toHaveLength(1);
    await send('problemSolved', { correct: true });
    expect((await User.findById(currentUser._id).lean()).xp).toBe(150);
  });

  test('updates that land together are all counted', async () => {
    await setChallenges([{ targetType: 'problemsSolved', targetCount: 50 }]);
    const all = await Promise.all([1, 2, 3, 4].map(() => send('problemSolved', { correct: true })));
    expect(all.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect((await User.findById(currentUser._id).lean()).weeklyChallenges.challenges[0].progress).toBe(4);
  });

  test('a request with no data object is not a crash', async () => {
    await setChallenges([{ targetType: 'problemsSolved', targetCount: 5 }]);
    const res = await supertest(app).post('/api/weekly-challenges/update').send({ event: 'problemSolved' });
    expect(res.status).toBe(200);
  });
});
