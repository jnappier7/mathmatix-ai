// routes/login.js - PHASE 1: Backend Routing & Core Setup - Batch 2
// Handles local login authentication requests.

const express = require('express');
const router = express.Router();
const passport = require('passport'); // Import passport for authentication
const User = require('../models/user'); // Ensure User model is accessible
const { isAuthenticated } = require('../middleware/auth'); // For potentially checking if user is already logged in
const { loginValidation, handleValidationErrors } = require('../middleware/validation');

// POST /login - Local authentication strategy
// Frontend calls this endpoint directly (e.g., fetch('/login', ...))
router.post('/', loginValidation, handleValidationErrors, (req, res, next) => {
    // Authenticate using the 'local' Passport strategy
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error("ERROR: Passport local authentication error:", err);
            return res.status(500).json({ success: false, message: 'Authentication failed. Please try again.' });
        }
        if (!user) {
            // Authentication failed (e.g., incorrect username/password)
            console.warn("WARN: Local authentication failed. Message:", info.message);
            return res.status(401).json({ success: false, message: info.message || 'Authentication failed: Invalid credentials.' });
        }

        // If authentication is successful, establish a session for the user
        req.logIn(user, (err) => {
            if (err) {
                console.error("ERROR: req.logIn error:", err);
                return res.status(500).json({ success: false, message: 'Login successful, but session creation failed.' });
            }
            console.log(`LOG: User ${user.username} successfully logged in.`);

            // Determine redirect URL based on user's role and completion status
            let redirectUrl = '/chat.html'; // Default for students
            if (user.needsProfileCompletion) {
                redirectUrl = "/complete-profile.html";
            } else if (user.role === "teacher") {
                redirectUrl = "/teacher-dashboard.html";
            } else if (user.role === "admin") {
                redirectUrl = "/admin-dashboard.html";
            } else if (user.role === "parent") {
                redirectUrl = "/parent-dashboard.html";
            } else if (user.role === "student" && !user.selectedTutorId) {
                redirectUrl = "/pick-tutor.html";
            }

            // Send success response with redirect URL (frontend will handle redirect)
            return res.status(200).json({ success: true, message: 'Logged in successfully!', redirect: redirectUrl });
        });
    })(req, res, next); // Ensure passport.authenticate is called with req, res, next
});

// Optionally, add a GET /login for API debugging or if a client explicitly fetches this.
// Usually, /login.html serves the page, and POST /login handles credentials.
router.get('/', (req, res) => {
    res.status(200).json({ message: 'Login API endpoint. Please send POST request with credentials.' });
});

module.exports = router;