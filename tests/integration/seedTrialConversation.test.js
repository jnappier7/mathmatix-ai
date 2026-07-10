// Integration test for POST /api/conversations/seed-trial.
//
// Guards the "remembers exactly where we are" promise: a signed-up user's trial
// conversation must be persisted into a real, active conversation (so the tutor
// has it as context next turn) — without clobbering an already-started session.

jest.mock('../../utils/logger', () => {
  const stub = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

// Heavy service modules pulled in at module load — stub them out.
jest.mock('../../services/chatService', () => ({}));
jest.mock('../../services/assessmentService', () => ({}));

// validateObjectId is CALLED at load time on other routes → must return middleware.
jest.mock('../../middleware/validateObjectId', () => ({
  validateObjectId: () => (req, res, next) => next(),
}));

// Auth: inject a fake user.
jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, res, next) => { req.user = { _id: 'user-1' }; next(); },
}));

// Model mocks.
jest.mock('../../models/user', () => {
  const state = { user: null };
  return {
    findById: jest.fn(() => Promise.resolve(state.user)),
    __setUser: (u) => { state.user = u; },
  };
});

jest.mock('../../models/conversation', () => {
  const instances = [];
  function Conversation(doc) {
    Object.assign(this, doc);
    this._id = 'conv-' + (instances.length + 1);
    this.save = jest.fn().mockResolvedValue(this);
    instances.push(this);
  }
  Conversation.findById = jest.fn();
  Conversation.__instances = instances;
  Conversation.__reset = () => { instances.length = 0; Conversation.findById.mockReset(); };
  return Conversation;
});

const express = require('express');
const request = require('supertest');
const User = require('../../models/user');
const Conversation = require('../../models/conversation');
const conversationsRouter = require('../../routes/conversations');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/conversations', conversationsRouter);
  return app;
}

const HISTORY = [
  { role: 'assistant', content: 'Hey there! Got a math question?' },
  { role: 'user', content: 'Solve 2x = 10' },
  { role: 'assistant', content: 'What undoes the times-2?' },
  { role: 'bogus', content: 'should be dropped' },
  { role: 'user', content: '   ' }, // empty after trim → dropped
];

describe('POST /api/conversations/seed-trial', () => {
  beforeEach(() => {
    Conversation.__reset();
    User.__setUser({ _id: 'user-1', activeConversationId: null, save: jest.fn().mockResolvedValue(true) });
  });

  test('seeds a fresh active conversation from trial history and sets it active', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/conversations/seed-trial')
      .send({ tutorId: 'mr-nappier', history: HISTORY });

    expect(res.status).toBe(200);
    expect(res.body.seeded).toBe(true);
    expect(res.body.messageCount).toBe(3); // bogus role + empty message dropped

    const conv = Conversation.__instances[0];
    expect(conv).toBeTruthy();
    expect(conv.isActive).toBe(true);
    expect(conv.isMastery).toBe(false);
    expect(conv.messages).toHaveLength(3);
    // tutorId attributed to assistant turns only.
    expect(conv.messages[0]).toMatchObject({ role: 'assistant', tutorId: 'mr-nappier' });
    expect(conv.messages[1]).toMatchObject({ role: 'user', tutorId: null });

    // Became the user's active conversation.
    const user = await User.findById('user-1');
    expect(user.activeConversationId).toBe(conv._id);
    expect(user.save).toHaveBeenCalled();
  });

  test('does NOT clobber an already-started session', async () => {
    User.__setUser({ _id: 'user-1', activeConversationId: 'existing', save: jest.fn() });
    Conversation.findById.mockResolvedValue({ _id: 'existing', isActive: true, messages: [{ role: 'user', content: 'hi' }] });

    const app = buildApp();
    const res = await request(app)
      .post('/api/conversations/seed-trial')
      .send({ tutorId: 'bob', history: HISTORY });

    expect(res.status).toBe(200);
    expect(res.body.seeded).toBe(false);
    expect(res.body.reason).toBe('active-conversation-exists');
    expect(Conversation.__instances).toHaveLength(0); // nothing created
  });

  test('rejects empty history', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/conversations/seed-trial')
      .send({ tutorId: 'maya', history: [] });

    expect(res.status).toBe(400);
  });
});
