// server.js — Application entry point
try { require('dotenv').config(); } catch (_) { /* Production: env vars set by host */ }

const logger = require('./utils/logger');
logger.info('🚀 Starting MATHMATIX.AI Server');

// --- Environment Validation ---
const requiredEnvVars = [
  'MONGO_URI', 'SESSION_SECRET',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL',
  'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_CALLBACK_URL',
  'MATHPIX_APP_ID', 'MATHPIX_APP_KEY', 'OPENAI_API_KEY',
];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  logger.error('❌ FATAL ERROR: Missing required environment variables', { missing: missingVars });
  process.exit(1);
}

// --- App Setup ---
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// --- Configure ---
const { connectDatabase } = require('./config/database');
const { configureMiddleware, authLimiter, signupLimiter } = require('./config/middleware');
const { registerRoutes } = require('./config/routes');
const { initSentry, initSentryErrorHandler } = require('./config/sentry');
const lifecycle = require('./utils/lifecycle');

initSentry(app);          // Sentry request handler (must be first)
configureMiddleware(app);
connectDatabase();
registerRoutes(app, { authLimiter, signupLimiter });
initSentryErrorHandler(app); // Sentry error handler (must be after routes)

// --- Start ---
const server = app.listen(PORT, () => {
  logger.info(`🚀 M∆THM∆TIΧ AI is live on http://localhost:${PORT}`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
  });
});

// Keep-alive must outlive the proxy's idle timeout. Node's default
// keepAliveTimeout is 5s; Render's proxy holds pooled upstream connections
// longer than that, so it would periodically dispatch a request onto a socket
// we were closing in the same instant — the classic intermittent 502 behind a
// load balancer. headersTimeout must stay ABOVE keepAliveTimeout or it
// re-introduces the same race one level up.
server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 120000);
server.headersTimeout = server.keepAliveTimeout + 5000;

// --- WebSocket: streaming voice (immersive tutor + chat-page orb) ---
// Attached after listen so the HTTP server is ready to receive upgrades.
const webSocketServers = [];
try {
  const voiceTutorRoutes = require('./routes/voiceTutor');
  if (typeof voiceTutorRoutes.attachStreamWebSocket === 'function') {
    const wss = voiceTutorRoutes.attachStreamWebSocket(server, app);
    if (wss) webSocketServers.push(wss);
  }
} catch (err) {
  logger.error('Failed to attach voice-tutor WebSocket', { error: err.message });
}
try {
  const voiceRoutes = require('./routes/voice');
  if (typeof voiceRoutes.attachStreamWebSocket === 'function') {
    const wss = voiceRoutes.attachStreamWebSocket(server, app);
    if (wss) webSocketServers.push(wss);
  }
} catch (err) {
  logger.error('Failed to attach voice (chat orb) WebSocket', { error: err.message });
}

// --- Graceful Shutdown ---
const mongoose = require('mongoose');

// Every timing here is bounded by Render's SIGTERM -> SIGKILL grace period,
// which is 30s. The whole sequence must finish inside that or the process is
// killed mid-drain and we are back to serving 502s.
//
//   0s      SIGTERM. Health flips to 503 — but we KEEP SERVING. This is the
//           part that was missing: the proxy needs to observe the failing
//           health check and take us out of rotation before we stop accepting.
//           Calling server.close() here (the old behaviour) refused every
//           request the proxy was still routing to us, which is exactly the
//           502 burst users saw on every deploy.
//   +10s    Drain over. server.close() stops accepting, then idle keep-alive
//           sockets are released so the close callback isn't held open by
//           browsers that are connected but not asking for anything.
//   +20s    Anything still in flight (a long SSE tutor stream, a voice socket)
//           is force-closed so we exit cleanly rather than being SIGKILLed.
//   +25s    Backstop hard exit, still under Render's 30s.
const DRAIN_MS = Number(process.env.SHUTDOWN_DRAIN_MS || 10000);
const CLOSE_GRACE_MS = Number(process.env.SHUTDOWN_CLOSE_GRACE_MS || 10000);
const HARD_EXIT_MS = Number(process.env.SHUTDOWN_HARD_EXIT_MS || 25000);

let shuttingDown = false;

async function closeAndExit(code) {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (err) {
    logger.error('Error closing MongoDB connection', err);
  }
  process.exit(code);
}

function gracefulShutdown(signal, { drainMs = DRAIN_MS } = {}) {
  // A second SIGTERM (or an uncaughtException mid-drain) must not restart the
  // clock or double-close.
  if (shuttingDown) return;
  shuttingDown = true;

  lifecycle.markDraining();
  logger.info(`${signal} received — draining before shutdown`, { drainMs });

  // Backstop: exit no matter what stalls below, while still inside Render's
  // 30s grace so we choose our own exit instead of being SIGKILLed.
  const hardExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, HARD_EXIT_MS);
  hardExit.unref();

  setTimeout(() => {
    logger.info('Drain window over — closing HTTP server');

    server.close(() => {
      logger.info('HTTP server closed');
      closeAndExit(0);
    });

    // Release sockets that are connected but idle. Without this the close
    // callback waits on browsers that are simply holding a keep-alive open.
    if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();

    // WebSockets never close themselves, so server.close() would wait forever
    // on any open voice session. Ask them to go away politely; the force-close
    // below catches any that don't.
    for (const wss of webSocketServers) {
      try {
        for (const ws of wss.clients) {
          try { ws.close(1001, 'server shutting down'); } catch (_) { /* already gone */ }
        }
        wss.close();
      } catch (err) {
        logger.error('Error closing WebSocket server', { error: err.message });
      }
    }

    // Last resort for connections still open after the grace period — an SSE
    // stream mid-reply, or a WebSocket that ignored the close frame.
    setTimeout(() => {
      if (typeof server.closeAllConnections === 'function') {
        logger.warn('Force-closing remaining connections');
        server.closeAllConnections();
      }
    }, CLOSE_GRACE_MS).unref();
  }, drainMs);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// --- Unhandled Error Safety Net ---
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason,
  });
  // Don't exit — let Sentry capture it and the app continue serving
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception — shutting down', {
    error: err.message,
    stack: err.stack,
  });
  // Uncaught exceptions leave the process in an undefined state — must exit.
  // No drain window: draining means "keep serving", and serving from a process
  // in an undefined state is worse than dropping out of rotation immediately.
  gracefulShutdown('uncaughtException', { drainMs: 0 });
});
