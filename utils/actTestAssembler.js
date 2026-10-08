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
const { hasBadDistractors } = require('./distractorQuality');
const { sortPermutation } = require('./actChoiceOrder');
const { thetaToDifficultyExact } = require('./itemCalibration');
const { estimatedDifficulty } = require('./actDifficultyEstimates');
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

/** Seeded Fisher–Yates shuffle, in place. */
function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/**
 * A random, seed-reproducible pool of up to `size` items matching `query`.
 *
 * This used to be `Problem.find(query).limit(n)` with no sort, which returns
 * the FIRST n matches in storage order — the same n on every form. The seed
 * only rotated which skill each slot asked for, so every test drew from the
 * same front slice of each skill: ten guest tests shared about 12 of 45
 * questions pairwise (up to 25) and touched only 173 of ~950 items. Now every
 * matching item is a candidate: read the light fields of all of them, shuffle
 * with the form's rng, keep `size`, and load just those in full. The shuffled
 * order also decides pickDiverse's ties, so equally good items rotate too.
 */
async function drawPool(Problem, query, rng, size) {
  const lite = await Problem.find(query).select('_id').lean();
  if (!lite.length) return [];
  // Storage order is not guaranteed stable; sort before shuffling so a seed
  // reproduces its form.
  lite.sort((a, b) => (String(a._id) < String(b._id) ? -1 : 1));
  const ids = shuffleInPlace(lite, rng).slice(0, size).map((d) => d._id);
  const docs = await Problem.find({ _id: { $in: ids } }).lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  // Never serve an item whose choices give the answer away or are broken
  // (equal-valued choices, duplicates, placeholders, an odd-type key) — the
  // same gate the Starting Point screener applies. scripts/actItemAudit.js
  // lists them for repair in the bank.
  return ids.map((id) => byId.get(String(id))).filter((d) => d && !hasBadDistractors(d));
}

/**
 * Banks that carry `act-*` skill tags but were not written as ACT items.
 *
 * The low-volume expansions (seeds/low-volume-items.generated.json, sources
 * `low-volume-expansion-2026-07` and `low-volume-2026-08`) were bulk-generated
 * to give thin skills SOME practice — imperative "Solve:" stems, definition
 * recall, unsorted choices, and joke distractors ("multiply both by zero",
 * "graph a circle"). An external audit of five public forms (2026-10-05)
 * traced its two worst item findings to this bank. They stay in the DB for
 * tutoring practice; they never sit on a form that claims to be ACT-like.
 * Every blueprint skill keeps at least 11 ACT-authored items without them.
 */
const NOT_ON_FORMS = /^low-volume/;
const FORM_SOURCE_FILTER = { source: { $not: NOT_ON_FORMS } };
const formEligible = (p) => !!p && !NOT_ON_FORMS.test(String(p.source || ''));

/**
 * Which bank rows a blueprint's forms may draw from, beyond skill and
 * difficulty. ACT names neither key and keeps exactly the query it always had:
 * multiple choice only, low-volume banks off. A blueprint may widen the answer
 * types (SAT has grid-ins) and pin the sources — and a blueprint whose skills
 * are unified-taxonomy ids MUST pin them: those ids are shared with the whole
 * tutoring bank, so a skill-only query would put worksheet practice on a form.
 */
function bankFilter(blueprint) {
  const types = Array.isArray(blueprint.answerTypes) && blueprint.answerTypes.length
    ? blueprint.answerTypes : ['multiple-choice'];
  const filter = { answerType: types.length === 1 ? types[0] : { $in: types } };
  if (Array.isArray(blueprint.sources) && blueprint.sources.length) filter.source = { $in: blueprint.sources };
  else Object.assign(filter, FORM_SOURCE_FILTER);
  return filter;
}

/**
 * An item the student answers from a picture or a table: it carries a figure,
 * or its stem holds a pipe-separated table (two or more " | " lines, the shape
 * public/js/act-test.js stemHtml renders as a real table).
 *
 * An official form has about ten; ours averaged 1.9 until the visual bank
 * (seeds/act-visual, scripts/generateActVisualItems.js) gave the assembler
 * enough to pace (external audit, 2026-10-05). See blueprint.visualTarget.
 */
const TABLE_STEM = /\n[^\n]* \| [^\n]*\n[^\n]* \| /;
const VISUAL_FILTER = { $or: [{ svg: { $nin: [null, ''] } }, { prompt: TABLE_STEM }] };
const PLAIN_FILTER = { $nor: [{ svg: { $nin: [null, ''] } }, { prompt: TABLE_STEM }] };
const isVisualItem = (p) => !!(p && (p.svg || TABLE_STEM.test(String(p.prompt || ''))));

/**
 * A multi-step reasoning item (seeds/act-reasoning): tagged `reasoning` by
 * scripts/generateActReasoningItems.js. Paced like visuals
 * (blueprint.reasoningTarget) because the bank is a small share of the pool,
 * and unpaced a form drew anywhere from 0 to 6 of them.
 */
const REASONING_FILTER = { tags: 'reasoning' };
const NOT_REASONING_FILTER = { tags: { $ne: 'reasoning' } };
const isReasoningItem = (p) => !!(p && Array.isArray(p.tags) && p.tags.includes('reasoning'));

/** What each paced kind of item is, and how to ask the DB for it or for anything else. */
const PACED_KINDS = {
  visual: { member: isVisualItem, filter: VISUAL_FILTER, notFilter: PLAIN_FILTER },
  reasoning: { member: isReasoningItem, filter: REASONING_FILTER, notFilter: NOT_REASONING_FILTER },
};

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
  // Numeric choices go out in ascending order, as on the real ACT, whatever
  // order the bank stored them in. Safe because grading and the review queue
  // carry a pick to the bank by its text (relabelByText), never by letter.
  let options = problem.answerType === 'multiple-choice' ? normalizeOptions(problem.options) : undefined;
  const perm = options && sortPermutation(options.map((o) => o.text));
  if (perm) options = normalizeOptions(perm.map((i) => ({ text: options[i].text })));
  return {
    position: slot.position,
    category: slot.category,
    skillId: slot.skillId,
    problemId: problem.problemId,          // the string problemId (matches findNearDifficulty excludes)
    content: problem.prompt,               // field is `prompt`; screener sends it as `content`
    svg: problem.svg || undefined,         // optional figure
    figureAlt: (problem.svg && problem.figureAlt) || undefined,
    answerType: problem.answerType,
    // { label, text } only. These items are stored on the session and echoed to
    // the browser by routes/actTest.js, so the stored shapes' `isCorrect` flag
    // would ride along as an answer key; the labels also have to be positional
    // to agree with how compareAnswer resolves the pick on submit.
    options,
    difficulty: problem.difficulty,
  };
}

/**
 * The finest difficulty an item has. `difficulty` is an integer 1-5; once
 * scripts/calibrateItemDifficulty.js has measured an item, calibration.theta
 * holds the estimate behind it, which places the item WITHIN its level. The
 * form is ordered by this, so two measured 3s still come out in the order
 * students found them, and an unmeasured item keeps its authored integer.
 */
function preciseDifficulty(problem) {
  const c = problem && problem.calibration;
  if (c && c.calibratedAt && c.theta != null && Number.isFinite(Number(c.theta))) {
    return Math.round(thetaToDifficultyExact(Number(c.theta)) * 100) / 100;
  }
  if (!problem) return undefined;
  // Next best: the content-based estimate on the Fable scale
  // (utils/actDifficultyEstimates.js), which every bank has. The Fable bank
  // was also rated item by item by its author, so there the two independent
  // ratings are averaged (they agree only moderately, ρ ≈ 0.6, and two
  // raters beat either alone). Elsewhere the authored rating is a position
  // quota (IES) or per template (enhanced), so the estimate stands alone.
  const est = estimatedDifficulty(problem.problemId);
  if (est != null) {
    const d = Number(problem.difficulty);
    return problem.source === 'act-fable' && Number.isFinite(d) ? Math.round(((est + d) / 2) * 100) / 100 : est;
  }
  // A bank whose authored ratings say little about the item gets its scale
  // narrowed until calibration measures it (blueprint.authoredScale). The IES
  // expansion rated by POSITION within each skill (items 1-4 → 1, 5-10 → 2,
  // …, by quota, not content), so an easy recipe ratio rated 4 landed at #41
  // after logarithms and complex division (external audit, 2026-10-07).
  const scale = (DEFAULT_BLUEPRINT.authoredScale || {})[problem.source];
  const d = Number(problem.difficulty);
  if (scale && Number.isFinite(d)) {
    const t = (Math.min(5, Math.max(1, d)) - 1) / 4;
    return Math.round((scale.min + t * (scale.max - scale.min)) * 100) / 100;
  }
  return problem.difficulty;
}

/**
 * A prompt's "shape" — the wording with all numbers blanked — so two problems
 * that read the same except for their numbers collapse to one signature. Used
 * to keep a single form from repeating the same-looking question.
 */
function promptSignature(s) {
  return String(s || '').replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim().slice(0, 90);
}

// ── Templates and near-copies ───────────────────────────────────────────────
//
// promptSignature (above) masks numbers in the first 90 characters, so it
// only catches the SAME wording. Two items can be one task in different words:
// "D lies on AB, E lies on AC, DE ∥ BC" was served twice in one form, and the
// same question sits in two Fable practice tests ("product of the two
// solutions of |2x − 5| = 11" / "... all real solutions ..."), so a retake
// served it again under a fresh id (external audit, 2026-10-07).
//
// A template is the set of CONTENT words, with numbers, vertex names (ABC,
// DEF) and filler removed. Two items of the same skill whose word sets overlap
// by TEMPLATE_OVERLAP are the same template.
const TEMPLATE_STOP = new Set(('the a an of in on at to is are be by for and or with that this what which value its it as from '
  + 'shown below above figure note not drawn scale following each one two three if then than has have how many much does do '
  + 'lies lie point points side sides segment segments length lengths measure measures measured units unit nearest whole number').split(' '));
const TEMPLATE_OVERLAP = 0.6;

function templateTokens(prompt) {
  const t = String(prompt || '')
    .replace(/\b[A-Z]{2,}\b/g, ' ')          // vertex and segment names: ABC, DE
    .toLowerCase()
    .replace(/note:[^.]*\./g, ' ')
    .replace(/△/g, ' triangle ').replace(/∥/g, ' parallel ').replace(/∠/g, ' angle ')
    .replace(/[^a-z\s]/g, ' ');
  return new Set(t.split(/\s+/).filter((w) => w.length >= 3 && !TEMPLATE_STOP.has(w)).map((w) => SYNONYM[w] || w));
}
// One word for one idea, so "average" and "mean" count as the same task.
const SYNONYM = { average: 'mean', averages: 'mean', means: 'mean', tests: 'test', scores: 'score', numbers: 'number', triangles: 'triangle' };

// Tasks that read differently but ask the same thing. Two of these on one form
// "consume substantial space" (external audit, 2026-10-07): a mean-after-
// removal item next to a what-score-raises-my-average item, a trig-ratio area
// next to a Pythagorean area. Word overlap misses them (they share almost no
// content words), so each is named.
const TASK_CONCEPTS = [
  ['changing-mean', (p) => /\b(mean|average)\b/i.test(p) && /(removed|added|another|next test|\d+(st|nd|rd|th) test|over \d+ tests|new (score|number|test)|wants (her|his|their|the) (average|mean))/i.test(p)],
  ['right-triangle-area', (p) => /\bright triangle\b/i.test(p) && /\barea\b/i.test(p)],
];
const conceptsOf = (prompt) => new Set(TASK_CONCEPTS.filter(([, test]) => test(String(prompt || ''))).map(([id]) => id));
// Across skills, a higher bar than within one: only near-identical wording.
const CROSS_SKILL_OVERLAP = 0.5;

function overlap(a, b) {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  const union = a.size + b.size - shared;
  return union ? shared / union : 0;
}

/** What two items are compared on. */
function fingerprint(p) {
  const norm = (t) => String(t == null ? '' : t).replace(/\s+/g, '').replace(/−/g, '-').toLowerCase();
  const choices = (p.options || []).map((o) => norm(o && typeof o === 'object' ? o.text : o)).sort().join('|');
  return { skillId: p.skillId, tokens: templateTokens(p.prompt), concepts: conceptsOf(p.prompt), choices, svg: p.svg || '' };
}

/** The same TASK, whatever the skill: one template, near-identical wording, or a shared named concept. */
const similarTask = (a, b) => sameTemplate(a, b)
  || overlap(a.tokens, b.tokens) >= CROSS_SKILL_OVERLAP
  || [...a.concepts].some((c) => b.concepts.has(c));

const sameTemplate = (a, b) => a.skillId === b.skillId && overlap(a.tokens, b.tokens) >= TEMPLATE_OVERLAP;
/** The same QUESTION under another id: same template, same choices, same (or no) figure. */
const nearCopy = (a, b) => sameTemplate(a, b) && a.choices === b.choices && a.svg === b.svg;

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
/** Lexicographic: the first position that differs decides. */
function compareRank(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function pickDiverse(candidates, usedSignatures, targetDifficulty, formPrints = []) {
  if (!candidates || !candidates.length) return null;
  const distance = (c) => {
    const d = preciseDifficulty(c);
    return targetDifficulty == null || d == null ? 0 : Math.abs(d - targetDifficulty);
  };
  // Ranked, in order: a template the form already has goes last; then a skill
  // the form already has (only differs when a fallback pool spans a whole
  // category); then wording-shape novelty; then nearness to the ramp target.
  const rank = (c) => {
    const fp = formPrints.length ? fingerprint(c) : null;
    return [
      fp && formPrints.some((f) => similarTask(f, fp)) ? 1 : 0,
      formPrints.filter((f) => f.skillId === c.skillId).length,
      usedSignatures.get(promptSignature(c.prompt)) || 0,
      distance(c),
    ];
  };
  let best = null, bestRank = null;
  for (const c of candidates) {
    const r = rank(c);
    // No early exit on a perfect rank: a later candidate may tie on novelty
    // and sit closer to the target, which is the whole point of the tie-break.
    if (!bestRank || compareRank(r, bestRank) < 0) { best = c; bestRank = r; }
  }
  return best;
}

/** A spec the problem generator can fulfill for an unfillable slot. */
function toGenerationSpec(slot, blueprint = DEFAULT_BLUEPRINT) {
  return {
    position: slot.position,
    skillId: slot.skillId,
    category: slot.category,
    // Rounded: an author writes an item at difficulty 3, not 2.87, and the
    // coverage worklist groups by this key (scripts/actTestCoverage.js).
    targetDifficulty: Math.round(slot.targetDifficulty),
    answerType: 'multiple-choice',
    optionCount: (blueprint.choicesPerItem || 4),
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
  const bank = bankFilter(blueprint);
  const sourcePinned = Array.isArray(blueprint.sources) && blueprint.sources.length > 0;
  const slots = buildSlots(blueprint, rng);
  // Never re-serve an item the student has already seen (cross-session), on top
  // of the within-form dedup this array already provides.
  const excludeIds = Array.isArray(opts.excludeIds) ? opts.excludeIds : [];
  const usedProblemIds = excludeIds.slice();
  const excludedCount = usedProblemIds.length;
  const usedSignatures = new Map();   // prompt-shape -> count, to avoid look-alikes
  const items = [];
  const gaps = [];
  const precise = new Map();          // problemId -> measured-or-authored difficulty, for ordering

  // Pacing (blueprint.visualTarget, blueprint.reasoningTarget = { min, max }).
  // After slot i the form should hold about min × (i + 1) / n of each paced
  // kind. A slot that finds the form behind that pace looks for one on its own
  // skill first — the kind furthest behind first; one that finds it two or
  // more behind (or out of slots to catch up in) may take one from any skill
  // in its CATEGORY (category counts — what the scaled score depends on —
  // never move). A kind at its max is passed over while anything else exists.
  // No targets: no change at all.
  const quotas = [['visual', blueprint.visualTarget], ['reasoning', blueprint.reasoningTarget]]
    .filter(([, t]) => t && Number.isFinite(t.min))
    .map(([key, t]) => ({ key, ...PACED_KINDS[key], min: t.min, max: Number.isFinite(t.max) ? t.max : Infinity, count: 0 }));
  let visuals = 0, reasoning = 0;

  // Near-copies: what the student has already seen (by content, not just id)
  // and what this form already holds. See nearCopy above.
  const seenPrints = [];
  if (excludeIds.length) {
    try {
      const seenDocs = await Problem.find({ problemId: { $in: excludeIds } }).select('skillId prompt options svg').lean();
      seenDocs.forEach((d) => seenPrints.push(fingerprint(d)));
    } catch { /* the id exclusion still applies */ }
  }
  const formPrints = [];
  const isNearCopy = (c) => {
    const fp = fingerprint(c);
    return seenPrints.some((f) => nearCopy(f, fp)) || formPrints.some((f) => nearCopy(f, fp));
  };

  for (let si = 0; si < slots.length; si++) {
    const slot = slots[si];
    if (!slot.skillId) { gaps.push(toGenerationSpec(slot, blueprint)); continue; }
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
      const inWindow = {
        isActive: true,
        difficulty: { $gte: lo, $lte: hi },
        problemId: { $nin: usedProblemIds },
        ...bank,
      };
      let candidates = [];
      const { difficulty: _anyD, ...anyDifficulty } = inWindow;
      const catSkills = byCat[slot.category] || [];
      // Kinds already at their max are kept out of every paced draw.
      const capped = quotas.filter((q) => q.count >= q.max);
      const avoidCapped = capped.length ? capped.map((q) => q.notFilter) : [];
      const query = (base, extra) => ({ ...base, ...(extra.length ? { $and: extra } : {}) });
      const behind = quotas
        .map((q) => ({ q, due: Math.ceil((q.min * (si + 1)) / slots.length) }))
        .filter(({ q, due }) => q.count < due && q.count < q.max)
        .sort((a, b) => (b.due - b.q.count) - (a.due - a.q.count));
      for (const { q, due } of behind) {
        const want = [q.filter, ...avoidCapped];
        candidates = await drawPool(Problem, query({ ...inWindow, skillId: slot.skillId }, want), rng, 8);
        // Urgent: two or more behind pace, or so few slots left that the
        // shortfall must be made up now. Then any skill in the category will
        // do, and as a last resort any difficulty.
        const short = q.min - q.count;
        const urgent = q.count < due - 1 || (short > 0 && slots.length - si <= short + 3);
        if (!candidates.length && urgent && catSkills.length) {
          candidates = await drawPool(Problem, query({ ...inWindow, skillId: { $in: catSkills } }, want), rng, 8);
          if (!candidates.length) candidates = await drawPool(Problem, query({ ...anyDifficulty, skillId: { $in: catSkills } }, want), rng, 8);
        }
        if (candidates.length) break;
      }
      // A capped kind is asked to stay out in the query itself (filtering a
      // drawn pool afterwards let a 13th visual slip through). When only
      // capped items are left in this skill's window, an uncapped item at
      // another difficulty, then one from the same category, beats going over.
      if (!candidates.length && capped.length) {
        candidates = await drawPool(Problem, query({ ...inWindow, skillId: slot.skillId }, avoidCapped), rng, 16);
        if (!candidates.length) candidates = await drawPool(Problem, query({ ...anyDifficulty, skillId: slot.skillId }, avoidCapped), rng, 16);
        if (!candidates.length && catSkills.length) candidates = await drawPool(Problem, query({ ...inWindow, skillId: { $in: catSkills } }, avoidCapped), rng, 16);
      }
      if (!candidates.length) {
        candidates = await drawPool(Problem, { ...inWindow, skillId: slot.skillId }, rng, 16);
      }
      if (!candidates.length && !sourcePinned) {
        // Widen: any difficulty for this skill, still excluding used items.
        // Not for a source-pinned blueprint: findNearDifficulty searches the
        // whole bank. The category fallback below draws any difficulty from
        // the pinned bank instead.
        const p = await Problem.findNearDifficulty(slot.skillId, center, usedProblemIds, { preferMultipleChoice: true });
        candidates = formEligible(p) && !hasBadDistractors(p) ? [p] : [];
      }
      if (!candidates.length) {
        // Same-category fallback: a thin sub-skill can be asked for more times
        // than it has items (a few categories have more slots than sub-skills).
        // Draw another item from the SAME reporting category so the form stays
        // exactly 45 items with the exact category composition the scaled score
        // depends on. The item keeps its own fine skillId for personalization.
        const catSkills = byCat[slot.category] || [];
        if (catSkills.length) {
          candidates = await drawPool(Problem, {
            skillId: { $in: catSkills },
            isActive: true,
            problemId: { $nin: usedProblemIds },
            ...bank,
          }, rng, 24);
        }
      }
      // Drop near-copies of anything already seen or already on this form;
      // only if that empties the pool does a near-copy beat a gap.
      const fresh = candidates.filter((c) => !isNearCopy(c));
      if (fresh.length) candidates = fresh;
      problem = pickDiverse(candidates, usedSignatures, slot.targetDifficulty, formPrints);
      // Record the item's OWN fine skill (fallback may cross sub-skills within
      // the category), so scoring & personalization attribute to the real skill.
      if (problem && problem.skillId) slot.skillId = problem.skillId;
    } catch (err) {
      // DB/query error — treat as a gap, keep assembling the rest.
      problem = null;
    }
    if (!problem) { gaps.push(toGenerationSpec(slot, blueprint)); continue; }
    if (isVisualItem(problem)) visuals += 1;
    if (isReasoningItem(problem)) reasoning += 1;
    quotas.forEach((q) => { if (q.member(problem)) q.count += 1; });
    formPrints.push(fingerprint(problem));
    precise.set(problem.problemId, preciseDifficulty(problem));
    usedProblemIds.push(problem.problemId);
    usedSignatures.set(promptSignature(problem.prompt), (usedSignatures.get(promptSignature(problem.prompt)) || 0) + 1);
    items.push(toClientItem(slot, problem));
  }

  // Sequence the FILLED form by the items' own difficulty. The ramp above
  // only steers which pool each slot draws from (a ±1 window, and shape
  // novelty wins inside it), so the assembled order still read as random:
  // "3 notebooks cost $12" turned up in the final third between a matrix sum
  // and a point-to-line distance (owner report, 2026-09-09). The real ACT
  // ramps, and pacing is taught on that assumption — move fast early, bank
  // time for the end. Stable, so the category interleave survives within
  // each difficulty band.
  const ordered = spreadFamilies(orderByDifficulty(items, (it) => precise.get(it.problemId)));

  return {
    items: ordered,
    gaps,
    coverage: {
      total: slots.length,
      filled: items.length,
      missing: gaps.length,
      pct: slots.length ? Math.round((items.length / slots.length) * 100) : 0,
      excluded: excludedCount,   // items withheld as already-seen (re-test freshness)
      visuals,                   // items answered from a figure or table
      reasoning,                 // multi-step reasoning items
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

// Two dollar amounts priced per unit: $6 for the first hour and $2.50 for each hour,
// $3 plus $2 for each mile. Garage pricing then taxi pricing back to back
// read as one question asked twice (external audit, 2026-10-05), though they
// sit under different skills.
const FEE_PLUS_RATE = /\$\s?[\d.,]+[^.?]{0,60}?\$\s?[\d.,]+\s*(?:per|for each|each|an?)\b/i;

/** What makes two neighbouring items feel like the same task. */
function familiesOf(item) {
  const fam = [];
  if (item && item.skillId) fam.push(`skill:${item.skillId}`);
  if (item && FEE_PLUS_RATE.test(String(item.content || ''))) fam.push('money-rates');
  return fam;
}

/**
 * Keep look-alike tasks off adjacent positions. Walks the ordered form; when
 * an item shares a family with the one before it, it trades places with the
 * nearest of the next few items that shares a family with neither neighbour.
 * The look-ahead is short (3) so the difficulty ramp barely moves. Positions
 * are renumbered because the position IS the question number.
 */
function spreadFamilies(items, lookAhead = 3) {
  const out = (items || []).slice();
  const clash = (a, b) => {
    if (!a || !b) return false;
    const fb = familiesOf(b);
    return familiesOf(a).some((f) => fb.includes(f));
  };
  for (let i = 1; i < out.length; i++) {
    if (!clash(out[i - 1], out[i])) continue;
    for (let j = i + 1; j < Math.min(out.length, i + 1 + lookAhead); j++) {
      // The swapped-in item must fit between out[i-1] and out[i+1], and the
      // displaced one must fit between out[j-1] and out[j+1] (when j > i+1).
      const fitsHere = !clash(out[i - 1], out[j]) && (j === i + 1 ? !clash(out[j], out[i]) : !clash(out[j], out[i + 1]));
      const fitsThere = j === i + 1 || (!clash(out[j - 1], out[i]) && !clash(out[i], out[j + 1]));
      if (fitsHere && fitsThere) { const t = out[i]; out[i] = out[j]; out[j] = t; break; }
    }
  }
  return out.map((it, idx) => ({ ...it, position: idx + 1 }));
}

/**
 * Re-sequence assembled items easiest-first and renumber their positions.
 *
 * Stable: items of equal difficulty keep their relative (category-interleaved)
 * order. An item with no difficulty is treated as middling (3) rather than
 * pushed to either end. Positions are rewritten 1..n because the position IS
 * the question number the student sees, grades against, and reviews by.
 */
function orderByDifficulty(items, keyOf) {
  const d = (it) => {
    const k = keyOf ? keyOf(it) : undefined;
    const n = Number(k != null ? k : it && it.difficulty);
    return Number.isFinite(n) ? n : 3;
  };
  return (items || [])
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (d(a.it) - d(b.it)) || (a.i - b.i))
    .map(({ it }, idx) => ({ ...it, position: idx + 1 }));
}

/** Flat list of the ACT content skillIds (for constraining the CAT engine). */
function skillPool(blueprint = DEFAULT_BLUEPRINT) {
  return Object.values(blueprint.skillsByCategory || {}).flat();
}

/**
 * Map a raw score to the approximate scaled 1-36 estimate.
 *
 * `formLength` is how many items the student was ACTUALLY served, which is not
 * always the blueprint's 45: assembleForm fills what the bank can fill and
 * reports the rest as `gaps`, so a thin bank — or a student deep enough into
 * the seen-ledger that the fresh items have run low — sits a SHORT form.
 *
 * Indexing the 45-row table with a short form's raw count silently caps the
 * student. A perfect 28-item form scored table[28] = 24: not "a 24-level
 * performance", but the highest number that form could physically return. And
 * because each re-test excludes everything already served, forms get shorter as
 * a student works through the bank — so the trend line the whole bootcamp loop
 * exists to produce drifts DOWNWARD while the student improves. A student who
 * aced their re-test was shown a drop and told it was their score.
 *
 * So normalize to the blueprint's length first: the table stays the scale, and
 * a short form maps onto it proportionally. `shortForm` is set when that
 * happened, so callers can say the estimate is off fewer questions instead of
 * presenting it as an equal comparison.
 */
function rawToScaled(raw, blueprint = DEFAULT_BLUEPRINT, formLength = null) {
  const table = blueprint.scaledScore && blueprint.scaledScore.scaledByRaw;
  if (!Array.isArray(table)) return null;
  const full = table.length - 1;                    // the raw score a full form tops out at
  const served = Number(formLength);
  const usable = Number.isFinite(served) && served > 0 ? Math.min(served, full) : full;
  const shortForm = usable < full;
  // Proportional when short, identity when the form is full-length.
  const projected = shortForm ? (Math.max(0, raw) / usable) * full : raw;
  const r = Math.max(0, Math.min(full, Math.round(projected)));
  return { scaled: table[r], approximate: true, shortForm, formLength: usable, blueprintLength: full };
}

/**
 * The likely band around an estimated score: what one 45-question sitting can
 * actually say. A single number read as a prediction ("you're a 23"); the
 * honest statement is a range (external review, 2026-10-07: "treat the 1-36
 * score as a rough estimate").
 *
 * The raw score is a count of independent right/wrong answers, so its
 * standard error is the binomial √(n·p·(1−p)). p is shrunk toward ½
 * ((raw + 1) / (n + 2)) so a perfect or zero score still gets a band. The
 * band is raw ± one standard error (about two in three sittings land inside
 * it), mapped through the same conversion table as the score itself.
 *
 * This is measurement noise only. How well the scale predicts the REAL ACT
 * is a separate question that needs paired official scores.
 *
 * @returns {{low:number, high:number}|null}
 */
function scaledRange(raw, total, blueprint = DEFAULT_BLUEPRINT) {
  const n = Number(total);
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(Number(raw))) return null;
  const p = (Number(raw) + 1) / (n + 2);
  const se = Math.sqrt(n * p * (1 - p));
  const at = (r) => {
    const s = rawToScaled(Math.max(0, Math.min(n, r)), blueprint, n);
    return s ? s.scaled : null;
  };
  const low = at(Math.floor(Number(raw) - se));
  const high = at(Math.ceil(Number(raw) + se));
  return low == null || high == null ? null : { low, high };
}

module.exports = {
  scaledRange,
  assembleForm,
  buildSlots,
  skillPool,
  rawToScaled,
  difficultyForPosition,
  promptSignature,
  pickDiverse,
  orderByDifficulty,
  spreadFamilies,
  familiesOf,
  preciseDifficulty,
  NOT_ON_FORMS,
  isVisualItem,
  isReasoningItem,
  templateTokens,
  fingerprint,
  sameTemplate,
  similarTask,
  nearCopy,
  bankFilter,
  getBlueprint: () => DEFAULT_BLUEPRINT,
};
