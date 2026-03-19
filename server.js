// server.js
try { require("dotenv").config(); } catch (_) { /* Production: env vars set by host */ }

// Initialize logger early (before other imports)
const logger = require('./utils/logger');
logger.info('🚀 Starting MATHMATIX.AI Server');

// --- 1. ENVIRONMENT VALIDATION ---
const requiredEnvVars = [
  'MONGO_URI',
  'SESSION_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'MICROSOFT_CALLBACK_URL',
  'MATHPIX_APP_ID',
  'MATHPIX_APP_KEY',
  'OPENAI_API_KEY'
];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  logger.error('❌ FATAL ERROR: Missing required environment variables', {
    missing: missingVars
  });
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';

// --- 2. IMPORTS ---
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const passport = require("passport");
const MongoStore = require("connect-mongo");
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const User = require('./models/user');

// --- 3. CONFIGURATIONS ---
require("./auth/passport-config");

// --- 4. MIDDLEWARE & ROUTE IMPORTS ---
const {
  isAuthenticated,
  ensureNotAuthenticated,
  isAdmin,
  isTeacher,
  isParent,
  isStudent,
  isAuthorizedForLeaderboard,
  handleLogout,
  aiEndpointLimiter
} = require("./middleware/auth");

const { csrfProtection } = require("./middleware/csrf");

const loginRoutes = require('./routes/login');
const signupRoutes = require('./routes/signup');
const passwordResetRoutes = require('./routes/passwordReset');
const authRoutes = require('./routes/auth');  // Email verification and auth utilities
const studentRoutes = require('./routes/student');
const teacherRoutes = require('./routes/teacher');
const analyticsRoutes = require('./routes/analytics');
const adminRoutes = require('./routes/admin');
const parentRoutes = require('./routes/parent');
const leaderboardRoutes = require('./routes/leaderboard');
const chatRoutes = require('./routes/chat');
const conversationsRoutes = require('./routes/conversations');  // Topic-based conversations & assessment
const speakRoutes = require('./routes/speak');
const voiceRoutes = require('./routes/voice');  // Real-time voice chat (GPT-style)
const voiceTestRoutes = require('./routes/voice-test');  // Voice diagnostics
const voiceTutorRoutes = require('./routes/voiceTutor');  // Immersive voice tutor session

const uploadRoutes = require('./routes/upload');
const chatWithFileRoutes = require('./routes/chatWithFile'); 
const welcomeRoutes = require('./routes/welcome');
const rapportBuildingRoutes = require('./routes/rapportBuilding');
const { router: memoryRouter } = require('./routes/memory');
const guidedLessonRoutes = require('./routes/guidedLesson');
const summaryGeneratorRouter = require('./routes/summary_generator');
const avatarRoutes = require('./routes/avatar');
const curriculumRoutes = require('./routes/curriculum');
const assessmentRoutes = require('./routes/assessment');
const screenerRoutes = require('./routes/screener');  // IRT-based adaptive screener (Starting Point)
const growthCheckRoutes = require('./routes/growthCheck');  // Growth Check (short progress assessment)
const masteryRoutes = require('./routes/mastery');  // Mastery mode (placement + interview + badges)
const masteryChatRoutes = require('./routes/masteryChat');  // Mastery mode chat endpoint
const reviewRoutes = require('./routes/review');  // Spaced repetition review system
const teacherResourceRoutes = require('./routes/teacherResources');
const settingsRoutes = require('./routes/settings');
const emailRoutes = require('./routes/email');  // Email service for parent reports and notifications
const gradeWorkRoutes = require('./routes/gradeWork');
const quarterlyGrowthRoutes = require('./routes/quarterlyGrowth');  // Quarterly growth tracking and retention
const factFluencyRoutes = require('./routes/factFluency');  // M∆THBL∆ST Fact Fluency game
const dailyQuestsRoutes = require('./routes/dailyQuests');  // Daily Quests & Streak System
const weeklyChallengesRoutes = require('./routes/weeklyChallenges');  // Weekly Challenges System
const challengeRoutes = require('./routes/challenges');  // Math Showdown head-to-head challenges
const learningCurveRoutes = require('./routes/learningCurve');  // Learning Curve Visualization & IRT Transparency
const celerationRoutes = require('./routes/celeration');  // Standard Celeration Charts (Precision Teaching)
// REMOVED: Character Rigging Portal (beta feedback indicated this feature was not needed)
const sessionRoutes = require('./routes/session');  // Session management and tracking
const feedbackRoutes = require('./routes/feedback');  // User feedback and bug reports
const tourSurveyRoutes = require('./routes/tourSurvey');  // Tour and survey for alpha testing
const diagramRoutes = require('./routes/diagram');  // Diagram generation for visual learners
const messagingRoutes = require('./routes/messaging');  // Teacher-parent messaging system
const iepTemplatesRoutes = require('./routes/iepTemplates');  // IEP templates for teachers
const roleSwitchRoutes = require('./routes/roleSwitch');  // Unified multi-role login: switch active role
const impersonationRoutes = require('./routes/impersonation');  // User impersonation (student view)
const announcementsRoutes = require('./routes/announcements');  // Teacher-to-student announcements
const adminEmailRoutes = require('./routes/adminEmail');  // Admin bulk email campaigns
const billingRoutes = require('./routes/billing');  // Stripe subscription billing
const affiliateRoutes = require('./routes/affiliate');  // Affiliate / referral program
const schoolLicenseRoutes = require('./routes/schoolLicense');  // School/district license management
const cleverSyncRoutes = require('./routes/cleverSync');  // Clever roster & section sync
const courseRoutes = require('./routes/course');  // Course catalog, enrollment, and progression
const courseSessionRoutes = require('./routes/courseSession');  // Pathway-based course sessions (self-paced)
const courseChatRoutes = require('./routes/courseChat');  // Dedicated course chat (independent from main chat)
const waitlistRoutes = require('./routes/waitlist');  // Pre-launch email waitlist
const { router: dataPrivacyRoutes } = require('./routes/dataPrivacy');  // FERPA/COPPA data deletion & export
const consentRoutes = require('./routes/consent');  // Privacy consent management (COPPA/FERPA)
const TUTOR_CONFIG = require('./utils/tutorConfig');
const demoRoutes = require('./routes/demo');  // Playground demo account login & reset
const supportRoutes = require('./routes/support');  // AI-triaged support tickets

// Usage gate middleware for free tier enforcement
const { usageGate, premiumFeatureGate } = require('./middleware/usageGate');

// Impersonation middleware
const { handleImpersonation, enforceReadOnly } = require('./middleware/impersonation');

// Upload security middleware
const { uploadRateLimiter, validateUpload, scheduleCleanup } = require('./middleware/uploadSecurity');

// --- 5. EXPRESS APP SETUP ---
const app = express();
const PORT = process.env.PORT || 3000;
app.set("trust proxy", 1);

// --- 6. MIDDLEWARE ---

// Enforce HTTPS and redirect www to apex domain in production
if (isProduction) {
  app.use((req, res, next) => {
    // Skip redirects for Stripe webhook — Stripe treats any redirect as a failure
    if (req.originalUrl.startsWith('/api/billing/webhook')) {
      return next();
    }
    // Force HTTPS (Render terminates TLS at the proxy, so check x-forwarded-proto)
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.hostname}${req.originalUrl}`);
    }
    // Redirect www to apex domain (ensures consistent domain + valid SSL cert)
    if (req.hostname === 'www.mathmatix.ai') {
      return res.redirect(301, `https://mathmatix.ai${req.originalUrl}`);
    }
    next();
  });
}

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));
// Stripe webhook needs raw body for signature verification — MUST be before express.json()
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(compression({
  // Skip compression for SSE streaming responses (they handle their own flushing)
  filter: (req, res) => {
    if (req.headers.accept === 'text/event-stream') return false;
    return compression.filter(req, res);
  }
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: false, // Disabled: session touch below handles sliding expiration with less DB writes
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
    ttl: 7 * 24 * 60 * 60, // 7 days
    touchAfter: 300, // Only update session in DB every 5 minutes (reduces write load by ~99%)
  }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Impersonation middleware - must run after passport to access req.user
app.use(handleImpersonation);
app.use(enforceReadOnly);

// CSP Nonce middleware — generates a unique nonce per request and automatically
// injects it into inline <script> tags in HTML responses. This allows inline
// scripts to work with the CSP nonce (which disables 'unsafe-inline').
const crypto = require('crypto');
const fs = require('fs');
app.use((req, res, next) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;

  // Wrap sendFile to inject nonces into HTML files.
  // Normalise the (path[, options][, fn]) overloads before delegating.
  const originalSendFile = res.sendFile.bind(res);
  res.sendFile = function (filePath, options, callback) {
    // Normalise: sendFile(path, fn) → options=undefined, callback=fn
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
      // Pass through to original — preserves all options and callback behaviour
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

// Security Headers with Helmet.js
app.use(helmet({
  // Content Security Policy - allows necessary external resources
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.cspNonce}'`, // Per-request nonce for inline scripts
        "'unsafe-inline'", // Fallback for pages not yet migrated to nonces (ignored when nonce is present in modern browsers)
        "'unsafe-eval'", // Required for MathLive and dynamic math rendering
        "https://cdnjs.cloudflare.com", // Font Awesome
        "https://cdn.jsdelivr.net", // Various CDN resources
        "https://unpkg.com", // MathLive and other packages
        "https://www.googletagmanager.com", // Google Tag Manager / GA4
        "https://connect.facebook.net" // Facebook Pixel
      ],
      scriptSrcAttr: ["'unsafe-inline'"], // Required for inline event handlers (onclick, etc.)
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for inline styles
        "https://cdnjs.cloudflare.com", // Font Awesome
        "https://cdn.jsdelivr.net", // CDN CSS (marked, DOMPurify)
        "https://fonts.googleapis.com" // Google Fonts
      ],
      fontSrc: [
        "'self'",
        "https://cdnjs.cloudflare.com", // Font Awesome
        "https://cdn.jsdelivr.net", // KaTeX fonts
        "https://fonts.gstatic.com", // Google Fonts
        "data:" // Base64 fonts
      ],
      imgSrc: [
        "'self'",
        "data:", // Base64 images
        "blob:", // Blob URLs for uploaded images
        "https:" // Allow HTTPS images (user uploads, external resources)
      ],
      connectSrc: [
        "'self'",
        "https://api.openai.com", // OpenAI API
        "https://api.mathpix.com", // Mathpix OCR
        "https://api.elevenlabs.io", // ElevenLabs TTS
        "https://cdn.jsdelivr.net", // CDN resources and source maps
        "https://clever.com", // Clever SSO
        "https://api.clever.com", // Clever API
        "https://www.google-analytics.com", // GA4 data collection
        "https://www.googletagmanager.com", // GTM data
        "https://connect.facebook.net", // Facebook Pixel data
        "https://*.google.com" // Chrome Speech Recognition API
      ],
      workerSrc: ["'self'", "blob:"], // Allow blob workers for confetti effects
      mediaSrc: ["'self'", "blob:", "data:"], // Audio/video
      objectSrc: ["'none'"], // Disable plugins
      frameSrc: ["'self'", "https://www.commoncurriculum.com", "https://www.commonplanner.com"], // Allow Common Curriculum/Planner schedule iframes
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  // Cross-Origin policies
  crossOriginEmbedderPolicy: false, // Disabled for external CDN resources
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // XSS Protection (legacy browsers)
  xssFilter: true,
  // Prevent MIME sniffing
  noSniff: true,
  // Hide X-Powered-By header
  hidePoweredBy: true,
  // Prevent clickjacking
  frameguard: {
    action: 'deny'
  },
  // HSTS - Force HTTPS in production
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },
  // DNS Prefetch Control - prevents DNS prefetching leaks
  dnsPrefetchControl: {
    allow: false
  }
}));

// Permissions-Policy header - explicitly declare which browser features the site uses
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy',
    'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  );
  next();
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Raised from 120 — active tutoring sessions generate many API calls
  keyGenerator: (req) => {
    // Use user ID when authenticated so school networks (shared IP) don't share a budget
    return req.user ? req.user._id.toString() : req.ip;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).json({
      message: "Too many requests, please try again shortly.",
      retryAfter: Math.max(retryAfter, 5), // At least 5s to avoid rapid retry loops
    });
  },
});
app.use('/api/', apiLimiter);

// Strict rate limiting for login (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Only 5 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count both successful and failed attempts
  handler: (req, res) => {
    res.status(429).json({
      message: "Too many login attempts from this IP. Please try again after 15 minutes.",
      retryAfter: 900
    });
  },
});

// Separate rate limiter for signup — more generous to avoid blocking real users,
// but still prevents automated spam account creation
const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per 15 minutes — enough for typos and retries
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful signups against the limit
  handler: (req, res) => {
    res.status(429).json({
      message: "Too many signup attempts. Please try again in a few minutes.",
      retryAfter: 900
    });
  },
});

// CSRF Protection for all routes
// Applies to POST, PUT, DELETE, PATCH requests
// GET requests generate tokens for forms
app.use(csrfProtection);

// Explicit CSRF token endpoint — lets the frontend recover when the cookie is missing
// (e.g. expired, first visit with cookies delayed). GET through csrfProtection above
// guarantees a fresh _csrf cookie is set, so we just confirm success.
app.get('/api/csrf-token', (req, res) => {
  res.json({ success: true });
});

// HTTP Request Logging
app.use(logger.requestLogger);

// System-wide HTTP error tracking (4xx, 5xx)
const { trackErrors, errorMetricsHandler, clientErrorHandler } = require('./middleware/errorTracking');
app.use(trackErrors);

// Client-side error reporting endpoint (public, no auth needed)
app.post('/api/client-errors', express.text({ type: '*/*', limit: '2kb' }), clientErrorHandler);

// --- 7. DATABASE CONNECTION ---
const { startRetentionSchedule } = require('./utils/dataRetention');

mongoose.connect(process.env.MONGO_URI, {
  maxPoolSize: 50,         // Handle concurrent student requests (default is 10)
  minPoolSize: 5,          // Keep warm connections ready
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    logger.info("✅ Connected to MongoDB", { database: 'MongoDB' });
    // Start data retention sweep (daily cleanup of expired data)
    if (process.env.NODE_ENV !== 'test') {
      startRetentionSchedule();
    }
  })
  .catch(err => {
    logger.error("❌ MongoDB connection error", err);
    process.exit(1); // Exit if database connection fails
  });


// --- 8. ROUTE DEFINITIONS ---

app.use('/login', authLimiter, loginRoutes);
app.use('/signup', signupLimiter, signupRoutes);
app.use('/api/password-reset', authLimiter, passwordResetRoutes);
app.use('/api/auth', authLimiter, authRoutes);  // Email verification (public routes)
app.post('/logout', isAuthenticated, handleLogout);

// --- Google Auth Routes ---
app.get('/auth/google', authLimiter, passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', authLimiter, (req, res, next) => {
    passport.authenticate('google', (err, user, info) => {
        if (err) { return next(err); }
        if (!user) {
            return res.redirect('/login.html');
        }

        // Check if this is a new user requiring enrollment code
        if (user.isPendingEnrollment) {
            // Store pending profile in session (not logged in yet)
            req.session.pendingOAuthProfile = user.pendingProfile;
            console.log('LOG: New Google OAuth user requires enrollment code');
            return res.redirect('/oauth-enrollment.html');
        }

        req.logIn(user, async (err) => {
            if (err) { return next(err); }
            // Update lastLogin timestamp
            try {
                await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
            } catch (updateErr) {
                console.error("ERROR: Failed to update lastLogin:", updateErr);
            }

            // Persist session to MongoDB before redirecting to prevent race condition
            // where the browser follows the redirect before the session is saved
            req.session.save((saveErr) => {
                if (saveErr) { return next(saveErr); }
                if (user.needsProfileCompletion) return res.redirect('/complete-profile.html');
                const userRoles = (user.roles && user.roles.length > 0) ? user.roles : [user.role];
                if (userRoles.length > 1) return res.redirect('/role-picker.html');
                if (user.role === 'student' && !user.selectedTutorId) return res.redirect('/pick-tutor.html');
                if (user.role === 'student' && !user.selectedAvatarId) return res.redirect('/pick-avatar.html');
                const dashboardMap = { student: '/chat.html', teacher: '/teacher-dashboard.html', admin: '/admin-dashboard.html', parent: '/parent-dashboard.html' };
                res.redirect(dashboardMap[user.role] || '/login.html');
            });
        });
    })(req, res, next);
});

// --- Microsoft Auth Routes (FIXED: ADDED MISSING ROUTES) ---
app.get('/auth/microsoft', authLimiter, passport.authenticate('microsoft', { scope: ['user.read'] }));

app.get('/auth/microsoft/callback', authLimiter, (req, res, next) => {
    passport.authenticate('microsoft', (err, user, info) => {
        if (err) { return next(err); }
        if (!user) {
            return res.redirect('/login.html');
        }

        // Check if this is a new user requiring enrollment code
        if (user.isPendingEnrollment) {
            // Store pending profile in session (not logged in yet)
            req.session.pendingOAuthProfile = user.pendingProfile;
            console.log('LOG: New Microsoft OAuth user requires enrollment code');
            return res.redirect('/oauth-enrollment.html');
        }

        req.logIn(user, async (err) => {
            if (err) { return next(err); }
            // Update lastLogin timestamp
            try {
                await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
            } catch (updateErr) {
                console.error("ERROR: Failed to update lastLogin:", updateErr);
            }

            // Persist session to MongoDB before redirecting to prevent race condition
            req.session.save((saveErr) => {
                if (saveErr) { return next(saveErr); }
                if (user.needsProfileCompletion) return res.redirect('/complete-profile.html');
                const userRoles = (user.roles && user.roles.length > 0) ? user.roles : [user.role];
                if (userRoles.length > 1) return res.redirect('/role-picker.html');
                if (user.role === 'student' && !user.selectedTutorId) return res.redirect('/pick-tutor.html');
                if (user.role === 'student' && !user.selectedAvatarId) return res.redirect('/pick-avatar.html');
                const dashboardMap = { student: '/chat.html', teacher: '/teacher-dashboard.html', admin: '/admin-dashboard.html', parent: '/parent-dashboard.html' };
                res.redirect(dashboardMap[user.role] || '/login.html');
            });
        });
    })(req, res, next);
});


// --- Clever SSO Routes (conditional - only if Clever credentials are configured) ---
// NOTE: Library SSO requires session invalidation on shared devices.
// When a new Clever login arrives, any previous session is destroyed first.
if (process.env.CLEVER_CLIENT_ID && process.env.CLEVER_CLIENT_SECRET) {
    app.get('/auth/clever', authLimiter, (req, res, next) => {
        // Shared device support: destroy any existing session before starting Clever auth
        if (req.isAuthenticated()) {
            req.logout((err) => {
                if (err) console.error('WARN: Error clearing previous session for Clever SSO:', err);
                req.session.regenerate((err) => {
                    if (err) console.error('WARN: Error regenerating session for Clever SSO:', err);
                    passport.authenticate('clever')(req, res, next);
                });
            });
        } else {
            passport.authenticate('clever')(req, res, next);
        }
    });

    app.get('/auth/clever/callback', authLimiter, (req, res, next) => {
        passport.authenticate('clever', (err, user, info) => {
            if (err) { return next(err); }
            if (!user) {
                return res.redirect('/login.html');
            }

            // Check if this is a new user requiring enrollment code
            if (user.isPendingEnrollment) {
                // Shared device: regenerate session before storing pending profile
                req.session.regenerate((err) => {
                    if (err) { return next(err); }
                    req.session.pendingOAuthProfile = user.pendingProfile;
                    console.log('LOG: New Clever SSO user requires enrollment code');
                    return res.redirect('/oauth-enrollment.html');
                });
                return;
            }

            // Shared device: regenerate session before logging in the new user
            req.session.regenerate((err) => {
                if (err) { return next(err); }
                req.logIn(user, async (err) => {
                    if (err) { return next(err); }
                    try {
                        await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
                    } catch (updateErr) {
                        console.error("ERROR: Failed to update lastLogin:", updateErr);
                    }

                    // Persist session to MongoDB before redirecting to prevent race condition
                    req.session.save((saveErr) => {
                        if (saveErr) { return next(saveErr); }
                        if (user.needsProfileCompletion) return res.redirect('/complete-profile.html');
                        if (user.role === 'student' && !user.selectedTutorId) return res.redirect('/pick-tutor.html');
                        if (user.role === 'student' && !user.selectedAvatarId) return res.redirect('/pick-avatar.html');
                        const dashboardMap = { student: '/chat.html', teacher: '/teacher-dashboard.html', admin: '/admin-dashboard.html', parent: '/parent-dashboard.html' };
                        res.redirect(dashboardMap[user.role] || '/login.html');
                    });
                });
            });
        })(req, res, next);
    });

    logger.info('✅ Clever SSO routes registered');
}

// API Routes
app.use('/api/admin', isAuthenticated, isAdmin, adminRoutes);
app.get('/api/admin/error-metrics', isAuthenticated, isAdmin, errorMetricsHandler);
app.use('/api/teacher', isAuthenticated, isTeacher, teacherRoutes);
app.use('/api/parent', isAuthenticated, isParent, parentRoutes);
app.use('/api/analytics', isAuthenticated, analyticsRoutes);
app.use('/api/student', isAuthenticated, isStudent, studentRoutes.router);
app.use('/api/leaderboard', isAuthenticated, isAuthorizedForLeaderboard, leaderboardRoutes);
app.use('/api/billing', billingRoutes); // Stripe billing (webhook is pre-parsed with raw body above)
app.use('/api/affiliate', affiliateRoutes); // Affiliate / referral program (some routes public)
app.use('/api/privacy', isAuthenticated, dataPrivacyRoutes); // FERPA/COPPA data deletion & export
app.use('/api/consent', isAuthenticated, consentRoutes); // Privacy consent management (COPPA/FERPA)
app.use('/api/chat', isAuthenticated, aiEndpointLimiter, usageGate, chatRoutes); // Usage-gated for free tier
app.use('/api/conversations', isAuthenticated, conversationsRoutes); // Topic-based conversations & assessment
app.use('/api/speak', isAuthenticated, speakRoutes);
app.use('/api/voice', isAuthenticated, aiEndpointLimiter, premiumFeatureGate('Voice chat'), voiceRoutes); // Premium: voice chat
app.use('/api/voice', isAuthenticated, voiceTestRoutes); // Voice diagnostics (no rate limit on test endpoint)
app.use('/api/voice-tutor', isAuthenticated, aiEndpointLimiter, premiumFeatureGate('Voice chat'), voiceTutorRoutes); // Premium: immersive voice tutor

app.use('/api/upload', isAuthenticated, uploadRateLimiter, aiEndpointLimiter, premiumFeatureGate('File uploads'), uploadRoutes); // Premium: 1 free taste, then Mathmatix+ required
app.use('/api/chat-with-file', isAuthenticated, aiEndpointLimiter, usageGate, chatWithFileRoutes); // Usage-gated for free tier
app.use('/api/welcome-message', isAuthenticated, welcomeRoutes);
app.use('/api/rapport', isAuthenticated, rapportBuildingRoutes);
app.use('/api/memory', isAuthenticated, memoryRouter);
app.use('/api/summary', isAuthenticated, summaryGeneratorRouter); // SECURITY FIX: Added authentication to prevent unauthorized access
app.use('/api/avatars', isAuthenticated, avatarRoutes);
app.use('/api/avatar', isAuthenticated, avatarRoutes); // DiceBear avatar customization endpoints

// Public API routes (no auth required) — must come BEFORE the catch-all /api mount below
app.use('/api/waitlist', waitlistRoutes);          // Pre-launch waitlist
app.use('/api/demo', demoRoutes);                  // Playground demo account login & reset

app.use('/api', isAuthenticated, diagramRoutes); // Controlled diagram generation for visual learners
app.use('/api/curriculum', isAuthenticated, curriculumRoutes); // Curriculum schedule management
app.use('/api/courses', isAuthenticated, premiumFeatureGate('Courses'), courseRoutes); // Premium: course catalog, enrollment, and progression
app.use('/api/course-sessions', isAuthenticated, premiumFeatureGate('Courses'), courseSessionRoutes); // Premium: pathway-based course sessions
app.use('/api/course-chat', isAuthenticated, aiEndpointLimiter, usageGate, courseChatRoutes); // Dedicated course chat (usage-gated)
app.use('/api/teacher-resources', isAuthenticated, teacherResourceRoutes); // Teacher file uploads and resource management
app.use('/api/guidedLesson', isAuthenticated, guidedLessonRoutes);
app.use('/api/assessment', isAuthenticated, assessmentRoutes); // Skills assessment for adaptive learning
app.use('/api/screener', isAuthenticated, screenerRoutes); // IRT-based adaptive screener (Starting Point)
app.use('/api/growth-check', isAuthenticated, growthCheckRoutes); // Growth Check (short progress assessment)
app.use('/api/mastery', isAuthenticated, masteryRoutes); // Mastery mode (placement → interview → badges)
app.use('/api/mastery/chat', isAuthenticated, aiEndpointLimiter, usageGate, masteryChatRoutes); // Mastery mode dedicated chat (usage-gated)
app.use('/api/review', isAuthenticated, reviewRoutes); // Spaced repetition review system
app.use('/api/settings', isAuthenticated, settingsRoutes); // User settings and password management
app.use('/api/email', isAuthenticated, emailRoutes); // Email service for parent reports and notifications
app.use('/api/grade-work', isAuthenticated, aiEndpointLimiter, premiumFeatureGate('Work grading'), gradeWorkRoutes); // Premium: 1 free taste, then Mathmatix+ required
app.use('/api/quarterly-growth', isAuthenticated, quarterlyGrowthRoutes); // Quarterly growth tracking and retention analytics
app.use('/api/fact-fluency', isAuthenticated, factFluencyRoutes); // M∆THBL∆ST Fact Fluency - Math facts practice game
app.use('/api', isAuthenticated, dailyQuestsRoutes); // Daily Quests & Streak System for mastery mode
app.use('/api', isAuthenticated, weeklyChallengesRoutes); // Weekly Challenges System for engagement
app.use('/api/challenges', isAuthenticated, challengeRoutes); // Math Showdown head-to-head challenges
app.use('/api', isAuthenticated, learningCurveRoutes); // Learning Curve Visualization & IRT transparency
app.use('/api', isAuthenticated, celerationRoutes); // Standard Celeration Charts for fact fluency
// REMOVED: Character Rigging Portal route (beta feedback indicated this feature was not needed)
app.use('/api/session', isAuthenticated, sessionRoutes); // Session management (idle timeout, auto-save, summaries)
app.use('/api/feedback', isAuthenticated, feedbackRoutes); // User feedback and bug reports for Alpha testing
app.use('/api/support', isAuthenticated, supportRoutes); // AI-triaged support tickets
app.use('/api/user', isAuthenticated, tourSurveyRoutes); // Tour and survey for alpha testing
app.use('/api/messages', isAuthenticated, messagingRoutes); // Teacher-parent messaging system
app.use('/api/announcements', isAuthenticated, announcementsRoutes); // Teacher-to-student announcements (IM style)
app.use('/api/admin/email', isAuthenticated, isAdmin, adminEmailRoutes); // Admin bulk email campaigns
app.use('/api/school-licenses', isAuthenticated, isAdmin, schoolLicenseRoutes); // School/district license management
// Clever webhook (public — Clever sends events directly, no user auth; must be BEFORE admin-gated mount)
app.post('/api/clever-sync/webhook', cleverSyncRoutes);
app.use('/api/clever-sync', isAuthenticated, isAdmin, cleverSyncRoutes); // Clever roster & section sync (admin only)
app.use('/api/iep-templates', isAuthenticated, isTeacher, iepTemplatesRoutes); // IEP templates for teachers
app.use('/api/impersonation', isAuthenticated, impersonationRoutes); // User impersonation (student view) for admins/teachers/parents
app.use('/api/role-switch', isAuthenticated, roleSwitchRoutes); // Unified multi-role login: switch active role

// User Profile & Settings Routes
app.get("/user", isAuthenticated, async (req, res) => {
    try {
        if (!req.user) {
            return res.json({ user: null });
        }

        const { getTutorsToUnlock } = require('./utils/unlockTutors');
        const BRAND_CONFIG = require('./utils/brand');

        // Fast path: use .lean() for a plain JS object (5x faster than Mongoose doc)
        const userObj = await User.findById(req.user._id).lean();

        if (!userObj) {
            return res.json({ user: null });
        }

        // Check if any corrections are needed before doing a full write
        let needsSave = false;

        // Check for retroactive tutor unlocks
        if (userObj.level) {
            const tutorsToUnlock = getTutorsToUnlock(userObj.level, userObj.unlockedItems || []);
            if (tutorsToUnlock.length > 0) {
                userObj.unlockedItems = userObj.unlockedItems || [];
                tutorsToUnlock.forEach(tutorId => {
                    if (!userObj.unlockedItems.includes(tutorId)) {
                        userObj.unlockedItems.push(tutorId);
                    }
                });
                needsSave = true;
            }
        }

        // Recalculate level from XP if they're out of sync (safety net)
        let correctLevel = 1;
        while ((userObj.xp || 0) >= BRAND_CONFIG.cumulativeXpForLevel(correctLevel + 1)) {
            correctLevel++;
        }
        if ((userObj.level || 1) !== correctLevel) {
            console.warn(`⚠️ [XP] Level/XP mismatch for ${userObj.firstName}: level=${userObj.level}, xp=${userObj.xp}, correctLevel=${correctLevel}. Auto-correcting.`);
            userObj.level = correctLevel;
            needsSave = true;
        }

        // Only hit the DB for a write if corrections were actually needed
        if (needsSave) {
            const updates = {};
            if (userObj.unlockedItems) updates.unlockedItems = userObj.unlockedItems;
            if (userObj.level === correctLevel) updates.level = correctLevel;
            await User.updateOne({ _id: req.user._id }, { $set: updates });
        }

        // Attach computed XP fields so the frontend can display progress on page load
        const level = userObj.level || 1;
        const xpStart = BRAND_CONFIG.cumulativeXpForLevel(level);
        userObj.xpForCurrentLevel = Math.max(0, (userObj.xp || 0) - xpStart);
        userObj.xpForNextLevel = BRAND_CONFIG.xpRequiredForLevel(level);

        res.json({ user: userObj });
    } catch (error) {
        console.error('[/user] Error:', error.message);
        res.status(500).json({ error: 'Failed to load user data', message: error.message });
    }
});

// Switch active role — legacy endpoint, delegates to /api/role-switch
app.use('/api/user/switch-role', isAuthenticated, roleSwitchRoutes);

app.patch('/api/user/settings', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const allowedUpdates = [
            'firstName', 'lastName', 'gradeLevel', 'mathCourse',
            'tonePreference', 'learningStyle', 'interests', 'needsProfileCompletion',
            'selectedTutorId', 'selectedAvatarId', 'reportFrequency', 'goalViewPreference',
            'parentTone', 'parentLanguage', 'preferredLanguage', 'preferences'
        ];

        let hasChanges = false;
        for (const key in req.body) {
            if (allowedUpdates.includes(key)) {
                user[key] = req.body[key];
                hasChanges = true;
            }
        }
        if (req.body.firstName || req.body.lastName) {
             user.name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        }

        if (!hasChanges) {
             return res.status(400).json({ message: 'No valid fields provided for update.' });
        }
        
        await user.save();
        res.json({ success: true, message: 'Profile settings updated successfully!', user: user.toObject() });
    } catch (error) {
        console.error('Error updating user settings:', error);
        res.status(500).json({ message: 'Failed to update user settings.' });
    }
});

// Calculator access route - accessible by any authenticated user
// Students check their teacher's calculator settings, others get full access
app.get('/api/calculator/access', isAuthenticated, async (req, res) => {
    try {
        // Non-students always have access
        if (req.user.role !== 'student') {
            return res.json({
                success: true,
                calculatorAccess: 'always',
                message: 'Non-student users have full calculator access'
            });
        }

        // Student without teacher = no restrictions
        if (!req.user.teacherId) {
            return res.json({
                success: true,
                calculatorAccess: 'always',
                message: 'No assigned teacher'
            });
        }

        // Get teacher's calculator settings
        const teacher = await User.findById(req.user.teacherId)
            .select('classAISettings.calculatorAccess classAISettings.calculatorNote firstName lastName')
            .lean();

        if (!teacher || !teacher.classAISettings) {
            return res.json({
                success: true,
                calculatorAccess: 'skill-based',
                message: 'Teacher has not configured settings'
            });
        }

        const calcAccess = teacher.classAISettings.calculatorAccess || 'skill-based';
        const calcNote = teacher.classAISettings.calculatorNote || '';

        res.json({
            success: true,
            calculatorAccess: calcAccess,
            calculatorNote: calcNote,
            teacherName: `${teacher.firstName} ${teacher.lastName}`
        });

    } catch (error) {
        console.error('Error fetching calculator access:', error);
        res.status(500).json({
            success: false,
            calculatorAccess: 'skill-based',
            message: 'Error fetching settings'
        });
    }
});

// --- 9. HTML ROUTES (MUST BE BEFORE STATIC MIDDLEWARE) ---

// Protected route for serving teacher resource files
app.get('/uploads/teacher-resources/:teacherId/:filename', isAuthenticated, async (req, res) => {
    try {
        const { teacherId, filename } = req.params;
        const user = await User.findById(req.user._id);

        // Allow teachers to access their own files, or students to access their teacher's published files
        const isOwnerTeacher = user.role === 'teacher' && user._id.toString() === teacherId;
        const isStudentOfTeacher = user.role === 'student' && user.teacherId && user.teacherId.toString() === teacherId;

        if (!isOwnerTeacher && !isStudentOfTeacher) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Students must only access published resources
        if (isStudentOfTeacher) {
            const TeacherResource = require('./models/teacherResource');
            const resource = await TeacherResource.findOne({
                teacherId,
                storedFilename: { $regex: new RegExp(filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') },
            });
            if (!resource || resource.isPublished === false) {
                return res.status(403).json({ message: 'This resource is not currently available' });
            }
        }

        const filePath = path.join(__dirname, 'uploads', 'teacher-resources', teacherId, filename);
        res.sendFile(filePath);
    } catch (error) {
        console.error('Error serving teacher resource:', error);
        res.status(500).json({ message: 'Failed to load resource' });
    }
});

// Serve tutor config data as a JS file
app.get('/js/tutor-config-data.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'utils', 'tutorConfig.js'));
});

// Public HTML routes (unauthenticated pages)
app.get("/", ensureNotAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/login.html", ensureNotAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/signup.html", ensureNotAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "signup.html")));
app.get("/forgot-password.html", (req, res) => res.sendFile(path.join(__dirname, "public", "forgot-password.html")));
app.get("/reset-password.html", (req, res) => res.sendFile(path.join(__dirname, "public", "reset-password.html")));
app.get("/privacy.html", (req, res) => res.sendFile(path.join(__dirname, "public", "privacy.html")));
app.get("/terms.html", (req, res) => res.sendFile(path.join(__dirname, "public", "terms.html")));
app.get("/demo.html", (req, res) => res.sendFile(path.join(__dirname, "public", "demo.html")));

// Pricing page (public — accessible to everyone for conversion)
app.get("/pricing.html", (req, res) => res.sendFile(path.join(__dirname, "public", "pricing.html")));

// Affiliate program page (requires login)
app.get("/affiliate.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "affiliate.html")));

// Protected HTML routes (require authentication)
app.get("/role-picker.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "role-picker.html")));
app.get("/complete-profile.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "complete-profile.html")));
app.get("/pick-tutor.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "pick-tutor.html")));
app.get("/pick-avatar.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "pick-avatar.html")));
app.get("/chat.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "chat.html")));
app.get("/canvas.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "canvas.html")));

// Student-specific protected routes
app.get("/badge-map.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "badge-map.html")));
app.get("/screener.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "screener.html")));
app.get("/mastery-chat.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "mastery-chat.html")));
app.get("/mastery-arcade.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "mastery-arcade.html")));
app.get("/fact-fluency-blaster.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "fact-fluency-blaster.html")));
app.get("/number-run.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "number-run.html")));
app.get("/learning-curves.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "learning-curves.html")));
app.get("/my-celeration-charts.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "my-celeration-charts.html")));
app.get("/my-speed-progress.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "my-speed-progress.html")));
app.get("/progress.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "progress.html")));
app.get("/student-dashboard.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "student-dashboard.html")));
app.get("/weekly-challenges.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "weekly-challenges.html")));
app.get("/daily-quests-widget.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "daily-quests-widget.html")));
app.get("/calculator.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "calculator.html")));
app.get("/math-showdown.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "math-showdown.html")));

// Admin-specific protected routes
app.get("/admin-dashboard.html", isAuthenticated, isAdmin, (req, res) => res.sendFile(path.join(__dirname, "public", "admin-dashboard.html")));
app.get("/admin-upload.html", isAuthenticated, isAdmin, (req, res) => res.sendFile(path.join(__dirname, "public", "admin-upload.html")));

// Teacher-specific protected routes
app.get("/teacher-dashboard.html", isAuthenticated, isTeacher, (req, res) => res.sendFile(path.join(__dirname, "public", "teacher-dashboard.html")));
app.get("/teacher-celeration-dashboard.html", isAuthenticated, isTeacher, (req, res) => res.sendFile(path.join(__dirname, "public", "teacher-celeration-dashboard.html")));
// REMOVED: Character Rigging page (beta feedback indicated this feature was not needed)

// Parent-specific protected routes
app.get("/parent-dashboard.html", isAuthenticated, isParent, (req, res) => res.sendFile(path.join(__dirname, "public", "parent-dashboard.html")));

// Avatar Builder page (authenticated users only)
app.get("/avatar-builder.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "avatar-builder.html")));

// Upload page (authenticated users only)
app.get("/upload.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "upload.html")));

// Redirect old fact-fluency URL to correct one
app.get("/fact-fluency-practice.html", (req, res) => res.redirect(301, "/fact-fluency-blaster.html"));

// --- 10. STATIC FILE SERVING (AFTER ALL ROUTE DEFINITIONS) ---
// IMPORTANT: This must come AFTER all HTML route definitions to ensure authentication checks run first
// Cache static assets (JS, CSS, images, fonts) so browsers don't re-download on every page load
const staticCacheOptions = { maxAge: '1d', etag: true, lastModified: true };
app.use(express.static(path.join(__dirname, "public"), staticCacheOptions));
app.use('/images', express.static(path.join(__dirname, 'public', 'images'), staticCacheOptions));

// Express error logging middleware (catch unhandled errors)
app.use(logger.errorLogger);

// Fallback for 404
app.get("*", (req, res) => {
  res.status(404).send(`Cannot GET ${req.path}`);
});


// --- 11. SAFETY & SECURITY INITIALIZATION ---
// uploadSecurity already imported near other middleware imports above

// Start auto-deletion scheduler for old uploads (30-day retention)
scheduleCleanup();
logger.info('🛡️ Upload security: Auto-deletion scheduler initialized', {
  retention: '30 days',
  service: 'upload-security'
});

// --- 12. SERVER LISTENER ---
app.listen(PORT, () => {
  logger.info(`🚀 M∆THM∆TIΧ AI is live on http://localhost:${PORT}`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development'
  });
});