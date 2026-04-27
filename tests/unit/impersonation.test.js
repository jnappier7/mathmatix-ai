// tests/unit/impersonation.test.js
// Unit tests for impersonation middleware (canImpersonate, enforceReadOnly, status, lifecycle)

jest.mock('../../utils/logger', () => ({
  warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

jest.mock('../../models/user', () => ({
  findById: jest.fn()
}));

jest.mock('../../models/impersonationLog', () => ({
  create: jest.fn(),
  findByIdAndUpdate: jest.fn().mockReturnValue({ catch: () => undefined })
}));

const User = require('../../models/user');
const ImpersonationLog = require('../../models/impersonationLog');
const {
  handleImpersonation,
  enforceReadOnly,
  canImpersonate,
  getImpersonationStatus,
  startImpersonation,
  endImpersonation,
  IMPERSONATION_TIMEOUT_MS
} = require('../../middleware/impersonation');

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
  ImpersonationLog.findByIdAndUpdate.mockReturnValue({ catch: () => undefined });
});

describe('canImpersonate', () => {
  test('refuses self-impersonation', async () => {
    const u = { _id: 'u1', role: 'admin' };
    const r = await canImpersonate(u, u);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/yourself/i);
  });

  test('refuses impersonating an admin', async () => {
    const r = await canImpersonate({ _id: 'a', role: 'admin' }, { _id: 'b', role: 'admin' });
    expect(r.allowed).toBe(false);
  });

  test('admin can impersonate non-admin users', async () => {
    const r = await canImpersonate(
      { _id: 'a', role: 'admin' },
      { _id: 's', role: 'student' }
    );
    expect(r.allowed).toBe(true);
  });

  test('teacher can impersonate their own assigned student', async () => {
    const r = await canImpersonate(
      { _id: 't1', role: 'teacher' },
      { _id: 's1', role: 'student', teacherId: { toString: () => 't1' } }
    );
    expect(r.allowed).toBe(true);
  });

  test('teacher cannot impersonate a student assigned to another teacher', async () => {
    const r = await canImpersonate(
      { _id: 't1', role: 'teacher' },
      { _id: 's1', role: 'student', teacherId: { toString: () => 'other' } }
    );
    expect(r.allowed).toBe(false);
  });

  test('teacher cannot impersonate a non-student', async () => {
    const r = await canImpersonate(
      { _id: 't1', role: 'teacher' },
      { _id: 'p1', role: 'parent' }
    );
    expect(r.allowed).toBe(false);
  });

  test('parent can impersonate their linked child', async () => {
    const r = await canImpersonate(
      { _id: 'p1', role: 'parent', children: [{ toString: () => 'kid-1' }] },
      { _id: 'kid-1', role: 'student' }
    );
    expect(r.allowed).toBe(true);
  });

  test('parent cannot impersonate someone else’s child', async () => {
    const r = await canImpersonate(
      { _id: 'p1', role: 'parent', children: [{ toString: () => 'kid-1' }] },
      { _id: 'kid-2', role: 'student' }
    );
    expect(r.allowed).toBe(false);
  });

  test('parent cannot impersonate non-students', async () => {
    const r = await canImpersonate(
      { _id: 'p1', role: 'parent', children: [] },
      { _id: 't1', role: 'teacher' }
    );
    expect(r.allowed).toBe(false);
  });

  test('students and unknown roles cannot impersonate at all', async () => {
    const r = await canImpersonate({ _id: 's1', role: 'student' }, { _id: 's2', role: 'student' });
    expect(r.allowed).toBe(false);
  });
});

describe('enforceReadOnly', () => {
  test('passes through when not impersonating', () => {
    const req = { isImpersonating: false, originalUrl: '/api/foo', method: 'POST' };
    const res = makeRes();
    const next = jest.fn();
    enforceReadOnly(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('blocks always-blocked routes (e.g. /api/admin) even with write access', () => {
    const req = {
      isImpersonating: true,
      impersonationReadOnly: false,
      originalUrl: '/api/admin/users',
      method: 'GET'
    };
    const res = makeRes();
    enforceReadOnly(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ impersonating: true }));
  });

  test('blocks write methods in read-only mode for non-allowed routes', () => {
    const req = {
      isImpersonating: true,
      impersonationReadOnly: true,
      originalUrl: '/api/some-write-thing',
      method: 'POST'
    };
    const res = makeRes();
    enforceReadOnly(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ readOnly: true }));
  });

  test('allows /api/chat write in read-only mode (whitelisted)', () => {
    const req = {
      isImpersonating: true,
      impersonationReadOnly: true,
      originalUrl: '/api/chat/send?x=1',
      method: 'POST'
    };
    const res = makeRes();
    const next = jest.fn();
    enforceReadOnly(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('allows GET requests in read-only mode', () => {
    const req = {
      isImpersonating: true,
      impersonationReadOnly: true,
      originalUrl: '/api/anything',
      method: 'GET'
    };
    const res = makeRes();
    const next = jest.fn();
    enforceReadOnly(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('allows write methods when not in read-only mode (non-blocked routes)', () => {
    const req = {
      isImpersonating: true,
      impersonationReadOnly: false,
      originalUrl: '/api/some-thing',
      method: 'POST',
      impersonationLogId: 'log-1'
    };
    const res = makeRes();
    const next = jest.fn();
    enforceReadOnly(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('handleImpersonation middleware', () => {
  function makeReq(opts = {}) {
    return {
      isAuthenticated: () => opts.authenticated !== false,
      session: opts.session || {},
      method: opts.method || 'GET',
      originalUrl: opts.originalUrl || '/foo',
      user: opts.user || { _id: 'admin-1' }
    };
  }

  test('skips when not authenticated', async () => {
    const req = makeReq({ authenticated: false });
    const next = jest.fn();
    await handleImpersonation(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('skips when no impersonation in session', async () => {
    const req = makeReq();
    const next = jest.fn();
    await handleImpersonation(req, makeRes(), next);
    expect(req.isImpersonating).toBe(false);
    expect(next).toHaveBeenCalled();
  });

  test('swaps req.user to target when impersonation is active', async () => {
    const target = { _id: 'student-1', role: 'student' };
    User.findById.mockResolvedValue(target);
    const req = makeReq({
      session: {
        impersonation: {
          targetId: 'student-1',
          startedAt: new Date().toISOString(),
          readOnly: true,
          logId: 'log-1'
        }
      },
      user: { _id: 'admin-1', role: 'admin' }
    });

    const next = jest.fn();
    await handleImpersonation(req, makeRes(), next);

    expect(req.isImpersonating).toBe(true);
    expect(req.user).toBe(target);
    expect(req.originalUser._id).toBe('admin-1');
    expect(req.impersonationReadOnly).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  test('expires the session after timeout', async () => {
    const req = makeReq({
      session: {
        impersonation: {
          targetId: 'student-1',
          startedAt: new Date(Date.now() - IMPERSONATION_TIMEOUT_MS - 1000).toISOString(),
          logId: 'log-1'
        }
      }
    });

    const next = jest.fn();
    await handleImpersonation(req, makeRes(), next);

    expect(req.session.impersonation).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  test('ends session when target user no longer exists', async () => {
    User.findById.mockResolvedValue(null);
    const req = makeReq({
      session: {
        impersonation: {
          targetId: 'gone',
          startedAt: new Date().toISOString(),
          logId: 'log-1'
        }
      }
    });

    const next = jest.fn();
    await handleImpersonation(req, makeRes(), next);

    expect(req.session.impersonation).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  test('handles DB errors by ending the impersonation session', async () => {
    User.findById.mockRejectedValue(new Error('boom'));
    const req = makeReq({
      session: {
        impersonation: {
          targetId: 's1',
          startedAt: new Date().toISOString(),
          logId: 'log-1'
        }
      }
    });

    const next = jest.fn();
    await handleImpersonation(req, makeRes(), next);

    expect(req.session.impersonation).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});

describe('startImpersonation + endImpersonation', () => {
  test('startImpersonation creates audit log and writes session data', async () => {
    ImpersonationLog.create.mockResolvedValue({ _id: { toString: () => 'log-99' } });
    const req = { session: {}, ip: '10.0.0.1', headers: { 'user-agent': 'jest' } };
    const actor = { _id: { toString: () => 'a1' }, role: 'admin', email: 'a@x.io' };
    const target = {
      _id: { toString: () => 's1' },
      role: 'student',
      email: 's@x.io',
      firstName: 'Sam',
      lastName: 'Lee',
      username: 'sam'
    };

    const log = await startImpersonation(req, actor, target, true);

    expect(ImpersonationLog.create).toHaveBeenCalled();
    expect(log._id.toString()).toBe('log-99');
    expect(req.session.impersonation).toMatchObject({
      targetId: 's1',
      readOnly: true,
      logId: 'log-99',
      targetName: 'Sam Lee'
    });
  });

  test('endImpersonation clears session and updates audit log', async () => {
    const req = {
      session: { impersonation: { logId: 'log-1', actorId: 'a1' } }
    };

    await endImpersonation(req, 'manual');

    expect(req.session.impersonation).toBeUndefined();
    expect(req.isImpersonating).toBe(false);
  });

  test('endImpersonation is a no-op when no session', async () => {
    const req = { session: {} };
    await expect(endImpersonation(req)).resolves.toBeUndefined();
  });
});

describe('getImpersonationStatus', () => {
  test('returns inactive when no session', () => {
    expect(getImpersonationStatus({ session: {} })).toEqual({ active: false });
  });

  test('returns active session info with remaining minutes', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const status = getImpersonationStatus({
      session: {
        impersonation: {
          targetId: 's1', targetName: 'Sam', targetRole: 'student',
          readOnly: true, startedAt: fiveMinAgo
        }
      }
    });

    expect(status.active).toBe(true);
    expect(status.targetId).toBe('s1');
    expect(status.remainingMinutes).toBeGreaterThan(0);
    expect(status.remainingMinutes).toBeLessThanOrEqual(20);
  });
});
