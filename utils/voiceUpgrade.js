// utils/voiceUpgrade.js
// Shared WebSocket upgrade helper for the streaming voice pipeline.
// Handles Origin validation, session+passport auth, and under-13 gate.
// Both routes/voice.js (chat orb) and routes/voiceTutor.js (immersive)
// use this so the security posture is consistent.

const logger = require('./logger').child({ module: 'voiceUpgrade' });

const sttStream = require('./sttStream');
const ttsProvider = require('./ttsProvider');
const { hasPremiumAccess } = require('../middleware/usageGate');

const ALLOWED_ORIGINS = (process.env.VOICE_WS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

/**
 * Validate Origin header against the request Host (or against the
 * VOICE_WS_ALLOWED_ORIGINS env-configured allowlist if set).
 * Mitigates Cross-Site WebSocket Hijacking (CSWSH) — same-site cookies
 * don't help here because WS upgrades are exempt from sameSite=lax.
 */
function originAllowed(request) {
    const origin = request.headers.origin;
    if (!origin) {
        // Browsers always send Origin on WS upgrades; absence means
        // a non-browser client (curl, native app). Reject defensively.
        return false;
    }
    let originHost;
    try { originHost = new URL(origin).host; }
    catch (_) { return false; }

    // Allowlist override via env (comma-separated full origins)
    if (ALLOWED_ORIGINS.length > 0) {
        return ALLOWED_ORIGINS.includes(origin);
    }
    // Default: origin host must match request host
    return originHost === request.headers.host;
}

function isUnder13(user) {
    if (!user || !user.dateOfBirth) return false;
    const age = (Date.now() - new Date(user.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return age < 13;
}

/**
 * Run an HTTP upgrade through the given app's session+passport middleware
 * to populate request.user, then either complete the WS handshake or
 * write an error and destroy the socket.
 *
 * @param {Object} ctx
 * @param {http.IncomingMessage} ctx.request
 * @param {net.Socket} ctx.socket
 * @param {Buffer} ctx.head
 * @param {express.Application} ctx.app
 * @param {ws.WebSocketServer} ctx.wss
 * @param {string} ctx.streamPath  - URL path this handler owns (e.g. '/api/voice/stream')
 *
 * @returns {boolean} true if this handler accepted/rejected the upgrade,
 *                    false if the path doesn't match (caller should ignore).
 */
function handleUpgrade({ request, socket, head, app, wss, streamPath }) {
    let pathname;
    try { pathname = new URL(request.url, 'http://x').pathname; }
    catch (_) { socket.destroy(); return true; }
    if (pathname !== streamPath) return false;

    if (!originAllowed(request)) {
        logger.warn('voice ws upgrade: origin rejected', {
            origin: request.headers.origin || '(none)',
            host: request.headers.host,
            path: streamPath,
        });
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return true;
    }

    if (!sttStream.isConfigured() || !ttsProvider.isConfigured()) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return true;
    }

    const sessionMw = app.locals.sessionMiddleware;
    const passportInit = app.locals.passportInit;
    const passportSession = app.locals.passportSession;
    if (!sessionMw || !passportInit || !passportSession) {
        logger.error('voice ws upgrade: middleware not registered on app.locals');
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
        return true;
    }

    const fakeRes = {
        writeHead: () => {}, setHeader: () => {}, getHeader: () => undefined,
        end: () => {}, on: () => {}, once: () => {}, emit: () => {},
    };

    sessionMw(request, fakeRes, () => {
        passportInit(request, fakeRes, () => {
            passportSession(request, fakeRes, async () => {
                if (!request.user) {
                    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                    socket.destroy();
                    return;
                }
                if (isUnder13(request.user)) {
                    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
                    socket.destroy();
                    return;
                }
                // Premium-tier paywall — mirrors premiumFeatureGate('Voice chat')
                // on the HTTP routes (config/routes.js). Without this, a logged-in
                // free-tier user who knows the WS path could open a session
                // directly and burn unlimited Cartesia minutes, bypassing the
                // HTTP-level gate entirely.
                try {
                    const allowed = await hasPremiumAccess(request.user);
                    if (!allowed) {
                        logger.warn('voice ws upgrade: paywall blocked', {
                            userId: String(request.user._id),
                            tier: request.user.subscriptionTier || 'free',
                            path: streamPath,
                        });
                        socket.write('HTTP/1.1 402 Payment Required\r\n\r\n');
                        socket.destroy();
                        return;
                    }
                } catch (err) {
                    logger.error('voice ws upgrade: paywall check failed', { error: err.message });
                    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
                    socket.destroy();
                    return;
                }
                wss.handleUpgrade(request, socket, head, (ws) => {
                    wss.emit('connection', ws, request);
                });
            });
        });
    });
    return true;
}

module.exports = { handleUpgrade, originAllowed };
