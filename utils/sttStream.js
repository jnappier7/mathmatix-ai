// utils/sttStream.js
// Deepgram Nova-3 streaming STT wrapper. Hides SDK details so a future
// AssemblyAI swap is a single-file change.

const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const logger = require('./logger').child({ module: 'sttStream' });

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const MODEL = process.env.DEEPGRAM_MODEL || 'nova-3';

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
 * @param {number} opts.utteranceEndMs  - Silence ms before UtteranceEnd fires (800)
 * @param {Function} opts.onPartial     - (text, confidence) => void
 * @param {Function} opts.onFinal       - (text, confidence) => void  -- per-segment final
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
        utteranceEndMs = 800,
        onPartial = () => {},
        onFinal = () => {},
        onUtteranceEnd = () => {},
        onError = () => {},
        onClose = () => {},
    } = opts;

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
        utterance_end_ms: utteranceEndMs,
        vad_events: true,
        // Don't fire UtteranceEnd from short partial fragments
        no_delay: false,
    });

    let opened = false;
    let closed = false;
    let billedSeconds = 0;
    let lastSpeechTs = null;

    conn.on(LiveTranscriptionEvents.Open, () => {
        opened = true;
        logger.debug('Deepgram open');
    });

    conn.on(LiveTranscriptionEvents.Transcript, (data) => {
        const alt = data?.channel?.alternatives?.[0];
        if (!alt) return;
        const text = (alt.transcript || '').trim();
        const confidence = alt.confidence || 0;
        if (!text) return;

        if (data.is_final) {
            onFinal(text, confidence);
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
        logger.warn('Deepgram error', { error: err?.message || String(err) });
        onError(err);
    });

    conn.on(LiveTranscriptionEvents.Close, () => {
        if (closed) return;
        closed = true;
        onClose();
    });

    function sendFrame(buf) {
        if (closed) return;
        if (!opened) {
            // Buffer-frames-before-open is rare since open is fast,
            // but if it happens just drop. The first speech segment is short.
            return;
        }
        try {
            conn.send(buf);
            // 16kHz s16 mono = 32 bytes/ms = approx
            billedSeconds += buf.byteLength / (sampleRate * 2);
        } catch (err) {
            logger.warn('Deepgram send failed', { error: err.message });
        }
    }

    function finish() {
        if (closed) return;
        try { conn.finish?.(); } catch (_) { /* sdk variants */ }
    }

    function close() {
        if (closed) return;
        closed = true;
        try { conn.requestClose?.(); } catch (_) { /* sdk variants */ }
        try { conn.finish?.(); } catch (_) { /* sdk variants */ }
    }

    return {
        sendFrame,
        finish,
        close,
        isOpen: () => opened && !closed,
        get billedSeconds() { return billedSeconds; },
    };
}

module.exports = { isConfigured, createSession };
