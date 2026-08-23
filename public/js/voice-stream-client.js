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
    const PLAYBACK_FADE_MS = 30;    // ramp gain down when the student speaks

    // Gain the tutor drops to — not silence — the instant local VAD hears
    // the student. This is the "go ahead" beat: the student gets an
    // immediate audible answer to speaking, while the server works out
    // from the transcript whether they actually meant to take the floor.
    // A backchannel ("mm-hm") comes back up; a real interruption gets
    // stopped dead by _stopPlayback().
    const DUCK_GAIN = 0.15;
    const DUCK_FADE_MS = 60;        // ramp back up — a step sounds like a glitch

    // Failsafe: if the server never rules on a duck (message lost, socket
    // hiccup), come back up on our own rather than leave the tutor
    // inaudible but still streaming. Comfortably longer than the server's
    // own BARGE_DUCK_RESOLVE_MS so its verdict normally wins.
    const DUCK_FAILSAFE_MS = 1800;

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
            this.ducked = false;
            this._duckFailsafeTimer = null;

            // Every AudioBufferSourceNode currently scheduled or playing.
            // Web Audio has no "flush the graph" call: once start() is
            // called a source WILL play to completion unless something
            // holds a reference and stops it. Resetting scheduledUntil only
            // changes where the NEXT chunk lands, which is why interrupting
            // used to leave the old response audibly running underneath the
            // new one. This set is that reference.
            this._liveSources = new Set();

            // Audio frames carry the 32-bit tag of the turn that produced
            // them. Only frames matching the tag the server announced in
            // turn_start are played; chunks still in flight from a turn the
            // student talked over are dropped instead of being mixed into
            // the reply. null = accept anything (pre-first-turn).
            this._acceptTag = null;

            // Bumped by every _stopPlayback(). The per-chunk
            // "playback finished" timers capture it, so a timer armed by a
            // turn that has since been interrupted can't fire an
            // ai_speaking_ended in the middle of the turn that replaced it —
            // which would drop the UI to "listening" while the tutor talks.
            this._playbackEpoch = 0;

            // Listening state
            this.listening = false;

            // Pending audio buffer to play once context is running
            this._pendingChunks = [];

            // Analyser on the output chain — feeds the voice-reactive glow
            // (chat-voice-meter.js) which the streaming path never powered.
            this.outAnalyser = null;

            // Last-turn PCM retention for the caption bar's replay button.
            // Chunks accumulate per tutor turn (cleared on turn_start),
            // capped so a runaway turn can't hoard memory.
            this._turnPcm = [];
            this._turnPcmSamples = 0;
            this._replaying = false;
        }

        // ~120s at 22.05kHz mono — a generous ceiling for one tutor turn.
        static get REPLAY_MAX_SAMPLES() { return 22050 * 120; }

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
                // Unlock IMMEDIATELY, before the async worklet fetch below. iOS
                // Safari only honors resume() inside the user gesture that
                // reached here (the orb tap / voice-mode entry). The worklet
                // addModule() is a network load that ends the gesture window, so
                // resuming AFTER it leaves the context suspended — AI audio then
                // stays silent until the student taps again, which reads as
                // "tap to advance". Kick resume() off synchronously now; the
                // statechange handler and _playPcmS16 cover any later re-suspend.
                if (this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume().catch(() => { /* gesture lost — retried on next tap */ });
                }
                this.outGain = this.audioCtx.createGain();
                this.outGain.gain.value = 1.0;
                // outGain → analyser → destination, mirroring modules/audio.js,
                // so the tutor glow reacts on the streaming path too.
                this.outAnalyser = this.audioCtx.createAnalyser();
                this.outAnalyser.fftSize = 256;
                this.outAnalyser.smoothingTimeConstant = 0.8;
                this.outGain.connect(this.outAnalyser);
                this.outAnalyser.connect(this.audioCtx.destination);
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

        /**
         * Local VAD heard the student over the tutor.
         *
         * This DUCKS — it does not stop. The microphone alone cannot tell
         * "wait, I don't get it" from "mm-hm" from a dropped pencil, and
         * stopping on all three is what made the tutor feel twitchy and
         * lose explanations to a nod. Dropping to DUCK_GAIN gives the
         * student the instant "go ahead" a person would give, and the
         * server rules on the transcript a beat later: `interrupted` stops
         * playback dead, `resume_speaking` brings it back up.
         */
        _fireBargeIn() {
            if (!this.aiSpeaking || this.ducked) return;
            this.ducked = true;
            this.consecutiveLoudFrames = 0;
            this._rampGain(DUCK_GAIN, PLAYBACK_FADE_MS);
            this._sendJson({ type: 'barge_in', at_ms: Date.now() });

            // If the verdict never lands, come back up rather than leaving
            // the tutor mumbling at 15% for the rest of the turn.
            if (this._duckFailsafeTimer) clearTimeout(this._duckFailsafeTimer);
            this._duckFailsafeTimer = setTimeout(() => {
                this._duckFailsafeTimer = null;
                this._unduck();
            }, DUCK_FAILSAFE_MS);

            this.on({ type: 'barge_in' });
        }

        /** Restore full volume after a duck that turned out not to be an interruption. */
        _unduck() {
            if (this._duckFailsafeTimer) {
                clearTimeout(this._duckFailsafeTimer);
                this._duckFailsafeTimer = null;
            }
            if (!this.ducked) return;
            this.ducked = false;
            this.consecutiveLoudFrames = 0;
            this._rampGain(1.0, DUCK_FADE_MS);
        }

        _rampGain(target, ms) {
            if (!this.outGain || !this.audioCtx) return;
            const now = this.audioCtx.currentTime;
            try {
                this.outGain.gain.cancelScheduledValues(now);
                this.outGain.gain.setValueAtTime(this.outGain.gain.value, now);
                this.outGain.gain.linearRampToValueAtTime(target, now + ms / 1000);
            } catch (_) {
                // Some engines throw on cancelScheduledValues mid-ramp —
                // a hard set still leaves the student at the right volume.
                try { this.outGain.gain.value = target; } catch (__) { /* give up quietly */ }
            }
        }

        /**
         * Hard stop: end the tutor's current utterance immediately and drop
         * everything queued behind it.
         *
         * Stopping the scheduled source nodes is the part that actually
         * silences the tutor — clearing scheduledUntil alone just decides
         * where the next chunk starts, which is how a new response ended up
         * playing on top of the old one instead of replacing it.
         */
        _stopPlayback() {
            for (const src of this._liveSources) {
                try { src.onended = null; src.stop(); } catch (_) { /* already finished */ }
                try { src.disconnect(); } catch (_) { /* already detached */ }
            }
            this._liveSources.clear();
            this._playbackEpoch++;
            if (this.audioCtx) this.scheduledUntil = this.audioCtx.currentTime;

            // Back to unity gain so the next turn is not born ducked.
            if (this._duckFailsafeTimer) {
                clearTimeout(this._duckFailsafeTimer);
                this._duckFailsafeTimer = null;
            }
            this.ducked = false;
            if (this.outGain && this.audioCtx) {
                try {
                    this.outGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
                    this.outGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
                } catch (_) { /* see _rampGain */ }
            }

            this.consecutiveLoudFrames = 0;
            if (this.aiSpeaking) {
                this.aiSpeaking = false;
                this.on({ type: 'ai_speaking_ended' });
                this._dispatchPlaybackEvent('audioPlaybackEnded');
            }
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

            // Drop audio belonging to a turn that is no longer the live one.
            // The server kills an interrupted turn instantly, but chunks it
            // already flushed are in the socket and arrive AFTER the
            // replacement turn has started speaking — playing them is
            // literally two tutors talking at once. The tag has been in the
            // frame header all along; nothing was reading it.
            const tag = ((u8[1] << 24) | (u8[2] << 16) | (u8[3] << 8) | u8[4]) >>> 0;
            if (this._acceptTag !== null && tag !== this._acceptTag) return;

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
            // Retain the live turn's PCM for replay (replays don't re-record).
            if (!this._replaying && this._turnPcmSamples < VoiceStreamClient.REPLAY_MAX_SAMPLES) {
                this._turnPcm.push({ i16, sampleRate });
                this._turnPcmSamples += i16.length;
            }
            const f32 = new Float32Array(i16.length);
            for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 0x8000;
            const buf = this.audioCtx.createBuffer(1, f32.length, sampleRate);
            buf.copyToChannel(f32, 0);
            const src = this.audioCtx.createBufferSource();
            src.buffer = buf;
            src.connect(this.outGain);
            const startAt = Math.max(this.audioCtx.currentTime + 0.005, this.scheduledUntil);
            // Hold a reference until it finishes so _stopPlayback() can
            // actually silence it — a started source is otherwise
            // unreachable and plays to the end no matter what.
            this._liveSources.add(src);
            src.onended = () => {
                this._liveSources.delete(src);
                try { src.disconnect(); } catch (_) { /* already detached */ }
            };
            src.start(startAt);
            this.scheduledUntil = startAt + buf.duration;
            if (!this.aiSpeaking) {
                this.aiSpeaking = true;
                this.consecutiveLoudFrames = 0;
                this.on({ type: 'ai_speaking_started' });
                this._dispatchPlaybackEvent('audioPlaybackStarted');
            }
            // When the last scheduled chunk completes, mark AI as no longer speaking
            const expectedDoneAt = this.scheduledUntil;
            const epoch = this._playbackEpoch;
            setTimeout(() => {
                if (epoch !== this._playbackEpoch) return;   // superseded turn
                if (this.audioCtx.currentTime >= expectedDoneAt - 0.02 && this.aiSpeaking) {
                    this.aiSpeaking = false;
                    this.on({ type: 'ai_speaking_ended' });
                    this._dispatchPlaybackEvent('audioPlaybackEnded');
                }
            }, (buf.duration + 0.05) * 1000);
        }

        // Same DOM events modules/audio.js fires — chat-voice-meter.js listens
        // for them to drive --voice-amp, so the glow now works on this path.
        _dispatchPlaybackEvent(name) {
            try {
                document.dispatchEvent(new CustomEvent(name, {
                    detail: { analyser: this.outAnalyser }
                }));
            } catch (_) { /* SSR/odd envs */ }
        }

        /**
         * Replay the tutor's last spoken turn from retained PCM.
         * Returns false when there's nothing to replay or audio is busy.
         */
        replayLastTurn() {
            if (!this.audioCtx || this.aiSpeaking || !this._turnPcm.length) return false;
            this._replaying = true;
            this.scheduledUntil = this.audioCtx.currentTime;
            for (const chunk of this._turnPcm) {
                this._playPcmS16(chunk.i16, chunk.sampleRate);
            }
            this._replaying = false;
            return true;
        }

        hasReplayableTurn() {
            return this._turnPcm.length > 0;
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
                    // A new turn REPLACES the old one — it never layers on top
                    // of it. Stop whatever is still sounding before adopting
                    // the new turn's audio tag, so the changeover is a clean
                    // handoff even if the previous turn died mid-sentence.
                    this._stopPlayback();
                    if (typeof msg.audioTag === 'number') this._acceptTag = msg.audioTag >>> 0;
                    // Fresh tutor turn — previous turn's replay buffer expires.
                    this._turnPcm = [];
                    this._turnPcmSamples = 0;
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
                    // The server retracted what it was saying (e.g. the verify
                    // stage caught an answer giveaway) and is about to
                    // re-synthesize. Everything queued must go, not just
                    // everything not yet queued.
                    this._stopPlayback();
                    break;
                case 'resume_speaking':
                    // The server looked at the transcript and ruled that this
                    // wasn't an interruption — a backchannel, or nobody spoke
                    // at all. Bring the tutor back up and let them finish.
                    this._unduck();
                    this.on({ type: 'resume_speaking', reason: msg.reason });
                    break;
                case 'interrupted':
                    // Confirmed interruption: stop dead. Refuse any further
                    // audio from this turn so late chunks can't sneak in
                    // behind the student's next question.
                    if (typeof msg.audioTag === 'number' &&
                        this._acceptTag === (msg.audioTag >>> 0)) {
                        this._acceptTag = -1;   // matches no real tag
                    }
                    this._stopPlayback();
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
            this._stopPlayback();
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
