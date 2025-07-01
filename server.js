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
const rateLimit = require('express-rate-limit');

// Import Passport configuration (ensure it runs)
require("./auth/passport-config");

// Import authentication and authorization middleware
const {
  isAuthenticated,
  ensureNotAuthenticated,
  isAdmin,
  isTeacher,
  isParent,
  handleLogout
} = require("./middleware/auth");

// Import route loader utility
const autoMountRoutes = require("./utils/autoRouteLoader");

// --- 2. INIT EXPRESS APP ---
const app = express();
const PORT = process.env.PORT || 5001;
app.set("trust proxy", 1); // Trust proxy headers, essential if deployed behind a proxy/load balancer

// --- 3. MIDDLEWARE CONFIG ---
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5000",
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Session Middleware
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret-key",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60,
    autoRemove: 'interval',
    autoRemoveInterval: 10
  }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

// Passport Middleware for Authentication
app.use(passport.initialize());
app.use(passport.session());

// --- Rate Limiting Configuration ---
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120, // Limit each IP to 120 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes.",
  headers: true,
});

const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // Limit each IP to 30 requests per 5 minutes for AI calls
  message: "Too many AI requests from this IP, please try again in 5 minutes.",
  headers: true,
});

// --- Apply Rate Limiting (Global and Specific) ---
// Apply to ALL API routes first
app.use('/api/', apiLimiter); //
app.use('/chat', aiLimiter); // Stricter AI limiter for chat
app.use('/lesson', aiLimiter); // Stricter AI limiter for guided lessons
app.use('/speak', aiLimiter); // Stricter AI limiter for TTS
app.use('/upload', aiLimiter); // Stricter AI limiter for uploads that might hit AI/OCR


// --- 4. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err, "\nEnsure MONGO_URI is correctly set in your .env file."));


// --- 5. ROUTE MOUNTING (Unified via autoRouteLoader) ---
// All routes are now auto-mounted by autoMountRoutes utility
autoMountRoutes(app, {
  // We specify which routes to skip explicit mounting if they handle their own middleware
  // or are already handled by passport auth routes below
  skip: ["summary_generator", "login", "welcome", "speak", "chat", "student",
         "teacher", "admin", "parent", "user", "upload", "guidedLesson", "leaderboard",
         "image", "image-search", "image 2", "image-search 2", "avatar", "avatar-preview"
        ]
});

// Explicitly mount routes with custom Passport callbacks or for clarity
// These routes handle their own specific middleware/redirects
app.use('/login', require('./routes/login'));
app.use('/speak', require('./routes/speak')); // Re-added explicit speak mounting due to it being a direct route
app.use('/chat', require('./routes/chat')); // Explicitly mount chat as it has complex logic
app.use('/upload', require('./routes/upload')); // Explicitly mount upload due to its complexity

// OAuth Routes - these typically need explicit mounting due to Passport's callback handling
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login.html" }),
  (req, res) => {
    let redirectUrl = '/chat.html'; // Default redirect for students
    if (req.user.needsProfileCompletion) {
      redirectUrl = "/complete-profile.html";
    } else if (req.user.role === "teacher") {
      redirectUrl = "/teacher-dashboard.html";
    } else if (req.user.role === "admin") {
      redirectUrl = "/admin-dashboard.html";
    } else if (req.user.role === "parent") {
      redirectUrl = "/parent-dashboard.html";
    } else if (req.user.role === "student" && !req.user.selectedTutorId) {
      redirectUrl = "/pick-tutor.html";
    }
    res.redirect(redirectUrl);
  }
);

// Microsoft OAuth Routes - (kept as per previous discussion, but can be commented out if not actively used)
app.get("/auth/microsoft", passport.authenticate("microsoft"));
app.get("/auth/microsoft/callback",
  passport.authenticate("microsoft", { failureRedirect: "/login.html" }),
  (req, res) => {
    let redirectUrl = '/chat.html'; // Default redirect for students
    if (req.user.needsProfileCompletion) {
      redirectUrl = "/complete-profile.html";
    } else if (req.user.role === "teacher") {
      redirectUrl = "/teacher-dashboard.html";
    } else if (req.user.role === "admin") {
      redirectUrl = "/admin-dashboard.html";
    } else if (req.user.role === "parent") {
      redirectUrl = "/parent-dashboard.html";
    } else if (req.user.role === "student" && !req.user.selectedTutorId) {
      redirectUrl = "/pick-tutor.html";
    }
    res.redirect(redirectUrl);
  }
);

// General User Data Route (used by frontend to get current user)
app.get("/user", isAuthenticated, (req, res) => {
  return res.json({ user: req.user.toObject() }); // req.user is populated by Passport
});

// Logout route
app.post("/logout", handleLogout);

// --- 6. STATIC FRONTEND ROUTES ---
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));
app.use('/images', express.static(path.join(__dirname, 'public', 'images'))); // Ensure images are served

// Serve specific HTML pages (ensure middleware protects them)
app.get("/", ensureNotAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/login.html", ensureNotAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/signup.html", ensureNotAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "signup.html")));
app.get("/chat.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "chat.html")));
app.get("/complete-profile.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "complete-profile.html")));
app.get("/pick-tutor.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "pick-tutor.html")));
app.get("/parent-dashboard.html", isParent, (req, res) => res.sendFile(path.join(__dirname, "public", "parent-dashboard.html")));
app.get("/teacher-dashboard.html", isTeacher, (req, res) => res.sendFile(path.join(__dirname, "public", "teacher-dashboard.html")));
app.get("/admin-dashboard.html", isAdmin, (req, res) => res.sendFile(path.join(__dirname, "public", "admin-dashboard.html")));
app.get("/privacy.html", (req, res) => res.sendFile(path.join(__dirname, "public", "privacy.html")));
app.get("/terms.html", (req, res) => res.sendFile(path.join(__dirname, "public", "terms.html")));
app.get("/forgot-password.html", (req, res) => res.sendFile(path.join(__dirname, "public", "forgot-password.html")));


// --- 7. 404 CATCH-ALL ---
app.get("*", (req, res) => {
  res.status(404).send("404: Page Not Found");
});

// --- 8. START SERVER ---
app.listen(PORT, () => {
  console.log(`🚀 M∆THM∆TIΧ AI is live on http://localhost:${PORT}`);
});