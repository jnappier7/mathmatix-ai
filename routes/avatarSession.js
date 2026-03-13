// routes/avatarSession.js
// Simli avatar session proxy — keeps API key server-side
// Manages avatar session lifecycle for the voice tutor experience

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const axios = require('axios');

const SIMLI_API_BASE = 'https://api.simli.ai';

/**
 * Map tutor IDs to Simli face IDs.
 * These should be custom avatars created at app.simli.com to match each tutor's appearance.
 * For now, use the default face — replace with custom face IDs after creating them.
 */
const TUTOR_FACE_MAP = {
  'bob':           process.env.SIMLI_FACE_BOB           || '5514e24d-6086-46a3-ace4-6a7264e5cb7c',
  'maya':          process.env.SIMLI_FACE_MAYA          || 'a7a5a1e8-27d5-49d8-802d-1cbc0a531e71',
  'ms-maria':      process.env.SIMLI_FACE_MS_MARIA      || '743bfb38-3280-4f91-85b4-f8a6c9a28e99',
  'mr-nappier':    process.env.SIMLI_FACE_MR_NAPPIER    || '0c2b8b04-5274-41f1-a21c-d5c98322efa9',
  'ms-rashida':    process.env.SIMLI_FACE_MS_RASHIDA    || '0c2b8b04-5274-41f1-a21c-d5c98322efa9',
  'mr-sierawski':  process.env.SIMLI_FACE_MR_SIERAWSKI  || '0c2b8b04-5274-41f1-a21c-d5c98322efa9',
  'prof-davies':   process.env.SIMLI_FACE_PROF_DAVIES   || '0c2b8b04-5274-41f1-a21c-d5c98322efa9',
  'ms-alex':       process.env.SIMLI_FACE_MS_ALEX       || '0c2b8b04-5274-41f1-a21c-d5c98322efa9',
  'mr-lee':        process.env.SIMLI_FACE_MR_LEE        || '0c2b8b04-5274-41f1-a21c-d5c98322efa9',
  'dr-g':          process.env.SIMLI_FACE_DR_G          || '0c2b8b04-5274-41f1-a21c-d5c98322efa9',
  'mr-wiggles':    process.env.SIMLI_FACE_MR_WIGGLES    || '0c2b8b04-5274-41f1-a21c-d5c98322efa9',
  'default':       process.env.SIMLI_FACE_DEFAULT       || '0c2b8b04-5274-41f1-a21c-d5c98322efa9',
};

/**
 * GET /api/avatar/config
 * Returns Simli client config (API key + face ID) for the current user's tutor.
 * API key is needed client-side for WebRTC connection — Simli's SDK requires it.
 */
router.get('/config', isAuthenticated, async (req, res) => {
  const apiKey = process.env.SIMLI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'Avatar service not configured',
      message: 'SIMLI_API_KEY is not set. Avatar feature is unavailable.'
    });
  }

  try {
    const user = await User.findById(req.user._id).select('selectedTutorId').lean();
    const tutorId = user?.selectedTutorId || 'default';
    const faceId = TUTOR_FACE_MAP[tutorId] || TUTOR_FACE_MAP['default'];

    res.json({
      apiKey,
      faceId,
      tutorId,
      maxSessionLength: 1800,  // 30 min max
      maxIdleTime: 300,        // 5 min idle disconnect
    });
  } catch (err) {
    console.error('[Avatar] Config error:', err);
    res.status(500).json({ error: 'Failed to load avatar config' });
  }
});

/**
 * GET /api/avatar/faces
 * Proxy to Simli's available faces endpoint — useful for admin face selection.
 */
router.get('/faces', isAuthenticated, async (req, res) => {
  const apiKey = process.env.SIMLI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Avatar service not configured' });
  }

  try {
    const response = await axios.get(`${SIMLI_API_BASE}/getPossibleFaceIDs`, {
      headers: { 'X-API-Key': apiKey }
    });
    res.json(response.data);
  } catch (err) {
    console.error('[Avatar] Faces error:', err.message);
    res.status(500).json({ error: 'Failed to fetch available faces' });
  }
});

module.exports = router;
