// tests/unit/validation.test.js
// Unit tests for express-validator validation chains

jest.mock('../../utils/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const { validationResult } = require('express-validator');
const {
  loginValidation,
  signupValidation,
  passwordResetRequestValidation,
  passwordResetValidation,
  changePasswordValidation,
  chatMessageValidation,
  handleValidationErrors
} = require('../../middleware/validation');

// Helper: run a validation chain (array of express-validator middlewares) against a fake req
async function runChain(chain, body) {
  const req = { body, headers: {} };
  for (const v of chain) {
    await v.run(req);
  }
  return validationResult(req);
}

describe('loginValidation', () => {
  test('passes with valid email + password', async () => {
    const result = await runChain(loginValidation, { email: 'foo@example.com', password: 'anything' });
    expect(result.isEmpty()).toBe(true);
  });

  test('fails with invalid email', async () => {
    const result = await runChain(loginValidation, { email: 'not-an-email', password: 'x' });
    expect(result.isEmpty()).toBe(false);
    expect(result.array().some(e => e.path === 'email')).toBe(true);
  });

  test('fails with missing password', async () => {
    const result = await runChain(loginValidation, { email: 'foo@example.com', password: '' });
    expect(result.isEmpty()).toBe(false);
    expect(result.array().some(e => e.path === 'password')).toBe(true);
  });
});

describe('signupValidation', () => {
  const valid = {
    email: 'jane@example.com',
    password: 'StrongPass1',
    confirmPassword: 'StrongPass1',
    firstName: 'Jane',
    lastName: 'Doe',
    role: 'student',
    gradeLevel: '8',
    learningStyle: 'Visual',
    tonePreference: 'Encouraging',
    mathCourse: 'Algebra 1'
  };

  test('passes with a complete valid signup body', async () => {
    const result = await runChain(signupValidation, { ...valid });
    expect(result.isEmpty()).toBe(true);
  });

  test('fails when passwords do not match', async () => {
    const result = await runChain(signupValidation, { ...valid, confirmPassword: 'Different1' });
    const fields = result.array().map(e => e.path);
    expect(fields).toContain('confirmPassword');
  });

  test('rejects weak passwords (no uppercase/digit)', async () => {
    const result = await runChain(signupValidation, {
      ...valid,
      password: 'alllowercase',
      confirmPassword: 'alllowercase'
    });
    expect(result.array().some(e => e.path === 'password')).toBe(true);
  });

  test('rejects short password under 8 chars', async () => {
    const result = await runChain(signupValidation, {
      ...valid,
      password: 'Sh0rt',
      confirmPassword: 'Sh0rt'
    });
    expect(result.array().some(e => e.path === 'password')).toBe(true);
  });

  test('rejects invalid role (e.g. admin via signup)', async () => {
    const result = await runChain(signupValidation, { ...valid, role: 'admin' });
    expect(result.array().some(e => e.path === 'role')).toBe(true);
  });

  test('rejects invalid grade level', async () => {
    const result = await runChain(signupValidation, { ...valid, gradeLevel: '13' });
    expect(result.array().some(e => e.path === 'gradeLevel')).toBe(true);
  });

  test('rejects names with disallowed characters', async () => {
    const result = await runChain(signupValidation, { ...valid, firstName: 'Jane<script>' });
    expect(result.array().some(e => e.path === 'firstName')).toBe(true);
  });

  test('rejects non-array interests', async () => {
    const result = await runChain(signupValidation, { ...valid, interests: 'not-an-array' });
    expect(result.array().some(e => e.path === 'interests')).toBe(true);
  });
});

describe('passwordReset validations', () => {
  test('passwordResetRequestValidation requires a valid email', async () => {
    expect((await runChain(passwordResetRequestValidation, { email: 'x@y.io' })).isEmpty()).toBe(true);
    expect((await runChain(passwordResetRequestValidation, { email: 'nope' })).isEmpty()).toBe(false);
  });

  test('passwordResetValidation requires valid token + matching strong password', async () => {
    const ok = await runChain(passwordResetValidation, {
      token: 'a'.repeat(40),
      password: 'StrongPass1',
      confirmPassword: 'StrongPass1'
    });
    expect(ok.isEmpty()).toBe(true);

    const badToken = await runChain(passwordResetValidation, {
      token: 'short',
      password: 'StrongPass1',
      confirmPassword: 'StrongPass1'
    });
    expect(badToken.array().some(e => e.path === 'token')).toBe(true);

    const mismatch = await runChain(passwordResetValidation, {
      token: 'a'.repeat(40),
      password: 'StrongPass1',
      confirmPassword: 'Different1'
    });
    expect(mismatch.array().some(e => e.path === 'confirmPassword')).toBe(true);
  });

  test('changePasswordValidation requires currentPassword to be present', async () => {
    const missing = await runChain(changePasswordValidation, {
      currentPassword: '',
      password: 'StrongPass1',
      confirmPassword: 'StrongPass1'
    });
    expect(missing.array().some(e => e.path === 'currentPassword')).toBe(true);
  });
});

describe('chatMessageValidation', () => {
  test('rejects empty message', async () => {
    const result = await runChain(chatMessageValidation, { message: '' });
    expect(result.array().some(e => e.path === 'message')).toBe(true);
  });

  test('rejects messages over 10000 chars', async () => {
    const result = await runChain(chatMessageValidation, { message: 'a'.repeat(10001) });
    expect(result.array().some(e => e.path === 'message')).toBe(true);
  });

  test('escapes HTML in message body (XSS hardening)', async () => {
    const req = { body: { message: '<script>alert(1)</script>' }, headers: {} };
    for (const v of chatMessageValidation) {
      await v.run(req);
    }
    expect(req.body.message).not.toContain('<script>');
    expect(req.body.message).toMatch(/&lt;script&gt;/);
  });
});

describe('handleValidationErrors', () => {
  test('calls next when no errors', async () => {
    const req = { body: { email: 'foo@example.com', password: 'x' }, headers: {} };
    for (const v of loginValidation) {
      await v.run(req);
    }
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    handleValidationErrors(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 400 with structured errors when validation fails', async () => {
    const req = { body: { email: 'bad' }, headers: {}, path: '/login', method: 'POST', ip: '1.2.3.4' };
    for (const v of loginValidation) {
      await v.run(req);
    }
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    handleValidationErrors(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Validation failed',
      errors: expect.any(Array)
    }));
  });
});
