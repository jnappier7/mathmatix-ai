const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Middleware function to check if the user is authenticated and has the 'admin' role
async function isAdmin(req, res, next) {
  if (req.session && req.session.userId) {
    try {
      const user = await User.findById(req.session.userId);
      if (user && user.role === 'admin') {
        next(); // User is an admin, proceed
      } else {
        res.status(403).json({ message: 'Access Denied: You do not have administrator privileges.' });
      }
    } catch (err) {
      console.error("Error checking admin role during authorization:", err);
      res.status(500).json({ message: 'Server error during authorization check.' });
    }
  } else {
    res.status(401).json({ message: 'Unauthorized: Please log in to access this resource.' });
  }
}

// ADMIN ROUTES FOR USERS & ROLES
// GET all users (Admin only) - now fetches more details including IEP plan and teacherId
router.get('/users', isAdmin, async (req, res) => {
  try {
    const users = await User.find({}, 'firstName lastName username role gradeLevel teacherId iepPlan').lean();
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

// ADMIN ROUTES FOR TEACHER ASSIGNMENT
// PUT to assign a student to a teacher (Admin only)
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
router.get('/students/:studentId/conversations', isAdmin, async (req, res) => { // <--- THIS IS THE ROUTE YOU NEEDED TO ADD/CONFIRM
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