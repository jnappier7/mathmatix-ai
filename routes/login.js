// routes/login.js (backend route)
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const passport = require("passport"); // Import passport
const LocalStrategy = require("passport-local").Strategy; // Import LocalStrategy
const User = require("../models/User");

// Configure Passport Local Strategy for username/password login
// This part is defined ONCE in passport-config.js. We need to remove this here.
// Passport strategies should be defined in passport-config.js and then used via passport.authenticate()

router.post("/", (req, res, next) => {
  // Use Passport's authenticate middleware for the 'local' strategy
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      console.error("ERROR: Passport authentication error:", err);
      return res.status(500).json({ error: "Authentication failed due to server error." });
    }
    if (!user) {
      // Authentication failed (e.g., incorrect username/password)
      return res.status(401).json({ error: info.message || "Invalid credentials" });
    }

    // Authentication successful, establish session via Passport's req.logIn()
    req.logIn(user, async (loginErr) => { // req.logIn is added by Passport
      if (loginErr) {
        console.error("ERROR: req.logIn error:", loginErr);
        return res.status(500).json({ error: "Login failed during session establishment." });
      }

      // Update lastLogin and save user
      user.lastLogin = Date.now();
      await user.save();

      // Check if user needs profile completion
      if (user.needsProfileCompletion) {
          console.log("Login successful, but user needs profile completion. Redirecting to /complete-profile.html");
          return res.status(200).json({
              message: "Login successful! Please complete your profile.",
              user: { _id: user._id, needsProfileCompletion: true },
              redirect: '/complete-profile.html' // Indicate redirection
          });
      }

      // If profile is complete, proceed to chat.html
      res.status(200).json({
        message: "Login successful!",
        user: {
          _id: user._id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          name: user.name,
          gradeLevel: user.gradeLevel,
          mathCourse: user.mathCourse,
          learningStyle: user.learningStyle,
          tonePreference: user.tonePreference,
          interests: user.interests,
          role: user.role,
        },
        redirect: '/chat.html' // Indicate redirection
      });
    });
  })(req, res, next); // Call the middleware
});

module.exports = router;