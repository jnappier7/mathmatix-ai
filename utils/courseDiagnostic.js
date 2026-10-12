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
 * ONE definition, shared: the diagnostic-card endpoints, the greeting gate and
 * the every-turn teaching gate must never disagree about whether a baseline is
 * pending — that drift is the exact bug class this codebase keeps hitting, and
 * it is what broke the Consumer Math / Financial Literacy course. See
 * BLOCKING_DIAGNOSTIC_TYPES below for the rule they now all read.
 */

const CourseSession = require('../models/courseSession');
const ActTestSession = require('../models/actTestSession');

// Which diagnostics may HOLD the tutor, as opposed to merely nudging.
//
// A card is `required` when the course wants the student to take it. That is NOT
// the same as being allowed to stop the lesson from ever starting: only the ACT
// practice runner is verified working end to end, so only it may block. Every
// other course's baseline shows its card and the lesson starts anyway.
//
// This set exists because the two gates had drifted apart. routes/chat.js
// (typing inside a course) had already narrowed itself to 'act-practice' in
// code, while the greeting gate in routes/courseChat.js and the client gate in
// courseCatalog.js still blocked on `required`. Every course NOT listed in
// COURSE_DIAGNOSTICS below falls through to the required PRE_ASSESSMENT_CARD —
// consumer-math, 6th/7th/8th grade, geometry, early-math-foundations, the parent
// guides — so those courses opened with their greeting withheld but their
// teaching ungated. The student got a modal and silence where the lesson should
// have been, and the free-chat opener ("what do you want to work on today?")
// filled the gap. One rule, one place: widen this set only when a diagnostic's
// runner is confirmed working end to end.
// 'sat-practice' joined 2026-10-12: the SAT runner (adaptive modules, grid-ins,
// Desmos), its auto-open on the gate (courseCatalog.js), the sat-prep loop card
// (lessonTracker.js) and the retest launch were all verified end to end.
const BLOCKING_DIAGNOSTIC_TYPES = new Set(['act-practice', 'sat-practice']);

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
  'sat-prep': {
    type: 'sat-practice',
    title: 'Start with a full practice SAT',
    body: 'Take a timed, adaptive practice SAT Math section first — this is your baseline. Your tutor '
      + 'uses the results to walk you through every question you missed, then you retest with '
      + 'all-new questions and watch your score move.',
    cta: 'Take the practice SAT',
    // Like ACT prep, the score is the number the student is trying to move,
    // so the bootcamp starts from a full timed baseline.
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
    return {
      type: card.type, title: card.title, body: card.body, cta: card.cta, courseId,
      required: true,
      blocking: BLOCKING_DIAGNOSTIC_TYPES.has(card.type),
    };
  }

  try {
    if (card.type === 'act-practice' || card.type === 'sat-practice') {
      // That exam's own test: a completed SAT is not an ACT baseline (or the
      // reverse) — each prep course measures from its own test.
      const { getTestDef, testScope } = require('./practiceTests');
      const def = getTestDef(card.type === 'sat-practice' ? 'sat-math' : 'act-math');
      const taken = await ActTestSession.countDocuments({ userId: user._id, status: 'completed', ...testScope(def) });
      if (taken > 0) return null;                 // already took this exam's practice test
    } else if (card.type === 'starting-point') {
      const expired = user.assessmentExpiresAt && new Date(user.assessmentExpiresAt) < new Date();
      if (user.assessmentCompleted && !expired) return null; // already placed (and current)
    }
  } catch (err) {
    console.error('[courseDiagnostic] diagnostic check failed (non-fatal):', err.message);
    return null;
  }

  const required = !!card.required;
  return {
    type: card.type, title: card.title, body: card.body, cta: card.cta,
    required,
    // Required AND verified end to end — see BLOCKING_DIAGNOSTIC_TYPES.
    blocking: required && BLOCKING_DIAGNOSTIC_TYPES.has(card.type),
  };
}

/**
 * Is a BLOCKING baseline still pending for this course? Both server gates — the
 * greeting path (routes/courseChat.js) and the every-turn teaching gate
 * (routes/chat.js) — use this, so they can no longer disagree about whether a
 * course is allowed to start.
 *
 * `pending` answers "must the tutor stay silent?", which is narrower than "does
 * this course have a baseline the student still owes us". The diagnostic itself
 * is returned either way so the caller can still surface the card as a nudge.
 */
async function isRequiredBaselinePending(user, courseId) {
  const diagnostic = await buildCourseDiagnostic(user, courseId);
  return { pending: !!(diagnostic && diagnostic.blocking), diagnostic };
}

module.exports = {
  BLOCKING_DIAGNOSTIC_TYPES,
  STARTING_POINT_CARD,
  PRE_ASSESSMENT_CARD,
  COURSE_DIAGNOSTICS,
  buildCourseDiagnostic,
  isRequiredBaselinePending,
};
