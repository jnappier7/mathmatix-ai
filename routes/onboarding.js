// routes/onboarding.js — Voice-first intent capture for new users
// Stores an open-ended answer to "What brings you to Mathmatix today?"
// Used to personalize the warm response and routing on first session.

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const logger = require('../utils/logger');

const ALLOWED_CATEGORIES = [
  'student_homework',
  'student_test_prep',
  'act_sat_prep',
  'parent_support',
  'teacher_exploring',
  'general_math_help',
  'just_exploring',
  'unknown'
];

/**
 * Server-side intent classifier — keyword based.
 * Mirrors the client-side logic so anonymous answers attached after signup
 * still get a category even if the client didn't send one.
 */
function inferIntent(rawText) {
  if (!rawText || typeof rawText !== 'string') return 'unknown';
  const t = rawText.toLowerCase();

  if (/\b(teacher|teach my|my class|my students|classroom|professor|educator|i teach)\b/.test(t)) {
    return 'teacher_exploring';
  }
  if (/\b(parent|mom|dad|mother|father|my (kid|son|daughter|child|children))\b|\bhelp my (kid|son|daughter|child)\b/.test(t)) {
    return 'parent_support';
  }
  if (/\b(act\b|\bsat\b|act prep|sat prep|standardized test|admissions test)\b/.test(t)) {
    return 'act_sat_prep';
  }
  if (/\b(test|quiz|exam|final|midterm|state test|benchmark)\b/.test(t)) {
    return 'student_test_prep';
  }
  if (/\b(homework|assignment|problem set|worksheet|due tomorrow|due tonight)\b/.test(t)) {
    return 'student_homework';
  }
  if (/(bad at math|failing|struggling|confused|don'?t (get|understand)|stuck on|hate math|behind in math|rusty)/.test(t)) {
    return 'general_math_help';
  }
  if (/(check(ing)? (it|this) out|just (looking|curious|exploring|seeing|trying|browsing)|see what (this|it) is|trying it out|poke around)/.test(t)) {
    return 'just_exploring';
  }
  return 'unknown';
}

/**
 * Compute the next URL for the user after onboarding intent is captured.
 * Mirrors the post-login redirect logic in middleware/auth.js and login.js.
 */
function computeNextUrl(user) {
  const roles = (user.roles && user.roles.length > 0) ? user.roles : [user.role];

  if (user.needsProfileCompletion) return '/complete-profile.html';
  if (roles.length > 1) return '/role-picker.html';
  if (user.role === 'teacher') return '/teacher-dashboard.html';
  if (user.role === 'admin')   return '/admin-dashboard.html';
  if (user.role === 'parent')  return '/parent-dashboard.html';
  if (user.role === 'student' && !user.selectedTutorId) return '/pick-tutor.html';
  return '/chat.html';
}

/**
 * GET /api/onboarding/status
 * Authenticated only. Tells the client whether the current user has
 * completed onboarding and (if so) what their captured intent was.
 */
router.get('/status', (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    return res.json({
      authenticated: false,
      onboarding: { completed: false }
    });
  }

  const ob = req.user.onboarding || {};
  res.json({
    authenticated: true,
    onboarding: {
      completed:      !!ob.completed,
      intentText:     ob.intentText || null,
      intentCategory: ob.intentCategory || null,
      capturedVia:    ob.capturedVia || null,
      completedAt:    ob.completedAt || null
    }
  });
});

/**
 * POST /api/onboarding/intent
 * Authenticated only. Saves the user's open-ended onboarding answer.
 * Body: { intentText: string, intentCategory?: string, capturedVia?: 'voice'|'text' }
 * Returns: { success, redirect, intentCategory }
 */
router.post('/intent', async (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  try {
    const rawText = (req.body?.intentText || '').toString().trim().slice(0, 2000);
    let category = (req.body?.intentCategory || '').toString().trim();
    const capturedVia = ['voice', 'text'].includes(req.body?.capturedVia) ? req.body.capturedVia : 'text';

    // Re-infer server-side if client didn't send a valid category. The
    // client value is treated as a hint, not authoritative.
    if (!ALLOWED_CATEGORIES.includes(category)) {
      category = inferIntent(rawText);
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    user.onboarding = {
      completed:      true,
      intentText:     rawText || null,
      intentCategory: category,
      capturedVia,
      completedAt:    new Date()
    };

    await user.save();

    const redirect = computeNextUrl(user);

    logger.info('Onboarding intent captured', {
      userId: user._id.toString(),
      role: user.role,
      intentCategory: category,
      capturedVia,
      textLength: rawText.length
    });

    return res.json({
      success: true,
      intentCategory: category,
      capturedVia,
      redirect
    });
  } catch (err) {
    logger.error('Failed to save onboarding intent', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to save your answer.' });
  }
});

module.exports = router;
module.exports.inferIntent = inferIntent;
module.exports.computeNextUrl = computeNextUrl;
