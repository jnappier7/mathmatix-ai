// tests/unit/loggerProductionFormat.test.js
//
// Exercises the REAL winston format pipeline. loggerSanitize.test.js mocks
// winston.createLogger, so the format never runs there — which is how this
// shipped to production:
//
//   2026-07-21T22:13:18Z undefined
//   2026-07-21T22:13:18Z undefined
//
// Every winston log line came out as a bare "undefined". Two causes:
//   1. sanitize() ran AFTER json(), so redaction never reached the output.
//   2. sanitize() returns a NEW object built by a string-keyed for..in loop.
//      winston carries the rendered line on Symbol.for('message'); returning a
//      fresh object dropped it, so the Console transport wrote undefined.
//
// A third defect surfaced while fixing it: the sensitive-key list was compared
// against key.toLowerCase() but held camelCase entries, so 'apiKey' and
// 'creditCard' could never match and were logged in the clear.

const logger = require('../../utils/logger');

const MESSAGE = Symbol.for('message');

// Run one info object through the real production format.
function render(info) {
  const fmt = logger._productionFormat;
  const out = fmt.transform({ ...info }, fmt.options);
  return out ? out[MESSAGE] : undefined;
}

describe('production log format renders a line at all', () => {
  test('emits a JSON string, not undefined (the bare-"undefined" regression)', () => {
    const line = render({ level: 'info', message: 'Unhandled route error' });
    expect(typeof line).toBe('string');
    expect(line).not.toBe('undefined');
    expect(() => JSON.parse(line)).not.toThrow();
  });

  test('preserves the message and metadata', () => {
    const parsed = JSON.parse(render({
      level: 'error', message: 'boom', requestId: 'r1', userId: 'u1',
    }));
    expect(parsed).toMatchObject({ level: 'error', message: 'boom', requestId: 'r1', userId: 'u1' });
  });
});

describe('production log format redacts secrets', () => {
  test('redacts the keys that a lowercase substring already covered', () => {
    const parsed = JSON.parse(render({
      level: 'info', message: 'm', password: 'hunter2', accessToken: 'at-1', sessionId: 's-1',
    }));
    expect(parsed.password).toBe('[REDACTED]');
    expect(parsed.accessToken).toBe('[REDACTED]');
    expect(parsed.sessionId).toBe('[REDACTED]');
  });

  test('redacts apiKey and creditCard — the two the camelCase list missed', () => {
    const parsed = JSON.parse(render({
      level: 'info', message: 'm', apiKey: 'sk-live-123', creditCard: '4111111111111111',
    }));
    expect(parsed.apiKey).toBe('[REDACTED]');
    expect(parsed.creditCard).toBe('[REDACTED]');
  });

  test('redacts nested secrets too', () => {
    const parsed = JSON.parse(render({
      level: 'info', message: 'm', ctx: { apiKey: 'k-1', keep: 'this' },
    }));
    expect(parsed.ctx.apiKey).toBe('[REDACTED]');
    expect(parsed.ctx.keep).toBe('this');
  });

  test('leaves non-sensitive fields alone', () => {
    const parsed = JSON.parse(render({
      level: 'info', message: 'm', skillId: 'MS.QNT.8', count: 3,
    }));
    expect(parsed.skillId).toBe('MS.QNT.8');
    expect(parsed.count).toBe(3);
  });
});

describe('sanitize()', () => {
  test('every sensitive key is lowercase, or it can never match', () => {
    // The comparison is `key.toLowerCase().includes(sensitiveKey)`, so an
    // uppercase character in the list is dead weight.
    const probe = {};
    for (const k of ['apiKey', 'creditCard', 'passwordHash', 'csrfToken', 'refreshToken']) {
      probe[k] = 'secret-value';
    }
    const out = logger._sanitize(probe);
    for (const k of Object.keys(probe)) {
      expect(out[k]).toBe('[REDACTED]');
    }
  });

  test('passes through non-objects untouched', () => {
    expect(logger._sanitize(null)).toBeNull();
    expect(logger._sanitize('str')).toBe('str');
    expect(logger._sanitize(7)).toBe(7);
  });
});
