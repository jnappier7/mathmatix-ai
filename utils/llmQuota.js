// utils/llmQuota.js
//
// "The account is out of credits" — told apart from "slow down".
//
// OpenAI answers BOTH with HTTP 429. A rate limit clears in seconds, so
// retrying it is right. An empty balance clears only when a human adds credits,
// so retrying it is pure delay: on 2026-10-13 every tutor turn sat through
// retryWithExponentialBackoff's 1+2+4+8+16s ladder, twice (generate's
// non-stream fallback, then chat.js's pipeline fallback), and the student
// watched "thinking…" for 64 seconds before the apology. Meanwhile /api/health
// said `openai: ok`, because it only checks that the key is set.
//
// This module is the one place that recognises the condition and remembers it,
// so the retry layer can stop retrying and the health check can say so.

// The SDK's structured fields, when present, are authoritative. The message
// patterns cover the shapes seen in production: the classic
// "You exceeded your current quota" and the newer
// "You have no credits remaining. Add credits to continue using the API".
const QUOTA_CODES = new Set(['insufficient_quota', 'billing_hard_limit_reached']);
const QUOTA_MESSAGE = /insufficient[_ ]quota|exceeded your current quota|no credits remaining|add credits to continue|billing hard limit/i;

function statusOf(err) {
  return err?.status ?? err?.response?.status;
}

/** Is this error an exhausted balance (as opposed to a transient rate limit)? */
function isQuotaExhausted(err) {
  if (!err || statusOf(err) !== 429) return false;
  const codes = [err.code, err.type, err.error?.code, err.error?.type];
  if (codes.some((c) => c && QUOTA_CODES.has(c))) return true;
  return QUOTA_MESSAGE.test(`${err.message || ''} ${err.error?.message || ''}`);
}

// Per-provider, per-process. A success after an exhaustion clears it, so the
// health check recovers on its own once credits are added — no restart needed.
const state = new Map();

function entry(provider) {
  if (!state.has(provider)) state.set(provider, { exhaustedAt: null, lastOkAt: null });
  return state.get(provider);
}

function recordQuotaExhausted(provider, now = Date.now()) {
  entry(provider).exhaustedAt = now;
}

function recordProviderOk(provider, now = Date.now()) {
  const e = entry(provider);
  e.lastOkAt = now;
  e.exhaustedAt = null;
}

/** True while the last thing we learned about `provider` was an empty balance. */
function isExhausted(provider) {
  return state.get(provider)?.exhaustedAt != null;
}

/** Health-check shape. Timestamps only — no provider prose on a public endpoint. */
function quotaReport(provider) {
  const e = state.get(provider) || { exhaustedAt: null, lastOkAt: null };
  return {
    exhausted: e.exhaustedAt != null,
    exhaustedAt: e.exhaustedAt ? new Date(e.exhaustedAt).toISOString() : null,
    lastOkAt: e.lastOkAt ? new Date(e.lastOkAt).toISOString() : null,
  };
}

function _resetForTests() {
  state.clear();
}

module.exports = {
  isQuotaExhausted,
  recordQuotaExhausted,
  recordProviderOk,
  isExhausted,
  quotaReport,
  _resetForTests,
};
