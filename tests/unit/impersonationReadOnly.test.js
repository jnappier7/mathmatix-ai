// Impersonation is ALWAYS read-only. `readOnly` used to be read from the POST
// body and passed straight into the session, so any parent or teacher could
// start a session with {readOnly:false} and act as the child with full write
// access. These pin the server side of that contract: the request body, the
// stored session, and the per-request middleware each refuse to grant writes.

jest.mock('../../utils/logger', () => ({
  warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn(),
  child: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../../models/user', () => ({ findById: jest.fn() }));
jest.mock('../../models/impersonationLog', () => ({
  create: jest.fn(),
  findByIdAndUpdate: jest.fn().mockReturnValue({ catch: () => undefined }),
}));

const express = require('express');
const request = require('supertest');
const User = require('../../models/user');
const ImpersonationLog = require('../../models/impersonationLog');
const { handleImpersonation, enforceReadOnly, startImpersonation } = require('../../middleware/impersonation');
const impersonationRoutes = require('../../routes/impersonation');

const KID = { _id: { toString: () => 'kid-1' }, role: 'student', roles: ['student'], firstName: 'Kid' };

function appAs(actor) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = actor; req.session = {}; next(); });
  app.use('/api/impersonation', impersonationRoutes);
  app.use((req, res) => res.json({ session: req.session.impersonation || null }));
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  ImpersonationLog.findByIdAndUpdate.mockReturnValue({ catch: () => undefined });
  ImpersonationLog.create.mockImplementation(async (doc) => ({ ...doc, _id: { toString: () => 'log-1' } }));
  User.findById.mockResolvedValue(KID);
});

describe('POST /api/impersonation/start', () => {
  const parent = { _id: { toString: () => 'p1' }, role: 'parent', roles: ['parent'], children: [{ toString: () => 'kid-1' }] };

  test('a client-sent readOnly:false is ignored — session and audit log are read-only', async () => {
    let captured;
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = parent; req.session = {}; captured = req; next(); });
    app.use('/api/impersonation', impersonationRoutes);

    const res = await request(app).post('/api/impersonation/start').send({ targetId: 'kid-1', readOnly: false });

    expect(res.status).toBe(200);
    expect(res.body.impersonation.readOnly).toBe(true);
    expect(captured.session.impersonation.readOnly).toBe(true);
    expect(ImpersonationLog.create).toHaveBeenCalledWith(expect.objectContaining({ readOnly: true }));
  });

  test('privilege check reads roles HELD: a parent currently on the student dashboard can still view their child', async () => {
    const multiRole = { ...parent, role: 'student', roles: ['student', 'parent'] };
    const res = await request(appAs(multiRole)).post('/api/impersonation/start').send({ targetId: 'kid-1' });
    expect(res.status).toBe(200);
  });

  test('an account holding none of admin/teacher/parent is refused', async () => {
    const student = { _id: { toString: () => 's9' }, role: 'student', roles: ['student'] };
    const res = await request(appAs(student)).post('/api/impersonation/start').send({ targetId: 'kid-1' });
    expect(res.status).toBe(403);
  });
});

describe('startImpersonation', () => {
  test('has no way to start a writable session, even if a caller passes false', async () => {
    const req = { session: {}, ip: '1.1.1.1', headers: {} };
    await startImpersonation(req, { _id: { toString: () => 'a1' }, role: 'admin' }, KID, false);
    expect(req.session.impersonation.readOnly).toBe(true);
    expect(ImpersonationLog.create).toHaveBeenCalledWith(expect.objectContaining({ readOnly: true }));
  });
});

describe('a session stored with readOnly:false (started before this fix)', () => {
  test('is still enforced read-only: writes are blocked', async () => {
    const req = {
      isAuthenticated: () => true,
      session: { impersonation: { targetId: 'kid-1', startedAt: new Date().toISOString(), readOnly: false, logId: 'log-1' } },
      method: 'POST',
      originalUrl: '/api/review/submit',
      user: { _id: 'p1', role: 'parent' },
    };
    await handleImpersonation(req, {}, jest.fn());
    expect(req.impersonationReadOnly).toBe(true);

    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    enforceReadOnly(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('look-only: the only writes allowed while viewing are heartbeat and exit', () => {
  const run = (method, originalUrl) => {
    const req = { isImpersonating: true, impersonationReadOnly: true, method, originalUrl };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    enforceReadOnly(req, res, next);
    return next.mock.calls.length > 0;
  };

  test.each([
    ['POST', '/api/chat'],                       // greeting / sending as the child
    ['POST', '/api/chat/track-time'],            // charging the child's minutes
    ['POST', '/api/conversations/abc/switch'],   // records activeConversationId
    ['POST', '/api/conversations'],
    ['PUT', '/api/user/settings'],
    ['POST', '/api/mastery/start-skill'],
    ['POST', '/api/avatars/equip'],
    ['POST', '/api/fact-fluency/session'],
    ['POST', '/api/leaderboard/opt-in'],
    ['POST', '/api/curriculum/x'],
  ])('%s %s is blocked', (method, url) => {
    expect(run(method, url)).toBe(false);
  });

  test.each([
    ['POST', '/api/session/heartbeat'],
    ['POST', '/api/impersonation/end'],
    ['GET', '/api/conversations/abc/view'],
    ['GET', '/api/conversations'],
  ])('%s %s is allowed', (method, url) => {
    expect(run(method, url)).toBe(true);
  });
});
