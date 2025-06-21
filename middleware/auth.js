// middleware/auth.js

const passport = require("passport");
// Assuming User model is available in your project structure relative to this file
// const User = require("../models/user"); 

/**
 * Checks if a user is logged in and their session data is valid.
 * This is the primary middleware for protecting sensitive pages and API routes.
 */
function isAuthenticated(req, res, next) {
    // Checks for both authentication status AND the existence of the user object.
    if (req.isAuthenticated() && req.user) {
        return next();
    }

    // For API calls, send a 401 Unauthorized JSON error.
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ message: 'Unauthorized: Authentication required.' });
    }
    
    // For browser navigation, redirect to the login page.
    res.redirect('/login.html');
}

/**
 * Ensures a user is NOT authenticated. Used to protect login and signup pages
 * from already logged-in users, preventing confusion.
 */
function ensureNotAuthenticated(req, res, next) {
    if (req.isAuthenticated() && req.user) {
        // If logged in, redirect them to their appropriate dashboard.
        let redirectUrl = '/chat.html'; // Default for students
        if (req.user.role === 'teacher') {
            redirectUrl = '/teacher-dashboard.html';
        } else if (req.user.role === 'admin') {
            redirectUrl = '/admin-dashboard.html';
        } else if (req.user.role === 'parent') {
            redirectUrl = '/parent-dashboard.html';
        } else if (req.user.role === 'student' && !req.user.selectedTutorId) {
            redirectUrl = '/pick-tutor.html';
        }
        return res.redirect(redirectUrl);
    }
    // If not logged in, allow them to proceed.
    return next();
}


// --- ROLE-BASED AUTHORIZATION MIDDLEWARE ---

function isAdmin(req, res, next) {
    // This function includes extra logging for debugging purposes.
    console.log("\n---- isAdmin middleware check START ----");
    console.log("DEBUG isAdmin: URL:", req.originalUrl);
    console.log("DEBUG isAdmin: isAuthenticated():", req.isAuthenticated());
    if (req.user) {
        console.log("DEBUG isAdmin: req.user.role:", req.user.role);
    }

    if (req.isAuthenticated() && req.user && String(req.user.role) === 'admin') {
        console.log("DEBUG isAdmin: *** PASSED: User is Admin. ***");
        return next();
    } else {
        console.log("DEBUG isAdmin: --- FAILED: User is NOT Admin or not authenticated. ---");
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(403).json({ message: 'Forbidden: Admin access required.' });
        }
        res.redirect('/login.html');
    }
}

function isTeacher(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.role === 'teacher') {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Teachers only.' });
}

function isParent(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.role === 'parent') {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Parents only.' });
}

function isStudent(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.role === 'student') {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Students only.' });
}


// --- CUSTOM AUTHORIZATION MIDDLEWARE ---

function isAuthorizedForLeaderboard(req, res, next) {
    if (req.isAuthenticated() && req.user && ['student', 'teacher', 'admin'].includes(req.user.role)) {
        return next();
    }
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ message: 'Unauthorized: Authentication required for leaderboard.' });
    }
    res.redirect('/login.html');
}

// --- LOGOUT ROUTE HANDLER ---
function handleLogout(req, res, next) {
  req.logout(function(err) {
    if (err) {
      return next(err);
    }
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return res.status(500).send("Could not log out.");
      }
      res.clearCookie('connect.sid'); // Clear the session cookie
      res.status(200).send('Logged out successfully'); // Send a success response
    });
  });
}

// --- EXPORTS ---

module.exports = {
    isAuthenticated,
    ensureNotAuthenticated,
    isAdmin,
    isTeacher,
    isParent,
    isStudent, // Make sure isStudent is exported if used elsewhere
    isAuthorizedForLeaderboard,
    handleLogout // Export the new logout handler
};