// middleware/auth.js
// MODIFIED: Removed verbose console.log and console.warn statements for a cleaner production environment.
// Kept console.error for actual error logging.

const passport = require("passport");

/**
 * Checks if a user is logged in and their session data is valid.
 */
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated() && req.user) {
        return next();
    }

    // For API calls, send a 401 Unauthorized JSON error.
    if (req.originalUrl.startsWith('/api/') || req.method === 'POST') {
        return res.status(401).json({ message: 'Unauthorized: Authentication required.' });
    }
    
    // For browser navigation, redirect to the login page.
    res.redirect('/login.html');
}

/**
 * Ensures a user is NOT authenticated. Used for login/signup pages.
 */
function ensureNotAuthenticated(req, res, next) {
    if (req.isAuthenticated() && req.user) {
        if (req.method === 'POST') {
            return res.status(403).json({ success: false, message: 'Forbidden: You are already logged in.' });
        }

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
        return res.redirect(redirectUrl);
    }
    return next();
}


// --- ROLE-BASED AUTHORIZATION MIDDLEWARE ---

function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user && String(req.user.role) === 'admin') {
        return next();
    }
    if (req.originalUrl.startsWith('/api/') || req.method === 'POST') {
        return res.status(403).json({ message: 'Forbidden: Admin access required.' });
    }
    res.redirect('/login.html');
}

function isTeacher(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.role === 'teacher') {
        return next();
    }
    if (req.originalUrl.startsWith('/api/') || req.method === 'POST') {
        return res.status(403).json({ message: 'Forbidden: Teachers only.' });
    }
    res.redirect('/login.html');
}

function isParent(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.role === 'parent') {
        return next();
    }
    if (req.originalUrl.startsWith('/api/') || req.method === 'POST') {
        return res.status(403).json({ message: 'Forbidden: Parents only.' });
    }
    res.redirect('/login.html');
}

function isStudent(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.role === 'student') {
        return next();
    }
    if (req.originalUrl.startsWith('/api/') || req.method === 'POST') {
        return res.status(403).json({ message: 'Forbidden: Students only.' });
    }
    res.redirect('/login.html');
}


// --- CUSTOM AUTHORIZATION MIDDLEWARE ---

function isAuthorizedForLeaderboard(req, res, next) {
    if (req.isAuthenticated() && req.user && ['student', 'teacher', 'admin', 'parent'].includes(req.user.role)) {
        return next();
    }
    if (req.originalUrl.startsWith('/api/') || req.method === 'POST') {
        return res.status(403).json({ message: 'Forbidden: You are not authorized to view the leaderboard.' });
    }
    res.redirect('/login.html');
}

// --- LOGOUT ROUTE HANDLER ---
function handleLogout(req, res, next) {
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
      res.clearCookie('connect.sid');
      // Changed to a JSON response for consistency with API-like behavior
      res.status(200).json({ success: true, message: 'Logged out successfully' });
    });
  });
}

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