/**
 * M∆THM∆TIΧ AI - Admin API Routes
 *
 * This file contains all API endpoints for administrative functions.
 * All routes are protected by the `isAdmin` middleware.
 *
 * @version 2.0
 * @author Senior Developer
 */
const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Conversation = require('../models/conversation');
const { isAdmin } = require('../middleware/auth');

// --- Constants for Database Projections ---
// Using constants improves readability and makes queries easier to manage.
const USER_LIST_FIELDS = 'firstName lastName email username role gradeLevel teacherId mathCourse tonePreference learningStyle interests totalActiveTutoringMinutes weeklyActiveTutoringMinutes lastLogin createdAt xp level';
const TEACHER_LIST_FIELDS = 'firstName lastName _id';

// -----------------------------------------------------------------------------
// --- User & Teacher Data Routes ---
// -----------------------------------------------------------------------------

/**
 * @route   GET /api/admin/users
 * @desc    Get a list of all users with essential profile data.
 * @access  Private (Admin)
 */
router.get('/users', isAdmin, async (req, res) => {
  try {
    // .lean() provides a significant performance boost for read-only operations.
    const users = await User.find({}, USER_LIST_FIELDS).lean();
    res.json(users);
  } catch (err) {
    console.error('Error fetching users for admin:', err);
    res.status(500).json({ message: 'Server error fetching user data.' });
  }
});

/**
 * @route   GET /api/admin/teachers
 * @desc    Get a list of all users with the 'teacher' role.
 * @access  Private (Admin)
 */
router.get('/teachers', isAdmin, async (req, res) => {
  try {
    const teachers = await User.find({ role: 'teacher' }, TEACHER_LIST_FIELDS).lean();
    res.json(teachers);
  } catch (err) {
    console.error('Error fetching teachers for admin:', err);
    res.status(500).json({ message: 'Server error fetching teacher data.' });
  }
});

// -----------------------------------------------------------------------------
// --- Student-Specific Routes ---
// -----------------------------------------------------------------------------

/**
 * @route   GET /api/admin/students/:studentId/profile
 * @desc    Get a specific student's full profile for the modal view.
 * @access  Private (Admin)
 */
// NOTE: This endpoint is implicitly handled by the main GET /users route,
// as the frontend filters the main list. If a direct fetch is needed in the future,
// it can be implemented here using the USER_LIST_FIELDS projection.

/**
 * @route   PATCH /api/admin/students/:studentId/profile
 * @desc    Update a student's general profile information.
 * @access  Private (Admin)
 */
router.patch('/students/:studentId/profile', isAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;
    const updates = req.body;
    
    // Whitelist of fields that are safe to update via this endpoint.
    const allowedUpdates = [
      'firstName', 'lastName', 'email', 'gradeLevel', 'mathCourse',
      'tonePreference', 'learningStyle', 'interests'
    ];
    
    const validUpdates = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        validUpdates[key] = updates[key];
      }
    }

    if (Object.keys(validUpdates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided for update.' });
    }

    // If name fields are updated, also update the composite 'name' field for consistency.
    if (validUpdates.firstName || validUpdates.lastName) {
      const currentUser = await User.findById(studentId, 'firstName lastName').lean();
      if(currentUser) {
          const newFirstName = validUpdates.firstName || currentUser.firstName;
          const newLastName = validUpdates.lastName || currentUser.lastName;
          validUpdates.name = `${newFirstName} ${newLastName}`;
      }
    }

    const result = await User.findOneAndUpdate(
      { _id: studentId, role: 'student' },
      { $set: validUpdates },
      { new: true, runValidators: true }
    );

    if (!result) {
      return res.status(404).json({ message: 'Student not found.' });
    }
    res.json({ message: 'Student profile updated successfully!' });
  } catch (err) {
    console.error('Error updating student profile for admin:', err);
    res.status(500).json({ message: 'Server error updating student profile.' });
  }
});


/**
 * @route   GET /api/admin/students/:studentId/iep
 * @desc    Get a student's IEP plan.
 * @access  Private (Admin)
 */
router.get('/students/:studentId/iep', isAdmin, async (req, res) => {
  try {
    const student = await User.findById(req.params.studentId, 'iepPlan').lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }
    res.json(student.iepPlan || {}); // Return empty object if no plan exists
  } catch (err) {
    console.error('Error fetching student IEP for admin:', err);
    res.status(500).json({ message: 'Server error fetching IEP data.' });
  }
});

/**
 * @route   PUT /api/admin/students/:studentId/iep
 * @desc    Update/replace a student's entire IEP plan.
 * @access  Private (Admin)
 */
router.put('/students/:studentId/iep', isAdmin, async (req, res) => {
  try {
    // SECURITY HARDENING: Explicitly build the IEP object from the request body
    // to prevent malicious or accidental field injection.
    const { accommodations, readingLevel, preferredScaffolds, goals } = req.body;
    const sanitizedIepPlan = {
        accommodations: accommodations || {},
        readingLevel: readingLevel,
        preferredScaffolds: preferredScaffolds || [],
        goals: goals || []
    };

    const result = await User.findOneAndUpdate(
      { _id: req.params.studentId, role: 'student' },
      { $set: { iepPlan: sanitizedIepPlan } },
      { new: true, runValidators: true, lean: true }
    );
    if (!result) {
      return res.status(404).json({ message: 'Student not found.' });
    }
    res.json({ message: 'IEP plan updated successfully!', iepPlan: result.iepPlan });
  } catch (err) {
    console.error('Error updating student IEP for admin:', err);
    res.status(500).json({ message: 'Server error updating IEP data.' });
  }
});

/**
 * @route   GET /api/admin/students/:studentId/conversations
 * @desc    Get a student's conversation history.
 * @access  Private (Admin)
 */
router.get('/students/:studentId/conversations', isAdmin, async (req, res) => {
  try {
    const conversations = await Conversation.find({ userId: req.params.studentId })
        .sort({ startDate: -1 })
        .select('summary activeMinutes startDate') // Fixed: removed non-existent 'date' field
        .lean();
    
    // Returning an empty array is a successful response, not an error.
    res.json(conversations);
  } catch (err) {
    console.error('Error fetching student conversations for admin:', err);
    res.status(500).json({ message: 'Server error fetching conversation data.' });
  }
});

// -----------------------------------------------------------------------------
// --- Bulk & System Routes ---
// -----------------------------------------------------------------------------

/**
 * @route   PATCH /api/admin/assign-teacher
 * @desc    Assign or unassign multiple students to a single teacher.
 * @access  Private (Admin)
 */
router.patch('/assign-teacher', isAdmin, async (req, res) => {
  try {
    const { studentIds, teacherId } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: 'An array of student IDs is required.' });
    }
    
    if (teacherId) {
      const teacher = await User.findOne({ _id: teacherId, role: 'teacher' });
      if (!teacher) {
        return res.status(404).json({ message: 'Teacher not found.' });
      }
    }
    
    const updateResult = await User.updateMany(
      { _id: { $in: studentIds }, role: 'student' },
      { $set: { teacherId: teacherId || null } }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ message: 'No matching students found to update.' });
    }

    const assignmentStatus = teacherId ? `assigned to teacher` : 'unassigned';
    res.json({ message: `${updateResult.modifiedCount} student(s) have been ${assignmentStatus}.` });
  } catch (err) {
    console.error('Error during batch teacher assignment:', err);
    res.status(500).json({ message: 'Server error during teacher assignment.' });
  }
});

/**
 * @route   GET /api/admin/health-check
 * @desc    A simple endpoint to confirm the API is running.
 * @access  Private (Admin)
 */
router.get('/health-check', isAdmin, (req, res) => {
  res.status(200).json({
    status: 'Operational',
    timestamp: new Date().toISOString()
  });
});

// -----------------------------------------------------------------------------
// --- Reports ---
// -----------------------------------------------------------------------------

/**
 * @route   GET /api/admin/reports/usage
 * @desc    Get comprehensive usage report showing who's logging in and for how long
 * @query   startDate - Optional start date filter (ISO string)
 * @query   endDate - Optional end date filter (ISO string)
 * @query   role - Optional role filter (student, teacher, parent, admin)
 * @query   sortBy - Optional sort field (lastLogin, totalMinutes, weeklyMinutes, name)
 * @query   sortOrder - Optional sort direction (asc, desc)
 * @access  Private (Admin)
 */
router.get('/reports/usage', isAdmin, async (req, res) => {
  try {
    const { startDate, endDate, role, sortBy = 'lastLogin', sortOrder = 'desc' } = req.query;

    // Build query filter
    const filter = {};
    if (role) {
      filter.role = role;
    }

    if (startDate || endDate) {
      filter.lastLogin = {};
      if (startDate) {
        filter.lastLogin.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.lastLogin.$lte = new Date(endDate);
      }
    }

    // Determine sort field
    const sortField = {
      'lastLogin': { lastLogin: sortOrder === 'asc' ? 1 : -1 },
      'totalMinutes': { totalActiveTutoringMinutes: sortOrder === 'asc' ? 1 : -1 },
      'weeklyMinutes': { weeklyActiveTutoringMinutes: sortOrder === 'asc' ? 1 : -1 },
      'name': { firstName: sortOrder === 'asc' ? 1 : -1, lastName: sortOrder === 'asc' ? 1 : -1 }
    }[sortBy] || { lastLogin: -1 };

    // Fetch all users with activity data
    const users = await User.find(filter)
      .select('firstName lastName username email role lastLogin totalActiveTutoringMinutes weeklyActiveTutoringMinutes createdAt xp level teacherId')
      .populate('teacherId', 'firstName lastName')
      .sort(sortField)
      .lean();

    // Get conversation counts for each user
    const userIds = users.map(u => u._id);
    const conversationStats = await Conversation.aggregate([
      {
        $match: {
          userId: { $in: userIds },
          ...(startDate || endDate ? {
            lastActivity: {
              ...(startDate ? { $gte: new Date(startDate) } : {}),
              ...(endDate ? { $lte: new Date(endDate) } : {})
            }
          } : {})
        }
      },
      {
        $group: {
          _id: '$userId',
          sessionCount: { $sum: 1 },
          totalMessages: { $sum: { $size: '$messages' } }
        }
      }
    ]);

    // Create lookup map for conversation stats
    const statsMap = {};
    conversationStats.forEach(stat => {
      statsMap[stat._id.toString()] = {
        sessionCount: stat.sessionCount,
        totalMessages: stat.totalMessages
      };
    });

    // Calculate summary statistics
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const activeToday = users.filter(u => u.lastLogin && new Date(u.lastLogin) > oneDayAgo).length;
    const activeThisWeek = users.filter(u => u.lastLogin && new Date(u.lastLogin) > oneWeekAgo).length;
    const totalMinutesThisWeek = users.reduce((sum, u) => sum + (u.weeklyActiveTutoringMinutes || 0), 0);
    const totalMinutesAllTime = users.reduce((sum, u) => sum + (u.totalActiveTutoringMinutes || 0), 0);

    // Enrich user data with conversation stats
    const enrichedUsers = users.map(user => {
      const stats = statsMap[user._id.toString()] || { sessionCount: 0, totalMessages: 0 };
      return {
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`,
        username: user.username,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin,
        totalMinutes: user.totalActiveTutoringMinutes || 0,
        weeklyMinutes: user.weeklyActiveTutoringMinutes || 0,
        level: user.level || 1,
        xp: user.xp || 0,
        sessionCount: stats.sessionCount,
        totalMessages: stats.totalMessages,
        teacher: user.teacherId ? `${user.teacherId.firstName} ${user.teacherId.lastName}` : null,
        createdAt: user.createdAt,
        daysSinceLastLogin: user.lastLogin ? Math.floor((now - new Date(user.lastLogin)) / (1000 * 60 * 60 * 24)) : null
      };
    });

    res.json({
      summary: {
        totalUsers: users.length,
        activeToday: activeToday,
        activeThisWeek: activeThisWeek,
        totalMinutesThisWeek: totalMinutesThisWeek,
        totalMinutesAllTime: totalMinutesAllTime,
        averageMinutesPerUser: users.length > 0 ? Math.round(totalMinutesAllTime / users.length) : 0
      },
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        role: role || 'all',
        sortBy: sortBy,
        sortOrder: sortOrder
      },
      users: enrichedUsers
    });

  } catch (err) {
    console.error('Error generating usage report:', err);
    res.status(500).json({ message: 'Server error generating usage report.' });
  }
});

/**
 * @route   GET /api/admin/reports/live-activity
 * @desc    Get live activity feed showing currently active students
 * @access  Private (Admin)
 */
router.get('/reports/live-activity', isAdmin, async (req, res) => {
  try {
    // Find conversations that were active in the last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const activeConversations = await Conversation.find({
      isActive: true,
      lastActivity: { $gte: tenMinutesAgo }
    })
      .populate('userId', 'firstName lastName level xp teacherId')
      .sort({ lastActivity: -1 })
      .limit(50)
      .lean();

    const liveActivity = activeConversations.map(conv => ({
      conversationId: conv._id,
      studentId: conv.userId?._id,
      studentName: conv.userId ? `${conv.userId.firstName} ${conv.userId.lastName}` : 'Unknown',
      level: conv.userId?.level || 1,
      xp: conv.userId?.xp || 0,
      currentTopic: conv.currentTopic || 'mathematics',
      problemsAttempted: conv.problemsAttempted || 0,
      problemsCorrect: conv.problemsCorrect || 0,
      strugglingWith: conv.strugglingWith || null,
      activeMinutes: conv.activeMinutes || 0,
      lastActivity: conv.lastActivity,
      alerts: conv.alerts?.filter(a => !a.acknowledged) || [],
      minutesAgo: Math.floor((Date.now() - new Date(conv.lastActivity).getTime()) / (1000 * 60))
    }));

    res.json({
      timestamp: new Date().toISOString(),
      activeSessionCount: liveActivity.length,
      sessions: liveActivity
    });

  } catch (err) {
    console.error('Error fetching live activity:', err);
    res.status(500).json({ message: 'Server error fetching live activity.' });
  }
});


module.exports = router;