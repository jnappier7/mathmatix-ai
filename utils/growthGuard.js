'use strict';
/* ============================================================
   growthGuard.js — a bad day must not cost a student their level.

   A Growth Check is 5-8 items. It writes the student's ability estimate AND
   their level string AND user.mathCourse (the pathway the tutor teaches
   from), and then locks them out for three months. So a single rushed,
   misclicked, or handed-to-a-sibling run could drop someone from Algebra 1 to
   6th Grade and there was no way back until the next check came due — the
   tutor would spend a quarter teaching well below where the student actually
   is, and the student who'd never think to complain is exactly the one it
   happens to.

   The asymmetry here is deliberate, not timidity about bad news:
     • UP is trusted in full. Correct answers at difficulty have essentially
       one cause — the student can do it.
     • DOWN is throttled. A wrong answer has many causes that aren't ability:
       rushing, misreading, fatigue, a sibling on the keyboard, a bad UI tap.

   Two rules, addressing two different failure modes:
     1. An unconverged check earns only part of its drop. If the estimate
        never tightened (SE above UNCONVERGED_SE), the MAGNITUDE isn't
        credible even if the direction is.
     2. One check may cost at most one grade band. A hard backstop on the
        user-visible harm, whatever the math says.

   This SLOWS a decline, it does not block one: a student who has genuinely
   regressed keeps stepping down one band per check until the estimate and
   the student agree. The raw measurement is always preserved for teachers
   (growthCheckHistory.rawTheta) — we damp what we ACT on, never what we
   record.
   ============================================================ */

const { GRADE_LEVEL_BANDS, gradeBandIndex, thetaToGradeLevel } = require('./catConfig');

// Above this standard error the check never really converged, so its drop
// magnitude is guesswork. Growth checks target SE ≈ 0.4 (GROWTH_CHECK_CONFIG
// .seThreshold); 0.5 is "did not get there".
const UNCONVERGED_SE = 0.5;

// How much of the measured drop an unconverged check is allowed to apply.
const UNCONVERGED_DROP_FACTOR = 0.5;

// Bands are half-open — band i is (bands[i-1].maxTheta, bands[i].maxTheta] —
// so the band below's lower bound is EXCLUSIVE. Flooring exactly on that edge
// lands in the band beneath it, i.e. two levels down, defeating the rule. Step
// one rounding unit inside instead; 0.01 survives the round2() below, which a
// smaller epsilon would not.
const FLOOR_EPSILON = 0.01;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * The lowest theta a student currently at `theta` may be moved to by one
 * check: just inside the bottom of the band directly below theirs.
 *
 * Kindergarten (band 0) has nothing below it, and 1st Grade's neighbour is
 * Kindergarten, which is unbounded downward — both return -Infinity, i.e. no
 * floor. Correct: there is no level left to protect.
 */
function oneBandDownFloor(theta) {
  const idx = gradeBandIndex(theta);
  if (idx < 2) return -Infinity;
  // Band `idx - 1` spans (bands[idx-2].maxTheta, bands[idx-1].maxTheta].
  return GRADE_LEVEL_BANDS[idx - 2].maxTheta + FLOOR_EPSILON;
}

/**
 * Decide what a Growth Check is allowed to do to a student's ability estimate.
 *
 * @param {Object} o
 * @param {Number} o.previousTheta - ability BEFORE this check
 * @param {Number} o.measuredTheta - what the check estimated
 * @param {Number} [o.measuredSE]  - standard error of that estimate
 * @returns {Object} {
 *   theta,          // what to WRITE (damped)
 *   rawTheta,       // what the check measured (for the record)
 *   damped,         // did the guard change anything?
 *   levelHeld,      // did the guard keep them at their previous level?
 *   reason,         // 'accepted' | 'low-confidence' | 'level-floor' | 'low-confidence+level-floor'
 *   previousLevel,
 *   rawLevel,       // level the raw measurement would have given
 *   appliedLevel,   // level actually applied
 * }
 */
function dampGrowthCheckDrop({ previousTheta, measuredTheta, measuredSE = null }) {
  const prev = Number.isFinite(previousTheta) ? previousTheta : 0;
  const raw = Number.isFinite(measuredTheta) ? measuredTheta : prev;

  const previousLevel = thetaToGradeLevel(prev).gradeLevel;
  const rawLevel = thetaToGradeLevel(raw).gradeLevel;

  // Growth is trusted in full — you cannot fake correct answers at difficulty.
  if (raw >= prev) {
    return {
      theta: raw,
      rawTheta: raw,
      damped: false,
      levelHeld: false,
      reason: 'accepted',
      previousLevel,
      rawLevel,
      appliedLevel: rawLevel,
    };
  }

  const reasons = [];
  let drop = prev - raw;

  // Rule 1 — an unconverged check earns only half its drop.
  if (Number.isFinite(measuredSE) && measuredSE > UNCONVERGED_SE) {
    drop *= UNCONVERGED_DROP_FACTOR;
    reasons.push('low-confidence');
  }

  let applied = prev - drop;

  // Rule 2 — never more than one grade band down in a single check.
  const floor = oneBandDownFloor(prev);
  if (applied < floor) {
    applied = floor;
    reasons.push('level-floor');
  }

  const appliedLevel = thetaToGradeLevel(applied).gradeLevel;

  return {
    theta: round2(applied),
    rawTheta: round2(raw),
    damped: round2(applied) !== round2(raw),
    levelHeld: appliedLevel === previousLevel && rawLevel !== previousLevel,
    reason: reasons.length ? reasons.join('+') : 'accepted',
    previousLevel,
    rawLevel,
    appliedLevel,
  };
}

module.exports = {
  dampGrowthCheckDrop,
  oneBandDownFloor,
  UNCONVERGED_SE,
  UNCONVERGED_DROP_FACTOR,
};
