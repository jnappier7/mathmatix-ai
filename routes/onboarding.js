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
 * Compute age in whole years from a Date of birth.
 * Returns null if dob is missing or invalid.
 */
function computeAge(dob) {
  if (!dob) return null;
  const d = (dob instanceof Date) ? dob : new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/**
 * Decide whether the user still needs the legacy complete-profile screen.
 * Goal: skip complete-profile whenever legally and operationally safe to do so.
 *  - Parents / teachers / admins: never required.
 *  - Adult students (18+): not required.
 *  - Teen students (13-17): not required if parental consent has been recorded
 *    OR a parent verification email has been sent (handled by the consent
 *    endpoints that the client calls separately).
 *  - Under-13 students: required to be linked to a parent (COPPA).
 */
function shouldStillBlockOnProfile(user) {
  const role = user.role;
  if (role !== 'student') return false;

  const age = computeAge(user.dateOfBirth);
  if (age === null) return true; // need DOB

  if (age >= 18) return false;
  // Under 18: parental consent required at some level.
  // hasParentalConsent is flipped by /api/student/link-to-parent and by the
  // teen consent email flow. If it's true, we can release the gate.
  if (user.hasParentalConsent) return false;
  return true;
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

  const u = req.user;
  const ob = u.onboarding || {};
  const age = computeAge(u.dateOfBirth);

  res.json({
    authenticated: true,
    role: u.role,
    firstName: u.firstName,
    selectedTutorId: u.selectedTutorId || null,
    age,
    needsDob: u.role === 'student' && age === null,
    needsParentalConsent: u.role === 'student' && age !== null && age < 18 && !u.hasParentalConsent,
    hasParentalConsent: !!u.hasParentalConsent,
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
 * Authenticated only. Saves the user's onboarding intent and (optionally)
 * a date of birth. For students, also flips needsProfileCompletion off
 * once DOB + (if needed) parental-consent prerequisites are satisfied.
 *
 * Body: {
 *   intentText:     string,
 *   intentCategory: ?string,
 *   capturedVia:    ?'voice' | 'text',
 *   dateOfBirth:    ?string (YYYY-MM-DD)
 * }
 * Returns: { success, redirect, intentCategory, age, needsDob, needsParentalConsent }
 */
router.post('/intent', async (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  try {
    const rawText = (req.body?.intentText || '').toString().trim().slice(0, 2000);
    let category = (req.body?.intentCategory || '').toString().trim();
    const capturedVia = ['voice', 'text'].includes(req.body?.capturedVia) ? req.body.capturedVia : 'text';
    const dobInput = req.body?.dateOfBirth;

    if (!ALLOWED_CATEGORIES.includes(category)) {
      category = inferIntent(rawText);
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // Optional DOB update. Reject implausible dates (in the future / >120y old).
    if (dobInput) {
      const d = new Date(dobInput);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ success: false, message: 'That birth date didn’t look right — try again.' });
      }
      const now = new Date();
      const minBirth = new Date(now.getFullYear() - 120, 0, 1);
      if (d > now || d < minBirth) {
        return res.status(400).json({ success: false, message: 'That birth date didn’t look right — try again.' });
      }
      user.dateOfBirth = d;
    }

    user.onboarding = {
      completed:      true,
      intentText:     rawText || null,
      intentCategory: category,
      capturedVia,
      completedAt:    new Date()
    };

    // For non-student roles we can release the profile-completion gate now —
    // all remaining preferences have schema defaults and are editable later.
    // For students, only release it once DOB + (if minor) parental consent
    // are in place. The minor-consent flow runs through the existing
    // /api/student/link-to-parent and /api/consent/request-parent-email
    // endpoints, which the onboarding page calls directly.
    if (user.needsProfileCompletion && !shouldStillBlockOnProfile(user)) {
      user.needsProfileCompletion = false;
    }

    await user.save();

    const age = computeAge(user.dateOfBirth);
    const needsDob = user.role === 'student' && age === null;
    const needsParentalConsent = user.role === 'student' && age !== null && age < 18 && !user.hasParentalConsent;
    const redirect = computeNextUrl(user);

    logger.info('Onboarding intent captured', {
      userId: user._id.toString(),
      role: user.role,
      intentCategory: category,
      capturedVia,
      textLength: rawText.length,
      profileGateCleared: !user.needsProfileCompletion,
      needsDob,
      needsParentalConsent
    });

    return res.json({
      success: true,
      intentCategory: category,
      capturedVia,
      age,
      needsDob,
      needsParentalConsent,
      needsProfileCompletion: !!user.needsProfileCompletion,
      redirect
    });
  } catch (err) {
    logger.error('Failed to save onboarding intent', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to save your answer.' });
  }
});

/**
 * POST /api/onboarding/finalize
 * Authenticated only. Called after the student finishes inline DOB and
 * (if needed) parent-consent steps so the server can re-check the gate and
 * report the final redirect URL. Idempotent.
 */
router.post('/finalize', async (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (user.needsProfileCompletion && !shouldStillBlockOnProfile(user)) {
      user.needsProfileCompletion = false;
      await user.save();
    }

    return res.json({
      success: true,
      needsProfileCompletion: !!user.needsProfileCompletion,
      redirect: computeNextUrl(user)
    });
  } catch (err) {
    logger.error('Failed to finalize onboarding', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to finalize onboarding.' });
  }
});

module.exports = router;
module.exports.inferIntent = inferIntent;
module.exports.computeNextUrl = computeNextUrl;
module.exports.computeAge = computeAge;
module.exports.shouldStillBlockOnProfile = shouldStillBlockOnProfile;
