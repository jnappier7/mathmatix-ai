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
        req.logIn(user, async (err) => {
            if (err) {
                console.error("ERROR: req.logIn error:", err);
                return res.status(500).json({ success: false, message: 'Login successful, but session creation failed.' });
            }

            // Update lastLogin timestamp
            try {
                await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
            } catch (updateErr) {
                console.error("ERROR: Failed to update lastLogin:", updateErr);
                // Don't fail the login if this update fails
            }

            console.log(`LOG: User ${user.username} successfully logged in.`);

            // Determine redirect URL based on user's role and completion status
            let redirectUrl = '/chat.html'; // Default for students
            const userRoles = (user.roles && user.roles.length > 0) ? user.roles : [user.role];

            if (user.needsProfileCompletion) {
                redirectUrl = "/complete-profile.html";
            } else if (userRoles.length > 1) {
                // Multi-role user: let them pick which role to enter as
                redirectUrl = "/role-picker.html";
            } else if (user.role === "teacher") {
                redirectUrl = "/teacher-dashboard.html";
            } else if (user.role === "admin") {
                redirectUrl = "/admin-dashboard.html";
            } else if (user.role === "parent") {
                redirectUrl = "/parent-dashboard.html";
            } else if (user.role === "student" && !user.selectedTutorId) {
                redirectUrl = "/pick-tutor.html";
            }
            // Auto-assign default avatar for legacy users missing one (avatar
            // selection removed from onboarding — assigned at signup now).
            // Awaited so the avatar is persisted before the frontend loads.
            if (user.role === 'student' && !user.avatar?.dicebearUrl) {
                const seed = (user.firstName || user.username || 'student').toLowerCase();
                user.avatar = {
                    dicebearConfig: { style: 'adventurer', seed },
                    dicebearUrl: `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}`
                };
                user.selectedAvatarId = user.selectedAvatarId || 'dicebear-default';
                try {
                    await user.save();
                } catch (err) {
                    console.error('[Login] Avatar migration failed:', err.message);
                }
            }

            // Persist session to MongoDB before responding to prevent race condition
            // where the frontend navigates before the session is saved
            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error("ERROR: Failed to save session after login:", saveErr);
                    return res.status(500).json({ success: false, message: 'Login successful, but session save failed.' });
                }
                return res.status(200).json({ success: true, message: 'Logged in successfully!', redirect: redirectUrl });
            });
        });
    })(req, res, next); // Ensure passport.authenticate is called with req, res, next
});

// Optionally, add a GET /login for API debugging or if a client explicitly fetches this.
// Usually, /login.html serves the page, and POST /login handles credentials.
router.get('/', (req, res) => {
    res.status(200).json({ message: 'Login API endpoint. Please send POST request with credentials.' });
});

module.exports = router;