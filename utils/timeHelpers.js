/**
 * Time helpers for streak day-boundary math.
 *
 * The Mathmatix streak counter advances by "calendar days" — but
 * "calendar day" only has meaning relative to a timezone. Computing
 * day boundaries in UTC (or in the server's local TZ) breaks for
 * students whose local day boundary doesn't line up with the server:
 *
 *   - 11:30pm PT Mon → 7:30am UTC Tue (server thinks Tue)
 *   - 11:30pm PT Tue → 7:30am UTC Wed (server thinks Wed)
 *   - From the server's view, two consecutive UTC days = streak advances
 *
 *   But:
 *   - 9:00am PT Mon → 5:00pm UTC Mon (server: Mon)
 *   - 11:30pm PT Mon → 7:30am UTC Tue (server: Tue)
 *   - Same calendar day in PT, but server counts as two days
 *     → on the second session, the streak quietly INCREMENTS again
 *
 * Computing day keys in the user's IANA timezone fixes both directions.
 *
 * @module utils/timeHelpers
 */

const DEFAULT_TZ = 'UTC';

/**
 * Return the calendar day in the given timezone as a "YYYY-MM-DD" string.
 * Uses Intl.DateTimeFormat (en-CA is the only widely-supported locale
 * that emits ISO-style YYYY-MM-DD).
 *
 * @param {Date|number} date - JS Date or epoch ms
 * @param {string} [tz] - IANA timezone (default 'UTC'); falls back to UTC if invalid
 * @returns {string} "YYYY-MM-DD"
 */
function localDayKey(date, tz = DEFAULT_TZ) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || DEFAULT_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch (_) {
    // Invalid tz string — fall back to UTC rather than throw
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: DEFAULT_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }
}

/**
 * Whole calendar days between two YYYY-MM-DD strings. DST-safe because
 * Date.UTC() ignores DST entirely — we're comparing midnights of calendar
 * days, not actual elapsed time.
 *
 * @param {string} keyA - earlier day, "YYYY-MM-DD"
 * @param {string} keyB - later day, "YYYY-MM-DD"
 * @returns {number} integer day count (keyB - keyA); negative if keyB is earlier
 */
function daysBetween(keyA, keyB) {
  if (!keyA || !keyB) return NaN;
  const [yA, mA, dA] = keyA.split('-').map(Number);
  const [yB, mB, dB] = keyB.split('-').map(Number);
  if ([yA, mA, dA, yB, mB, dB].some(n => !Number.isFinite(n))) return NaN;

  const utcA = Date.UTC(yA, mA - 1, dA);
  const utcB = Date.UTC(yB, mB - 1, dB);
  return Math.round((utcB - utcA) / 86400000);
}

/**
 * Convenience: how many calendar days between two Date instances in the
 * given timezone. Equivalent to daysBetween(localDayKey(a, tz), localDayKey(b, tz)).
 */
function daysBetweenDates(a, b, tz = DEFAULT_TZ) {
  return daysBetween(localDayKey(a, tz), localDayKey(b, tz));
}

module.exports = {
  localDayKey,
  daysBetween,
  daysBetweenDates,
  DEFAULT_TZ,
};
