// tests/unit/errorTracking.test.js
// Unit tests for the HTTP error tracking middleware

jest.mock('../../utils/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const {
  trackErrors,
  getErrorMetrics,
  errorMetricsHandler,
  clientErrorHandler
} = require('../../middleware/errorTracking');

function makeReq(overrides = {}) {
  return {
    method: 'GET',
    originalUrl: '/api/x',
    url: '/api/x',
    ip: '1.2.3.4',
    user: { _id: 'u1' },
    get: () => 'jest-ua',
    ...overrides
  };
}

function makeRes(statusCode = 200) {
  const res = {
    statusCode,
    end: jest.fn()
  };
  return res;
}

describe('trackErrors middleware', () => {
  test('does not log when status is < 400', () => {
    const req = makeReq();
    const res = makeRes(200);
    const next = jest.fn();

    trackErrors(req, res, next);
    expect(next).toHaveBeenCalled();

    res.end('body');

    const metrics = getErrorMetrics();
    // 200 isn't recorded — make sure our endpoint doesn't show up
    expect(metrics.topEndpoints.find(e => e.endpoint === 'GET /api/x')).toBeUndefined();
  });

  test('records 4xx responses', () => {
    const req = makeReq({ originalUrl: '/api/missing' });
    const res = makeRes(404);
    const next = jest.fn();

    trackErrors(req, res, next);
    res.end();

    const metrics = getErrorMetrics();
    expect(metrics.byStatus['404']).toBeGreaterThanOrEqual(1);
    expect(metrics.topEndpoints.some(e => e.endpoint === 'GET /api/missing')).toBe(true);
  });

  test('records 5xx responses and includes them in summary', () => {
    const req = makeReq({ method: 'POST', originalUrl: '/api/explode' });
    const res = makeRes(500);
    const next = jest.fn();

    trackErrors(req, res, next);
    res.end();

    const metrics = getErrorMetrics();
    expect(metrics.byStatus['500']).toBeGreaterThanOrEqual(1);
    expect(metrics.summary.last15m).toBeGreaterThanOrEqual(1);
    expect(metrics.recent[0]).toMatchObject({ status: 500, method: 'POST' });
  });

  test('strips query params when grouping endpoints', () => {
    const req = makeReq({ originalUrl: '/api/search?q=foo' });
    const res = makeRes(400);
    trackErrors(req, res, jest.fn());
    res.end();

    const metrics = getErrorMetrics();
    expect(metrics.topEndpoints.some(e => e.endpoint === 'GET /api/search')).toBe(true);
  });

  test('passes through to original res.end output', () => {
    const req = makeReq();
    const res = makeRes(503);
    const original = res.end;

    trackErrors(req, res, jest.fn());
    // call wrapped end
    res.end('payload');

    expect(original).toHaveBeenCalledWith('payload');
  });
});

describe('errorMetricsHandler', () => {
  test('responds with JSON metrics', () => {
    const res = { json: jest.fn() };
    errorMetricsHandler({}, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ summary: expect.any(Object), byStatus: expect.any(Object) })
    );
  });
});

describe('clientErrorHandler', () => {
  test('accepts JSON object payload and returns 204', () => {
    const req = { body: { message: 'ReferenceError: x is not defined', source: 'app.js' } };
    const res = { status: jest.fn().mockReturnThis(), end: jest.fn() };

    clientErrorHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  test('accepts stringified JSON (sendBeacon style)', () => {
    const req = { body: JSON.stringify({ message: 'oops' }) };
    const res = { status: jest.fn().mockReturnThis(), end: jest.fn() };

    clientErrorHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('silently ignores malformed payloads', () => {
    const req = { body: '{not-json' };
    const res = { status: jest.fn().mockReturnThis(), end: jest.fn() };

    expect(() => clientErrorHandler(req, res)).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
