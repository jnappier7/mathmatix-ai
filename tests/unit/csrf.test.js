// tests/unit/csrf.test.js
// Unit tests for the CSRF middleware (double-submit cookie pattern)

const {
  csrfProtection,
  csrfExempt,
  conditionalCsrfProtection,
  generateToken
} = require('../../middleware/csrf');

function makeReq(overrides = {}) {
  return {
    method: 'GET',
    path: '/',
    cookies: {},
    headers: {},
    body: {},
    ...overrides
  };
}

function makeRes() {
  const res = {
    cookie: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    locals: {}
  };
  return res;
}

describe('generateToken', () => {
  test('produces a 64-char hex string', () => {
    const token = generateToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  test('produces a different token on each call', () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});

describe('csrfProtection — exempt routes', () => {
  test('skips check for exact-match exempt route', () => {
    const req = makeReq({ method: 'POST', path: '/api/billing/webhook' });
    const res = makeRes();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('skips check for exempt prefix /api/trial-chat/anything', () => {
    const req = makeReq({ method: 'POST', path: '/api/trial-chat/start' });
    const res = makeRes();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('csrfProtection — safe methods', () => {
  test('GET issues a fresh token cookie when none exists', () => {
    const req = makeReq({ method: 'GET', path: '/dashboard' });
    const res = makeRes();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(res.cookie).toHaveBeenCalledTimes(1);
    const [name, value, opts] = res.cookie.mock.calls[0];
    expect(name).toBe('_csrf');
    expect(value).toMatch(/^[a-f0-9]{64}$/);
    expect(opts).toMatchObject({ httpOnly: false, sameSite: 'lax' });
    expect(typeof req.csrfToken).toBe('function');
    expect(req.csrfToken()).toBe(value);
    expect(res.locals.csrfToken).toBe(value);
    expect(next).toHaveBeenCalled();
  });

  test('GET reuses existing cookie token without overwriting', () => {
    const existing = 'a'.repeat(64);
    const req = makeReq({ method: 'GET', path: '/dashboard', cookies: { _csrf: existing } });
    const res = makeRes();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(res.cookie).not.toHaveBeenCalled();
    expect(req.csrfToken()).toBe(existing);
    expect(res.locals.csrfToken).toBe(existing);
    expect(next).toHaveBeenCalled();
  });

  test.each(['HEAD', 'OPTIONS'])('safe method %s does not require token', (method) => {
    const req = makeReq({ method, path: '/dashboard' });
    const res = makeRes();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('csrfProtection — state-changing methods', () => {
  test('rejects POST with neither cookie nor header', () => {
    const req = makeReq({ method: 'POST', path: '/api/user' });
    const res = makeRes();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CSRF_MISSING' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects POST with cookie but missing header', () => {
    const token = 'b'.repeat(64);
    const req = makeReq({
      method: 'POST',
      path: '/api/user',
      cookies: { _csrf: token }
    });
    const res = makeRes();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CSRF_MISSING' })
    );
  });

  test('rejects POST when header and cookie differ', () => {
    const req = makeReq({
      method: 'POST',
      path: '/api/user',
      cookies: { _csrf: 'a'.repeat(64) },
      headers: { 'x-csrf-token': 'b'.repeat(64) }
    });
    const res = makeRes();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CSRF_INVALID' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects POST when tokens differ in length (timingSafeEqual would throw)', () => {
    const req = makeReq({
      method: 'POST',
      path: '/api/user',
      cookies: { _csrf: 'a'.repeat(64) },
      headers: { 'x-csrf-token': 'a'.repeat(32) }
    });
    const res = makeRes();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CSRF_INVALID' })
    );
  });

  test('accepts POST when header matches cookie', () => {
    const token = 'c'.repeat(64);
    const req = makeReq({
      method: 'POST',
      path: '/api/user',
      cookies: { _csrf: token },
      headers: { 'x-csrf-token': token }
    });
    const res = makeRes();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('accepts POST when token comes from body (form fallback)', () => {
    const token = 'd'.repeat(64);
    const req = makeReq({
      method: 'POST',
      path: '/api/form',
      cookies: { _csrf: token },
      body: { _csrf: token }
    });
    const res = makeRes();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('csrfExempt + conditionalCsrfProtection', () => {
  test('csrfExempt sets req.csrfExempt and calls next', () => {
    const req = makeReq();
    const next = jest.fn();
    csrfExempt(req, makeRes(), next);
    expect(req.csrfExempt).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  test('conditionalCsrfProtection skips when req.csrfExempt is true', () => {
    const req = makeReq({ method: 'POST', path: '/api/x', csrfExempt: true });
    const res = makeRes();
    const next = jest.fn();

    conditionalCsrfProtection(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('conditionalCsrfProtection enforces when not exempt', () => {
    const req = makeReq({ method: 'POST', path: '/api/x' });
    const res = makeRes();
    const next = jest.fn();

    conditionalCsrfProtection(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
