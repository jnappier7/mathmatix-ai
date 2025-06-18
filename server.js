// server.js - FINAL PATH-CORRECTED VERSION
console.log("✅✅✅ RUNNING THE LATEST, CORRECTED server.js FILE! 6-17-25_8:11pm ✅✅✅");
require("dotenv").config();

// --- 1. IMPORTS ---
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
require("./auth/passport-config"); // ✅ CORRECTED PATH

// --- Route and Middleware Imports ---
const { isAuthenticated, ensureNotAuthenticated, isAdmin, isTeacher, isParent } = require('./middleware/auth'); // ✅ CORRECTED PATH
const chatRoute = require("./routes/chat"); // ✅ CORRECTED PATH
const loginRoute = require("./routes/login"); // ✅ CORRECTED PATH
const signupRoute = require("./routes/signup"); // ✅ CORRECTED PATH
// ... include all your other route files with the "./" prefix

// --- 2. INITIALIZE APP ---
const app = express();
app.set('trust proxy', 1); // For Render/proxy compatibility
const PORT = process.env.PORT || 5000;

// --- 3. CORE MIDDLEWARE (in correct order) ---
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5000', credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// --- 4. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("SUCCESS: Connected to MongoDB"))
  .catch((err) => console.error("ERROR: MongoDB connection error:", err));

// --- 5. API & DYNAMIC ROUTES ---
app.use("/login", loginRoute);
app.use("/signup", signupRoute);
app.use("/chat", isAuthenticated, chatRoute);
// ... other API routes

// --- 6. STATIC & PROTECTED PAGE SERVING ---

// UNPROTECTED Pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html'))); // ✅ CORRECTED PATH
app.get('/login.html', ensureNotAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html'))); // ✅ CORRECTED PATH
app.get('/signup.html', ensureNotAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html'))); // ✅ CORRECTED PATH

// PROTECTED Pages
app.get('/chat.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html'))); // ✅ CORRECTED PATH
app.get('/complete-profile.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'complete-profile.html'))); // ✅ CORRECTED PATH
app.get('/pick-tutor.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'pick-tutor.html'))); // ✅ CORRECTED PATH

// Role-Specific Pages
app.get('/parent-dashboard.html', isParent, (req, res) => res.sendFile(path.join(__dirname, 'public', 'parent-dashboard.html'))); // ✅ CORRECTED PATH
app.get('/teacher-dashboard.html', isTeacher, (req, res) => res.sendFile(path.join(__dirname, 'public', 'teacher-dashboard.html'))); // ✅ CORRECTED PATH
app.get('/admin-dashboard.html', isAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'))); // ✅ CORRECTED PATH

// General static file serving for CSS, JS, images, etc.
app.use(express.static(path.join(__dirname, 'public'))); // ✅ CORRECTED PATH

// --- 7. FINAL CATCH-ALL ROUTE ---
app.get('*', (req, res) => {
  res.status(404).send("404 Not Found"); // It's better to send a 404 status for unknown routes
});

// --- 8. START SERVER ---
app.listen(PORT, () => {
  console.log(`SERVER: M∆THM∆TIΧ AI running on http://localhost:${PORT}`);
});