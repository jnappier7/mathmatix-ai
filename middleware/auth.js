// middleware/auth.js

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    // For API calls, send a 401 Unauthorized
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ message: 'Unauthorized: Authentication required.' });
    }
    res.redirect('/login.html'); // For non-API routes
}

function isStudent(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.role === 'student') {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Students only.' });
}

function isTeacher(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.role === 'teacher') {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Teachers only.' });
}

const isAdmin = (req, res, next) => {
    // --- DIAGNOSTIC LOGS START ---
    console.log("\n---- isAdmin middleware check START ----"); // NEW
    console.log("DEBUG isAdmin: Checking admin access for URL:", req.originalUrl);
    console.log("DEBUG isAdmin: isAuthenticated():", req.isAuthenticated());
    console.log("DEBUG isAdmin: req.user exists?", !!req.user);
    if (req.user) {
        console.log("DEBUG isAdmin: req.user.role:", req.user.role);
        console.log("DEBUG isAdmin: typeof req.user.role:", typeof req.user.role);
    }
    // --- DIAGNOSTIC LOGS END ---

    // --- MODIFIED PRIMARY CONDITION ---
    if (req.isAuthenticated() && req.user && String(req.user.role) === 'admin') {
        console.log("DEBUG isAdmin: *** CONDITION PASSED: User is Admin. Calling next() ***"); // NEW
        return next(); // User is authenticated and is an admin
    } else {
        // --- MODIFIED ELSE BLOCK ---
        console.log("DEBUG isAdmin: --- CONDITION FAILED: User is NOT Admin or not authenticated ---"); // NEW
        if (req.originalUrl.startsWith('/api/')) {
            console.log("DEBUG isAdmin: Denying API access with 403 Forbidden."); // NEW
            return res.status(403).json({ message: 'Forbidden: Admin access required.' });
        }
        console.log("DEBUG isAdmin: Redirecting to login page."); // NEW
        res.redirect('/login.html'); // Redirect for non-API routes
        // --- END MODIFIED ELSE BLOCK ---
    }
    console.log("---- isAdmin middleware check END (should not see this if return happened) ----\n"); // NEW
};

// NEW: Parent check
function isParent(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.role === 'parent') {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Parents only.' });
}

function isAuthorizedForLeaderboard(req, res, next) {
    console.log("---- isAuthorizedForLeaderboard middleware ----");
    console.log("req.isAuthenticated():", req.isAuthenticated());
    console.log("req.user:", req.user);
    console.log("req.user?.role:", req.user?.role);

    if (req.isAuthenticated() && req.user && ['student', 'teacher', 'admin'].includes(req.user.role)) {
        return next();
    }
    // For API calls, send a 401 Unauthorized
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ message: 'Unauthorized: Authentication required for leaderboard.' });
    }
    res.redirect('/login.html'); // For non-API routes
}

module.exports = {
    isAuthenticated,
    isStudent,
    isTeacher,
    isAdmin,
    isParent, // Export new middleware
    isAuthorizedForLeaderboard
};