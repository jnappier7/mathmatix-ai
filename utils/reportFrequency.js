// utils/reportFrequency.js
//
// The parent progress-report cadence (`user.reportFrequency`), as pure functions
// so the digest cron (scripts/weeklyDigest.js) and the send-now route
// (routes/email.js) agree on what each setting means.
//
//   daily    — every day the cron runs, 1-day window
//   weekly   — Sundays, 7-day window
//   biweekly — Sundays, at least 13 days after the last report sent, 14-day window
//   monthly  — the 1st of the month, 30-day window
//   never    — off; no scheduled reports (send-now still works)
//
// "Last report sent" is `user.lastWeeklyReportSentAt` (the name predates the
// other cadences). It is stamped only when at least one report actually went
// out, so a biweekly parent whose child was inactive on a send day gets the next
// report on the next Sunday — never sooner than 13 days after the previous one.
// The 13-day (not 14) floor absorbs cron start-time drift on the same weekday.
//
// Day-of-week / day-of-month use the server's local clock, as the cron always has
// (UTC on Render).

const REPORT_FREQUENCIES = Object.freeze(['daily', 'weekly', 'biweekly', 'monthly', 'never']);
const DEFAULT_FREQUENCY = 'weekly';

const DAY_MS = 24 * 60 * 60 * 1000;
// Same-day duplicate guard (cron retry / double run). Applies to every cadence.
const DEDUP_WINDOW_MS = 20 * 60 * 60 * 1000;

const WINDOW_DAYS = Object.freeze({ daily: 1, weekly: 7, biweekly: 14, monthly: 30 });
// Minimum gap since the last report, beyond the same-day dedup guard.
const MIN_GAP_MS = Object.freeze({
  daily: DEDUP_WINDOW_MS,
  weekly: 6 * DAY_MS,
  biweekly: 13 * DAY_MS,
  monthly: 27 * DAY_MS,
});

function normalizeFrequency(frequency) {
  return REPORT_FREQUENCIES.includes(frequency) ? frequency : DEFAULT_FREQUENCY;
}

/** Days of activity a report for this cadence should cover. */
function windowDaysFor(frequency) {
  const f = normalizeFrequency(frequency);
  return WINDOW_DAYS[f] || WINDOW_DAYS[DEFAULT_FREQUENCY];
}

/**
 * Should a scheduled report go out now?
 * @param {string} frequency  user.reportFrequency (unknown/missing → weekly)
 * @param {Date}   now
 * @param {Date|string|null} lastSentAt  user.lastWeeklyReportSentAt
 */
function shouldSendDigest(frequency, now = new Date(), lastSentAt = null) {
  const f = normalizeFrequency(frequency);
  if (f === 'never') return false;

  const day = now.getDay();       // 0 = Sunday
  const date = now.getDate();
  let onSchedule;
  switch (f) {
    case 'daily': onSchedule = true; break;
    case 'weekly':
    case 'biweekly': onSchedule = day === 0; break;
    case 'monthly': onSchedule = date === 1; break;
    default: onSchedule = false;
  }
  if (!onSchedule) return false;

  if (lastSentAt) {
    const last = new Date(lastSentAt).getTime();
    if (Number.isFinite(last)) {
      const elapsed = now.getTime() - last;
      if (elapsed < Math.max(DEDUP_WINDOW_MS, MIN_GAP_MS[f] || 0)) return false;
    }
  }
  return true;
}

/** Wording for the report period, used in the email subject/body and insights. */
function periodFor(frequency) {
  switch (normalizeFrequency(frequency)) {
    case 'daily': return { days: 1, title: 'Daily', phrase: 'today' };
    case 'biweekly': return { days: 14, title: 'Biweekly', phrase: 'over the past two weeks' };
    case 'monthly': return { days: 30, title: 'Monthly', phrase: 'this month' };
    default: return { days: 7, title: 'Weekly', phrase: 'this week' };
  }
}

module.exports = {
  REPORT_FREQUENCIES,
  DEFAULT_FREQUENCY,
  DEDUP_WINDOW_MS,
  normalizeFrequency,
  windowDaysFor,
  shouldSendDigest,
  periodFor,
};
