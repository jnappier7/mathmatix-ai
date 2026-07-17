/**
 * AP CALCULUS AB BOOTCAMP — scoring core (pure, DB-free, unit-tested).
 *
 * The weekly loop: auto-score MC + rubric-score FRQ → weekly composite → AP band
 * projection; rank weak skills by priority = (1 − accuracy) × exam weight × recency
 * and commit a ≤3-topic weekly plan. See docs/APCALCAB_BOOTCAMP_DESIGN.md.
 *
 * @module utils/calcBootcamp
 */

// Approximate AP Calculus AB Section I unit weights (relative, from the CED).
// Used only to prioritize remediation — not a scaled score.
const UNIT_WEIGHT = {
  U1: 6, U2: 6, U3: 11, U4: 12, U5: 17, U6: 18, U7: 9, U8: 13,
};

// Approximate composite(%) → AP band (1–5). Practice-feedback only; the real
// cut scores shift year to year, so this is surfaced with a caveat.
const BAND_TABLE = [
  { min: 68, band: 5 },
  { min: 55, band: 4 },
  { min: 42, band: 3 },
  { min: 30, band: 2 },
  { min: 0, band: 1 },
];

/** Weekly composite 0–100: MC accuracy (50%) + FRQ rubric fraction (50%). */
function weeklyComposite(mcCorrect, mcTotal, frqEarned, frqPossible) {
  const mcPct = mcTotal > 0 ? (mcCorrect / mcTotal) : 0;
  const frqPct = frqPossible > 0 ? (frqEarned / frqPossible) : 0;
  // If the FRQ isn't scored yet, fall back to MC-only so a band still shows.
  const composite = frqPossible > 0 ? (mcPct * 0.5 + frqPct * 0.5) : mcPct;
  return Math.round(composite * 1000) / 10; // one decimal
}

/** Map a composite(%) to an approximate AP band (1–5). */
function projectBand(composite) {
  const row = BAND_TABLE.find(r => composite >= r.min) || BAND_TABLE[BAND_TABLE.length - 1];
  return { band: row.band, approximate: true };
}

/**
 * Priority score for a skill's remediation value.
 * @param {number} accuracy 0..1 on the skill this week
 * @param {number} examWeight relative unit weight (UNIT_WEIGHT)
 * @param {number} recency 1 for this week, decaying for older misses (0..1]
 */
function priorityScore(accuracy, examWeight, recency = 1) {
  return (1 - accuracy) * (examWeight || 1) * (recency || 1);
}

/**
 * Rank weak skills (accuracy < 1) worst-value first.
 * @param {Object} bySkill { skillId: {correct,total,unit,name} }
 * @param {Object} [opts] { recencyBySkill?: {skillId:recency} }
 * @returns {Array<{skillId,name,unit,correct,total,accuracy,priority}>}
 */
function rankWeakSkills(bySkill, opts = {}) {
  const recency = opts.recencyBySkill || {};
  return Object.entries(bySkill)
    .map(([skillId, v]) => {
      const accuracy = v.total > 0 ? v.correct / v.total : 0;
      return {
        skillId,
        name: v.name || skillId,
        unit: v.unit || null,
        correct: v.correct,
        total: v.total,
        accuracy,
        priority: priorityScore(accuracy, UNIT_WEIGHT[v.unit], recency[skillId]),
      };
    })
    .filter(s => s.accuracy < 1)
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Commit the weekly plan: the top-N weak skills plus one mandatory retrospective
 * (a still-weak skill from a prior week, if supplied) — the design's "≤3-topic
 * plan with one mandatory retrospective item".
 * @param {Array} weakSkills ranked (rankWeakSkills output)
 * @param {Array} [priorWeak] ranked weak skills carried from earlier weeks
 * @param {number} [maxNew=3]
 */
function buildWeeklyPlan(weakSkills, priorWeak = [], maxNew = 3) {
  const plan = weakSkills.slice(0, maxNew).map(s => ({ ...s, kind: 'target' }));
  const chosen = new Set(plan.map(s => s.skillId));
  const retro = (priorWeak || []).find(s => !chosen.has(s.skillId));
  if (retro) plan.push({ ...retro, kind: 'retrospective' });
  return plan;
}

module.exports = {
  UNIT_WEIGHT,
  BAND_TABLE,
  weeklyComposite,
  projectBand,
  priorityScore,
  rankWeakSkills,
  buildWeeklyPlan,
};
