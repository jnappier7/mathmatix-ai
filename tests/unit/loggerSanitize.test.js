// tests/unit/loggerSanitize.test.js
// Unit tests for utils/logger.js — focus on the sanitize() function (security)
//
// We can't import sanitize directly (it's not exported), so we exercise it via
// the public log methods and assert that the underlying winston transport sees
// redacted metadata.

// Capture logs by replacing the winston Console transport with a memory writer.
// Easiest is to mock winston's createLogger to expose what was logged.

const captured = { calls: [] };

jest.mock('winston', () => {
  const realWinston = jest.requireActual('winston');
  const fakeLogger = {
    debug: jest.fn((msg, meta) => captured.calls.push({ level: 'debug', msg, meta })),
    info:  jest.fn((msg, meta) => captured.calls.push({ level: 'info',  msg, meta })),
    http:  jest.fn((msg, meta) => captured.calls.push({ level: 'http',  msg, meta })),
    warn:  jest.fn((msg, meta) => captured.calls.push({ level: 'warn',  msg, meta })),
    error: jest.fn((msg, meta) => captured.calls.push({ level: 'error', msg, meta })),
    child: jest.fn(function (defaults) { return { ...this, _defaults: defaults }; })
  };
  return {
    ...realWinston,
    createLogger: jest.fn(() => fakeLogger),
    addColors: jest.fn(),
    transports: realWinston.transports,
    format: realWinston.format
  };
});

jest.mock('winston-daily-rotate-file', () => jest.fn());

const log = require('../../utils/logger');

beforeEach(() => {
  captured.calls.length = 0;
});

describe('logger.error metadata extraction', () => {
  test('extracts error.message and stack when given an Error', () => {
    const err = new Error('boom');
    log.error('it broke', err);
    const last = captured.calls.at(-1);
    expect(last.level).toBe('error');
    expect(last.msg).toBe('it broke');
    expect(last.meta).toMatchObject({ error: 'boom' });
    expect(last.meta.stack).toContain('Error: boom');
  });

  test('passes plain object metadata through', () => {
    log.error('it broke', { userId: 'u1', context: 'x' });
    const last = captured.calls.at(-1);
    expect(last.meta).toEqual({ userId: 'u1', context: 'x' });
  });
});

describe('log.debug / .info / .http / .warn', () => {
  test.each(['debug', 'info', 'http', 'warn'])('%s forwards message + meta', (level) => {
    log[level]('hello', { k: 'v' });
    const last = captured.calls.at(-1);
    expect(last.level).toBe(level);
    expect(last.msg).toBe('hello');
    expect(last.meta).toEqual({ k: 'v' });
  });
});

describe('log.child', () => {
  test('returns a logger with child methods that merge defaults into meta', () => {
    const child = log.child({ service: 'svc-x', userId: 'u1' });
    child.info('hello', { extra: 'y' });
    const last = captured.calls.at(-1);
    expect(last.meta).toMatchObject({ service: 'svc-x', userId: 'u1', extra: 'y' });
  });

  test('child.error coerces Error → message + stack', () => {
    const child = log.child({ service: 's' });
    child.error('boom', new Error('x'));
    const last = captured.calls.at(-1);
    expect(last.meta).toMatchObject({ service: 's', error: 'x' });
    expect(last.meta.stack).toBeDefined();
  });
});

describe('Express middleware', () => {
  test('requestLogger emits an http log entry on response finish', () => {
    const handlers = {};
    const req = { user: { _id: 'u1' }, requestId: 'r1', method: 'GET', originalUrl: '/x', ip: '1.1.1.1', get: () => 'jest' };
    const res = { on: (evt, cb) => { handlers[evt] = cb; }, statusCode: 200 };
    const next = jest.fn();

    log.requestLogger(req, res, next);
    expect(next).toHaveBeenCalled();

    handlers.finish();
    const last = captured.calls.at(-1);
    expect(last.level).toBe('http');
    expect(last.meta).toMatchObject({
      requestId: 'r1', method: 'GET', url: '/x', status: 200, userId: 'u1'
    });
  });

  test('errorLogger forwards the error and logs it', () => {
    const req = { user: { _id: 'u1' }, requestId: 'r1', method: 'POST', originalUrl: '/x', body: { password: 'secret', name: 'n' } };
    const res = {};
    const next = jest.fn();
    const err = new Error('explosion');

    log.errorLogger(err, req, res, next);
    expect(next).toHaveBeenCalledWith(err);
    const last = captured.calls.at(-1);
    expect(last.level).toBe('error');
    // Sanitization happens in the meta — the password field should be redacted
    expect(last.meta.body.password).toBe('[REDACTED]');
    expect(last.meta.body.name).toBe('n');
  });
});
