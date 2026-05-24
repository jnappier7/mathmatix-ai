// routes/surface.js
// Toggle endpoint for the user's preferred chat surface (voice ↔ text).
// The in-header glyphs in chat.html and voice-tutor.html POST here so
// the choice persists across visits via the surface cookie.
//
// Setting a preference is not gated by tier — the user can freely
// "choose voice" even on the free tier. The actual voice paywall
// fires when they try to OPEN the voice WebSocket
// (utils/voiceUpgrade.js calls hasPremiumAccess, see PR #985).

const express = require('express');
const router = express.Router();
const {
  setSurfaceCookie,
  VALID_VALUES,
} = require('../utils/surfacePreference');
const {
  VOICE_SURFACE_URL,
  TEXT_SURFACE_URL,
} = require('../utils/surfaceRouting');

/**
 * POST /api/surface
 * Body: { value: 'voice' | 'text' }
 * Sets the surface cookie and returns the URL the client should
 * navigate to. Client toggles read response.redirect and call
 * window.location.assign(redirect).
 */
router.post('/', (req, res) => {
  const value = req.body && req.body.value;
  if (!VALID_VALUES.includes(value)) {
    return res.status(400).json({
      success: false,
      message: `Invalid surface value. Expected one of: ${VALID_VALUES.join(', ')}.`,
    });
  }

  setSurfaceCookie(res, value);
  const redirect = value === 'voice' ? VOICE_SURFACE_URL : TEXT_SURFACE_URL;
  return res.json({ success: true, surface: value, redirect });
});

module.exports = router;
