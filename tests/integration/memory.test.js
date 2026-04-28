// tests/integration/memory.test.js
// Integration test for routes/memory.js (POST /api/memory/recall)

jest.mock('../../models/conversation', () => ({
  findOne: jest.fn()
}));

const express = require('express');
const supertest = require('supertest');
const Conversation = require('../../models/conversation');
const { router } = require('../../routes/memory');

function makeApp(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/memory', router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/memory/recall', () => {
  test('returns 401 when not authenticated', async () => {
    const r = await supertest(makeApp(null)).post('/api/memory/recall').send({});
    expect(r.status).toBe(401);
  });

  test('returns null summary + empty messages when user has no conversations', async () => {
    Conversation.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });
    const r = await supertest(makeApp({ _id: 'u1' })).post('/api/memory/recall').send({});
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ summary: null, messages: [] });
  });

  test('returns last conversation summary + last 5 messages', async () => {
    const messages = Array(10).fill(null).map((_, i) => ({ role: 'user', content: `m${i}` }));
    Conversation.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({
        summary: 'last session: factoring',
        lastActivity: new Date('2025-01-01'),
        messages
      })
    });

    const r = await supertest(makeApp({ _id: 'u1' })).post('/api/memory/recall').send({});
    expect(r.status).toBe(200);
    expect(r.body.summary).toBe('last session: factoring');
    expect(r.body.messages).toHaveLength(5);
    expect(r.body.messages[0].content).toBe('m5');
  });

  test('handles missing messages field', async () => {
    Conversation.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({ summary: 's', lastActivity: new Date() })
    });
    const r = await supertest(makeApp({ _id: 'u1' })).post('/api/memory/recall').send({});
    expect(r.status).toBe(200);
    expect(r.body.messages).toEqual([]);
  });

  test('returns 500 on DB error', async () => {
    Conversation.findOne.mockReturnValue({ sort: jest.fn().mockRejectedValue(new Error('db')) });
    const r = await supertest(makeApp({ _id: 'u1' })).post('/api/memory/recall').send({});
    expect(r.status).toBe(500);
    expect(r.body.summary).toBeNull();
  });

  test('queries by the authenticated user_id, sorted by lastActivity desc', async () => {
    const sortSpy = jest.fn().mockResolvedValue(null);
    Conversation.findOne.mockReturnValue({ sort: sortSpy });

    await supertest(makeApp({ _id: 'user-7' })).post('/api/memory/recall').send({});
    expect(Conversation.findOne).toHaveBeenCalledWith({ userId: 'user-7' });
    expect(sortSpy).toHaveBeenCalledWith({ lastActivity: -1 });
  });
});
