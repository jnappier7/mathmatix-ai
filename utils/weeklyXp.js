/**
 * Weekly XP — the leaderboard's scoring period.
 *
 * One shared week for everyone on a board: Monday 00:00 America/New_York
 * (owner decision, 2026-10-15). A week is keyed by its Monday's local date,
 * "2026-10-12", and user.weeklyXp maps week → points, so an atomic
 * `$inc: { 'weeklyXp.2026-10-12': n }` needs no reset logic and last week's
 * total stays readable.
 *
 * Why a counter and not xpHistory: xpHistory is written by exactly one path
 * (course lessons). In prod it covered 3 of 242 students and 0.3% of all XP,
 * newest event 2026-05-13 — chat XP was never timestamped, so a week could not
 * be reconstructed from it.
 *
 * Capture is in models/user.js hooks (any increase in the cumulative `xp`
 * counts), so the ~17 call sites that award XP need no changes. All XP counts,
 * including participation (owner decision).
 */

const WEEK_TZ = 'America/New_York';
const KEEP_WEEKS = 8;

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: WEEK_TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
});
const DOW = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function etParts(date) {
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, dow: DOW[p.weekday] };
}

/** "YYYY-MM-DD" of the Eastern-time Monday that starts `date`'s week. */
function weekKey(date = new Date()) {
  const { y, m, d, dow } = etParts(date);
  const monday = new Date(Date.UTC(y, m - 1, d - dow));   // calendar arithmetic only
  return monday.toISOString().slice(0, 10);
}

/** The week before `key`. */
function previousWeekKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10);
}

/** Path for a Mongo query / $inc on this week's points. */
function weekPath(key = weekKey()) {
  return `weeklyXp.${key}`;
}

/** Points a user (doc or lean) earned in week `key`. */
function pointsFor(user, key = weekKey()) {
  const m = user && user.weeklyXp;
  if (!m) return 0;
  const v = typeof m.get === 'function' ? m.get(key) : m[key];
  return Number(v) || 0;
}

/** Drop weeks older than KEEP_WEEKS from a Mongoose Map, in place. */
function pruneOldWeeks(map, now = new Date()) {
  if (!map || typeof map.keys !== 'function') return;
  let cutoff = weekKey(now);
  for (let i = 0; i < KEEP_WEEKS - 1; i++) cutoff = previousWeekKey(cutoff);
  for (const k of [...map.keys()]) if (k < cutoff) map.delete(k);
}

module.exports = { WEEK_TZ, KEEP_WEEKS, weekKey, previousWeekKey, weekPath, pointsFor, pruneOldWeeks };
