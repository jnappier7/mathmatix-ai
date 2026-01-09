// server.js
require("dotenv").config();

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
  'ELEVENLABS_API_KEY',
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
const studentRoutes = require('./routes/student');
const teacherRoutes = require('./routes/teacher');
const adminRoutes = require('./routes/admin');
const parentRoutes = require('./routes/parent');
const leaderboardRoutes = require('./routes/leaderboard');
const chatRoutes = require('./routes/chat');
const speakRoutes = require('./routes/speak');
const voiceRoutes = require('./routes/voice');  // Real-time voice chat (GPT-style)
const uploadRoutes = require('./routes/upload');
const chatWithFileRoutes = require('./routes/chatWithFile'); 
const welcomeRoutes = require('./routes/welcome');
const { router: memoryRouter } = require('./routes/memory');
const guidedLessonRoutes = require('./routes/guidedLesson');
const summaryGeneratorRouter = require('./routes/summary_generator');
const avatarRoutes = require('./routes/avatar');
const graphRoutes = require('./routes/graph');
const curriculumRoutes = require('./routes/curriculum');
const assessmentRoutes = require('./routes/assessment');
const screenerRoutes = require('./routes/screener');  // IRT-based adaptive screener
const masteryRoutes = require('./routes/mastery');  // Mastery mode (placement + interview + badges)
const masteryChatRoutes = require('./routes/masteryChat');  // Mastery mode chat endpoint
const teacherResourceRoutes = require('./routes/teacherResources');
const settingsRoutes = require('./routes/settings');
const emailRoutes = require('./routes/email');  // Email service for parent reports and notifications
const gradeWorkRoutes = require('./routes/gradeWork');
const quarterlyGrowthRoutes = require('./routes/quarterlyGrowth');  // Quarterly growth tracking and retention
const factFluencyRoutes = require('./routes/factFluency');  // M∆THBL∆ST Fact Fluency game
const dailyQuestsRoutes = require('./routes/dailyQuests');  // Daily Quests & Streak System
const weeklyChallengesRoutes = require('./routes/weeklyChallenges');  // Weekly Challenges System
const learningCurveRoutes = require('./routes/learningCurve');  // Learning Curve Visualization & IRT Transparency
const celerationRoutes = require('./routes/celeration');  // Standard Celeration Charts (Precision Teaching)
const characterRiggingRoutes = require('./routes/characterRigging');  // Character Rigging Portal for animation
const sessionRoutes = require('./routes/session');  // Session management and tracking
const TUTOR_CONFIG = require('./utils/tutorConfig');

// --- 5. EXPRESS APP SETUP ---
const app = express();
const PORT = process.env.PORT || 3000;
app.set("trust proxy", 1);

// --- 6. MIDDLEWARE ---
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset session expiration on every request (sliding window)
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
    ttl: 3 * 60 * 60, // 3 hours (sliding window with rolling: true)
  }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 3 // 3 hours (extends on each request)
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Security Headers with Helmet.js
app.use(helmet({
  // Content Security Policy - allows necessary external resources
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Required for inline scripts in HTML pages
        "'unsafe-eval'", // Required for MathLive and dynamic math rendering
        "https://cdnjs.cloudflare.com", // Font Awesome
        "https://cdn.jsdelivr.net", // Various CDN resources
        "https://unpkg.com", // MathLive and other packages
        "https://www.desmos.com" // Desmos graphing calculator API
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for inline styles
        "https://cdnjs.cloudflare.com", // Font Awesome
        "https://fonts.googleapis.com" // Google Fonts
      ],
      fontSrc: [
        "'self'",
        "https://cdnjs.cloudflare.com", // Font Awesome
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
        "https://api.anthropic.com", // Claude API
        "https://api.openai.com", // OpenAI API
        "https://api.mathpix.com", // Mathpix OCR
        "https://api.elevenlabs.io" // ElevenLabs TTS
      ],
      mediaSrc: ["'self'", "blob:", "data:"], // Audio/video
      objectSrc: ["'none'"], // Disable plugins
      frameSrc: ["'self'"], // Only allow same-origin iframes
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
  }
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120,
  message: "Too many requests from this IP, please try again after 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Strict rate limiting for authentication endpoints (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Only 5 attempts per 15 minutes
  message: "Too many login/signup attempts from this IP. Please try again after 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count both successful and failed attempts
});

// CSRF Protection for all routes
// Applies to POST, PUT, DELETE, PATCH requests
// GET requests generate tokens for forms
app.use(csrfProtection);

// HTTP Request Logging
app.use(logger.requestLogger);


// --- 7. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => logger.info("✅ Connected to MongoDB", { database: 'MongoDB' }))
  .catch(err => {
    logger.error("❌ MongoDB connection error", err);
    process.exit(1); // Exit if database connection fails
  });


// --- 8. ROUTE DEFINITIONS ---

app.use('/login', authLimiter, loginRoutes);
app.use('/signup', authLimiter, signupRoutes);
app.use('/api/password-reset', authLimiter, passwordResetRoutes);
app.post('/logout', isAuthenticated, handleLogout);

// --- Google Auth Routes ---
app.get('/auth/google', authLimiter, passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', authLimiter, (req, res, next) => {
    passport.authenticate('google', (err, user, info) => {
        if (err) { return next(err); }
        if (!user) {
            const errorMessage = info && info.message ? encodeURIComponent(info.message) : 'authentication_failed';
            return res.redirect(`/login.html?error=${errorMessage}`);
        }
        req.logIn(user, (err) => {
            if (err) { return next(err); }
            if (user.needsProfileCompletion) return res.redirect('/complete-profile.html');
            if (user.role === 'student' && !user.selectedTutorId) return res.redirect('/pick-tutor.html');
            const dashboardMap = { student: '/chat.html', teacher: '/teacher-dashboard.html', admin: '/admin-dashboard.html', parent: '/parent-dashboard.html' };
            res.redirect(dashboardMap[user.role] || '/login.html');
        });
    })(req, res, next);
});

// --- Microsoft Auth Routes (FIXED: ADDED MISSING ROUTES) ---
app.get('/auth/microsoft', authLimiter, passport.authenticate('microsoft', { scope: ['user.read'] }));

app.get('/auth/microsoft/callback', authLimiter, (req, res, next) => {
    passport.authenticate('microsoft', (err, user, info) => {
        if (err) { return next(err); }
        if (!user) {
            const errorMessage = info && info.message ? encodeURIComponent(info.message) : 'authentication_failed';
            return res.redirect(`/login.html?error=${errorMessage}`);
        }
        req.logIn(user, (err) => {
            if (err) { return next(err); }
            if (user.needsProfileCompletion) return res.redirect('/complete-profile.html');
            if (user.role === 'student' && !user.selectedTutorId) return res.redirect('/pick-tutor.html');
            const dashboardMap = { student: '/chat.html', teacher: '/teacher-dashboard.html', admin: '/admin-dashboard.html', parent: '/parent-dashboard.html' };
            res.redirect(dashboardMap[user.role] || '/login.html');
        });
    })(req, res, next);
});


// API Routes
app.use('/api/admin', isAuthenticated, isAdmin, adminRoutes);
app.use('/api/teacher', isAuthenticated, isTeacher, teacherRoutes);
app.use('/api/parent', isAuthenticated, isParent, parentRoutes);
app.use('/api/student', isAuthenticated, isStudent, studentRoutes.router);
app.use('/api/leaderboard', isAuthenticated, isAuthorizedForLeaderboard, leaderboardRoutes);
app.use('/api/chat', isAuthenticated, aiEndpointLimiter, chatRoutes); // SECURITY FIX: Added per-user rate limiting
app.use('/api/speak', isAuthenticated, speakRoutes);
app.use('/api/voice', isAuthenticated, aiEndpointLimiter, voiceRoutes); // Real-time voice chat with Whisper + TTS
app.use('/api/upload', isAuthenticated, aiEndpointLimiter, uploadRoutes); // SECURITY FIX: Added per-user rate limiting
app.use('/api/chat-with-file', isAuthenticated, aiEndpointLimiter, chatWithFileRoutes); // SECURITY FIX: Added per-user rate limiting 
app.use('/api/welcome-message', isAuthenticated, welcomeRoutes);
app.use('/api/memory', isAuthenticated, memoryRouter);
app.use('/api/summary', isAuthenticated, summaryGeneratorRouter); // SECURITY FIX: Added authentication to prevent unauthorized access
app.use('/api/avatars', isAuthenticated, avatarRoutes);
app.use('/api/graph', isAuthenticated, graphRoutes);
app.use('/api/curriculum', isAuthenticated, curriculumRoutes); // Curriculum schedule management
app.use('/api/teacher-resources', isAuthenticated, teacherResourceRoutes); // Teacher file uploads and resource management
app.use('/api/guidedLesson', isAuthenticated, guidedLessonRoutes);
app.use('/api/assessment', isAuthenticated, assessmentRoutes); // Skills assessment for adaptive learning
app.use('/api/screener', isAuthenticated, screenerRoutes); // IRT-based adaptive screener (CAT)
app.use('/api/mastery', isAuthenticated, masteryRoutes); // Mastery mode (placement → interview → badges)
app.use('/api/mastery/chat', isAuthenticated, aiEndpointLimiter, masteryChatRoutes); // Mastery mode dedicated chat
app.use('/api/settings', isAuthenticated, settingsRoutes); // User settings and password management
app.use('/api/email', isAuthenticated, emailRoutes); // Email service for parent reports and notifications
app.use('/api/grade-work', isAuthenticated, aiEndpointLimiter, gradeWorkRoutes); // AI grading for student work
app.use('/api/quarterly-growth', isAuthenticated, quarterlyGrowthRoutes); // Quarterly growth tracking and retention analytics
app.use('/api/fact-fluency', isAuthenticated, factFluencyRoutes); // M∆THBL∆ST Fact Fluency - Math facts practice game
app.use('/api', isAuthenticated, dailyQuestsRoutes); // Daily Quests & Streak System for mastery mode
app.use('/api', isAuthenticated, weeklyChallengesRoutes); // Weekly Challenges System for engagement
app.use('/api', isAuthenticated, learningCurveRoutes); // Learning Curve Visualization & IRT transparency
app.use('/api', isAuthenticated, celerationRoutes); // Standard Celeration Charts for fact fluency
app.use('/api/character-rigging', isAuthenticated, characterRiggingRoutes); // Character Rigging Portal for animation
app.use('/api/session', isAuthenticated, sessionRoutes); // Session management (idle timeout, auto-save, summaries)

// User Profile & Settings Routes
app.get("/user", isAuthenticated, async (req, res) => {
    try {
        if (!req.user) {
            console.log('[/user] No req.user found');
            return res.json({ user: null });
        }

        const User = require('./models/user');
        const { getTutorsToUnlock } = require('./utils/unlockTutors');

        // Check for retroactive tutor unlocks
        const user = await User.findById(req.user._id);

        if (!user) {
            console.error('[/user] User not found in database:', req.user._id);
            return res.json({ user: null });
        }

        if (user && user.level) {
            const tutorsToUnlock = getTutorsToUnlock(user.level, user.unlockedItems || []);

            if (tutorsToUnlock.length > 0) {
                // User should have tutors they don't - add them retroactively
                user.unlockedItems = user.unlockedItems || [];
                tutorsToUnlock.forEach(tutorId => {
                    if (!user.unlockedItems.includes(tutorId)) {
                        user.unlockedItems.push(tutorId);
                    }
                });
                await user.save();
                console.log(`✨ Retroactively unlocked ${tutorsToUnlock.length} tutor(s) for ${user.firstName}: ${tutorsToUnlock.join(', ')}`);
            }
        }

        res.json({ user: user ? user.toObject() : req.user.toObject() });
    } catch (error) {
        console.error('[/user] Error in /user endpoint:', error);
        console.error('[/user] Error stack:', error.stack);
        // Return 500 error instead of trying to send user data
        res.status(500).json({ error: 'Failed to load user data', message: error.message });
    }
});

app.patch('/api/user/settings', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const allowedUpdates = [
            'firstName', 'lastName', 'gradeLevel', 'mathCourse',
            'tonePreference', 'learningStyle', 'interests', 'needsProfileCompletion',
            'selectedTutorId', 'reportFrequency', 'goalViewPreference',
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


// --- 9. HTML ROUTES (MUST BE BEFORE STATIC MIDDLEWARE) ---

// Protected route for serving teacher resource files
app.get('/uploads/teacher-resources/:teacherId/:filename', isAuthenticated, async (req, res) => {
    try {
        const { teacherId, filename } = req.params;
        const user = await User.findById(req.user._id);

        // Allow teachers to access their own files, or students to access their teacher's files
        const isTeacher = user.role === 'teacher' && user._id.toString() === teacherId;
        const isStudentOfTeacher = user.role === 'student' && user.teacherId && user.teacherId.toString() === teacherId;

        if (!isTeacher && !isStudentOfTeacher) {
            return res.status(403).json({ message: 'Access denied' });
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

// Protected HTML routes (require authentication)
app.get("/complete-profile.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "complete-profile.html")));
app.get("/pick-tutor.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "pick-tutor.html")));
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

// Admin-specific protected routes
app.get("/admin-dashboard.html", isAuthenticated, isAdmin, (req, res) => res.sendFile(path.join(__dirname, "public", "admin-dashboard.html")));
app.get("/admin-upload.html", isAuthenticated, isAdmin, (req, res) => res.sendFile(path.join(__dirname, "public", "admin-upload.html")));

// Teacher-specific protected routes
app.get("/teacher-dashboard.html", isAuthenticated, isTeacher, (req, res) => res.sendFile(path.join(__dirname, "public", "teacher-dashboard.html")));
app.get("/teacher-celeration-dashboard.html", isAuthenticated, isTeacher, (req, res) => res.sendFile(path.join(__dirname, "public", "teacher-celeration-dashboard.html")));
app.get("/character-rigging.html", isAuthenticated, isTeacher, (req, res) => res.sendFile(path.join(__dirname, "public", "character-rigging.html")));

// Parent-specific protected routes
app.get("/parent-dashboard.html", isAuthenticated, isParent, (req, res) => res.sendFile(path.join(__dirname, "public", "parent-dashboard.html")));

// Upload page (authenticated users only)
app.get("/upload.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "upload.html")));

// Redirect old fact-fluency URL to correct one
app.get("/fact-fluency-practice.html", (req, res) => res.redirect(301, "/fact-fluency-blaster.html"));

// --- 10. STATIC FILE SERVING (AFTER ALL ROUTE DEFINITIONS) ---
// IMPORTANT: This must come AFTER all HTML route definitions to ensure authentication checks run first
app.use(express.static(path.join(__dirname, "public")));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

// Fallback for 404
app.get("*", (req, res) => {
  res.status(404).send(`Cannot GET ${req.path}`);
});


// --- 11. SAFETY & SECURITY INITIALIZATION ---
const { scheduleCleanup } = require('./middleware/uploadSecurity');

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