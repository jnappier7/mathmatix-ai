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
const adminImportRoutes = require('./adminImport'); // CSV import for item bank

// --- Constants for Database Projections ---
// Using constants improves readability and makes queries easier to manage.
const USER_LIST_FIELDS = 'firstName lastName email username role gradeLevel teacherId mathCourse tonePreference learningStyle interests totalActiveTutoringMinutes weeklyActiveTutoringMinutes lastLogin createdAt xp level';
const TEACHER_LIST_FIELDS = 'firstName lastName _id';

// -----------------------------------------------------------------------------
// --- Item Bank Import Routes (CSV Upload) ---
// -----------------------------------------------------------------------------
// Mount adminImportRoutes here so they inherit the isAdmin middleware
router.use('/', adminImportRoutes);

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

/**
 * @route   POST /api/admin/seed-skills
 * @desc    Seed the skills database with Ready for Algebra 1 skills.
 * @access  Private (Admin)
 */
router.post('/seed-skills', isAdmin, async (req, res) => {
  try {
    const Skill = require('../models/skill');
    const fs = require('fs');
    const path = require('path');

    // Read skills JSON
    const skillsPath = path.join(__dirname, '../seeds/skills-ready-for-algebra.json');
    const skillsData = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));

    // Check for existing skills
    const existingCount = await Skill.countDocuments();

    // Clear existing skills if requested
    if (req.body.clearExisting && existingCount > 0) {
      await Skill.deleteMany({});
    }

    // Insert or update skills
    const results = {
      inserted: 0,
      updated: 0,
      unchanged: 0
    };

    for (const skillData of skillsData) {
      const existing = await Skill.findOne({ skillId: skillData.skillId });

      if (!existing) {
        await Skill.create(skillData);
        results.inserted++;
      } else if (req.body.updateExisting) {
        await Skill.findOneAndUpdate(
          { skillId: skillData.skillId },
          skillData,
          { new: true }
        );
        results.updated++;
      } else {
        results.unchanged++;
      }
    }

    // Get summary by category
    const categories = await Skill.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      message: 'Skills seeding completed',
      results,
      totalSkills: await Skill.countDocuments(),
      categories: categories.map(c => ({ category: c._id, count: c.count }))
    });

  } catch (err) {
    console.error('Error seeding skills:', err);
    res.status(500).json({
      message: 'Error seeding skills database',
      error: err.message
    });
  }
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

/**
 * @route   GET /api/admin/reports/summaries
 * @desc    Get all users with their recent conversation summaries
 * @access  Private (Admin)
 */
router.get('/reports/summaries', isAdmin, async (req, res) => {
  try {
    // Get all users (excluding admins for cleaner view)
    const users = await User.find({ role: { $ne: 'admin' } })
      .select('firstName lastName email role username totalActiveTutoringMinutes weeklyActiveTutoringMinutes level xp lastLogin createdAt teacherId')
      .populate('teacherId', 'firstName lastName')
      .sort({ lastName: 1, firstName: 1 })
      .lean();

    // Get recent conversations for all users (limit to 3 most recent per user)
    const userIds = users.map(u => u._id);

    const conversations = await Conversation.aggregate([
      {
        $match: { userId: { $in: userIds } }
      },
      {
        $sort: { startDate: -1 }
      },
      {
        $group: {
          _id: '$userId',
          conversations: {
            $push: {
              summary: '$summary',
              startDate: '$startDate',
              activeMinutes: '$activeMinutes'
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          conversations: { $slice: ['$conversations', 3] }
        }
      }
    ]);

    // Create lookup map for conversations
    const conversationsMap = {};
    conversations.forEach(conv => {
      conversationsMap[conv._id.toString()] = conv.conversations;
    });

    // Enrich users with their recent conversations
    const enrichedUsers = users.map(user => ({
      userId: user._id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      username: user.username,
      role: user.role,
      level: user.level || 1,
      xp: user.xp || 0,
      totalMinutes: user.totalActiveTutoringMinutes || 0,
      weeklyMinutes: user.weeklyActiveTutoringMinutes || 0,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      teacher: user.teacherId ? `${user.teacherId.firstName} ${user.teacherId.lastName}` : null,
      recentConversations: conversationsMap[user._id.toString()] || []
    }));

    res.json({
      users: enrichedUsers,
      totalUsers: enrichedUsers.length,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Error fetching user summaries:', err);
    res.status(500).json({ message: 'Server error fetching user summaries.' });
  }
});

/**
 * @route   POST /api/admin/students/:studentId/reset-assessment
 * @desc    Reset a student's placement assessment (admin only)
 * @access  Private (Admin)
 *
 * Allows admin to reset any student's screener so they can retake it.
 * Use cases: After summer break, significant skill regression, incorrect placement
 */
router.post('/students/:studentId/reset-assessment', isAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;
    const adminId = req.user._id;
    const { reason } = req.body; // Optional reason for audit trail

    // Find the student
    const student = await User.findOne({ _id: studentId, role: 'student' });
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    // Store previous assessment data for audit trail
    const previousAssessment = {
      completedDate: student.learningProfile.assessmentDate,
      placement: student.learningProfile.initialPlacement,
      resetDate: new Date(),
      resetBy: adminId,
      resetByRole: 'admin',
      reason: reason || 'Admin requested reset'
    };

    // Add to assessment history if it doesn't exist
    if (!student.learningProfile.assessmentHistory) {
      student.learningProfile.assessmentHistory = [];
    }
    student.learningProfile.assessmentHistory.push(previousAssessment);

    // Reset assessment flags
    student.learningProfile.assessmentCompleted = false;
    student.learningProfile.assessmentDate = null;
    student.learningProfile.initialPlacement = null;

    // Optional: Clear skill mastery (keeping it for now to preserve learning history)
    // student.skillMastery = new Map();

    await student.save();

    console.log(`[Admin] Assessment reset for student ${studentId} by admin ${adminId}`);

    res.json({
      success: true,
      message: `Assessment reset successfully for ${student.firstName} ${student.lastName}`,
      studentName: `${student.firstName} ${student.lastName}`,
      previousAssessment
    });

  } catch (error) {
    console.error('Error resetting student assessment:', error);
    res.status(500).json({ message: 'Error resetting assessment' });
  }
});

/**
 * @route   DELETE /api/admin/users/:userId
 * @desc    Delete a user account (admin only)
 * @access  Private (Admin)
 */
router.delete('/users/:userId', isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent admin from deleting themselves
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account.'
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    // Store user info for logging
    const userInfo = `${user.firstName} ${user.lastName} (${user.email}, ${user.role})`;

    // Delete associated data
    await Promise.all([
      // Delete all conversations
      Conversation.deleteMany({ userId: user._id }),
      // If teacher, remove from students' teacherId
      user.role === 'teacher' ? User.updateMany(
        { teacherId: user._id },
        { $unset: { teacherId: '' } }
      ) : Promise.resolve(),
      // If parent, unlink from children
      user.role === 'parent' && user.children?.length > 0 ? User.updateMany(
        { _id: { $in: user.children } },
        { $unset: { parentId: '' } }
      ) : Promise.resolve(),
      // Delete the user
      User.findByIdAndDelete(userId)
    ]);

    console.log(`[ADMIN] User deleted by ${req.user.email}: ${userInfo}`);

    res.json({
      success: true,
      message: `User "${userInfo}" has been deleted successfully.`
    });

  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({
      success: false,
      message: 'Server error deleting user.'
    });
  }
});

// -----------------------------------------------------------------------------
// --- Alpha Testing: Survey Responses ---
// -----------------------------------------------------------------------------

/**
 * @route   GET /api/admin/survey-responses
 * @desc    Get all survey responses from all users for alpha testing analysis
 * @access  Private (Admin)
 */
router.get('/survey-responses', isAdmin, async (req, res) => {
  try {
    const { limit = 100, skip = 0, sortBy = 'submittedAt', order = 'desc' } = req.query;

    // Fetch all users who have submitted survey responses
    const users = await User.find(
      { 'sessionSurveys.responses.0': { $exists: true } },
      'firstName lastName email username role sessionSurveys.responses sessionSurveys.responsesCount'
    ).lean();

    // Flatten all responses with user info
    const allResponses = [];
    for (const user of users) {
      if (user.sessionSurveys && user.sessionSurveys.responses) {
        for (const response of user.sessionSurveys.responses) {
          allResponses.push({
            ...response,
            userId: user._id,
            userEmail: user.email,
            userName: `${user.firstName} ${user.lastName}`,
            userRole: user.role
          });
        }
      }
    }

    // Sort responses
    allResponses.sort((a, b) => {
      const aVal = a[sortBy] || a.submittedAt;
      const bVal = b[sortBy] || b.submittedAt;
      if (order === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    // Calculate statistics
    const stats = {
      totalResponses: allResponses.length,
      totalUsers: users.length,
      averageRating: 0,
      averageHelpfulness: 0,
      averageDifficulty: 0,
      averageWillingness: 0,
      experienceBreakdown: {},
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };

    let ratingSum = 0, helpfulnessSum = 0, difficultySum = 0, willingnessSum = 0;
    let ratingCount = 0, helpfulnessCount = 0, difficultyCount = 0, willingnessCount = 0;

    for (const response of allResponses) {
      if (response.rating) {
        ratingSum += response.rating;
        ratingCount++;
        stats.ratingDistribution[response.rating]++;
      }
      if (response.helpfulness) {
        helpfulnessSum += response.helpfulness;
        helpfulnessCount++;
      }
      if (response.difficulty) {
        difficultySum += response.difficulty;
        difficultyCount++;
      }
      if (response.willingness !== undefined && response.willingness !== null) {
        willingnessSum += response.willingness;
        willingnessCount++;
      }
      if (response.experience) {
        stats.experienceBreakdown[response.experience] =
          (stats.experienceBreakdown[response.experience] || 0) + 1;
      }
    }

    stats.averageRating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(2) : 0;
    stats.averageHelpfulness = helpfulnessCount > 0 ? (helpfulnessSum / helpfulnessCount).toFixed(2) : 0;
    stats.averageDifficulty = difficultyCount > 0 ? (difficultySum / difficultyCount).toFixed(2) : 0;
    stats.averageWillingness = willingnessCount > 0 ? (willingnessSum / willingnessCount).toFixed(2) : 0;

    // Pagination
    const paginatedResponses = allResponses.slice(parseInt(skip), parseInt(skip) + parseInt(limit));

    res.json({
      success: true,
      stats,
      responses: paginatedResponses,
      pagination: {
        total: allResponses.length,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: parseInt(skip) + parseInt(limit) < allResponses.length
      }
    });

  } catch (err) {
    console.error('Error fetching survey responses for admin:', err);
    res.status(500).json({
      success: false,
      message: 'Server error fetching survey responses.'
    });
  }
});

/**
 * @route   GET /api/admin/survey-stats
 * @desc    Get aggregated statistics for survey responses
 * @access  Private (Admin)
 */
router.get('/survey-stats', isAdmin, async (req, res) => {
  try {
    const users = await User.find(
      {},
      'sessionSurveys.responses sessionSurveys.responsesCount tourCompleted tourDismissed'
    ).lean();

    const stats = {
      totalUsers: users.length,
      usersWithResponses: 0,
      totalResponses: 0,
      tourCompletedCount: 0,
      tourDismissedCount: 0,
      averageResponsesPerUser: 0,
      recentResponses: []
    };

    for (const user of users) {
      if (user.tourCompleted) stats.tourCompletedCount++;
      if (user.tourDismissed) stats.tourDismissedCount++;

      if (user.sessionSurveys && user.sessionSurveys.responses && user.sessionSurveys.responses.length > 0) {
        stats.usersWithResponses++;
        stats.totalResponses += user.sessionSurveys.responses.length;
      }
    }

    stats.averageResponsesPerUser = stats.usersWithResponses > 0
      ? (stats.totalResponses / stats.usersWithResponses).toFixed(2)
      : 0;

    res.json({
      success: true,
      stats
    });

  } catch (err) {
    console.error('Error fetching survey stats for admin:', err);
    res.status(500).json({
      success: false,
      message: 'Server error fetching survey statistics.'
    });
  }
});

module.exports = router;