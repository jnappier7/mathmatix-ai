const express = require('express');
const router = express.Router();
const User = require('../models/User'); // Adjust path if your User.js is not in ../models/
const { isTeacher } = require('../middleware/auth'); // CORRECT: Import the shared isTeacher middleware

// REMOVED: The locally defined isTeacher middleware is removed from here.
// It was redundant and used req.session.userId instead of req.user from Passport.

// Define the GET /api/teacher/students route - fetches students assigned to the logged-in teacher
router.get('/students', isTeacher, async (req, res) => { // Uses the imported isTeacher
  try {
    // CORRECT: Use req.user._id populated by Passport, via the imported isTeacher middleware
    const teacherId = req.user._id;
    // Find students whose teacherId matches the logged-in teacher's ID
    const students = await User.find(
      { role: 'student', teacherId: teacherId },
      'firstName lastName username gradeLevel iepPlan' // Select relevant fields including iepPlan
    ).lean();
    res.json(students);
  } catch (err) {
    console.error('Error fetching students for teacher dashboard:', err);
    res.status(500).json({ message: 'Server error fetching student data.' });
  }
});

// Define the GET /api/teacher/students/:studentId/iep - fetches a specific student's IEP
router.get('/students/:studentId/iep', isTeacher, async (req, res) => { // Uses the imported isTeacher
  try {
    const { studentId } = req.params;
    // CORRECT: Use req.user._id populated by Passport, via the imported isTeacher middleware
    const teacherId = req.user._id;

    // Find the student, ensuring they are a student role and assigned to this teacher
    const student = await User.findOne({
      _id: studentId,
      role: 'student',
      teacherId: teacherId
    }, 'firstName lastName username iepPlan').lean(); // Select relevant fields

    if (!student) {
      return res.status(404).json({ message: 'Student not found or not assigned to this teacher.' });
    }

    res.json(student.iepPlan); // Return the student's IEP plan
  } catch (err) {
    console.error('Error fetching student IEP:', err);
    res.status(500).json({ message: 'Server error fetching IEP data.' });
  }
});

// Define the PUT /api/teacher/students/:studentId/iep - updates a specific student's IEP
router.put('/students/:studentId/iep', isTeacher, async (req, res) => { // Uses the imported isTeacher
  try {
    const { studentId } = req.params;
    // CORRECT: Use req.user._id populated by Passport, via the imported isTeacher middleware
    const teacherId = req.user._id;
    const updatedIepPlan = req.body; // The entire updated iepPlan object from the frontend

    // Find and update the student's IEP plan, ensuring they are a student role and assigned to this teacher
    const result = await User.findOneAndUpdate(
      { _id: studentId, role: 'student', teacherId: teacherId },
      { $set: { iepPlan: updatedIepPlan } },
      { new: true, runValidators: true } // Return the updated document and run schema validators
    );

    if (!result) {
      return res.status(404).json({ message: 'Student not found or not assigned to this teacher.' });
    }

    res.json({ message: 'IEP plan updated successfully!', iepPlan: result.iepPlan });
  } catch (err) {
    console.error('Error updating student IEP:', err);
    res.status(500).json({ message: 'Server error updating IEP data.' });
  }
});

// GET a specific assigned student's conversation history (Teacher only)
router.get('/students/:studentId/conversations', isTeacher, async (req, res) => { // Uses the imported isTeacher
  try {
    const { studentId } = req.params;
    // CORRECT: Use req.user._id populated by Passport, via the imported isTeacher middleware
    const teacherId = req.user._id; // Get the logged-in teacher's ID

    // Fetch student, ensuring they are a student role AND assigned to this teacher
    const student = await User.findOne({
      _id: studentId,
      role: 'student',
      teacherId: teacherId
    }, 'conversations').lean(); // Select conversations field

    if (!student) {
      return res.status(404).json({ message: 'Student not found or not assigned to this teacher.' });
    }
    res.json(student.conversations || []); // Return the array of conversations
  } catch (err) {
    console.error('Error fetching student conversations for teacher:', err);
    res.status(500).json({ message: 'Server error fetching conversation data.' });
  }
});

module.exports = router;