// routes/email.js
// Email routes for testing and sending parent reports

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { sendTestEmail, sendParentProgressReport, getEmailConfig } = require('../utils/emailService');
const { buildLearningReport } = require('../utils/parentReport');
const User = require('../models/user');

const { userHasRole } = require('../utils/roleQuery');
const { windowDaysFor } = require('../utils/reportFrequency');
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
    if (!userHasRole(parent, 'parent')) {
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

    const student = await User.findById(studentId).lean();
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // The same Learning Report the dashboard shows (utils/parentReport), over the
    // parent's cadence window ('never' only stops the SCHEDULED email; send-now
    // still works), in the parent's language. This route used to keep its own
    // copy of the stats — placement counted as mastered, raw skill ids, lifetime
    // minutes under a weekly heading.
    const report = await buildLearningReport(student, {
      language: parent.parentLanguage,
      windowDays: windowDaysFor(parent.reportFrequency),
    });
    const result = await sendParentProgressReport(parent, report);

    if (result.success) {
      res.json({
        success: true,
        message: `Progress report sent to ${parent.email}`,
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

  // Non-admins (parents checking whether reports can go out) learn only
  // whether email works. The SMTP host and sender addresses are server
  // configuration — admins only.
  if (!userHasRole(req.user, 'admin')) {
    return res.json({ configured: isConfigured });
  }

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
