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
  const anchor = [...b.values()].reduce((a, x) => a + x, 0) / (b.size || 1);

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
    let maxShift = 0;
    for (const [id, obs] of byItem) {
      const usable = obs.filter((o) => usablePeople.has(o.person))
        .map((o) => ({ theta: theta.get(o.person), correct: o.correct }));
      if (!usable.length) continue;
      const prev = b.get(id);
      const next = estimateItemDifficulty(usable, { initial: prev }).b;
      b.set(id, next);
      maxShift = Math.max(maxShift, Math.abs(next - prev));
    }

    // Re-pin the scale after each sweep.
    const mean = [...b.values()].reduce((a, x) => a + x, 0) / (b.size || 1);
    const shift = anchor - mean;
    for (const [id, v] of b) b.set(id, v + shift);
    for (const [p, v] of theta) theta.set(p, v + shift);

    if (maxShift < tolerance) { converged = true; break; }
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
    const bPrior = difficultyToTheta(priorDifficulty);
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
      anchor,
      meanItemsPerPerson,
      biasCorrection,
      minResponses,
      shrinkK,
    },
  };
}

module.exports = {
  calibrateItems,
  estimateItemDifficulty,
  dropNotReached,
  difficultyToTheta,
  thetaToDifficulty,
};
