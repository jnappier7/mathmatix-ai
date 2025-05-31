// routes/leaderboard.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { isAuthorizedForLeaderboard } = require('../middleware/auth');

// GET /api/students/leaderboard
// This route fetches leaderboard data, filtered by teacher if applicable.
router.get('/leaderboard', isAuthorizedForLeaderboard, async (req, res) => {
    try {
        let query = { role: 'student' }; // Always query for students

        // Determine filtering based on user role
        if (req.user.role === 'teacher') {
            query.teacherId = req.user._id;
        } else if (req.user.role === 'student') {
            if (req.user.teacherId) {
                query.teacherId = req.user.teacherId;
            } else {
                // If a student has no teacherId, they won't see any class leaderboard
                // We might want to handle this edge case (e.g., show global or empty)
                // For now, it will result in an empty array if no teacherId.
                return res.json([]); // No teacher means no class leaderboard
            }
        }
        // If isAdmin, the query remains { role: 'student' }, showing all students.

        const leaderboard = await User.find(query)
            .sort({ xp: -1 }) // Sort by XP descending
            .select('firstName lastName level xp') // Select only these fields
            .limit(20) // Limit to top 20 students (you can adjust this)
            .lean(); // Use .lean() for faster query results if you don't need Mongoose document methods

        // Format names as "First Name Last Initial."
        const formattedLeaderboard = leaderboard.map(student => ({
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