// tests/unit/transcriptScoping.test.js
// Unit tests for roster-scoping on student conversation endpoints.
//
// Covers:
//   GET /api/teacher/students/:studentId/conversations
//     - denies when the student is NOT on this teacher's roster
//     - allows when the student is on the roster via enrollment code
//       (not just direct teacherId assignment)
//
//   GET /api/admin/students/:studentId/conversations
//     - returns 404 when the target userId does not belong to a student
//     - returns transcripts when target IS a student

// ---- Mock everything the route files pull in at load time. ----

jest.mock('../../models/user', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../../models/conversation', () => {
  const chain = () => {
    const c = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
      then: (resolve) => Promise.resolve([]).then(resolve),
    };
    return c;
  };
  return {
    find: jest.fn(() => chain()),
    findOne: jest.fn(() => chain()),
    findById: jest.fn(() => chain()),
    findByIdAndUpdate: jest.fn(() => chain()),
    findOneAndUpdate: jest.fn(() => chain()),
  };
});

jest.mock('../../models/enrollmentCode', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../../models/screenerSession', () => ({ find: jest.fn(), findOne: jest.fn() }));
jest.mock('../../models/waitlist', () => ({ find: jest.fn(), findOne: jest.fn() }));
jest.mock('../../models/skill', () => ({ find: jest.fn(), findOne: jest.fn() }));

jest.mock('../../utils/activitySummarizer', () => ({
  generateLiveSummary: jest.fn(),
  detectStruggle: jest.fn().mockReturnValue({ isStruggling: false, strugglingWith: null, severity: null }),
  detectTopic: jest.fn().mockReturnValue(null),
  calculateProblemStats: jest.fn().mockReturnValue({ problemsAttempted: 0, problemsCorrect: 0 }),
}));

jest.mock('../../services/sessionService', () => ({
  cleanupStaleSessions: jest.fn().mockResolvedValue(),
}));

jest.mock('../../utils/interventionAlerts', () => ({
  computeRiskScore: jest.fn(),
  getInterventionTier: jest.fn(),
  generateRecommendation: jest.fn(),
}));

jest.mock('../../utils/openaiClient', () => ({
  callLLMStream: jest.fn(),
}));

jest.mock('../../utils/emailService', () => ({
  sendWelcomeEmail: jest.fn(),
}));

jest.mock('../../services/userService', () => ({
  getStudentIdsForTeacher: jest.fn(),
}));

// Consent utility: use real implementation. checkConsent is pure — it reads
// privacyConsent/hasParentalConsent off the passed user object and returns
// { hasConsent, pathway, status, details }. No mocking needed.

// Middleware: pass-through mocks. The routes mount isTeacher / isAdmin at the
// handler level; we inject the authenticated user via a test middleware below.
jest.mock('../../middleware/auth', () => ({
  isTeacher: (req, res, next) => next(),
  isAdmin: (req, res, next) => next(),
  isAuthenticated: (req, res, next) => next(),
  isParent: (req, res, next) => next(),
  isStudent: (req, res, next) => next(),
}));

// logRecordAccess is a factory that returns a middleware. The pass-through
// variant keeps tests free of EducationRecordAccessLog model wiring.
jest.mock('../../middleware/ferpaAccessLog', () => ({
  logRecordAccess: () => (req, res, next) => next(),
  logAccess: jest.fn(),
}));

jest.mock('../../utils/logger', () => {
  const base = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  return { ...base, child: () => base };
});

// Prevent the CSV/item-bank importer from being loaded (it pulls models we
// don't care about for these tests).
jest.mock('../../routes/adminImport', () => {
  const express = require('express');
  return express.Router();
});

const request = require('supertest');
const express = require('express');

const User = require('../../models/user');
const Conversation = require('../../models/conversation');
const { getStudentIdsForTeacher } = require('../../services/userService');

const teacherRoutes = require('../../routes/teacher');
const adminRoutes = require('../../routes/admin');

function makeConversationChain(result) {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
  return chain;
}

function makeTeacherApp(teacherUser) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = teacherUser;
    req.isAuthenticated = () => true;
    next();
  });
  app.use('/api/teacher', teacherRoutes);
  return app;
}

function makeAdminApp(adminUser) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = adminUser;
    req.isAuthenticated = () => true;
    next();
  });
  app.use('/api/admin', adminRoutes);
  return app;
}

describe('Teacher transcript roster scoping', () => {
  const TEACHER_ID = '650000000000000000000001';
  const STUDENT_ID = '650000000000000000000002';
  const OTHER_STUDENT_ID = '650000000000000000000099';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('denies access when the student is not on the teacher roster', async () => {
    getStudentIdsForTeacher.mockResolvedValue([]);

    const app = makeTeacherApp({ _id: TEACHER_ID, role: 'teacher' });
    const res = await request(app).get(`/api/teacher/students/${OTHER_STUDENT_ID}/conversations`);

    expect(res.status).toBe(403);
    expect(getStudentIdsForTeacher).toHaveBeenCalledWith(TEACHER_ID);
    expect(Conversation.find).not.toHaveBeenCalled();
  });

  test('allows access when the student is on the teacher roster (e.g. via enrollment code)', async () => {
    // The key assertion: the route must accept roster membership established
    // via getStudentIdsForTeacher, which covers both direct teacherId AND
    // enrollment-code assignment. The previous implementation only matched
    // direct teacherId and denied code-enrolled students.
    getStudentIdsForTeacher.mockResolvedValue([STUDENT_ID]);
    User.findById.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: STUDENT_ID,
        hasParentalConsent: true,
        privacyConsent: { status: 'active', consentPathway: 'school_dpa' },
      }),
    });
    const fakeConversations = [
      { _id: 'c1', summary: 'Worked on linear equations', activeMinutes: 12, startDate: new Date('2026-04-20') },
    ];
    Conversation.find.mockReturnValueOnce(makeConversationChain(fakeConversations));

    const app = makeTeacherApp({ _id: TEACHER_ID, role: 'teacher' });
    const res = await request(app).get(`/api/teacher/students/${STUDENT_ID}/conversations`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(Conversation.find).toHaveBeenCalledWith({ userId: STUDENT_ID });
  });

  test('blocks access when the student has revoked consent', async () => {
    getStudentIdsForTeacher.mockResolvedValue([STUDENT_ID]);
    User.findById.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: STUDENT_ID,
        hasParentalConsent: false,
        privacyConsent: { status: 'revoked', consentPathway: 'individual_parent' },
      }),
    });

    const app = makeTeacherApp({ _id: TEACHER_ID, role: 'teacher' });
    const res = await request(app).get(`/api/teacher/students/${STUDENT_ID}/conversations`);

    expect(res.status).toBe(403);
    expect(res.body.consentStatus.status).toBe('revoked');
    expect(Conversation.find).not.toHaveBeenCalled();
  });
});

describe('Teacher transcript detail endpoint', () => {
  const TEACHER_ID = '650000000000000000000001';
  const STUDENT_ID = '650000000000000000000002';
  const CONVO_ID = '650000000000000000000010';
  const OTHER_STUDENT_ID = '650000000000000000000099';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockActiveStudent() {
    User.findById.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: STUDENT_ID,
        firstName: 'Ada',
        lastName: 'Lovelace',
        username: 'ada',
        hasParentalConsent: true,
        privacyConsent: { status: 'active', consentPathway: 'school_dpa' },
      }),
    });
  }

  test('denies when the student is not on the teacher roster', async () => {
    getStudentIdsForTeacher.mockResolvedValue([]);

    const app = makeTeacherApp({ _id: TEACHER_ID, role: 'teacher' });
    const res = await request(app).get(
      `/api/teacher/students/${OTHER_STUDENT_ID}/conversations/${CONVO_ID}`
    );

    expect(res.status).toBe(403);
    expect(Conversation.findOne).not.toHaveBeenCalled();
  });

  test('returns transcript payload with messages and reasoningTrace normalized', async () => {
    getStudentIdsForTeacher.mockResolvedValue([STUDENT_ID]);
    mockActiveStudent();

    const fakeConvo = {
      _id: CONVO_ID,
      startDate: new Date('2026-04-20T10:00:00Z'),
      lastActivity: new Date('2026-04-20T10:15:00Z'),
      activeMinutes: 15,
      conversationName: 'Linear equations',
      topic: 'Linear Equations',
      topicEmoji: '📐',
      conversationType: 'general',
      messages: [
        { role: 'user', content: 'help me with 4x-5=22', timestamp: new Date('2026-04-20T10:00:05Z') },
        { role: 'assistant', content: 'show me what you tried', timestamp: new Date('2026-04-20T10:00:09Z') },
      ],
      // reasoningTrace intentionally missing — the endpoint must normalize to [].
    };
    Conversation.findOne.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(fakeConvo),
    });

    const app = makeTeacherApp({ _id: TEACHER_ID, role: 'teacher' });
    const res = await request(app).get(
      `/api/teacher/students/${STUDENT_ID}/conversations/${CONVO_ID}`
    );

    expect(res.status).toBe(200);
    expect(res.body.student).toEqual(
      expect.objectContaining({ firstName: 'Ada', lastName: 'Lovelace' })
    );
    expect(res.body.conversation.messages).toHaveLength(2);
    expect(res.body.conversation.reasoningTrace).toEqual([]);
    expect(Conversation.findOne).toHaveBeenCalledWith({ _id: CONVO_ID, userId: STUDENT_ID });
  });

  test('returns 404 when conversation does not belong to the student', async () => {
    getStudentIdsForTeacher.mockResolvedValue([STUDENT_ID]);
    mockActiveStudent();
    Conversation.findOne.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });

    const app = makeTeacherApp({ _id: TEACHER_ID, role: 'teacher' });
    const res = await request(app).get(
      `/api/teacher/students/${STUDENT_ID}/conversations/${CONVO_ID}`
    );

    expect(res.status).toBe(404);
  });

  test('blocks transcript fetch when consent is revoked', async () => {
    getStudentIdsForTeacher.mockResolvedValue([STUDENT_ID]);
    User.findById.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: STUDENT_ID,
        hasParentalConsent: false,
        privacyConsent: { status: 'revoked', consentPathway: 'individual_parent' },
      }),
    });

    const app = makeTeacherApp({ _id: TEACHER_ID, role: 'teacher' });
    const res = await request(app).get(
      `/api/teacher/students/${STUDENT_ID}/conversations/${CONVO_ID}`
    );

    expect(res.status).toBe(403);
    expect(Conversation.findOne).not.toHaveBeenCalled();
  });
});

describe('Admin transcript detail endpoint', () => {
  const ADMIN_ID = '650000000000000000000100';
  const STUDENT_ID = '650000000000000000000002';
  const CONVO_ID = '650000000000000000000010';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects when target is not a student', async () => {
    User.findOne.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue(null),
    });

    const app = makeAdminApp({ _id: ADMIN_ID, role: 'admin' });
    const res = await request(app).get(
      `/api/admin/students/${STUDENT_ID}/conversations/${CONVO_ID}`
    );

    expect(res.status).toBe(404);
    expect(Conversation.findOne).not.toHaveBeenCalled();
  });

  test('returns transcript for a student with active consent', async () => {
    User.findOne.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: STUDENT_ID,
        firstName: 'Ada',
        lastName: 'Lovelace',
        username: 'ada',
        hasParentalConsent: true,
        privacyConsent: { status: 'active', consentPathway: 'school_dpa' },
      }),
    });
    Conversation.findOne.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        _id: CONVO_ID,
        messages: [{ role: 'user', content: 'hi', timestamp: new Date() }],
        reasoningTrace: [{ turn: 0, state: 'LEVEL_0_COLD', action: 'ASK_WHAT_TRIED' }],
      }),
    });

    const app = makeAdminApp({ _id: ADMIN_ID, role: 'admin' });
    const res = await request(app).get(
      `/api/admin/students/${STUDENT_ID}/conversations/${CONVO_ID}`
    );

    expect(res.status).toBe(200);
    expect(res.body.conversation.reasoningTrace).toHaveLength(1);
    expect(res.body.conversation.messages).toHaveLength(1);
  });
});

describe('Admin transcript endpoint student-only gate', () => {
  const ADMIN_ID = '650000000000000000000100';
  const STUDENT_ID = '650000000000000000000002';
  const TEACHER_ID = '650000000000000000000001';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 404 when target userId is not a student', async () => {
    // e.g. admin attempts to dump another teacher's or admin's conversations.
    User.findOne.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue(null),
    });

    const app = makeAdminApp({ _id: ADMIN_ID, role: 'admin' });
    const res = await request(app).get(`/api/admin/students/${TEACHER_ID}/conversations`);

    expect(res.status).toBe(404);
    expect(User.findOne).toHaveBeenCalledWith(
      { _id: TEACHER_ID, role: 'student' },
      '_id privacyConsent hasParentalConsent'
    );
    expect(Conversation.find).not.toHaveBeenCalled();
  });

  test('returns transcripts when target IS a student with active consent', async () => {
    User.findOne.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: STUDENT_ID,
        hasParentalConsent: true,
        privacyConsent: { status: 'active', consentPathway: 'school_dpa' },
      }),
    });
    const fakeConversations = [
      { _id: 'c2', summary: 'Factoring practice', activeMinutes: 8, startDate: new Date('2026-04-21') },
    ];
    Conversation.find.mockReturnValueOnce(makeConversationChain(fakeConversations));

    const app = makeAdminApp({ _id: ADMIN_ID, role: 'admin' });
    const res = await request(app).get(`/api/admin/students/${STUDENT_ID}/conversations`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(Conversation.find).toHaveBeenCalledWith({ userId: STUDENT_ID });
  });

  test('blocks access when the student has revoked consent', async () => {
    User.findOne.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: STUDENT_ID,
        hasParentalConsent: false,
        privacyConsent: { status: 'revoked', consentPathway: 'school_dpa' },
      }),
    });

    const app = makeAdminApp({ _id: ADMIN_ID, role: 'admin' });
    const res = await request(app).get(`/api/admin/students/${STUDENT_ID}/conversations`);

    expect(res.status).toBe(403);
    expect(res.body.consentStatus.status).toBe('revoked');
    expect(Conversation.find).not.toHaveBeenCalled();
  });
});
