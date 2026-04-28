// tests/integration/signupValidateCode.test.js
// Integration test for routes/signup.js POST /validate-code (the lightest
// signup endpoint — checks an enrollment code without creating a user).

jest.mock('../../utils/logger', () => {
  const stub = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

jest.mock('../../utils/demoClone', () => ({ cleanupDemoClone: jest.fn() }));

jest.mock('../../models/enrollmentCode', () => ({
  findOne: jest.fn()
}));

jest.mock('../../models/user', () => ({}));

jest.mock('../../utils/emailService', () => ({
  sendEmailVerification: jest.fn().mockResolvedValue()
}));

jest.mock('../../utils/tutorConfig', () => ({}));

jest.mock('../../auth/passport-config', () => ({
  generateUniqueUsername: jest.fn()
}));

jest.mock('passport', () => ({
  authenticate: jest.fn(),
  use: jest.fn()
}));

const express = require('express');
const supertest = require('supertest');
const EnrollmentCode = require('../../models/enrollmentCode');
const router = require('../../routes/signup');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = () => false; // ensureNotAuthenticated lets through
    next();
  });
  app.use('/signup', router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ENROLLMENT_CODES;
});

describe('POST /signup/validate-code', () => {
  test('returns 400 when no code provided', async () => {
    const r = await supertest(makeApp()).post('/signup/validate-code').send({});
    expect(r.status).toBe(400);
    expect(r.body.valid).toBe(false);
  });

  test('returns 404 when code is unknown and not in env list', async () => {
    EnrollmentCode.findOne.mockReturnValue({
      populate: jest.fn().mockResolvedValue(null)
    });

    const r = await supertest(makeApp()).post('/signup/validate-code').send({ code: 'NONEXISTENT' });
    expect(r.status).toBe(404);
    expect(r.body.valid).toBe(false);
  });

  test('falls back to ENROLLMENT_CODES env var as Open Registration', async () => {
    EnrollmentCode.findOne.mockReturnValue({
      populate: jest.fn().mockResolvedValue(null)
    });
    process.env.ENROLLMENT_CODES = 'OPEN-2025, FREE-TRIAL';

    const r = await supertest(makeApp()).post('/signup/validate-code').send({ code: 'open-2025' });
    expect(r.status).toBe(200);
    expect(r.body.valid).toBe(true);
    expect(r.body.enrollmentCode.className).toBe('Open Registration');
  });

  test('returns 400 when code exists but is not valid for use', async () => {
    EnrollmentCode.findOne.mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        isValidForUse: () => ({ valid: false, reason: 'Code expired' })
      })
    });

    const r = await supertest(makeApp()).post('/signup/validate-code').send({ code: 'EXPIRED' });
    expect(r.status).toBe(400);
    expect(r.body.valid).toBe(false);
    expect(r.body.message).toBe('Code expired');
  });

  test('returns 200 + class info when code is valid', async () => {
    EnrollmentCode.findOne.mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        isValidForUse: () => ({ valid: true }),
        className: 'Algebra 1 Period 2',
        gradeLevel: '8',
        mathCourse: 'Algebra 1',
        teacherId: { firstName: 'Anna', lastName: 'Singh' }
      })
    });

    const r = await supertest(makeApp()).post('/signup/validate-code').send({ code: 'ALG-2A' });
    expect(r.status).toBe(200);
    expect(r.body.valid).toBe(true);
    expect(r.body.enrollmentCode).toMatchObject({
      className: 'Algebra 1 Period 2',
      teacherName: 'Anna Singh',
      gradeLevel: '8',
      mathCourse: 'Algebra 1'
    });
  });

  test('handles missing teacher gracefully ("Unknown Teacher")', async () => {
    EnrollmentCode.findOne.mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        isValidForUse: () => ({ valid: true }),
        className: 'A class',
        gradeLevel: '7',
        mathCourse: 'Pre-Algebra',
        teacherId: null
      })
    });

    const r = await supertest(makeApp()).post('/signup/validate-code').send({ code: 'X' });
    expect(r.body.enrollmentCode.teacherName).toBe('Unknown Teacher');
  });

  test('returns 500 on DB error', async () => {
    EnrollmentCode.findOne.mockImplementation(() => { throw new Error('db'); });
    const r = await supertest(makeApp()).post('/signup/validate-code').send({ code: 'X' });
    expect(r.status).toBe(500);
  });

  test('uppercases + trims code before lookup', async () => {
    EnrollmentCode.findOne.mockReturnValue({
      populate: jest.fn().mockResolvedValue(null)
    });
    await supertest(makeApp()).post('/signup/validate-code').send({ code: '  abc-123  ' });
    expect(EnrollmentCode.findOne).toHaveBeenCalledWith({ code: 'ABC-123' });
  });
});
