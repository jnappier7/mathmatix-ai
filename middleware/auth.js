// middleware/auth.js

// Middleware to check if a user is authenticated
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { // Passport.js adds this method to req
        return next();
    }
    // If not authenticated, redirect to login or send a 401 Unauthorized
    res.status(401).redirect('/login.html'); // Or res.status(401).json({ message: 'Unauthorized' });
}

// Middleware to check if the authenticated user has the 'student' role
function isStudent(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.role === 'student') {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Students only.' });
}

// Middleware to check if the authenticated user has the 'teacher' role
function isTeacher(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.role === 'teacher') {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Teachers only.' });
}

// Middleware to check if the authenticated user has the 'admin' role
function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.role === 'admin') {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Admins only.' });
}

// Custom middleware for leaderboard access:
// Allows students, teachers, and admins to access.
// We'll use the user's role to determine the filtering logic later.
function isAuthorizedForLeaderboard(req, res, next) {
    console.log("---- isAuthorizedForLeaderboard middleware ----");
    console.log("req.isAuthenticated():", req.isAuthenticated());
    console.log("req.user:", req.user); // THIS IS KEY for debugging
    console.log("req.user?.role:", req.user?.role); // THIS IS KEY for debugging

    if (req.isAuthenticated() && req.user && ['student', 'teacher', 'admin'].includes(req.user.role)) {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Access denied for your role.' });
}

module.exports = {
    isAuthenticated,
    isStudent,
    isTeacher,
    isAdmin,
    isAuthorizedForLeaderboard
};