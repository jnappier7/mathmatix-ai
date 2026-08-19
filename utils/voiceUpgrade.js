// utils/voiceUpgrade.js
// Shared WebSocket upgrade helper for the streaming voice pipeline.
// Handles Origin validation, session+passport auth, and under-13 gate.
// Both routes/voice.js (chat orb) and routes/voiceTutor.js (immersive)
// use this so the security posture is consistent.

const logger = require('./logger').child({ module: 'voiceUpgrade' });

const sttStream = require('./sttStream');
const ttsProvider = require('./ttsProvider');
const { hasVoiceAccess } = require('../middleware/usageGate');
const { evaluateOwnConsent, getEnforcementMode } = require('../middleware/consentGate');

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

// Age gating lives in middleware/ageGate.js — one implementation, shared with
// the HTTP voice endpoints. This path needs the raw function rather than the
// Express middleware: a WS upgrade never runs the Express chain.
const { isUnder13 } = require('../middleware/ageGate');

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
                // Own-consent gate — a raw upgrade never runs the Express
                // chain, so requireOwnConsent on the HTTP mounts does not
                // cover this path. Same decision function, same staged
                // CONSENT_ENFORCEMENT rollout (log observes, enforce blocks).
                const consentMode = getEnforcementMode();
                if (consentMode !== 'off') {
                    const decision = evaluateOwnConsent(request.user);
                    if (!decision.allow) {
                        logger.warn(`voice ws upgrade: consent ${consentMode === 'enforce' ? 'blocked' : 'would block'}`, {
                            userId: String(request.user._id),
                            code: decision.code,
                            path: streamPath,
                        });
                        if (consentMode === 'enforce') {
                            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
                            socket.destroy();
                            return;
                        }
                    }
                }
                // AI-minute quota gate — mirrors usageGateAllMethods on the HTTP
                // voice routes (config/routes.js). Voice is open to every 13+
                // student now, but it spends the same monthly pool as text, so a
                // student with an empty balance is refused here. Without this
                // check a logged-in user who knows the WS path could open a
                // session directly and burn unlimited Cartesia minutes,
                // bypassing the HTTP-level gate entirely.
                //
                // This only covers STARTING a session. voiceSession re-checks the
                // balance on every meter flush and hangs up mid-call when it runs
                // out — connecting with ten seconds left must not buy an hour.
                try {
                    const allowed = await hasVoiceAccess(request.user);
                    if (!allowed) {
                        logger.warn('voice ws upgrade: out of AI minutes', {
                            userId: String(request.user._id),
                            tier: request.user.subscriptionTier || 'free',
                            path: streamPath,
                        });
                        socket.write('HTTP/1.1 402 Payment Required\r\n\r\n');
                        socket.destroy();
                        return;
                    }
                } catch (err) {
                    logger.error('voice ws upgrade: quota check failed', { error: err.message });
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
