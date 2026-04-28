// tests/unit/sentryConfig.test.js
// Unit tests for config/sentry.js (initSentry, initSentryErrorHandler)

global.__sentrySetup = jest.fn();
jest.mock('@sentry/node', () => ({
  setupExpressErrorHandler: (...a) => global.__sentrySetup(...a)
}));

const setupExpressErrorHandler = global.__sentrySetup;
const sentry = require('../../config/sentry');

beforeEach(() => {
  setupExpressErrorHandler.mockClear();
});

describe('initSentry', () => {
  test('is a no-op (initialization is in instrument.js)', () => {
    expect(() => sentry.initSentry()).not.toThrow();
  });
});

describe('initSentryErrorHandler', () => {
  test('registers Sentry Express error handler with shouldHandleError filter', () => {
    const fakeApp = {};
    sentry.initSentryErrorHandler(fakeApp);
    expect(setupExpressErrorHandler).toHaveBeenCalledWith(fakeApp, expect.objectContaining({
      shouldHandleError: expect.any(Function)
    }));
  });

  test('shouldHandleError filter ignores 4xx errors and reports 5xx', () => {
    sentry.initSentryErrorHandler({});
    const filter = setupExpressErrorHandler.mock.calls[0][1].shouldHandleError;
    expect(filter({ status: 404 })).toBe(false);
    expect(filter({ status: 401 })).toBe(false);
    expect(filter({ status: 500 })).toBe(true);
    expect(filter({ status: 503 })).toBe(true);
    // No status → assume real error → report
    expect(filter({})).toBe(true);
  });
});
