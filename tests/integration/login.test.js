// tests/integration/login.test.js
// Integration test for routes/login.js (POST / via passport.local)

jest.mock('../../utils/logger', () => {
  const stub = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

jest.mock('../../utils/demoClone', () => ({ cleanupDemoClone: jest.fn().mockResolvedValue() }));

jest.mock('../../models/user', () => ({
  findByIdAndUpdate: jest.fn().mockResolvedValue()
}));

// We swap passport.authenticate for a controlled stub between tests.
// `mock`-prefixed names + global handle satisfies jest.mock's hoisting rule.
global.__loginPassportAuth = jest.fn();
jest.mock('passport', () => ({
  authenticate: (strategy, cb) => (req, res, next) => global.__loginPassportAuth(strategy, cb, req, res, next)
}));

const passportAuth = global.__loginPassportAuth;

const express = require('express');
const supertest = require('supertest');
const router = require('../../routes/login');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/login', router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /login', () => {
  test('returns API help message', async () => {
    const r = await supertest(makeApp()).get('/login');
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/Login API/);
  });
});

describe('POST /login (validation)', () => {
  test('rejects malformed email payload via loginValidation', async () => {
    const r = await supertest(makeApp()).post('/login').send({ email: 'not-an-email', password: '' });
    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
  });
});

describe('POST /login (passport flow)', () => {
  function setupPassport({ err = null, user = null, info = {} } = {}) {
    passportAuth.mockImplementation((strategy, cb) => cb(err, user, info));
  }

  function makeUser(overrides = {}) {
    return {
      _id: 'u1',
      username: 'sam',
      role: 'student',
      selectedTutorId: 't1',
      avatar: { dicebearUrl: 'http://x' },
      ...overrides
    };
  }

  function appWithLogin(loginImpl) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.logIn = loginImpl;
      req.session = { save: (cb) => cb(null) };
      next();
    });
    app.use('/login', router);
    return app;
  }

  test('returns 500 on passport error', async () => {
    setupPassport({ err: new Error('boom') });
    const r = await supertest(appWithLogin((u, cb) => cb(null)))
      .post('/login').send({ email: 'a@b.io', password: 'p' });
    expect(r.status).toBe(500);
  });

  test('returns 401 when no user (bad credentials)', async () => {
    setupPassport({ user: null, info: { message: 'wrong password' } });
    const r = await supertest(appWithLogin((u, cb) => cb(null)))
      .post('/login').send({ email: 'a@b.io', password: 'bad' });
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/wrong password/);
  });

  test('returns 500 when req.logIn fails', async () => {
    setupPassport({ user: makeUser() });
    const r = await supertest(appWithLogin((u, cb) => cb(new Error('session'))))
      .post('/login').send({ email: 'a@b.io', password: 'p' });
    expect(r.status).toBe(500);
  });

  test('200 + redirect for student with tutor + avatar → /chat.html', async () => {
    setupPassport({ user: makeUser() });
    const r = await supertest(appWithLogin((u, cb) => cb(null)))
      .post('/login').send({ email: 'a@b.io', password: 'p' });
    expect(r.status).toBe(200);
    expect(r.body.redirect).toBe('/chat.html');
  });

  test('redirect for needsProfileCompletion → /complete-profile.html', async () => {
    setupPassport({ user: makeUser({ needsProfileCompletion: true }) });
    const r = await supertest(appWithLogin((u, cb) => cb(null)))
      .post('/login').send({ email: 'a@b.io', password: 'p' });
    expect(r.body.redirect).toBe('/complete-profile.html');
  });

  test('redirect for multi-role → /role-picker.html', async () => {
    setupPassport({ user: makeUser({ roles: ['teacher', 'parent'] }) });
    const r = await supertest(appWithLogin((u, cb) => cb(null)))
      .post('/login').send({ email: 'a@b.io', password: 'p' });
    expect(r.body.redirect).toBe('/role-picker.html');
  });

  test('redirect for teacher → /teacher-dashboard.html', async () => {
    setupPassport({ user: makeUser({ role: 'teacher' }) });
    const r = await supertest(appWithLogin((u, cb) => cb(null)))
      .post('/login').send({ email: 'a@b.io', password: 'p' });
    expect(r.body.redirect).toBe('/teacher-dashboard.html');
  });

  test('redirect for student without tutor → /pick-tutor.html', async () => {
    setupPassport({ user: makeUser({ selectedTutorId: null }) });
    const r = await supertest(appWithLogin((u, cb) => cb(null)))
      .post('/login').send({ email: 'a@b.io', password: 'p' });
    expect(r.body.redirect).toBe('/pick-tutor.html');
  });

  test('auto-assigns avatar to legacy student missing one', async () => {
    const user = makeUser({ avatar: undefined, save: jest.fn().mockResolvedValue() });
    setupPassport({ user });
    await supertest(appWithLogin((u, cb) => cb(null)))
      .post('/login').send({ email: 'a@b.io', password: 'p' });
    expect(user.avatar).toBeDefined();
    expect(user.avatar.dicebearUrl).toMatch(/dicebear/);
  });
});
