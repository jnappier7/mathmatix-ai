// routes/email.js
// Email routes for testing and sending parent reports

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { sendTestEmail, sendParentWeeklyReport, getEmailConfig } = require('../utils/emailService');
const User = require('../models/user');
const Conversation = require('../models/conversation');

/**
 * POST /api/email/test
 * Send a test email to verify configuration
 */
router.post('/test', isAuthenticated, async (req, res) => {
  try {
    const { recipientEmail } = req.body;

    // Use current user's email if not specified
    const targetEmail = recipientEmail || req.user.email;

    if (!targetEmail) {
      return res.status(400).json({
        success: false,
        message: 'No email address provided'
      });
    }

    const result = await sendTestEmail(targetEmail);

    res.json({
      success: true,
      message: `Test email sent to ${targetEmail}`,
      messageId: result.messageId
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send test email. Check SMTP configuration.'
    });
  }
});

/**
 * POST /api/email/weekly-report
 * Send weekly progress report to parent
 * Body: { studentId }
 */
router.post('/weekly-report', isAuthenticated, async (req, res) => {
  try {
    const { studentId } = req.body;
    const parent = req.user;

    // Verify user is a parent
    if (parent.role !== 'parent') {
      return res.status(403).json({
        success: false,
        message: 'Only parents can request weekly reports'
      });
    }

    // Verify parent owns this child
    if (!parent.children || !parent.children.includes(studentId)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this student'
      });
    }

    // Get student data
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Calculate one week ago
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Calculate problemsCompleted from Conversation collection
    const conversationStats = await Conversation.aggregate([
      { $match: { userId: student._id } },
      { $group: {
        _id: null,
        totalProblems: { $sum: '$problemsAttempted' },
        totalCorrect: { $sum: '$problemsCorrect' }
      }}
    ]);
    const problemsCompleted = conversationStats.length > 0 ? conversationStats[0].totalCorrect : 0;

    // Calculate masteryGained from skillMastery (count skills with status 'mastered')
    let masteryGained = 0;
    if (student.skillMastery && student.skillMastery.size > 0) {
      for (const [skillId, mastery] of student.skillMastery) {
        if (mastery.status === 'mastered' && mastery.masteredDate && mastery.masteredDate >= oneWeekAgo) {
          masteryGained++;
        }
      }
    }

    // Get strugglingSkills from skillMastery where status === 'needs-review'
    const strugglingSkills = [];
    if (student.skillMastery && student.skillMastery.size > 0) {
      for (const [skillId, mastery] of student.skillMastery) {
        if (mastery.status === 'needs-review' || mastery.status === 're-fragile') {
          strugglingSkills.push(skillId);
        }
      }
    }

    // Get recent achievements (badges earned in the last week)
    const achievements = [];
    if (student.badges && student.badges.length > 0) {
      for (const badge of student.badges) {
        if (badge.unlockedAt && badge.unlockedAt >= oneWeekAgo) {
          achievements.push({
            key: badge.key,
            badgeId: badge.badgeId,
            unlockedAt: badge.unlockedAt
          });
        }
      }
    }

    // Calculate weekly stats
    const studentData = {
      studentName: `${student.firstName} ${student.lastName}`,
      problemsCompleted: problemsCompleted,
      currentLevel: student.level || 1,
      xpEarned: student.xp || 0,
      activeMinutes: student.totalActiveTutoringMinutes || 0,
      masteryGained: masteryGained,
      strugglingSkills: strugglingSkills,
      achievements: achievements
    };

    const result = await sendParentWeeklyReport(parent, studentData);

    if (result.success) {
      res.json({
        success: true,
        message: `Weekly report sent to ${parent.email}`,
        messageId: result.messageId
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || 'Failed to send weekly report'
      });
    }
  } catch (error) {
    console.error('Error sending weekly report:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send weekly report'
    });
  }
});

/**
 * GET /api/email/status
 * Check if email service is configured
 */
router.get('/status', isAuthenticated, async (req, res) => {
  const isConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const emailConfig = getEmailConfig();

  res.json({
    configured: isConfigured,
    smtp: {
      host: process.env.SMTP_HOST || 'Not configured',
      port: process.env.SMTP_PORT || 587,
      user: process.env.SMTP_USER ? '(configured)' : 'Not configured'
    },
    sender: {
      from: emailConfig.from || 'Not configured',
      fromName: emailConfig.fromName,
      replyTo: emailConfig.replyTo || 'Not configured'
    }
  });
});

module.exports = router;
