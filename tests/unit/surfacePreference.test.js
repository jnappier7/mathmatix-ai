// tests/unit/surfacePreference.test.js
// Unit tests for utils/surfacePreference — device detection, cookie
// preference resolution, and the middleware wiring.

const {
  COOKIE_NAME,
  detectDefaultSurface,
  getSurfacePreference,
  resolveSurface,
  setSurfaceCookie,
  surfaceMiddleware,
} = require('../../utils/surfacePreference');

// Minimal request/response stubs — these functions only touch
// req.headers, req.cookies, and res.cookie/setHeader.
const reqWith = (overrides = {}) => ({
  headers: {},
  cookies: {},
  ...overrides,
});

const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

describe('detectDefaultSurface()', () => {
  test('returns "voice" for iPhone UA', () => {
    expect(detectDefaultSurface(reqWith({ headers: { 'user-agent': PHONE_UA } }))).toBe('voice');
  });

  test('returns "voice" for Android phone UA', () => {
    expect(detectDefaultSurface(reqWith({ headers: { 'user-agent': ANDROID_UA } }))).toBe('voice');
  });

  test('returns "voice" for iPad UA (tablets count as mobile)', () => {
    expect(detectDefaultSurface(reqWith({ headers: { 'user-agent': IPAD_UA } }))).toBe('voice');
  });

  test('returns "text" for desktop UA', () => {
    expect(detectDefaultSurface(reqWith({ headers: { 'user-agent': DESKTOP_UA } }))).toBe('text');
  });

  test('Sec-CH-UA-Mobile: ?1 forces "voice" even on desktop UA', () => {
    const req = reqWith({ headers: { 'user-agent': DESKTOP_UA, 'sec-ch-ua-mobile': '?1' } });
    expect(detectDefaultSurface(req)).toBe('voice');
  });

  test('Sec-CH-UA-Mobile: ?0 forces "text" even on phone UA', () => {
    const req = reqWith({ headers: { 'user-agent': PHONE_UA, 'sec-ch-ua-mobile': '?0' } });
    expect(detectDefaultSurface(req)).toBe('text');
  });

  test('falls back to "text" when no UA and no client hint', () => {
    expect(detectDefaultSurface(reqWith())).toBe('text');
  });
});

describe('getSurfacePreference()', () => {
  test('returns "voice" when cookie is "voice"', () => {
    expect(getSurfacePreference(reqWith({ cookies: { [COOKIE_NAME]: 'voice' } }))).toBe('voice');
  });

  test('returns "text" when cookie is "text"', () => {
    expect(getSurfacePreference(reqWith({ cookies: { [COOKIE_NAME]: 'text' } }))).toBe('text');
  });

  test('returns null when cookie missing', () => {
    expect(getSurfacePreference(reqWith())).toBeNull();
  });

  test('returns null for invalid cookie value (rejects junk)', () => {
    expect(getSurfacePreference(reqWith({ cookies: { [COOKIE_NAME]: 'orb' } }))).toBeNull();
  });

  test('returns null when req.cookies is undefined (no cookie-parser)', () => {
    expect(getSurfacePreference({ headers: {} })).toBeNull();
  });
});

describe('resolveSurface()', () => {
  test('cookie "text" beats mobile UA default', () => {
    const req = reqWith({
      headers: { 'user-agent': PHONE_UA },
      cookies: { [COOKIE_NAME]: 'text' },
    });
    expect(resolveSurface(req)).toBe('text');
  });

  test('cookie "voice" beats desktop UA default', () => {
    const req = reqWith({
      headers: { 'user-agent': DESKTOP_UA },
      cookies: { [COOKIE_NAME]: 'voice' },
    });
    expect(resolveSurface(req)).toBe('voice');
  });

  test('falls through to device default when no cookie set', () => {
    expect(resolveSurface(reqWith({ headers: { 'user-agent': PHONE_UA } }))).toBe('voice');
    expect(resolveSurface(reqWith({ headers: { 'user-agent': DESKTOP_UA } }))).toBe('text');
  });

  test('invalid cookie does not poison resolution — falls back to default', () => {
    const req = reqWith({
      headers: { 'user-agent': PHONE_UA },
      cookies: { [COOKIE_NAME]: 'rubbish' },
    });
    expect(resolveSurface(req)).toBe('voice');
  });
});

describe('setSurfaceCookie()', () => {
  test('writes a cookie with the expected options for valid value', () => {
    const res = { cookie: jest.fn() };
    setSurfaceCookie(res, 'voice');
    expect(res.cookie).toHaveBeenCalledWith(COOKIE_NAME, 'voice', expect.objectContaining({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    }));
  });

  test('silently drops invalid values (does not throw, does not write)', () => {
    const res = { cookie: jest.fn() };
    setSurfaceCookie(res, 'orb');
    expect(res.cookie).not.toHaveBeenCalled();
  });

  test('uses secure: true in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res = { cookie: jest.fn() };
    setSurfaceCookie(res, 'text');
    expect(res.cookie).toHaveBeenCalledWith(COOKIE_NAME, 'text', expect.objectContaining({ secure: true }));
    process.env.NODE_ENV = prev;
  });

  test('uses secure: false outside production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const res = { cookie: jest.fn() };
    setSurfaceCookie(res, 'text');
    expect(res.cookie).toHaveBeenCalledWith(COOKIE_NAME, 'text', expect.objectContaining({ secure: false }));
    process.env.NODE_ENV = prev;
  });
});

describe('surfaceMiddleware()', () => {
  test('attaches req.surface based on device detection', () => {
    const req = reqWith({ headers: { 'user-agent': PHONE_UA } });
    const res = { setHeader: jest.fn() };
    const next = jest.fn();
    surfaceMiddleware(req, res, next);
    expect(req.surface).toBe('voice');
    expect(next).toHaveBeenCalled();
  });

  test('cookie preference overrides device detection on req.surface', () => {
    const req = reqWith({
      headers: { 'user-agent': PHONE_UA },
      cookies: { [COOKIE_NAME]: 'text' },
    });
    const res = { setHeader: jest.fn() };
    surfaceMiddleware(req, res, () => {});
    expect(req.surface).toBe('text');
  });

  test('sends Accept-CH: Sec-CH-UA-Mobile so future requests get the hint', () => {
    const req = reqWith();
    const res = { setHeader: jest.fn() };
    surfaceMiddleware(req, res, () => {});
    expect(res.setHeader).toHaveBeenCalledWith('Accept-CH', 'Sec-CH-UA-Mobile');
  });
});
