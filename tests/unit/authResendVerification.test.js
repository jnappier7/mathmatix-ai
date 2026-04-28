/**
 * Email verification resend cooldown — tests
 *
 * The resend endpoint generates a new token every call. Without a
 * cooldown, a user (or bot) could spam someone else's inbox by hitting
 * /resend-verification repeatedly. We enforce a 60s cooldown by reading
 * the existing emailVerificationExpires (which is always set to
 * now + 24h on every resend).
 */

const request = require('supertest');
const express = require('express');
const crypto = require('crypto');

// Mock dependencies pulled in at require time.
jest.mock('../../utils/emailService', () => ({
  sendEmailVerification: jest.fn().mockResolvedValue({ success: true })
}));
jest.mock('../../models/enrollmentCode', () => ({
  findOne: jest.fn(), findById: jest.fn()
}));
jest.mock('../../routes/student', () => ({
  generateUniqueStudentLinkCode: jest.fn().mockResolvedValue('LINK1234')
}));

// Minimal in-memory User stub — only the fields the resend route reads/writes.
const mockUserStore = new Map();
jest.mock('../../models/user', () => ({
  findOne: jest.fn(({ email }) => Promise.resolve(mockUserStore.get(email) || null))
}));

const User = require('../../models/user');
const { sendEmailVerification } = require('../../utils/emailService');
const authRouter = require('../../routes/auth');

function makeUser(overrides = {}) {
  return {
    _id: { toString: () => 'user-1' },
    email: 'student@example.com',
    firstName: 'Test',
    emailVerified: false,
    emailVerificationToken: null,
    emailVerificationExpires: null,
    save: jest.fn().mockResolvedValue(true),
    ...overrides
  };
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

describe('POST /api/auth/resend-verification', () => {
  beforeEach(() => {
    mockUserStore.clear();
    User.findOne.mockClear();
    sendEmailVerification.mockClear();
  });

  test('rejects requests with no email body', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/auth/resend-verification').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('does not reveal whether the email exists', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'nonexistent@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  test('short-circuits when the email is already verified', async () => {
    mockUserStore.set('student@example.com', makeUser({ emailVerified: true }));
    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'student@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already verified/i);
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  test('sends an email when no prior token exists', async () => {
    const user = makeUser();
    mockUserStore.set('student@example.com', user);
    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'student@example.com' });
    expect(res.status).toBe(200);
    expect(sendEmailVerification).toHaveBeenCalledTimes(1);
    expect(user.save).toHaveBeenCalled();
    expect(user.emailVerificationToken).toBeTruthy();
  });

  test('rejects a second resend within the cooldown window', async () => {
    // Simulate a token that was issued 5s ago (expires in 24h - 5s).
    const justSent = new Date(Date.now() + 24 * 60 * 60 * 1000 - 5 * 1000);
    mockUserStore.set('student@example.com', makeUser({
      emailVerificationToken: 'hashed',
      emailVerificationExpires: justSent
    }));

    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'student@example.com' });

    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.retryAfter).toBeGreaterThan(0);
    expect(res.headers['retry-after']).toBeDefined();
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  test('allows a resend after the cooldown elapses', async () => {
    // Simulate a token that was issued 2 minutes ago (well past the 60s cooldown).
    const oldExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000 - 2 * 60 * 1000);
    mockUserStore.set('student@example.com', makeUser({
      emailVerificationToken: 'hashed',
      emailVerificationExpires: oldExpiry
    }));

    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'student@example.com' });

    expect(res.status).toBe(200);
    expect(sendEmailVerification).toHaveBeenCalledTimes(1);
  });

  test('hashes the verification token before storing it', async () => {
    const user = makeUser();
    mockUserStore.set('student@example.com', user);
    const app = makeApp();
    await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'student@example.com' });

    // The stored value should look like a sha256 hex digest, not the raw
    // token that was emailed to the user.
    expect(user.emailVerificationToken).toMatch(/^[0-9a-f]{64}$/);
    // And it should be the SHA-256 hash of the raw token sent to email.
    const rawTokenSent = sendEmailVerification.mock.calls[0][2];
    const expected = crypto.createHash('sha256').update(rawTokenSent).digest('hex');
    expect(user.emailVerificationToken).toBe(expected);
  });
});
