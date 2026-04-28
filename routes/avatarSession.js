// routes/avatarSession.js
// Simli avatar session proxy — API key never leaves the server.
// The server negotiates the WebRTC session, client gets only the SDP answer.

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const axios = require('axios');
const logger = require('../utils/logger').child({ route: 'avatar-session' });

const SIMLI_API_BASE = 'https://api.simli.ai';

// Session length / idle timeout — overridable via env so support can tune
// without redeploying. Defaults match Simli's recommended values.
const MAX_SESSION_LENGTH = parseInt(process.env.SIMLI_MAX_SESSION_LENGTH, 10) || 1800;
const MAX_IDLE_TIME = parseInt(process.env.SIMLI_MAX_IDLE_TIME, 10) || 300;
const REQUEST_TIMEOUT_MS = parseInt(process.env.SIMLI_REQUEST_TIMEOUT_MS, 10) || 15000;
const MAX_RETRIES = parseInt(process.env.SIMLI_MAX_RETRIES, 10) || 2;

/**
 * Per-tutor Simli face IDs. Only tutors with confirmed custom faces are
 * listed; everyone else falls through to SIMLI_FACE_DEFAULT (logged as a
 * warning so we know which tutors still need a face).
 *
 * To add a tutor: create the face at app.simli.com, then set the matching
 * SIMLI_FACE_<TUTOR_ID> env var.
 */
const TUTOR_FACES = {
  'bob':        process.env.SIMLI_FACE_BOB        || '5514e24d-6086-46a3-ace4-6a7264e5cb7c',
  'maya':       process.env.SIMLI_FACE_MAYA       || 'a7a5a1e8-27d5-49d8-802d-1cbc0a531e71',
  'ms-maria':   process.env.SIMLI_FACE_MS_MARIA   || '743bfb38-3280-4f91-85b4-f8a6c9a28e99',
  'mr-nappier': process.env.SIMLI_FACE_MR_NAPPIER || '0c2b8b04-5274-41f1-a21c-d5c98322efa9',
};

// Optional per-tutor overrides without a hardcoded default — set the env
// var to opt in. Keeps unconfigured tutors from silently using someone
// else's face.
const OPTIONAL_FACE_ENV = {
  'ms-rashida':   'SIMLI_FACE_MS_RASHIDA',
  'mr-sierawski': 'SIMLI_FACE_MR_SIERAWSKI',
  'prof-davies':  'SIMLI_FACE_PROF_DAVIES',
  'ms-alex':      'SIMLI_FACE_MS_ALEX',
  'mr-lee':       'SIMLI_FACE_MR_LEE',
  'dr-g':         'SIMLI_FACE_DR_G',
  'mr-wiggles':   'SIMLI_FACE_MR_WIGGLES',
};

/**
 * Resolve the Simli face ID for a tutor. Returns { faceId, source } where
 * source is 'tutor' (configured for this tutor), 'fallback' (used the
 * SIMLI_FACE_DEFAULT), or 'none' (nothing configured — caller should 503).
 */
function resolveFaceId(tutorId) {
  if (TUTOR_FACES[tutorId]) {
    return { faceId: TUTOR_FACES[tutorId], source: 'tutor' };
  }
  const envName = OPTIONAL_FACE_ENV[tutorId];
  if (envName && process.env[envName]) {
    return { faceId: process.env[envName], source: 'tutor' };
  }
  if (process.env.SIMLI_FACE_DEFAULT) {
    return { faceId: process.env.SIMLI_FACE_DEFAULT, source: 'fallback' };
  }
  return { faceId: null, source: 'none' };
}

/**
 * Decide whether a Simli error is worth retrying. 5xx and network/timeout
 * errors are transient; 4xx (auth, invalid SDP, etc.) are not.
 */
function isTransientError(err) {
  if (err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT') return true;
  if (err?.code === 'ECONNRESET' || err?.code === 'ENOTFOUND') return true;
  const status = err?.response?.status;
  return typeof status === 'number' && status >= 500 && status < 600;
}

async function startSimliSession(payload, attempt = 0) {
  try {
    return await axios.post(`${SIMLI_API_BASE}/StartWebRTCSession`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: REQUEST_TIMEOUT_MS,
    });
  } catch (err) {
    if (attempt < MAX_RETRIES && isTransientError(err)) {
      const delay = 500 * Math.pow(2, attempt);
      logger.warn('[Avatar] Transient Simli error, retrying', {
        attempt: attempt + 1,
        delayMs: delay,
        status: err?.response?.status,
        code: err?.code,
      });
      await new Promise(r => setTimeout(r, delay));
      return startSimliSession(payload, attempt + 1);
    }
    throw err;
  }
}

/**
 * GET /api/avatar/config
 * Returns face ID and availability (NOT the API key).
 */
router.get('/config', isAuthenticated, async (req, res) => {
  if (!process.env.SIMLI_API_KEY) {
    return res.status(503).json({
      error: 'Avatar service not configured',
      code: 'avatar_disabled',
      available: false,
    });
  }

  try {
    const user = await User.findById(req.user._id).select('selectedTutorId').lean();
    const tutorId = user?.selectedTutorId || 'default';
    const { faceId, source } = resolveFaceId(tutorId);

    if (!faceId) {
      return res.status(503).json({
        error: 'No Simli face configured for this tutor',
        code: 'avatar_no_face',
        available: false,
        tutorId,
      });
    }

    if (source === 'fallback') {
      logger.warn('[Avatar] Tutor falling back to default face', { tutorId });
    }

    res.json({ available: true, faceId, tutorId, faceSource: source });
  } catch (err) {
    logger.error('[Avatar] Config error', { error: err.message });
    res.status(500).json({ error: 'Failed to load avatar config', code: 'avatar_config_error' });
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
    return res.status(503).json({
      error: 'Avatar service not configured',
      code: 'avatar_disabled',
    });
  }

  const { sdp, type } = req.body;
  if (!sdp || !type) {
    return res.status(400).json({
      error: 'SDP offer is required',
      code: 'avatar_bad_request',
    });
  }

  try {
    const user = await User.findById(req.user._id).select('selectedTutorId').lean();
    const tutorId = user?.selectedTutorId || 'default';
    const { faceId, source } = resolveFaceId(tutorId);

    if (!faceId) {
      return res.status(503).json({
        error: 'No Simli face configured for this tutor',
        code: 'avatar_no_face',
        tutorId,
      });
    }

    const response = await startSimliSession({
      sdp,
      type,
      apiKey,
      faceId,
      handleSilence: true,
      maxSessionLength: MAX_SESSION_LENGTH,
      maxIdleTime: MAX_IDLE_TIME,
      syncAudio: true,
    });

    logger.info('[Avatar] WebRTC session started', { tutorId, faceSource: source });
    res.json(response.data);
  } catch (err) {
    const status = err?.response?.status;
    const transient = isTransientError(err);
    logger.error('[Avatar] Session start failed', {
      status,
      code: err?.code,
      transient,
      message: err?.response?.data?.error || err.message,
    });
    res.status(transient ? 503 : 502).json({
      error: 'Failed to start avatar session',
      code: transient ? 'avatar_upstream_unavailable' : 'avatar_upstream_error',
      retryable: transient,
    });
  }
});

router.__helpers = { resolveFaceId, isTransientError };

module.exports = router;
