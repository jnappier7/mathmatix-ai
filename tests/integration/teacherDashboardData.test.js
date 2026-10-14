/**
 * The teacher dashboard's data contract, against a real database.
 *
 * Every assertion here is a number a teacher saw wrong on prod (2026-10-13):
 *   - /api/teacher/students: weekly minutes summed to 1,898 for a class whose
 *     true week was ~98 (stale counters on inactive students); students with
 *     tutoring history read "Never" logged in; "needs help" was 100 of 105.
 *   - roster mode must ship the compact skillSummary, not every skill map.
 *   - /api/messages/conversations 500'd for EVERY teacher and parent
 *     (`mongoose.Types.ObjectId(id)` without `new` throws on mongoose 8).
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const Conversation = require('../../models/conversation');
const Message = require('../../models/message');

const DAY = 24 * 60 * 60 * 1000;
let mem, app, currentUser;
let teacher, active, lapsed, ghost, other;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = currentUser; req.isAuthenticated = () => true; next(); });
  app.use('/api/teacher', require('../../routes/teacher'));
  app.use('/api/messages', require('../../routes/messaging'));
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

let n = 0;
const mkUser = (roles, extra = {}) => {
  n += 1;
  return User.create({
    username: `t${n}${Date.now()}`, email: `t${n}${Date.now()}@e.com`,
    firstName: extra.firstName || `F${n}`, lastName: `L${n}`, role: roles[0], roles, ...extra,
  });
};

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Conversation.deleteMany({}), Message.deleteMany({})]);
  const now = Date.now();
  teacher = await mkUser(['teacher']);
  // Worked this week; tutor flagged a struggle on a recently practiced skill.
  active = await mkUser(['student'], {
    firstName: 'Active', teacherId: teacher._id, lastLogin: new Date(now - DAY),
    weeklyActiveTutoringMinutes: 20, lastWeeklyReset: new Date(now - 2 * DAY),
    skillMastery: {
      'two-step-equations': { status: 'learning', masteryScore: 30, strugglingAreas: ['inverse operations'], lastPracticed: new Date(now - DAY) },
      'one-step-equations': { status: 'mastered', masteryScore: 100, masteredDate: new Date(now - 3 * DAY) },
    },
  });
  // Gone since February, but the stored counter still says 400 min/wk.
  lapsed = await mkUser(['student'], {
    firstName: 'Lapsed', teacherId: teacher._id, lastLogin: new Date(now - 240 * DAY),
    weeklyActiveTutoringMinutes: 400, lastWeeklyReset: new Date(now - 240 * DAY),
    skillMastery: { 'fractions': { status: 'mastered', masteryScore: 1 } }, // legacy 0-1 seed
  });
  // Has tutoring history but no lastLogin (older-account shape).
  ghost = await mkUser(['student'], { firstName: 'Ghost', teacherId: teacher._id });
  other = await mkUser(['student'], { firstName: 'NotMine' });

  await Conversation.create([
    { userId: active._id, lastActivity: new Date(now - DAY), activeMinutes: 14, messages: [] },
    { userId: active._id, lastActivity: new Date(now - 9 * DAY), activeMinutes: 6, messages: [] },
    { userId: ghost._id, lastActivity: new Date(now - 60 * DAY), activeMinutes: 16, messages: [] },
    { userId: other._id, lastActivity: new Date(now - DAY), activeMinutes: 50, messages: [] },
  ]);
  currentUser = teacher;
});

const byName = (rows, first) => rows.find(r => r.firstName === first);

describe('GET /api/teacher/students', () => {
  test('weekly minutes are real: stale counters zeroed, history from sessions', async () => {
    const { body } = await supertest(app).get('/api/teacher/students').expect(200);
    expect(body).toHaveLength(3);
    expect(byName(body, 'Lapsed').weeklyActiveTutoringMinutes).toBe(0);
    expect(byName(body, 'Lapsed').activity.weeklyMinutes).toEqual([0, 0, 0, 0]);
    expect(byName(body, 'Active').activity.weeklyMinutes).toEqual([14, 6, 0, 0]);
    const classWeek = body.reduce((sum, s) => sum + s.activity.weeklyMinutes[0], 0);
    expect(classWeek).toBe(14); // another teacher's student's 50 minutes do not leak in
  });

  test('last active comes from tutoring history when lastLogin is missing', async () => {
    const { body } = await supertest(app).get('/api/teacher/students').expect(200);
    const g = byName(body, 'Ghost');
    expect(g.lastLogin == null).toBe(true);
    expect(new Date(g.activity.lastActiveAt).getTime()).toBeGreaterThan(Date.now() - 61 * DAY);
  });

  test('skillSummary: evidence-based struggle, normalized mastery', async () => {
    const { body } = await supertest(app).get('/api/teacher/students').expect(200);
    const a = byName(body, 'Active').skillSummary;
    expect(a.struggling).toEqual([expect.objectContaining({ skillId: 'two-step-equations', reason: 'tutor-flagged' })]);
    expect(a.recentlyMastered.map(r => r.skillId)).toEqual(['one-step-equations']);
    expect(byName(body, 'Lapsed').skillSummary.avgMastery).toBe(100); // 1.0 legacy → 100, not 1 or 10000
  });

  test('roster mode ships the summary without the heavy skill maps', async () => {
    const { body } = await supertest(app).get('/api/teacher/students?fields=roster').expect(200);
    body.forEach(s => {
      expect(s.skillMastery).toBeUndefined();
      expect(s.skillSummary).toBeDefined();
      expect(s.activity).toBeDefined();
    });
  });
});

describe('GET /api/messages/conversations', () => {
  test('a teacher with no messages gets an empty inbox, not a 500', async () => {
    const { body } = await supertest(app).get('/api/messages/conversations').expect(200);
    expect(body).toEqual({ success: true, conversations: [] });
  });

  test('a conversation whose counterpart was deleted still lists', async () => {
    const parent = await mkUser(['parent']);
    await Message.create({ senderId: parent._id, recipientId: teacher._id, subject: 'Hi', body: 'Question about homework', type: 'general' }).catch(async () => {
      // tolerate schema-required extras by retrying with category
      await Message.create({ senderId: parent._id, recipientId: teacher._id, subject: 'Hi', body: 'Question about homework', category: 'general' });
    });
    await User.deleteOne({ _id: parent._id });
    const { body } = await supertest(app).get('/api/messages/conversations').expect(200);
    expect(body.conversations).toHaveLength(1);
    expect(body.conversations[0].participant.deleted).toBe(true);
    expect(body.conversations[0].unreadCount).toBe(1);
  });
});
