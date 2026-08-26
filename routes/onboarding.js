// routes/onboarding.js — Voice-first intent capture for new users
// Stores an open-ended answer to "What brings you to Mathmatix today?"
// Used to personalize the warm response and routing on first session.

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const logger = require('../utils/logger');
const { userHasRole, rolesOf } = require('../utils/roleQuery');

const { inferIntent, intentFromChoices } = require('../utils/onboardingIntent');
const { recordClassification } = require('../utils/intentMetrics');
const { COPPA_AGE } = require('../utils/consentManager');
const { parseDateOfBirth } = require('../utils/dob');

/**
 * The two consent gates a student can still owe, split by COPPA semantics:
 *  - needsParentalConsent — under 13: verifiable PARENTAL consent is a legal
 *    requirement (invite-code link to a parent account).
 *  - needsSelfConsent — 13-17: COPPA does not require parental consent; the
 *    student self-certifies (POST /api/consent/grant/self), with parent
 *    email/link kept as optional extras.
 * Both derive from hasParentalConsent because every grant pathway (parent,
 * school DPA, self) sets that legacy flag alongside privacyConsent.
 */
function consentFlagsFor(user, age) {
  // Roles HELD, not `role` — the dashboard the account currently has open
  // (CLAUDE.md §12). This is a COPPA determination about who the account IS,
  // and it fails OPEN: an account that stops reading as a student produces
  // needsParentalConsent:false and needsSelfConsent:false, so the onboarding
  // page simply asks for nothing. A minor who also holds parent walked past
  // the consent step by switching dashboards.
  const isStudent = userHasRole(user, 'student');
  const unconsented = isStudent && age !== null && !user.hasParentalConsent;
  return {
    needsParentalConsent: unconsented && age < COPPA_AGE,
    needsSelfConsent: unconsented && age >= COPPA_AGE && age < 18,
  };
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
  // Same COPPA determination, same fail-open direction, and this one has teeth:
  // returning false here CLEARS user.needsProfileCompletion, releasing the
  // account past the DOB and parental-consent gate for good. Roles held, not
  // the active dashboard (CLAUDE.md §12).
  if (!userHasRole(user, 'student')) return false;

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
  const roles = rolesOf(user);

  if (user.needsProfileCompletion) return '/complete-profile.html';
  if (roles.length > 1) return '/role-picker.html';
  // `user.role` — the ACTIVE role — is deliberate from here down: this is
  // acting-user dashboard routing, the one job CLAUDE.md §12 keeps `role` for,
  // and multi-role accounts never reach it (role-picker above).
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
    needsDob: userHasRole(u, 'student') && age === null,
    ...consentFlagsFor(u, age),
    hasParentalConsent: !!u.hasParentalConsent,
    onboarding: {
      completed:      !!ob.completed,
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
 *   who:            ?'my_child' | 'me' | 'my_students'   (structured, preferred)
 *   goal:           ?'homework' | 'missing_skills' | 'test_prep' | 'act_sat'
 *                   | 'accommodations' | 'not_sure'
 *   intentText:     ?string (free text; classified server-side, not stored),
 *   capturedVia:    ?'voice' | 'text' | 'choice',
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
    const capturedVia = ['voice', 'text', 'choice'].includes(req.body?.capturedVia)
      ? req.body.capturedVia
      : 'text';
    const dobInput = req.body?.dateOfBirth;

    // Classified here and only here. The client used to send its own category
    // (from a duplicate copy of these rules) and the server took it on trust,
    // so a caller could name any enum value regardless of what they typed.
    // That still holds for the structured questions the page now leads with:
    // the body carries WHICH OPTIONS a human picked, never a category, and
    // intentFromChoices validates both against their whitelists here.
    //
    // Structured wins when present — two closed answers are unambiguous, where
    // free text has to be guessed at. Free text remains the fallback for
    // "say it in your own words" and for the anonymous localStorage replay.
    const category = intentFromChoices(req.body?.who, req.body?.goal)
      ?? inferIntent(rawText);
    recordClassification({ category, capturedVia, textLength: rawText.length });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // Optional DOB update via the shared validator (utils/dob.js) — same
    // rules as signup and /api/user/settings, and write-once like them:
    // only sets when absent, so a re-visit can't overwrite a recorded DOB.
    if (dobInput && !user.dateOfBirth) {
      const parsed = parseDateOfBirth(dobInput);
      if (parsed.error) {
        return res.status(400).json({ success: false, message: parsed.error });
      }
      user.dateOfBirth = parsed.date;
    }

    // intentText is deliberately NOT persisted. It was stored for months and
    // read by nothing; it is up to 2000 characters of free-form voice input
    // from a minor, and keeping data we never look at is a minimisation
    // problem rather than a tidiness one. The classification it produces is
    // kept — that is the part with a consumer.
    user.onboarding = {
      completed:      true,
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
    const needsDob = userHasRole(user, 'student') && age === null;
    const { needsParentalConsent, needsSelfConsent } = consentFlagsFor(user, age);
    const redirect = computeNextUrl(user);

    logger.info('Onboarding intent captured', {
      userId: user._id.toString(),
      role: user.role,
      intentCategory: category,
      capturedVia,
      structured: capturedVia === 'choice',
      textLength: rawText.length,
      profileGateCleared: !user.needsProfileCompletion,
      needsDob,
      needsParentalConsent,
      needsSelfConsent
    });

    return res.json({
      success: true,
      intentCategory: category,
      capturedVia,
      age,
      needsDob,
      needsParentalConsent,
      needsSelfConsent,
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
module.exports.computeNextUrl = computeNextUrl;
module.exports.computeAge = computeAge;
module.exports.shouldStillBlockOnProfile = shouldStillBlockOnProfile;
module.exports.consentFlagsFor = consentFlagsFor;
