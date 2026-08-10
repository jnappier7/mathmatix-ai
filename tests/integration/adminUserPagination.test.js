/**
 * GET /api/admin/users — server-side paging, search, role filter and sort.
 *
 * This endpoint used to be `User.find({})`: every user, every listed field, in
 * one response, with the browser doing the filtering and sorting over the whole
 * array. The dashboard is the only consumer and it renders a <tr> per row, so
 * the page degraded in step with the user count.
 *
 * These run against a real in-memory MongoDB rather than a mocked model,
 * because every assertion here is about what Mongo actually matches — a regex
 * that doesn't hit, a skip/limit off by one, or a role filter that reads `role`
 * instead of `roles[]` all pass a mocked query chain happily.
 */

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => next(),
  ensureNotAuthenticated: (req, _res, next) => next(),
  isAdmin: (req, _res, next) => next(),
  isTeacher: (req, _res, next) => next(),
  isParent: (req, _res, next) => next(),
  isStudent: (req, _res, next) => next(),
  isAuthorizedForLeaderboard: (req, _res, next) => next(),
  handleLogout: (req, _res, next) => next(),
  aiEndpointLimiter: (req, _res, next) => next(),
}));

const User = require('../../models/user');

let mem;
let app;

// Every case here does real database work. Jest's 10s default is tight enough
// on a cold runner that a slow case fails as a timeout — and a timed-out test
// keeps inserting into the next one's collection, so the failure lands
// somewhere other than the cause.
jest.setTimeout(30000);

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());

  app = express();
  app.use(express.json());
  app.use('/api/admin', require('../../routes/admin'));
}, 60000); // first run may download the mongod binary

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

afterEach(async () => {
  await User.deleteMany({});
});

let seq = 0;
async function makeUser({ firstName = 'Test', lastName, role = 'student', roles, email } = {}) {
  seq += 1;
  return User.create({
    firstName,
    lastName: lastName || `User${seq}`,
    username: `user${seq}`,
    email: email || `user${seq}@example.com`,
    passwordHash: 'x'.repeat(20),
    role,
    ...(roles ? { roles } : {}),
  });
}

/**
 * N students, oldest-first, so `newest`/`oldest` ordering is predictable.
 *
 * Inserted through the raw driver rather than User.create() for two reasons,
 * both of which broke this file first time out:
 *
 *   - Speed. A hundred-odd sequential create() round trips blew Jest's 10s
 *     timeout, and a timed-out test doesn't stop its own inserts — they kept
 *     landing during the NEXT test, which then counted 11 users where it had
 *     seeded 5. One insertMany instead of N creates.
 *   - Control of createdAt. The schema sets { timestamps: true }, so Mongoose
 *     overwrites any createdAt handed to create(); the explicit values here
 *     were being silently ignored. The raw driver leaves them alone, which is
 *     what makes date ordering deterministic instead of a race between
 *     documents written in the same millisecond.
 *
 * Bypassing the schema also skips its defaults, so these documents carry a
 * legacy `role` string and no `roles[]` — which anyRole() is meant to match
 * via its fallback, and does.
 */
async function seedStudents(n) {
  const base = Date.UTC(2026, 0, 1);
  const docs = Array.from({ length: n }, (_, i) => ({
    firstName: 'Seed',
    lastName: `Student${String(i).padStart(3, '0')}`,
    username: `seed${i}`,
    email: `seed${i}@example.com`,
    passwordHash: 'x'.repeat(20),
    role: 'student',
    createdAt: new Date(base + i * 60_000),
    updatedAt: new Date(base + i * 60_000),
  }));
  await User.collection.insertMany(docs);
}

describe('GET /api/admin/users — paging', () => {
  test('returns one page, not the whole collection', async () => {
    await seedStudents(120);

    const res = await request(app).get('/api/admin/users?limit=25').expect(200);

    expect(res.body.users).toHaveLength(25);
    expect(res.body.total).toBe(120);
    expect(res.body.totalPages).toBe(5);
    expect(res.body.page).toBe(1);
  });

  test('page 2 continues where page 1 stopped, with no overlap', async () => {
    await seedStudents(30);

    const [p1, p2] = await Promise.all([
      request(app).get('/api/admin/users?limit=10&page=1&sort=name-asc').expect(200),
      request(app).get('/api/admin/users?limit=10&page=2&sort=name-asc').expect(200),
    ]);

    const ids1 = p1.body.users.map((u) => u._id);
    const ids2 = p2.body.users.map((u) => u._id);
    expect(ids2).toHaveLength(10);
    expect(ids1.filter((id) => ids2.includes(id))).toEqual([]);
    expect(p2.body.users[0].lastName).toBe('Student010');
  });

  test('limit is capped so a caller cannot ask for the whole table back', async () => {
    await seedStudents(5);

    const res = await request(app).get('/api/admin/users?limit=99999').expect(200);

    expect(res.body.limit).toBe(200);
  });

  test('a page past the end returns no rows but still reports the true total', async () => {
    await seedStudents(5);

    const res = await request(app).get('/api/admin/users?limit=10&page=9').expect(200);

    expect(res.body.users).toEqual([]);
    expect(res.body.total).toBe(5);
  });
});

describe('GET /api/admin/users — search', () => {
  test('matches on last name, email and username, case-insensitively', async () => {
    await makeUser({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@calc.org' });
    await makeUser({ firstName: 'Alan', lastName: 'Turing', email: 'alan@bletchley.org' });

    const byName = await request(app).get('/api/admin/users?search=lovelace').expect(200);
    expect(byName.body.users.map((u) => u.firstName)).toEqual(['Ada']);

    const byEmail = await request(app).get('/api/admin/users?search=BLETCHLEY').expect(200);
    expect(byEmail.body.users.map((u) => u.firstName)).toEqual(['Alan']);
  });

  test('a "first last" query matches across both name fields', async () => {
    await makeUser({ firstName: 'Ada', lastName: 'Lovelace' });
    await makeUser({ firstName: 'Ada', lastName: 'Byron' });

    const res = await request(app).get('/api/admin/users?search=ada%20lovelace').expect(200);

    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].lastName).toBe('Lovelace');
  });

  test('total reflects the search, not the collection', async () => {
    await seedStudents(40);
    await makeUser({ firstName: 'Ada', lastName: 'Lovelace' });

    const res = await request(app).get('/api/admin/users?search=lovelace').expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.totalPages).toBe(1);
  });

  test('regex metacharacters in the query are matched literally, not compiled', async () => {
    await makeUser({ firstName: 'Ada', lastName: 'Lovelace' });

    // '.*' would match everything if the term were interpolated into a RegExp raw.
    const res = await request(app).get('/api/admin/users?search=.*').expect(200);

    expect(res.body.total).toBe(0);
  });
});

describe('GET /api/admin/users — role filter', () => {
  test('filters on roles HELD, so a multi-role account is not hidden by its active role', async () => {
    // The owner's account shape: acting as admin, but genuinely also a parent.
    await makeUser({ firstName: 'Multi', lastName: 'Role', role: 'admin', roles: ['admin', 'parent'] });
    await makeUser({ firstName: 'Plain', lastName: 'Parent', role: 'parent', roles: ['parent'] });

    const res = await request(app).get('/api/admin/users?role=parent').expect(200);

    // Filtering on the active `role` string would return only Plain Parent.
    expect(res.body.users.map((u) => u.lastName).sort()).toEqual(['Parent', 'Role']);
  });

  test('falls back to the legacy role string for documents with no roles[]', async () => {
    await User.collection.insertOne({
      firstName: 'Legacy',
      lastName: 'Teacher',
      username: 'legacy1',
      email: 'legacy@example.com',
      passwordHash: 'x'.repeat(20),
      role: 'teacher',
    });

    const res = await request(app).get('/api/admin/users?role=teacher').expect(200);

    expect(res.body.users.map((u) => u.lastName)).toEqual(['Teacher']);
  });

  test('an unknown role is ignored rather than returning nothing', async () => {
    await seedStudents(3);

    const res = await request(app).get('/api/admin/users?role=wizard').expect(200);

    expect(res.body.total).toBe(3);
  });
});

describe('GET /api/admin/users — sort', () => {
  test('sorts across the whole directory, not just within a page', async () => {
    await seedStudents(30);

    const res = await request(app).get('/api/admin/users?sort=name-desc&limit=5').expect(200);

    // Client-side sorting of one page would have started at Student029 only by
    // luck; the point is the first page holds the global maximum.
    expect(res.body.users[0].lastName).toBe('Student029');
    expect(res.body.users.map((u) => u.lastName)).toEqual([
      'Student029', 'Student028', 'Student027', 'Student026', 'Student025',
    ]);
  });

  test('an unrecognised sort key falls back to newest instead of erroring', async () => {
    await seedStudents(3);

    const res = await request(app).get('/api/admin/users?sort=; drop table').expect(200);

    expect(res.body.users[0].lastName).toBe('Student002');
  });
});

describe('GET /api/admin/users — role counts', () => {
  test('counts describe the whole directory, not the current page', async () => {
    await seedStudents(60);
    await makeUser({ lastName: 'Teach', role: 'teacher', roles: ['teacher'] });

    const res = await request(app).get('/api/admin/users?limit=10').expect(200);

    expect(res.body.users).toHaveLength(10);
    expect(res.body.counts.total).toBe(61);
    expect(res.body.counts.student).toBe(60);
    expect(res.body.counts.teacher).toBe(1);
  });

  test('counts ignore the active search, so the stat cards stay a system readout', async () => {
    await seedStudents(20);

    const res = await request(app).get('/api/admin/users?search=Student001').expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.counts.student).toBe(20);
  });

  test('a multi-role account is counted under every role it holds', async () => {
    await makeUser({ lastName: 'Both', role: 'admin', roles: ['admin', 'parent'] });

    const res = await request(app).get('/api/admin/users').expect(200);

    expect(res.body.counts.total).toBe(1);
    expect(res.body.counts.admin).toBe(1);
    expect(res.body.counts.parent).toBe(1);
  });
});

describe('GET /api/admin/users/lookup', () => {
  test('returns a slim projection — enough for a picker row, nothing more', async () => {
    await makeUser({ firstName: 'Ada', lastName: 'Lovelace' });

    const res = await request(app).get('/api/admin/users/lookup?role=student').expect(200);

    const user = res.body.users[0];
    expect(user.firstName).toBe('Ada');
    expect(user.email).toBeDefined();
    // Fields the full list projection carries but no <select> reads.
    expect(user.xp).toBeUndefined();
    expect(user.interests).toBeUndefined();
    expect(user.totalActiveTutoringMinutes).toBeUndefined();
  });

  test('"lookup" is routed as a path, never parsed as a user id', async () => {
    const res = await request(app).get('/api/admin/users/lookup').expect(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  test('flags truncation so a picker can admit it is showing a partial list', async () => {
    await seedStudents(12);

    const res = await request(app).get('/api/admin/users/lookup?limit=5').expect(200);

    expect(res.body.users).toHaveLength(5);
    expect(res.body.total).toBe(12);
    expect(res.body.truncated).toBe(true);
  });

  test('does not flag truncation when the whole set fits', async () => {
    await seedStudents(3);

    const res = await request(app).get('/api/admin/users/lookup').expect(200);

    expect(res.body.truncated).toBe(false);
  });

  test('?id= fetches a single user, for the ?user= deep link to an off-page row', async () => {
    const target = await makeUser({ firstName: 'Deep', lastName: 'Link' });
    await seedStudents(80); // target is nowhere near page 1

    const res = await request(app).get(`/api/admin/users/lookup?id=${target._id}`).expect(200);

    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].lastName).toBe('Link');
  });

  test('?id= rejects a malformed id instead of throwing a cast error', async () => {
    await request(app).get('/api/admin/users/lookup?id=not-an-objectid').expect(400);
  });

  test('?id= 404s for an id that does not exist', async () => {
    await request(app).get('/api/admin/users/lookup?id=507f1f77bcf86cd799439011').expect(404);
  });
});
