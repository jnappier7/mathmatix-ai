// routes/avatarSession.js
// Simli avatar session proxy — API key never leaves the server.
// The server negotiates the WebRTC session, client gets only the SDP answer.

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const axios = require('axios');

const SIMLI_API_BASE = 'https://api.simli.ai';

/**
 * Map tutor IDs to Simli face IDs.
 * Replace defaults with custom face IDs after creating them at app.simli.com.
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
 * Returns face ID and availability (NOT the API key).
 */
router.get('/config', isAuthenticated, async (req, res) => {
  if (!process.env.SIMLI_API_KEY) {
    return res.status(503).json({
      error: 'Avatar service not configured',
      available: false
    });
  }

  try {
    const user = await User.findById(req.user._id).select('selectedTutorId').lean();
    const tutorId = user?.selectedTutorId || 'default';
    const faceId = TUTOR_FACE_MAP[tutorId] || TUTOR_FACE_MAP['default'];

    res.json({
      available: true,
      faceId,
      tutorId,
    });
  } catch (err) {
    console.error('[Avatar] Config error:', err.message);
    res.status(500).json({ error: 'Failed to load avatar config' });
  }
});

/**
 * POST /api/avatar/start-session
 * Server-side proxy for Simli WebRTC session negotiation.
 * Client sends its SDP offer, server adds the API key and forwards to Simli,
 * then returns the SDP answer. API key never leaves the server.
 */
router.post('/start-session', isAuthenticated, async (req, res) => {
  const apiKey = process.env.SIMLI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Avatar service not configured' });
  }

  const { sdp, type } = req.body;
  if (!sdp || !type) {
    return res.status(400).json({ error: 'SDP offer is required' });
  }

  try {
    const user = await User.findById(req.user._id).select('selectedTutorId').lean();
    const tutorId = user?.selectedTutorId || 'default';
    const faceId = TUTOR_FACE_MAP[tutorId] || TUTOR_FACE_MAP['default'];

    const response = await axios.post(`${SIMLI_API_BASE}/StartWebRTCSession`, {
      sdp,
      type,
      apiKey,
      faceId,
      handleSilence: true,
      maxSessionLength: 1800,
      maxIdleTime: 300,
      syncAudio: true,
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    res.json(response.data);
  } catch (err) {
    console.error('[Avatar] Session start error:', err.response?.data || err.message);
    res.status(502).json({ error: 'Failed to start avatar session' });
  }
});

module.exports = router;
