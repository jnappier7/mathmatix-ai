// server.js - FINAL PRODUCTION VERSION w/ ALL CONSOLIDATED ROUTES & MIDDLEWARE
console.log("✅✅✅ RUNNING MATHMATIX.AI SERVER ✅✅✅");
require("dotenv").config();

// --- 1. IMPORTS ---
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const MongoStore = require("connect-mongo");
const rateLimit = require('express-rate-limit'); // NEW: Import rate-limit

// Import Passport configuration (ensure it runs)
require("./auth/passport-config");

// Import authentication and authorization middleware
const {
  isAuthenticated,
  ensureNotAuthenticated,
  isAdmin,
  isTeacher,
  isParent,
  handleLogout // Includes logout logic
} = require("./middleware/auth");

// Import route modules
const autoMountRoutes = require("./utils/autoRouteLoader");
const speakTestRoute = require("./routes/speak-test"); // Redundant, but harmless if already there
const leaderboardRouter = require('./routes/leaderboard');
const studentRouter = require('./routes/student');
const chatRouter = require('./routes/chat');
const lessonRouter = require('./routes/guidedLesson');
const userRouter = require('./routes/user');
const loginRouter = require('./routes/login');
const uploadRouter = require('./routes/upload');
const welcomeRouter = require('./routes/welcome');


// --- 2. INIT EXPRESS APP ---
const app = express();
const PORT = process.env.PORT || 5000;
app.set("trust proxy", 1); // Trust proxy headers, essential if deployed behind a proxy/load balancer

// --- 3. MIDDLEWARE CONFIG ---
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5000", // Adjust for your frontend URL in production
  credentials: true // Allow cookies to be sent
}));
app.use(express.json({ limit: "10mb" })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Session Middleware
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret-key", // Use a strong, unique secret
  resave: false, // Do not save session if unmodified
  saveUninitialized: false, // Do not save new sessions that have not been modified
  store: MongoStore.create({ // MongoDB session store
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60, // Session TTL: 14 days
    autoRemove: 'interval',
    autoRemoveInterval: 10 // In minutes. To clean up expired sessions
  }),
  cookie: {
    httpOnly: true, // Prevent client-side JS access to cookie
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (HTTPS)
    sameSite: 'Lax', // Protects against CSRF attacks
    maxAge: 1000 * 60 * 60 * 24 * 7 // Cookie expiry: 7 days (matching session TTL)
  }
}));

// Passport Middleware for Authentication
app.use(passport.initialize());
app.use(passport.session());

// --- Rate Limiting Configuration ---
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes.",
  headers: true, // Send X-RateLimit-Limit, X-RateLimit-Remaining, and Retry-After headers
});

const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // Limit each IP to 30 requests per 5 minutes for AI calls
  message: "Too many AI requests from this IP, please try again in 5 minutes.",
  headers: true,
});


// --- 4. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err, "\nEnsure MONGO_URI is correctly set in your .env file."));


// --- 5. ROUTE MOUNTING ---
// Apply Rate Limiting to specific routes
app.use('/api/', apiLimiter); // General API rate limiter
app.use('/chat', aiLimiter); // Stricter AI limiter for chat
app.use('/lesson', aiLimiter); // Stricter AI limiter for guided lessons
app.use('/speak', aiLimiter); // Stricter AI limiter for TTS
app.use('/upload', aiLimiter); // Stricter AI limiter for uploads that might hit AI/OCR

// Core API Routes (explicitly mounted for clarity and control)
app.use('/login', loginRouter);
app.use('/speak', require('./routes/speak'));
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/student', studentRouter);
app.use('/chat', chatRouter);
app.use('/lesson', lessonRouter);
app.use('/api/user', userRouter);
app.use('/upload', uploadRouter);
app.use('/welcome', welcomeRouter);


// Auto-mount other routes from the 'routes' directory, skipping specified ones
autoMountRoutes(app, {
  skip: ["summary_generator", "leaderboard", "student", "chat", "guidedLesson", "user", "login", "upload", "welcome", "speak"]
});

// OAuth Routes
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login.html" }),
  (req, res) => {
    let redirectUrl = req.user.selectedTutorId ? "/chat.html" : "/pick-tutor.html";
    if (req.user.needsProfileCompletion) redirectUrl = "/complete-profile.html";
    else if (req.user.role === "teacher") redirectUrl = "/teacher-dashboard.html";
    else if (req.user.role === "admin") redirectUrl = "/admin-dashboard.html";
    else if (req.user.role === "parent") redirectUrl = "/parent-dashboard.html";
    res.redirect(redirectUrl);
  }
);

app.get("/auth/microsoft", passport.authenticate("microsoft"));
app.get("/auth/microsoft/callback",
  passport.authenticate("microsoft", { failureRedirect: "/login.html" }),
  (req, res) => {
    let redirectUrl = req.user.selectedTutorId ? "/chat.html" : "/pick-tutor.html";
    if (req.user.needsProfileCompletion) redirectUrl = "/complete-profile.html";
    else if (req.user.role === "teacher") redirectUrl = "/teacher-dashboard.html";
    else if (req.user.role === "admin") redirectUrl = "/admin-dashboard.html";
    else if (req.user.role === "parent") redirectUrl = "/parent-dashboard.html";
    res.redirect(redirectUrl);
  }
);

// Specific routes that are not auto-mounted or part of a router file
app.get("/user", isAuthenticated, (req, res) => {
  return res.json({ user: req.user.toObject() });
});

app.post("/logout", handleLogout); // Logout route


// --- 6. STATIC FRONTEND ROUTES ---
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Serve specific HTML pages (ensure middleware protects them)
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/login.html", ensureNotAuthenticated, (req, res) => {
  console.log('🔁 Checking session on /login.html');
  console.log('req.isAuthenticated():', req.isAuthenticated());
  console.log('req.user:', req.user ? req.user.username : 'undefined');
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.get("/signup.html", ensureNotAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "signup.html")));
app.get("/chat.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "chat.html")));
app.get("/complete-profile.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "complete-profile.html")));
app.get("/pick-tutor.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "pick-tutor.html")));
app.get("/parent-dashboard.html", isParent, (req, res) => res.sendFile(path.join(__dirname, "public", "parent-dashboard.html")));
app.get("/teacher-dashboard.html", isTeacher, (req, res) => res.sendFile(path.join(__dirname, "public", "teacher-dashboard.html")));
app.get("/admin-dashboard.html", isAdmin, (req, res) => res.sendFile(path.join(__dirname, "public", "admin-dashboard.html")));


// --- 7. 404 CATCH-ALL ---
app.get("*", (req, res) => {
  res.status(404).send("404: Page Not Found");
});

// --- 8. START SERVER ---
app.listen(PORT, () => {
  console.log(`🚀 M∆THM∆TIΧ AI is live on http://localhost:${PORT}`);
});