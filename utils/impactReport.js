/* ============================================================
   utils/impactReport.js — turn growth-check history into a
   defensible efficacy summary for a school or a roster.

   WHY THIS EXISTS
   ---------------
   Districts buying AI tutoring in 2026 are not asking "will students use it";
   they are asking "how will I know it helped", and post-ESSER they cut what
   cannot answer that. Every number below is already collected by the growth
   check (routes/screener.js `/complete` → `learningProfile.growthCheckHistory`);
   nothing here is new measurement. This module only aggregates it.

   WHAT THIS IS NOT
   ----------------
   This is a within-subject pre/post gain on a single cohort. There is no
   control group and no random assignment, so it CANNOT support a causal claim
   ("Mathmatix caused X months of growth") — students also aged, attended class,
   and did homework over the same window. It supports a descriptive claim
   ("students who used Mathmatix gained X, and here is the participation rate
   behind that number"). `caveats` ships inside the payload for exactly this
   reason: the limitation must travel with the number, not live in a footnote
   someone drops when they paste it into a board deck.

   Two deliberate choices:
     - Growth is measured on `rawTheta`, the honest reading, NOT the damped
       `newTheta` the platform acts on. utils/growthGuard.js exists so one bad
       check can't cost a student their level; using the damped value here
       would flatter the report by hiding real declines.
     - Distribution buckets delegate to utils/growthSummary.js, the single
       source of truth for what counts as growth. A school report must not be
       able to call "growth" something the student was told was "stable".
   ============================================================ */

const { summarizeGrowthStatus } = require('./growthSummary');
const { GRADE_NUMBER_THETA, gradeToTheta } = require('./catConfig');

const round2 = (n) => Math.round(n * 100) / 100;

// A school year is 10 instructional months. Used to express a theta gain in the
// unit school boards actually budget against.
const MONTHS_PER_SCHOOL_YEAR = 10;

// Spacing to assume when a student's grade can't be resolved. Deliberately the
// WIDEST spacing in the table: months-of-growth is delta ÷ spacing, so a wide
// spacing under-claims. An unknown grade should never inflate the headline.
const UNKNOWN_GRADE_SPACING = 0.5;

/**
 * How much theta one grade level is worth at `grade`, derived from the same
 * placement table the screener starts students on (catConfig.GRADE_NUMBER_THETA)
 * so the two can never drift. Elementary grades are spaced further apart than
 * secondary ones — 3rd→4th is worth more theta than 10th→11th — which is why
 * this is a lookup and not a single constant.
 *
 * `grade` is whatever `user.gradeLevel` holds, which is a display string
 * ('7th Grade', 'Kindergarten', 'College'). Parsing it is catConfig's job, not
 * ours — we resolve it through gradeToTheta() and locate the band that theta
 * landed in, rather than forking a second grade parser that could disagree
 * with the one the screener places students with.
 *
 * @param {string|number} grade  A user's gradeLevel value.
 * @returns {number} Theta per grade level at that band (always > 0).
 */
function thetaPerGradeAt(grade) {
  if (grade === null || grade === undefined || grade === '') return UNKNOWN_GRADE_SPACING;

  const bandTheta = gradeToTheta(grade);
  // gradeToTheta returns 0 both for 6th grade and for anything it failed to
  // parse. Only trust a 0 when the input really does look like 6th grade.
  if (bandTheta === 0 && !/\b6\b|sixth/i.test(String(grade))) {
    return UNKNOWN_GRADE_SPACING;
  }

  const bands = GRADE_NUMBER_THETA;
  let idx = bands.findIndex((b) => b.theta === bandTheta);
  if (idx < 0) return UNKNOWN_GRADE_SPACING;
  if (idx === 0) idx = 1; // K has no band below it; use the K→2 spacing

  const hi = bands[idx];
  const lo = bands[idx - 1];
  const gradesSpanned = Math.max(hi.max - lo.max, 1);
  const spacing = (hi.theta - lo.theta) / gradesSpanned;

  // Guard against a future table edit making this zero or negative.
  return spacing > 0 ? spacing : UNKNOWN_GRADE_SPACING;
}

/**
 * Reduce one student's growth-check history to a single before/after pair.
 *
 * Baseline is the FIRST check's `previousTheta` (where they stood when the
 * first check ran); current is the LAST check's honest reading. A student with
 * no growth checks returns null and is counted as unmeasured, never as zero
 * growth — silently scoring them 0 would drag the mean toward whatever share of
 * the roster simply never took a check.
 *
 * @param {object} student  A User doc (or lean object).
 * @returns {object|null}
 */
function summarizeStudentGrowth(student) {
  const history = student?.learningProfile?.growthCheckHistory || [];
  if (!history.length) return null;

  const ordered = [...history].sort(
    (a, b) => new Date(a.date || 0) - new Date(b.date || 0)
  );
  const first = ordered[0];
  const last = ordered[ordered.length - 1];

  // `rawTheta` is what the check measured; `newTheta` is what the guard let
  // through. Prefer raw, fall back for rows written before raw was recorded.
  const honest = (row) =>
    typeof row.rawTheta === 'number' ? row.rawTheta : row.newTheta;

  const baseline =
    typeof first.previousTheta === 'number' ? first.previousTheta : null;
  const current = honest(last);
  if (typeof baseline !== 'number' || typeof current !== 'number') return null;

  const deltaTheta = current - baseline;
  const perGrade = thetaPerGradeAt(student.gradeLevel);

  return {
    studentId: String(student._id || ''),
    checks: ordered.length,
    firstCheckAt: first.date || null,
    lastCheckAt: last.date || null,
    baselineTheta: round2(baseline),
    currentTheta: round2(current),
    deltaTheta: round2(deltaTheta),
    // Same threshold ladder the student was shown at debrief time.
    status: summarizeGrowthStatus(deltaTheta).growthStatus,
    monthsOfGrowth: round2((deltaTheta / perGrade) * MONTHS_PER_SCHOOL_YEAR),
    // A run of damped checks is a real decline the guard is slowing down.
    dampedChecks: ordered.filter((r) => r.damped).length,
    activeMinutes: Math.round(student.totalActiveTutoringMinutes || 0),
  };
}

/** Sample mean. Returns 0 for an empty list. */
function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Sample standard deviation (n−1). Returns 0 for fewer than 2 values. */
function stdDev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/** Median. Returns 0 for an empty list. */
function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Build the cohort-level report.
 *
 * @param {object[]} students   Every student in scope — INCLUDING those with no
 *                              growth checks, so participation is visible.
 * @param {object}   [meta]     { scope, scopeName, windowStart, windowEnd }
 * @returns {object} The report payload.
 */
function buildImpactReport(students = [], meta = {}) {
  const enrolled = students.length;
  const perStudent = students
    .map(summarizeStudentGrowth)
    .filter(Boolean);

  const measured = perStudent.length;
  const deltas = perStudent.map((s) => s.deltaTheta);
  const months = perStudent.map((s) => s.monthsOfGrowth);

  const meanGain = mean(deltas);
  const sd = stdDev(deltas);

  // 95% CI on the mean gain (normal approximation). Reported only with enough
  // students for it to mean anything — below that it is noise dressed as rigor.
  const MIN_N_FOR_INFERENCE = 10;
  const hasInference = measured >= MIN_N_FOR_INFERENCE && sd > 0;
  const halfWidth = hasInference ? 1.96 * (sd / Math.sqrt(measured)) : null;

  // Standardized within-subject gain (Cohen's d_z). Descriptive only — see the
  // header. Undefined when SD is 0 (every student moved identically, which at
  // small n usually means too little data rather than a perfect intervention).
  const effectSize = hasInference ? meanGain / sd : null;

  const buckets = { grew: 0, stable: 0, declined: 0 };
  for (const s of perStudent) {
    if (s.status === 'significant-growth' || s.status === 'some-growth') buckets.grew += 1;
    else if (s.status === 'stable') buckets.stable += 1;
    else buckets.declined += 1;
  }

  const activeMinutes = students.map((s) => Math.round(s.totalActiveTutoringMinutes || 0));
  const everActive = activeMinutes.filter((m) => m > 0).length;

  const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

  const caveats = [
    'Pre/post gains on a single cohort with no control group. This shows what happened for students who used Mathmatix; it does not isolate Mathmatix as the cause — the same students also attended class and aged over the window.',
    `Growth is only measured for the ${measured} of ${enrolled} students (${pct(measured, enrolled)}%) who completed at least one growth check. Students who never took one are excluded, not scored as zero.`,
    'Ability is estimated by an adaptive 5–8 item check, so a single student’s reading carries real standard error. Cohort means are far more stable than any one row.',
    'Grade-level months are a conversion of the theta gain using the placement scale, not a nationally normed grade-equivalent score.',
  ];
  if (!hasInference) {
    caveats.push(
      `Confidence interval and effect size are withheld below ${MIN_N_FOR_INFERENCE} measured students — the sample is too small for either to be meaningful.`
    );
  }
  const dampedStudents = perStudent.filter((s) => s.dampedChecks > 0).length;
  if (dampedStudents > 0) {
    caveats.push(
      `${dampedStudents} student(s) had at least one check whose decline was damped for placement purposes. This report uses the undamped measurement, so those declines are fully reflected here.`
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    scope: meta.scope || 'all',
    scopeName: meta.scopeName || null,
    window: {
      start: meta.windowStart || null,
      end: meta.windowEnd || null,
    },
    cohort: {
      enrolled,
      measured,
      measuredPct: pct(measured, enrolled),
      everActive,
      everActivePct: pct(everActive, enrolled),
    },
    growth: {
      meanThetaGain: round2(meanGain),
      medianThetaGain: round2(median(deltas)),
      sdThetaGain: round2(sd),
      ci95: hasInference
        ? { low: round2(meanGain - halfWidth), high: round2(meanGain + halfWidth) }
        : null,
      effectSize: effectSize === null ? null : round2(effectSize),
      meanMonthsOfGrowth: round2(mean(months)),
      medianMonthsOfGrowth: round2(median(months)),
    },
    distribution: {
      grew: buckets.grew,
      stable: buckets.stable,
      declined: buckets.declined,
      grewPct: pct(buckets.grew, measured),
      stablePct: pct(buckets.stable, measured),
      declinedPct: pct(buckets.declined, measured),
    },
    engagement: {
      totalTutoringMinutes: activeMinutes.reduce((a, b) => a + b, 0),
      medianMinutesPerStudent: Math.round(median(activeMinutes)),
      medianMinutesPerActiveStudent: Math.round(median(activeMinutes.filter((m) => m > 0))),
    },
    caveats,
  };
}

module.exports = {
  buildImpactReport,
  summarizeStudentGrowth,
  thetaPerGradeAt,
  MONTHS_PER_SCHOOL_YEAR,
  UNKNOWN_GRADE_SPACING,
  // exported for tests
  _stats: { mean, stdDev, median },
};
