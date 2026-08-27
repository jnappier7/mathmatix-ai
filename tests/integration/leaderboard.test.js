// tests/integration/leaderboard.test.js
// Integration test for routes/leaderboard.js using supertest.
//
// Verifies role-based authorization, FERPA directory-info opt-out handling,
// and the response shape — without touching MongoDB.

jest.mock('../../utils/logger', () => {
  const stub = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

jest.mock('../../utils/demoClone', () => ({
  cleanupDemoClone: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../models/user', () => {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([])
  };
  return { find: jest.fn(() => chain), __chain: chain };
});

jest.mock('../../utils/ferpaCompliance', () => {
  const optedOut = new Set();
  return {
    hasOptedOutOfDirectoryInfo: (user) => optedOut.has(String(user._id || user.firstName)),
    __optedOut: optedOut
  };
});

const express = require('express');
const supertest = require('supertest');
const User = require('../../models/user');
const ferpa = require('../../utils/ferpaCompliance');
const findChain = User.__chain;
const optedOutSet = ferpa.__optedOut;
const leaderboardRouter = require('../../routes/leaderboard');

function buildApp(currentUser) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = () => Boolean(currentUser);
    req.user = currentUser || null;
    next();
  });
  app.use('/api/leaderboard', leaderboardRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  optedOutSet.clear();
  findChain.sort.mockReturnThis();
  findChain.select.mockReturnThis();
  findChain.limit.mockReturnThis();
  findChain.lean.mockResolvedValue([]);
});

describe('GET /api/leaderboard', () => {
  test('rejects unauthenticated requests with 403', async () => {
    const app = buildApp(null);
    const res = await supertest(app).get('/api/leaderboard');
    expect(res.status).toBe(403);
  });

  test('admin sees a global student leaderboard (no teacherId filter)', async () => {
    findChain.lean.mockResolvedValue([
      { _id: 's1', firstName: 'Sam', lastName: 'Lee', level: 5, xp: 200 },
      { _id: 's2', firstName: 'Alex', lastName: 'Doe', level: 4, xp: 150 }
    ]);
    const app = buildApp({ _id: 'admin-1', role: 'admin' });

    const res = await supertest(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ name: 'Sam L.', level: 5, xp: 200 });

    const filter = User.find.mock.calls[0][0];
    expect(filter.teacherId).toBeUndefined();
  });

  test('teacher sees only students linked to them', async () => {
    findChain.lean.mockResolvedValue([
      { _id: 's1', firstName: 'Sam', lastName: 'Lee', level: 3, xp: 100 }
    ]);
    const app = buildApp({ _id: 'teacher-1', role: 'teacher' });

    await supertest(app).get('/api/leaderboard');
    expect(User.find).toHaveBeenCalledWith(expect.objectContaining({ teacherId: 'teacher-1' }));
  });

  test('student with assigned teacher sees only their classmates', async () => {
    findChain.lean.mockResolvedValue([]);
    const app = buildApp({ _id: 's1', role: 'student', teacherId: 'teacher-7' });

    await supertest(app).get('/api/leaderboard');
    expect(User.find).toHaveBeenCalledWith(expect.objectContaining({ teacherId: 'teacher-7' }));
  });

  test('FERPA opt-out students appear as "Student" with no level', async () => {
    findChain.lean.mockResolvedValue([
      { _id: 's-opt', firstName: 'Hidden', lastName: 'Name', level: 7, xp: 300 },
      { _id: 's-show', firstName: 'Public', lastName: 'Person', level: 6, xp: 250 }
    ]);
    optedOutSet.add('s-opt');

    const app = buildApp({ _id: 'admin-1', role: 'admin' });
    const res = await supertest(app).get('/api/leaderboard');

    expect(res.body[0]).toMatchObject({ name: 'Student', xp: 300 });
    expect(res.body[0].level).toBeUndefined();
    expect(res.body[1].name).toBe('Public P.');
  });

  test('returns 500 on DB failure', async () => {
    findChain.lean.mockRejectedValue(new Error('db down'));
    const app = buildApp({ _id: 'admin-1', role: 'admin' });
    const res = await supertest(app).get('/api/leaderboard');
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Server error/);
  });

  test('queries exclude demo and demo-clone users', async () => {
    const app = buildApp({ _id: 'admin-1', role: 'admin' });
    await supertest(app).get('/api/leaderboard');
    const filter = User.find.mock.calls[0][0];
    expect(filter.isDemo).toEqual({ $ne: true });
    expect(filter.isDemoClone).toEqual({ $ne: true });
  });
});

describe('leaderboard scope follows roles HELD', () => {
  // This chain NARROWS the board, so failing to recognise a viewer widens it.
  // On `req.user.role` — the ACTIVE role, whichever dashboard the account has
  // open (CLAUDE.md §12) — a teacher who also holds parent matched neither
  // branch while on the parent dashboard and fell through to the unscoped
  // global board: every student on the platform, by name and level, to someone
  // entitled only to their own class.

  test('a teacher viewing the parent dashboard still sees only their own class', async () => {
    const viewer = { _id: 'teacher-1', role: 'parent', roles: ['teacher', 'parent'] };
    expect(viewer.role === 'teacher').toBe(false); // the old comparison, explicit

    await supertest(buildApp(viewer)).get('/api/leaderboard');
    expect(User.find).toHaveBeenCalledWith(expect.objectContaining({ teacherId: 'teacher-1' }));
  });

  test('a student viewing the parent dashboard still sees only their classmates', async () => {
    const viewer = { _id: 's1', role: 'parent', roles: ['student', 'parent'], teacherId: 'teacher-7' };
    await supertest(buildApp(viewer)).get('/api/leaderboard');
    expect(User.find).toHaveBeenCalledWith(expect.objectContaining({ teacherId: 'teacher-7' }));
  });

  test('teacher scope still wins over student scope for an account holding both', async () => {
    // Order is load-bearing and matches the old chain: a teacher who is also
    // enrolled as a student sees their CLASS, not their own classmates.
    const viewer = { _id: 'teacher-1', role: 'student', roles: ['teacher', 'student'], teacherId: 'teacher-9' };
    await supertest(buildApp(viewer)).get('/api/leaderboard');
    expect(User.find).toHaveBeenCalledWith(expect.objectContaining({ teacherId: 'teacher-1' }));
  });

  test('a plain parent still gets the global board', async () => {
    // Narrowing for teachers must not start narrowing for parents and admins,
    // who match no branch on purpose.
    await supertest(buildApp({ _id: 'p1', role: 'parent', roles: ['parent'] })).get('/api/leaderboard');
    expect(User.find.mock.calls[0][0].teacherId).toBeUndefined();
  });

  test('an admin who also holds teacher is scoped to their class', async () => {
    // A consequence worth stating: holding teacher now narrows the board even
    // for an admin. That is the rule the chain has always meant to express —
    // teacher scope first — and it only ever leaked because `role` said admin.
    const viewer = { _id: 'a1', role: 'admin', roles: ['admin', 'teacher'] };
    await supertest(buildApp(viewer)).get('/api/leaderboard');
    expect(User.find).toHaveBeenCalledWith(expect.objectContaining({ teacherId: 'a1' }));
  });
});
