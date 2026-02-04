// routes/tourSurvey.js - Tour and Survey API endpoints
const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');

/* ===================================
   TOUR ENDPOINTS
   =================================== */

/**
 * GET /api/user/tour-status
 * Check if user needs to see the tour
 */
router.get('/tour-status', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('tourCompleted tourDismissed');

    res.json({
      tourCompleted: user.tourCompleted || false,
      tourDismissed: user.tourDismissed || false
    });
  } catch (error) {
    console.error('Error fetching tour status:', error);
    res.status(500).json({ error: 'Failed to fetch tour status' });
  }
});

/**
 * POST /api/user/tour-complete
 * Mark tour as completed or dismissed
 */
router.post('/tour-complete', isAuthenticated, async (req, res) => {
  try {
    const { completed, dismissed } = req.body;

    const updateData = {};

    if (completed) {
      updateData.tourCompleted = true;
      updateData.tourCompletedAt = new Date();
      updateData.tourDismissed = false;
    } else if (dismissed) {
      updateData.tourDismissed = true;
      updateData.tourCompleted = false;
    }

    await User.findByIdAndUpdate(req.user._id, updateData);

    res.json({ success: true, message: 'Tour status updated' });
  } catch (error) {
    console.error('Error updating tour status:', error);
    res.status(500).json({ error: 'Failed to update tour status' });
  }
});

/* ===================================
   SURVEY ENDPOINTS
   =================================== */

/**
 * GET /api/user/survey-status
 * Check if user should see the survey
 */
router.get('/survey-status', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('sessionSurveys');

    const surveys = user.sessionSurveys || {
      enabled: true,
      frequency: 'daily',
      lastShownAt: null,
      consecutiveDismissals: 0,
      responsesCount: 0
    };

    // Find last response time
    const responses = surveys.responses || [];
    const lastResponse = responses.length > 0
      ? responses.reduce((latest, r) => r.submittedAt > latest ? r.submittedAt : latest, responses[0].submittedAt)
      : null;

    res.json({
      enabled: surveys.enabled !== false,
      frequency: surveys.frequency || 'daily',
      lastShownAt: surveys.lastShownAt,
      lastRespondedAt: lastResponse,
      responsesCount: surveys.responsesCount || responses.length,
      consecutiveDismissals: surveys.consecutiveDismissals || 0
    });
  } catch (error) {
    console.error('Error fetching survey status:', error);
    res.status(500).json({ error: 'Failed to fetch survey status' });
  }
});

/**
 * POST /api/user/survey-shown
 * Track when survey was shown to user
 */
router.post('/survey-shown', isAuthenticated, async (req, res) => {
  try {
    const { shownAt, trigger, problemsSolved, sessionDuration } = req.body;

    await User.findByIdAndUpdate(req.user._id, {
      'sessionSurveys.lastShownAt': shownAt || new Date(),
      'sessionSurveys.lastTrigger': trigger,
      'sessionSurveys.lastTriggerContext': {
        problemsSolved: problemsSolved || 0,
        sessionDuration: sessionDuration || 0,
        timestamp: new Date()
      }
    });

    res.json({ success: true, message: 'Survey shown tracked' });
  } catch (error) {
    console.error('Error tracking survey shown:', error);
    res.status(500).json({ error: 'Failed to track survey shown' });
  }
});

/**
 * POST /api/user/survey-dismissed
 * Track when user dismissed survey without completing
 */
router.post('/survey-dismissed', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('sessionSurveys');

    const consecutiveDismissals = (user.sessionSurveys?.consecutiveDismissals || 0) + 1;

    // Auto-downgrade frequency after 3 consecutive dismissals
    let frequency = user.sessionSurveys?.frequency || 'daily';
    if (consecutiveDismissals >= 3) {
      if (frequency === 'every-session') frequency = 'daily';
      else if (frequency === 'daily') frequency = 'weekly';
    }

    await User.findByIdAndUpdate(req.user._id, {
      'sessionSurveys.consecutiveDismissals': consecutiveDismissals,
      'sessionSurveys.frequency': frequency
    });

    res.json({
      success: true,
      message: 'Survey dismissal tracked',
      newFrequency: frequency
    });
  } catch (error) {
    console.error('Error tracking survey dismissal:', error);
    res.status(500).json({ error: 'Failed to track survey dismissal' });
  }
});

/**
 * POST /api/user/survey-submit
 * Submit survey response
 */
router.post('/survey-submit', isAuthenticated, async (req, res) => {
  try {
    const {
      sessionDuration,
      problemsSolved,
      rating,
      experience,
      helpfulness,
      difficulty,
      feedback,
      bugs,
      features,
      willingness,
      frequencyPreference,
      isQuickResponse
    } = req.body;

    // Validate required fields
    if (!rating) {
      return res.status(400).json({ error: 'Rating is required' });
    }

    // Create survey response object
    const surveyResponse = {
      submittedAt: new Date(),
      sessionDuration: sessionDuration || 0,
      problemsSolved: problemsSolved || 0,
      rating,
      experience,
      helpfulness,
      difficulty,
      feedback,
      bugs,
      features,
      willingness,
      isQuickResponse: isQuickResponse || false
    };

    // Update user's survey data
    const updateData = {
      $push: {
        'sessionSurveys.responses': surveyResponse
      },
      $inc: {
        'sessionSurveys.responsesCount': 1
      },
      $set: {
        'sessionSurveys.consecutiveDismissals': 0,
        'sessionSurveys.lastShownAt': new Date()
      }
    };

    // Update frequency preference if provided
    if (frequencyPreference) {
      updateData.$set['sessionSurveys.frequency'] = frequencyPreference;
    }

    await User.findByIdAndUpdate(req.user._id, updateData);

    res.json({
      success: true,
      message: 'Thank you for your feedback!',
      responseCount: (await User.findById(req.user._id).select('sessionSurveys.responsesCount')).sessionSurveys?.responsesCount || 1
    });
  } catch (error) {
    console.error('Error submitting survey:', error);
    res.status(500).json({ error: 'Failed to submit survey' });
  }
});

/**
 * GET /api/user/survey-responses
 * Get user's survey response history
 */
router.get('/survey-responses', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('sessionSurveys.responses');

    const responses = user.sessionSurveys?.responses || [];

    res.json({
      success: true,
      count: responses.length,
      responses: responses.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    });
  } catch (error) {
    console.error('Error fetching survey responses:', error);
    res.status(500).json({ error: 'Failed to fetch survey responses' });
  }
});

module.exports = router;
