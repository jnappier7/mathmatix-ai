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

const logger = require('../utils/logger');
const { csrfProtection } = require('../middleware/csrf');
const { handleImpersonation, enforceReadOnly } = require('../middleware/impersonation');
const { trackErrors, clientErrorHandler } = require('../middleware/errorTracking');

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

  // CORS — whitelist known origins
  const allowedOrigins = (process.env.CORS_ORIGINS || process.env.CLIENT_URL || 'http://localhost:3000')
    .split(',')
    .map(o => o.trim());

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, mobile apps)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-Id'],
    maxAge: 86400, // Cache preflight for 24h
  }));

  // Stripe webhook needs raw body — MUST be before express.json()
  app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

  app.use(compression({
    filter: (req, res) => {
      if (req.headers.accept === 'text/event-stream') return false;
      return compression.filter(req, res);
    },
  }));
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
        connectSrc: ["'self'", 'https://api.openai.com', 'https://api.mathpix.com', 'https://api.elevenlabs.io', 'https://cdn.jsdelivr.net', 'https://clever.com', 'https://api.clever.com', 'https://www.google-analytics.com', 'https://www.googletagmanager.com', 'https://connect.facebook.net', 'https://*.google.com'],
        workerSrc: ["'self'", 'blob:'],
        mediaSrc: ["'self'", 'blob:', 'data:'],
        objectSrc: ["'none'"],
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
    dnsPrefetchControl: { allow: false },
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
