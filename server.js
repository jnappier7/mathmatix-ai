// server.js - FINAL PRODUCTION VERSION w/ AUTO ROUTES + ROLE MIDDLEWARE
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
require("./auth/passport-config");

const {
  isAuthenticated,
  ensureNotAuthenticated,
  isAdmin,
  isTeacher,
  isParent,
  handleLogout // [CHANGE] - Import handleLogout from auth.js
} = require("./middleware/auth"); //

const autoMountRoutes = require("./utils/autoRouteLoader"); // Assuming this utility exists

// --- 2. INIT EXPRESS APP ---
const app = express();
const PORT = process.env.PORT || 5000;
app.set("trust proxy", 1);
const speakTestRoute = require("./routes/speak-test"); // Assuming this route exists

// --- 3. MIDDLEWARE CONFIG ---
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5000",
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions'
  }),
  cookie: {
    httpOnly: true,
    // [CHANGE] - Removed maxAge to make it a session-only cookie
    secure: process.env.NODE_ENV === 'production', // Use secure cookies (HTTPS) in production
    sameSite: 'Lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use("/speak-test", speakTestRoute); // Mount the speak-test route

// --- 4. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// --- 5. AUTOMOUNT ROUTES ---
// This part assumes you have a 'routes' folder and 'autoRouteLoader.js' utility.
// Ensure your '/api/chat' and other APIs are handled by this or defined explicitly.
autoMountRoutes(app, {
  skip: ["summary_generator"] // Skip any internal-only APIs
});

// --- 6. DIRECT ROUTES (outside auto-mount) ---
app.get("/user", isAuthenticated, (req, res) => {
  // Converts Mongoose document to a plain object before sending
  // This is good practice to prevent sending unintended Mongoose internals
  return res.json({ user: req.user.toObject() });
});

// [CHANGE] - Changed /logout from GET to POST and use handleLogout
app.post("/logout", handleLogout);


// --- 7. OAUTH ROUTES ---
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

// --- 8. STATIC FRONTEND ROUTES ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/login.html", ensureNotAuthenticated, (req, res) => {
  console.log('🔁 Checking session on /login.html');
  console.log('req.isAuthenticated():', req.isAuthenticated());
  console.log('req.user:', req.user);
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.get("/signup.html", ensureNotAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "signup.html")));
app.get("/chat.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "chat.html")));
app.get("/complete-profile.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "complete-profile.html")));
app.get("/pick-tutor.html", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "public", "pick-tutor.html")));
app.get("/parent-dashboard.html", isParent, (req, res) => res.sendFile(path.join(__dirname, "public", "parent-dashboard.html")));
app.get("/teacher-dashboard.html", isTeacher, (req, res) => res.sendFile(path.join(__dirname, "public", "teacher-dashboard.html")));
app.get("/admin-dashboard.html", isAdmin, (req, res) => res.sendFile(path.join(__dirname, "public", "admin-dashboard.html")));

// This line is redundant if all static files are served via explicit routes above,
// but harmless if some static files (like images, CSS, JS) are not explicitly routed.
app.use(express.static(path.join(__dirname, "public")));

// --- 9. 404 CATCH-ALL ---
app.get("*", (req, res) => {
  res.status(404).send("404: Page Not Found");
});

// --- 10. START SERVER ---
app.listen(PORT, () => {
  console.log(`🚀 M∆THM∆TIΧ AI is live on http://localhost:${PORT}`);
});