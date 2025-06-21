// routes/leaderboard.js
const express = require('express');
const router = express.Router();
const User = require('../models/user'); // Assuming User model is in ../models/User.js
const { isAuthorizedForLeaderboard } = require('../middleware/auth'); // Import our new middleware

// [FIX] Changed route path from '/leaderboard' to '/'
// When autoRouteLoader mounts this file as '/api/leaderboard',
// this route will become /api/leaderboard.
router.get('/', isAuthorizedForLeaderboard, async (req, res) => {
    try {
        let query = { role: 'student' }; // Always query for students

        // Determine filtering based on user role
        if (req.user.role === 'teacher') {
            // If a teacher is logged in, show only students assigned to them
            query.teacherId = req.user._id;
        } else if (req.user.role === 'student') {
            // If a student is logged in, show other students assigned to their teacher
            if (req.user.teacherId) {
                query.teacherId = req.user.teacherId;
            } else {
                // MODIFICATION: If a student has no teacherId, show all students (global leaderboard).
                console.log("LOG: Student without teacherId requesting leaderboard. Showing global leaderboard.");
            }
        }
        // If isAdmin, the query remains { role: 'student' }, showing all students.

        const leaderboard = await User.find(query)
            .sort({ xp: -1 }) // Sort by XP descending
            .select('firstName lastName level xp') // Select only these fields
            .limit(20) // Limit to top 20 students (you can adjust this to 10 if preferred)
            .lean(); // Use .lean() for faster query results if you don't need Mongoose document methods

        // Format names as "First Name Last Initial."
        const formattedLeaderboard = leaderboard.map(student => ({
            rank: 0, // Placeholder, will be set on frontend or after sorting
            name: `${student.firstName} ${student.lastName ? student.lastName.charAt(0) + '.' : ''}`,
            level: student.level,
            xp: student.xp
        }));

        res.json(formattedLeaderboard);

    } catch (error) {
        console.error('ERROR: Failed to fetch leaderboard data:', error);
        res.status(500).json({ message: 'Server error: Could not retrieve leaderboard.' });
    }
});

module.exports = router;