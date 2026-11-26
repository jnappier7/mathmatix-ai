// utils/sttStream.js
// Deepgram streaming STT wrapper. Hides SDK details so a future
// AssemblyAI swap is a single-file change.

const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const logger = require('./logger').child({ module: 'sttStream' });

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
// nova-2 is GA on every tier; nova-3 is opt-in and newer. Override with
// DEEPGRAM_MODEL=nova-3 once you've confirmed the model is enabled on
// your Deepgram project, otherwise the API returns HTTP 400 on connect.
const MODEL = process.env.DEEPGRAM_MODEL || 'nova-2';

// 20 ms frames: ~3 s of audio held while a connection opens.
const MAX_PENDING_FRAMES = 150;

let _client = null;
function client() {
    if (!_client) {
        if (!DEEPGRAM_API_KEY) {
            throw new Error('DEEPGRAM_API_KEY is not configured');
        }
        _client = createClient(DEEPGRAM_API_KEY);
    }
    return _client;
}

function isConfigured() {
    return !!DEEPGRAM_API_KEY;
}

/**
 * Open a streaming STT session.
 *
 * @param {Object} opts
 * @param {string} opts.language        - Language code, default 'en'
 * @param {number} opts.sampleRate      - Input PCM sample rate (16000)
 * @param {number} opts.endpointing     - Silence ms before "is_final" fires (300)
 * @param {number} opts.utteranceEndMs  - Silence ms before UtteranceEnd fires.
 *                                        Deepgram requires >=1000; values below
 *                                        that cause an HTTP 400 on upgrade.
 * @param {Function} opts.onPartial     - (text, confidence) => void
 * @param {Function} opts.onFinal       - (text, confidence, speechFinal) => void
 *                                        Per-segment final. speechFinal is
 *                                        Deepgram's "the speaker has stopped"
 *                                        flag, raised once `endpointing` ms of
 *                                        silence pass — roughly 700ms sooner
 *                                        than UtteranceEnd can fire. Committing
 *                                        the turn on it is the difference
 *                                        between answering a beat after the
 *                                        student stops and answering a full
 *                                        second later.
 * @param {Function} opts.onUtteranceEnd- () => void  -- "user is done speaking, fire LLM"
 * @param {Function} opts.onError       - (err) => void
 * @param {Function} opts.onClose       - () => void
 *
 * @returns {{ sendFrame(buf): void, finish(): void, close(): void, isOpen(): boolean }}
 */
function createSession(opts = {}) {
    const {
        language = 'en',
        sampleRate = 16000,
        endpointing = 300,
        utteranceEndMs = 1000,
        onPartial = () => {},
        onFinal = () => {},
        onUtteranceEnd = () => {},
        onError = () => {},
        onClose = () => {},
    } = opts;

    // Deepgram rejects utterance_end_ms < 1000 with HTTP 400 on websocket
    // upgrade. Clamp here so a stale caller can't bring the session down.
    const utteranceEndMsSafe = Math.max(1000, utteranceEndMs | 0);

    const conn = client().listen.live({
        model: MODEL,
        language,
        encoding: 'linear16',
        sample_rate: sampleRate,
        channels: 1,
        interim_results: true,
        smart_format: true,
        punctuate: true,
        endpointing,
        utterance_end_ms: utteranceEndMsSafe,
        vad_events: true,
    });

    let opened = false;
    let closed = false;
    let billedSeconds = 0;
    let lastSpeechTs = null;
    // Audio that arrives while the connection is still opening. It used to be
    // dropped, which cost the first word of whatever the student was saying.
    let pending = [];

    function transmit(buf) {
        try {
            conn.send(buf);
            // 16kHz s16 mono = 32 bytes/ms = approx
            billedSeconds += buf.byteLength / (sampleRate * 2);
        } catch (err) {
            logger.warn('Deepgram send failed', { error: err.message });
        }
    }

    conn.on(LiveTranscriptionEvents.Open, () => {
        opened = true;
        logger.info('Deepgram open', { model: MODEL, language, sampleRate });
        if (closed) return;
        const queued = pending;
        pending = [];
        for (const buf of queued) transmit(buf);
    });

    conn.on(LiveTranscriptionEvents.Transcript, (data) => {
        const alt = data?.channel?.alternatives?.[0];
        if (!alt) return;
        const text = (alt.transcript || '').trim();
        const confidence = alt.confidence || 0;
        if (!text) return;

        if (data.is_final) {
            // speech_final marks the segment that closed the utterance —
            // Deepgram raising its endpointing verdict. UtteranceEnd says the
            // same thing but cannot fire sooner than 1000ms, so relying on it
            // alone charges every single turn a second of dead air.
            onFinal(text, confidence, data.speech_final === true);
        } else {
            onPartial(text, confidence);
        }
    });

    conn.on(LiveTranscriptionEvents.UtteranceEnd, () => {
        onUtteranceEnd();
    });

    conn.on(LiveTranscriptionEvents.SpeechStarted, () => {
        lastSpeechTs = Date.now();
    });

    conn.on(LiveTranscriptionEvents.Error, (err) => {
        const detail = err?.message || err?.reason || err?.statusCode || String(err);
        logger.warn('Deepgram error', { error: detail, model: MODEL });
        // An errored connection is finished: mark it so the owner can tell a
        // dead session from one that is still opening (see isUsable).
        closed = true;
        pending = [];
        onError(err);
    });

    conn.on(LiveTranscriptionEvents.Close, () => {
        if (closed) return;
        closed = true;
        pending = [];
        onClose();
    });

    function sendFrame(buf) {
        if (closed) return;
        if (!opened) {
            // Still connecting: hold the audio (bounded) and send it on open.
            if (pending.length >= MAX_PENDING_FRAMES) pending.shift();
            pending.push(buf);
            return;
        }
        transmit(buf);
    }

    function finish() {
        if (closed) return;
        try { conn.finish?.(); } catch (_) { /* sdk variants */ }
    }

    function close() {
        if (closed) return;
        closed = true;
        pending = [];
        try { conn.requestClose?.(); } catch (_) { /* sdk variants */ }
        try { conn.finish?.(); } catch (_) { /* sdk variants */ }
    }

    return {
        sendFrame,
        finish,
        close,
        isOpen: () => opened && !closed,
        // Open OR still opening. This — not isOpen — is the question to ask
        // before creating a replacement: a session that is mid-handshake is
        // not open yet, and replacing it on every audio frame opened ~50
        // Deepgram connections a second until Deepgram answered 429 (prod,
        // 2026-11-26: 150 opens in 3 s, then every voice session fell back).
        isUsable: () => !closed,
        get billedSeconds() { return billedSeconds; },
    };
}

module.exports = { isConfigured, createSession };
