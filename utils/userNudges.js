/**
 * USER NUDGES — system-driven prompts that re-surface when the user has
 * something important to do (take the screener, complete a growth check).
 *
 * Pure function. Takes a user document, returns an array of nudges. The
 * client (dashboard banner, login response, etc.) decides what to render.
 *
 * Design contract:
 * - Idempotent: calling computeNudges() twice in a row returns the same set.
 * - Stateless: writing happens in the dismiss endpoint, not here.
 * - Severity escalation gives the UI room to render the same nudge type
 *   differently (subtle banner → modal → autoLaunch) without a schema change.
 *
 * @module utils/userNudges
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// How long after a dismissal we stay quiet about the same nudge type.
const SNOOZE_DAYS = 3;

// How long after the FIRST chat-greeting offer we'll re-prompt the screener
// if the user never acted on it.
const SCREENER_REOFFER_DAYS = 7;

// Days-past-due at which a growth-check nudge escalates from `recommended`
// → `due` → `overdue`. `overdue` ignores the snooze and sets autoLaunch.
const GROWTH_CHECK_DUE_DAYS = 3;
const GROWTH_CHECK_OVERDUE_DAYS = 7;

const NUDGE_TYPES = Object.freeze({
  STARTING_POINT: 'starting-point',
  GROWTH_CHECK: 'growth-check',
});

/**
 * @typedef {Object} Nudge
 * @property {string} type - One of NUDGE_TYPES values
 * @property {'recommended'|'due'|'overdue'} severity
 * @property {string} title - Short banner heading
 * @property {string} message - One-sentence student-facing copy
 * @property {Object} action
 * @property {string} action.label - Button text
 * @property {string} action.href  - Where the action button leads
 * @property {boolean} dismissible - Whether the UI can offer a close button
 * @property {boolean} autoLaunch  - Whether the UI should open the action immediately
 * @property {Object} meta - Diagnostic fields the UI doesn't need to render
 */

function daysSince(date, now) {
  if (!date) return Infinity;
  return (now.getTime() - new Date(date).getTime()) / DAY_MS;
}

/**
 * Is this nudge currently snoozed?
 *
 * Prefers an explicit snoozedUntil timestamp (set by either dismiss or
 * snooze endpoints). Falls back to `dismissedAt + SNOOZE_DAYS` for users
 * whose state was written before snoozedUntil existed on the schema.
 */
function snoozeActive(state, now, days = SNOOZE_DAYS) {
  if (!state) return false;
  if (state.snoozedUntil && new Date(state.snoozedUntil).getTime() > now.getTime()) {
    return true;
  }
  return daysSince(state.dismissedAt, now) < days;
}

function buildStartingPointNudge(user, now) {
  if (user.assessmentCompleted || user.learningProfile?.assessmentCompleted) {
    return null;
  }

  const offered = !!user.startingPointOffered;
  const offeredAt = user.startingPointOfferedAt;

  // Quiet period after a dismissal — don't re-prompt during the cooldown.
  if (snoozeActive(user.nudgeState?.screener, now)) return null;

  // If we've never offered, or it's been long enough since the first offer,
  // surface the nudge. The chat greeting handles the very first offer in
  // its own surface; this nudge re-engages users who never responded.
  if (!offered || daysSince(offeredAt, now) >= SCREENER_REOFFER_DAYS) {
    return {
      type: NUDGE_TYPES.STARTING_POINT,
      severity: 'recommended',
      title: 'Take your Starting Point',
      message: "Take a 10-minute Starting Point so I can teach you at the right level.",
      action: {
        label: 'Start now',
        href: '/screener.html',
      },
      dismissible: true,
      autoLaunch: false,
      meta: {
        offeredBefore: offered,
        daysSinceOffer: offered ? Math.floor(daysSince(offeredAt, now)) : null,
        dismissCount: user.nudgeState?.screener?.dismissCount || 0,
      },
    };
  }

  return null;
}

function buildGrowthCheckNudge(user, now) {
  // Only relevant once a baseline assessment exists.
  const hasBaseline = user.assessmentCompleted || user.learningProfile?.assessmentCompleted;
  if (!hasBaseline) return null;

  const dueDate = user.nextGrowthCheckDue;
  if (!dueDate) return null;

  const daysPastDue = (now.getTime() - new Date(dueDate).getTime()) / DAY_MS;
  if (daysPastDue < 0) return null; // Not due yet

  let severity = 'recommended';
  if (daysPastDue >= GROWTH_CHECK_OVERDUE_DAYS) severity = 'overdue';
  else if (daysPastDue >= GROWTH_CHECK_DUE_DAYS) severity = 'due';

  // At `overdue`, the regular 3-day snooze is bypassed — we keep surfacing
  // it every session. But a short "Skip for today" snooze (snoozedUntil
  // explicitly set in the near future) IS still honored, so a user who
  // genuinely needs to do something else first isn't trapped.
  const state = user.nudgeState?.growthCheck;
  if (severity === 'overdue') {
    if (state?.snoozedUntil && new Date(state.snoozedUntil).getTime() > now.getTime()) {
      return null;
    }
  } else if (snoozeActive(state, now)) {
    return null;
  }

  const isOverdue = severity === 'overdue';
  return {
    type: NUDGE_TYPES.GROWTH_CHECK,
    severity,
    title: isOverdue ? "Let's check your growth" : "Time for a growth check",
    message: isOverdue
      ? "It's been over 3 months since your last check. A quick 5-minute Growth Check keeps your learning plan accurate."
      : "It's been 3 months — let's see how much you've grown. About 5 minutes.",
    action: {
      label: isOverdue ? 'Start now' : 'Start growth check',
      href: '/screener.html?mode=growth-check',
    },
    dismissible: !isOverdue,
    // At overdue, ask the UI to surface this front-and-center. The
    // dashboard still owns the actual UX choice (modal vs. banner) — we
    // just signal intent.
    autoLaunch: isOverdue,
    meta: {
      dueDate,
      daysPastDue: Math.floor(daysPastDue),
      dismissCount: user.nudgeState?.growthCheck?.dismissCount || 0,
    },
  };
}

/**
 * Compute the nudges a given user should see right now.
 *
 * @param {Object} user - Mongoose user document (or plain object with the same fields)
 * @param {Object} [opts]
 * @param {Date}   [opts.now=new Date()] - Override for tests
 * @returns {Nudge[]} 0 or more nudges, ordered with most urgent first
 */
function computeNudges(user, opts = {}) {
  if (!user) return [];
  const now = opts.now || new Date();

  const nudges = [
    buildGrowthCheckNudge(user, now),
    buildStartingPointNudge(user, now),
  ].filter(Boolean);

  // Order: overdue → due → recommended
  const order = { overdue: 0, due: 1, recommended: 2 };
  nudges.sort((a, b) => order[a.severity] - order[b.severity]);

  return nudges;
}

module.exports = {
  computeNudges,
  NUDGE_TYPES,
  // Exported for tests and the dismiss route handler.
  SNOOZE_DAYS,
  SCREENER_REOFFER_DAYS,
  GROWTH_CHECK_DUE_DAYS,
  GROWTH_CHECK_OVERDUE_DAYS,
};
