/**
 * sceneGate.js — the SAFETY layer for declarative geometry scenes.
 *
 * A scene (see public/js/sceneSpec.js) can leak the answer to the student's OWN
 * unsolved problem two ways: (1) it DEPICTS that problem and the student is meant
 * to find its values, or (2) it happens to STATE a value equal to the known
 * answer. This gate handles both — deterministically, never with an LLM — and
 * mirrors utils/visualGate.js (safety is math, not taste):
 *
 *   - redactAll: the scene is of the student's own problem → hide every displayed
 *     value ("x = ?"), keeping the figure's structure. The student still reasons
 *     about the picture; it just doesn't hand them the number.
 *   - leak check: if any value the scene would display equals the known answer,
 *     redact it; if redaction can't remove the collision, BLOCK the scene.
 *
 * Mode ladder matches the Visual Gate: shadow/audit_only observe only;
 * live_control / live_experimental enforce.
 *
 * Pure + synchronous (no LLM, no IO). Returns the scene to render (possibly
 * redacted, or null to drop) plus a decision record for the caller to log.
 */

const { extractNumbers } = require('./visualGate');
const { validateScene, extractSceneValues, redactScene } = require('../public/js/sceneSpec');

const TOL = 1e-6;
const LIVE = { live_control: true, live_experimental: true };

function intersects(a, b) {
  if (!a.length || !b.length) return false;
  return a.some((x) => b.some((y) => Math.abs(x - y) <= TOL));
}

/**
 * Does the scene display a value equal to the known answer?
 * @param {object} scene
 * @param {object} activeProblem { correctAnswer, status }
 * @returns {{leak:boolean, reasonCode:string}}
 */
function assessSceneLeak(scene, activeProblem) {
  if (!activeProblem || activeProblem.status === 'solved') {
    return { leak: false, reasonCode: 'NO_ACTIVE_PROBLEM' };
  }
  const answerVals = extractNumbers(activeProblem.correctAnswer || '');
  const shownVals = extractSceneValues(scene);
  if (intersects(shownVals, answerVals)) return { leak: true, reasonCode: 'SCENE_VALUE_LEAK' };
  return { leak: false, reasonCode: 'NO_LEAK' };
}

/**
 * Gate one scene.
 * @param {object} params
 * @param {object} params.scene
 * @param {object} [params.activeProblem]
 * @param {string} [params.mode='live_control']
 * @param {boolean} [params.redactAll=false]  scene depicts the student's own problem
 * @returns {{ scene: object|null, record: object }}
 */
function gateScene({ scene, activeProblem = null, mode = 'live_control', redactAll = false } = {}) {
  const v = validateScene(scene);
  if (!v.valid) {
    return { scene: null, record: { decision: 'block', reasonCode: 'INVALID_SCENE', errors: v.errors } };
  }
  const enforce = !!LIVE[mode];

  const answerValues = extractNumbers((activeProblem && activeProblem.correctAnswer) || '');

  // The scene IS the student's own problem → hide the to-be-found unknowns
  // (solve:true) and any value matching the known answer. Givens stay.
  if (redactAll) {
    const red = redactScene(scene, { redactSolve: true, answerValues });
    return { scene: enforce ? red : scene, record: { decision: enforce ? 'transform' : 'allow', reasonCode: 'REDACTED_OWN_PROBLEM' } };
  }

  const s = assessSceneLeak(scene, activeProblem);
  if (!s.leak) {
    return { scene, record: { decision: 'allow', reasonCode: s.reasonCode } };
  }

  // Leak → redact the answer-matching value; block only if that can't clear it.
  const red = redactScene(scene, { answerValues });
  const stillLeaks = assessSceneLeak(red, activeProblem).leak;
  if (enforce) {
    if (!stillLeaks) return { scene: red, record: { decision: 'transform', reasonCode: 'REDACTED_LEAK' } };
    return { scene: null, record: { decision: 'block', reasonCode: s.reasonCode } };
  }
  // shadow / audit_only / off: observe, never change what renders.
  return { scene, record: { decision: stillLeaks ? 'block' : 'transform', reasonCode: s.reasonCode } };
}

module.exports = { gateScene, assessSceneLeak };
