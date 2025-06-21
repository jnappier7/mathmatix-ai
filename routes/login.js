// routes/login.js - REVISED

const express = require("express");
const router = express.Router();
const passport = require("passport");
const User = require("../models/user");

router.post("/", (req, res, next) => {
  console.log("[/login Route] POST request received.");

  // Use Passport's custom callback to gain full control over the response
  passport.authenticate('local', (err, user, info) => {
    // Case 1: A catastrophic error occurred (e.g., database connection issue)
    if (err) {
      console.error("[/login Route] Passport authentication error:", err);
      return res.status(500).json({ success: false, message: "Server error during authentication." });
    }

    // Case 2: Authentication failed (user not found or password incorrect)
    if (!user) {
      console.log("[/login Route] Authentication failed:", info.message);
      // 'info.message' comes from the LocalStrategy 'done' function
      return res.status(401).json({ success: false, message: info.message || "Invalid credentials." });
    }

    // Case 3: Authentication succeeded, now log the user in
    req.logIn(user, async (loginErr) => {
      if (loginErr) {
        console.error("[/login Route] req.logIn error:", loginErr);
        return res.status(500).json({ success: false, message: "Server error during session creation." });
      }

      // Login and session are now established. Update lastLogin.
      user.lastLogin = Date.now();
      await user.save();

      // Determine the correct redirect URL
      let redirectUrl = '/chat.html'; // Default
      if (user.needsProfileCompletion) {
        redirectUrl = '/complete-profile.html';
      } else if (user.role === 'teacher') {
        redirectUrl = '/teacher-dashboard.html';
      } else if (user.role === 'admin') {
        redirectUrl = '/admin-dashboard.html';
      } else if (user.role === 'parent') {
        redirectUrl = '/parent-dashboard.html';
      } else if (user.role === 'student' && !user.selectedTutorId) {
        redirectUrl = '/pick-tutor.html';
      }
      
      console.log(`[/login Route] Login successful for ${user.username}. Sending redirect to: ${redirectUrl}`);
      // Send the final success response
      return res.json({ success: true, message: "Login successful!", redirect: redirectUrl });
    });
  })(req, res, next); // This invokes the middleware
});

module.exports = router;