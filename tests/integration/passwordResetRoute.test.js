// tests/integration/passwordResetRoute.test.js
// Real integration test for routes/passwordReset.js (the existing
// passwordReset.test.js file is mostly commented-out stubs).

jest.mock('../../utils/logger', () => {
  const stub = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

jest.mock('../../utils/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true })
}));

jest.mock('../../models/user', () => ({
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn()
}));

jest.mock('mongoose', () => ({
  connection: {
    collection: jest.fn().mockReturnValue({
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 })
    })
  }
}));

const express = require('express');
const supertest = require('supertest');
const crypto = require('crypto');
const User = require('../../models/user');
const { sendPasswordResetEmail } = require('../../utils/emailService');
const router = require('../../routes/passwordReset');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/password-reset', router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/password-reset/request', () => {
  test('returns 400 when email missing', async () => {
    const res = await supertest(makeApp()).post('/api/password-reset/request').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('returns success even for non-existent email (no enumeration leak)', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await supertest(makeApp())
      .post('/api/password-reset/request')
      .send({ email: 'nobody@x.io' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test('returns success without sending email for OAuth-only accounts', async () => {
    User.findOne.mockResolvedValue({
      email: 'sso@x.io',
      googleId: 'g-1',
      passwordHash: null,
      save: jest.fn()
    });
    const res = await supertest(makeApp())
      .post('/api/password-reset/request')
      .send({ email: 'sso@x.io' });
    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test('lowercases + trims email when looking up user', async () => {
    User.findOne.mockResolvedValue(null);
    await supertest(makeApp())
      .post('/api/password-reset/request')
      .send({ email: '  Sam@Example.com  ' });
    expect(User.findOne).toHaveBeenCalledWith({ email: 'sam@example.com' });
  });

  test('generates a hashed reset token and sends email', async () => {
    const user = {
      _id: 'u1', email: 'sam@x.io', passwordHash: 'h',
      save: jest.fn().mockResolvedValue()
    };
    User.findOne.mockResolvedValue(user);

    const res = await supertest(makeApp())
      .post('/api/password-reset/request')
      .send({ email: 'sam@x.io' });

    expect(res.status).toBe(200);
    expect(user.resetPasswordToken).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
    expect(user.resetPasswordExpires).toBeGreaterThan(Date.now());
    expect(user.save).toHaveBeenCalled();

    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      'sam@x.io',
      expect.stringMatching(/^[a-f0-9]{64}$/) // raw token, not hash
    );
    // The plaintext token must NOT equal the stored hash
    const sentToken = sendPasswordResetEmail.mock.calls[0][1];
    expect(sentToken).not.toBe(user.resetPasswordToken);
  });

  test('returns 500 when email send fails', async () => {
    User.findOne.mockResolvedValue({
      _id: 'u1', email: 'sam@x.io', passwordHash: 'h', save: jest.fn().mockResolvedValue()
    });
    sendPasswordResetEmail.mockResolvedValue({ success: false, error: 'smtp' });

    const res = await supertest(makeApp())
      .post('/api/password-reset/request')
      .send({ email: 'sam@x.io' });

    expect(res.status).toBe(500);
  });

  test('catches DB errors and responds with 500', async () => {
    User.findOne.mockRejectedValue(new Error('db'));
    const res = await supertest(makeApp())
      .post('/api/password-reset/request')
      .send({ email: 'sam@x.io' });
    expect(res.status).toBe(500);
  });
});

describe('GET /api/password-reset/verify/:token', () => {
  test('returns success when token matches and is not expired', async () => {
    const raw = 'sometoken';
    const hashed = crypto.createHash('sha256').update(raw).digest('hex');
    User.findOne.mockResolvedValue({ email: 'sam@x.io' });

    const res = await supertest(makeApp()).get(`/api/password-reset/verify/${raw}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(User.findOne).toHaveBeenCalledWith(expect.objectContaining({
      resetPasswordToken: hashed,
      resetPasswordExpires: expect.objectContaining({ $gt: expect.any(Number) })
    }));
  });

  test('returns 400 when token is invalid or expired', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await supertest(makeApp()).get('/api/password-reset/verify/badtoken');
    expect(res.status).toBe(400);
  });

  test('returns 500 on DB error', async () => {
    User.findOne.mockRejectedValue(new Error('db'));
    const res = await supertest(makeApp()).get('/api/password-reset/verify/x');
    expect(res.status).toBe(500);
  });
});

describe('POST /api/password-reset/reset', () => {
  test('returns 400 when token or password missing', async () => {
    const res1 = await supertest(makeApp()).post('/api/password-reset/reset').send({});
    expect(res1.status).toBe(400);

    const res2 = await supertest(makeApp())
      .post('/api/password-reset/reset')
      .send({ token: 't' });
    expect(res2.status).toBe(400);
  });

  test('returns 400 when password is too short', async () => {
    const res = await supertest(makeApp())
      .post('/api/password-reset/reset')
      .send({ token: 't', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/8 characters/);
  });

  test('returns 400 when token is not found', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await supertest(makeApp())
      .post('/api/password-reset/reset')
      .send({ token: 'badtoken', newPassword: 'StrongPass1' });
    expect(res.status).toBe(400);
  });

  test('hashes new password, clears token, invalidates sessions on success', async () => {
    const user = {
      _id: 'u1', save: jest.fn().mockResolvedValue(),
      passwordHash: 'old', resetPasswordToken: 'h', resetPasswordExpires: Date.now() + 99999
    };
    User.findOne.mockResolvedValue(user);

    const res = await supertest(makeApp())
      .post('/api/password-reset/reset')
      .send({ token: 'rawtoken', newPassword: 'NewStrongPass1' });

    expect(res.status).toBe(200);
    expect(user.passwordHash).not.toBe('old');
    expect(user.passwordHash).toMatch(/^\$2[ay]\$/); // bcrypt prefix
    expect(user.resetPasswordToken).toBeUndefined();
    expect(user.resetPasswordExpires).toBeUndefined();
    expect(user.save).toHaveBeenCalled();
  });

  test('still succeeds even when session-invalidation throws', async () => {
    const mongoose = require('mongoose');
    const user = {
      _id: 'u1', save: jest.fn().mockResolvedValue(),
      passwordHash: 'old', resetPasswordToken: 'h', resetPasswordExpires: Date.now() + 99999
    };
    User.findOne.mockResolvedValue(user);
    mongoose.connection.collection.mockReturnValueOnce({
      deleteMany: jest.fn().mockRejectedValue(new Error('session db down'))
    });

    const res = await supertest(makeApp())
      .post('/api/password-reset/reset')
      .send({ token: 'x', newPassword: 'NewStrongPass1' });

    expect(res.status).toBe(200);
  });

  test('catches DB errors with 500', async () => {
    User.findOne.mockRejectedValue(new Error('db'));
    const res = await supertest(makeApp())
      .post('/api/password-reset/reset')
      .send({ token: 't', newPassword: 'StrongPass1' });
    expect(res.status).toBe(500);
  });
});
