/**
 * ACT TEST ASSEMBLER — builds an ORIGINAL parallel ACT Math form from our own
 * item bank, to a fixed blueprint (seeds/act-math-blueprint.json).
 *
 * The blueprint is derived from the ACT Math reporting-category structure — the
 * *composition* of the exam (how many items per category, difficulty ramp), not
 * any published test's questions. This assembler samples our own skill-tagged
 * items (models/problem.js, the `act-*` skills) to hit that composition, so every
 * assembled form is a fresh, original parallel test with the same measurement
 * properties. No copyrighted items are ever stored or served.
 *
 * Two consumers:
 *   - Fixed-form runner: take `items` in order, time it, score raw→scaled.
 *   - Adaptive diagnostic (Starting Point rail): use `skillPool` /
 *     `skillsByCategory` to constrain the CAT engine to the ACT skill set.
 *
 * Any slot the bank can't fill is reported in `gaps` with a `generationSpec`
 * the problem generator (scripts/generate*.js) can fulfill — so the assembler
 * is useful even before the bank is fully populated for ACT.
 *
 * @module utils/actTestAssembler
 */

const DEFAULT_BLUEPRINT = require('../seeds/act-math-blueprint.json');
// models/problem (mongoose) is required lazily inside assembleForm so the pure
// helpers (buildSlots / skillPool / rawToScaled) load without a DB connection.

// ── Tiny seeded PRNG (mulberry32) so a given seed reproduces a form and
// different seeds produce different — but balanced — forms. Runtime only;
// never used inside workflow scripts (where Math.random is banned).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Target difficulty for a 1-based position, from the blueprint ramp. */
function difficultyForPosition(blueprint, position) {
  for (const band of blueprint.difficultyRamp || []) {
    if (position >= band.fromPosition && position <= band.toPosition) return band.targetDifficulty;
  }
  return 3;
}

/**
 * Expand category weights + ramp into an ordered list of slots (one per item in
 * the blueprint, e.g. 45), with each
 * category spread evenly across the form (interleaved like a real ACT, not
 * blocked by category) and a rotating skill assignment for within-category
 * coverage.
 *
 * @returns {Array<{position, category, skillId, targetDifficulty}>}
 */
function buildSlots(blueprint, rng) {
  const weights = blueprint.categoryWeights || {};
  const byCat = blueprint.skillsByCategory || {};

  // Place each category's items at evenly spaced fractional positions so the
  // final interleave spreads every category across the whole form.
  const placed = [];
  for (const [category, count] of Object.entries(weights)) {
    const skills = byCat[category] || [];
    // rotate the skill start point per form so different seeds vary coverage
    const startOffset = skills.length ? Math.floor(rng() * skills.length) : 0;
    for (let i = 0; i < count; i++) {
      const frac = (i + 0.5) / count;               // even spread in [0,1)
      const jitter = (rng() - 0.5) * (0.5 / count);  // tiny shuffle to avoid ties
      const skillId = skills.length ? skills[(startOffset + i) % skills.length] : null;
      placed.push({ category, skillId, sortKey: frac + jitter });
    }
  }

  placed.sort((a, b) => a.sortKey - b.sortKey);

  return placed.map((slot, idx) => ({
    position: idx + 1,
    category: slot.category,
    skillId: slot.skillId,
    targetDifficulty: difficultyForPosition(blueprint, idx + 1),
  }));
}

/** Trim a Problem doc to the client-safe item payload (no answer key). */
function toClientItem(slot, problem) {
  return {
    position: slot.position,
    category: slot.category,
    skillId: slot.skillId,
    problemId: problem.problemId,          // the string problemId (matches findNearDifficulty excludes)
    content: problem.prompt,               // field is `prompt`; screener sends it as `content`
    svg: problem.svg || undefined,         // optional figure
    answerType: problem.answerType,
    options: problem.answerType === 'multiple-choice' ? (problem.options || []) : undefined,
    difficulty: problem.difficulty,
  };
}

/**
 * A prompt's "shape" — the wording with all numbers blanked — so two problems
 * that read the same except for their numbers collapse to one signature. Used
 * to keep a single form from repeating the same-looking question.
 */
function promptSignature(s) {
  return String(s || '').replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim().slice(0, 90);
}

/**
 * From a candidate pool, pick the problem whose shape has appeared LEAST in the
 * form so far — so repeated draws of the same skill surface different wordings.
 */
function pickDiverse(candidates, usedSignatures) {
  if (!candidates || !candidates.length) return null;
  let best = candidates[0], bestCount = Infinity;
  for (const c of candidates) {
    const count = usedSignatures.get(promptSignature(c.prompt)) || 0;
    if (count < bestCount) { best = c; bestCount = count; }
    if (bestCount === 0) break; // an unused shape — take it immediately
  }
  return best;
}

/** A spec the problem generator can fulfill for an unfillable slot. */
function toGenerationSpec(slot) {
  return {
    position: slot.position,
    skillId: slot.skillId,
    category: slot.category,
    targetDifficulty: slot.targetDifficulty,
    answerType: 'multiple-choice',
    optionCount: (DEFAULT_BLUEPRINT.choicesPerItem || 4),
  };
}

/**
 * Assemble an original ACT Math form from the bank.
 *
 * @param {Object} [opts]
 * @param {Object} [opts.blueprint] - Override blueprint (defaults to seeds file)
 * @param {string|number} [opts.seed] - Reproducibility seed (string hashed)
 * @param {number} [opts.difficultyRange=1] - ± band passed to findNearDifficulty
 * @returns {Promise<{items, gaps, coverage, meta}>}
 */
async function assembleForm(opts = {}) {
  const blueprint = opts.blueprint || DEFAULT_BLUEPRINT;
  const seedInput = opts.seed != null ? opts.seed : `${Date.now()}`;
  const seed = typeof seedInput === 'number' ? seedInput >>> 0 : hashSeed(String(seedInput));
  const rng = mulberry32(seed);

  const Problem = require('../models/problem');
  const byCat = blueprint.skillsByCategory || {};
  const slots = buildSlots(blueprint, rng);
  const usedProblemIds = [];
  const usedSignatures = new Map();   // prompt-shape -> count, to avoid look-alikes
  const items = [];
  const gaps = [];

  for (const slot of slots) {
    if (!slot.skillId) { gaps.push(toGenerationSpec(slot)); continue; }
    let problem = null;
    try {
      // Fetch a POOL of candidates near the target difficulty, then pick the
      // one whose wording-shape is least-used so far — this is what prevents
      // the same-looking question appearing 3-4 times in one form.
      const lo = Math.max(1, slot.targetDifficulty - 1);
      const hi = Math.min(5, slot.targetDifficulty + 1);
      let candidates = await Problem.find({
        skillId: slot.skillId,
        isActive: true,
        answerType: 'multiple-choice',
        difficulty: { $gte: lo, $lte: hi },
        problemId: { $nin: usedProblemIds },
      }).limit(16).lean();
      if (!candidates.length) {
        // Widen: any difficulty for this skill, still excluding used items.
        const p = await Problem.findNearDifficulty(slot.skillId, slot.targetDifficulty, usedProblemIds, { preferMultipleChoice: true });
        candidates = p ? [p] : [];
      }
      if (!candidates.length) {
        // Same-category fallback: a thin sub-skill can be asked for more times
        // than it has items (a few categories have more slots than sub-skills).
        // Draw another item from the SAME reporting category so the form stays
        // exactly 45 items with the exact category composition the scaled score
        // depends on. The item keeps its own fine skillId for personalization.
        const catSkills = byCat[slot.category] || [];
        if (catSkills.length) {
          candidates = await Problem.find({
            skillId: { $in: catSkills },
            isActive: true,
            answerType: 'multiple-choice',
            problemId: { $nin: usedProblemIds },
          }).limit(24).lean();
        }
      }
      problem = pickDiverse(candidates, usedSignatures);
      // Record the item's OWN fine skill (fallback may cross sub-skills within
      // the category), so scoring & personalization attribute to the real skill.
      if (problem && problem.skillId) slot.skillId = problem.skillId;
    } catch (err) {
      // DB/query error — treat as a gap, keep assembling the rest.
      problem = null;
    }
    if (!problem) { gaps.push(toGenerationSpec(slot)); continue; }
    usedProblemIds.push(problem.problemId);
    usedSignatures.set(promptSignature(problem.prompt), (usedSignatures.get(promptSignature(problem.prompt)) || 0) + 1);
    items.push(toClientItem(slot, problem));
  }

  return {
    items,
    gaps,
    coverage: {
      total: slots.length,
      filled: items.length,
      missing: gaps.length,
      pct: slots.length ? Math.round((items.length / slots.length) * 100) : 0,
    },
    meta: {
      testId: blueprint.testId,
      title: blueprint.title,
      totalItems: blueprint.totalItems,
      timeLimitMinutes: blueprint.timeLimitMinutes,
      seed,
    },
  };
}

/** Flat list of the ACT content skillIds (for constraining the CAT engine). */
function skillPool(blueprint = DEFAULT_BLUEPRINT) {
  return Object.values(blueprint.skillsByCategory || {}).flat();
}

/** Map a raw score (0..totalItems) to the approximate scaled 1-36 estimate. */
function rawToScaled(raw, blueprint = DEFAULT_BLUEPRINT) {
  const table = blueprint.scaledScore && blueprint.scaledScore.scaledByRaw;
  if (!Array.isArray(table)) return null;
  const r = Math.max(0, Math.min(table.length - 1, Math.round(raw)));
  return { scaled: table[r], approximate: true };
}

module.exports = {
  assembleForm,
  buildSlots,
  skillPool,
  rawToScaled,
  difficultyForPosition,
  promptSignature,
  pickDiverse,
  getBlueprint: () => DEFAULT_BLUEPRINT,
};
