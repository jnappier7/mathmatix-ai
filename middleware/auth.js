// middleware/auth.js
// MODIFIED: Removed verbose console.log and console.warn statements for a cleaner production environment.
// Kept console.error for actual error logging.

const passport = require("passport");
const rateLimit = require('express-rate-limit');

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

// --- RATE LIMITING FOR EXPENSIVE AI ENDPOINTS ---
// SECURITY FIX: Per-user rate limiting for AI-powered endpoints to prevent API abuse
const aiEndpointLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: 100, // Limit each user to 100 requests per hour
    keyGenerator: (req) => {
        // Use user ID if authenticated, otherwise fall back to IP
        return req.user ? req.user._id.toString() : req.ip;
    },
    handler: (req, res) => {
        console.warn(`WARN: Rate limit exceeded for user ${req.user ? req.user._id : req.ip} on ${req.path}`);
        res.status(429).json({
            message: 'Too many AI requests. Please try again later.',
            retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    isAuthenticated,
    ensureNotAuthenticated,
    isAdmin,
    isTeacher,
    isParent,
    isStudent,
    isAuthorizedForLeaderboard,
    handleLogout,
    aiEndpointLimiter
};