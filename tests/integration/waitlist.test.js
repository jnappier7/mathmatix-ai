// tests/integration/waitlist.test.js
// Integration test for routes/waitlist.js

jest.mock('../../utils/logger', () => {
  const stub = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

jest.mock('../../models/waitlist', () => ({
  findOne: jest.fn(),
  create: jest.fn()
}));

jest.mock('../../utils/emailService', () => ({
  sendWaitlistConfirmation: jest.fn().mockResolvedValue()
}));

const express = require('express');
const supertest = require('supertest');
const Waitlist = require('../../models/waitlist');
const { sendWaitlistConfirmation } = require('../../utils/emailService');
const router = require('../../routes/waitlist');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/waitlist', router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/waitlist', () => {
  test('rejects missing email', async () => {
    const res = await supertest(makeApp()).post('/api/waitlist').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('rejects malformed email', async () => {
    const res = await supertest(makeApp()).post('/api/waitlist').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  test('returns 200 (success) when email already on waitlist (no duplicate)', async () => {
    Waitlist.findOne.mockResolvedValue({ email: 'sam@example.com' });
    const res = await supertest(makeApp())
      .post('/api/waitlist')
      .send({ email: 'sam@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Waitlist.create).not.toHaveBeenCalled();
  });

  test('creates new entry with normalized (lowercased) email and known role', async () => {
    Waitlist.findOne.mockResolvedValue(null);
    Waitlist.create.mockResolvedValue({ _id: 'w1' });

    const res = await supertest(makeApp())
      .post('/api/waitlist')
      .send({ email: 'Sam@Example.com', role: 'parent' });

    expect(res.status).toBe(201);
    expect(Waitlist.create).toHaveBeenCalledWith({
      email: 'sam@example.com',
      role: 'parent'
    });
  });

  test('falls back to "other" for unknown roles', async () => {
    Waitlist.findOne.mockResolvedValue(null);
    Waitlist.create.mockResolvedValue({ _id: 'w1' });

    await supertest(makeApp())
      .post('/api/waitlist')
      .send({ email: 'sam@example.com', role: 'admin' });

    expect(Waitlist.create).toHaveBeenCalledWith({
      email: 'sam@example.com',
      role: 'other'
    });
  });

  test('still succeeds when confirmation email fails (non-blocking)', async () => {
    Waitlist.findOne.mockResolvedValue(null);
    Waitlist.create.mockResolvedValue({ _id: 'w1' });
    sendWaitlistConfirmation.mockRejectedValue(new Error('SMTP down'));

    const res = await supertest(makeApp())
      .post('/api/waitlist')
      .send({ email: 'sam@example.com', role: 'student' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('returns 500 on DB failure', async () => {
    Waitlist.findOne.mockRejectedValue(new Error('db'));
    const res = await supertest(makeApp())
      .post('/api/waitlist')
      .send({ email: 'sam@example.com' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
