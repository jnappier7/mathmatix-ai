// tests/unit/ferpaAccessLog.test.js
// Unit tests for FERPA education-record access logging middleware

jest.mock('../../utils/logger', () => ({
  warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

jest.mock('../../models/educationRecordAccessLog', () => ({
  create: jest.fn().mockResolvedValue({ catch: () => undefined })
}));

const EducationRecordAccessLog = require('../../models/educationRecordAccessLog');
const { logRecordAccess, logAccess } = require('../../middleware/ferpaAccessLog');

function makeReqRes({
  user = { _id: 'teacher-1', role: 'teacher' },
  studentId = 'student-1',
  method = 'GET',
  baseUrl = '/api/students',
  routePath = '/:studentId/iep',
  ip = '10.0.0.1',
  ua = 'jest-ua'
} = {}) {
  const handlers = {};
  const res = {
    statusCode: 200,
    on: (evt, cb) => { handlers[evt] = cb; },
    finish: () => handlers.finish && handlers.finish()
  };
  const req = {
    user,
    method,
    baseUrl,
    path: '/iep',
    route: { path: routePath },
    params: { studentId },
    body: {},
    ip,
    get: () => ua
  };
  return { req, res };
}

beforeEach(() => {
  jest.clearAllMocks();
  // create returns a thenable whose catch is a no-op
  EducationRecordAccessLog.create.mockReturnValue({ catch: () => undefined });
});

describe('logRecordAccess middleware', () => {
  test('calls next immediately and registers a finish handler', () => {
    const { req, res } = makeReqRes();
    const next = jest.fn();
    const mw = logRecordAccess('iep_plan', 'teaching_instruction');

    mw(req, res, next);

    expect(next).toHaveBeenCalled();
    res.finish();
    expect(EducationRecordAccessLog.create).toHaveBeenCalledTimes(1);
  });

  test('records role, recordType, and legitimateInterest correctly', () => {
    const { req, res } = makeReqRes({ user: { _id: 'teacher-1', role: 'teacher' } });
    logRecordAccess('iep_plan', 'teaching_instruction')(req, res, jest.fn());
    res.finish();

    expect(EducationRecordAccessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-1',
        accessedBy: 'teacher-1',
        accessedByRole: 'teacher',
        recordType: 'iep_plan',
        accessType: 'api_read',
        legitimateInterest: 'teaching_instruction'
      })
    );
  });

  test('flags self-access as FERPA-exempt with legitimate interest "student_self_access"', () => {
    const { req, res } = makeReqRes({
      user: { _id: { toString: () => 'student-1' }, role: 'student' },
      studentId: 'student-1'
    });
    logRecordAccess('grades', 'teaching_instruction')(req, res, jest.fn());
    res.finish();

    expect(EducationRecordAccessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ferpaExempt: true,
        exemptionReason: 'Student self-access',
        legitimateInterest: 'student_self_access'
      })
    );
  });

  test('does NOT log when status is non-2xx', () => {
    const { req, res } = makeReqRes();
    res.statusCode = 403;
    logRecordAccess('iep_plan', 'teaching_instruction')(req, res, jest.fn());
    res.finish();
    expect(EducationRecordAccessLog.create).not.toHaveBeenCalled();
  });

  test('does NOT log when no studentId present', () => {
    const { req, res } = makeReqRes({ studentId: undefined });
    req.params = {};
    req.body = {};
    logRecordAccess('iep_plan', 'teaching_instruction')(req, res, jest.fn());
    res.finish();
    expect(EducationRecordAccessLog.create).not.toHaveBeenCalled();
  });

  test('does NOT log when no user (unauthenticated request)', () => {
    const { req, res } = makeReqRes();
    req.user = undefined;
    logRecordAccess('iep_plan', 'teaching_instruction')(req, res, jest.fn());
    res.finish();
    expect(EducationRecordAccessLog.create).not.toHaveBeenCalled();
  });

  test('honors options.getStudentId override', () => {
    const { req, res } = makeReqRes({ studentId: 'wrong' });
    req.params = {};
    req.body = { customField: 'custom-student-99' };
    const mw = logRecordAccess('iep_plan', 'teaching_instruction', {
      getStudentId: (r) => r.body.customField,
      accessType: 'export'
    });
    mw(req, res, jest.fn());
    res.finish();

    expect(EducationRecordAccessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'custom-student-99',
        accessType: 'export'
      })
    );
  });

  test('falls back to "student" role when req.user.role missing', () => {
    const { req, res } = makeReqRes();
    req.user = { _id: 'u1' };
    logRecordAccess('grades', 'teaching_instruction')(req, res, jest.fn());
    res.finish();

    expect(EducationRecordAccessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ accessedByRole: 'student' })
    );
  });
});

describe('logAccess (programmatic helper)', () => {
  test('writes a record with the provided fields', async () => {
    EducationRecordAccessLog.create.mockResolvedValueOnce({});
    await logAccess({
      studentId: 's1',
      accessedBy: 'a1',
      accessedByRole: 'admin',
      recordType: 'transcript',
      legitimateInterest: 'audit',
      metadata: { endpoint: '/x', ipAddress: '1.1.1.1', userAgent: 'cli' }
    });
    expect(EducationRecordAccessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 's1',
        accessedBy: 'a1',
        accessedByRole: 'admin',
        recordType: 'transcript',
        legitimateInterest: 'audit',
        endpoint: '/x',
        ipAddress: '1.1.1.1'
      })
    );
  });

  test('swallows DB errors so callers are never broken', async () => {
    EducationRecordAccessLog.create.mockRejectedValueOnce(new Error('db down'));
    await expect(logAccess({ studentId: 's1', recordType: 'x' })).resolves.toBeUndefined();
  });
});

describe('logRecordAccess with getStudentIds (roster-wide reads)', () => {
  beforeEach(() => {
    EducationRecordAccessLog.insertMany = jest.fn().mockReturnValue({ catch: () => undefined });
  });

  test('writes one entry per student the handler reports', () => {
    const { req, res } = makeReqRes({ studentId: undefined, method: 'POST', baseUrl: '/api/teacher', routePath: '/lesson-planner' });
    req.params = {};
    const mw = logRecordAccess('iep_plan', 'teaching_instruction', { getStudentIds: (r) => r.accessedStudentIds });
    mw(req, res, jest.fn());
    req.accessedStudentIds = ['s1', 's2', 's3'];
    res.finish();

    expect(EducationRecordAccessLog.create).not.toHaveBeenCalled();
    expect(EducationRecordAccessLog.insertMany).toHaveBeenCalledTimes(1);
    const docs = EducationRecordAccessLog.insertMany.mock.calls[0][0];
    expect(docs.map((d) => d.studentId)).toEqual(['s1', 's2', 's3']);
    expect(docs.every((d) => d.endpoint === 'POST /api/teacher/lesson-planner' && d.recordType === 'iep_plan')).toBe(true);
  });

  test('writes nothing when the handler reported no students', () => {
    const { req, res } = makeReqRes();
    const mw = logRecordAccess('iep_plan', 'teaching_instruction', { getStudentIds: () => [] });
    mw(req, res, jest.fn());
    res.finish();
    expect(EducationRecordAccessLog.create).not.toHaveBeenCalled();
    expect(EducationRecordAccessLog.insertMany).not.toHaveBeenCalled();
  });

  test('a single reported student still goes through create, like the per-student routes', () => {
    const { req, res } = makeReqRes();
    const mw = logRecordAccess('iep_plan', 'teaching_instruction', { getStudentIds: () => ['only-one'] });
    mw(req, res, jest.fn());
    res.finish();
    expect(EducationRecordAccessLog.create).toHaveBeenCalledTimes(1);
    expect(EducationRecordAccessLog.create.mock.calls[0][0].studentId).toBe('only-one');
  });
});
