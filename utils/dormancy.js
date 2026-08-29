/* ============================================================
   utils/dormancy.js — who is engaged-but-dormant, in one place.

   The reactivation campaign (scripts/reactivationCampaign.js) and the admin
   dormancy summary (GET /api/admin/dormancy-summary) must agree on what
   "engaged but dormant" means, or the number on the dashboard quietly stops
   describing the students the campaign would actually email. Both consume
   this module; neither defines its own filter.

   "Engaged" = accumulated at least MIN_MINUTES of real tutoring — a student
   who bounced off signup is churned acquisition, not a dormant learner, and
   emailing them is spam. "Dormant" = no login in DORMANT_DAYS (or never).
   ============================================================ */

const { withRole } = require('./roleQuery');

// Defaults shared with the campaign's env-tunable values.
const MIN_MINUTES = 5;
const DORMANT_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Mongo filter matching engaged-but-dormant students.
 *
 * Uses roleQuery.withRole (never a bare `role` match — multi-role accounts
 * vanish from bare-role queries, the repo's documented gotcha) and carries its
 * own `$or`, which withRole folds under `$and` safely.
 *
 * @param {object} [opts]  { minMinutes, dormantDays, now }
 * @returns {object} Mongo filter.
 */
function engagedDormantFilter(opts = {}) {
  const minMinutes = opts.minMinutes ?? MIN_MINUTES;
  const dormantDays = opts.dormantDays ?? DORMANT_DAYS;
  const now = opts.now ? new Date(opts.now) : new Date();
  const dormantCutoff = new Date(now.getTime() - dormantDays * DAY_MS);

  return withRole({
    totalActiveTutoringMinutes: { $gte: minMinutes },
    $or: [{ lastLogin: { $lt: dormantCutoff } }, { lastLogin: null }],
  }, 'student');
}

/**
 * Reduce engaged-but-dormant rows to the aggregate the dashboard shows.
 *
 * Aggregate-only on purpose: the summary is a count for a stat tile, not a
 * student listing, so it carries no per-student rows and therefore no student
 * PII. The actual send-list (names, addresses) stays with the campaign
 * script, which prints it to whoever runs it.
 *
 * @param {object[]} students  Lean rows: { lastLogin, parentIds, lastReactivationAt }.
 * @param {object}   [opts]    { dormantDays, resendGuardDays, now }
 * @returns {object}
 */
function summarizeDormancy(students = [], opts = {}) {
  const dormantDays = opts.dormantDays ?? DORMANT_DAYS;
  const resendGuardDays = opts.resendGuardDays ?? 14;
  const now = opts.now ? new Date(opts.now) : new Date();
  const resendCutoff = new Date(now.getTime() - resendGuardDays * DAY_MS);

  // Buckets by how long the student has been gone. "never" means no recorded
  // login at all — usually a rostered account that predates login tracking.
  const buckets = { d14to30: 0, d30to90: 0, d90plus: 0, never: 0 };
  let withLinkedParent = 0;
  let emailableToday = 0;

  for (const s of students) {
    if (!s.lastLogin) {
      buckets.never += 1;
    } else {
      const daysGone = (now - new Date(s.lastLogin)) / DAY_MS;
      if (daysGone >= 90) buckets.d90plus += 1;
      else if (daysGone >= 30) buckets.d30to90 += 1;
      else buckets.d14to30 += 1;
    }

    const hasParent = Array.isArray(s.parentIds) && s.parentIds.length > 0;
    if (hasParent) withLinkedParent += 1;

    // Who the campaign would actually email if it ran right now: a linked
    // parent exists AND the per-student resend guard has lapsed.
    const guardOk = !s.lastReactivationAt || new Date(s.lastReactivationAt) < resendCutoff;
    if (hasParent && guardOk) emailableToday += 1;
  }

  return {
    total: students.length,
    buckets,
    withLinkedParent,
    emailableToday,
    thresholds: { minMinutes: opts.minMinutes ?? MIN_MINUTES, dormantDays, resendGuardDays },
  };
}

module.exports = { engagedDormantFilter, summarizeDormancy, MIN_MINUTES, DORMANT_DAYS };
