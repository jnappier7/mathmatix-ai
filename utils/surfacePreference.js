// utils/surfacePreference.js
// Tracks the user's preferred chat surface.
//
// "Surface" is the rendered UI a user lands on after login:
//   - 'voice' → /voice-tutor.html (immersive orb + captions)
//   - 'text'  → /chat.html (bubble chat)
//
// The default is form-factor-aware: phones and tablets get 'voice',
// laptops/desktops get 'text'. A user override (toggling from the
// surface header UI) is stored in a long-lived cookie and beats the
// device default thereafter.
//
// This module ships the helpers + middleware only. The routes that
// actually consume req.surface to redirect post-login, and the toggle
// endpoint that calls setSurfaceCookie(), land in a follow-up PR.

const COOKIE_NAME = 'surface';
const VALID_VALUES = new Set(['voice', 'text']);
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

// Conservative UA regex — covers the major phone + tablet vendors.
// Tablets count as mobile here because the touch/voice ergonomics are
// closer to a phone than a laptop for this product.
const MOBILE_UA_PATTERN = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|BlackBerry|webOS|Opera Mini/i;

/**
 * Determine the default surface for a request based on device form factor.
 * Prefers the Sec-CH-UA-Mobile client hint when present (modern browsers
 * after we've asked for it via Accept-CH); falls back to a User-Agent
 * regex otherwise.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {'voice' | 'text'}
 */
function detectDefaultSurface(req) {
  // Sec-CH-UA-Mobile is '?1' (mobile) or '?0' (not). Browsers only
  // send it once we've responded with Accept-CH: Sec-CH-UA-Mobile on
  // a prior request — the middleware below sets that header.
  const chMobile = req.headers && req.headers['sec-ch-ua-mobile'];
  if (chMobile === '?1') return 'voice';
  if (chMobile === '?0') return 'text';

  const ua = (req.headers && req.headers['user-agent']) || '';
  return MOBILE_UA_PATTERN.test(ua) ? 'voice' : 'text';
}

/**
 * Read the user's persisted surface preference from cookies. Returns
 * null if no preference is set or the cookie value is invalid.
 *
 * Requires cookie-parser to have run earlier in the middleware chain.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {'voice' | 'text' | null}
 */
function getSurfacePreference(req) {
  const value = req.cookies && req.cookies[COOKIE_NAME];
  return VALID_VALUES.has(value) ? value : null;
}

/**
 * Resolve the effective surface for this request. Cookie override beats
 * device default; this is what consumers should call.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {'voice' | 'text'}
 */
function resolveSurface(req) {
  return getSurfacePreference(req) || detectDefaultSurface(req);
}

/**
 * Persist a surface preference. Invalid values are silently dropped
 * rather than throwing so a malformed client request can't 500.
 *
 * httpOnly: true — the client UI derives its current surface from the
 * URL it's on, not from this cookie. Toggling happens via a server
 * endpoint (future PR), not document.cookie writes.
 *
 * @param {import('express').Response} res
 * @param {'voice' | 'text'} value
 */
function setSurfaceCookie(res, value) {
  if (!VALID_VALUES.has(value)) return;
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });
}

/**
 * Express middleware that attaches the resolved surface to req.surface
 * and asks the browser to send Sec-CH-UA-Mobile on subsequent requests
 * for more accurate detection than UA-string sniffing.
 *
 * Register once after cookie-parser. Idempotent and dependency-free.
 */
function surfaceMiddleware(req, res, next) {
  res.setHeader('Accept-CH', 'Sec-CH-UA-Mobile');
  req.surface = resolveSurface(req);
  next();
}

module.exports = {
  COOKIE_NAME,
  VALID_VALUES: Array.from(VALID_VALUES),
  detectDefaultSurface,
  getSurfacePreference,
  resolveSurface,
  setSurfaceCookie,
  surfaceMiddleware,
};
