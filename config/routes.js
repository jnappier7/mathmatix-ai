// config/routes.js — Route registration
const path = require('path');
const fs = require('fs');
const passport = require('passport');
const express = require('express');
const mongoose = require('mongoose');

const rateLimit = require('express-rate-limit');
const Sentry = require('@sentry/node');

const logger = require('../utils/logger');
const { applyDobToUser } = require('../utils/dob');
const User = require('../models/user');

// Stricter rate limiter for unauthenticated AI endpoints (trial chat)
const trialChatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 requests/hour per IP — generous for trial, blocks abuse
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: 'Trial chat limit reached. Sign up for unlimited access!',
      retryAfter: 3600,
    });
  },
});

// Anonymous pop-quiz (Facebook ad funnel) — votes + tally reads are cheap,
// but keep an abuse ceiling per IP.
const quizLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'Slow down a little — try again in a bit.' });
  },
});

const {
  isAuthenticated,
  ensureNotAuthenticated,
  isAdmin,
  isTeacher,
  isParent,
  isStudent,
  isAuthorizedForLeaderboard,
  handleLogout,
  aiEndpointLimiter,
} = require('../middleware/auth');

const { errorMetricsHandler } = require('../middleware/errorTracking');
// Own-consent gate for AI endpoints (COPPA point of collection/disclosure).
// Staged rollout via CONSENT_ENFORCEMENT=off|log|enforce, default log.
const { requireOwnConsent, consentMetricsHandler } = require('../middleware/consentGate');
const { requireThirteenPlus } = require('../middleware/ageGate');
const { usageGate, usageGateAllMethods, premiumFeatureGate } = require('../middleware/usageGate');
const { uploadRateLimiter, scheduleCleanup, getRetentionDays } = require('../middleware/uploadSecurity');
const { scheduleDemoCleanup } = require('../utils/demoClone');

// Route imports
const loginRoutes = require('../routes/login');
const signupRoutes = require('../routes/signup');
const passwordResetRoutes = require('../routes/passwordReset');
const authRoutes = require('../routes/auth');
const studentRoutes = require('../routes/student');
const teacherRoutes = require('../routes/teacher');
const analyticsRoutes = require('../routes/analytics');
const adminRoutes = require('../routes/admin');
const parentRoutes = require('../routes/parent');
const leaderboardRoutes = require('../routes/leaderboard');
const chatRoutes = require('../routes/chat');
const studentMovesRoutes = require('../routes/studentMoves');
const conversationsRoutes = require('../routes/conversations');
const speakRoutes = require('../routes/speak');
const animationStudioRoutes = require('../routes/animationStudio');
const voiceRoutes = require('../routes/voice');
const voiceTestRoutes = require('../routes/voice-test');
const voiceTutorRoutes = require('../routes/voiceTutor');
const uploadRoutes = require('../routes/upload');
const uploadClassifyRoutes = require('../routes/uploadClassify');
// chatWithFile: REMOVED — file uploads consolidated into /api/chat
const welcomeRoutes = require('../routes/welcome');
const rapportBuildingRoutes = require('../routes/rapportBuilding');
const { router: memoryRouter } = require('../routes/memory');
const guidedLessonRoutes = require('../routes/guidedLesson');
const summaryGeneratorRouter = require('../routes/summary_generator');
const avatarRoutes = require('../routes/avatar');
const cosmeticsRoutes = require('../routes/cosmetics');
const curriculumRoutes = require('../routes/curriculum');
const assessmentRoutes = require('../routes/assessment');
const screenerRoutes = require('../routes/screener');
const checkpointRoutes = require('../routes/checkpoint');
const actTestRoutes = require('../routes/actTest');
const calcBootcampRoutes = require('../routes/calcBootcamp');
const masteryRoutes = require('../routes/mastery');
const nudgeRoutes = require('../routes/nudges');
// masteryChat: REMOVED — mastery mode consolidated into /api/chat with { mastery: true }
const reviewRoutes = require('../routes/review');
const teacherResourceRoutes = require('../routes/teacherResources');
const settingsRoutes = require('../routes/settings');
const emailRoutes = require('../routes/email');
const gradeWorkRoutes = require('../routes/gradeWork');
const quarterlyGrowthRoutes = require('../routes/quarterlyGrowth');
// const factFluencyRoutes = require('../routes/factFluency'); // Shelved: no real data
const dailyQuestsRoutes = require('../routes/dailyQuests');
const weeklyChallengesRoutes = require('../routes/weeklyChallenges');
const challengeRoutes = require('../routes/challenges');
const learningCurveRoutes = require('../routes/learningCurve');
// const celerationRoutes = require('../routes/celeration'); // Shelved: no real data
const sessionRoutes = require('../routes/session');
const feedbackRoutes = require('../routes/feedback');
const tourSurveyRoutes = require('../routes/tourSurvey');
const messagingRoutes = require('../routes/messaging');
const iepTemplatesRoutes = require('../routes/iepTemplates');
const roleSwitchRoutes = require('../routes/roleSwitch');
const impersonationRoutes = require('../routes/impersonation');
const announcementsRoutes = require('../routes/announcements');
const adminEmailRoutes = require('../routes/adminEmail');
const billingRoutes = require('../routes/billing');
const affiliateRoutes = require('../routes/affiliate');
const schoolLicenseRoutes = require('../routes/schoolLicense');
const cleverSyncRoutes = require('../routes/cleverSync');
const courseRoutes = require('../routes/course');
const courseSessionRoutes = require('../routes/courseSession');
const courseChatRoutes = require('../routes/courseChat');
const waitlistRoutes = require('../routes/waitlist');
const { router: dataPrivacyRoutes } = require('../routes/dataPrivacy');
const consentRoutes = require('../routes/consent');
const consentVerifyRoutes = require('../routes/consentVerify');
const demoRoutes = require('../routes/demo');
const trialChatRoutes = require('../routes/trialChat');
const quizRoutes = require('../routes/quiz');
const publicStatsRoutes = require('../routes/publicStats');
const supportRoutes = require('../routes/support');
const imageSearchRoutes = require('../routes/imageSearch');
const browserLockRoutes = require('../routes/browserLock');
const practicePackRoutes = require('../routes/practicePack');
const notebookRoutes = require('../routes/notebook');
const { buildFeaturesScript } = require('../utils/featureFlags');
const { desktopRouter: phoneLinkRoutes, phoneRouter: phoneUploadRoutes } = require('../routes/phoneLink');
const transcriptFlagsRoutes = require('../routes/transcriptFlags');
const notificationsRoutes = require('../routes/notifications');
const onboardingRoutes = require('../routes/onboarding');
const TUTOR_CONFIG = require('../utils/tutorConfig');
const lifecycle = require('../utils/lifecycle');

function registerRoutes(app, { authLimiter, signupLimiter }) {
  // --- Health Check (public, no auth) ---
  app.get('/api/health', async (req, res) => {
    const checks = {};
    let status = 'healthy';

    // Database connectivity
    try {
      const dbState = mongoose.connection.readyState;
      const dbStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
      checks.database = { status: dbState === 1 ? 'ok' : 'degraded', state: dbStates[dbState] || 'unknown' };
      if (dbState !== 1) status = 'degraded';
    } catch (err) {
      checks.database = { status: 'error', message: err.message };
      status = 'unhealthy';
    }

    // API keys configured
    checks.openai = { status: process.env.OPENAI_API_KEY ? 'ok' : 'missing' };
    checks.mathpix = { status: (process.env.MATHPIX_APP_ID && process.env.MATHPIX_APP_KEY) ? 'ok' : 'missing' };
    if (!process.env.OPENAI_API_KEY) status = 'degraded';

    // Memory usage
    const mem = process.memoryUsage();
    checks.memory = {
      heapUsedMB: Math.round(mem.heapUsed / 1048576),
      heapTotalMB: Math.round(mem.heapTotal / 1048576),
      rssMB: Math.round(mem.rss / 1048576),
    };

    // Uptime
    checks.uptime = { seconds: Math.round(process.uptime()) };

    // Lifecycle — the load-balancer contract. Render polls this endpoint to
    // decide whether to send us traffic, so the two windows where we cannot
    // serve must answer 503 and nothing else:
    //   starting — port is bound but Mongo (and the session store) is not up
    //   draining — SIGTERM received; still serving, but stop sending us new work
    // This check goes LAST and overrides: a starting instance also looks
    // 'degraded' on the DB check above, and 'degraded' is a 200.
    checks.lifecycle = { state: lifecycle.getState() };
    let httpStatus = status === 'unhealthy' ? 503 : 200;
    if (!lifecycle.isAcceptingTraffic()) {
      status = lifecycle.getState();
      httpStatus = 503;
    }
    res.status(httpStatus).json({ status, checks, timestamp: new Date().toISOString() });
  });

  // --- Sentry Test Route (throws intentional error to verify Sentry is capturing) ---
  // Admin-gated: unauthenticated this is a free Sentry-quota drain and a reliable
  // 500 oracle for anyone probing the host.
  app.get('/debug-sentry', isAuthenticated, isAdmin, (_req, _res) => {
    throw new Error('Sentry verification error (triggered by admin)');
  });

  // --- Auth Routes ---
  app.use('/login', authLimiter, loginRoutes);
  app.use('/signup', signupLimiter, signupRoutes);
  app.use('/api/password-reset', authLimiter, passwordResetRoutes);
  app.use('/api/auth', authLimiter, authRoutes);
  app.post('/logout', isAuthenticated, handleLogout);

  // --- OAuth Routes ---
  registerOAuthRoutes(app, authLimiter);

  // --- API Routes ---
  app.use('/api/admin', isAuthenticated, isAdmin, adminRoutes);
  app.get('/api/admin/error-metrics', isAuthenticated, isAdmin, errorMetricsHandler);
  app.get('/api/admin/consent-metrics', isAuthenticated, isAdmin, consentMetricsHandler);
  app.use('/api/teacher', isAuthenticated, isTeacher, teacherRoutes);
  app.use('/api/parent', isAuthenticated, isParent, parentRoutes);
  app.use('/api/analytics', isAuthenticated, analyticsRoutes);
  app.use('/api/student', isAuthenticated, isStudent, studentRoutes.router);
  app.use('/api/leaderboard', isAuthenticated, isAuthorizedForLeaderboard, leaderboardRoutes);
  app.use('/api/billing', billingRoutes);
  app.use('/api/affiliate', affiliateRoutes);
  app.use('/api/privacy', isAuthenticated, dataPrivacyRoutes);
  app.use('/api/consent', isAuthenticated, consentRoutes);
  // Parent-facing consent verification. Mounted OUTSIDE the isAuthenticated
  // guard above: the parent clicking the emailed link is not logged in and
  // usually has no account. The single-use token IS the authentication.
  // Path is '/api/consent-verify', which Express does NOT match against the
  // '/api/consent' mount (prefix matching requires a '/' or end-of-string
  // boundary), so it stays public. authLimiter throttles token guessing.
  app.use('/api/consent-verify', authLimiter, consentVerifyRoutes);
  // requireOwnConsent sits on every endpoint that collects student input for,
  // or discloses student context to, a third-party AI provider. It must NOT
  // go on /api/consent or /api/onboarding — a blocked student has to be able
  // to reach the consent flow to unblock themselves.
  app.use('/api/chat', isAuthenticated, requireOwnConsent(), aiEndpointLimiter, usageGate, chatRoutes);
  // Living Workspace: gesture-derived student moves. Student-only, and it can
  // delegate into the shared chat turn (?tutor=true), so it carries the SAME
  // gates as /api/chat plus isStudent. See docs/BOARD_STUDENT_MOVES_INTEGRATION.md.
  app.use('/api/student-moves', isAuthenticated, isStudent, requireOwnConsent(), aiEndpointLimiter, usageGate, studentMovesRoutes);
  app.use('/api/conversations', isAuthenticated, conversationsRoutes);
  // Read-aloud spends Cartesia minutes, so it meters and gates like every other
  // AI surface (usageGateAllMethods — TTS arrives as POST, but the gate's
  // POST-only default is a footgun waiting for the first GET variant).
  app.use('/api/speak', isAuthenticated, requireOwnConsent(), requireThirteenPlus, usageGateAllMethods, speakRoutes);
  app.use('/api/animation-studio', isAuthenticated, requireOwnConsent(), aiEndpointLimiter, animationStudioRoutes);
  // Voice is open to every 13+ student and metered against the same monthly
  // AI-second pool as text (it was premium-only until the pool became the gate).
  // The WebSocket streaming path enforces the same rule in utils/voiceUpgrade.js,
  // which never runs this chain.
  app.use('/api/voice', isAuthenticated, requireOwnConsent(), requireThirteenPlus, aiEndpointLimiter, usageGateAllMethods, voiceRoutes);
  app.use('/api/voice', isAuthenticated, requireOwnConsent(), requireThirteenPlus, voiceTestRoutes);
  app.use('/api/voice-tutor', isAuthenticated, requireOwnConsent(), aiEndpointLimiter, usageGateAllMethods, voiceTutorRoutes);
  // These routes accept base64 image data — larger JSON body limit
  const largeJsonParser = express.json({ limit: '10mb' });
  // Unified-upload classifier: cheap "is this worked or blank?" check that
  // pre-selects the right one-tap action on the upload card. Mounted BEFORE
  // /api/upload (more specific path first) and intentionally NOT premium-gated
  // so the suggestion works for every signed-in student — the paywall stays on
  // the grade/tutoring action the chip actually triggers.
  app.use('/api/upload/classify', isAuthenticated, requireOwnConsent(), uploadRateLimiter, aiEndpointLimiter, uploadClassifyRoutes);
  app.use('/api/upload', isAuthenticated, requireOwnConsent(), uploadRateLimiter, aiEndpointLimiter, premiumFeatureGate('File uploads'), uploadRoutes);
  // chatWithFile route REMOVED — file uploads consolidated into /api/chat
  // welcome-message generates an LLM greeting on GET, so it needs the
  // all-methods gate (plain usageGate only inspects POSTs). rapport's
  // /respond is a chat-style AI turn — meter it like /api/chat.
  app.use('/api/welcome-message', isAuthenticated, requireOwnConsent(), aiEndpointLimiter, usageGateAllMethods, welcomeRoutes);
  app.use('/api/rapport', isAuthenticated, requireOwnConsent(), aiEndpointLimiter, usageGate, rapportBuildingRoutes);
  app.use('/api/memory', isAuthenticated, memoryRouter);
  app.use('/api/summary', isAuthenticated, summaryGeneratorRouter);
  app.use('/api/avatars', isAuthenticated, avatarRoutes);
  app.use('/api/avatar', isAuthenticated, avatarRoutes);
  app.use('/api/cosmetics', isAuthenticated, cosmeticsRoutes);

  // Public API routes (no auth required)
  app.use('/api/waitlist', waitlistRoutes);
  app.use('/api/demo', demoRoutes);
  app.use('/api/trial-chat', trialChatLimiter, trialChatRoutes);
  app.use('/api/quiz', quizLimiter, quizRoutes);
  app.use('/api/stats', publicStatsRoutes);
  // Anonymous phone image upload (authorized by capability token + PIN,
  // CSRF-exempt, rate-limited). MUST be registered before the bare
  // `app.use('/api', isAuthenticated, ...)` catch-alls below, or that
  // middleware would 401 the unauthenticated phone before it reaches here.
  app.use('/api/phone-upload', phoneUploadRoutes);
  app.use('/api/images', isAuthenticated, imageSearchRoutes);
  app.use('/api/curriculum', isAuthenticated, curriculumRoutes);
  // Courses are open to ALL students as a free on-ramp (see docs/COURSES_IN_FLOW_DESIGN.md).
  // AI usage inside a course is still metered by usageGate on /api/course-chat — the monthly
  // free-minute cap, not a paywall, is the conversion lever to Mathmatix+.
  app.use('/api/courses', isAuthenticated, courseRoutes);
  app.use('/api/course-sessions', isAuthenticated, courseSessionRoutes);
  app.use('/api/course-chat', isAuthenticated, requireOwnConsent(), aiEndpointLimiter, usageGate, courseChatRoutes);
  app.use('/api/teacher-resources', isAuthenticated, teacherResourceRoutes);
  app.use('/api/guidedLesson', isAuthenticated, requireOwnConsent(), aiEndpointLimiter, guidedLessonRoutes);
  app.use('/api/assessment', isAuthenticated, assessmentRoutes);
  app.use('/api/screener', isAuthenticated, screenerRoutes);
  app.use('/api/checkpoint', isAuthenticated, checkpointRoutes);
  // NOTE: /api/growth-check is retired. Growth checks run on the screener
  // (POST /api/screener/start {isGrowthCheck:true} → sessionType 'growth-check').
  // ACT Math practice test — free (boot-camp on-ramp), fixed-form, no AI at request time.
  app.use('/api/act-test', isAuthenticated, actTestRoutes);
  app.use('/api/calc-bootcamp', isAuthenticated, calcBootcampRoutes);
  app.use('/api/mastery', isAuthenticated, masteryRoutes);
  app.use('/api/nudges', isAuthenticated, nudgeRoutes);
  // masteryChat route REMOVED — mastery mode consolidated into /api/chat
  app.use('/api/review', isAuthenticated, reviewRoutes);
  app.use('/api/settings', isAuthenticated, settingsRoutes);
  app.use('/api/email', isAuthenticated, emailRoutes);
  app.use('/api/grade-work', isAuthenticated, largeJsonParser, aiEndpointLimiter, premiumFeatureGate('Work grading'), gradeWorkRoutes);
  app.use('/api/quarterly-growth', isAuthenticated, quarterlyGrowthRoutes);
  // app.use('/api/fact-fluency', isAuthenticated, factFluencyRoutes); // Shelved
  app.use('/api', isAuthenticated, dailyQuestsRoutes);
  app.use('/api', isAuthenticated, weeklyChallengesRoutes);
  app.use('/api/challenges', isAuthenticated, challengeRoutes);
  app.use('/api', isAuthenticated, learningCurveRoutes);
  // app.use('/api', isAuthenticated, celerationRoutes); // Shelved
  app.use('/api/session', isAuthenticated, sessionRoutes);
  app.use('/api/feedback', isAuthenticated, feedbackRoutes);
  app.use('/api/support', isAuthenticated, supportRoutes);
  app.use('/api/user', isAuthenticated, tourSurveyRoutes);
  app.use('/api/messages', isAuthenticated, messagingRoutes);
  app.use('/api/announcements', isAuthenticated, announcementsRoutes);
  app.use('/api/admin/email', isAuthenticated, isAdmin, adminEmailRoutes);
  app.use('/api/school-licenses', isAuthenticated, isAdmin, schoolLicenseRoutes);
  app.post('/api/clever-sync/webhook', cleverSyncRoutes);
  app.use('/api/clever-sync', isAuthenticated, isAdmin, cleverSyncRoutes);
  app.use('/api/iep-templates', isAuthenticated, isTeacher, iepTemplatesRoutes);
  app.use('/api/browser-lock', isAuthenticated, browserLockRoutes);
  app.use('/api/practice-pack', isAuthenticated, practicePackRoutes);
  app.use('/api/notebook', isAuthenticated, notebookRoutes);
  // Server-controlled client flags: a tiny synchronous script chat.html loads
  // BEFORE seeding MM_FEATURES, so a Render env var (e.g. livingWorkspace=off)
  // flips a flag from the dashboard — no code change, no redeploy semantics
  // beyond Render's own env-save restart. no-store: flips apply on next load.
  app.get('/api/features.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.set('Cache-Control', 'no-store');
    res.send(buildFeaturesScript());
  });
  // "Scan with your phone" desktop endpoints (session-authed). The public
  // phone-upload counterpart is registered earlier, before the /api auth
  // catch-alls (see the Public API routes block above).
  app.use('/api/phone-link', isAuthenticated, phoneLinkRoutes);
  app.use('/api/impersonation', isAuthenticated, impersonationRoutes);
  app.use('/api/transcript-flags', isAuthenticated, transcriptFlagsRoutes);
  app.use('/api/notifications', isAuthenticated, notificationsRoutes);
  app.use('/api/role-switch', isAuthenticated, roleSwitchRoutes);
  app.use('/api/onboarding', onboardingRoutes);

  // --- Inline Routes (User Profile & Settings) ---
  registerUserRoutes(app);

  // --- HTML Routes ---
  registerHtmlRoutes(app);

  // --- Static File Serving ---
  registerStaticRoutes(app);

  // Error logging middleware
  app.use(logger.errorLogger);

  // 404 fallback
  app.use((req, res) => {
    // API routes get JSON response
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found', path: req.path });
    }
    // Browser requests get a friendly redirect to home
    res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'), (err) => {
      if (err) res.status(404).send('Page not found');
    });
  });

  // Global error handler — must be last middleware (4 args)
  app.use((err, req, res, _next) => {
    const status = err.status || 500;
    const isServerError = status >= 500;

    if (isServerError) {
      logger.error('Unhandled route error', {
        requestId: req.requestId,
        error: err.message,
        stack: err.stack,
        method: req.method,
        url: req.originalUrl,
      });
    }

    // Headers already flushed — almost always a streaming (SSE) chat turn that
    // failed mid-flight, since the stream sets its headers before the pipeline
    // runs. Calling res.status()/json() below would throw ERR_HTTP_HEADERS_SENT,
    // and that crash is what surfaces in the logs INSTEAD of the real error.
    // Rather than delegate to Express's default handler (which just aborts the
    // socket and leaves the client's "thinking…" spinner hanging), send a
    // terminal error event on the stream the client is already reading — the
    // chat SSE loop handles { type:'error', message } (script.js) — then close.
    // `message` (not `error`) matches both the client and the normal streaming
    // error the pipeline emits in routes/chat.js.
    if (res.headersSent) {
      const isSse = String(res.getHeader('Content-Type') || '').includes('text/event-stream');
      if (isSse) {
        try {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            message: isServerError ? 'Something went wrong. Please try again.' : err.message,
          })}\n\n`);
        } catch (writeErr) {
          logger.warn('Could not write SSE error event', { requestId: req.requestId, error: writeErr.message });
        }
      }
      try { res.end(); } catch { /* socket already torn down */ }
      return;
    }

    if (req.path.startsWith('/api/')) {
      return res.status(status).json({
        error: isServerError ? 'Internal server error' : err.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
      });
    }

    res.status(status).sendFile(path.join(__dirname, '..', 'public', '500.html'), (sendErr) => {
      if (sendErr) res.status(status).send('Something went wrong');
    });
  });

  // Upload cleanup scheduler
  scheduleCleanup();
  logger.info('🛡️ Upload security: Auto-deletion scheduler initialized', {
    retentionDays: getRetentionDays(),
    service: 'upload-security',
  });

  // Demo clone cleanup scheduler — sweeps expired per-session demo clones
  // even when no one is logging in. (Without this, expired clones leak.)
  scheduleDemoCleanup();
}

// --- OAuth callback handlers ---
// A provider-side OAuth failure (e.g. expired Azure client secret →
// AADSTS7000222, or a token-exchange TokenError) means our credentials are
// stale, not that the user did anything wrong. Render a friendly "try another
// method" page and alert Sentry, instead of throwing a raw 500 at the student.
function isProviderConfigError(err) {
  if (!err) return false;
  if (err.name === 'TokenError' || err.name === 'InternalOAuthError') return true;
  const msg = String(err.message || '');
  return /AADSTS\d+/.test(msg) || /client secret|invalid_client/i.test(msg);
}

function oauthCallback(strategy) {
  return (req, res, next) => {
    passport.authenticate(strategy, (err, user) => {
      if (err) {
        if (isProviderConfigError(err)) {
          logger.error(`${strategy} OAuth provider/credential error — login disabled until fixed:`, err);
          Sentry.captureException(err, {
            level: 'fatal',
            tags: { area: 'oauth', provider: strategy, kind: 'provider_config' },
            extra: { hint: 'Rotate the OAuth client secret for this provider and redeploy.' },
          });
          return res.redirect(`/login.html?error=oauth_unavailable&provider=${encodeURIComponent(strategy)}`);
        }
        return next(err);
      }
      if (!user) return res.redirect('/login.html');

      req.logIn(user, async (err) => {
        if (err) return next(err);
        try {
          await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
        } catch (updateErr) {
          logger.error(`Failed to update lastLogin for ${strategy}:`, updateErr);
        }

        req.session.save((saveErr) => {
          if (saveErr) return next(saveErr);
          const onboardingDone = !!(user.onboarding && user.onboarding.completed);
          if (user.needsProfileCompletion && !onboardingDone) return res.redirect('/onboarding.html');
          if (user.needsProfileCompletion) return res.redirect('/complete-profile.html');
          const userRoles = (user.roles && user.roles.length > 0) ? user.roles : [user.role];
          if (userRoles.length > 1) return res.redirect('/role-picker.html');
          if (user.role === 'student' && !user.selectedTutorId) return res.redirect('/pick-tutor.html');
          const dashboardMap = { student: '/chat.html', teacher: '/teacher-dashboard.html', admin: '/admin-dashboard.html', parent: '/parent-dashboard.html' };
          res.redirect(dashboardMap[user.role] || '/login.html');
        });
      });
    })(req, res, next);
  };
}

function registerOAuthRoutes(app, authLimiter) {
  // Google
  app.get('/auth/google', authLimiter, passport.authenticate('google', { scope: ['profile', 'email'] }));
  app.get('/auth/google/callback', authLimiter, oauthCallback('google'));

  // Microsoft
  app.get('/auth/microsoft', authLimiter, passport.authenticate('microsoft', { scope: ['user.read'] }));
  app.get('/auth/microsoft/callback', authLimiter, oauthCallback('microsoft'));

  // Clever (conditional)
  if (process.env.CLEVER_CLIENT_ID && process.env.CLEVER_CLIENT_SECRET) {
    app.get('/auth/clever', authLimiter, (req, res, next) => {
      if (req.isAuthenticated()) {
        req.logout((err) => {
          if (err) logger.error('Error clearing previous session for Clever SSO:', err);
          req.session.regenerate((err) => {
            if (err) logger.error('Error regenerating session for Clever SSO:', err);
            passport.authenticate('clever')(req, res, next);
          });
        });
      } else {
        passport.authenticate('clever')(req, res, next);
      }
    });

    app.get('/auth/clever/callback', authLimiter, (req, res, next) => {
      passport.authenticate('clever', (err, user) => {
        if (err) return next(err);
        if (!user) return res.redirect('/login.html');

        req.session.regenerate((err) => {
          if (err) return next(err);
          req.logIn(user, async (err) => {
            if (err) return next(err);
            try {
              await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
            } catch (updateErr) {
              logger.error('Failed to update lastLogin for Clever:', updateErr);
            }

            req.session.save((saveErr) => {
              if (saveErr) return next(saveErr);
              const onboardingDone = !!(user.onboarding && user.onboarding.completed);
              if (user.needsProfileCompletion && !onboardingDone) return res.redirect('/onboarding.html');
              if (user.needsProfileCompletion) return res.redirect('/complete-profile.html');
              if (user.role === 'student' && !user.selectedTutorId) return res.redirect('/pick-tutor.html');
              const dashboardMap = { student: '/chat.html', teacher: '/teacher-dashboard.html', admin: '/admin-dashboard.html', parent: '/parent-dashboard.html' };
              res.redirect(dashboardMap[user.role] || '/login.html');
            });
          });
        });
      })(req, res, next);
    });

    logger.info('✅ Clever SSO routes registered');
  }
}

function registerUserRoutes(app) {
  const BRAND_CONFIG = require('../utils/brand');
  const { getTutorsToUnlock } = require('../utils/unlockTutors');

  app.get('/user', isAuthenticated, async (req, res) => {
    try {
      if (!req.user) return res.json({ user: null });

      const userObj = await User.findById(req.user._id).lean();
      if (!userObj) return res.json({ user: null });

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

      // Recalculate level from XP if out of sync
      let correctLevel = 1;
      while ((userObj.xp || 0) >= BRAND_CONFIG.cumulativeXpForLevel(correctLevel + 1)) {
        correctLevel++;
      }
      if ((userObj.level || 1) !== correctLevel) {
        logger.warn(`Level/XP mismatch for ${userObj.firstName}: level=${userObj.level}, xp=${userObj.xp}, correctLevel=${correctLevel}. Auto-correcting.`);
        userObj.level = correctLevel;
        needsSave = true;
      }

      if (needsSave) {
        const updates = {};
        if (userObj.unlockedItems) updates.unlockedItems = userObj.unlockedItems;
        if (userObj.level === correctLevel) updates.level = correctLevel;
        await User.updateOne({ _id: req.user._id }, { $set: updates });
      }

      // One-time welcome coins so students begin with a spendable balance on
      // day 1 (enough to grab a cosmetic and feel the earn→spend loop). Granted
      // once, gated by wallet.welcomeGrantedAt; bypasses the daily earn cap since
      // it's a starter gift, not earned currency.
      const isStudent = Array.isArray(userObj.roles) && userObj.roles.length
        ? userObj.roles.includes('student')
        : userObj.role === 'student';
      if (isStudent && !(userObj.wallet && userObj.wallet.welcomeGrantedAt)) {
        const grant = (BRAND_CONFIG.coinRewards && BRAND_CONFIG.coinRewards.welcomeBonus) || 100;
        const now = new Date();
        // Atomic + idempotent: the `welcomeGrantedAt: null` filter matches both an
        // unset and a null field, so only ONE concurrent /user call can win.
        const result = await User.updateOne(
          { _id: req.user._id, 'wallet.welcomeGrantedAt': null },
          {
            $inc: { 'wallet.coins': grant, 'wallet.lifetimeEarned': grant },
            $set: { 'wallet.welcomeGrantedAt': now },
          }
        );
        if (result.modifiedCount === 1) {
          // Reflect it in this response so the balance shows immediately.
          userObj.wallet = userObj.wallet || { coins: 0, lifetimeEarned: 0, dailyEarned: 0 };
          userObj.wallet.coins = (userObj.wallet.coins || 0) + grant;
          userObj.wallet.lifetimeEarned = (userObj.wallet.lifetimeEarned || 0) + grant;
          userObj.wallet.welcomeGrantedAt = now;
        }
      }

      const level = userObj.level || 1;
      const xpStart = BRAND_CONFIG.cumulativeXpForLevel(level);
      userObj.xpForCurrentLevel = Math.max(0, (userObj.xp || 0) - xpStart);
      userObj.xpForNextLevel = BRAND_CONFIG.xpRequiredForLevel(level);

      res.json({ user: userObj });
    } catch (error) {
      logger.error('[/user] Error', { error: error.message });
      res.status(500).json({ error: 'Failed to load user data', message: error.message });
    }
  });

  app.use('/api/user/switch-role', isAuthenticated, roleSwitchRoutes);

  app.patch('/api/user/settings', isAuthenticated, async (req, res) => {
    try {
      const user = await User.findById(req.user._id);
      if (!user) return res.status(404).json({ message: 'User not found.' });

      const allowedUpdates = [
        'firstName', 'lastName', 'gradeLevel', 'mathCourse',
        'tonePreference', 'learningStyle', 'interests', 'needsProfileCompletion',
        'selectedTutorId', 'selectedAvatarId', 'reportFrequency', 'goalViewPreference',
        'parentTone', 'parentLanguage', 'preferredLanguage', 'preferences',
      ];

      let hasChanges = false;
      // dateOfBirth is deliberately NOT in the allowlist loop: it is validated
      // and write-once (set when absent, never changed self-serve — otherwise
      // an age-gated under-13 could age themselves up here). Before this,
      // complete-profile.html sent it here and it was silently dropped.
      if (req.body.dateOfBirth !== undefined) {
        const result = applyDobToUser(user, req.body.dateOfBirth);
        if (!result.ok) {
          return res.status(result.status).json({ message: result.message });
        }
        hasChanges = true;
      }
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
      logger.error('Error updating user settings:', error);
      res.status(500).json({ message: 'Failed to update user settings.' });
    }
  });

  // Calculator access
  app.get('/api/calculator/access', isAuthenticated, async (req, res) => {
    try {
      if (req.user.role !== 'student') {
        return res.json({ success: true, calculatorAccess: 'always', message: 'Non-student users have full calculator access' });
      }
      if (!req.user.teacherId) {
        return res.json({ success: true, calculatorAccess: 'always', message: 'No assigned teacher' });
      }

      const teacher = await User.findById(req.user.teacherId)
        .select('classAISettings.calculatorAccess classAISettings.calculatorNote firstName lastName')
        .lean();

      if (!teacher || !teacher.classAISettings) {
        return res.json({ success: true, calculatorAccess: 'skill-based', message: 'Teacher has not configured settings' });
      }

      res.json({
        success: true,
        calculatorAccess: teacher.classAISettings.calculatorAccess || 'skill-based',
        calculatorNote: teacher.classAISettings.calculatorNote || '',
        teacherName: `${teacher.firstName} ${teacher.lastName}`,
      });
    } catch (error) {
      logger.error('Error fetching calculator access:', error);
      res.status(500).json({ success: false, calculatorAccess: 'skill-based', message: 'Error fetching settings' });
    }
  });

  // Teacher resource file serving
  app.get('/uploads/teacher-resources/:teacherId/:filename', isAuthenticated, async (req, res) => {
    try {
      const { teacherId, filename } = req.params;
      const user = await User.findById(req.user._id);

      const isOwnerTeacher = user.role === 'teacher' && user._id.toString() === teacherId;
      const isStudentOfTeacher = user.role === 'student' && user.teacherId && user.teacherId.toString() === teacherId;

      if (!isOwnerTeacher && !isStudentOfTeacher) {
        return res.status(403).json({ message: 'Access denied' });
      }

      if (isStudentOfTeacher) {
        const TeacherResource = require('../models/teacherResource');
        const resource = await TeacherResource.findOne({
          teacherId,
          storedFilename: { $regex: new RegExp(filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') },
        });
        if (!resource || resource.isPublished === false) {
          return res.status(403).json({ message: 'This resource is not currently available' });
        }
      }

      const filePath = path.join(__dirname, '..', 'uploads', 'teacher-resources', teacherId, filename);
      res.sendFile(filePath);
    } catch (error) {
      logger.error('Error serving teacher resource:', error);
      res.status(500).json({ message: 'Failed to load resource' });
    }
  });

  // Tutor config as JS file
  app.get('/js/tutor-config-data.js', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'utils', 'tutorConfig.js'));
  });
}

function registerHtmlRoutes(app) {
  const publicDir = path.join(__dirname, '..', 'public');
  const sendHtml = (file) => (req, res) => res.sendFile(path.join(publicDir, file));

  // Public HTML routes
  app.get('/', ensureNotAuthenticated, sendHtml('index.html'));
  app.get('/login.html', ensureNotAuthenticated, sendHtml('login.html'));
  app.get('/signup.html', ensureNotAuthenticated, sendHtml('signup.html'));
  app.get('/forgot-password.html', sendHtml('forgot-password.html'));
  app.get('/reset-password.html', sendHtml('reset-password.html'));
  // Parental consent landing page — MUST be public. The recipient is a parent
  // arriving from an emailed link; most have no account at all. The page is
  // inert until the token in the query string validates server-side.
  app.get('/parental-consent.html', sendHtml('parental-consent.html'));
  app.get('/privacy.html', sendHtml('privacy.html'));
  app.get('/terms.html', sendHtml('terms.html'));
  // Plain-language trust centre. Public and explicitly routed alongside the two
  // legal pages it fronts: the .html catch-all further down would serve it
  // anyway, but this is a URL schools paste into procurement paperwork, so the
  // short /safety alias should exist and should not depend on a fallback.
  app.get('/safety.html', sendHtml('safety.html'));
  app.get('/safety', sendHtml('safety.html'));
  app.get('/onboarding.html', sendHtml('onboarding.html'));
  app.get('/demo.html', sendHtml('demo.html'));
  // Pop-quiz landing (Facebook ad funnel) — clean URL for the ad's answer
  // buttons: /quiz?a=14 · /quiz?a=2 · /quiz?a=other. Public, works whether
  // or not the visitor is signed in.
  app.get('/quiz', sendHtml('quiz.html'));
  // Readable answer aliases for organic posts, where the raw URL is the link
  // text: /quiz/14 · /quiz/2 · /quiz/other → /quiz?a=<answer>. The quiz page
  // validates the value and just ignores anything that isn't a real option.
  app.get('/quiz/:answer', (req, res) =>
    res.redirect(302, '/quiz?a=' + encodeURIComponent(String(req.params.answer).slice(0, 24))));
  app.get('/pricing.html', sendHtml('pricing.html'));
  // Audience pages. The homepage speaks to parents; the student and teacher
  // pitches used to be two of three tabs in the middle of it, which asked every
  // parent to read past them. Short aliases because these get linked directly.
  app.get('/for-teachers.html', sendHtml('for-teachers.html'));
  app.get('/for-teachers', sendHtml('for-teachers.html'));
  app.get('/for-students.html', sendHtml('for-students.html'));
  app.get('/for-students', sendHtml('for-students.html'));
  // Phone upload landing page — public; the page itself is inert until a valid
  // token + PIN are supplied, and all enforcement is server-side.
  app.get('/phone-upload', sendHtml('phone-upload.html'));
  // Protected HTML routes
  app.get('/affiliate.html', isAuthenticated, sendHtml('affiliate.html'));
  app.get('/role-picker.html', isAuthenticated, sendHtml('role-picker.html'));
  app.get('/complete-profile.html', isAuthenticated, sendHtml('complete-profile.html'));
  app.get('/pick-tutor.html', isAuthenticated, sendHtml('pick-tutor.html'));
  app.get('/pick-avatar.html', isAuthenticated, sendHtml('pick-avatar.html'));
  app.get('/chat.html', isAuthenticated, sendHtml('chat.html'));
  app.get('/canvas.html', isAuthenticated, sendHtml('canvas.html'));
  app.get('/badge-map.html', isAuthenticated, sendHtml('badge-map.html'));
  app.get('/screener.html', isAuthenticated, sendHtml('screener.html'));
  app.get('/mastery-chat.html', isAuthenticated, sendHtml('mastery-chat.html'));

  // app.get('/fact-fluency-blaster.html', isAuthenticated, sendHtml('fact-fluency-blaster.html')); // Shelved
  // app.get('/number-run.html', isAuthenticated, sendHtml('number-run.html')); // Shelved: depends on fact-fluency API
  app.get('/learning-curves.html', isAuthenticated, sendHtml('learning-curves.html'));
  // app.get('/my-celeration-charts.html', isAuthenticated, sendHtml('my-celeration-charts.html')); // Shelved
  // app.get('/my-speed-progress.html', isAuthenticated, sendHtml('my-speed-progress.html')); // Shelved
  app.get('/progress.html', isAuthenticated, sendHtml('progress.html'));
  app.get('/student-dashboard.html', isAuthenticated, sendHtml('student-dashboard.html'));
  app.get('/weekly-challenges.html', isAuthenticated, sendHtml('weekly-challenges.html'));
  app.get('/daily-quests-widget.html', isAuthenticated, sendHtml('daily-quests-widget.html'));
  app.get('/calculator.html', isAuthenticated, sendHtml('calculator.html'));
  app.get('/math-showdown.html', isAuthenticated, sendHtml('math-showdown.html'));
  app.get('/avatar-builder.html', isAuthenticated, sendHtml('avatar-builder.html'));
  app.get('/skill-map.html', isAuthenticated, sendHtml('skill-map.html'));

  // Role-specific routes
  app.get('/admin-dashboard.html', isAuthenticated, isAdmin, sendHtml('admin-dashboard.html'));
  app.get('/admin-upload.html', isAuthenticated, isAdmin, sendHtml('admin-upload.html'));
  app.get('/admin-voice-metrics.html', isAuthenticated, isAdmin, sendHtml('admin-voice-metrics.html'));
  app.get('/admin-structured-metrics.html', isAuthenticated, isAdmin, sendHtml('admin-structured-metrics.html'));
  app.get('/teacher-dashboard.html', isAuthenticated, isTeacher, sendHtml('teacher-dashboard.html'));
  // app.get('/teacher-celeration-dashboard.html', isAuthenticated, isTeacher, sendHtml('teacher-celeration-dashboard.html')); // Shelved
  app.get('/parent-dashboard.html', isAuthenticated, isParent, sendHtml('parent-dashboard.html'));

  // Redirects
  // app.get('/fact-fluency-practice.html', (req, res) => res.redirect(301, '/fact-fluency-blaster.html')); // Shelved
}

function registerStaticRoutes(app) {
  const publicDir = path.join(__dirname, '..', 'public');

  // Course-site directory URLs. express.static runs with `index: false` and the
  // HTML handler below requires a literal `.html`, so `/courses/algebra/` would
  // 404 even though `/courses/algebra/index.html` exists. The generated course
  // pages link to bare directories, so map them to index.html.
  app.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !req.path.startsWith('/courses/')) {
      return next();
    }
    if (!req.path.endsWith('/')) return next();
    const filePath = path.resolve(publicDir, req.path.replace(/^\/+/, '') + 'index.html');
    if (!filePath.startsWith(publicDir + path.sep)) return next();
    fs.access(filePath, fs.constants.F_OK, (err) => (err ? next() : res.sendFile(filePath)));
  });

  // Serve HTML via sendFile for CSP nonce injection
  // (Static assets are already served by middleware.js before session/CSRF pipeline)
  app.use((req, res, next) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && req.path.endsWith('.html')) {
      const filePath = path.resolve(publicDir, req.path.replace(/^\/+/, ''));
      if (!filePath.startsWith(publicDir + path.sep)) return next();
      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) return next();
        res.sendFile(filePath);
      });
    } else {
      next();
    }
  });
}

module.exports = { registerRoutes };
