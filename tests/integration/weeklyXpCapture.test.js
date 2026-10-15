/**
 * Weekly XP capture (models/user.js hooks), against a real database.
 *
 * The weekly leaderboard needs XP-by-week, and nothing recorded it: prod
 * xpHistory covered 3 of 242 students (0.3% of XP, newest event May 13). The
 * hooks count any INCREASE in cumulative `xp`, so every award path is covered
 * without touching the ~17 call sites — doc saves AND atomic $inc updates.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { weekKey, previousWeekKey, pointsFor } = require('../../utils/weeklyXp');

let mem;
let User;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  User = require('../../models/user');
}, 60000);
afterAll(async () => { await mongoose.disconnect(); if (mem) await mem.stop(); });
afterEach(async () => { await User.deleteMany({}); });

const seed = (o = {}) => User.collection.insertOne({ username: `u${Math.random()}`, firstName: 'Ava', lastName: 'Lee', email: `a${Math.random()}@x.test`, role: 'student', roles: ['student'], xp: 100, level: 2, ...o })
  .then((r) => r.insertedId);

test('a document save that raises xp credits this week', async () => {
  const id = await seed();
  const u = await User.findById(id);
  u.xp += 12;                                   // e.g. xpEngine.applyXpToUser
  await u.save();
  u.xp += 7;                                    // a second award, same doc
  await u.save();
  const after = await User.findById(id).lean();
  expect(after.xp).toBe(119);
  expect(pointsFor(after)).toBe(19);
});

test('an atomic $inc on xp is mirrored into this week', async () => {
  const id = await seed();
  await User.updateOne({ _id: id }, { $inc: { xp: 25 } });          // courseSession
  await User.findOneAndUpdate({ _id: id }, { $inc: { xp: 5 } });    // challenges
  const after = await User.findById(id).lean();
  expect(after.xp).toBe(130);
  expect(pointsFor(after)).toBe(30);
});

test('saves that do not raise xp credit nothing', async () => {
  const id = await seed();
  const u = await User.findById(id);
  u.firstName = 'Renamed';
  await u.save();
  const v = await User.findById(id);
  v.xp -= 10;                                   // a correction
  await v.save();
  expect(pointsFor(await User.findById(id).lean())).toBe(0);
});

test('an admin account merge does not count as earning', async () => {
  const id = await seed();
  const u = await User.findById(id);
  u.$locals.skipWeeklyXp = true;
  u.xp += 5000;
  await u.save();
  expect(pointsFor(await User.findById(id).lean())).toBe(0);
  // …and the opt-out is one-shot: the next real award counts again
  const v = await User.findById(id);
  v.xp += 3;
  await v.save();
  expect(pointsFor(await User.findById(id).lean())).toBe(3);
});

test('last week stays readable; weeks older than 8 are pruned on save', async () => {
  const now = weekKey();
  let old = now;
  for (let i = 0; i < 10; i++) old = previousWeekKey(old);
  const id = await seed({ weeklyXp: { [previousWeekKey(now)]: 40, [old]: 99 } });
  const u = await User.findById(id);
  u.xp += 1;
  await u.save();
  const after = await User.findById(id).lean();
  expect(after.weeklyXp[previousWeekKey(now)]).toBe(40);
  expect(after.weeklyXp[old]).toBeUndefined();
  expect(pointsFor(after)).toBe(1);
});
