/**
 * featureFlags.js — server-controlled client feature flags.
 *
 * chat.html seeds window.MM_FEATURES from hardcoded defaults; until now the
 * only "kill switch" was editing that line and redeploying. This serves
 * GET /api/features.js — a tiny synchronous script loaded BEFORE the seed —
 * so a Render env var flips a flag with a dashboard save instead of a code
 * change (the owner's exact action: livingWorkspace=live in the env screen).
 *
 * Precedence: env override → chat.html default (the seed's Object.assign
 * merges the pre-set window.MM_FEATURES over its defaults). Absent or
 * invalid env values emit nothing — the defaults stand.
 *
 * SECURITY: env values are matched against whitelists and only whitelisted
 * LITERALS are emitted — nothing from the environment is interpolated raw
 * into the script, so a mistyped value can never inject JS.
 */
'use strict';

const LWS_MODES = ['off', 'dev', 'beta', 'live'];

function boolFlag(v) {
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return null;
}

/**
 * @param {object} env - process.env (injectable for tests)
 * @returns {string} JavaScript source for /api/features.js
 */
function buildFeaturesScript(env = process.env) {
  const flags = {};

  // Render env keys are conventionally SCREAMING_SNAKE; also accept the
  // camelCase spelling since that is what exists in the dashboard today.
  const lws = env.LIVING_WORKSPACE || env.livingWorkspace;
  if (typeof lws === 'string' && LWS_MODES.includes(lws.trim())) {
    flags.livingWorkspace = lws.trim();
  }

  const courses = boolFlag(env.COURSES_FEATURE || env.courses);
  if (courses !== null) flags.courses = courses;

  const body = Object.keys(flags).length
    ? `window.MM_FEATURES = Object.assign(window.MM_FEATURES || {}, ${JSON.stringify(flags)});`
    : 'window.MM_FEATURES = window.MM_FEATURES || {};';
  return '// server feature-flag overrides — see utils/featureFlags.js\n' + body + '\n';
}

module.exports = { buildFeaturesScript, LWS_MODES };
