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
const speakTestRoute = require("./routes/speak-test");
const leaderboardRouter = require('./routes/leaderboard'); // [FIXED] Correctly import leaderboard router
const studentRouter = require('./routes/student');       // [FIXED] Correctly import student router
const chatRouter = require('./routes/chat');             // [NEW] Import chat router
const lessonRouter = require('./routes/guidedLesson');   // [NEW] Import guidedLesson router (was named guidedLesson.js)
const userRouter = require('./routes/user');             // [NEW] Import user settings router (assuming routes/user.js exists for /api/user/settings)
const loginRouter = require('./routes/login');           // [NEW] Import login router (was login.js)
const uploadRouter = require('./routes/upload');         // [NEW] Import upload router (assuming routes/upload.js exists)
const welcomeRouter = require('./routes/welcome');       // [NEW] Import welcome router (was welcome.js)


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


// --- 4. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err, "\nEnsure MONGO_URI is correctly set in your .env file."));


// --- 5. ROUTE MOUNTING ---
// Core API Routes (explicitly mounted for clarity and control)
app.use('/login', loginRouter); // Local login route
app.use('/speak', require('./routes/speak')); // TTS route
app.use('/api/leaderboard', leaderboardRouter); // [FIXED] Leaderboard API route
app.use('/api/student', studentRouter);       // [FIXED] Student API route (for invite codes etc.)
app.use('/chat', chatRouter);                 // Main chat API route
app.use('/lesson', lessonRouter);             // Guided lesson API routes
app.use('/api/user', userRouter);             // User settings/profile API route
app.use('/upload', uploadRouter);             // File upload route
app.use('/welcome', welcomeRouter);           // Welcome message API route (using GET, not auto-mounted with POST by default)


// Auto-mount other routes from the 'routes' directory, skipping specified ones
autoMountRoutes(app, {
  skip: ["summary_generator", "leaderboard", "student", "chat", "guidedLesson", "user", "login", "upload", "welcome", "speak"] // [MODIFIED] Skip all explicitly mounted routes
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