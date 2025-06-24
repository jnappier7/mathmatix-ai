// middleware/auth.js - MODIFIED (WITH LOGGING)

const passport = require("passport");

/**
 * Checks if a user is logged in and their session data is valid.
 * This is the primary middleware for protecting sensitive pages and API routes.
 */
function isAuthenticated(req, res, next) {
    console.log(`\n--- [isAuthenticated] Checking for ${req.originalUrl} ---`);
    console.log(`[isAuthenticated] req.isAuthenticated(): ${req.isAuthenticated()}`);
    console.log(`[isAuthenticated] req.user: ${req.user ? req.user.username : 'undefined'} (Role: ${req.user ? req.user.role : 'N/A'})`);
    console.log(`[isAuthenticated] Session ID: ${req.sessionID}`);

    if (req.isAuthenticated() && req.user) {
        console.log(`[isAuthenticated] PASSED: User ${req.user.username} is authenticated. Proceeding.`);
        return next();
    }

    console.warn(`[isAuthenticated] FAILED for ${req.originalUrl}. User not authenticated or req.user is missing.`);
    // For API calls, send a 401 Unauthorized JSON error.
    if (req.originalUrl.startsWith('/api/')) {
        console.warn(`[isAuthenticated] Sending 401 Unauthorized for API route.`);
        return res.status(401).json({ message: 'Unauthorized: Authentication required.' });
    }
    
    // For browser navigation, redirect to the login page.
    console.warn(`[isAuthenticated] Redirecting browser to /login.html.`);
    res.redirect('/login.html');
}

/**
 * Ensures a user is NOT authenticated. Used to protect login and signup pages
 * from already logged-in users, preventing confusion.
 */
function ensureNotAuthenticated(req, res, next) {
    console.log(`\n--- [ensureNotAuthenticated] Checking for ${req.originalUrl} ---`);
    console.log(`[ensureNotAuthenticated] req.isAuthenticated(): ${req.isAuthenticated()}`);
    console.log(`[ensureNotAuthenticated] req.user: ${req.user ? req.user.username : 'undefined'} (Role: ${req.user ? req.user.role : 'N/A'})`);

    if (req.isAuthenticated() && req.user) {
        // If logged in, redirect them to their appropriate dashboard.
        let redirectUrl = '/chat.html'; // Default for students
        if (req.user.needsProfileCompletion) {
            redirectUrl = '/complete-profile.html';
        } else if (req.user.role === 'teacher') {
            redirectUrl = '/teacher-dashboard.html';
        } else if (req.user.role === 'admin') {
            redirectUrl = '/admin-dashboard.html';
        } else if (req.user.role === 'parent') {
            redirectUrl = '/parent-dashboard.html';
        } else if (req.user.role === 'student' && !req.user.selectedTutorId) {
            redirectUrl = '/pick-tutor.html';
        }
        console.log(`[ensureNotAuthenticated] User ${req.user.username} is already authenticated. Redirecting to: ${redirectUrl}`);
        return res.redirect(redirectUrl);
    }
    // If not logged in, allow them to proceed.
    console.log(`[ensureNotAuthenticated] User not authenticated. Proceeding to ${req.originalUrl}.`);
    return next();
}


// --- ROLE-BASED AUTHORIZATION MIDDLEWARE ---

function isAdmin(req, res, next) {
    console.log(`\n--- [isAdmin] Checking for ${req.originalUrl} ---`);
    if (req.user) {
        console.log(`[isAdmin] req.user.role: ${req.user.role}`);
    }

    if (req.isAuthenticated() && req.user && String(req.user.role) === 'admin') {
        console.log("[isAdmin] PASSED: User is Admin. Proceeding.");
        return next();
    } else {
        console.warn("[isAdmin] FAILED: User is NOT Admin or not authenticated.");
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(403).json({ message: 'Forbidden: Admin access required.' });
        }
        res.redirect('/login.html');
    }
}

function isTeacher(req, res, next) {
    console.log(`\n--- [isTeacher] Checking for ${req.originalUrl} ---`);
    if (req.isAuthenticated() && req.user && req.user.role === 'teacher') {
        console.log("[isTeacher] PASSED: User is Teacher. Proceeding.");
        return next();
    }
    console.warn("[isTeacher] FAILED: User is NOT Teacher or not authenticated.");
    res.status(403).json({ message: 'Forbidden: Teachers only.' });
}

function isParent(req, res, next) {
    console.log(`\n--- [isParent] Checking for ${req.originalUrl} ---`);
    if (req.isAuthenticated() && req.user && req.user.role === 'parent') {
        console.log("[isParent] PASSED: User is Parent. Proceeding.");
        return next();
    }
    console.warn("[isParent] FAILED: User is NOT Parent or not authenticated.");
    res.status(403).json({ message: 'Forbidden: Parents only.' });
}

function isStudent(req, res, next) {
    console.log(`\n--- [isStudent] Checking for ${req.originalUrl} ---`);
    if (req.isAuthenticated() && req.user && req.user.role === 'student') {
        console.log("[isStudent] PASSED: User is Student. Proceeding.");
        return next();
    }
    console.warn("[isStudent] FAILED: User is NOT Student or not authenticated.");
    res.status(403).json({ message: 'Forbidden: Students only.' });
}


// --- CUSTOM AUTHORIZATION MIDDLEWARE ---

function isAuthorizedForLeaderboard(req, res, next) {
    console.log(`\n--- [isAuthorizedForLeaderboard] Checking for ${req.originalUrl} ---`);
    if (req.isAuthenticated() && req.user && ['student', 'teacher', 'admin'].includes(req.user.role)) {
        console.log("[isAuthorizedForLeaderboard] PASSED: User role authorized for leaderboard. Proceeding.");
        return next();
    }
    console.warn("[isAuthorizedForLeaderboard] FAILED: User role not authorized for leaderboard or not authenticated.");
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ message: 'Unauthorized: Authentication required for leaderboard.' });
    }
    res.redirect('/login.html');
}

// --- LOGOUT ROUTE HANDLER ---
function handleLogout(req, res, next) {
  console.log(`\n--- [handleLogout] User ${req.user ? req.user.username : 'N/A'} is logging out ---`);
  req.logout(function(err) {
    if (err) {
      console.error("[handleLogout] Error during req.logout:", err);
      return next(err);
    }
    req.session.destroy((err) => {
      if (err) {
        console.error("[handleLogout] Error destroying session:", err);
        return res.status(500).send("Could not log out.");
      }
      res.clearCookie('connect.sid'); // Clear the session cookie
      console.log("[handleLogout] Session destroyed and cookie cleared. Sending success response.");
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
    isStudent,
    isAuthorizedForLeaderboard,
    handleLogout
};