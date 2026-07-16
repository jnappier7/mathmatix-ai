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

    // Mirror every stream event onto the DOM so presentation layers
    // (voice-subtitles.js captions) can react without coupling to this
    // class or the WS protocol. Detail is the raw event object.
    _broadcastVoiceEvent(ev) {
        try {
            document.dispatchEvent(new CustomEvent('mm:voice', { detail: ev }));
        } catch (_) { /* CustomEvent unavailable — captions just stay off */ }
    }

    handleStreamEvent(ev) {
        this._broadcastVoiceEvent(ev);
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
                    // When LWS owns the board, defer to response_final (the full
                    // turn) so partial + final don't render duplicate lines.
                    if (!this._lwsOwnsBoard()) this.executeBoardActions(ev.boardActions);
                }
                break;

            case 'response_final':
                if (ev.text && window.appendMessage) {
                    window.appendMessage(ev.text, 'ai');
                }
                if (this.config.enableBoardCommands) {
                    if (this._lwsOwnsBoard()) {
                        this._renderVoiceBoardToLWS({ mathSteps: ev.mathSteps, boardActions: ev.boardActions });
                    } else if (Array.isArray(ev.boardActions) && ev.boardActions.length) {
                        this.executeBoardActions(ev.boardActions);
                    }
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

    /**
     * Replay the tutor's last spoken turn. Streaming path replays retained
     * PCM; legacy path delegates to modules/audio.js's restart button.
     */
    replayLastTutorAudio() {
        if (this.streamClient && typeof this.streamClient.replayLastTurn === 'function') {
            if (this.streamClient.replayLastTurn()) return true;
        }
        const restartBtn = document.getElementById('restart-audio-btn');
        if (restartBtn && restartBtn.style.display !== 'none') {
            restartBtn.click();
            return true;
        }
        return false;
    }

    // ============================================
    // UI COMPONENTS
    // ============================================

    createVoiceUI() {
        // The orb IS the microphone in voice mode — the central mic/listening
        // control that voice-mode.js flanks with #mpc-voice-work and
        // #mpc-voice-end (see voice-mode.js: "The orb is the mic"). It is hidden
        // during normal chat and shown only in voice mode via CSS
        // (body.cr-mode:not(.cr-voice) #voice-chat-container { display:none }).
        // Do NOT unmount it, or voice mode loses its mic. The old settings
        // "Voice Chat Orb" toggle / voiceChatEnabled preference is gone, so the
        // orb is always available (CSS decides when it's visible).
        const voiceEnabled = true;

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
                    this._broadcastVoiceEvent({ type: 'transcript_final', text: phase.transcription });
                    if (window.appendMessage) {
                        window.appendMessage(phase.transcription, 'user');
                    }

                } else if (phase.phase === 'response') {
                    responseText = phase.response || '';
                    this._broadcastVoiceEvent({ type: 'response_final', text: responseText });
                    boardContextData = phase.boardContext || null;

                    if (phase.boardActions && this.config.enableBoardCommands) {
                        if (this._lwsOwnsBoard()) this._renderVoiceBoardToLWS({ boardActions: phase.boardActions });
                        else this.executeBoardActions(phase.boardActions);
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
                if (this._lwsOwnsBoard()) this._renderVoiceBoardToLWS({ boardActions: data.boardActions });
                else await this.executeBoardActions(data.boardActions);
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

    // When the Living Workspace owns the board slot, the legacy whiteboard is
    // hidden — so voice board output must be translated onto the LWS derivation
    // view instead, or it renders into an invisible board (the "board froze
    // after the first problem" bug). See js/living-workspace/dom/voiceBoardTranslate.js.
    _lwsOwnsBoard() {
        return !!(window.LWS_CHAT && typeof window.LWS_CHAT.isOn === 'function' && window.LWS_CHAT.isOn());
    }

    // Render one voice turn's board payload (mathSteps + boardActions) onto the
    // LWS derivation view. Called at turn-final only (not on streaming partials)
    // so lines don't render twice.
    _renderVoiceBoardToLWS(payload) {
        try { window.LWS_CHAT.applyVoiceBoard(payload); }
        catch (e) { console.error('[Voice] LWS board render failed', e); }
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
        // State mirror for the caption layer (covers the legacy HTTP path,
        // whose speaking/thinking transitions only pass through here).
        this._broadcastVoiceEvent({ type: 'ui_state', state });
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
