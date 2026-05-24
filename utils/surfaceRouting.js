// utils/surfaceRouting.js
// Decides which chat surface a logged-in user should land on.
//
// "Surface" comes from utils/surfacePreference (req.surface), which
// resolves to 'voice' or 'text' based on a persisted cookie or the
// device form factor. This module layers the entitlement check on top:
// we only route someone to the voice orb if they can actually USE
// voice — otherwise they'd land on /voice-tutor.html and immediately
// hit the WS paywall (PR #985) the moment they tried to talk.
//
// The policy lives in a single function on purpose. The "should free
// mobile users see voice?" business question (a/b/c in the redesign
// plan) is unanswered. PR 1 ships with the safest default — option
// (b), free users keep getting text — and future business decisions
// become a localized change to shouldServeVoiceSurface() alone:
//
//   (a) per-day voice taste for free users
//       → AND with a daily-quota check before returning true
//   (b) free users default to text  (THIS PR — current behavior)
//       → require hasPremiumAccess(user)
//   (c) lift the voice paywall entirely
//       → drop the hasPremiumAccess gate, just return req.surface === 'voice'

const { hasPremiumAccess } = require('../middleware/usageGate');

const VOICE_SURFACE_URL = '/voice-tutor.html';
const TEXT_SURFACE_URL = '/chat.html';

/**
 * Should this request be served the voice (orb) surface, or the text
 * (bubble) surface? Combines the user's resolved surface preference
 * with their entitlement to use voice.
 *
 * @param {import('http').IncomingMessage} req - must have req.surface set
 *   (utils/surfacePreference middleware runs in config/middleware.js)
 * @param {Object} user - authenticated user document
 * @returns {Promise<boolean>} true → /voice-tutor.html, false → /chat.html
 */
async function shouldServeVoiceSurface(req, user) {
  if (!req || req.surface !== 'voice') return false;
  return hasPremiumAccess(user);
}

/**
 * Convenience: resolve the URL to redirect a tutored student to,
 * given the request and user. Callers (e.g. routes/login.js) replace
 * a hardcoded '/chat.html' with this.
 *
 * @param {import('http').IncomingMessage} req
 * @param {Object} user
 * @returns {Promise<string>} either '/voice-tutor.html' or '/chat.html'
 */
async function resolveStudentLandingUrl(req, user) {
  const useVoice = await shouldServeVoiceSurface(req, user);
  return useVoice ? VOICE_SURFACE_URL : TEXT_SURFACE_URL;
}

module.exports = {
  VOICE_SURFACE_URL,
  TEXT_SURFACE_URL,
  shouldServeVoiceSurface,
  resolveStudentLandingUrl,
};
