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
const chatRoute = require("./routes/chat");

const app = express();
const PORT = process.env.PORT || 5000;
const { generateSystemPrompt } = require("./utils/prompt");


app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/chat", chatRoute);
app.use("/welcome-message", require("./routes/welcome"));

app.use(express.static(path.join(__dirname, "public")));

if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("âŒ MongoDB connection error:", err));
}

app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// ✅ GET /user — return logged-in user profile for frontend
app.get("/user", async (req, res) => {
  const userId = req.session?.userId;

  if (!userId) return res.status(401).json({ error: "Not logged in" });

  try {
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("❌ Error loading user:", err);
    res.status(500).json({ error: "Failed to load user" });
  }
});

// âœ… Logout Route
app.get("/logout", (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.redirect("/login.html");
    });
  });
});

// âœ… Profile Completion Endpoint
app.post("/api/complete-profile", async (req, res) => {
  const {
    userId,
    name,
    gradeLevel,
    mathCourse,
    tonePreference,
    learningStyle,
    interests
  } = req.body;

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
    console.error("âŒ Profile completion failed:", err);
    res.status(500).json({ success: false, message: "Could not complete profile." });
  }
});

// âœ… Modular Routes
const uploadRoute = require("./routes/upload");
const loginRoute = require("./routes/login");
const signupRoute = require("./routes/signup");
const memoryRoute = require("./routes/memory").router;
const imageRoute = require("./routes/image");
const imageSearchRoute = require("./routes/image-search");
const speakRoute = require("./routes/speak");
const graphRoute = require("./routes/graph");


app.use("/upload", uploadRoute);
app.use("/login", loginRoute);
app.use("/signup", signupRoute);
app.use("/save-summary", memoryRoute);
app.use("/image", imageRoute);
app.use("/image-search", imageSearchRoute);
app.use("/speak", speakRoute);
app.use("/graph", graphRoute);


// Fallback + Homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((req, res) => {
  res.status(404).send("🔍 Route not found.");
});

// âœ… Start the server
app.listen(PORT, () => {
  console.log(`🚀 M∆THM∆TIΧ AI running on http://localhost:${PORT}`);
});

module.exports = { app };

