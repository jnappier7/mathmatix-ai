// tests/unit/authMiddleware.test.js
// Unit tests for auth middleware role gates and login flow

jest.mock('../../utils/logger', () => {
  const stub = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

jest.mock('../../utils/demoClone', () => ({
  cleanupDemoClone: jest.fn().mockResolvedValue(undefined)
}));

const {
  isAuthenticated,
  ensureNotAuthenticated,
  isAdmin,
  isTeacher,
  isParent,
  isStudent,
  isAuthorizedForLeaderboard,
  handleLogout
} = require('../../middleware/auth');

function makeReq({
  authenticated = false,
  user = null,
  method = 'GET',
  originalUrl = '/page',
  session = {}
} = {}) {
  return {
    isAuthenticated: () => authenticated,
    user,
    method,
    originalUrl,
    session,
    logout: (cb) => cb(null)
  };
}

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    redirect: jest.fn(),
    clearCookie: jest.fn(),
    send: jest.fn()
  };
}

describe('isAuthenticated', () => {
  test('passes through when user is authenticated', () => {
    const req = makeReq({ authenticated: true, user: { _id: 'u1' } });
    const res = makeRes();
    const next = jest.fn();
    isAuthenticated(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 401 JSON for /api/* routes when unauthenticated', () => {
    const req = makeReq({ originalUrl: '/api/secret' });
    const res = makeRes();
    isAuthenticated(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalled();
  });

  test('returns 401 JSON for POST when unauthenticated', () => {
    const req = makeReq({ method: 'POST', originalUrl: '/form-submit' });
    const res = makeRes();
    isAuthenticated(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('redirects to login for browser GET when unauthenticated', () => {
    const req = makeReq({ originalUrl: '/dashboard' });
    const res = makeRes();
    isAuthenticated(req, res, jest.fn());
    expect(res.redirect).toHaveBeenCalledWith('/login.html');
  });
});

describe('ensureNotAuthenticated', () => {
  test('passes through when not authenticated', () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    ensureNotAuthenticated(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects POST signup when already logged in', () => {
    const req = makeReq({
      authenticated: true,
      user: { username: 'alice', role: 'student', selectedTutorId: 't', selectedAvatarId: 'a' },
      method: 'POST'
    });
    const res = makeRes();
    ensureNotAuthenticated(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ alreadyLoggedIn: true }));
  });

  test('redirects student needing profile completion', () => {
    const req = makeReq({
      authenticated: true,
      user: { needsProfileCompletion: true, role: 'student' }
    });
    const res = makeRes();
    ensureNotAuthenticated(req, res, jest.fn());
    expect(res.redirect).toHaveBeenCalledWith('/complete-profile.html');
  });

  test('redirects multi-role user to role picker', () => {
    const req = makeReq({
      authenticated: true,
      user: { roles: ['teacher', 'parent'], role: 'teacher' }
    });
    const res = makeRes();
    ensureNotAuthenticated(req, res, jest.fn());
    expect(res.redirect).toHaveBeenCalledWith('/role-picker.html');
  });

  test('redirects teacher to teacher dashboard', () => {
    const req = makeReq({ authenticated: true, user: { role: 'teacher' } });
    const res = makeRes();
    ensureNotAuthenticated(req, res, jest.fn());
    expect(res.redirect).toHaveBeenCalledWith('/teacher-dashboard.html');
  });

  test('redirects admin to admin dashboard', () => {
    const req = makeReq({ authenticated: true, user: { role: 'admin' } });
    const res = makeRes();
    ensureNotAuthenticated(req, res, jest.fn());
    expect(res.redirect).toHaveBeenCalledWith('/admin-dashboard.html');
  });

  test('redirects parent to parent dashboard', () => {
    const req = makeReq({ authenticated: true, user: { role: 'parent' } });
    const res = makeRes();
    ensureNotAuthenticated(req, res, jest.fn());
    expect(res.redirect).toHaveBeenCalledWith('/parent-dashboard.html');
  });

  test('redirects student without selected tutor to pick-tutor', () => {
    const req = makeReq({
      authenticated: true,
      user: { role: 'student', selectedTutorId: null }
    });
    const res = makeRes();
    ensureNotAuthenticated(req, res, jest.fn());
    expect(res.redirect).toHaveBeenCalledWith('/pick-tutor.html');
  });

  test('redirects student without avatar to pick-avatar', () => {
    const req = makeReq({
      authenticated: true,
      user: { role: 'student', selectedTutorId: 't1', selectedAvatarId: null }
    });
    const res = makeRes();
    ensureNotAuthenticated(req, res, jest.fn());
    expect(res.redirect).toHaveBeenCalledWith('/pick-avatar.html');
  });

  test('redirects fully-onboarded student to chat', () => {
    const req = makeReq({
      authenticated: true,
      user: { role: 'student', selectedTutorId: 't1', selectedAvatarId: 'a1' }
    });
    const res = makeRes();
    ensureNotAuthenticated(req, res, jest.fn());
    expect(res.redirect).toHaveBeenCalledWith('/chat.html');
  });
});

describe('role gates honor the roles array AND legacy role field', () => {
  const cases = [
    { gate: isAdmin, role: 'admin', label: 'Admin' },
    { gate: isTeacher, role: 'teacher', label: 'Teachers' },
    { gate: isParent, role: 'parent', label: 'Parents' },
    { gate: isStudent, role: 'student', label: 'Students' }
  ];

  test.each(cases)('$label gate allows authenticated user with that role (legacy field)', ({ gate, role }) => {
    const req = makeReq({ authenticated: true, user: { role } });
    const res = makeRes();
    const next = jest.fn();
    gate(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test.each(cases)('$label gate allows multi-role users when roles[] contains it', ({ gate, role }) => {
    const req = makeReq({
      authenticated: true,
      user: { role: 'student', roles: ['student', role] }
    });
    const res = makeRes();
    const next = jest.fn();
    gate(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test.each(cases)('$label gate returns 403 JSON for /api/* without role', ({ gate }) => {
    const req = makeReq({ authenticated: true, user: { role: 'student' }, originalUrl: '/api/x' });
    const res = makeRes();
    const next = jest.fn();
    gate(req, res, next);
    if (gate === isStudent) {
      // Student gate would actually pass for role=student — re-test with non-matching role
      const r2 = makeReq({ authenticated: true, user: { role: 'guest' }, originalUrl: '/api/x' });
      const res2 = makeRes();
      gate(r2, res2, jest.fn());
      expect(res2.status).toHaveBeenCalledWith(403);
    } else {
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  });

  test.each(cases)('$label gate redirects unauthenticated browser GET', ({ gate }) => {
    const req = makeReq({ authenticated: false });
    const res = makeRes();
    gate(req, res, jest.fn());
    expect(res.redirect).toHaveBeenCalledWith('/login.html');
  });
});

describe('isAuthorizedForLeaderboard', () => {
  test('allows any of student/teacher/admin/parent', () => {
    for (const role of ['student', 'teacher', 'admin', 'parent']) {
      const req = makeReq({ authenticated: true, user: { role } });
      const res = makeRes();
      const next = jest.fn();
      isAuthorizedForLeaderboard(req, res, next);
      expect(next).toHaveBeenCalled();
    }
  });

  test('rejects unknown role on /api/*', () => {
    const req = makeReq({ authenticated: true, user: { role: 'guest' }, originalUrl: '/api/leaderboard' });
    const res = makeRes();
    isAuthorizedForLeaderboard(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('handleLogout', () => {
  test('logs out, destroys session, clears cookie, returns 200', (done) => {
    const req = {
      session: { destroy: (cb) => cb(null) },
      logout: (cb) => cb(null)
    };
    const res = {
      clearCookie: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockImplementation(() => {
        expect(res.clearCookie).toHaveBeenCalledWith('connect.sid');
        expect(res.status).toHaveBeenCalledWith(200);
        done();
      }),
      send: jest.fn()
    };
    handleLogout(req, res, jest.fn());
  });

  test('cleans up demo clone session on logout', (done) => {
    const { cleanupDemoClone } = require('../../utils/demoClone');
    const req = {
      session: { isDemo: true, cloneSessionId: 'clone-123', destroy: (cb) => cb(null) },
      logout: (cb) => cb(null)
    };
    const res = {
      clearCookie: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockImplementation(() => {
        // cleanupDemoClone is fired asynchronously inside session.destroy callback
        setImmediate(() => {
          expect(cleanupDemoClone).toHaveBeenCalledWith('clone-123');
          done();
        });
      }),
      send: jest.fn()
    };
    handleLogout(req, res, jest.fn());
  });

  test('forwards logout error via next()', (done) => {
    const req = { session: {}, logout: (cb) => cb(new Error('boom')) };
    const res = {};
    const next = (err) => {
      expect(err).toBeInstanceOf(Error);
      done();
    };
    handleLogout(req, res, next);
  });
});
