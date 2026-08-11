// tests/unit/voiceUpgradeConsent.test.js
// The voice WebSockets upgrade on a raw HTTP request — Express middleware
// never runs, so requireOwnConsent on the HTTP mounts cannot cover them.
// These tests pin the consent check inside handleUpgrade() for both modes.

jest.mock('../../utils/sttStream', () => ({ isConfigured: () => true }));
jest.mock('../../utils/ttsProvider', () => ({ isConfigured: () => true }));
jest.mock('../../middleware/usageGate', () => ({
    hasPremiumAccess: jest.fn().mockResolvedValue(true),
}));

const { handleUpgrade } = require('../../utils/voiceUpgrade');

function yearsAgo(n) {
    return new Date(Date.now() - n * 365.25 * 24 * 60 * 60 * 1000);
}

function runUpgrade(user) {
    const request = {
        url: '/api/voice/stream',
        headers: { origin: 'https://app.test', host: 'app.test' },
    };
    const socket = { write: jest.fn(), destroy: jest.fn() };
    const wss = { handleUpgrade: jest.fn(), emit: jest.fn() };
    const app = {
        locals: {
            // Stub the session/passport chain: each stage just advances,
            // with passportSession attaching the user.
            sessionMiddleware: (req, res, next) => next(),
            passportInit: (req, res, next) => next(),
            passportSession: (req, res, next) => { req.user = user; next(); },
        },
    };
    const accepted = handleUpgrade({
        request, socket, head: Buffer.alloc(0), app, wss, streamPath: '/api/voice/stream',
    });
    return { accepted, socket, wss };
}

// The paywall check is async, so give the promise chain a tick to settle.
const settle = () => new Promise((r) => setImmediate(r));

describe('voice upgrade own-consent gate', () => {
    const ORIGINAL = process.env.CONSENT_ENFORCEMENT;
    afterEach(() => {
        if (ORIGINAL === undefined) delete process.env.CONSENT_ENFORCEMENT;
        else process.env.CONSENT_ENFORCEMENT = ORIGINAL;
        jest.clearAllMocks();
    });

    const revokedTeen = {
        _id: 'v1',
        role: 'student',
        dateOfBirth: yearsAgo(15),
        privacyConsent: { status: 'revoked', consentPathway: 'individual_parent', history: [] },
    };

    test('enforce mode: revoked student gets 403 and the socket is destroyed', async () => {
        process.env.CONSENT_ENFORCEMENT = 'enforce';
        const { socket, wss } = runUpgrade(revokedTeen);
        await settle();
        expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('403'));
        expect(socket.destroy).toHaveBeenCalled();
        expect(wss.handleUpgrade).not.toHaveBeenCalled();
    });

    test('log mode: revoked student still connects (observe-only rollout)', async () => {
        process.env.CONSENT_ENFORCEMENT = 'log';
        const { socket, wss } = runUpgrade(revokedTeen);
        await settle();
        expect(wss.handleUpgrade).toHaveBeenCalled();
        expect(socket.destroy).not.toHaveBeenCalled();
    });

    test('enforce mode: consented teen connects', async () => {
        process.env.CONSENT_ENFORCEMENT = 'enforce';
        const { wss } = runUpgrade({
            _id: 'v2',
            role: 'student',
            dateOfBirth: yearsAgo(15),
            privacyConsent: { status: 'active', consentPathway: 'self_13_plus', history: [{}] },
        });
        await settle();
        expect(wss.handleUpgrade).toHaveBeenCalled();
    });
});
