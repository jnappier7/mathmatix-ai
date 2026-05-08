// public/js/voice-stream-client.js
// Browser-side orchestrator for the streaming voice tutor.
// - Opens WebSocket to /api/voice-tutor/stream
// - Captures mic via AudioWorklet → 16kHz PCM16 frames upstream
// - Plays back PCM audio chunks from server in a Web Audio queue
// - Local VAD (RMS dBFS) triggers immediate barge-in during AI playback
//
// Public API (window.VoiceStreamClient):
//   const client = new VoiceStreamClient({ on, getStatus });
//   await client.connect();
//   await client.startListening();
//   client.stopListening();
//   client.sendText(text);
//   client.disconnect();

(function (global) {
    'use strict';

    const DEFAULT_WS_PATH = '/api/voice-tutor/stream';
    const WORKLET_PATH = '/js/audio/pcm16-worklet.js';

    // Local VAD tuning
    const INTERRUPT_DBFS = -38;     // threshold while AI speaking
    const INTERRUPT_DBFS_HARD = -24;// fallback when AEC underperforms
    const INTERRUPT_FRAMES = 4;     // ~80ms confirmation
    const PLAYBACK_FADE_MS = 30;    // ramp gain to 0 on interrupt

    // Reconnect tuning
    const RECONNECT_MAX_ATTEMPTS = 4;
    const RECONNECT_BASE_DELAY_MS = 500;     // doubled per attempt: 500, 1000, 2000, 4000

    class VoiceStreamClient {
        constructor(opts = {}) {
            this.on = opts.on || (() => {});
            this.wsPath = opts.wsPath || DEFAULT_WS_PATH;
            this.ws = null;
            this.connected = false;
            this._reconnectAttempts = 0;
            this._intentionalDisconnect = false;
            this._reconnectTimer = null;

            this.audioCtx = null;
            this.outGain = null;
            this.workletNode = null;
            this.micSource = null;
            this.micStream = null;
            this.scheduledUntil = 0;     // audio playback head time
            this.serverSampleRate = 22050;
            this.useHardThreshold = false;

            // Barge-in state
            this.aiSpeaking = false;
            this.consecutiveLoudFrames = 0;

            // Listening state
            this.listening = false;

            // Pending audio buffer to play once context is running
            this._pendingChunks = [];
        }

        async connect() {
            if (this.ws && this.ws.readyState <= 1) return;
            // ws scheme matches page scheme
            const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
            this.ws = new WebSocket(`${proto}//${location.host}${this.wsPath}`);
            this.ws.binaryType = 'arraybuffer';

            await new Promise((resolve, reject) => {
                const onOpen = () => { this.ws.removeEventListener('error', onErr); resolve(); };
                const onErr = (e) => { this.ws.removeEventListener('open', onOpen); reject(e); };
                this.ws.addEventListener('open', onOpen, { once: true });
                this.ws.addEventListener('error', onErr, { once: true });
            });

            this.connected = true;
            this._reconnectAttempts = 0;
            this.ws.addEventListener('message', (ev) => this._onWsMessage(ev));
            this.ws.addEventListener('close', () => {
                this.connected = false;
                if (this._intentionalDisconnect) {
                    this.on({ type: 'disconnected' });
                    return;
                }
                this._scheduleReconnect();
            });
            this.ws.addEventListener('error', (err) => {
                this.on({ type: 'error', message: 'connection_error', detail: err?.message || '' });
            });
        }

        _scheduleReconnect() {
            if (this._reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
                console.warn('[VoiceStreamClient] reconnect attempts exhausted — falling back');
                this.on({ type: 'disconnected' });
                return;
            }
            this._reconnectAttempts++;
            const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, this._reconnectAttempts - 1);
            console.warn(`[VoiceStreamClient] disconnected, reconnecting in ${delay}ms (attempt ${this._reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS})`);
            this.on({ type: 'reconnecting', attempt: this._reconnectAttempts, delayMs: delay });
            if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
            this._reconnectTimer = setTimeout(() => this._reconnect(), delay);
        }

        async _reconnect() {
            this._reconnectTimer = null;
            try {
                // Re-open WS only — preserve audioCtx, gainNode, mic stream.
                // Server-side state (history, board context) reloads on its
                // own from Mongo when the session re-inits.
                const wasListening = this.listening;
                await this._openWsOnly();
                this.on({ type: 'reconnected' });
                if (wasListening) {
                    // Mic worklet is still attached; just resume sending frames
                    // by ensuring the listening flag is true. _openMic is a no-op
                    // if the stream is still live.
                    this.listening = true;
                }
            } catch (err) {
                // close handler will fire and trigger another retry or give up
                console.warn('[VoiceStreamClient] reconnect attempt failed:', err?.message);
            }
        }

        async _openWsOnly() {
            const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
            this.ws = new WebSocket(`${proto}//${location.host}${this.wsPath}`);
            this.ws.binaryType = 'arraybuffer';
            await new Promise((resolve, reject) => {
                const onOpen = () => { this.ws.removeEventListener('error', onErr); resolve(); };
                const onErr = (e) => { this.ws.removeEventListener('open', onOpen); reject(e); };
                this.ws.addEventListener('open', onOpen, { once: true });
                this.ws.addEventListener('error', onErr, { once: true });
            });
            this.connected = true;
            this._reconnectAttempts = 0;
            this.ws.addEventListener('message', (ev) => this._onWsMessage(ev));
            this.ws.addEventListener('close', () => {
                this.connected = false;
                if (this._intentionalDisconnect) {
                    this.on({ type: 'disconnected' });
                    return;
                }
                this._scheduleReconnect();
            });
            this.ws.addEventListener('error', (err) => {
                this.on({ type: 'error', message: 'connection_error', detail: err?.message || '' });
            });
        }

        async _ensureAudio() {
            if (this.audioCtx && this.audioCtx.state === 'running') return;
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
                    latencyHint: 'interactive',
                });
                this.outGain = this.audioCtx.createGain();
                this.outGain.gain.value = 1.0;
                this.outGain.connect(this.audioCtx.destination);
                try {
                    await this.audioCtx.audioWorklet.addModule(WORKLET_PATH);
                } catch (err) {
                    this.on({ type: 'error', message: 'worklet_load_failed', detail: err?.message });
                    throw err;
                }
                // Safari (and aggressive mobile browsers) suspend AudioContext
                // when a tab loses focus or after idle. Auto-resume so AI
                // audio doesn't go silent mid-conversation. Resume() requires
                // a user gesture for the FIRST resume; after that it works
                // freely (we got the gesture from the orb tap).
                this.audioCtx.addEventListener('statechange', () => {
                    if (this.audioCtx && this.audioCtx.state === 'suspended') {
                        this.audioCtx.resume().catch(() => {});
                    }
                });
            }
            if (this.audioCtx.state === 'suspended') {
                try { await this.audioCtx.resume(); } catch (_) { /* user gesture needed */ }
            }
        }

        async startListening() {
            if (this.listening) return;
            await this._ensureAudio();
            await this._openMic();
            this.listening = true;
            this.on({ type: 'listening_started' });
        }

        stopListening() {
            if (!this.listening) return;
            this.listening = false;
            this._closeMic();
            // Tell server to drop any pending utterance accumulator
            this._sendJson({ type: 'reset_listening' });
            this.on({ type: 'listening_stopped' });
        }

        async _openMic() {
            if (this.micStream) return;
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 48000,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
                video: false,
            });
            this.micStream = stream;
            this.micSource = this.audioCtx.createMediaStreamSource(stream);
            this.workletNode = new AudioWorkletNode(this.audioCtx, 'pcm16-processor', {
                processorOptions: { outSampleRate: 16000, frameSamples: 320 },
            });
            this.workletNode.port.onmessage = (e) => this._onMicFrame(e.data);
            this.micSource.connect(this.workletNode);
            // Don't connect worklet to destination — we don't want to monitor mic
        }

        _closeMic() {
            try { this.micSource?.disconnect(); } catch (_) {}
            try { this.workletNode?.disconnect(); } catch (_) {}
            try { this.micStream?.getTracks().forEach(t => t.stop()); } catch (_) {}
            this.micSource = null;
            this.workletNode = null;
            this.micStream = null;
        }

        _onMicFrame({ pcm, dbfs }) {
            // Barge-in detection during AI playback
            if (this.aiSpeaking) {
                const threshold = this.useHardThreshold ? INTERRUPT_DBFS_HARD : INTERRUPT_DBFS;
                if (dbfs > threshold) {
                    this.consecutiveLoudFrames++;
                    if (this.consecutiveLoudFrames >= INTERRUPT_FRAMES) {
                        this._fireBargeIn();
                    }
                } else {
                    this.consecutiveLoudFrames = 0;
                }
            }
            // Always send frames upstream — server runs STT independently.
            if (this.ws && this.ws.readyState === 1) {
                this.ws.send(pcm);
            }
        }

        _fireBargeIn() {
            if (!this.aiSpeaking) return;
            // 1. Local: ramp playback gain to 0 in 30ms (no pop)
            const now = this.audioCtx.currentTime;
            this.outGain.gain.cancelScheduledValues(now);
            this.outGain.gain.setValueAtTime(this.outGain.gain.value, now);
            this.outGain.gain.linearRampToValueAtTime(0, now + PLAYBACK_FADE_MS / 1000);
            // Reset gain after fade so next chunk is audible
            setTimeout(() => {
                if (this.outGain) {
                    this.outGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
                    this.outGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
                }
            }, PLAYBACK_FADE_MS + 5);
            // 2. Reset playback queue head — drop scheduled future audio
            this.scheduledUntil = this.audioCtx.currentTime;
            // 3. Notify server (single message — server tears down LLM + Cartesia)
            this._sendJson({ type: 'barge_in', at_ms: Date.now() });
            this.aiSpeaking = false;
            this.consecutiveLoudFrames = 0;
            this.on({ type: 'barge_in' });
        }

        sendText(text) {
            if (!text || !text.trim()) return;
            this._sendJson({ type: 'text_input', text: text.trim() });
        }

        /**
         * Push current whiteboard state to the server (board-actions mode).
         * Call before each user turn so the AI can reference existing
         * objects by id.
         */
        setBoardContext(boardContext) {
            if (!boardContext) return;
            this._sendJson({ type: 'set_board_context', boardContext });
        }

        _sendJson(obj) {
            if (!this.ws || this.ws.readyState !== 1) return;
            try { this.ws.send(JSON.stringify(obj)); } catch (_) { /* socket dead */ }
        }

        _onWsMessage(ev) {
            if (typeof ev.data === 'string') {
                let msg;
                try { msg = JSON.parse(ev.data); } catch (_) { return; }
                this._handleEvent(msg);
            } else if (ev.data instanceof ArrayBuffer) {
                this._handleAudioFrame(new Uint8Array(ev.data));
            }
        }

        _handleAudioFrame(u8) {
            // Frame format: [0x01][4B turnTag][2B sampleRate BE][N bytes pcm s16le]
            if (u8.length < 7 || u8[0] !== 0x01) return;
            const sampleRate = (u8[5] << 8) | u8[6];
            const pcmStart = 7;
            const byteLen = u8.byteLength - pcmStart;
            const i16 = new Int16Array(u8.buffer, u8.byteOffset + pcmStart, byteLen / 2);
            this._playPcmS16(i16, sampleRate);
        }

        _playPcmS16(i16, sampleRate) {
            if (!this.audioCtx) return;
            // Defensive: Safari may have suspended the context between
            // chunks. Try to resume; if it fails (no gesture credit yet),
            // the chunk is dropped — better than queuing forever.
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume().catch(() => {});
            }
            const f32 = new Float32Array(i16.length);
            for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 0x8000;
            const buf = this.audioCtx.createBuffer(1, f32.length, sampleRate);
            buf.copyToChannel(f32, 0);
            const src = this.audioCtx.createBufferSource();
            src.buffer = buf;
            src.connect(this.outGain);
            const startAt = Math.max(this.audioCtx.currentTime + 0.005, this.scheduledUntil);
            src.start(startAt);
            this.scheduledUntil = startAt + buf.duration;
            if (!this.aiSpeaking) {
                this.aiSpeaking = true;
                this.consecutiveLoudFrames = 0;
                this.on({ type: 'ai_speaking_started' });
            }
            // When the last scheduled chunk completes, mark AI as no longer speaking
            const expectedDoneAt = this.scheduledUntil;
            setTimeout(() => {
                if (this.audioCtx.currentTime >= expectedDoneAt - 0.02 && this.aiSpeaking) {
                    this.aiSpeaking = false;
                    this.on({ type: 'ai_speaking_ended' });
                }
            }, (buf.duration + 0.05) * 1000);
        }

        _handleEvent(msg) {
            switch (msg.type) {
                case 'session_ready':
                    this.serverSampleRate = msg.sampleRate || 22050;
                    this.on({ type: 'ready', voiceId: msg.voiceId });
                    break;
                case 'status':
                    this.on({ type: 'status', status: msg.status });
                    break;
                case 'transcript_partial':
                    this.on({ type: 'transcript_partial', text: msg.text });
                    break;
                case 'transcript_final':
                    this.on({ type: 'transcript_final', text: msg.text });
                    break;
                case 'turn_start':
                    this.on({ type: 'turn_start', turnId: msg.turnId, transcript: msg.transcript });
                    break;
                case 'response_delta':
                    this.on({ type: 'response_delta', text: msg.text });
                    break;
                case 'math_steps_partial':
                    this.on({ type: 'math_steps', mathSteps: msg.mathSteps });
                    break;
                case 'board_actions_partial':
                    this.on({ type: 'board_actions', boardActions: msg.boardActions });
                    break;
                case 'response_final':
                    this.on({
                        type: 'response_final',
                        text: msg.text,
                        mathSteps: msg.mathSteps,
                        boardActions: msg.boardActions,
                    });
                    break;
                case 'tts_flush':
                    // Drop any audio scheduled past now
                    this.scheduledUntil = this.audioCtx ? this.audioCtx.currentTime : 0;
                    break;
                case 'interrupted':
                    this.aiSpeaking = false;
                    this.on({ type: 'interrupted', reason: msg.reason, spokenSoFar: msg.spokenSoFar });
                    break;
                case 'turn_end':
                    this.on({ type: 'turn_end', turnId: msg.turnId, abortReason: msg.abortReason });
                    break;
                case 'turn_error':
                case 'stt_error':
                case 'fatal':
                    // Server has decided the session is unrecoverable — don't
                    // reconnect-spam, fall through to legacy fallback.
                    if (msg.type === 'fatal') {
                        this._intentionalDisconnect = true;
                    }
                    this.on({ type: 'error', message: msg.message || msg.type });
                    break;
                default:
                    // unknown — ignore
            }
        }

        disconnect() {
            this._intentionalDisconnect = true;
            if (this._reconnectTimer) {
                clearTimeout(this._reconnectTimer);
                this._reconnectTimer = null;
            }
            this.stopListening();
            try { this.ws?.close(); } catch (_) {}
            try { this.audioCtx?.close(); } catch (_) {}
            this.audioCtx = null;
            this.outGain = null;
            this.ws = null;
            this.connected = false;
        }
    }

    global.VoiceStreamClient = VoiceStreamClient;
})(window);
