// tests/integration/summaryGenerator.test.js
// Integration test for routes/summary_generator.js

jest.mock('../../utils/summaryService', () => ({
  generateSummary: jest.fn()
}));

jest.mock('../../models/conversation', () => ({
  findByIdAndUpdate: jest.fn()
}));

const express = require('express');
const supertest = require('supertest');
const Conversation = require('../../models/conversation');
const { generateSummary } = require('../../utils/summaryService');
const router = require('../../routes/summary_generator');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/summarize', router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/summarize', () => {
  test('returns 400 when messageLog is missing', async () => {
    const r = await supertest(makeApp()).post('/api/summarize').send({
      studentProfile: {}, conversationId: 'c1'
    });
    expect(r.status).toBe(400);
  });

  test('returns 400 when messageLog is empty array', async () => {
    const r = await supertest(makeApp()).post('/api/summarize').send({
      messageLog: [], studentProfile: {}, conversationId: 'c1'
    });
    expect(r.status).toBe(400);
  });

  test('returns 400 when studentProfile is missing', async () => {
    const r = await supertest(makeApp()).post('/api/summarize').send({
      messageLog: [{ role: 'user' }], conversationId: 'c1'
    });
    expect(r.status).toBe(400);
  });

  test('returns 400 when conversationId is missing', async () => {
    const r = await supertest(makeApp()).post('/api/summarize').send({
      messageLog: [{ role: 'user' }], studentProfile: {}
    });
    expect(r.status).toBe(400);
  });

  test('returns 404 when conversation not found', async () => {
    generateSummary.mockResolvedValue('summary text');
    Conversation.findByIdAndUpdate.mockResolvedValue(null);

    const r = await supertest(makeApp()).post('/api/summarize').send({
      messageLog: [{ role: 'user' }], studentProfile: {}, conversationId: 'missing'
    });
    expect(r.status).toBe(404);
  });

  test('returns the generated summary on success', async () => {
    generateSummary.mockResolvedValue('Sam practiced factoring for 20 minutes.');
    Conversation.findByIdAndUpdate.mockResolvedValue({ _id: 'c1', summary: 'x' });

    const r = await supertest(makeApp()).post('/api/summarize').send({
      messageLog: [{ role: 'user', content: 'hi' }],
      studentProfile: { firstName: 'Sam' },
      conversationId: 'c1'
    });

    expect(r.status).toBe(200);
    expect(r.body.summary).toBe('Sam practiced factoring for 20 minutes.');
    expect(Conversation.findByIdAndUpdate).toHaveBeenCalledWith(
      'c1',
      { $set: { summary: 'Sam practiced factoring for 20 minutes.' } },
      { new: true }
    );
  });

  test('returns 500 when summarizer throws', async () => {
    generateSummary.mockRejectedValue(new Error('AI down'));

    const r = await supertest(makeApp()).post('/api/summarize').send({
      messageLog: [{ role: 'user' }], studentProfile: {}, conversationId: 'c1'
    });
    expect(r.status).toBe(500);
  });
});
