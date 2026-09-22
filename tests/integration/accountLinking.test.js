/**
 * Parent ↔ child account linking, against a real database.
 *
 * The two link codes travel in opposite directions and look nothing alike:
 *   parent → child   "K7Q2ZP"        made on the Parent Dashboard, the CHILD enters it
 *   child → parent   "MATH-A1B2C3"   shown under Share Progress, the PARENT enters it
 *
 * A family that mixes them up used to get "Invalid, expired, or already used"
 * (child side) or "Invalid student link code" (parent side) — no cause, no
 * next step, and the word "expired" for a code that was never a parent code.
 * These tests pin that every rejection names its real cause, that the codes
 * are matched forgivingly (case, whitespace, the MATH- prefix), and that the
 * happy paths still link both records.
 */

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../../utils/emailService', () => ({
  sendParentalConsentRequest: jest.fn().mockResolvedValue({ success: true }),
  sendParentInvite: jest.fn().mockResolvedValue({ success: true }),
  sendParentUpgradeRequest: jest.fn().mockResolvedValue({ success: true })
}));

const User = require('../../models/user');
const { PARENT_INVITE_TTL_DAYS } = require('../../utils/linkCodes');

let mem;
let app;
let currentUserId;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());

  app = express();
  app.use(express.json());
  app.use(async (req, _res, next) => {
    req.user = await User.findById(currentUserId);
    req.isAuthenticated = () => !!req.user;
    next();
  });
  app.use('/api/parent', require('../../routes/parent'));
  // routes/student.js exports { router, generateUniqueStudentLinkCode }, not the bare router.
  app.use('/api/student', require('../../routes/student').router);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

let seq = 0;
async function makeUser(role, extra = {}) {
  seq += 1;
  return User.create({
    firstName: role === 'parent' ? 'Dana' : 'Kali',
    lastName: `L${seq}`,
    username: `${role}${seq}`,
    email: `${role}${seq}@example.com`,
    passwordHash: 'x'.repeat(20),
    role,
    roles: [role],
    ...extra
  });
}

const daysFromNow = (n) => new Date(Date.now() + n * 86400000);

beforeEach(async () => {
  await User.deleteMany({});
});

describe('POST /api/parent/generate-invite-code', () => {
  test(`a new code lasts ${PARENT_INVITE_TTL_DAYS} days and is returned again while active`, async () => {
    const parent = await makeUser('parent');
    currentUserId = parent._id;

    const first = await supertest(app).post('/api/parent/generate-invite-code').send({});
    expect(first.status).toBe(201);
    expect(first.body.code).toMatch(/^[A-Z0-9]{6}$/);
    const ttlDays = (new Date(first.body.expiresAt) - Date.now()) / 86400000;
    expect(ttlDays).toBeGreaterThan(PARENT_INVITE_TTL_DAYS - 0.1);
    expect(ttlDays).toBeLessThanOrEqual(PARENT_INVITE_TTL_DAYS);

    const again = await supertest(app).post('/api/parent/generate-invite-code').send({});
    expect(again.status).toBe(200);
    expect(again.body.code).toBe(first.body.code);
  });

  test('an expired code is replaced, not handed back', async () => {
    const parent = await makeUser('parent', {
      parentToChildInviteCode: { code: 'OLDOLD', childLinked: false, expiresAt: daysFromNow(-1) }
    });
    currentUserId = parent._id;
    const res = await supertest(app).post('/api/parent/generate-invite-code').send({});
    expect(res.status).toBe(201);
    expect(res.body.code).not.toBe('OLDOLD');
  });
});

describe('POST /api/student/link-to-parent (child enters a parent code)', () => {
  test('THE SUPPORT CASE: a Share Progress code in the parent-code box names the mix-up, not "expired"', async () => {
    const student = await makeUser('student', {
      studentToParentLinkCode: { code: 'MATH-A1B2C3', parentLinked: false }
    });
    currentUserId = student._id;

    const res = await supertest(app).post('/api/student/link-to-parent').send({ parentInviteCode: 'MATH-A1B2C3' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('student_code');
    expect(res.body.message).toMatch(/Share Progress/);
    expect(res.body.message).not.toMatch(/expired/i);
  });

  test('an expired parent code says expired, with the parent\'s name and the fix', async () => {
    await makeUser('parent', {
      parentToChildInviteCode: { code: 'K7Q2ZP', childLinked: false, expiresAt: daysFromNow(-2) }
    });
    const student = await makeUser('student');
    currentUserId = student._id;

    const res = await supertest(app).post('/api/student/link-to-parent').send({ parentInviteCode: 'K7Q2ZP' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('expired');
    expect(res.body.message).toMatch(/Dana/);
    expect(res.body.message).toMatch(/Generate Invite Code/);
  });

  test('a spent parent code says used', async () => {
    await makeUser('parent', {
      parentToChildInviteCode: { code: 'K7Q2ZP', childLinked: true, expiresAt: daysFromNow(10) }
    });
    const student = await makeUser('student');
    currentUserId = student._id;

    const res = await supertest(app).post('/api/student/link-to-parent').send({ parentInviteCode: 'K7Q2ZP' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('used');
  });

  test('an unknown code is not_found', async () => {
    const student = await makeUser('student');
    currentUserId = student._id;
    const res = await supertest(app).post('/api/student/link-to-parent').send({ parentInviteCode: 'NOPE99' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('not_found');
  });

  test('a code held by a non-parent account is not honoured', async () => {
    // A student account carrying a parentToChildInviteCode must not be linkable as a parent.
    await makeUser('student', {
      parentToChildInviteCode: { code: 'K7Q2ZP', childLinked: false, expiresAt: daysFromNow(10) }
    });
    const student = await makeUser('student');
    currentUserId = student._id;
    const res = await supertest(app).post('/api/student/link-to-parent').send({ parentInviteCode: 'K7Q2ZP' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('not_found');
  });

  test('a valid code links both records, case- and whitespace-insensitively, and consumes the code', async () => {
    const parent = await makeUser('parent', {
      parentToChildInviteCode: { code: 'K7Q2ZP', childLinked: false, expiresAt: daysFromNow(10) }
    });
    const student = await makeUser('student');
    currentUserId = student._id;

    const res = await supertest(app).post('/api/student/link-to-parent').send({ parentInviteCode: ' k7q2 zp ' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Linking is not consent (see linkToParentConsent.test.js).
    expect(res.body.consentPending).toBe(true);

    const p = await User.findById(parent._id);
    const s = await User.findById(student._id);
    expect(p.children.map(String)).toContain(String(student._id));
    expect(s.parentIds.map(String)).toContain(String(parent._id));
    expect(p.parentToChildInviteCode.childLinked).toBe(true);
    expect(s.hasParentalConsent).not.toBe(true);

    // Re-using it now reads "already linked", not "used".
    const again = await supertest(app).post('/api/student/link-to-parent').send({ parentInviteCode: 'K7Q2ZP' });
    expect(again.status).toBe(400);
    expect(again.body.reason).toBe('already_linked');
  });

  test('a multi-role account that HOLDS parent is found even when its active role is not parent', async () => {
    await makeUser('admin', {
      roles: ['admin', 'parent'],
      parentToChildInviteCode: { code: 'K7Q2ZP', childLinked: false, expiresAt: daysFromNow(10) }
    });
    const student = await makeUser('student');
    currentUserId = student._id;
    const res = await supertest(app).post('/api/student/link-to-parent').send({ parentInviteCode: 'K7Q2ZP' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/parent/link-to-student (parent enters a child code)', () => {
  test('accepts the code however the parent typed it: lowercase, no prefix, stray spaces', async () => {
    for (const typed of ['MATH-A1B2C3', 'math-a1b2c3', 'a1b2c3', ' MATH A1B2C3 ']) {
      await User.deleteMany({});
      const student = await makeUser('student', {
        studentToParentLinkCode: { code: 'MATH-A1B2C3', parentLinked: false }
      });
      const parent = await makeUser('parent');
      currentUserId = parent._id;

      const res = await supertest(app).post('/api/parent/link-to-student').send({ studentLinkCode: typed });
      expect([typed, res.status]).toEqual([typed, 200]);

      const p = await User.findById(parent._id);
      const s = await User.findById(student._id);
      expect(p.children.map(String)).toContain(String(student._id));
      expect(s.parentIds.map(String)).toContain(String(parent._id));
      expect(s.studentToParentLinkCode.parentLinked).toBe(true);
    }
  });

  test('THE MIRROR CASE: a parent pasting their own invite code is told it goes the other way', async () => {
    const parent = await makeUser('parent', {
      parentToChildInviteCode: { code: 'K7Q2ZP', childLinked: false, expiresAt: daysFromNow(10) }
    });
    currentUserId = parent._id;
    const res = await supertest(app).post('/api/parent/link-to-student').send({ studentLinkCode: 'k7q2zp' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('own_invite_code');
    expect(res.body.message).toMatch(/Share Progress/);
  });

  test('an unknown code says what the code looks like and where the child finds it', async () => {
    const parent = await makeUser('parent');
    currentUserId = parent._id;
    const res = await supertest(app).post('/api/parent/link-to-student').send({ studentLinkCode: 'MATH-FFFFFF' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('not_found');
    expect(res.body.message).toMatch(/MATH-A1B2C3/);
  });

  test('a code this parent already used reads already_linked; one another parent used reads used', async () => {
    const student = await makeUser('student', {
      studentToParentLinkCode: { code: 'MATH-A1B2C3', parentLinked: true }
    });
    const linked = await makeUser('parent', { children: [student._id] });
    const other = await makeUser('parent');

    currentUserId = linked._id;
    let res = await supertest(app).post('/api/parent/link-to-student').send({ studentLinkCode: 'MATH-A1B2C3' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('already_linked');

    currentUserId = other._id;
    res = await supertest(app).post('/api/parent/link-to-student').send({ studentLinkCode: 'MATH-A1B2C3' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('used');
  });

  test('a code on an account that does not hold student is refused', async () => {
    await makeUser('teacher', {
      studentToParentLinkCode: { code: 'MATH-A1B2C3', parentLinked: false }
    });
    const parent = await makeUser('parent');
    currentUserId = parent._id;
    const res = await supertest(app).post('/api/parent/link-to-student').send({ studentLinkCode: 'MATH-A1B2C3' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('not_student');
  });
});
