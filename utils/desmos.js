/**
 * The Desmos graphing calculator — the calculator built into the digital SAT.
 *
 * The SAT practice test offers it (public/js/act-test.js, EXAMS.sat.calculator)
 * so students practice on the exact tool they will have on test day. Desmos
 * runs entirely in the browser; we send it nothing about the student.
 *
 * The production API key lives in DESMOS_API_KEY, never in the repo. The
 * runner loads /vendor/desmos-calculator.js, which this handler redirects to
 * Desmos's script URL with the key attached. With no key the route is a 404
 * and the runner falls back to the shared scientific calculator — so an unset
 * variable degrades the SAT test instead of breaking it, and /api/health says
 * so (an unset env var is otherwise invisible; see founding-school-grant-env).
 *
 * The key is not a secret in the cryptographic sense — every browser that
 * opens the calculator sees it in the script URL, by Desmos's design — but it
 * is ours, so it stays out of source control and can be rotated on Render.
 *
 * @module utils/desmos
 */

// Desmos pins API majors; v1.11 resolves to its latest v1.11.x patch.
const DESMOS_SCRIPT = 'https://www.desmos.com/api/v1.11/calculator.js';

function desmosKey() {
  const k = String(process.env.DESMOS_API_KEY || '').trim();
  return /^[A-Za-z0-9]{16,64}$/.test(k) ? k : null;
}

/** GET /vendor/desmos-calculator.js — redirect to Desmos with our key, or 404. */
function desmosScriptHandler(req, res) {
  const key = desmosKey();
  if (!key) return res.status(404).type('application/javascript').send('/* Desmos is not configured */');
  // Short cache: a rotated key reaches browsers within the hour.
  res.set('Cache-Control', 'public, max-age=3600');
  return res.redirect(302, `${DESMOS_SCRIPT}?apiKey=${encodeURIComponent(key)}`);
}

/** For /api/health: 'ok' when a key is set, 'off' otherwise (never 'unhealthy'). */
function desmosReport() {
  return { status: desmosKey() ? 'ok' : 'off' };
}

module.exports = { DESMOS_SCRIPT, desmosKey, desmosScriptHandler, desmosReport };
