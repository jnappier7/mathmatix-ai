// utils/ttsStream.js
// Cartesia Sonic-2 streaming TTS over WebSocket.
// Send text as it streams from the LLM; receive PCM audio chunks
// the moment they're synthesized. First-chunk latency ~75ms.

const WebSocket = require('ws');
const crypto = require('crypto');
const logger = require('./logger').child({ module: 'ttsStream' });

const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
const CARTESIA_VERSION = '2025-04-16';
const CARTESIA_MODEL = process.env.CARTESIA_MODEL || 'sonic-2';
const CARTESIA_WS_URL = `wss://api.cartesia.ai/tts/websocket?api_key=${encodeURIComponent(CARTESIA_API_KEY || '')}&cartesia_version=${CARTESIA_VERSION}`;

// Output format: raw PCM s16 mono 22050Hz.
// Small (~44KB/sec), losslessly playable in browser AudioContext.
const OUTPUT_FORMAT = {
    container: 'raw',
    encoding: 'pcm_s16le',
    sample_rate: 22050,
};

function isConfigured() {
    return !!CARTESIA_API_KEY;
}

/**
 * Open a streaming synthesis context. Append text chunks as the LLM
 * produces them; finalize when the LLM is done. Audio chunks fire
 * via onChunk in real time.
 *
 * @param {Object} opts
 * @param {string}   opts.voiceId  - Cartesia voice id
 * @param {string}   opts.language - 'en'
 * @param {Function} opts.onChunk  - (Int16Array, sampleRate) => void
 * @param {Function} opts.onDone   - () => void
 * @param {Function} opts.onError  - (err) => void
 * @param {AbortSignal} opts.signal- Aborts the synthesis (interrupt)
 *
 * @returns {{ appendText(s): void, finalize(): void, abort(): void, charsSent(): number }}
 */
function createSynthesizer(opts) {
    const {
        voiceId,
        language = 'en',
        onChunk = () => {},
        onDone = () => {},
        onError = () => {},
        signal,
    } = opts;

    if (!CARTESIA_API_KEY) {
        const err = new Error('CARTESIA_API_KEY not configured');
        queueMicrotask(() => onError(err));
        return noopSynth();
    }
    if (!voiceId) {
        const err = new Error('voiceId required');
        queueMicrotask(() => onError(err));
        return noopSynth();
    }

    const contextId = crypto.randomUUID();
    const ws = new WebSocket(CARTESIA_WS_URL);

    const sendQueue = [];        // text chunks awaiting open socket
    let openSent = false;
    let aborted = false;
    let finalizedLocal = false;  // appendText/finalize called by caller
    let finalizedSent = false;   // continue:false sent to Cartesia
    let charsSent = 0;

    const onAbort = () => abort('signal_abort');
    if (signal) {
        if (signal.aborted) queueMicrotask(onAbort);
        else signal.addEventListener('abort', onAbort, { once: true });
    }

    ws.on('open', () => {
        openSent = true;
        // Drain queued text chunks
        for (const text of sendQueue) sendChunk(text, false);
        sendQueue.length = 0;
        if (finalizedLocal && !finalizedSent) sendFinalize();
    });

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString('utf8')); } catch (_) { return; }
        if (msg.type === 'chunk' && msg.data) {
            // base64 PCM s16 mono 22050
            const buf = Buffer.from(msg.data, 'base64');
            // View as Int16Array (must respect alignment — copy)
            const aligned = Buffer.alloc(buf.length);
            buf.copy(aligned);
            const i16 = new Int16Array(aligned.buffer, aligned.byteOffset, aligned.length / 2);
            try { onChunk(i16, OUTPUT_FORMAT.sample_rate); } catch (_) { /* swallow handler errors */ }
        } else if (msg.type === 'done' || msg.done === true) {
            try { onDone(); } catch (_) { /* swallow */ }
            cleanup();
        } else if (msg.type === 'error') {
            const err = new Error(msg.message || 'cartesia stream error');
            try { onError(err); } catch (_) { /* swallow */ }
            cleanup();
        }
    });

    ws.on('error', (err) => {
        logger.warn('Cartesia WS error', { error: err.message });
        try { onError(err); } catch (_) { /* swallow */ }
    });

    ws.on('close', () => {
        if (!aborted) cleanup();
    });

    function sendChunk(text, isFinal) {
        if (ws.readyState !== WebSocket.OPEN) return;
        try {
            ws.send(JSON.stringify({
                model_id: CARTESIA_MODEL,
                voice: { mode: 'id', id: voiceId },
                transcript: text,
                continue: !isFinal,
                context_id: contextId,
                language,
                output_format: OUTPUT_FORMAT,
                add_timestamps: false,
            }));
            charsSent += text.length;
        } catch (err) {
            logger.warn('Cartesia WS send failed', { error: err.message });
        }
    }

    function sendFinalize() {
        finalizedSent = true;
        // Empty transcript with continue:false closes the synthesis context.
        sendChunk('', true);
    }

    function appendText(text) {
        if (aborted || finalizedLocal || !text) return;
        if (!openSent) {
            sendQueue.push(text);
            return;
        }
        sendChunk(text, false);
    }

    function finalize() {
        if (aborted || finalizedLocal) return;
        finalizedLocal = true;
        if (openSent) sendFinalize();
        // else: 'open' handler will drain + finalize
    }

    function abort(reason = 'abort') {
        if (aborted) return;
        aborted = true;
        if (signal) {
            try { signal.removeEventListener('abort', onAbort); } catch (_) {}
        }
        try { ws.close(1000, reason.slice(0, 120)); } catch (_) { /* already closed */ }
    }

    function cleanup() {
        if (signal) {
            try { signal.removeEventListener('abort', onAbort); } catch (_) {}
        }
    }

    return {
        appendText,
        finalize,
        abort,
        charsSent: () => charsSent,
        sampleRate: OUTPUT_FORMAT.sample_rate,
    };
}

function noopSynth() {
    return {
        appendText: () => {},
        finalize: () => {},
        abort: () => {},
        charsSent: () => 0,
        sampleRate: OUTPUT_FORMAT.sample_rate,
    };
}

module.exports = { isConfigured, createSynthesizer };
