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
const chatRoute = require("./routes/chat"); // This now exports generateAndSaveSummary and SESSION_TRACKER
const saveConversation = require("./routes/memory"); // Also need saveConversation here

const app = express();
const PORT = process.env.PORT || 5000;
const { generateSystemPrompt } = require("./utils/prompt");


app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/chat", chatRoute);
app.use("/welcome-message", require("./routes/welcome"));

app.use(express.static(path.join(__dirname, "public"))); // This serves your HTML, CSS, JS from 'public'

// FIX: Removed deprecated useNewUrlParser and useUnifiedTopology options
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("SUCCESS: Connected to MongoDB"))
  .catch((err) => console.error("ERROR: MongoDB connection error:", err));
}

app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// ROUTE: GET /user - return logged-in user profile for frontend
app.get("/user", async (req, res) => {
  const userId = req.session?.userId;

  if (!userId) return res.status(401).json({ error: "Not logged in" });

  try {
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("ERROR: Error loading user:", err);
    res.status(500).json({ error: "Failed to load user" });
  }
});

// ROUTE: Logout - Now includes summary generation before destroying session
app.get("/logout", (req, res) => {
  const userId = req.session?.userId;
  const currentMessageLog = chatRoute.SESSION_TRACKER[userId]?.messageLog; // Get messageLog from tracker

  // Check if there's an active conversation to summarize
  if (userId && currentMessageLog && currentMessageLog.length > 0) {
    User.findById(userId).then(async user => { // Fetch non-lean user for profile
        if (user) {
            // Ensure studentProfile has necessary fields for summarization prompt
            const studentProfileForSummary = user.toObject();
            studentProfileForSummary.course = user.mathCourse;

            const aiGeneratedSummary = await chatRoute.generateAndSaveSummary(
                user._id,
                currentMessageLog,
                studentProfileForSummary
            );

            if (aiGeneratedSummary) {
                await saveConversation(user._id, aiGeneratedSummary); // Use saveConversation
                console.log(`LOG: AI summary generated and saved for user ${user.username} on logout.`);
            } else {
                await saveConversation(user._id, `Session with ${user.firstName || user.username} - Summary failed to generate.`);
                console.warn(`WARN: AI summary failed for user ${user.username} on logout. Generic summary saved.`);
            }
        }
    }).catch(err => {
        console.error("ERROR: Failed to save AI summary on logout:", err);
    }).finally(() => {
        // Clean up session tracker regardless of summary success/failure
        delete chatRoute.SESSION_TRACKER[userId];
        // Proceed with logout
        req.logout(() => {
            req.session.destroy(() => {
                res.clearCookie("connect.sid");
                res.redirect("/login.html");
            });
        });
    });
  } else {
      // No active conversation to summarize, just proceed with logout
      delete chatRoute.SESSION_TRACKER[userId]; // Still clean up tracker
      req.logout(() => {
          req.session.destroy(() => {
              res.clearCookie("connect.sid");
              res.redirect("/login.html");
          });
      });
  }
});

// ROUTE: End Session (triggered by tab close/inactivity signal from frontend beacon)
app.post('/api/end-session', async (req, res) => {
    const { userId } = req.body;
    const currentMessageLog = chatRoute.SESSION_TRACKER[userId]?.messageLog;

    if (userId && currentMessageLog && currentMessageLog.length > 0) {
        try {
            const user = await User.findById(userId); // Fetch non-lean user for profile data
            if (user) {
                const studentProfileForSummary = user.toObject();
                studentProfileForSummary.course = user.mathCourse;

                const aiGeneratedSummary = await chatRoute.generateAndSaveSummary(
                    user._id,
                    currentMessageLog,
                    studentProfileForSummary
                );

                if (aiGeneratedSummary) {
                    await saveConversation(user._id, aiGeneratedSummary);
                    console.log(`LOG: AI summary generated and saved for user ${user.username} on session end (beacon).`);
                } else {
                    await saveConversation(user._id, `Session with ${user.firstName || user.username} - Summary failed to generate on session end.`);
                    console.warn(`WARN: AI summary failed for user ${user.username} on session end. Generic summary saved.`);
                }
            }
        } catch (err) {
            console.error("ERROR: Failed to save AI summary on session end (beacon):", err);
        } finally {
            delete chatRoute.SESSION_TRACKER[userId]; // Clean up tracker
        }
    }
    // IMPORTANT: Send a 200 OK response immediately. sendBeacon doesn't care about the response,
    // but it's good practice for the server to close the connection properly.
    res.status(200).send("Session end signal received and processed.");
});

// ROUTE: Profile Completion Endpoint
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
    console.error("ERROR: Profile completion failed:", err);
    res.status(500).json({ success: false, message: "Could not complete profile." });
  }
});

// ROUTE: Modular API Routes (MUST BE BEFORE 404 Fallback)
const uploadRoute = require("./routes/upload");
const loginRoute = require("./routes/login");
const signupRoute = require("./routes/signup");
const memoryRoute = require("./routes/memory").router;
const imageRoute = require("./routes/image");
const imageSearchRoute = require("./routes/image-search");
const speakRoute = require("./routes/speak");
const graphRoute = require("./routes/graph");
const adminRoute = require("./routes/admin");
const teacherRoute = require("./routes/teacher");
const summaryGeneratorRoute = require("./routes/summary_generator");


app.use("/upload", uploadRoute);
app.use("/login", loginRoute);
app.use("/signup", signupRoute);
app.use("/save-summary", memoryRoute);
app.use("/image", imageRoute);
app.use("/image-search", imageSearchRoute);
app.use("/speak", speakRoute);
app.use("/graph", graphRoute);
app.use("/api/admin", adminRoute);
app.use("/api/teacher", teacherRoute);
app.use("/api/generate-summary", summaryGeneratorRoute);


// Fallback + Homepage - These should be at the END of your routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Generic 404 Fallback - THIS MUST BE THE LAST app.use or app.get
app.use((req, res) => {
  res.status(404).send("ROUTE NOT FOUND: Route not found.");
});

// ROUTE: Start the server
app.listen(PORT, () => {
  console.log(`SERVER: M∆THM∆TIΧ AI running on http://localhost:${PORT}`);
});

module.exports = { app };