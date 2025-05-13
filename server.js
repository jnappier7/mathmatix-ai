// server.js — Main entry point for M∆THM∆TIΧ AI backend

require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const puppeteer = require("puppeteer");
const session = require("express-session");
const passport = require("passport");
require("./auth/passport-config");

const User = require("./models/User");

puppeteer
  .createBrowserFetcher()
  .download("1108766")
  .then(() => console.log("✅ Chromium downloaded"))
  .catch((err) => console.error("❌ Chromium download failed:", err.message));

const app = express();
const PORT = process.env.PORT || 5000;
const { SYSTEM_PROMPT } = require("./utils/prompt");

// ✅ Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ Static files
app.use(express.static(path.join(__dirname, "public")));

// ✅ MongoDB connection
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));
}

// ✅ Session and Passport setup
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// ✅ Google Auth Routes
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get("/auth/google/callback", passport.authenticate("google", {
  failureRedirect: "/login.html"
}), async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user && user.tonePreference && user.learningStyle) {
    return res.redirect("/chat.html");
  } else {
    return res.redirect("/complete-profile.html");
  }
});

// ✅ Microsoft Auth Routes
app.get("/auth/microsoft", passport.authenticate("microsoft"));

app.get("/auth/microsoft/callback",
  passport.authenticate("microsoft", {
    failureRedirect: "/login.html"
  }),
  async (req, res) => {
    const user = await User.findById(req.user._id);
    if (user && user.tonePreference && user.learningStyle) {
      return res.redirect("/chat.html");
    } else {
      return res.redirect("/complete-profile.html");
    }
  }
);

 app.get("/auth/whoami", (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "User session not found" });
  }

  res.json({
    userId: req.user._id,
    name: req.user.name,
    tone: req.user.tonePreference,
    learningStyle: req.user.learningStyle,
    interests: req.user.interests || []
  });
});

// ✅ Logout Route
app.get("/logout", (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.redirect("/login.html");
    });
  });
});

// ✅ Profile Completion Endpoint
app.post("/api/complete-profile", async (req, res) => {
  const { userId, name, gradeLevel, mathCourse, tonePreference, learningStyle, interests } = req.body;
  try {
    await User.findByIdAndUpdate(userId, {
      name,
      gradeLevel,
      mathCourse,
      tonePreference,
      learningStyle,
      interests
    });
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Profile completion failed:", err);
    res.status(500).json({ success: false, message: "Could not complete profile." });
  }
});

// ✅ Modular Routes
const uploadRoute = require("./routes/upload");
const loginRoute = require("./routes/login");
const signupRoute = require("./routes/signup");
const memoryRoute = require("./routes/memory").router;
const chatRoute = require("./routes/chat");
const imageRoute = require("./routes/image");
const imageSearchRoute = require("./routes/image-search");
const speakRoute = require("./routes/speak");

app.use("/upload", uploadRoute);
app.use("/login", loginRoute);
app.use("/signup", signupRoute);
app.use("/save-summary", memoryRoute);
app.use("/chat", chatRoute);
app.use("/image", imageRoute);
app.use("/image-search", imageSearchRoute);
app.use("/speak", speakRoute);

// ✅ Default Route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ 404 fallback
app.use((req, res) => {
  res.status(404).send("🔍 Route not found.");
});

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`🚀 M∆THM∆TIΧ AI running on http://localhost:${PORT}`);
});

module.exports = { app, SYSTEM_PROMPT };
