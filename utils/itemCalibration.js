// utils/itemCalibration.js
//
// Estimate item difficulty from REAL student responses, instead of from an
// author's guess or a content heuristic.
//
// Every `difficulty` in the bank today was assigned by whoever wrote the item
// (or by scripts/recalibrate-problem-difficulties.js, which reads number size
// and operation count off the prompt). Neither has ever met a student. The
// assembler places each slot against a target difficulty from the blueprint's
// ramp, so if those numbers are wrong the form's ramp is wrong — the "easy"
// opening is not easy, and the pacing strategy the tutor teaches on top of it
// ("move fast early, bank time for the end") is advice about a test that does
// not exist.
//
// WHY NOT JUST PERCENT-CORRECT
// Because who saw the item is not random. An item served mostly to strong
// students looks easy; the same item served to strugglers looks hard. On the
// adaptive screener this is not a bias, it is the entire design — the CAT
// deliberately routes harder items to higher ability. Ranking items by raw
// p-value would therefore rank them partly by the ability of whoever happened
// to see them.
//
// So this estimates a Rasch (1PL) model: every student gets an ability theta,
// every item a difficulty b, and
//     P(correct) = 1 / (1 + exp(-(theta - b)))
// is fit to the whole response matrix at once by alternating a person step and
// an item step until both settle. An item is then "hard" relative to the
// students who actually saw it, which is the only sense in which difficulty
// means anything.
//
// Pure: responses in, estimates out. No DB, no I/O — scripts/calibrateItemDifficulty.js
// does the fetching and the writing, and tests/unit/itemCalibration.test.js
// checks that this recovers difficulties it was never told, from data generated
// against a known truth.

const { probabilityCorrect } = require('./irt');

// Our bank stores difficulty 1-5; IRT works in logits. models/problem.js fixes
// the correspondence (1 -> -3, 3 -> 0, 5 -> +3), so use the same one here or a
// calibrated item would land on a different scale than an uncalibrated one.
const DIFFICULTY_MIN = 1;
const DIFFICULTY_MAX = 5;

function difficultyToTheta(difficulty) {
  const d = Math.max(DIFFICULTY_MIN, Math.min(DIFFICULTY_MAX, Number(difficulty) || 3));
  return ((d - 1) / 4) * 6 - 3;
}

function thetaToDifficulty(theta) {
  const t = Number.isFinite(theta) ? theta : 0;
  const d = Math.round(((t + 3) / 6) * 4 + 1);
  return Math.max(DIFFICULTY_MIN, Math.min(DIFFICULTY_MAX, d));
}

/**
 * The difficulty an estimate should be shrunk toward, for one Problem doc.
 *
 * `problem.difficulty` is the LIVE number, and after a --apply run it IS the
 * calibrated one. Feeding that back in as the prior on the next run turns a
 * repeating job into a ratchet, in three separate places:
 *
 *   - the scale anchor is the MEAN of the priors, so once a run moves the
 *     bank's centre, the next run pins the scale to the moved centre and the
 *     whole bank drifts with nothing holding it. (See the anchor comment in
 *     calibrateItems: the point of pinning to the authored mean is that a
 *     recalibrated item stays comparable to one never calibrated.)
 *   - the shrinkage `w*estimate + (1-w)*prior` stops being regularization and
 *     becomes a random walk: at n=26 each run moves 56% of the way from last
 *     month's noise to this month's.
 *   - `suspectKey` only fires when the prior is <= 2, so an item that was
 *     rewritten upward can never again be spotted as mis-keyed rather than hard.
 *
 * So the prior is the AUTHORED difficulty, forever. --apply stores it in
 * calibration.priorDifficulty precisely so it survives being overwritten.
 * Pinned by "a monthly re-run does not ratchet" in the unit tests.
 *
 * @param {Object} problem a lean Problem doc ({difficulty, calibration})
 * @returns {number|undefined} the authored difficulty
 */
function authoredPrior(problem) {
  if (!problem) return undefined;
  const stored = Number(problem.calibration && problem.calibration.priorDifficulty);
  if (Number.isFinite(stored) && stored >= DIFFICULTY_MIN && stored <= DIFFICULTY_MAX) return stored;
  return problem.difficulty;
}

/**
 * Drop the trailing run of unanswered items from a timed form.
 *
 * A blank at the end of a timed section usually means the clock ran out, not
 * that the student could not do it. Our difficulty ramp deliberately puts the
 * hardest items last, so counting not-reached items as WRONG would feed the
 * clock straight into the difficulty estimate and make the end of every form
 * look harder than it is — the ramp would then steepen itself on each
 * recalibration, a slow feedback loop with nothing to stop it.
 *
 * A blank the student skipped PAST (they answered something later) is a real
 * omission and stays scored wrong, which is standard practice: they saw it and
 * chose to move on.
 *
 * @param {Array} responses ordered by position, each {answered: boolean, ...}
 * @returns {Array} the same rows with the trailing unanswered run removed
 */
function dropNotReached(responses) {
  const rows = Array.isArray(responses) ? responses : [];
  let end = rows.length;
  while (end > 0 && !rows[end - 1].answered) end -= 1;
  return rows.slice(0, end);
}

/**
 * Ability for one student, for OFFLINE fitting.
 *
 * irt.estimateAbility solves the same equation, and the model itself
 * (probabilityCorrect) is shared with it — but that function is tuned for the
 * LIVE adaptive screener and three of its choices are wrong here:
 *   - it caps theta at +/-0.8 change per call, so one surprising answer cannot
 *     swing a student mid-test. Offline we want the actual MLE; the cap stops
 *     the alternation below from ever converging.
 *   - it rounds to 2dp, which is fine for a running estimate and is
 *     quantization noise when it feeds an item estimate.
 *   - it logs a line on every clamp. Over a whole bank that is millions of
 *     lines of stdout.
 * So the CAT keeps its damping and this keeps the plain estimator.
 */
function estimateThetaBatch(responses, options = {}) {
  const { initial = 0, maxIterations = 50, tolerance = 1e-4, maxAbs = 5 } = options;
  let theta = initial;
  for (let i = 0; i < maxIterations; i++) {
    let first = 0;
    let second = 0;
    for (const { difficulty, correct } of responses) {
      const p = probabilityCorrect(theta, difficulty, 1);
      first += ((correct ? 1 : 0) - p);
      second += p * (1 - p);
    }
    if (second < 1e-9) break;
    const step = first / second;
    theta += step;
    if (theta > maxAbs) { theta = maxAbs; break; }
    if (theta < -maxAbs) { theta = -maxAbs; break; }
    if (Math.abs(step) < tolerance) break;
  }
  return Math.max(-maxAbs, Math.min(maxAbs, theta));
}

/**
 * Estimate one item's difficulty given the abilities of the students who saw
 * it. Newton-Raphson on the 1PL item log-likelihood; the mirror image of the
 * person step above, which solves the same equation for theta instead.
 */
function estimateItemDifficulty(observations, options = {}) {
  const { initial = 0, maxIterations = 50, tolerance = 1e-4, maxAbs = 4 } = options;
  if (!observations.length) return { b: initial, converged: false };

  let b = initial;
  for (let i = 0; i < maxIterations; i++) {
    let first = 0;
    let second = 0;
    for (const { theta, correct } of observations) {
      const p = probabilityCorrect(theta, b, 1);
      // dL/db = sum(p - y). The second derivative is -sum(p(1-p)), i.e. the
      // NEGATIVE of the information below — so the Newton step that maximizes
      // the likelihood ADDS first/second. (Subtracting it walks downhill and
      // pushes every item away from its true difficulty, which is what the
      // recovery test caught.)
      first += (p - (correct ? 1 : 0));
      second += p * (1 - p);
    }
    if (second < 1e-9) break;                 // no information left to use
    const step = first / second;
    b += step;
    // A perfectly answered (or perfectly missed) item has no finite MLE; the
    // iteration would walk off to infinity. Hold it at the edge of the scale
    // and let the caller flag it.
    if (b > maxAbs) { b = maxAbs; break; }
    if (b < -maxAbs) { b = -maxAbs; break; }
    if (Math.abs(step) < tolerance) return { b, converged: true };
  }
  return { b: Math.max(-maxAbs, Math.min(maxAbs, b)), converged: false };
}

/**
 * Calibrate a whole response matrix.
 *
 * @param {Array} rows          {userId, problemId, correct} — one per response
 * @param {Object} priors       problemId -> authored difficulty (1-5)
 * @param {Object} [options]
 *   minResponses  an item below this is reported but never rewritten (default 25)
 *   shrinkK       prior weight: w = n/(n+K) (default 20)
 *   maxIterations alternating passes (default 30)
 * @returns {{items: Array, meta: Object}}
 */
function calibrateItems(rows, priors = {}, options = {}) {
  const {
    minResponses = 25,
    shrinkK = 20,
    maxIterations = 30,
    tolerance = 1e-3,
    // Which items define the scale (see the anchor below). Default: all of them.
    anchorIds = null,
    // Weight per anchor id (default 1). A pooled fit passes how many distinct
    // items each pool stands for, so its anchor lands where an item-level fit
    // over the same items would put it.
    anchorWeights = null,
    // What a thin estimate is shrunk toward, per id. Default: its prior. A
    // pooled fit (a template's, a bank level's) is a better target than the
    // authored number when the authored scale is the thing in doubt.
    shrinkTo = null,
  } = options;

  // ── Index the matrix ──
  const byItem = new Map();
  const byPerson = new Map();
  for (const r of rows || []) {
    if (!r || !r.problemId || r.userId == null) continue;
    const correct = !!r.correct;
    const person = String(r.userId);
    if (!byItem.has(r.problemId)) byItem.set(r.problemId, []);
    if (!byPerson.has(person)) byPerson.set(person, []);
    byItem.get(r.problemId).push({ person, correct });
    byPerson.get(person).push({ problemId: r.problemId, correct });
  }

  // A student who got everything right (or everything wrong) has no finite
  // ability estimate and says nothing about which items are harder than which.
  // Standard JMLE drops them rather than letting them drag the scale.
  const usablePeople = new Set();
  let droppedPeople = 0;
  for (const [person, resp] of byPerson) {
    const n = resp.length;
    const k = resp.filter((x) => x.correct).length;
    if (n >= 2 && k > 0 && k < n) usablePeople.add(person);
    else droppedPeople += 1;
  }

  // ── Starting values: the authored difficulties, on the theta scale ──
  const b = new Map();
  for (const id of byItem.keys()) b.set(id, difficultyToTheta(priors[id]));
  const theta = new Map();
  for (const p of usablePeople) theta.set(p, 0);

  // Anchor: the mean of the authored priors over the calibrated set. JMLE can
  // slide theta and b together without changing the likelihood at all, so the
  // scale has to be pinned to something. Pinning it to the priors' mean keeps
  // a recalibrated item comparable to one that was never calibrated — centre
  // on 0 instead and a strong cohort would quietly re-rate the whole bank.
  //
  // anchorIds narrows that to a reference set. With several banks authored on
  // different scales (one bank's "2" is another's "3"), the mean over ALL of
  // them is an arbitrary blend; pinning to one bank's authored mean makes that
  // bank the reference and equates the others to it — the role a reference
  // form plays in ACT's own equating.
  //
  // An item every usable student got right (or wrong) has no finite estimate:
  // it sits at the edge of the scale and moves whenever the scale does. In the
  // anchor it drags the pin around with it, so it stays out of the anchor —
  // unless nothing else is left to pin to.
  const isExtreme = (id) => {
    const usable = byItem.get(id).filter((o) => usablePeople.has(o.person));
    const right = usable.filter((o) => o.correct).length;
    return usable.length > 0 && (right === 0 || right === usable.length);
  };
  const finite = (ids) => { const f = ids.filter((id) => !isExtreme(id)); return f.length ? f : ids; };
  const anchorSet = anchorIds ? finite([...b.keys()].filter((id) => anchorIds.has(id))) : [];
  const anchorKeys = anchorSet.length ? anchorSet : finite([...b.keys()]);
  const weightOf = (id) => (anchorWeights && Number(anchorWeights[id]) > 0 ? Number(anchorWeights[id]) : 1);
  const totalWeight = anchorKeys.reduce((a, id) => a + weightOf(id), 0) || 1;
  const meanOver = (keys) => keys.reduce((a, id) => a + weightOf(id) * b.get(id), 0) / totalWeight;
  const anchor = meanOver(anchorKeys);

  // Convergence is judged ONLY over the items this run could write. An item
  // with one response has no finite MLE and jitters at the edge of the scale
  // forever, so on a real bank — thousands of items, most of them barely seen
  // — a maxShift taken over everything never settles and `converged` is false
  // by construction. That is fine for a human reading a dry run and useless as
  // a gate for an unattended --apply, which is what it now feeds. Thin items
  // still get fitted and reported; they just do not get a vote on whether the
  // fit is stable, because nothing acts on them.
  //
  // Likewise an item every usable student got right (or wrong): it has no
  // finite MLE either, however many responses it has, and is held at the edge
  // of the scale, where each re-pin knocks it off and the next sweep puts it
  // back. Given a vote it reports a shift every iteration, so ONE such item
  // (an easy question all 30 of its takers got right) kept `converged` false
  // forever and an unattended --apply wrote nothing at all. It is still fitted,
  // reported and writable; it just does not decide whether the fit settled.
  const convergenceIds = new Set();
  for (const [id, obs] of byItem) {
    const usable = obs.filter((o) => usablePeople.has(o.person));
    const right = usable.filter((o) => o.correct).length;
    if (usable.length >= minResponses && right > 0 && right < usable.length) convergenceIds.add(id);
  }
  // Nothing is writable yet -> there is nothing to be stable ABOUT. Report
  // converged:false rather than letting an empty max() report success.
  const convergenceBasis = convergenceIds.size ? 'writable-items' : 'none';

  let iterations = 0;
  let converged = false;
  for (let it = 0; it < maxIterations; it++) {
    iterations = it + 1;

    // Person step — ability given current item difficulties.
    for (const person of usablePeople) {
      const resp = byPerson.get(person)
        .map((x) => ({ difficulty: b.get(x.problemId), correct: x.correct }));
      theta.set(person, estimateThetaBatch(resp, { initial: theta.get(person) }));
    }

    // Item step — difficulty given current abilities.
    const before = new Map(b);
    for (const [id, obs] of byItem) {
      const usable = obs.filter((o) => usablePeople.has(o.person))
        .map((o) => ({ theta: theta.get(o.person), correct: o.correct }));
      if (!usable.length) continue;
      const prev = b.get(id);
      const next = estimateItemDifficulty(usable, { initial: prev }).b;
      b.set(id, next);
    }

    // Re-pin the scale after each sweep.
    const shift = anchor - meanOver(anchorKeys);
    for (const [id, v] of b) b.set(id, v + shift);
    for (const [p, v] of theta) theta.set(p, v + shift);

    // Settled = the PINNED scale stopped moving. Measured before the re-pin,
    // an item held at the edge of the scale (snapped back there every sweep)
    // shows up as a constant translation of everything else, which the re-pin
    // undoes — the fit has settled and the old check said it never would.
    let maxShift = 0;
    for (const id of convergenceIds) maxShift = Math.max(maxShift, Math.abs(b.get(id) - before.get(id)));

    if (convergenceBasis !== 'none' && maxShift < tolerance) { converged = true; break; }
  }

  // ── Correct the JMLE spread bias ──
  // Joint maximum likelihood estimates item difficulties that are too SPREAD
  // OUT, by roughly K/(K-1) where K is how many items each student answered:
  // the same responses are used to estimate the people and the items, so each
  // absorbs a little of the other's error. On a 45-item form that is ~2%, but
  // on short response vectors it is large — with 5 items the estimates come
  // back about 25% too extreme, which is exactly what the recovery test saw
  // before this correction existed (true -2.40 estimated as -3.64).
  //
  // Wright's correction scales the deviation from the anchor, not the anchor
  // itself: the middle of the scale is not biased, its ends are.
  const meanItemsPerPerson = usablePeople.size
    ? [...usablePeople].reduce((a, p) => a + byPerson.get(p).length, 0) / usablePeople.size
    : 0;
  const biasCorrection = meanItemsPerPerson > 1 ? (meanItemsPerPerson - 1) / meanItemsPerPerson : 1;
  for (const [id, v] of b) b.set(id, anchor + (v - anchor) * biasCorrection);

  // ── Report ──
  const items = [];
  for (const [id, obs] of byItem) {
    const n = obs.length;
    const nCorrect = obs.filter((o) => o.correct).length;
    const usableN = obs.filter((o) => usablePeople.has(o.person)).length;
    const pValue = n ? nCorrect / n : null;
    const priorDifficulty = Number(priors[id]) || 3;
    const target = shrinkTo && Number.isFinite(Number(shrinkTo[id])) ? Number(shrinkTo[id]) : priorDifficulty;
    const bPrior = difficultyToTheta(target);
    const bEstimate = b.get(id);
    // Empirical-Bayes shrinkage: a 30-response estimate is not a 300-response
    // estimate, and pretending otherwise makes the bank jitter on every run.
    const w = usableN / (usableN + shrinkK);
    const bFinal = w * bEstimate + (1 - w) * bPrior;
    const difficulty = thetaToDifficulty(bFinal);
    const extreme = nCorrect === 0 || nCorrect === n;

    items.push({
      problemId: id,
      n,
      usableN,
      pValue,
      priorDifficulty,
      estimatedTheta: bEstimate,
      shrunkTheta: bFinal,
      difficulty,
      delta: difficulty - priorDifficulty,
      weight: w,
      extreme,
      enoughData: usableN >= minResponses,
      // A big move is not automatically a better number. An item authored as
      // easy that almost everyone misses is more often MIS-KEYED than hard —
      // the same signal utils/../ItemKeyDispute records from the tutor's side.
      // Worth a human's eye before it is trusted as a difficulty.
      suspectKey: pValue !== null && pValue < 0.25 && priorDifficulty <= 2 && usableN >= minResponses,
    });
  }
  items.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || y.usableN - x.usableN);

  return {
    items,
    meta: {
      responses: (rows || []).length,
      items: byItem.size,
      people: byPerson.size,
      usablePeople: usablePeople.size,
      droppedPeople,
      iterations,
      converged,
      convergenceBasis,
      writableItems: convergenceIds.size,
      anchor,
      anchoredOn: anchorSet.length ? 'reference-set' : 'all',
      meanItemsPerPerson,
      biasCorrection,
      minResponses,
      shrinkK,
    },
  };
}

function thetaToDifficultyExact(theta) {
  const t = Number.isFinite(theta) ? theta : 0;
  return Math.max(DIFFICULTY_MIN, Math.min(DIFFICULTY_MAX, ((t + 3) / 6) * 4 + 1));
}

/**
 * The wording an item shares with the rest of its template: numbers out.
 * "Solve for x: log_5(2x) = 3" and "Solve for x: log_3(4x) = 4" are one shape.
 */
function promptShape(prompt) {
  return String(prompt || '').replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim();
}
const templateKey = (p) => `${p.source || ''}|${p.skillId || ''}|${promptShape(p.prompt)}`;
const bandKey = (p) => `${p.source || ''}|${authoredPrior(p)}`;

/**
 * Calibrate in three tiers, so a difficulty can be MEASURED long before every
 * item has its own 25 responses.
 *
 * WHY
 * The banks were authored on different scales. On the same skills, the
 * enhanced drop (rated 1-3, one rating per template) averages almost a whole
 * point below the Fable bank (rated 1-5 per item), so the form builder, which
 * orders a test by difficulty, interleaves them wrong: an enhanced "2" lands
 * beside a Fable "2" it is not equal to. Per-item calibration fixes that only
 * once an item has n >= 25; across ~2,100 items that is thousands of tests.
 * ACT never meets this problem: no item reaches a scored slot until it has
 * been field-tested. We have to serve un-pretested items, so pool them:
 *
 *   band      one bank's authored level ("enhanced, authored 2"): hundreds of
 *             items, so it reaches n >= minResponses within tens of tests. This
 *             is what maps each bank's scale onto the reference bank's.
 *   template  items that differ only in their numbers ("Solve for x:
 *             log_#(#x) = #"), which are near-equal in difficulty by
 *             construction.
 *   item      the existing per-item estimate, once an item has its own data.
 *
 * Each tier shrinks toward the one above it rather than to the authored number,
 * so a thin template inherits its bank's corrected scale, not the bias being
 * corrected. All three are pinned to the reference source's AUTHORED mean
 * (weighted by items), so they share one scale and the reference bank stays
 * where its authors put it on average — the others are equated to it.
 *
 * Every problem in `problems` gets a resolution, including ones nobody has
 * answered yet: an unseen item in a measured band takes the band's value.
 * Resolution order: item, then template (2+ members), then band.
 *
 * @param {Array} rows      {userId, problemId, correct}
 * @param {Array} problems  lean docs: {problemId, source, skillId, prompt, difficulty, calibration}
 * @param {Object} [options] minResponses, shrinkK, referenceSource
 * @returns {{resolved: Array, levels: {band, template, item}}}
 */
function calibratePooled(rows, problems, options = {}) {
  const { minResponses = 25, shrinkK = 20, referenceSource = null } = options;
  const byId = new Map((problems || []).map((p) => [p.problemId, p]));
  const usable = (rows || []).filter((r) => r && byId.has(r.problemId));
  const isRef = (p) => referenceSource != null && p.source === referenceSource;

  // Distinct ANSWERED reference items behind each pool, the anchor weight.
  const seen = new Set(usable.map((r) => r.problemId));
  const refWeights = (keyOf) => {
    const w = {};
    for (const id of seen) {
      const p = byId.get(id);
      if (isRef(p)) w[keyOf(p)] = (w[keyOf(p)] || 0) + 1;
    }
    return w;
  };
  const fitLevel = (keyOf, shrinkTo) => {
    const priors = {};
    const sums = {};
    for (const p of byId.values()) {
      const k = keyOf(p);
      (sums[k] = sums[k] || []).push(Number(authoredPrior(p)) || 3);
    }
    for (const [k, v] of Object.entries(sums)) priors[k] = v.reduce((a, x) => a + x, 0) / v.length;
    const weights = refWeights(keyOf);
    const out = calibrateItems(
      usable.map((r) => ({ userId: r.userId, correct: r.correct, problemId: keyOf(byId.get(r.problemId)) })),
      priors,
      {
        minResponses,
        shrinkK,
        anchorIds: Object.keys(weights).length ? new Set(Object.keys(weights)) : null,
        anchorWeights: weights,
        shrinkTo,
      },
    );
    const est = new Map(out.items.map((i) => [i.problemId, i]));
    const members = {};
    for (const p of byId.values()) members[keyOf(p)] = (members[keyOf(p)] || 0) + 1;
    return { est, meta: out.meta, members };
  };
  const exactOf = (e) => thetaToDifficultyExact(e.shrunkTheta);

  const band = fitLevel(bandKey, null);
  const bandTarget = (key) => { const e = band.est.get(key); return e && e.enoughData ? exactOf(e) : undefined; };

  const tShrink = {};
  for (const p of byId.values()) {
    const t = bandTarget(bandKey(p));
    if (t !== undefined) tShrink[templateKey(p)] = t;
  }
  const template = fitLevel(templateKey, tShrink);
  const templateUsable = (key) => {
    const e = template.est.get(key);
    return e && e.enoughData && !e.suspectKey && template.members[key] >= 2 ? e : null;
  };

  const iShrink = {};
  for (const p of byId.values()) {
    const t = templateUsable(templateKey(p));
    const target = t ? exactOf(t) : bandTarget(bandKey(p));
    if (target !== undefined) iShrink[p.problemId] = target;
  }
  const item = fitLevel((p) => p.problemId, iShrink);

  const resolved = [];
  for (const p of byId.values()) {
    const authored = Number(authoredPrior(p)) || 3;
    const i = item.est.get(p.problemId);
    const t = templateUsable(templateKey(p));
    const bd = band.est.get(bandKey(p));
    let level = null;
    let e = null;
    if (i && i.enoughData && !i.suspectKey) { level = 'item'; e = i; }
    else if (t) { level = 'template'; e = t; }
    else if (bd && bd.enoughData) { level = 'band'; e = bd; }
    resolved.push({
      problemId: p.problemId,
      level,
      priorDifficulty: authored,
      difficulty: e ? thetaToDifficulty(e.shrunkTheta) : null,
      exact: e ? Math.round(exactOf(e) * 100) / 100 : null,
      theta: e ? e.shrunkTheta : null,
      n: e ? e.usableN : (i ? i.usableN : 0),
      pValue: e ? e.pValue : (i ? i.pValue : null),
      suspectKey: !!(i && i.suspectKey) || !!(template.est.get(templateKey(p)) || {}).suspectKey,
    });
  }
  // Each bank's authored levels on the common scale: the equating table.
  const bands = [...band.est.values()].map((e) => ({
    key: e.problemId,
    authored: e.priorDifficulty,
    exact: Math.round(exactOf(e) * 100) / 100,
    n: e.usableN,
    pValue: e.pValue,
    enoughData: e.enoughData,
    members: band.members[e.problemId] || 0,
  })).sort((x, y) => x.key.localeCompare(y.key, 'en', { numeric: true }));
  return { resolved, bands, levels: { band: band.meta, template: template.meta, item: item.meta } };
}

module.exports = {
  calibratePooled,
  promptShape,
  thetaToDifficultyExact,
  calibrateItems,
  authoredPrior,
  estimateItemDifficulty,
  dropNotReached,
  difficultyToTheta,
  thetaToDifficulty,
};
