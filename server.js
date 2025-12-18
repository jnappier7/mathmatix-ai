// server.js
console.log("✅✅✅ RUNNING MATHMATIX.AI SERVER ✅✅✅");
require("dotenv").config();

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
  console.error(`❌ FATAL ERROR: Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// --- 2. IMPORTS ---
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const MongoStore = require("connect-mongo");
const rateLimit = require('express-rate-limit');
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

const loginRoutes = require('./routes/login');
const signupRoutes = require('./routes/signup');
const studentRoutes = require('./routes/student');
const teacherRoutes = require('./routes/teacher');
const adminRoutes = require('./routes/admin');
const parentRoutes = require('./routes/parent');
const leaderboardRoutes = require('./routes/leaderboard');
const chatRoutes = require('./routes/chat');
const speakRoutes = require('./routes/speak');
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
const gradeWorkRoutes = require('./routes/gradeWork');
const adminImportRoutes = require('./routes/adminImport');  // Item bank CSV import
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

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60, // 14 days
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

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120,
  message: "Too many requests from this IP, please try again after 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);


// --- 7. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err));


// --- 8. ROUTE DEFINITIONS ---

app.use('/login', loginRoutes);
app.use('/signup', signupRoutes);
app.post('/logout', isAuthenticated, handleLogout);

// --- Google Auth Routes ---
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', (req, res, next) => {
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
app.get('/auth/microsoft', passport.authenticate('microsoft', { scope: ['user.read'] }));

app.get('/auth/microsoft/callback', (req, res, next) => {
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
app.use('/api/grade-work', isAuthenticated, aiEndpointLimiter, gradeWorkRoutes); // AI grading for student work
app.use('/api/admin', adminImportRoutes); // Admin tools: CSV import for item bank

// User Profile & Settings Routes
app.get("/user", isAuthenticated, async (req, res) => {
    try {
        if (!req.user) return res.json({ user: null });

        const User = require('./models/user');
        const { getTutorsToUnlock } = require('./utils/unlockTutors');

        // Check for retroactive tutor unlocks
        const user = await User.findById(req.user._id);
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
        console.error('Error in /user endpoint:', error);
        res.json({ user: req.user ? req.user.toObject() : null });
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
            'parentTone', 'parentLanguage', 'preferences'
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


// --- 9. STATIC FILE SERVING & HTML ROUTES ---
app.use(express.static(path.join(__dirname, "public")));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

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

// HTML file routes
app.get("/", ensureNotAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/login.html", ensureNotAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/signup.html", ensureNotAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "signup.html")));
app.get("/complete-profile.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "complete-profile.html")));
app.get("/pick-tutor.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "pick-tutor.html")));
app.get("/chat.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "chat.html")));
app.get("/admin-dashboard.html", isAuthenticated, isAdmin, (req, res) => res.sendFile(path.join(__dirname, "public", "admin-dashboard.html")));
app.get("/admin-upload.html", isAuthenticated, isAdmin, (req, res) => res.sendFile(path.join(__dirname, "public", "admin-upload.html")));
app.get("/teacher-dashboard.html", isAuthenticated, isTeacher, (req, res) => res.sendFile(path.join(__dirname, "public", "teacher-dashboard.html")));
app.get("/parent-dashboard.html", isAuthenticated, isParent, (req, res) => res.sendFile(path.join(__dirname, "public", "parent-dashboard.html")));
app.get("/privacy.html", (req, res) => res.sendFile(path.join(__dirname, "public", "privacy.html")));
app.get("/terms.html", (req, res) => res.sendFile(path.join(__dirname, "public", "terms.html")));
app.get("/canvas.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "canvas.html")));

// Fallback for 404
app.get("*", (req, res) => {
  res.status(404).send(`Cannot GET ${req.path}`);
});


// --- 10. SERVER LISTENER ---
app.listen(PORT, () => {
  console.log(`🚀 M∆THM∆TIΧ AI is live on http://localhost:${PORT}`);
});