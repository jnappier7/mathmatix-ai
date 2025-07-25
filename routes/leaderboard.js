// routes/leaderboard.js
const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { isAuthorizedForLeaderboard } = require('../middleware/auth');

router.get('/', isAuthorizedForLeaderboard, async (req, res) => {
    try {
        let query = { role: 'student' };

        // Determine filtering based on user role (this logic is preserved)
        if (req.user.role === 'teacher') {
            query.teacherId = req.user._id;
        } else if (req.user.role === 'student') {
            if (req.user.teacherId) {
                query.teacherId = req.user.teacherId;
            } else {
                console.log("LOG: Student without teacherId requesting leaderboard. Showing global leaderboard.");
            }
        }
        // If isAdmin, the query remains { role: 'student' }, showing all students.

        const leaderboard = await User.find(query)
            .sort({ level: -1, xp: -1 }) // Sorts by level, then XP
            // SURGICAL ENHANCEMENT: Select firstName and lastName for formatting.
            .select('firstName lastName level xp')
            .limit(10) 
            .lean();

        // Format names to "First Name L."
        const formattedLeaderboard = leaderboard.map(student => {
            // SURGICAL ENHANCEMENT: Format the name as requested.
            const lastNameInitial = student.lastName ? `${student.lastName.charAt(0)}.` : '';
            return {
                rank: 0, 
                name: `${student.firstName || 'Student'} ${lastNameInitial}`.trim(),
                level: student.level,
                xp: student.xp
            };
        });

        res.json(formattedLeaderboard);

    } catch (error) {
        console.error('ERROR: Failed to fetch leaderboard data:', error);
        res.status(500).json({ message: 'Server error: Could not retrieve leaderboard.' });
    }
});

module.exports = router;