// routes/email.js
// Email routes for testing and sending parent reports

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { sendTestEmail, sendParentWeeklyReport } = require('../utils/emailService');
const User = require('../models/user');

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

    // Calculate weekly stats (simplified - you'll want to query actual data)
    const studentData = {
      studentName: `${student.firstName} ${student.lastName}`,
      problemsCompleted: student.problemsCompleted || 0,
      currentLevel: student.level || 1,
      xpEarned: student.xp || 0,
      activeMinutes: student.totalActiveTutoringMinutes || 0,
      masteryGained: 0, // TODO: Calculate from skillMastery
      strugglingSkills: [], // TODO: Get from skillMastery where status === 'needs-review'
      achievements: [] // TODO: Get recent badges
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

  res.json({
    configured: isConfigured,
    host: process.env.SMTP_HOST || 'Not configured',
    user: process.env.SMTP_USER || 'Not configured',
    port: process.env.SMTP_PORT || 587
  });
});

module.exports = router;
