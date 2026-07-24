/**
 * The SERVER-SIDE baseline gate on the course greeting, against a real database.
 *
 * The client gate (hold the tutor greeting until the baseline is done) is not
 * enough on its own — production shipped a chat bundle that 404s, so the gating
 * code may never load, and a stale tab is a second uncontrolled client. The
 * server must refuse to generate a greeting while a required baseline is pending,
 * so no premature "let's learn what a real number is" is ever produced OR
 * persisted, whatever the client does.
 *
 * These drive the real /api/course-chat greeting handler. The LLM is not reached
 * on the withheld path (that is the whole point); on the allowed path we stub the
 * gateway so no live model is called.
 */

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'Welcome to the course!' } }] })
}));

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const CourseSession = require('../../models/courseSession');
const ActTestSession = require('../../models/actTestSession');
const Conversation = require('../../models/conversation');

let mem;
let app;
let currentUserId;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());

  const router = require('../../routes/courseChat');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { _id: currentUserId }; req.isAuthenticated = () => true; next(); });
  app.use('/api/course-chat', router);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

afterEach(async () => {
  await User.deleteMany({});
  await CourseSession.deleteMany({});
  await ActTestSession.deleteMany({});
  await Conversation.deleteMany({});
});

const enrollActPrep = async () => {
  const u = await User.create({ username: `g${Date.now()}`, email: `g${Date.now()}@e.com`, firstName: 'G', lastName: 'H' });
  currentUserId = u._id;
  const s = await CourseSession.create({
    userId: u._id, courseId: 'act-prep', status: 'active',
    pathwayId: 'act-prep-pathway', courseName: 'ACT Math Prep',
    currentModuleId: 'unit1'
  });
  await User.findByIdAndUpdate(u._id, { activeCourseSessionId: s._id });
  return u;
};

const greet = () => supertest(app).post('/api/course-chat').send({ isGreeting: true });

describe('ACT prep with no baseline taken', () => {
  test('the greeting is withheld and the baseline card is returned instead', async () => {
    await enrollActPrep();
    const res = await greet();

    expect(res.status).toBe(200);
    expect(res.body.baselineRequired).toBe(true);
    expect(res.body.diagnostic).toMatchObject({ type: 'act-practice', required: true });
    // No teaching text — the tutor said nothing about real numbers.
    expect(res.body.text).toBeUndefined();
  });

  test('no greeting is persisted into the conversation while the baseline is pending', async () => {
    const u = await enrollActPrep();
    await greet();

    const session = await CourseSession.findOne({ userId: u._id });
    if (session.conversationId) {
      const convo = await Conversation.findById(session.conversationId);
      const assistantMsgs = (convo?.messages || []).filter((m) => m.role === 'assistant');
      expect(assistantMsgs).toHaveLength(0);
    }
    // Either no conversation was created, or it holds no assistant greeting.
  });
});

describe('the gate decision (the exact check the route runs)', () => {
  // The route's "allowed" branch continues into the full greeting pipeline, which
  // is out of scope here — this feature IS the withhold decision. Test that
  // decision directly against the real DB for both states, so the gate is proven
  // without dragging in the LLM greeting generator.
  const { isRequiredBaselinePending } = require('../../utils/courseDiagnostic');

  test('pending while no practice ACT is completed', async () => {
    const u = await enrollActPrep();
    const { pending, diagnostic } = await isRequiredBaselinePending(u, 'act-prep');
    expect(pending).toBe(true);
    expect(diagnostic).toMatchObject({ type: 'act-practice', required: true });
  });

  test('not pending once a practice ACT is completed', async () => {
    const u = await enrollActPrep();
    await ActTestSession.create({ userId: u._id, status: 'completed' });
    const { pending } = await isRequiredBaselinePending(u, 'act-prep');
    expect(pending).toBe(false);
  });

  test('an in-progress (not completed) ACT still counts as pending', async () => {
    const u = await enrollActPrep();
    await ActTestSession.create({ userId: u._id, status: 'in_progress' });
    const { pending } = await isRequiredBaselinePending(u, 'act-prep');
    expect(pending).toBe(true);
  });
});
