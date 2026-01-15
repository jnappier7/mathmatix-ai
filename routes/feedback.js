// routes/feedback.js
// API endpoints for user feedback and bug reports

const express = require('express');
const router = express.Router();
const Feedback = require('../models/feedback');
const { isAuthenticated } = require('../middleware/auth');
const logger = require('../utils/logger').child({ route: 'feedback' });

/**
 * POST /api/feedback
 * Submit user feedback or bug report
 */
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const { type, subject, description, priority, url, screenshot } = req.body;

    // Validation
    if (!type || !subject || !description) {
      return res.status(400).json({
        success: false,
        message: 'Type, subject, and description are required'
      });
    }

    // Create feedback entry
    const feedback = new Feedback({
      userId: req.user._id,
      type,
      subject,
      description,
      priority: priority || 'medium',
      userAgent: req.headers['user-agent'],
      url: url || req.headers.referer,
      screenshot
    });

    await feedback.save();

    logger.info('Feedback submitted', {
      feedbackId: feedback._id,
      userId: req.user._id,
      type,
      priority
    });

    res.json({
      success: true,
      message: 'Thank you for your feedback! We appreciate your input.',
      feedbackId: feedback._id
    });
  } catch (error) {
    logger.error('Failed to submit feedback', {
      error: error.message,
      userId: req.user._id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback. Please try again.'
    });
  }
});

/**
 * GET /api/feedback/my
 * Get user's feedback history
 */
router.get('/my', isAuthenticated, async (req, res) => {
  try {
    const feedback = await Feedback.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-adminNotes'); // Don't send admin notes to users

    res.json({
      success: true,
      feedback
    });
  } catch (error) {
    logger.error('Failed to get user feedback', {
      error: error.message,
      userId: req.user._id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to load feedback history'
    });
  }
});

/**
 * GET /api/feedback/all
 * Get all feedback (admin only)
 */
router.get('/all', isAuthenticated, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const { status, type, priority } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (type) filter.type = type;
    if (priority) filter.priority = priority;

    const feedback = await Feedback.find(filter)
      .populate('userId', 'firstName lastName email username')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      feedback
    });
  } catch (error) {
    logger.error('Failed to get all feedback', {
      error: error.message,
      userId: req.user._id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to load feedback'
    });
  }
});

module.exports = router;
