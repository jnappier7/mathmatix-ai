require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const puppeteer = require("puppeteer");
const session = require("express-session");
const passport = require("passport");
require("./auth/passport-config"); // Ensure passport config is loaded

const User = require("./models/User");
const chatRoute = require("./routes/chat");
const saveConversation = require("./routes/memory");

// Import middleware and routes
const { isAuthenticated, isStudent, isTeacher, isAdmin, isAuthorizedForLeaderboard } = require('./middleware/auth');
const leaderboardRoute = require("./routes/leaderboard");
const uploadRoute = require("./routes/upload");
const loginRoute = require("./routes/login"); // This is your local login route (backend)
const signupRoute = require("./routes/signup"); // Your signup route (backend)
const memoryRoute = require("./routes/memory").router;
const imageRoute = require("./routes/image");
const imageSearchRoute = require("./routes/image-search");
const speakRoute = require("./routes/speak");
const graphRoute = require("./routes/graph");
const adminRoute = require("./routes/admin");
const teacherRoute = require("./routes/teacher");
const summaryGeneratorRoute = require("./routes/summary_generator");
const welcomeRoute = require("./routes/welcome"); // Ensure welcome route is imported


const app = express();
const PORT = process.env.PORT || 5000;
const { generateSystemPrompt } = require("./utils/prompt");


app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ---- CRITICAL: CORRECT MIDDLEWARE ORDERING ----

// 1. Session Middleware (MUST COME BEFORE Passport)
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// 2. Passport Middleware (MUST COME AFTER Session)
app.use(passport.initialize());
app.use(passport.session());

// 3. Static Files (Serve public files - generally comes before routes,
// but AFTER session/passport if you want authenticated static content,
// or if your static content is a single-page app that makes API calls)
app.use(express.static(path.join(__dirname, "public")));

// FIX: MongoDB connection
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("SUCCESS: Connected to MongoDB"))
  .catch((err) => console.error("ERROR: MongoDB connection error:", err));
}

// 4. Authentication-Dependent Routes (MUST COME AFTER Passport.session())

// Route to get logged-in user profile for frontend
app.get("/user", isAuthenticated, async (req, res) => {
  console.log("---- /user route accessed (with isAuthenticated) ----");
  console.log("req.isAuthenticated():", req.isAuthenticated());
  console.log("req.user:", req.user); // THIS IS KEY for debugging

  if (!req.user) { // Rely solely on req.user now that isAuthenticated passed
     console.log("WARN: req.user not populated despite isAuthenticated passing. This should NOT happen.");
     return res.status(401).json({ error: "Not logged in (req.user missing)" }); // This should ideally not be hit if isAuthenticated works
  }

  try {
    // If the user's profile is not complete, redirect to complete-profile.html from server
    if (req.user.needsProfileCompletion) {
        console.log("User needs profile completion, redirecting to /complete-profile.html");
        // Sending a specific status or JSON object that frontend can interpret for redirect
        return res.status(200).json({ user: req.user.toObject(), redirect: '/complete-profile.html' });
    }
    res.json(req.user.toObject()); // Send a plain object to frontend, not a Mongoose document
  } catch (err) {
    console.error("ERROR: Error processing user from Passport:", err);
    res.status(500).json({ error: "Failed to load user profile from session." });
  }
});

// ROUTE: Logout - Now includes summary generation before destroying session
app.get("/logout", (req, res) => {
  const userId = req.session?.userId;
  const currentMessageLog = chatRoute.SESSION_TRACKER[userId]?.messageLog;

  if (userId && currentMessageLog && currentMessageLog.length > 0) {
    User.findById(userId).then(async user => {
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
                console.log(`LOG: AI summary generated and saved for user ${user.username} on logout.`);
            } else {
                await saveConversation(user._id, `Session with ${user.firstName || user.username} - Summary failed to generate.`);
                console.warn(`WARN: AI summary failed for user ${user.username} on logout. Generic summary saved.`);
            }
        }
    }).catch(err => {
        console.error("ERROR: Failed to save AI summary on logout:", err);
    }).finally(() => {
        delete chatRoute.SESSION_TRACKER[userId];
        req.logout((err) => {
            if (err) {
                console.error("ERROR: Passport logout error:", err);
                return res.status(500).send("Logout failed.");
            }
            req.session.destroy(() => {
                res.clearCookie("connect.sid");
                res.redirect("/login.html");
            });
        });
    });
  } else {
      delete chatRoute.SESSION_TRACKER[userId];
      req.logout((err) => {
            if (err) {
                console.error("ERROR: Passport logout error:", err);
                return res.status(500).send("Logout failed.");
            }
            req.session.destroy(() => {
                res.clearCookie("connect.sid");
                res.redirect("/login.html");
            });
        });
  }
});

app.post('/api/end-session', async (req, res) => {
    const { userId } = req.body;
    const currentMessageLog = chatRoute.SESSION_TRACKER[userId]?.messageLog;

    if (userId && currentMessageLog && currentMessageLog.length > 0) {
        try {
            const user = await User.findById(userId);
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
                    await saveConversation(user._id, `Session with ${user.firstName || user.username} - Summary failed to generate. Generic summary saved.`);
                    console.warn(`WARN: AI summary failed for user ${user.username} on session end. Generic summary saved.`);
                }
            }
        } catch (err) {
            console.error("ERROR: Failed to save AI summary on session end (beacon):", err);
        } finally {
            delete chatRoute.SESSION_TRACKER[userId];
        }
    }
    res.status(200).send("Session end signal received and processed.");
});

app.post("/api/complete-profile", async (req, res) => {
  const {
    userId,
    firstName, // Now explicitly receiving firstName
    lastName,  // Now explicitly receiving lastName
    name, // This will be derived from firstName/lastName now
    gradeLevel,
    mathCourse,
    tonePreference,
    learningStyle,
    interests,
    needsProfileCompletion // This will be sent as false from frontend
  } = req.body;

  try {
    // Find the user by ID and update the profile fields
    const user = await User.findById(userId);
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found." });
    }

    user.firstName = firstName;
    user.lastName = lastName;
    user.name = name || `${firstName} ${lastName}`; // Update 'name' if still used
    user.gradeLevel = gradeLevel;
    user.mathCourse = mathCourse;
    user.tonePreference = tonePreference;
    user.learningStyle = learningStyle;
    user.interests = interests;
    user.needsProfileCompletion = false; // Mark profile as complete

    await user.save(); // Save the updated user document

    res.json({ success: true, user: user.toObject() }); // Send back updated user object
  } catch (err) {
    console.error("ERROR: Profile completion failed:", err);
    res.status(500).json({ success: false, message: "Could not complete profile." });
  }
});


// All other modular routes should also come AFTER Passport.session() and static files
app.use("/chat", chatRoute);
app.use("/welcome-message", welcomeRoute);
app.use("/upload", uploadRoute);
app.use("/signup", signupRoute);
app.use("/save-summary", memoryRoute);
app.use("/image", imageRoute);
app.use("/image-search", imageSearchRoute);
app.use("/speak", speakRoute);
app.use("/graph", graphRoute);
app.use("/api/admin", adminRoute);
app.use("/api/teacher", teacherRoute);
app.use("/api/generate-summary", summaryGeneratorRoute);
app.use("/api/students", leaderboardRoute);


// --- NEW: Passport Social Login Routes ---
// Google OAuth routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html' }),
  (req, res) => {
    // Successful authentication, redirect based on profile completion status
    if (req.user && req.user.needsProfileCompletion) {
      console.log("Passport: Google login - User needs profile completion, redirecting to /complete-profile.html");
      res.redirect('/complete-profile.html');
    } else {
      console.log("Passport: Google login successful, redirecting to chat.html for user:", req.user.username || req.user.name);
      res.redirect('/chat.html');
    }
  }
);

// Microsoft OAuth routes
app.get('/auth/microsoft', passport.authenticate('microsoft'));
app.get('/auth/microsoft/callback',
  passport.authenticate('microsoft', { failureRedirect: '/login.html' }),
  (req, res) => {
    // Successful authentication, redirect based on profile completion status
    if (req.user && req.user.needsProfileCompletion) {
      console.log("Passport: Microsoft login - User needs profile completion, redirecting to /complete-profile.html");
      res.redirect('/complete-profile.html');
    } else {
      console.log("Passport: Microsoft login successful, redirecting to chat.html for user:", req.user.username || req.user.name);
      res.redirect('/chat.html');
    }
  }
);
// --- END NEW: Passport Social Login Routes ---


// 5. Fallback + Homepage - These should be at the END of your routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Generic 404 Fallback - THIS MUST BE THE LAST app.use or app.get
app.use((req, res) => {
  res.status(404).send("ROUTE NOT FOUND: Route not found.");
});

app.listen(PORT, () => {
  console.log(`SERVER: M∆THM∆TIΧ AI running on http://localhost:${PORT}`);
});

module.exports = { app };