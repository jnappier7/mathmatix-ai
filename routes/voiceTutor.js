// routes/voiceTutor.js
// Voice tutor streaming endpoint.
//
// The immersive voice-tutor.html page was retired — voice is now an
// in-place mode of chat.html (same session, same conversation), driven by
// voice-controller.js → voice-stream-client.js. The HTTP transcription/
// response/TTS routes that ONLY served the old page (/process,
// /process-text, /process-orchestrated, /interrupt, /end-session) are gone
// with it. What remains is the shared streaming pipeline every voice
// surface connects to:
//   - WebSocket  /api/voice-tutor/stream   (live duplex voice session)
//   - GET        /api/voice-tutor/metrics  (admin observability)
//
// Session logic lives in utils/voiceSession.js (createVoiceSession).

const express = require('express');
const router = express.Router();
const { WebSocketServer } = require('ws');
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const { createVoiceSession } = require('../utils/voiceSession');
const voiceMetrics = require('../utils/voiceMetrics');
const logger = require('../utils/logger').child({ route: 'voice-tutor' });

// GET /api/voice-tutor/metrics  (admin observability)
router.get('/metrics', isAuthenticated, (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'admin only' });
  }
  res.json({
    aggregate: voiceMetrics.aggregate(),
    recent: voiceMetrics.snapshot(50),
  });
});

// ═══════════════════════════════════════
// WebSocket: /api/voice-tutor/stream
// Streaming voice pipeline — the live duplex session used by the in-place
// chat voice mode. Mode is opt-in via ?mode=; defaults to math-steps.
// ═══════════════════════════════════════
function attachStreamWebSocket(server, app) {
  const wss = new WebSocketServer({ noServer: true });
  const STREAM_PATH = '/api/voice-tutor/stream';
  const { handleUpgrade } = require('../utils/voiceUpgrade');

  server.on('upgrade', (request, socket, head) => {
    handleUpgrade({ request, socket, head, app, wss, streamPath: STREAM_PATH });
  });

  wss.on('connection', async (ws, request) => {
    const userDoc = await User.findById(request.user._id).lean();
    if (!userDoc) {
      ws.close(1008, 'user not found');
      return;
    }
    let requestedMode = 'math-steps';
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const m = url.searchParams.get('mode');
      if (m === 'orchestrated' || m === 'board-actions') requestedMode = m;
    } catch (_) { /* fall through to default */ }
    try {
      await createVoiceSession({ ws, user: userDoc, mode: requestedMode });
      logger.info('voice ws session opened', { userId: String(userDoc._id), mode: requestedMode });
    } catch (err) {
      logger.error('voice ws session init failed', { error: err.message });
      try { ws.close(1011, 'init failed'); } catch (_) {}
    }
  });

  logger.info('voice ws upgrade handler attached', { path: STREAM_PATH });
}

module.exports = router;
module.exports.attachStreamWebSocket = attachStreamWebSocket;
