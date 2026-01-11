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
 * - ElevenLabs TTS with user's selected tutor voice
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
        this.handsFreeMode = true; // GPT-style continuous conversation
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

        console.log('✅ Voice Controller ready');
    }

    // ============================================
    // UI COMPONENTS
    // ============================================

    createVoiceUI() {
        // Check user preference for voice chat enabled (default to true if user not loaded yet)
        const voiceEnabled = !window.currentUser || window.currentUser?.preferences?.voiceChatEnabled !== false;

        // Create floating voice button (like GPT's orb)
        const voiceContainer = document.createElement('div');
        voiceContainer.id = 'voice-chat-container';
        voiceContainer.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            z-index: 10001;
            display: ${voiceEnabled ? 'flex' : 'none'};
            flex-direction: column;
            align-items: center;
            gap: 10px;
        `;

        // Voice orb button
        const orbButton = document.createElement('button');
        orbButton.id = 'voice-orb';
        orbButton.className = 'voice-orb idle';
        orbButton.setAttribute('aria-label', 'Start voice chat');
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
            if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                if (!this.isListening && !e.repeat) {
                    e.preventDefault();
                    this.startListening();
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && this.isListening) {
                e.preventDefault();
                this.stopListening();
            }
        });
    }

    // ============================================
    // VOICE INPUT (Speech-to-Text)
    // ============================================

    async startListening() {
        console.log('🎙️ [Voice] startListening() called');
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

            // Setup MediaRecorder
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            const audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                console.log('🛑 [Voice] Recording stopped, audio chunks:', audioChunks.length);
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                console.log('📦 [Voice] Audio blob size:', audioBlob.size, 'bytes');
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

                    // Auto-stop if using hands-free mode
                    if (this.handsFreeMode && this.isListening) {
                        this.stopListening();
                    }
                }, this.silenceThreshold);

                // Show countdown in status
                if (this.statusText && this.handsFreeMode) {
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
                        boardContext: this.getBoardContext()
                    })
                });

                console.log('📥 [Voice] Response received, status:', response.status);

                if (!response.ok) {
                    const errorData = await response.json();
                    console.error('❌ [Voice] Server error:', errorData);
                    console.error('❌ [Voice] Error message:', errorData.message);
                    console.error('❌ [Voice] Error details:', errorData.details);
                    throw new Error(errorData.message || errorData.error || 'Server error');
                }

                const data = await response.json();
                console.log('📝 [Voice] Response data:', data);

                if (data.transcription) {
                    console.log('📝 Transcription:', data.transcription);

                    // Display user's message in chat
                    if (window.appendMessage) {
                        window.appendMessage(data.transcription, 'user');
                    }
                }

                if (data.response) {
                    // Process voice commands if present
                    if (data.boardActions && this.config.enableBoardCommands) {
                        await this.executeBoardActions(data.boardActions);
                    }

                    // Display AI response in chat
                    if (window.appendMessage) {
                        window.appendMessage(data.response, 'ai', null, data.isMasteryQuiz);
                    }

                    // Speak AI response (ElevenLabs audio with tutor voice)
                    if (data.audioUrl) {
                        await this.playAIResponse(data.audioUrl);
                    }
                }

                // Apply board context for spatial anchoring
                if (data.boardContext && window.chatBoardController) {
                    const messageElements = document.querySelectorAll('.message.ai');
                    const latestMessage = messageElements[messageElements.length - 1];
                    if (latestMessage) {
                        window.chatBoardController.enhanceChatMessage(
                            latestMessage, 'ai', data.boardContext
                        );
                    }
                }

                this.updateUI('idle');

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

    // Stop AI speaking (for interruption)
    stopSpeaking() {
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
