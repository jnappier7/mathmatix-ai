// routes/login.js - REVISED (WITH LOGGING AND TYPO FIX)

const express = require("express");
const router = express.Router();
const passport = require("passport");
const User = require("../models/user");

router.post("/", (req, res, next) => {
  console.log("\n--- [/login Route] POST request received ---");

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
      return res.status(401).json({ success: false, message: info.message || "Invalid credentials." });
    }

    // Case 3: Authentication succeeded, now log the user in
    req.logIn(user, async (loginErr) => {
      if (loginErr) {
        console.error("[/login Route] req.logIn error (session creation):", loginErr);
        return res.status(500).json({ success: false, message: "Server error during session creation." });
      }

      console.log(`[/login Route] User ${user.username} successfully logged into session.`);
      // Login and session are now established. Update lastLogin.
      user.lastLogin = Date.now();
      try {
        await user.save();
        console.log(`[/login Route] User ${user.username} lastLogin updated.`);
      } catch (saveError) {
        console.error(`[/login Route] Error saving user lastLogin for ${user.username}:`, saveError);
        // Continue despite save error, as login was successful
      }

      // Determine the correct redirect URL based on user role and status
      let redirectUrl = '/chat.html'; // Default for student
      if (user.needsProfileCompletion) {
        redirectUrl = '/complete-profile.html';
        console.log(`[/login Route] User ${user.username} needs profile completion. Redirecting to: ${redirectUrl}`);
      } else if (user.role === 'teacher') {
        redirectUrl = '/teacher-dashboard.html';
        console.log(`[/login Route] User ${user.username} is a teacher. Redirecting to: ${redirectUrl}`);
      } else if (user.role === 'admin') { // [FIXED] Changed user.user.role to user.role
        redirectUrl = '/admin-dashboard.html';
        console.log(`[/login Route] User ${user.username} is an admin. Redirecting to: ${redirectUrl}`);
      } else if (user.role === 'parent') {
        redirectUrl = '/parent-dashboard.html';
        console.log(`[/login Route] User ${user.username} is a parent. Redirecting to: ${redirectUrl}`);
      } else if (user.role === 'student' && !user.selectedTutorId) {
        redirectUrl = '/pick-tutor.html';
        console.log(`[/login Route] User ${user.username} is a student but needs to pick a tutor. Redirecting to: ${redirectUrl}`);
      } else {
        console.log(`[/login Route] User ${user.username} is a student with tutor selected. Redirecting to: ${redirectUrl}`);
      }
      
      // Send the final success response
      return res.json({ success: true, message: "Login successful!", redirect: redirectUrl });
    });
  })(req, res, next); // This invokes the middleware
});

module.exports = router;