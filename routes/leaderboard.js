// routes/leaderboard.js
const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { isAuthorizedForLeaderboard } = require('../middleware/auth');
const { hasOptedOutOfDirectoryInfo } = require('../utils/ferpaCompliance');

router.get('/', isAuthorizedForLeaderboard, async (req, res) => {
    try {
        let query = { role: 'student', isDemo: { $ne: true }, isDemoClone: { $ne: true } };

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
            .select('firstName lastName level xp ferpaSettings')
            .limit(10)
            .lean();

        // Format names to "First Name L." — respect FERPA directory info opt-out
        const formattedLeaderboard = leaderboard.map(student => {
            const optedOut = hasOptedOutOfDirectoryInfo(student);
            const lastNameInitial = !optedOut && student.lastName ? `${student.lastName.charAt(0)}.` : '';
            return {
                rank: 0,
                name: optedOut ? 'Student' : `${student.firstName || 'Student'} ${lastNameInitial}`.trim(),
                level: optedOut ? undefined : student.level,
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