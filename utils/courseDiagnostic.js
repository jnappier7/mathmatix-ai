/**
 * COURSE DIAGNOSTIC — the one definition of "what baseline does this course open
 * with, and has the student done it yet?"
 *
 * Extracted from routes/courseSession.js so the SERVER greeting path
 * (routes/courseChat.js) can consult the same rule. The frontend gate (hold the
 * tutor greeting until a required baseline is done) is only as good as the
 * frontend loading correctly — and production has shown a chat bundle 404 and
 * stale builds. So the greeting must be refused server-side too, where no missing
 * script or second tab can leak a premature "let's learn about real numbers".
 *
 * ONE definition, shared: the diagnostic-card endpoints and the greeting gate
 * must never disagree about whether a baseline is pending — that drift is the
 * exact bug class this codebase keeps hitting.
 */

const CourseSession = require('../models/courseSession');
const ActTestSession = require('../models/actTestSession');

const STARTING_POINT_CARD = {
  type: 'starting-point',
  title: 'Find your Starting Point',
  body: 'Take a short adaptive placement first — no studying needed. Your tutor uses it to '
    + 'start you at exactly the right level and focus each session on what you actually need.',
  cta: 'Take the Starting Point',
};

const PRE_ASSESSMENT_CARD = {
  type: 'course-preassessment',
  title: 'Start with a quick check',
  body: 'Answer a few questions first so this course can skip what you already know '
    + 'and spend its time on what you actually need. Anything you get right is marked '
    + 'as yours — you will not be taught it again.',
  cta: 'Start the check',
};

const COURSE_DIAGNOSTICS = {
  'act-prep': {
    type: 'act-practice',
    title: 'Start with a full Practice ACT',
    body: 'Take a timed practice ACT Math test first — this is your baseline. Your tutor uses '
      + 'the results to pinpoint exactly which skills to focus your bootcamp on, and anything '
      + 'you already ace is marked as yours so the bootcamp skips it.',
    cta: 'Take the Practice ACT',
    // ACT prep BEGINS with a full timed baseline. The scaled score is the number
    // the student is trying to move, so a partial substitute gives them nothing
    // to measure against.
    required: true,
  },
  'algebra-1': STARTING_POINT_CARD,
  'algebra-2': STARTING_POINT_CARD,
  'ap-calculus-ab': STARTING_POINT_CARD,
  'calculus-bc': STARTING_POINT_CARD,
  'precalculus': STARTING_POINT_CARD,
};

/**
 * The diagnostic card a course should show on entry, or null if the student has
 * already satisfied it. Default (not an allowlist): a course with no explicit
 * entry gets the course pre-assessment, so no course opens with no diagnostic.
 */
async function buildCourseDiagnostic(user, courseId) {
  const card = COURSE_DIAGNOSTICS[courseId] || PRE_ASSESSMENT_CARD;
  if (!card || !user) return null;

  if (card.type === 'course-preassessment') {
    try {
      const done = await CourseSession.countDocuments({
        userId: user._id, courseId, preAssessmentCompletedAt: { $ne: null }
      });
      if (done > 0) return null;
    } catch (err) {
      console.error('[courseDiagnostic] pre-assessment check failed (non-fatal):', err.message);
      return null;
    }
    return { type: card.type, title: card.title, body: card.body, cta: card.cta, courseId, required: true };
  }

  try {
    if (card.type === 'act-practice') {
      const taken = await ActTestSession.countDocuments({ userId: user._id, status: 'completed' });
      if (taken > 0) return null;                 // already took a practice ACT
    } else if (card.type === 'starting-point') {
      const expired = user.assessmentExpiresAt && new Date(user.assessmentExpiresAt) < new Date();
      if (user.assessmentCompleted && !expired) return null; // already placed (and current)
    }
  } catch (err) {
    console.error('[courseDiagnostic] diagnostic check failed (non-fatal):', err.message);
    return null;
  }

  return {
    type: card.type, title: card.title, body: card.body, cta: card.cta,
    required: !!card.required
  };
}

/**
 * Is a REQUIRED baseline still pending for this course? The server greeting path
 * uses this to refuse teaching until the baseline is done.
 */
async function isRequiredBaselinePending(user, courseId) {
  const diagnostic = await buildCourseDiagnostic(user, courseId);
  return { pending: !!(diagnostic && diagnostic.required), diagnostic };
}

module.exports = {
  STARTING_POINT_CARD,
  PRE_ASSESSMENT_CARD,
  COURSE_DIAGNOSTICS,
  buildCourseDiagnostic,
  isRequiredBaselinePending,
};
