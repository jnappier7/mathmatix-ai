// routes/leaderboard.js
const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { isAuthorizedForLeaderboard } = require('../middleware/auth');
const { hasOptedOutOfDirectoryInfo } = require('../utils/ferpaCompliance');

const { anyRole, userHasRole } = require('../utils/roleQuery');
router.get('/', isAuthorizedForLeaderboard, async (req, res) => {
    try {
        let query = { ...anyRole('student'), isDemo: { $ne: true }, isDemoClone: { $ne: true } };

        // Scope by the roles the viewer HOLDS, not `role` — the dashboard they
        // currently have open (CLAUDE.md §12). This chain narrows the board, so
        // failing to recognise a viewer widens it: a teacher who also holds
        // parent matched neither branch while on the parent dashboard and fell
        // through to the unscoped global board — every student on the platform,
        // named, to someone who is only entitled to their own class.
        //
        // The order is load-bearing and matches the old chain: teacher scope
        // wins over student scope for an account that holds both. Parents and
        // admins still match nothing and still get the global board, which is
        // what they are meant to see.
        if (userHasRole(req.user, 'teacher')) {
            query.teacherId = req.user._id;
        } else if (userHasRole(req.user, 'student')) {
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