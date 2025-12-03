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


module.exports = router;