// routes/teacher.js
// MODIFIED: Updated to query the 'Conversation' collection for student conversation history.

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Conversation = require('../models/conversation'); // NEW: Import Conversation model
const { isTeacher } = require('../middleware/auth');

// Fetches students assigned to the logged-in teacher
router.get('/students', isTeacher, async (req, res) => {
  try {
    const teacherId = req.user._id;
    const students = await User.find(
      { role: 'student', teacherId: teacherId },
      'firstName lastName username gradeLevel iepPlan'
    ).lean();
    res.json(students);
  } catch (err) {
    console.error('Error fetching students for teacher dashboard:', err);
    res.status(500).json({ message: 'Server error fetching student data.' });
  }
});

// Fetches a specific student's IEP
router.get('/students/:studentId/iep', isTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const teacherId = req.user._id;

    const student = await User.findOne({
      _id: studentId,
      role: 'student',
      teacherId: teacherId
    }, 'firstName lastName username iepPlan').lean();

    if (!student) {
      return res.status(404).json({ message: 'Student not found or not assigned to this teacher.' });
    }

    res.json(student.iepPlan);
  } catch (err) {
    console.error('Error fetching student IEP:', err);
    res.status(500).json({ message: 'Server error fetching IEP data.' });
  }
});

// Updates a specific student's IEP
router.put('/students/:studentId/iep', isTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const teacherId = req.user._id;
    const updatedIepPlan = req.body;

    const result = await User.findOneAndUpdate(
      { _id: studentId, role: 'student', teacherId: teacherId },
      { $set: { iepPlan: updatedIepPlan } },
      { new: true, runValidators: true }
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

// Get a specific assigned student's conversation history (Teacher only)
router.get('/students/:studentId/conversations', isTeacher, async (req, res) => {
  const { studentId } = req.params;
  const teacherId = req.user._id;

  try {
    // First, confirm the teacher is actually assigned this student
    const student = await User.findOne({ _id: studentId, teacherId: teacherId });
    if (!student) {
        return res.status(403).json({ message: "You are not authorized to view this student's history." });
    }

    // --- MODIFICATION START ---
    // Fetch all conversations for this student from the Conversation collection
    const conversations = await Conversation.find({ userId: studentId })
        .sort({ startDate: -1 }) // Sort by most recent first
        .select('date summary activeMinutes'); // Select only the necessary fields
    // --- MODIFICATION END ---

    res.json(conversations || []);
  } catch (err) {
    console.error('Error fetching student conversations for teacher:', err);
    res.status(500).json({ message: 'Server error fetching conversation data.' });
  }
});

module.exports = router;