// routes/leaderboard.js
const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { isAuthorizedForLeaderboard } = require('../middleware/auth');
const { hasOptedOutOfDirectoryInfo } = require('../utils/ferpaCompliance');

const { anyRole, withoutRoles, userHasRole } = require('../utils/roleQuery');
const { weekKey, weekPath, pointsFor } = require('../utils/weeklyXp');

// "First L." — or "Student" when the family opted out of directory info.
function displayName(student) {
    if (hasOptedOutOfDirectoryInfo(student)) return 'Student';
    const lastNameInitial = student.lastName ? `${student.lastName.charAt(0)}.` : '';
    return `${student.firstName || 'Student'} ${lastNameInitial}`.trim();
}

/**
 * This week's board: XP earned since Monday 00:00 Eastern (utils/weeklyXp.js),
 * so a student who joined yesterday can top it — the all-time board ranked a
 * 20,027-XP account against kids with 400 (owner decision 2026-10-15: weekly,
 * all XP counts). Same scope and exclusions as the all-time board. `you` is the
 * viewer's own row, pinned under the Top 10 even when they're not in it.
 */
async function weeklyBoard(scope, viewer) {
    const key = weekKey();
    const path = weekPath(key);
    const rows = await User.find({ ...scope, [path]: { $gt: 0 } })
        .sort({ [path]: -1, _id: 1 })
        .select(`firstName lastName ferpaSettings ${path}`)
        .limit(10)
        .lean();

    const viewerId = String(viewer?._id || '');
    const entries = rows.map((s, i) => ({
        rank: i + 1,
        name: displayName(s),
        points: pointsFor(s, key),
        isYou: String(s._id) === viewerId,
    }));

    // Only a student on this board has a "you" row (staff are excluded above).
    // Staff get `viewerStaff` instead, so the card can say why they aren't
    // ranked rather than looking broken (owner, 2026-10-15: "I still don't see
    // the leaderboard").
    const viewerStaff = userHasRole(viewer, 'teacher') || userHasRole(viewer, 'admin');
    let you = null;
    if (viewerId && userHasRole(viewer, 'student') && !viewerStaff) {
        const me = await User.findById(viewer._id).select(`firstName lastName ferpaSettings ${path}`).lean();
        const points = pointsFor(me, key);
        const ahead = points > 0
            ? await User.countDocuments({ ...scope, [path]: { $gt: points } })
            : null;
        you = { rank: ahead === null ? null : ahead + 1, name: me ? displayName(me) : 'You', points };
    }

    const [y, m, d] = key.split('-').map(Number);
    const resetsOn = new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
    return { period: 'week', weekKey: key, resetsOn, entries, you, viewerStaff };
}
router.get('/', isAuthorizedForLeaderboard, async (req, res) => {
    try {
        // Students only — and not staff who also hold the student role. A
        // teacher/admin account with student in roles[] was ranked against the
        // kids (QA handoff 2026-10-14 §2.6: the owner's admin account sat at #3
        // of the global board). withoutRoles checks roles held AND the active
        // role, so switching dashboards can't slip one back in.
        let query = {
            $and: [anyRole('student'), withoutRoles('teacher', 'admin')],
            isDemo: { $ne: true },
            isDemoClone: { $ne: true },
        };

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

        if (req.query?.period === 'week') {
            return res.json(await weeklyBoard(query, req.user));
        }

        const leaderboard = await User.find(query)
            .sort({ level: -1, xp: -1 }) // Sorts by level, then XP
            .select('firstName lastName level xp ferpaSettings')
            .limit(10)
            .lean();

        // Format names to "First Name L." — respect FERPA directory info opt-out
        const formattedLeaderboard = leaderboard.map((student, index) => {
            const optedOut = hasOptedOutOfDirectoryInfo(student);
            return {
                // Was a hard-coded 0 on every row. Sorted above, so position is rank.
                rank: index + 1,
                name: displayName(student),
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

router.__helpers = { weeklyBoard, displayName };
module.exports = router;