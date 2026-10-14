/**
 * A practice test finished in under a quarter of its time limit is not a
 * reliable estimate of anything (QA on prod, 2026-10-13: results showed a
 * confident score after 2–6 minutes of a 70-minute test).
 *
 * The runner shows such a score as "Not a reliable estimate — you finished
 * in N minutes", and anything that averages scores (the teacher Test Prep
 * view) must leave rushed attempts out. One rule, one place.
 */
const RUSHED_FRACTION = 0.25;

/**
 * @param {number|null} durationMs   time from section start to submit
 * @param {number|null} limitMinutes the whole section's time limit
 * @returns {boolean}
 */
function isRushed(durationMs, limitMinutes) {
  if (durationMs == null || limitMinutes == null) return false;
  const d = Number(durationMs);
  const lim = Number(limitMinutes);
  if (!Number.isFinite(d) || d < 0 || !Number.isFinite(lim) || lim <= 0) return false;
  return d < RUSHED_FRACTION * lim * 60000;
}

module.exports = { isRushed, RUSHED_FRACTION };
