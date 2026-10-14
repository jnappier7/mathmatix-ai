/**
 * Rate limiting for the practice-test RUNNER (routes/actTest.js).
 *
 * The runner used to share the global apiLimiter (300 requests / 15 min,
 * keyed on the user — or, for a guest, the IP). A timed 44–45 item test
 * spends that budget fast: every navigation is a GET /problem and every
 * answer change a POST /save-answer, so a student moving at ~1 question a
 * second hit 429 within minutes — and a school taking the public test shares
 * ONE IP. The 429s were silent: the answer stayed selected on screen, never
 * reached the server, and the report counted it as skipped (QA, 2026-10-13).
 *
 * So the runner's per-question calls are exempt from the global limiter
 * (config/middleware.js) and get this one instead, keyed on the session's
 * OWNER — the guest bearer token's hash, else the signed-in user — sized for
 * the test, not for the app:
 *
 *   - per owner: 900 requests / 5 min (3 a second, sustained, for five
 *     minutes). A student who answers and moves on every second issues 2 a
 *     second; a real test averages well under one.
 *   - per IP: a much higher ceiling, so minting fresh tokens cannot turn the
 *     per-owner key into an unlimited one. /start itself stays on its own
 *     20-per-hour guest limiter (config/routes.js).
 */
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

// The runner's per-question endpoints, as the router sees them (req.path).
// /start keeps its own limiter; /history, /claim are ordinary app calls.
const RUNNER_ENDPOINT = /^\/(problem|save-answer|overview|next-module|complete)\/?$/;
// The same endpoints as the global '/api/' middleware sees them.
const RUNNER_API_PATH = /^\/(act|sat|psat|preact)-(test|practice)\/(problem|save-answer|overview|next-module|complete)\/?$/;

const WINDOW_MS = 5 * 60 * 1000;
const PER_OWNER_MAX = 900;
const PER_IP_MAX = 12000;

/** True for a runner call the global apiLimiter must NOT count. */
function isPracticeTestRunnerPath(apiPath) {
  return RUNNER_API_PATH.test(String(apiPath || ''));
}

/** Who a runner request belongs to: the guest token, else the user, else the IP. */
function practiceTestOwnerKey(req) {
  const token = String((req.get && req.get('X-Act-Guest-Token')) || '');
  if (token.length >= 32) {
    return 'g:' + crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
  }
  if (req.user && req.user._id) return 'u:' + String(req.user._id);
  return 'ip:' + req.ip;
}

function handler(req, res) {
  const resetTime = req.rateLimit && req.rateLimit.resetTime;
  const retryAfter = resetTime ? Math.ceil((resetTime - Date.now()) / 1000) : 30;
  res.status(429).json({
    message: 'Too many requests, please try again shortly.',
    retryAfter: Math.max(retryAfter, 1),
  });
}

function makeRunnerLimiters() {
  const skip = (req) => !RUNNER_ENDPOINT.test(req.path);
  const perOwner = rateLimit({
    windowMs: WINDOW_MS,
    max: PER_OWNER_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: practiceTestOwnerKey,
    skip,
    handler,
  });
  const perIp = rateLimit({
    windowMs: WINDOW_MS,
    max: PER_IP_MAX,
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req) => 'ip:' + req.ip,
    skip,
    handler,
  });
  return [perIp, perOwner];
}

module.exports = {
  makeRunnerLimiters,
  isPracticeTestRunnerPath,
  practiceTestOwnerKey,
  RUNNER_ENDPOINT,
  WINDOW_MS,
  PER_OWNER_MAX,
  PER_IP_MAX,
};
