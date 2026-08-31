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
const { normalizeOptions } = require('./mcOptions');
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

/**
 * Target difficulty for a 1-based position, from the blueprint ramp.
 *
 * Two ramp shapes are accepted, told apart by the first entry's keys:
 *
 *   ANCHORS  [{position, targetDifficulty}]         ← what the real blueprint uses
 *     A piecewise-linear curve through the anchors, so the target moves a little
 *     at EVERY position instead of jumping a whole point at two band edges. The
 *     ACT's own ordering is a smooth ascent, and the returned value is
 *     fractional on purpose: assembleForm rounds it to pick the query window but
 *     keeps the fraction to choose WITHIN that window, which is the only reason
 *     interpolating beats simply adding more flat bands. Positions outside the
 *     anchor range clamp to the nearest end.
 *
 *   BANDS    [{fromPosition, toPosition, targetDifficulty}]   ← legacy, flat
 *     Kept working for blueprint overrides that want a deliberately flat ramp
 *     (tests/integration/actNoRepeat.test.js pins every slot at 3 so the
 *     no-repeat assertions aren't reading difficulty noise).
 *
 * @returns {number} 1-5, fractional under the anchor form
 */
function difficultyForPosition(blueprint, position) {
  const ramp = blueprint.difficultyRamp || [];
  if (!ramp.length) return 3;

  if (ramp[0].position !== undefined) {
    const anchors = ramp.slice().sort((a, b) => a.position - b.position);
    const first = anchors[0], last = anchors[anchors.length - 1];
    if (position <= first.position) return first.targetDifficulty;
    if (position >= last.position) return last.targetDifficulty;
    for (let i = 1; i < anchors.length; i++) {
      const lo = anchors[i - 1], hi = anchors[i];
      if (position <= hi.position) {
        const span = hi.position - lo.position;
        const t = span ? (position - lo.position) / span : 0;
        // 2dp so slot payloads, logs and gap specs stay legible and comparable.
        return Math.round((lo.targetDifficulty + t * (hi.targetDifficulty - lo.targetDifficulty)) * 100) / 100;
      }
    }
  }

  for (const band of ramp) {
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
    // { label, text } only. These items are stored on the session and echoed to
    // the browser by routes/actTest.js, so the stored shapes' `isCorrect` flag
    // would ride along as an answer key; the labels also have to be positional
    // to agree with how compareAnswer resolves the pick on submit.
    options: problem.answerType === 'multiple-choice' ? normalizeOptions(problem.options) : undefined,
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
 *
 * Shape novelty still wins outright; `targetDifficulty` only breaks ties among
 * equally-novel candidates, picking the one nearest the ramp's target for this
 * position. That tie-break is what makes the interpolated ramp mean anything:
 * the DB query can only ask for a ±1 window of INTEGER difficulties, so without
 * it a target of 2.2 and one of 2.8 draw from the same pool and land on the same
 * item, and the curve collapses back into the step function it replaced.
 * Omit the argument and the old first-wins tie-break is preserved.
 */
function pickDiverse(candidates, usedSignatures, targetDifficulty) {
  if (!candidates || !candidates.length) return null;
  const distance = (c) => (
    targetDifficulty == null || c.difficulty == null
      ? 0
      : Math.abs(c.difficulty - targetDifficulty)
  );
  let best = null, bestCount = Infinity, bestDist = Infinity;
  for (const c of candidates) {
    const count = usedSignatures.get(promptSignature(c.prompt)) || 0;
    const dist = distance(c);
    // No early exit on count 0: a later candidate with the same novelty may sit
    // closer to the target, and that is the whole point of the tie-break.
    if (count < bestCount || (count === bestCount && dist < bestDist)) {
      best = c; bestCount = count; bestDist = dist;
    }
  }
  return best;
}

/** A spec the problem generator can fulfill for an unfillable slot. */
function toGenerationSpec(slot) {
  return {
    position: slot.position,
    skillId: slot.skillId,
    category: slot.category,
    // Rounded: an author writes an item at difficulty 3, not 2.87, and the
    // coverage worklist groups by this key (scripts/actTestCoverage.js).
    targetDifficulty: Math.round(slot.targetDifficulty),
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
 * @param {string[]} [opts.excludeIds] - problemIds the student has already been
 *   served (any prior session). Seeded into the exclusion set so no item ever
 *   repeats across re-tests — repeats measure memory, not skill. As these deplete
 *   a skill, the same-category fallback keeps drawing fresh items; when a whole
 *   category is exhausted those slots become gaps (coverage drops), which the
 *   caller surfaces honestly instead of silently repeating.
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
  // Never re-serve an item the student has already seen (cross-session), on top
  // of the within-form dedup this array already provides.
  const excludeIds = Array.isArray(opts.excludeIds) ? opts.excludeIds : [];
  const usedProblemIds = excludeIds.slice();
  const excludedCount = usedProblemIds.length;
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
      // Centre the window on the ROUNDED target. Using the fraction directly
      // would narrow the window to two difficulty levels instead of three
      // (2.87 ± 1 spans only 3 and 4), thinning every pool and manufacturing
      // gaps; the fraction is spent below, on picking within the window.
      const center = Math.round(slot.targetDifficulty);
      const lo = Math.max(1, center - 1);
      const hi = Math.min(5, center + 1);
      let candidates = await Problem.find({
        skillId: slot.skillId,
        isActive: true,
        answerType: 'multiple-choice',
        difficulty: { $gte: lo, $lte: hi },
        problemId: { $nin: usedProblemIds },
      }).limit(16).lean();
      if (!candidates.length) {
        // Widen: any difficulty for this skill, still excluding used items.
        const p = await Problem.findNearDifficulty(slot.skillId, center, usedProblemIds, { preferMultipleChoice: true });
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
      problem = pickDiverse(candidates, usedSignatures, slot.targetDifficulty);
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
      excluded: excludedCount,   // items withheld as already-seen (re-test freshness)
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
