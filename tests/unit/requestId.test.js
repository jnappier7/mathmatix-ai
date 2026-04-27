// tests/unit/requestId.test.js
// Unit tests for the requestId middleware

const { requestId } = require('../../middleware/requestId');

describe('requestId middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = { setHeader: jest.fn() };
    next = jest.fn();
  });

  test('generates a UUID when no x-request-id header is provided', () => {
    requestId(req, res, next);

    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
    expect(next).toHaveBeenCalled();
  });

  test('reuses incoming x-request-id header when present', () => {
    req.headers['x-request-id'] = 'incoming-trace-id-123';

    requestId(req, res, next);

    expect(req.requestId).toBe('incoming-trace-id-123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'incoming-trace-id-123');
    expect(next).toHaveBeenCalled();
  });

  test('generates unique IDs across separate requests', () => {
    const reqA = { headers: {} };
    const reqB = { headers: {} };
    const resA = { setHeader: jest.fn() };
    const resB = { setHeader: jest.fn() };

    requestId(reqA, resA, jest.fn());
    requestId(reqB, resB, jest.fn());

    expect(reqA.requestId).not.toBe(reqB.requestId);
  });
});
