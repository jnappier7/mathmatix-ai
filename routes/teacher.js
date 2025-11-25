// routes/teacher.js
// MODIFIED: Updated to query the 'Conversation' collection for student conversation history.

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Conversation = require('../models/conversation'); // NEW: Import Conversation model
const { isTeacher } = require('../middleware/auth');
const { generateLiveSummary, detectStruggle, detectTopic, calculateProblemStats } = require('../utils/activitySummarizer');

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

// ============================================
// LIVE ACTIVITY FEED ENDPOINTS
// ============================================

// Get live activity feed - active sessions for assigned students
router.get('/live-feed', isTeacher, async (req, res) => {
  try {
    const teacherId = req.user._id;

    // Get all students assigned to this teacher
    const students = await User.find(
      { role: 'student', teacherId: teacherId },
      '_id firstName lastName username'
    ).lean();

    const studentIds = students.map(s => s._id);

    // Get active conversations for these students
    const activeConversations = await Conversation.find({
      userId: { $in: studentIds },
      isActive: true,
      lastActivity: { $gte: new Date(Date.now() - 30 * 60 * 1000) } // Active within last 30 min
    }).sort({ lastActivity: -1 }).lean();

    // Enrich with student info and generate summaries if needed
    const activityFeed = await Promise.all(activeConversations.map(async (convo) => {
      const student = students.find(s => s._id.toString() === convo.userId.toString());
      const studentName = student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username : 'Unknown';

      // Generate live summary if not recently updated (every 5 minutes)
      const needsUpdate = !convo.lastSummaryUpdate ||
        (Date.now() - new Date(convo.lastSummaryUpdate).getTime()) > 5 * 60 * 1000;

      let liveSummary = convo.liveSummary;

      if (needsUpdate && convo.messages.length > 0) {
        liveSummary = await generateLiveSummary(convo, studentName);

        // Update conversation with new summary
        await Conversation.findByIdAndUpdate(convo._id, {
          liveSummary,
          lastSummaryUpdate: new Date(),
          currentTopic: detectTopic(convo.messages),
          ...calculateProblemStats(convo.messages)
        });
      }

      // Detect struggles
      const struggleInfo = detectStruggle(convo.messages.slice(-10));

      return {
        conversationId: convo._id,
        studentId: student._id,
        studentName,
        startTime: convo.startDate,
        lastActivity: convo.lastActivity,
        duration: convo.activeMinutes,
        liveSummary: liveSummary || `${studentName} is in an active session`,
        currentTopic: convo.currentTopic,
        problemsAttempted: convo.problemsAttempted || 0,
        problemsCorrect: convo.problemsCorrect || 0,
        isStruggling: struggleInfo.isStruggling,
        strugglingWith: struggleInfo.strugglingWith,
        severity: struggleInfo.severity,
        alerts: convo.alerts || []
      };
    }));

    res.json(activityFeed);
  } catch (error) {
    console.error('Error fetching live feed:', error);
    res.status(500).json({ message: 'Error fetching live activity feed' });
  }
});

// Get all activity (including completed sessions) with filtering
router.get('/activity-feed', isTeacher, async (req, res) => {
  try {
    const teacherId = req.user._id;
    const { studentId, topic, alertType, startDate, endDate, activeOnly } = req.query;

    // Get all students assigned to this teacher
    const students = await User.find(
      { role: 'student', teacherId: teacherId },
      '_id firstName lastName username'
    ).lean();

    const studentIds = students.map(s => s._id);

    // Build query
    const query = { userId: { $in: studentIds } };

    if (studentId) query.userId = studentId;
    if (activeOnly === 'true') query.isActive = true;
    if (topic) query.currentTopic = new RegExp(topic, 'i');
    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = new Date(startDate);
      if (endDate) query.startDate.$lte = new Date(endDate);
    }

    const conversations = await Conversation.find(query)
      .sort({ lastActivity: -1 })
      .limit(100)
      .lean();

    // Filter by alert type if specified
    let filteredConversations = conversations;
    if (alertType) {
      filteredConversations = conversations.filter(c =>
        c.alerts && c.alerts.some(a => a.type === alertType)
      );
    }

    // Enrich with student info
    const activityFeed = filteredConversations.map(convo => {
      const student = students.find(s => s._id.toString() === convo.userId.toString());
      const studentName = student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username : 'Unknown';

      return {
        conversationId: convo._id,
        studentId: convo.userId,
        studentName,
        startTime: convo.startDate,
        lastActivity: convo.lastActivity,
        duration: convo.activeMinutes,
        isActive: convo.isActive,
        summary: convo.summary || convo.liveSummary,
        currentTopic: convo.currentTopic,
        problemsAttempted: convo.problemsAttempted || 0,
        problemsCorrect: convo.problemsCorrect || 0,
        strugglingWith: convo.strugglingWith,
        alerts: convo.alerts || []
      };
    });

    res.json(activityFeed);
  } catch (error) {
    console.error('Error fetching activity feed:', error);
    res.status(500).json({ message: 'Error fetching activity feed' });
  }
});

// Acknowledge an alert
router.post('/alerts/:conversationId/:alertIndex/acknowledge', isTeacher, async (req, res) => {
  try {
    const { conversationId, alertIndex } = req.params;
    const teacherId = req.user._id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Verify teacher has access to this student
    const student = await User.findOne({ _id: conversation.userId, teacherId });
    if (!student) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Acknowledge the alert
    if (conversation.alerts && conversation.alerts[alertIndex]) {
      conversation.alerts[alertIndex].acknowledged = true;
      await conversation.save();
    }

    res.json({ message: 'Alert acknowledged' });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ message: 'Error acknowledging alert' });
  }
});

module.exports = router;