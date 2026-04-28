// tests/integration/feedback.test.js
// Integration test for routes/feedback.js (POST /, GET /my, GET /all)

jest.mock('../../utils/logger', () => {
  const stub = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

jest.mock('../../utils/demoClone', () => ({
  cleanupDemoClone: jest.fn().mockResolvedValue(undefined)
}));

// `global.__nextFeedbackSave` lets a test inject a one-shot save behavior.
jest.mock('../../models/feedback', () => {
  function Feedback(data) {
    Object.assign(this, data);
    this._id = 'fb-1';
    const oneShot = global.__nextFeedbackSave;
    global.__nextFeedbackSave = null;
    this.save = oneShot || jest.fn().mockResolvedValue(this);
    if (global.__feedbackCtor) global.__feedbackCtor(data);
  }
  Feedback.find = jest.fn();
  return Feedback;
});

const mockFeedbackInstance = jest.fn();
beforeAll(() => { global.__feedbackCtor = mockFeedbackInstance; });
afterAll(() => { delete global.__feedbackCtor; });

const express = require('express');
const supertest = require('supertest');
const Feedback = require('../../models/feedback');
const router = require('../../routes/feedback');

function makeApp(currentUser) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = () => Boolean(currentUser);
    req.user = currentUser || null;
    next();
  });
  app.use('/api/feedback', router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/feedback', () => {
  test('rejects unauthenticated requests', async () => {
    const res = await supertest(makeApp(null)).post('/api/feedback').send({});
    expect(res.status).toBe(401);
  });

  test('rejects missing required fields', async () => {
    const app = makeApp({ _id: 'u1', role: 'student' });
    const res = await supertest(app).post('/api/feedback').send({ subject: 'only subject' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/);
  });

  test('saves feedback with priority default = medium', async () => {
    const app = makeApp({ _id: 'u1', role: 'student' });
    const res = await supertest(app).post('/api/feedback').send({
      type: 'bug',
      subject: 'broken button',
      description: 'click does nothing'
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockFeedbackInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        type: 'bug',
        priority: 'medium'
      })
    );
  });

  test('returns 500 on DB failure', async () => {
    // Inject a one-shot save() that rejects.
    global.__nextFeedbackSave = jest.fn().mockRejectedValue(new Error('db'));
    const app = makeApp({ _id: 'u1', role: 'student' });
    const res = await supertest(app).post('/api/feedback').send({
      type: 'bug', subject: 's', description: 'd'
    });
    expect(res.status).toBe(500);
  });
});

describe('GET /api/feedback/my', () => {
  test('rejects unauthenticated', async () => {
    const res = await supertest(makeApp(null)).get('/api/feedback/my');
    expect(res.status).toBe(401);
  });

  test('returns user-scoped feedback list', async () => {
    const list = [{ _id: 'fb-1', subject: 'a' }];
    Feedback.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue(list)
    });

    const app = makeApp({ _id: 'u1', role: 'student' });
    const res = await supertest(app).get('/api/feedback/my');

    expect(res.status).toBe(200);
    expect(res.body.feedback).toEqual(list);
    expect(Feedback.find).toHaveBeenCalledWith({ userId: 'u1' });
  });
});

describe('GET /api/feedback/all', () => {
  test('forbids non-admin users', async () => {
    const app = makeApp({ _id: 'u1', role: 'student' });
    const res = await supertest(app).get('/api/feedback/all');
    expect(res.status).toBe(403);
  });

  test('returns all feedback with filters when admin', async () => {
    const list = [{ _id: 'fb-1', subject: 'a' }];
    Feedback.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(list)
    });

    const app = makeApp({ _id: 'admin-1', role: 'admin' });
    const res = await supertest(app).get('/api/feedback/all?status=open&priority=high');

    expect(res.status).toBe(200);
    expect(res.body.feedback).toEqual(list);
    expect(Feedback.find).toHaveBeenCalledWith({ status: 'open', priority: 'high' });
  });
});
