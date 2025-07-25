// routes/admin.js
// MODIFIED: Updated to use the 'Conversation' collection.
// The main /users route is now more efficient and does not include conversation data.
// A separate /students/:studentId/conversations route provides this data on-demand.

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Conversation = require('../models/conversation'); // NEW: Import Conversation model
const { isAdmin } = require('../middleware/auth');

// GET all users (Admin only) - MODIFIED to be more performant.
// It no longer includes the 'conversations' field directly to avoid sending massive amounts of data.
// The frontend should call '/students/:studentId/conversations' to get history for a specific user.
router.get('/users', isAdmin, async (req, res) => {
  try {
    const users = await User.find({}, 
      'firstName lastName email username role gradeLevel teacherId iepPlan mathCourse tonePreference learningStyle interests totalActiveTutoringMinutes weeklyActiveTutoringMinutes lastLogin createdAt xp level'
    ).lean();
    res.json(users);
  } catch (err) {
    console.error('Error fetching users for admin dashboard:', err);
    res.status(500).json({ message: 'Server error fetching user data.' });
  }
});

// GET all teachers (Admin only) - for the assignment dropdown
router.get('/teachers', isAdmin, async (req, res) => {
  try {
    const teachers = await User.find({ role: 'teacher' }, 'firstName lastName _id').lean();
    res.json(teachers);
  } catch (err) {
    console.error('Error fetching teachers for admin dashboard:', err);
    res.status(500).json({ message: 'Server error fetching teacher data.' });
  }
});

// GET a specific student's IEP plan (Admin only)
router.get('/students/:studentId/iep', isAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await User.findOne({ _id: studentId, role: 'student' }, 'firstName lastName username iepPlan').lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }
    res.json(student.iepPlan);
  } catch (err) {
    console.error('Error fetching student IEP for admin:', err);
    res.status(500).json({ message: 'Server error fetching IEP data.' });
  }
});

// PUT to update a specific student's IEP plan (Admin only)
router.put('/students/:studentId/iep', isAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;
    const updatedIepPlan = req.body;
    const result = await User.findOneAndUpdate(
      { _id: studentId, role: 'student' },
      { $set: { iepPlan: updatedIepPlan } },
      { new: true, runValidators: true }
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

// PATCH to update a specific student's general profile information (Admin only)
router.patch('/students/:studentId/profile', isAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;
    const updates = req.body;
    const allowedUpdates = [
      'firstName', 'lastName', 'username', 'email', 'gradeLevel', 'mathCourse',
      'tonePreference', 'learningStyle', 'interests', 'teacherId'
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
    if (validUpdates.firstName !== undefined || validUpdates.lastName !== undefined) {
        const currentUser = await User.findById(studentId);
        if (currentUser) {
            const newFirstName = validUpdates.firstName !== undefined ? validUpdates.firstName : currentUser.firstName;
            const newLastName = validUpdates.lastName !== undefined ? validUpdates.lastName : currentUser.lastName;
            validUpdates.name = `${newFirstName} ${newLastName}`;
        }
    }
    const result = await User.findOneAndUpdate(
      { _id: studentId, role: 'student' },
      { $set: validUpdates },
      { new: true, runValidators: true }
    );
    if (!result) {
      return res.status(404).json({ message: 'Student not found or not a student role.' });
    }
    res.json({ message: 'Student profile updated successfully!', student: result.toObject() });
  } catch (err) {
    console.error('Error updating student profile for admin:', err);
    res.status(500).json({ message: 'Server error updating student profile.' });
  }
});

// PATCH to assign multiple students to a teacher (or unassign)
router.patch('/assign-teacher', isAdmin, async (req, res) => {
  try {
    const { studentIds, teacherId } = req.body;
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: 'Please provide a list of student IDs.' });
    }
    if (teacherId) {
      const teacher = await User.findById(teacherId);
      if (!teacher || teacher.role !== 'teacher') {
        return res.status(400).json({ message: 'Invalid teacher ID provided.' });
      }
    }
    const result = await User.updateMany(
      { _id: { $in: studentIds }, role: 'student' },
      { $set: { teacherId: teacherId || null } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'No students found or updated based on provided IDs.' });
    }
    const assignmentStatus = teacherId ? `assigned to teacher ${teacherId}` : 'unassigned';
    res.json({ message: `${result.modifiedCount} student(s) ${assignmentStatus} successfully!` });
  } catch (err) {
    console.error('Error assigning teachers to students (batch update):', err);
    res.status(500).json({ message: 'Server error assigning teachers.' });
  }
});

// GET a specific student's conversation history (Admin only)
router.get('/students/:studentId/conversations', isAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // --- MODIFICATION START ---
    // Fetch conversations from the Conversation collection instead of the user document
    const conversations = await Conversation.find({ userId: studentId })
        .sort({ startDate: -1 })
        .select('date summary activeMinutes'); // Select key fields for the admin view
    // --- MODIFICATION END ---

    if (!conversations) { // conversations can be an empty array, which is a valid case
      return res.status(404).json({ message: 'No conversations found for this student.' });
    }
    res.json(conversations);
  } catch (err) {
    console.error('Error fetching student conversations for admin:', err);
    res.status(500).json({ message: 'Server error fetching conversation data.' });
  }
});

module.exports = router;