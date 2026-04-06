// config/middleware.js — Express middleware configuration
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const passport = require('passport');
const MongoStore = require('connect-mongo');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const crypto = require('crypto');
const fs = require('fs');

const path = require('path');

const logger = require('../utils/logger');
const { csrfProtection } = require('../middleware/csrf');
const { handleImpersonation, enforceReadOnly } = require('../middleware/impersonation');
const { trackErrors, clientErrorHandler } = require('../middleware/errorTracking');
const { requestId } = require('../middleware/requestId');

require('../auth/passport-config');

const isProduction = process.env.NODE_ENV === 'production';

// Rate limiters (exported for use in route registration)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  keyGenerator: (req) => req.user ? req.user._id.toString() : req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).json({
      message: 'Too many requests, please try again shortly.',
      retryAfter: Math.max(retryAfter, 5),
    });
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    res.status(429).json({
      message: 'Too many login attempts from this IP. Please try again after 15 minutes.',
      retryAfter: 900,
    });
  },
});

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).json({
      message: 'Too many signup attempts. Please try again in a few minutes.',
      retryAfter: 900,
    });
  },
});

function configureMiddleware(app) {
  app.set('trust proxy', 1);

  // HTTPS & www redirect in production
  if (isProduction) {
    app.use((req, res, next) => {
      if (req.originalUrl.startsWith('/api/billing/webhook')) return next();
      if (req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(301, `https://${req.hostname}${req.originalUrl}`);
      }
      if (req.hostname === 'www.mathmatix.ai') {
        return res.redirect(301, `https://mathmatix.ai${req.originalUrl}`);
      }
      next();
    });
  }

  // CORS — match original production config
  app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  }));

  // Stripe webhook needs raw body — MUST be before express.json()
  app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

  app.use(compression({
    level: 6, // Good balance of speed vs compression ratio (default is 6, but explicit)
    threshold: 1024, // Skip tiny responses under 1 KB
    filter: (req, res) => {
      if (req.headers.accept === 'text/event-stream') return false;
      return compression.filter(req, res);
    },
  }));

  // Serve static assets (fonts, CSS, JS, images) BEFORE session/CSRF middleware.
  // This prevents static file requests from failing when the session store is
  // temporarily unreachable, and avoids unnecessary middleware overhead for assets.
  // HTML files are excluded — they need CSP nonce injection from the later pipeline.
  const publicDir = path.join(__dirname, '..', 'public');

  // Vendor assets (versioned/pinned libs) — 30-day immutable cache
  app.use('/vendor', express.static(path.join(publicDir, 'vendor'), {
    index: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable'); // 30 days
    },
  }));

  app.use((req, res, next) => {
    // Skip HTML files — they need CSP nonce injection via the full middleware pipeline
    if (req.method === 'GET' && /\.html?$/i.test(req.path)) return next();
    // Skip API routes
    if (req.path.startsWith('/api/')) return next();
    next();
  }, express.static(publicDir, {
    index: false, // Don't serve index.html — that goes through auth/CSP nonce pipeline
    setHeaders: (res, filePath) => {
      if (/sw\.js$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache'); // Service worker must always be fresh
      } else if (/\.(woff2?|ttf|eot)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable'); // 30 days — fonts never change
      } else if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|webp)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days
      } else {
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day default
      }
    },
  }));

  // Request ID for tracing — runs early so all downstream middleware/errors are traceable
  app.use(requestId);

  app.use(express.json({ limit: '1mb' })); // Tightened from 10mb — uploads use multer, not JSON
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: 'sessions',
      ttl: 7 * 24 * 60 * 60,
      touchAfter: 300,
    }),
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // Impersonation middleware — must run after passport
  app.use(handleImpersonation);
  app.use(enforceReadOnly);

  // CSP Nonce middleware
  app.use((req, res, next) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.cspNonce = nonce;

    const originalSendFile = res.sendFile.bind(res);
    res.sendFile = function (filePath, options, callback) {
      if (typeof options === 'function') {
        callback = options;
        options = undefined;
      }
      if (typeof filePath === 'string' && filePath.endsWith('.html')) {
        fs.readFile(filePath, 'utf8', (err, html) => {
          if (err) return callback ? callback(err) : next(err);
          html = html.replace(/<script(?![^>]*\bsrc\b)(?![^>]*\bnonce\b)/gi, `<script nonce="${nonce}"`);

          // Inject PWA support (manifest, meta tags, service worker) into all HTML pages
          if (!html.includes('rel="manifest"')) {
            const pwaTags = [
              '<link rel="manifest" href="/manifest.json" />',
              '<meta name="theme-color" content="#12B3B3" />',
              '<meta name="mobile-web-app-capable" content="yes" />',
              '<meta name="apple-mobile-web-app-capable" content="yes" />',
              '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
              '<meta name="apple-mobile-web-app-title" content="MATHMATIX" />',
              '<link rel="apple-touch-icon" href="/images/icon-192x192.png" />',
              '<link rel="stylesheet" href="/css/pwa.css" />',
              `<script src="/js/pwa-register.js" nonce="${nonce}" defer></script>`,
            ].join('\n  ');
            html = html.replace('</head>', `  ${pwaTags}\n</head>`);
          } else if (!html.includes('pwa-register.js')) {
            // Page already has manifest link (e.g. chat.html) — just add the missing pieces
            const pwaExtras = [
              '<link rel="apple-touch-icon" href="/images/icon-192x192.png" />',
              '<link rel="stylesheet" href="/css/pwa.css" />',
              `<script src="/js/pwa-register.js" nonce="${nonce}" defer></script>`,
            ].join('\n  ');
            html = html.replace('</head>', `  ${pwaExtras}\n</head>`);
          }

          res.type('html').send(html);
        });
      } else {
        if (callback) {
          originalSendFile(filePath, options || {}, callback);
        } else if (options) {
          originalSendFile(filePath, options);
        } else {
          originalSendFile(filePath);
        }
      }
    };
    next();
  });

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://cdnjs.cloudflare.com',
          'https://cdn.jsdelivr.net',
          'https://unpkg.com',
          'https://www.googletagmanager.com',
          'https://connect.facebook.net',
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", 'https://api.openai.com', 'https://api.mathpix.com', 'https://api.cartesia.ai', 'https://cdn.jsdelivr.net', 'https://clever.com', 'https://api.clever.com', 'https://www.google-analytics.com', 'https://www.googletagmanager.com', 'https://connect.facebook.net', 'https://*.google.com'],
        workerSrc: ["'self'", 'blob:'],
        mediaSrc: ["'self'", 'blob:', 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],       // Prevents <base> tag hijacking
        formAction: ["'self'"],    // Limits form submission targets
        frameSrc: ["'self'", 'https://www.commoncurriculum.com', 'https://www.commonplanner.com'],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    xssFilter: true,
    noSniff: true,
    hidePoweredBy: true,
    frameguard: { action: 'deny' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    dnsPrefetchControl: { allow: true }, // Allow DNS prefetch for CDN domains (jsdelivr, cloudflare, google fonts)
  }));

  // Permissions-Policy header
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy',
      'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
    );
    next();
  });

  app.use('/api/', apiLimiter);

  // CSRF Protection
  app.use(csrfProtection);
  app.get('/api/csrf-token', (req, res) => {
    res.json({ success: true });
  });

  // HTTP Request Logging
  app.use(logger.requestLogger);

  // System-wide HTTP error tracking
  app.use(trackErrors);
  app.post('/api/client-errors', express.text({ type: '*/*', limit: '2kb' }), clientErrorHandler);
}

module.exports = { configureMiddleware, authLimiter, signupLimiter };
