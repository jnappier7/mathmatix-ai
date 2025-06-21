// FULL MERGED, SURGICALLY EDITED admin.js

const express = require('express');
const router = express.Router();
const User = require('../models/user'); // Assuming User model is in '../models/User.js'
const { isAdmin } = require('../middleware/auth'); // Assuming auth.js is in middleware directory

// ADMIN ROUTES FOR USERS & ROLES
// GET all users (Admin only) - now fetches more details including IEP plan and teacherId
router.get('/users', isAdmin, async (req, res) => {
  try {
    // Select all fields that might be displayed or edited on the frontend, including usage info
    const users = await User.find({}, 'firstName lastName email username role gradeLevel teacherId iepPlan mathCourse tonePreference learningStyle interests conversations totalActiveTutoringMinutes weeklyActiveTutoringMinutes lastLogin createdAt xp level').lean();
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

// ADMIN ROUTES FOR IEP MANAGEMENT (similar to teacher routes, but for any student)
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
    const updates = req.body; // Expects an object with fields to update (e.g., { gradeLevel: '9', mathCourse: 'Algebra' })

    // Only allow specific fields to be updated to prevent unintended modifications
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

    // Handle potential name update from firstName/lastName if 'name' field exists on User model
    // This ensures 'name' is kept consistent if firstName/lastName are updated
    if (validUpdates.firstName !== undefined || validUpdates.lastName !== undefined) {
        // Fetch current user to combine names if only one part is updated
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
      { new: true, runValidators: true } // runValidators ensures schema validation on updates
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


// ADMIN ROUTES FOR TEACHER ASSIGNMENT

// PATCH to assign multiple students to a teacher (or unassign)
router.patch('/assign-teacher', isAdmin, async (req, res) => {
  try {
    const { studentIds, teacherId } = req.body;

    // Basic validation
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: 'Please provide a list of student IDs.' });
    }
    // If teacherId is provided, validate it. If it's an empty string, we treat it as unassign
    if (teacherId) {
      const teacher = await User.findById(teacherId);
      if (!teacher || teacher.role !== 'teacher') {
        return res.status(400).json({ message: 'Invalid teacher ID provided.' });
      }
    }

    // Update all selected students in one efficient database operation
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

// Original PUT route for single student assignment (kept for completeness, can be removed if only batch is used)
router.put('/students/:studentId/assign-teacher', isAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { teacherId } = req.body; // Can be null to unassign

    // Validate teacherId (must be null or an existing teacher's _id)
    if (teacherId) {
      const teacher = await User.findById(teacherId);
      if (!teacher || teacher.role !== 'teacher') {
        return res.status(400).json({ message: 'Invalid teacher ID provided.' });
      }
    }

    const result = await User.findOneAndUpdate(
      { _id: studentId, role: 'student' },
      { $set: { teacherId: teacherId || null } }, // Set to null if teacherId is empty string or undefined
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ message: 'Student not found or not a student role.' });
    }

    const assignmentStatus = teacherId ? `assigned to teacher ${teacherId}` : 'unassigned';
    res.json({ message: `Student ${result.firstName} ${result.lastName} ${assignmentStatus} successfully!`, student: result });
  } catch (err) {
    console.error('Error assigning teacher to student:', err);
    res.status(500).json({ message: 'Server error assigning teacher.' });
  }
});

// GET a specific student's conversation history (Admin only)
router.get('/students/:studentId/conversations', isAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;
    // Fetch student, ensuring it's a student role, and select conversations
    const student = await User.findOne({ _id: studentId, role: 'student' }, 'conversations').lean();

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }
    res.json(student.conversations || []); // Return the array of conversations
  } catch (err) {
    console.error('Error fetching student conversations for admin:', err);
    res.status(500).json({ message: 'Server error fetching conversation data.' });
  }
});

module.exports = router;