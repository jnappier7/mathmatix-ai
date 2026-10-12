/**
 * MODULAR TESTS — the digital SAT's two-stage adaptive section.
 *
 * The SAT Math section is two 22-question, 35-minute modules. Module 1 is the
 * same for everyone; how a student does on it decides whether Module 2 is the
 * HARDER or the EASIER one, and once Module 2 starts Module 1 is closed. The
 * score is then read off the whole 44-item response pattern with IRT, so the
 * route is priced in: a perfect easier Module 2 cannot reach 800, because those
 * items say less about a strong student than the harder ones would have.
 *
 * Everything here is pure (no DB) so it can be pinned in unit tests;
 * routes/actTest.js does the I/O. A blueprint without `modules` is a single
 * fixed form (the ACT) and none of this runs.
 *
 * @module utils/testModules
 */

const { probabilityCorrect } = require('./irt');
const { difficultyToTheta } = require('./itemCalibration');

/** Does this blueprint run as modules? */
function isModular(blueprint) {
  return !!(blueprint && Array.isArray(blueprint.modules) && blueprint.modules.length > 1);
}

/** Item positions a module occupies: Module 1 is 1..22, Module 2 is 23..44. */
function moduleRange(blueprint, n) {
  let start = 1;
  for (const m of blueprint.modules) {
    if (m.n === n) return { first: start, last: start + m.items - 1 };
    start += m.items;
  }
  return null;
}

/**
 * The blueprint assembleForm builds ONE module from: the module's own domain
 * counts and ramp (the route's ramp for a routed module), everything else —
 * skills, answer types, the source pin — inherited from the test.
 */
function moduleBlueprint(blueprint, n, route) {
  const mod = blueprint.modules.find((m) => m.n === n);
  if (!mod) throw new Error(`No module ${n} in ${blueprint.testId}`);
  const ramp = (route && mod.routes && mod.routes[route] && mod.routes[route].difficultyRamp) || mod.difficultyRamp;
  const { modules: _m, routing: _r, irtScale: _s, ...rest } = blueprint;
  return {
    ...rest,
    totalItems: mod.items,
    timeLimitMinutes: mod.timeLimitMinutes,
    categoryWeights: mod.categoryWeights,
    difficultyRamp: ramp,
  };
}

/** The IRT difficulty (logits) of a served item. */
function itemB(item) {
  return difficultyToTheta(item && item.difficulty != null ? item.difficulty : 3);
}

// Prior for the scoring estimate: centred on an average student, wide enough
// that 44 answers dominate it. It is what keeps an all-right or all-wrong
// pattern finite.
const PRIOR_MEAN = 0;
const PRIOR_SD = 1.25;

/**
 * MAP ability (Rasch) from a full response pattern, by Newton-Raphson.
 *
 * NOT utils/irt.js estimateAbilityMAP: that one serves the screener's
 * one-question-at-a-time CAT and caps every update at ±0.8 logits from its
 * starting point. Called once on a whole test it pinned every score inside
 * 510 ± 96 — a perfect paper and a blank one both read as average-ish.
 */
function mapAbility(graded) {
  const priorPrec = 1 / (PRIOR_SD * PRIOR_SD);
  let theta = PRIOR_MEAN;
  for (let i = 0; i < 50; i++) {
    let g = -(theta - PRIOR_MEAN) * priorPrec;
    let h = -priorPrec;
    for (const r of graded) {
      const p = probabilityCorrect(theta, r.b, 1);
      g += r.correct - p;
      h -= p * (1 - p);
    }
    const step = g / h;
    theta = Math.max(-6, Math.min(6, theta - step));
    if (Math.abs(step) < 1e-6) break;
  }
  let info = priorPrec;
  for (const r of graded) {
    const p = probabilityCorrect(theta, r.b, 1);
    info += p * (1 - p);
  }
  return { theta, se: 1 / Math.sqrt(info) };
}

/** Ability from a set of graded responses on served items. */
function abilityFrom(items, responses) {
  const byPos = new Map((items || []).map((it) => [it.position, it]));
  const graded = [];
  for (const r of responses || []) {
    const it = byPos.get(r.position);
    if (!it) continue;
    graded.push({ b: itemB(it), correct: r.correct ? 1 : 0 });
  }
  const { theta, se } = mapAbility(graded);
  return { theta, se, n: graded.length };
}

/**
 * Which Module 2 a finished Module 1 earns. Routed on ABILITY, not a raw
 * count, so two Module 1 forms of slightly different difficulty route alike.
 * College Board does not publish its cut; blueprint.routing.harderIfTheta is
 * our estimate, documented there.
 */
function routeFor(blueprint, module1Items, module1Responses) {
  const { theta, se } = abilityFrom(module1Items, module1Responses);
  const cut = (blueprint.routing && Number.isFinite(blueprint.routing.harderIfTheta))
    ? blueprint.routing.harderIfTheta : 0;
  return { route: theta >= cut ? 'harder' : 'easier', theta, se };
}

/** Map an ability to the test's reporting scale, rounded and clamped. */
function thetaToScale(theta, scale) {
  const step = scale.round || 10;
  const raw = scale.center + scale.perLogit * theta;
  const clamped = Math.max(scale.min, Math.min(scale.max, raw));
  return Math.round(clamped / step) * step;
}

/**
 * The scaled score and its likely range from the whole response pattern.
 * Same shape rawToScaled returns, so reports and history read it unchanged.
 * Unanswered questions are wrong, as on the real test (gradeSession already
 * writes them as incorrect rows).
 */
function irtScaled(items, responses, blueprint) {
  const scale = blueprint.irtScale;
  const { theta, se } = abilityFrom(items, responses);
  const total = (items || []).length;
  const full = blueprint.totalItems || total;
  return {
    scaled: thetaToScale(theta, scale),
    range: { low: thetaToScale(theta - se, scale), high: thetaToScale(theta + se, scale) },
    approximate: true,
    shortForm: total < full,
    formLength: total,
    blueprintLength: full,
  };
}

module.exports = {
  mapAbility,
  isModular,
  moduleRange,
  moduleBlueprint,
  abilityFrom,
  routeFor,
  thetaToScale,
  irtScaled,
};
