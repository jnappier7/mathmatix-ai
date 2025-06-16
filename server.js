// server.js - FINAL CORRECTED VERSION (with redirect loop fix)
// --- THIS IS THE CORRECT FILE - VERSION 2025-06-15 ---
console.log("✅✅✅ RUNNING THE LATEST, CORRECTED server.js FILE! ✅✅✅");
require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
require("./auth/passport-config");

// --- Route Imports ---
const User = require("./models/User");
const chatRoute = require("./routes/chat");
const loginRoute = require("./routes/login");
const signupRoute = require("./routes/signup");
const welcomeRoute = require("./routes/welcome");
const guidedLessonRoute = require('./routes/guidedLesson');
const adminRoute = require("./routes/admin");
const teacherRoute = require("./routes/teacher");
const parentRoutes = require('./routes/parent');
const avatarRoute = require('./routes/avatar');
const studentRoutes = require('./routes/student');
const leaderboardRoute = require("./routes/leaderboard");
const avatarPreviewRoute = require('./routes/avatar-preview');
// ... other route imports

const app = express();
const PORT = process.env.PORT || 5000;


// --- NEW MIDDLEWARE TO PREVENT REDIRECT LOOP ---
function ensureNotAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        // If the user is already logged in, redirect them away from the login page.
        let redirectUrl = '/chat.html'; // A safe default
        if (req.user.role === 'student' && !req.user.selectedTutorId) {
            redirectUrl = '/pick-tutor.html';
        } else if (req.user.role === 'teacher') {
            redirectUrl = '/teacher-dashboard.html';
        } else if (req.user.role === 'admin') {
            redirectUrl = '/admin-dashboard.html';
        } else if (req.user.role === 'parent') {
            redirectUrl = '/parent-dashboard.html';
        }
        return res.redirect(redirectUrl);
    }
    // If they are not authenticated, allow them to proceed to the next handler (which will serve the login page).
    next();
}
// --- END NEW MIDDLEWARE ---


// --- Core Middleware ---
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5000', credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' }
}));
app.use(passport.initialize());
app.use(passport.session());

// --- Database Connection ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("SUCCESS: Connected to MongoDB"))
  .catch((err) => console.error("ERROR: MongoDB connection error:", err));

// --- API & Authentication Routes (MUST COME BEFORE `express.static`) ---
app.use("/chat", chatRoute);
app.use("/login", loginRoute);
app.use("/signup", signupRoute);
app.use("/welcome-message", welcomeRoute);
app.use(guidedLessonRoute);
app.use("/admin", adminRoute);
app.use("/api/teacher", teacherRoute);
app.use('/api/parent', parentRoutes);
app.use('/api/avatar', avatarRoute);
app.use('/api/students', leaderboardRoute);
app.use('/api/student', studentRoutes);
app.use('/avatars', avatarPreviewRoute);
// ... other existing API routes

const { isAuthenticated } = require('./middleware/auth');

// --- User & Auth Routes ---
app.get("/user", isAuthenticated, (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Not logged in" });
    }
    let redirectUrl = null;
    if (req.user.needsProfileCompletion && req.user.role !== 'admin') {
        redirectUrl = '/complete-profile.html';
    } else if (req.user.role === 'student' && !req.user.selectedTutorId) {
        redirectUrl = '/pick-tutor.html';
    }
    return res.json({ user: req.user.toObject(), redirect: redirectUrl });
});

app.get("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        req.session.destroy(() => {
            res.clearCookie("connect.sid");
            res.redirect("/login.html");
        });
    });
});

app.post("/api/complete-profile", isAuthenticated, async (req, res) => {
    const { userId, ...profileData } = req.body;
    try {
        const user = await User.findByIdAndUpdate(req.user._id, { ...profileData, needsProfileCompletion: false }, { new: true });
        const redirect = (user.role === 'student') ? '/pick-tutor.html' : '/parent-dashboard.html';
        res.json({ success: true, redirect });
    } catch (err) {
        res.status(500).json({ success: false, message: "Could not complete profile." });
    }
});

// OAuth Routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html' }),
  (req, res) => {
    let redirectUrl = '/chat.html'; 
    if (req.user.needsProfileCompletion) {
      redirectUrl = '/complete-profile.html';
    } else if (req.user.role === 'teacher') {
      redirectUrl = '/teacher-dashboard.html';
    } else if (req.user.role === 'admin') {
      redirectUrl = '/admin-dashboard.html';
    } else if (req.user.role === 'parent') {
      redirectUrl = '/parent-dashboard.html';
    } else if (req.user.role === 'student' && !req.user.selectedTutorId) {
      redirectUrl = '/pick-tutor.html';
    }
    res.redirect(redirectUrl);
  }
);

app.get('/auth/microsoft', passport.authenticate('microsoft'));
app.get('/auth/microsoft/callback',
  passport.authenticate('microsoft', { failureRedirect: '/login.html' }),
  (req, res) => {
    let redirectUrl = '/chat.html';
    if (req.user.needsProfileCompletion) {
      redirectUrl = '/complete-profile.html';
    } else if (req.user.role === 'teacher') {
      redirectUrl = '/teacher-dashboard.html';
    } else if (req.user.role === 'admin') {
      redirectUrl = '/admin-dashboard.html';
    } else if (req.user.role === 'parent') {
      redirectUrl = '/parent-dashboard.html';
    } else if (req.user.role === 'student' && !req.user.selectedTutorId) {
      redirectUrl = '/pick-tutor.html';
    }
    res.redirect(redirectUrl);
  }
);


// --- STATIC FILE SERVING AND REDIRECT LOOP PREVENTION ---

// Apply the new middleware specifically to requests for the login page
// and explicitly serve the file to break the redirect chain.
app.get('/login.html', ensureNotAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve all other static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));
// --- END SECTION ---


// --- FINAL CATCH-ALL ROUTE ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Server Listen ---
app.listen(PORT, () => {
  console.log(`SERVER: M∆THM∆TIΧ AI running on http://localhost:${PORT}`);
});

module.exports = { app };