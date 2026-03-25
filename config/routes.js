// config/routes.js — Route registration
const path = require('path');
const fs = require('fs');
const passport = require('passport');
const express = require('express');
const mongoose = require('mongoose');

const rateLimit = require('express-rate-limit');

const logger = require('../utils/logger');
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
const { usageGate, premiumFeatureGate } = require('../middleware/usageGate');
const { uploadRateLimiter, scheduleCleanup } = require('../middleware/uploadSecurity');

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
const conversationsRoutes = require('../routes/conversations');
const speakRoutes = require('../routes/speak');
const voiceRoutes = require('../routes/voice');
const voiceTestRoutes = require('../routes/voice-test');
const voiceTutorRoutes = require('../routes/voiceTutor');
const uploadRoutes = require('../routes/upload');
const chatWithFileRoutes = require('../routes/chatWithFile');
const welcomeRoutes = require('../routes/welcome');
const rapportBuildingRoutes = require('../routes/rapportBuilding');
const { router: memoryRouter } = require('../routes/memory');
const guidedLessonRoutes = require('../routes/guidedLesson');
const summaryGeneratorRouter = require('../routes/summary_generator');
const avatarRoutes = require('../routes/avatar');
const curriculumRoutes = require('../routes/curriculum');
const assessmentRoutes = require('../routes/assessment');
const screenerRoutes = require('../routes/screener');
const checkpointRoutes = require('../routes/checkpoint');
const growthCheckRoutes = require('../routes/growthCheck');
const masteryRoutes = require('../routes/mastery');
const masteryChatRoutes = require('../routes/masteryChat');
const reviewRoutes = require('../routes/review');
const teacherResourceRoutes = require('../routes/teacherResources');
const settingsRoutes = require('../routes/settings');
const emailRoutes = require('../routes/email');
const gradeWorkRoutes = require('../routes/gradeWork');
const quarterlyGrowthRoutes = require('../routes/quarterlyGrowth');
const factFluencyRoutes = require('../routes/factFluency');
const dailyQuestsRoutes = require('../routes/dailyQuests');
const weeklyChallengesRoutes = require('../routes/weeklyChallenges');
const challengeRoutes = require('../routes/challenges');
const learningCurveRoutes = require('../routes/learningCurve');
const celerationRoutes = require('../routes/celeration');
const sessionRoutes = require('../routes/session');
const feedbackRoutes = require('../routes/feedback');
const tourSurveyRoutes = require('../routes/tourSurvey');
const diagramRoutes = require('../routes/diagram');
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
const demoRoutes = require('../routes/demo');
const trialChatRoutes = require('../routes/trialChat');
const supportRoutes = require('../routes/support');
const imageSearchRoutes = require('../routes/imageSearch');
const bioRoutes = require('../routes/bio');

const TUTOR_CONFIG = require('../utils/tutorConfig');

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

    const httpStatus = status === 'unhealthy' ? 503 : 200;
    res.status(httpStatus).json({ status, checks, timestamp: new Date().toISOString() });
  });

  // --- Sentry Test Route (throws intentional error to verify Sentry is capturing) ---
  app.get('/debug-sentry', (req, res) => {
    throw new Error('My first Sentry error!');
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
  app.use('/api/teacher', isAuthenticated, isTeacher, teacherRoutes);
  app.use('/api/parent', isAuthenticated, isParent, parentRoutes);
  app.use('/api/analytics', isAuthenticated, analyticsRoutes);
  app.use('/api/student', isAuthenticated, isStudent, studentRoutes.router);
  app.use('/api/leaderboard', isAuthenticated, isAuthorizedForLeaderboard, leaderboardRoutes);
  app.use('/api/billing', billingRoutes);
  app.use('/api/affiliate', affiliateRoutes);
  app.use('/api/privacy', isAuthenticated, dataPrivacyRoutes);
  app.use('/api/consent', isAuthenticated, consentRoutes);
  app.use('/api/chat', isAuthenticated, aiEndpointLimiter, usageGate, chatRoutes);
  app.use('/api/conversations', isAuthenticated, conversationsRoutes);
  app.use('/api/speak', isAuthenticated, speakRoutes);
  app.use('/api/voice', isAuthenticated, aiEndpointLimiter, premiumFeatureGate('Voice chat'), voiceRoutes);
  app.use('/api/voice', isAuthenticated, voiceTestRoutes);
  app.use('/api/voice-tutor', isAuthenticated, aiEndpointLimiter, premiumFeatureGate('Voice chat'), voiceTutorRoutes);
  // These routes accept base64 image data — larger JSON body limit
  const largeJsonParser = express.json({ limit: '10mb' });
  app.use('/api/upload', isAuthenticated, uploadRateLimiter, aiEndpointLimiter, premiumFeatureGate('File uploads'), uploadRoutes);
  app.use('/api/chat-with-file', isAuthenticated, largeJsonParser, aiEndpointLimiter, usageGate, chatWithFileRoutes);
  app.use('/api/welcome-message', isAuthenticated, aiEndpointLimiter, welcomeRoutes);
  app.use('/api/rapport', isAuthenticated, aiEndpointLimiter, rapportBuildingRoutes);
  app.use('/api/memory', isAuthenticated, memoryRouter);
  app.use('/api/summary', isAuthenticated, summaryGeneratorRouter);
  app.use('/api/avatars', isAuthenticated, avatarRoutes);
  app.use('/api/avatar', isAuthenticated, avatarRoutes);

  // Public API routes (no auth required)
  app.use('/api/waitlist', waitlistRoutes);
  app.use('/api/demo', demoRoutes);
  app.use('/api/trial-chat', trialChatLimiter, trialChatRoutes);
  app.use('/api/bio', bioRoutes);

  app.use('/api/images', isAuthenticated, imageSearchRoutes);
  app.use('/api', isAuthenticated, diagramRoutes);
  app.use('/api/curriculum', isAuthenticated, curriculumRoutes);
  app.use('/api/courses', isAuthenticated, premiumFeatureGate('Courses'), courseRoutes);
  app.use('/api/course-sessions', isAuthenticated, premiumFeatureGate('Courses'), courseSessionRoutes);
  app.use('/api/course-chat', isAuthenticated, aiEndpointLimiter, usageGate, courseChatRoutes);
  app.use('/api/teacher-resources', isAuthenticated, teacherResourceRoutes);
  app.use('/api/guidedLesson', isAuthenticated, aiEndpointLimiter, guidedLessonRoutes);
  app.use('/api/assessment', isAuthenticated, assessmentRoutes);
  app.use('/api/screener', isAuthenticated, screenerRoutes);
  app.use('/api/checkpoint', isAuthenticated, checkpointRoutes);
  app.use('/api/growth-check', isAuthenticated, growthCheckRoutes);
  app.use('/api/mastery', isAuthenticated, masteryRoutes);
  app.use('/api/mastery/chat', isAuthenticated, aiEndpointLimiter, usageGate, masteryChatRoutes);
  app.use('/api/review', isAuthenticated, reviewRoutes);
  app.use('/api/settings', isAuthenticated, settingsRoutes);
  app.use('/api/email', isAuthenticated, emailRoutes);
  app.use('/api/grade-work', isAuthenticated, largeJsonParser, aiEndpointLimiter, premiumFeatureGate('Work grading'), gradeWorkRoutes);
  app.use('/api/quarterly-growth', isAuthenticated, quarterlyGrowthRoutes);
  app.use('/api/fact-fluency', isAuthenticated, factFluencyRoutes);
  app.use('/api', isAuthenticated, dailyQuestsRoutes);
  app.use('/api', isAuthenticated, weeklyChallengesRoutes);
  app.use('/api/challenges', isAuthenticated, challengeRoutes);
  app.use('/api', isAuthenticated, learningCurveRoutes);
  app.use('/api', isAuthenticated, celerationRoutes);
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
  app.use('/api/impersonation', isAuthenticated, impersonationRoutes);
  app.use('/api/role-switch', isAuthenticated, roleSwitchRoutes);

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
    retention: '30 days',
    service: 'upload-security',
  });
}

// --- OAuth callback handlers ---
function oauthCallback(strategy) {
  return (req, res, next) => {
    passport.authenticate(strategy, (err, user) => {
      if (err) return next(err);
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

      const level = userObj.level || 1;
      const xpStart = BRAND_CONFIG.cumulativeXpForLevel(level);
      userObj.xpForCurrentLevel = Math.max(0, (userObj.xp || 0) - xpStart);
      userObj.xpForNextLevel = BRAND_CONFIG.xpRequiredForLevel(level);

      res.json({ user: userObj });
    } catch (error) {
      logger.error('[/user] Error:', error.message);
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
  app.get('/privacy.html', sendHtml('privacy.html'));
  app.get('/terms.html', sendHtml('terms.html'));
  app.get('/demo.html', sendHtml('demo.html'));
  app.get('/pricing.html', sendHtml('pricing.html'));
  app.get('/bio.html', sendHtml('bio.html'));
  app.get('/bio-chat.html', sendHtml('bio-chat.html'));
  app.get('/bio-chapters.html', sendHtml('bio-chapters.html'));

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
  app.get('/mastery-arcade.html', isAuthenticated, sendHtml('mastery-arcade.html'));
  app.get('/fact-fluency-blaster.html', isAuthenticated, sendHtml('fact-fluency-blaster.html'));
  app.get('/number-run.html', isAuthenticated, sendHtml('number-run.html'));
  app.get('/learning-curves.html', isAuthenticated, sendHtml('learning-curves.html'));
  app.get('/my-celeration-charts.html', isAuthenticated, sendHtml('my-celeration-charts.html'));
  app.get('/my-speed-progress.html', isAuthenticated, sendHtml('my-speed-progress.html'));
  app.get('/progress.html', isAuthenticated, sendHtml('progress.html'));
  app.get('/student-dashboard.html', isAuthenticated, sendHtml('student-dashboard.html'));
  app.get('/weekly-challenges.html', isAuthenticated, sendHtml('weekly-challenges.html'));
  app.get('/daily-quests-widget.html', isAuthenticated, sendHtml('daily-quests-widget.html'));
  app.get('/calculator.html', isAuthenticated, sendHtml('calculator.html'));
  app.get('/math-showdown.html', isAuthenticated, sendHtml('math-showdown.html'));
  app.get('/avatar-builder.html', isAuthenticated, sendHtml('avatar-builder.html'));
  app.get('/upload.html', isAuthenticated, sendHtml('upload.html'));

  // Role-specific routes
  app.get('/admin-dashboard.html', isAuthenticated, isAdmin, sendHtml('admin-dashboard.html'));
  app.get('/admin-upload.html', isAuthenticated, isAdmin, sendHtml('admin-upload.html'));
  app.get('/teacher-dashboard.html', isAuthenticated, isTeacher, sendHtml('teacher-dashboard.html'));
  app.get('/teacher-celeration-dashboard.html', isAuthenticated, isTeacher, sendHtml('teacher-celeration-dashboard.html'));
  app.get('/parent-dashboard.html', isAuthenticated, isParent, sendHtml('parent-dashboard.html'));

  // Redirects
  app.get('/fact-fluency-practice.html', (req, res) => res.redirect(301, '/fact-fluency-blaster.html'));
}

function registerStaticRoutes(app) {
  const publicDir = path.join(__dirname, '..', 'public');

  // Long cache for fingerprinted/immutable assets (CSS, JS, images, fonts)
  const immutableCacheOptions = { maxAge: '7d', etag: true, lastModified: true };
  // Short cache for HTML (needs fresh CSP nonces + deploys)
  const htmlCacheOptions = { maxAge: 0, etag: true, lastModified: true };

  // Set cache-control by file type
  const staticCacheOptions = {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days
      } else if (/\.html$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache'); // Always revalidate HTML
      } else {
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day default
      }
    },
  };

  // Serve HTML via sendFile for CSP nonce injection
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.path.endsWith('.html')) {
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

  app.use(express.static(publicDir, staticCacheOptions));
  app.use('/images', express.static(path.join(publicDir, 'images'), immutableCacheOptions));
}

module.exports = { registerRoutes };
