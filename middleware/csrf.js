// middleware/csrf.js
// CSRF Protection using Double Submit Cookie Pattern
// Modern alternative to deprecated csurf package

const crypto = require('crypto');

/**
 * Generate a CSRF token
 * @returns {string} CSRF token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Routes that should be exempt from CSRF protection
 * (typically read-only endpoints or heartbeat/ping endpoints)
 */
const CSRF_EXEMPT_ROUTES = [
  '/api/session/heartbeat',    // Session activity tracking (read-only)
  '/api/chat/track-time',      // Time tracking heartbeat (read-only)
  '/api/session/end',          // Session end via sendBeacon (can't send custom headers)
  '/api/session/save-mastery', // Mastery save via sendBeacon (can't send custom headers)
  '/api/billing/webhook'       // Stripe webhook (external, uses signature verification)
];

/**
 * Middleware to attach CSRF token to request
 * Generates token and sets it in cookie and makes it available to views
 */
function csrfProtection(req, res, next) {
  // Skip CSRF for exempt routes
  if (CSRF_EXEMPT_ROUTES.includes(req.path)) {
    return next();
  }

  // Skip CSRF for GET, HEAD, OPTIONS requests (safe methods)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    // Generate token for forms on GET requests
    const token = generateToken();

    // Set token in cookie (NOT httpOnly - JavaScript needs to read it for double-submit pattern)
    res.cookie('_csrf', token, {
      httpOnly: false, // MUST be false so JavaScript can read it and send in header
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'lax', // 'lax' allows cookie on top-level navigations (links), 'strict' blocks them
      maxAge: 3600000 // 1 hour
    });

    // Make token available to templates/JSON responses
    req.csrfToken = () => token;
    res.locals.csrfToken = token;

    return next();
  }

  // For POST, PUT, DELETE, PATCH - verify token
  const cookieToken = req.cookies._csrf;
  const headerToken = req.headers['x-csrf-token'] || req.body._csrf;

  if (!cookieToken || !headerToken) {
    console.warn('[CSRF] Missing CSRF token:', {
      method: req.method,
      url: req.url,
      hasCookie: !!cookieToken,
      hasHeader: !!headerToken
    });

    return res.status(403).json({
      success: false,
      message: 'CSRF token missing',
      code: 'CSRF_MISSING'
    });
  }

  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    console.warn('[CSRF] Invalid CSRF token:', {
      method: req.method,
      url: req.url,
      user: req.user?.username
    });

    return res.status(403).json({
      success: false,
      message: 'Invalid CSRF token',
      code: 'CSRF_INVALID'
    });
  }

  // Token is valid, continue
  next();
}

/**
 * Middleware to exempt specific routes from CSRF protection
 * Use sparingly and only for routes that have alternative protection
 */
function csrfExempt(req, res, next) {
  req.csrfExempt = true;
  next();
}

/**
 * Conditional CSRF protection - only applies if not exempted
 */
function conditionalCsrfProtection(req, res, next) {
  if (req.csrfExempt) {
    return next();
  }
  return csrfProtection(req, res, next);
}

module.exports = {
  csrfProtection,
  csrfExempt,
  conditionalCsrfProtection,
  generateToken
};
