/* --- /js/voice-stream-client.js?v=3 --- */
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
            // Surface mic level to UI for reactive visualizations.
            // Map dBFS (-90..0) to 0..1 with a soft floor so background hum
            // doesn't drive the visual; speech sits comfortably in the upper half.
            const level = Math.max(0, Math.min(1, (dbfs + 60) / 45));
            this.on({ type: 'mic_level', dbfs, level });

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
            // Int16Array requires a 2-byte aligned byteOffset. The frame
            // header is 7 bytes (odd), so the PCM payload starts on an
            // odd offset inside the WebSocket buffer — constructing a
            // view directly throws RangeError. Copy into a fresh buffer
            // via slice() so the Int16Array sits at offset 0.
            const pcmBytes = u8.slice(pcmStart);
            const evenLen = pcmBytes.byteLength - (pcmBytes.byteLength % 2);
            const i16 = new Int16Array(pcmBytes.buffer, 0, evenLen / 2);
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

;
/* --- /js/voice-controller.js --- */
// ============================================
// REAL-TIME VOICE CONTROLLER
// GPT-style live voice chat with board integration
// ============================================

/**
 * Phase 3.5: Real-Time Voice Chat
 * Conversational voice experience like OpenAI's GPT live voice
 *
 * Features:
 * - OpenAI Whisper for speech-to-text transcription
 * - Cartesia TTS with user's selected tutor voice
 * - Board integration with voice commands
 * - Disables old hands-free mode when active
 * - Individual message playback still available
 */

class VoiceController {
    constructor(whiteboard) {
        this.whiteboard = whiteboard;

        // WebSocket connection
        this.socket = null;
        this.isConnected = false;

        // Audio components
        this.mediaRecorder = null;
        this.audioContext = null;
        this.audioQueue = [];
        this.isPlaying = false;

        // Voice Activity Detection
        this.vadAnalyzer = null;
        this.isSpeaking = false;
        this.silenceTimeout = null;
        this.silenceThreshold = 2500; // ms of silence before auto-sending (hands-free mode) - increased for better UX
        this.minSpeechDuration = 500; // ms - minimum speech duration before enabling auto-stop

        // State
        this.isListening = false;
        this.isAISpeaking = false;
        this.mode = 'idle'; // 'idle', 'listening', 'thinking', 'speaking'
        this.handsFreeMode = false; // Push-to-talk mode by default (user can enable hands-free)
        this.currentAudio = null; // Track current playing audio for interruption
        this.speechStartTime = null; // Track when user started speaking

        // UI elements
        this.voiceButton = null;
        this.voiceOrb = null;
        this.statusText = null;

        // Configuration
        this.config = {
            sampleRate: 16000,
            channels: 1,
            vadThreshold: -50, // dB
            enableBoardCommands: true // Allow voice commands for board actions
        };

        console.log('🎙️ Voice Controller initializing...');
        this.init();
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    async init() {
        // Check for browser support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('[Voice] Browser does not support audio input');
            return;
        }

        // Initialize audio context
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Create UI
        this.createVoiceUI();

        // Setup event listeners
        this.setupEventListeners();

        // Try the streaming pipeline. Falls back to legacy MediaRecorder
        // path if browser lacks AudioWorklet/WebSocket or upgrade fails.
        this.setupStreamingPipeline().catch(err => {
            console.warn('[Voice] streaming pipeline unavailable, using legacy path:', err?.message);
        });

        console.log('✅ Voice Controller ready');
    }

    // ============================================
    // STREAMING PIPELINE (Phase 2 — chat-page orb)
    // ============================================

    // Best-effort client-side mirror of the server voice paywall
    // (utils/voiceUpgrade.js → hasPremiumAccess). Read-only: the server still
    // enforces. Returns false ONLY when we positively know the account is
    // non-premium — if currentUser hasn't loaded yet we return true so we
    // don't wrongly downgrade a premium user to the legacy path.
    hasPremiumVoiceAccess() {
        const u = window.currentUser;
        if (!u) return true; // unknown → let the connect attempt / server decide
        const roles = Array.isArray(u.roles) ? u.roles : [u.role || 'student'];
        if (roles.some(r => r === 'teacher' || r === 'parent' || r === 'admin')) return true;
        if (u.subscriptionTier === 'unlimited') return true;
        if (u.schoolLicenseId) return true;
        return false;
    }

    async setupStreamingPipeline() {
        if (typeof window.VoiceStreamClient !== 'function') return;
        if (typeof window.AudioWorklet === 'undefined' &&
            !(window.AudioContext && AudioContext.prototype.audioWorklet)) {
            return;
        }

        // The streaming WS enforces the same premium paywall as the HTTP routes
        // (utils/voiceUpgrade.js → 402 Payment Required). A non-premium account
        // would just get a handshake refusal that the browser surfaces as a
        // contentless error Event — noisy and misleading in the console. Skip
        // the doomed connect; the paywall intercept on the voice buttons
        // (script.js gateVoiceTutorButton) owns the free-tier UX instead.
        if (!this.hasPremiumVoiceAccess()) {
            this.streamingUnavailable = true;
            console.info('[Voice] streaming pipeline skipped — account not premium (upgrade prompt handled by voice buttons)');
            return;
        }

        const client = new window.VoiceStreamClient({
            wsPath: '/api/voice/stream',
            on: (ev) => this.handleStreamEvent(ev),
        });

        try {
            await client.connect();
        } catch (err) {
            // A failed WS handshake surfaces as a bare error Event with no HTTP
            // status (browsers hide it), so we can't distinguish 401/402/503/
            // network here. This account already passed the paywall check
            // above, so treat it as transient/config and degrade to the legacy
            // push-to-talk path — which reports its own failures to the user.
            this.streamingUnavailable = true;
            console.warn('[Voice] streaming handshake refused; using legacy voice path', {
                readyState: client && client.ws ? client.ws.readyState : 'n/a',
            });
            return;
        }

        this.streamingUnavailable = false;
        this.streamClient = client;
        this.useStreamingPipeline = true;
        console.log('[Voice] streaming pipeline active (chat-page orb)');
    }

    handleStreamEvent(ev) {
        switch (ev.type) {
            case 'ready':
                break;

            case 'listening_started':
                this.isListening = true;
                this.updateUI('listening');
                break;

            case 'listening_stopped':
                this.isListening = false;
                if (!this.isAISpeaking) this.updateUI('idle');
                break;

            case 'transcript_final':
                if (ev.text && window.appendMessage) {
                    window.appendMessage(ev.text, 'user');
                }
                break;

            case 'turn_start':
                this.updateUI('thinking');
                this._pendingResponseText = '';
                break;

            case 'response_delta':
                this._pendingResponseText = (this._pendingResponseText || '') + (ev.text || '');
                break;

            case 'board_actions':
                if (this.config.enableBoardCommands && Array.isArray(ev.boardActions)) {
                    this.executeBoardActions(ev.boardActions);
                }
                break;

            case 'response_final':
                if (ev.text && window.appendMessage) {
                    window.appendMessage(ev.text, 'ai');
                }
                if (this.config.enableBoardCommands && Array.isArray(ev.boardActions) && ev.boardActions.length) {
                    this.executeBoardActions(ev.boardActions);
                }
                this._pendingResponseText = '';
                break;

            case 'ai_speaking_started':
                this.isAISpeaking = true;
                this.updateUI('speaking');
                break;

            case 'ai_speaking_ended':
                this.isAISpeaking = false;
                this.updateUI('idle');
                break;

            case 'barge_in':
                // local UI ack — server does the heavy lifting
                break;

            case 'interrupted':
                this.isAISpeaking = false;
                this.updateUI('idle');
                break;

            case 'turn_end':
                break;

            case 'disconnected':
                console.warn('[Voice] stream disconnected — falling back to legacy path');
                this.useStreamingPipeline = false;
                this.streamClient = null;
                this.updateUI('idle');
                break;

            case 'error':
                console.warn('[Voice] stream error:', ev.message);
                if (
                    ev.message === 'worklet_load_failed' ||
                    (typeof ev.message === 'string' && ev.message.indexOf('Streaming STT unavailable') === 0)
                ) {
                    console.warn('[Voice] disabling streaming pipeline, falling back');
                    this.useStreamingPipeline = false;
                    if (this.streamClient) {
                        try { this.streamClient.disconnect(); } catch (_) {}
                        this.streamClient = null;
                    }
                    if (this.isListening || this.isAISpeaking) this.updateUI('idle');
                }
                break;
        }
    }

    // ============================================
    // UI COMPONENTS
    // ============================================

    createVoiceUI() {
        // Check user preference for voice chat enabled (default to true)
        const voiceEnabled = !window.currentUser || window.currentUser?.preferences?.voiceChatEnabled !== false;

        // Create floating voice button (like GPT's orb)
        const voiceContainer = document.createElement('div');
        voiceContainer.id = 'voice-chat-container';
        // pointer-events:none on the container lets clicks on empty container
        // space (e.g. between the orb and the status label) pass through to
        // the send button, which sits at the same screen region. The orb and
        // status label re-enable pointer-events on themselves below.
        voiceContainer.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            z-index: 10001;
            display: ${voiceEnabled ? 'flex' : 'none'};
            flex-direction: column;
            align-items: center;
            gap: 10px;
            pointer-events: none;
        `;

        // Voice orb button
        const orbButton = document.createElement('button');
        orbButton.id = 'voice-orb';
        orbButton.className = 'voice-orb idle';
        orbButton.setAttribute('aria-label', 'Start voice chat');
        orbButton.style.pointerEvents = 'auto';
        orbButton.innerHTML = `
            <div class="orb-inner">
                <div class="orb-pulse"></div>
                <i class="fas fa-microphone"></i>
            </div>
        `;

        // Status text
        const statusText = document.createElement('div');
        statusText.id = 'voice-status';
        statusText.className = 'voice-status';
        statusText.style.pointerEvents = 'auto';
        statusText.textContent = this.handsFreeMode ? 'Click to start (hands-free)' : 'Click to start voice chat';

        voiceContainer.appendChild(orbButton);
        voiceContainer.appendChild(statusText);
        document.body.appendChild(voiceContainer);

        this.voiceButton = orbButton;
        this.voiceOrb = orbButton.querySelector('.orb-inner');
        this.statusText = statusText;

        // Add CSS
        this.injectVoiceStyles();
    }

    injectVoiceStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* Voice Orb Button */
            .voice-orb {
                width: 80px;
                height: 80px;
                border-radius: 50%;
                border: none;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                cursor: pointer;
                position: relative;
                overflow: hidden;
                transition: all 0.3s ease;
                box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
            }

            .voice-orb:hover {
                transform: scale(1.05);
                box-shadow: 0 12px 30px rgba(102, 126, 234, 0.4);
            }

            .voice-orb.active {
                background: linear-gradient(135deg, #12B3B3 0%, #0ea5a5 100%);
                animation: orb-pulse 1.5s ease-in-out infinite;
            }

            .voice-orb.thinking {
                background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
                animation: orb-thinking 1s linear infinite;
            }

            .voice-orb.speaking {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                animation: orb-speaking 0.5s ease-in-out infinite alternate;
            }

            .orb-inner {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
            }

            .orb-inner i {
                font-size: 32px;
                color: white;
                z-index: 2;
            }

            .orb-pulse {
                position: absolute;
                width: 100%;
                height: 100%;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.2);
                animation: pulse-fade 2s ease-out infinite;
            }

            /* Voice Status Text */
            .voice-status {
                color: #667eea;
                font-size: 14px;
                font-weight: 600;
                text-align: center;
                transition: color 0.3s ease;
                min-width: 150px;
            }

            .voice-status.active {
                color: #12B3B3;
            }

            .voice-status.thinking {
                color: #fbbf24;
            }

            .voice-status.speaking {
                color: #10b981;
            }

            /* Animations */
            @keyframes orb-pulse {
                0%, 100% {
                    transform: scale(1);
                    box-shadow: 0 8px 20px rgba(18, 179, 179, 0.3);
                }
                50% {
                    transform: scale(1.05);
                    box-shadow: 0 12px 30px rgba(18, 179, 179, 0.5);
                }
            }

            @keyframes orb-thinking {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            @keyframes orb-speaking {
                from { transform: scale(1); }
                to { transform: scale(1.1); }
            }

            @keyframes pulse-fade {
                0% {
                    transform: scale(1);
                    opacity: 0.4;
                }
                100% {
                    transform: scale(1.8);
                    opacity: 0;
                }
            }

            /* Waveform visualization */
            #voice-waveform {
                position: absolute;
                bottom: 120px;
                right: 30px;
                width: 200px;
                height: 60px;
                background: rgba(255, 255, 255, 0.9);
                border-radius: 12px;
                padding: 10px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                display: none;
            }

            #voice-waveform.visible {
                display: flex;
                align-items: center;
                justify-content: space-around;
            }

            .waveform-bar {
                width: 4px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 2px;
                transition: height 0.1s ease;
            }

            /* ── Mobile: move orb above input area + bottom nav ── */
            @media (max-width: 768px) {
                #voice-chat-container {
                    bottom: calc(170px + env(safe-area-inset-bottom, 0px)) !important;
                    right: 16px !important;
                    gap: 6px !important;
                }

                .voice-orb {
                    width: 56px !important;
                    height: 56px !important;
                    box-shadow: 0 4px 14px rgba(102, 126, 234, 0.35);
                }

                .voice-orb .orb-inner i {
                    font-size: 22px !important;
                }

                .voice-status {
                    display: none !important;
                }

                #voice-waveform {
                    bottom: 80px !important;
                    right: 16px !important;
                    width: 160px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    setupEventListeners() {
        if (!this.voiceButton) {
            console.error('❌ [Voice] Voice button not found, cannot setup listeners');
            return;
        }

        console.log('✅ [Voice] Setting up event listeners for voice button');

        this.voiceButton.addEventListener('click', () => {
            console.log('🎤 [Voice] Orb clicked! isListening:', this.isListening, 'isAISpeaking:', this.isAISpeaking);

            // If AI is speaking, interrupt it and start listening
            if (this.isAISpeaking) {
                this.stopSpeaking();
                this.startListening();
            }
            // If already listening in hands-free mode, stop
            else if (this.isListening) {
                this.stopListening();
            }
            // Otherwise, start listening
            else {
                this.startListening();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // ESC to stop voice (works anytime - listening or speaking)
            if (e.code === 'Escape') {
                if (this.isListening) {
                    this.stopListening();
                } else if (this.isAISpeaking) {
                    this.stopSpeaking();
                }
            }

            // Hold spacebar to talk (push-to-talk mode)
            // Only activate if NOT typing in an input field
            if (e.code === 'Space' && !this.isTypingInInputField(e.target)) {
                if (!this.isListening && !e.repeat) {
                    e.preventDefault();
                    this.startListening();
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            // Only stop listening on space release if NOT typing in an input field
            if (e.code === 'Space' && this.isListening && !this.isTypingInInputField(e.target)) {
                e.preventDefault();
                this.stopListening();
            }
        });
    }

    /**
     * Detect the best supported audio MIME type for MediaRecorder.
     * Safari/iOS does not support audio/webm — falls back to mp4 or default.
     */
    getSupportedMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4;codecs=opus',
            'audio/mp4',
            'audio/ogg;codecs=opus',
            'audio/ogg',
        ];
        for (const type of types) {
            if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return ''; // Let browser choose default
    }

    /**
     * Check if user is currently typing in an input field
     * Prevents spacebar from activating voice when typing
     * @param {HTMLElement} target - The event target element
     * @returns {boolean} True if user is typing in an input field
     */
    isTypingInInputField(target) {
        // Check if target is an input, textarea, or contenteditable element
        if (!target) return false;

        const tagName = target.tagName;
        const isContentEditable = target.isContentEditable || target.contentEditable === 'true';

        // Check for standard input elements
        if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
            return true;
        }

        // Check for contenteditable divs (like the chat input)
        if (isContentEditable) {
            return true;
        }

        // Check if user-input chat box has focus (additional safety check)
        const userInput = document.getElementById('user-input');
        if (userInput && (document.activeElement === userInput || userInput.contains(document.activeElement))) {
            return true;
        }

        return false;
    }

    // ============================================
    // VOICE INPUT (Speech-to-Text)
    // ============================================

    async startListening() {
        console.log('🎙️ [Voice] startListening() called');

        // ── Streaming pipeline path (Phase 2) ──
        if (this.useStreamingPipeline && this.streamClient) {
            try {
                // Push current board state so the AI can reference existing objects
                if (this.whiteboard) {
                    this.streamClient.setBoardContext(this.getBoardContext());
                }
                await this.streamClient.startListening();
                return;
            } catch (err) {
                console.warn('[Voice] stream startListening failed, falling back:', err);
                this.useStreamingPipeline = false;
                // fall through to legacy path
            }
        }

        console.log('🎙️ [Voice] handsFreeMode:', this.handsFreeMode);
        console.log('🎙️ [Voice] silenceThreshold:', this.silenceThreshold, 'ms');
        console.log('🎙️ [Voice] minSpeechDuration:', this.minSpeechDuration, 'ms');

        try {
            // Resume AudioContext if suspended (required by browser autoplay policies)
            if (this.audioContext && this.audioContext.state === 'suspended') {
                console.log('🔊 [Voice] Resuming suspended AudioContext...');
                await this.audioContext.resume();
            }

            // Disable old hands-free mode if active
            if (window.recognition && window.isRecognizing) {
                console.log('🎙️ [Voice] Disabling old hands-free mode...');
                window.recognition.stop();
                window.isRecognizing = false;

                const micBtn = document.getElementById('mic-btn');
                if (micBtn) {
                    micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                }
            }

            console.log('🎤 [Voice] Requesting microphone permission...');

            // Request microphone permission
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: this.config.channels,
                    sampleRate: this.config.sampleRate,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            console.log('✅ [Voice] Microphone access granted!', stream);

            this.isListening = true;
            this.updateUI('listening');

            // Setup MediaRecorder with best supported MIME type
            const mimeType = this.getSupportedMimeType();
            this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

            const audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                console.log('🛑 [Voice] Recording stopped, audio chunks:', audioChunks.length);
                const recordedType = this.mediaRecorder.mimeType || 'audio/webm';
                const audioBlob = new Blob(audioChunks, { type: recordedType });
                console.log('📦 [Voice] Audio blob size:', audioBlob.size, 'bytes, type:', recordedType);
                await this.sendAudioToBackend(audioBlob);

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };

            // Setup Voice Activity Detection
            this.setupVAD(stream);

            // Start recording
            this.mediaRecorder.start();

            console.log('🎙️ [Voice] MediaRecorder started! State:', this.mediaRecorder.state);

        } catch (error) {
            console.error('[Voice] Failed to start listening:', error);
            this.updateUI('error');
            alert('Failed to access microphone. Please check permissions.');
        }
    }

    stopListening() {
        if (!this.isListening) return;

        // ── Streaming pipeline path ──
        if (this.useStreamingPipeline && this.streamClient) {
            this.streamClient.stopListening();
            return;
        }

        console.log('🎙️ [Voice] stopListening() called');
        this.isListening = false;
        this.isSpeaking = false;
        this.speechStartTime = null;
        this.updateUI('thinking');

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        if (this.vadAnalyzer) {
            this.vadAnalyzer = null;
        }

        console.log('🎙️ Stopped listening');
    }

    setupVAD(stream) {
        // Voice Activity Detection using Web Audio API
        const audioContext = this.audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyzer = audioContext.createAnalyser();

        analyzer.fftSize = 2048;
        source.connect(analyzer);

        const bufferLength = analyzer.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const checkVolume = () => {
            if (!this.isListening) return;

            analyzer.getByteFrequencyData(dataArray);

            // Calculate average volume
            const average = dataArray.reduce((a, b) => a + b) / bufferLength;
            const db = 20 * Math.log10(average / 255);

            const isSpeakingNow = db > this.config.vadThreshold;

            if (isSpeakingNow && !this.isSpeaking) {
                // Started speaking
                this.isSpeaking = true;
                this.speechStartTime = Date.now();
                console.log('🗣️ Voice detected');
                clearTimeout(this.silenceTimeout);

                // Update status
                if (this.statusText) {
                    this.statusText.textContent = 'Listening...';
                }
            } else if (!isSpeakingNow && this.isSpeaking) {
                // Silence detected - check if user spoke long enough before auto-stopping
                const speechDuration = Date.now() - this.speechStartTime;

                if (speechDuration < this.minSpeechDuration) {
                    // Too brief - probably background noise, ignore it
                    console.log(`⚠️ Speech too brief (${speechDuration}ms), ignoring...`);
                    this.isSpeaking = false;
                    this.speechStartTime = null;
                    return;
                }

                // Real speech detected, start silence countdown
                clearTimeout(this.silenceTimeout);
                this.silenceTimeout = setTimeout(() => {
                    this.isSpeaking = false;
                    this.speechStartTime = null;
                    console.log(`🤫 Silence detected after ${speechDuration}ms of speech - auto-sending`);

                    // Auto-stop after silence (works in all modes now, not just hands-free)
                    if (this.isListening) {
                        this.stopListening();
                    }
                }, this.silenceThreshold);

                // Show countdown in status
                if (this.statusText) {
                    this.statusText.textContent = 'Processing...';
                }
            }

            requestAnimationFrame(checkVolume);
        };

        checkVolume();
        this.vadAnalyzer = analyzer;
    }

    async sendAudioToBackend(audioBlob) {
        console.log('📤 [Voice] Sending audio to backend...', audioBlob.size, 'bytes');
        this.updateUI('thinking');

        try {
            // Convert blob to base64 for transmission
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);

            reader.onloadend = async () => {
                const base64Audio = reader.result.split(',')[1];
                console.log('🔄 [Voice] Audio converted to base64, length:', base64Audio.length);

                // Send to backend for transcription and AI response
                console.log('🌐 [Voice] Sending POST to /api/voice/process...');

                // Use csrfFetch if available, otherwise use regular fetch
                const fetchFn = window.csrfFetch || fetch;
                if (!window.csrfFetch) {
                    console.warn('⚠️ [Voice] csrfFetch not available, using regular fetch');
                }

                const response = await fetchFn('/api/voice/process', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        audio: base64Audio,
                        mimeType: audioBlob.type || 'audio/webm',
                        boardContext: this.getBoardContext()
                    })
                });

                console.log('📥 [Voice] Response received, status:', response.status);

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    // COMPLIANCE: Under-13 users blocked from third-party voice chat.
                    if (response.status === 403 && errorData.useWebSpeech) {
                        console.warn('🔇 [Voice] Under-13 user blocked from voice chat. Stopping.');
                        this.updateUI('idle');
                        this.stopListening();
                        if (window.showToast) {
                            window.showToast('Voice chat is not available for your account. Please use text chat instead.', 'info');
                        }
                        return;
                    }
                    throw new Error(errorData.message || errorData.error || 'Server error');
                }

                // Handle NDJSON streaming response
                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('application/x-ndjson')) {
                    await this.processStreamedResponse(response);
                } else {
                    // Legacy JSON fallback
                    const data = await response.json();
                    await this.handleLegacyResponse(data);
                }

            };

        } catch (error) {
            console.error('❌ [Voice] Failed to process audio:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            this.updateUI('error');

            // Show user-friendly error message
            const errorMessage = error.message || 'Failed to process voice input';
            if (this.statusText) {
                this.statusText.textContent = errorMessage;
                this.statusText.style.color = '#dc2626';
            }

            // Auto-hide error after 5 seconds
            setTimeout(() => {
                if (this.statusText) {
                    this.statusText.textContent = 'Click to start voice chat';
                    this.statusText.style.color = '';
                }
                this.updateUI('idle');
            }, 5000);
        }
    }

    // ============================================
    // VOICE OUTPUT (Text-to-Speech)
    // ============================================

    async playAIResponse(audioUrl) {
        this.updateUI('speaking');
        this.isAISpeaking = true;

        try {
            // Stop any currently playing audio (interruption)
            if (this.currentAudio) {
                console.log('🛑 [Voice] Interrupting current audio');
                this.currentAudio.pause();
                this.currentAudio.currentTime = 0;
            }

            const audio = new Audio(audioUrl);
            // iOS requires playsInline so audio plays without fullscreen UI
            audio.playsInline = true;
            audio.setAttribute('playsinline', '');
            audio.preload = 'auto';
            this.currentAudio = audio;

            audio.onended = () => {
                console.log('✅ [Voice] Audio playback ended');
                this.isAISpeaking = false;
                this.currentAudio = null;
                this.updateUI('idle');

                // Auto-restart listening in hands-free mode
                if (this.handsFreeMode && !this.isListening) {
                    console.log('🔄 [Voice] Auto-restarting listening (hands-free mode)');
                    setTimeout(() => {
                        if (!this.isListening) {
                            this.startListening();
                        }
                    }, 500); // Small delay before restarting
                }
            };

            audio.onerror = () => {
                console.error('[Voice] Audio playback error');
                this.isAISpeaking = false;
                this.currentAudio = null;
                this.updateUI('error');
            };

            await audio.play();
            console.log('🔊 [Voice] Playing AI response');

        } catch (error) {
            console.error('[Voice] Failed to play audio:', error);
            this.isAISpeaking = false;
            this.currentAudio = null;
            this.updateUI('error');
        }
    }

    /**
     * Process NDJSON streamed response — shows transcription and text immediately,
     * plays audio only when ready. Much lower perceived latency.
     */
    async processStreamedResponse(response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let responseText = '';
        let boardContextData = null;
        let gotAudio = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let newlineIdx;
            while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIdx).trim();
                buffer = buffer.slice(newlineIdx + 1);
                if (!line) continue;

                let phase;
                try { phase = JSON.parse(line); } catch (e) { continue; }

                if (phase.phase === 'transcription' && phase.transcription) {
                    if (window.appendMessage) {
                        window.appendMessage(phase.transcription, 'user');
                    }

                } else if (phase.phase === 'response') {
                    responseText = phase.response || '';
                    boardContextData = phase.boardContext || null;

                    if (phase.boardActions && this.config.enableBoardCommands) {
                        this.executeBoardActions(phase.boardActions);
                    }

                    if (responseText && window.appendMessage) {
                        window.appendMessage(responseText, 'ai');
                    }

                    // Apply board context
                    if (boardContextData && window.chatBoardController) {
                        const messageElements = document.querySelectorAll('.message.ai');
                        const latestMessage = messageElements[messageElements.length - 1];
                        if (latestMessage) {
                            window.chatBoardController.enhanceChatMessage(latestMessage, 'ai', boardContextData);
                        }
                    }

                } else if (phase.phase === 'audio') {
                    gotAudio = true;
                    if (phase.audioUrl) {
                        await this.playAIResponse(phase.audioUrl);
                    } else {
                        this.updateUI('idle');
                    }

                } else if (phase.phase === 'error') {
                    throw new Error(phase.message || 'Voice processing failed');
                }
            }
        }

        if (!gotAudio) {
            this.updateUI('idle');
        }
    }

    /**
     * Handle legacy (non-streaming) JSON response — backwards compatibility
     */
    async handleLegacyResponse(data) {
        if (data.transcription && window.appendMessage) {
            window.appendMessage(data.transcription, 'user');
        }
        if (data.response) {
            if (data.boardActions && this.config.enableBoardCommands) {
                await this.executeBoardActions(data.boardActions);
            }
            if (window.appendMessage) {
                window.appendMessage(data.response, 'ai', null, data.isMasteryQuiz);
            }
            if (data.audioUrl) {
                await this.playAIResponse(data.audioUrl);
            }
        }
        if (data.boardContext && window.chatBoardController) {
            const messageElements = document.querySelectorAll('.message.ai');
            const latestMessage = messageElements[messageElements.length - 1];
            if (latestMessage) {
                window.chatBoardController.enhanceChatMessage(latestMessage, 'ai', data.boardContext);
            }
        }
        this.updateUI('idle');
    }

    // Stop AI speaking (for interruption)
    stopSpeaking() {
        // ── Streaming pipeline: barge-in via local VAD or explicit user action ──
        if (this.useStreamingPipeline && this.streamClient) {
            this.streamClient._fireBargeIn();
            this.isAISpeaking = false;
            this.updateUI('idle');
            return;
        }

        if (this.currentAudio) {
            console.log('🛑 [Voice] Stopping AI speech (interrupted by user)');
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
            this.isAISpeaking = false;
            this.updateUI('idle');
        }
    }

    // ============================================
    // BOARD INTEGRATION
    // ============================================

    getBoardContext() {
        if (!this.whiteboard) return null;

        // Extract current board state for AI context
        const context = {
            mode: this.whiteboard.boardMode,
            semanticObjects: Array.from(this.whiteboard.semanticObjects.entries()).map(([id, obj]) => ({
                id,
                type: obj.type,
                content: obj.latex || obj.text,
                region: obj.region
            })),
            hasContent: this.whiteboard.canvas.getObjects().length > 0
        };

        return context;
    }

    async executeBoardActions(actions) {
        if (!this.whiteboard) {
            console.log('⚠️ Board actions skipped - whiteboard not available');
            return;
        }

        console.log('🎨 Executing board actions:', actions);

        for (const action of actions) {
            switch (action.type) {
                case 'write':
                    await this.whiteboard.aiWritePartialStep(
                        action.text,
                        action.x || 100,
                        action.y || 100,
                        action.pause !== false
                    );
                    break;

                case 'circle':
                    if (action.objectId) {
                        this.whiteboard.aiDrawHandwrittenCircle(action.objectId, action.message);
                    }
                    break;

                case 'arrow':
                    if (action.fromId) {
                        this.whiteboard.aiDrawHandwrittenArrow(
                            action.fromId,
                            action.toX || 200,
                            action.toY || 200,
                            action.message
                        );
                    }
                    break;

                case 'clear':
                    this.whiteboard.clearCanvas();
                    break;

                case 'highlight':
                    if (action.objectId) {
                        this.whiteboard.highlightObject(action.objectId, action.color, action.duration);
                    }
                    break;

                default:
                    console.warn('[Voice] Unknown board action:', action.type);
            }

            // Small delay between actions for natural flow
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }

    // ============================================
    // UI UPDATES
    // ============================================

    updateUI(state) {
        if (!this.voiceButton || !this.statusText) return;

        // Remove all state classes
        this.voiceButton.classList.remove('idle', 'active', 'thinking', 'speaking');
        this.statusText.classList.remove('active', 'thinking', 'speaking');

        // Update icon
        const icon = this.voiceButton.querySelector('i');

        switch (state) {
            case 'listening':
                this.voiceButton.classList.add('active');
                this.statusText.classList.add('active');
                this.statusText.textContent = 'Listening...';
                icon.className = 'fas fa-microphone-slash';
                break;

            case 'thinking':
                this.voiceButton.classList.add('thinking');
                this.statusText.classList.add('thinking');
                this.statusText.textContent = 'Thinking...';
                icon.className = 'fas fa-brain';
                break;

            case 'speaking':
                this.voiceButton.classList.add('speaking');
                this.statusText.classList.add('speaking');
                this.statusText.textContent = this.handsFreeMode ? 'Speaking... (click to interrupt)' : 'Speaking...';
                icon.className = 'fas fa-volume-up';
                break;

            case 'error':
                this.voiceButton.classList.add('idle');
                this.statusText.textContent = 'Error - Click to retry';
                icon.className = 'fas fa-exclamation-triangle';
                setTimeout(() => this.updateUI('idle'), 3000);
                break;

            default: // idle
                this.voiceButton.classList.add('idle');
                this.statusText.textContent = this.handsFreeMode ? 'Click to start (hands-free)' : 'Click to start voice chat';
                icon.className = 'fas fa-microphone';
        }
    }

    // ============================================
    // CLEANUP
    // ============================================

    destroy() {
        this.stopListening();

        if (this.audioContext) {
            this.audioContext.close();
        }

        if (this.voiceButton) {
            this.voiceButton.remove();
        }

        console.log('🎙️ Voice Controller destroyed');
    }
}

// ============================================
// AUTO-INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize voice controller immediately (whiteboard optional)
    window.voiceController = new VoiceController(null);
    console.log('✅ Voice Controller initialized (whiteboard integration will connect when available)');

    // Connect whiteboard when available
    const checkWhiteboard = setInterval(() => {
        if (window.whiteboard && window.whiteboard.canvas && window.voiceController) {
            window.voiceController.whiteboard = window.whiteboard;
            clearInterval(checkWhiteboard);
            console.log('✅ Whiteboard connected to Voice Controller');
        }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => clearInterval(checkWhiteboard), 10000);
});

console.log('🎙️ Voice Controller module loaded');
