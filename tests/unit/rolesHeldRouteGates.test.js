// tests/unit/rolesHeldRouteGates.test.js
//
// Route-level gates that decide access, exercised end-to-end through supertest.
//
// Each of these read `req.user.role` — the ACTIVE role, i.e. whichever
// dashboard the account currently has open — where the question being asked is
// "what is this account allowed to do", which CLAUDE.md §12 says must be
// answered from roles[] instead. On the active role, a multi-role account's
// permissions moved every time it switched views.
//
// The cases are grouped by direction, because these gates fail in BOTH:
//   • LOCKOUT — the account loses something it holds (403 on its own data).
//   • ESCALATION — the account gains something, because the comparison ran in
//     the DENY direction and simply stopped matching.
//
// Every "roles held" case sets `role` to a value the old comparison decides
// differently on, so it fails against the old code.

jest.mock('../../utils/logger', () => {
  const base = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  return { ...base, child: () => base };
});

// The sweep endpoint calls straight into Mongo once past the gate; what is
// under test here is the gate, so the work behind it is stubbed out.
jest.mock('../../services/sessionService', () => ({
  endSession: jest.fn(),
  recordHeartbeat: jest.fn(),
  saveMasteryProgress: jest.fn(),
  cleanupStaleSessions: jest.fn().mockResolvedValue(0),
  destroyIdleExpressSessions: jest.fn().mockResolvedValue(0),
}));

jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => next(),
  isAdmin: (req, _res, next) => next(),
  isTeacher: (req, _res, next) => next(),
  isStudent: (req, _res, next) => next(),
  isParent: (req, _res, next) => next(),
  aiEndpointLimiter: (req, _res, next) => next(),
}));

const request = require('supertest');
const express = require('express');

function makeApp(mountPath, router, user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    req.isAuthenticated = () => !!user;
    next();
  });
  app.use(mountPath, router);
  return app;
}

// ---------------------------------------------------------------------------
// Admin-only gates: routes/support.js, routes/feedback.js, routes/session.js,
// routes/voiceTutor.js
//
// All four spelled the gate `req.user.role !== 'admin'`. An admin who also
// holds teacher or parent lost the ticket queue, the feedback list, the stale-
// session sweep and the voice metrics the moment they opened another dashboard.
// ---------------------------------------------------------------------------
describe('admin-only route gates read roles held', () => {
  const ADMIN_ELSEWHERE = { _id: 'a1', role: 'teacher', roles: ['admin', 'teacher'] };
  const PLAIN_TEACHER = { _id: 't1', role: 'teacher', roles: ['teacher'] };

  test('the fixture really would have failed the old comparison', () => {
    expect(ADMIN_ELSEWHERE.role !== 'admin').toBe(true); // old gate → 403
  });

  test('voice metrics answer an admin who is viewing the teacher dashboard', async () => {
    const app = makeApp('/api/voice-tutor', require('../../routes/voiceTutor'), ADMIN_ELSEWHERE);
    const res = await request(app).get('/api/voice-tutor/metrics');
    expect(res.status).toBe(200);
  });

  test('voice metrics still refuse an account that does not hold admin', async () => {
    const app = makeApp('/api/voice-tutor', require('../../routes/voiceTutor'), PLAIN_TEACHER);
    const res = await request(app).get('/api/voice-tutor/metrics');
    expect(res.status).toBe(403);
  });

  test('the stale-session sweep answers an admin viewing the teacher dashboard', async () => {
    const app = makeApp('/api/session', require('../../routes/session'), ADMIN_ELSEWHERE);
    const res = await request(app).post('/api/session/cleanup-stale').send({});
    expect(res.status).not.toBe(403);
  });

  test('the stale-session sweep still refuses a plain teacher', async () => {
    const app = makeApp('/api/session', require('../../routes/session'), PLAIN_TEACHER);
    const res = await request(app).post('/api/session/cleanup-stale').send({});
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// routes/gradeWork.js — the escalation direction
// ---------------------------------------------------------------------------
describe('grade-work result access', () => {
  const OTHERS_RESULT = {
    userId: { toString: () => 'someone-else' },
    toStudentView: () => ({ id: 'r1', redacted: false }),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../models/gradingResult', () => ({
      findById: jest.fn().mockResolvedValue(OTHERS_RESULT),
      find: jest.fn(),
    }));
  });

  afterEach(() => jest.dontMock('../../models/gradingResult'));

  function gradeWorkApp(user) {
    return makeApp('/api/grade-work', require('../../routes/gradeWork'), user);
  }

  test('ESCALATION: a student who switched to their parent view cannot read another student’s result', async () => {
    // The guard is `... && req.user.role === 'student'` — it runs in the DENY
    // direction, so failing to recognise a student did not lock anyone out, it
    // let them through. A student who also holds parent stopped matching the
    // moment they opened the parent dashboard and could read any result by id.
    const student = { _id: 'me', role: 'parent', roles: ['student', 'parent'] };
    expect(student.role === 'student').toBe(false); // the old comparison, explicit

    const res = await request(gradeWorkApp(student)).get('/api/grade-work/r1');
    expect(res.status).toBe(403);
  });

  test('a plain student is still refused someone else’s result', async () => {
    const res = await request(gradeWorkApp({ _id: 'me', role: 'student', roles: ['student'] }))
      .get('/api/grade-work/r1');
    expect(res.status).toBe(403);
  });

  test('a teacher is still allowed to read a student’s result', async () => {
    // Narrowing the escape hatch must not close the legitimate one.
    const res = await request(gradeWorkApp({ _id: 't1', role: 'teacher', roles: ['teacher'] }))
      .get('/api/grade-work/r1');
    expect(res.status).toBe(200);
  });

  test('LOCKOUT: a teacher viewing the parent dashboard may still review work', async () => {
    const res = await request(gradeWorkApp({ _id: 't1', role: 'parent', roles: ['teacher', 'parent'] }))
      .post('/api/grade-work/r1/review')
      .send({ comment: 'nice work' });
    expect(res.status).not.toBe(403);
  });

  test('a parent who holds neither teacher nor admin still cannot review work', async () => {
    const res = await request(gradeWorkApp({ _id: 'p1', role: 'parent', roles: ['parent'] }))
      .post('/api/grade-work/r1/review')
      .send({ comment: 'nice work' });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// routes/teacher.js — /my-calculator-access
//
// The second of the three calculator-access endpoints. #1540 fixed the one in
// config/routes.js; /api/student/my-calculator-access was already correct
// behind isStudent. This one was the holdout, and it fails OPEN: a student who
// stops reading as a student is handed 'always' and escapes their teacher's
// classAISettings entirely.
// ---------------------------------------------------------------------------
describe('teacher /my-calculator-access', () => {
  const TEACHER_ID = 'teacher-1';

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../models/user', () => ({
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          firstName: 'Ms', lastName: 'Rivera',
          classAISettings: { calculatorAccess: 'never', calculatorNote: 'Mental math week' },
        }),
      }),
      find: jest.fn(),
      findOne: jest.fn(),
      updateMany: jest.fn(),
      countDocuments: jest.fn(),
    }));
  });

  afterEach(() => jest.dontMock('../../models/user'));

  function calcApp(user) {
    return makeApp('/api/teacher', require('../../routes/teacher'), user);
  }

  test('ESCALATION: a student who also holds parent stays under their teacher’s restriction', async () => {
    const student = { _id: 's1', role: 'parent', roles: ['student', 'parent'], teacherId: TEACHER_ID };
    expect(student.role === 'student').toBe(false); // the old comparison, explicit

    const res = await request(calcApp(student)).get('/api/teacher/my-calculator-access');
    expect(res.status).toBe(200);
    expect(res.body.calculatorAccess).toBe('never');
  });

  test('a plain student is still restricted', async () => {
    const student = { _id: 's1', role: 'student', roles: ['student'], teacherId: TEACHER_ID };
    const res = await request(calcApp(student)).get('/api/teacher/my-calculator-access');
    expect(res.body.calculatorAccess).toBe('never');
  });

  test('a genuine non-student still gets unrestricted access', async () => {
    // Widening the student test must not restrict teachers and parents, who
    // have no teacherId and legitimately fall through to 'always'.
    const res = await request(calcApp({ _id: 'p1', role: 'parent', roles: ['parent'] }))
      .get('/api/teacher/my-calculator-access');
    expect(res.body.calculatorAccess).toBe('always');
  });
});
