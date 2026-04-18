// ═══════════════════════════════════════════════════════════════
// VOICE TUTOR SESSION — Immersive hands-free math tutoring
// Real-time voice conversation with visual math rendering,
// interruption support, and transcript logging
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // --- State ---
  const MAX_RECORDING_DURATION = 60000; // 60s max recording to prevent runaway captures
  const state = {
    mode: 'idle',          // idle | listening | thinking | speaking
    handsFree: true,
    autoListen: true,
    showVisuals: true,
    silenceTimeout: (window._ageTierVoiceDefaults && window._ageTierVoiceDefaults.silenceTimeoutMs) || 1800,
    muted: false,
    tutorId: null,
    tutorName: '',
    tutorImage: '',
    mediaRecorder: null,
    audioContext: null,
    analyserNode: null,
    vadSource: null,       // MediaStreamSource node (for cleanup)
    mediaStream: null,
    currentAudio: null,
    vadTimer: null,
    maxRecordTimer: null,
    isSpeaking: false,
    silenceFrames: 0,      // consecutive silent frames for hysteresis
    speechStartTime: null,
    waveformRAF: null,
    particleRAF: null,
    playResolve: null,     // resolve fn for current playResponse promise
    sessionStart: null,    // session start time for timer
    timerInterval: null,   // session timer interval
    processing: false,     // guard against double processVoiceInput
    boardSteps: [],        // cumulative math board — never loses steps
  };

  // --- DOM refs ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {};

  function cacheDom() {
    dom.presence = $('#vt-presence');
    dom.orbWaveform = $('#vt-orb-waveform');
    dom.tutorFace = $('#vt-tutor-face');
    dom.statusText = $('#vt-status-text');
    dom.micBtn = $('#vt-mic-btn');
    dom.endBtn = $('#vt-end-btn');
    dom.muteBtn = $('#vt-mute-btn');
    dom.chatMessages = $('#vt-chat-messages');
    dom.chatPanel = $('#vt-chat-panel');
    dom.toggleChat = $('#vt-toggle-chat');
    dom.textInput = $('#vt-text-input');
    dom.sendText = $('#vt-send-text');
    dom.settingsBtn = $('#vt-settings-btn');
    dom.settingsDrawer = $('#vt-settings-drawer');
    dom.settingsClose = $('#vt-settings-close');
    dom.handsfreeToggle = $('#vt-handsfree-toggle');
    dom.autolistenToggle = $('#vt-autolisten-toggle');
    dom.visualsToggle = $('#vt-visuals-toggle');
    dom.silenceSelect = $('#vt-silence-timeout');
    dom.canvasArea = $('#vt-canvas-area');
    dom.canvasPlaceholder = $('#vt-canvas-placeholder');
    dom.mathDisplay = $('#vt-math-display');
    dom.liveTranscript = $('#vt-live-transcript');
    dom.transcriptText = $('#vt-transcript-text');
    dom.tutorAvatar = $('#vt-tutor-avatar');
    dom.tutorName = $('#vt-tutor-name');
    dom.tutorStatus = $('#vt-tutor-status');
    dom.particleCanvas = $('#vt-particle-canvas');
    dom.sessionTimer = $('#vt-session-timer');
  }

  // ═══════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════

  async function init() {
    cacheDom();
    loadUserData();
    setupEventListeners();
    setupParticles();
    drawIdleWaveform();
    setMode('idle');
    startSessionTimer();
    addSystemMessage('Voice session started. Tap the mic or just say something.');

    // Auto-start listening if hands-free
    // Delayed to let user settle in; skipped entirely on mobile (requires user gesture)
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
    if (state.handsFree && !isMobile) {
      setTimeout(() => startListening(), 1500);
    }
  }

  function startSessionTimer() {
    state.sessionStart = Date.now();
    state.timerInterval = setInterval(() => {
      if (!dom.sessionTimer) return;
      const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
      const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');
      dom.sessionTimer.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  async function loadUserData() {
    try {
      const fetchFn = window.csrfFetch || fetch;
      const res = await fetchFn('/user', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const user = data.user;
      if (!user) return;

      // Apply age-adaptive UI tier for voice tutor
      if (window.applyAgeTierFromGrade) {
          window.applyAgeTierFromGrade(user.gradeLevel);
          // Update silence timeout from age-tier defaults
          if (window._ageTierVoiceDefaults) {
              state.silenceTimeout = window._ageTierVoiceDefaults.silenceTimeoutMs;
          }
      }

      state.tutorId = user.selectedTutorId || 'default';

      // Load tutor config from the page or a known endpoint
      const tutorConfig = window.TUTOR_CONFIG || {};
      const tutor = tutorConfig[state.tutorId] || tutorConfig['default'] || {};

      state.tutorName = tutor.name || 'Tutor';
      state.tutorImage = tutor.image || '';

      if (dom.tutorName) dom.tutorName.textContent = state.tutorName;
      if (state.tutorImage) {
        const imgSrc = `/images/tutor_avatars/${state.tutorImage}`;
        if (dom.tutorAvatar) { dom.tutorAvatar.src = imgSrc; dom.tutorAvatar.alt = state.tutorName; }
        if (dom.tutorFace) { dom.tutorFace.src = imgSrc; dom.tutorFace.alt = state.tutorName; }
      }
    } catch (e) {
      console.warn('[VoiceTutor] Could not load user data:', e);
    }
  }

  // ═══════════════════════════════════════
  // EVENT LISTENERS
  // ═══════════════════════════════════════

  function setupEventListeners() {
    // Main mic button — handle both click and touchend for mobile responsiveness
    function handleMicTap(e) {
      if (e) e.preventDefault();
      if (state.mode === 'starting') return;
      if (state.mode === 'speaking' || state.mode === 'thinking') {
        interruptAndListen();
      } else if (state.mode === 'listening') {
        stopListening();
      } else {
        startListening();
      }
    }

    // Use touchend on mobile to bypass 300ms click delay; fall back to click
    let touchHandled = false;
    dom.micBtn.addEventListener('touchend', (e) => {
      touchHandled = true;
      handleMicTap(e);
    }, { passive: false });
    dom.micBtn.addEventListener('click', (e) => {
      if (touchHandled) { touchHandled = false; return; }
      handleMicTap(e);
    });

    // End session
    dom.endBtn.addEventListener('click', () => {
      cleanup();
      window.location.href = '/chat.html';
    });

    // Mute toggle
    dom.muteBtn.addEventListener('click', toggleMute);

    // Chat panel toggle
    dom.toggleChat.addEventListener('click', () => {
      dom.chatPanel.classList.toggle('collapsed');
      dom.chatPanel.classList.toggle('mobile-open');
    });

    // Text input (fallback)
    dom.sendText.addEventListener('click', sendTextMessage);
    dom.textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextMessage();
      }
    });

    // Settings
    dom.settingsBtn.addEventListener('click', () => dom.settingsDrawer.classList.add('open'));
    dom.settingsClose.addEventListener('click', () => dom.settingsDrawer.classList.remove('open'));
    dom.handsfreeToggle.addEventListener('change', (e) => { state.handsFree = e.target.checked; });
    dom.autolistenToggle.addEventListener('change', (e) => { state.autoListen = e.target.checked; });
    dom.visualsToggle.addEventListener('change', (e) => { state.showVisuals = e.target.checked; });
    dom.silenceSelect.addEventListener('change', (e) => { state.silenceTimeout = parseInt(e.target.value, 10); });

    // Keyboard: space to toggle, ESC to stop
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (state.mode === 'starting') return;
        if (state.mode === 'speaking' || state.mode === 'thinking') interruptAndListen();
        else if (state.mode === 'listening') stopListening();
        else startListening();
      }
      if (e.code === 'Escape') {
        if (state.mode === 'listening') stopListening();
        else if (state.mode === 'speaking' || state.mode === 'thinking') stopSpeaking();
      }
    });
  }

  // ═══════════════════════════════════════
  // VOICE INPUT — LISTENING
  // ═══════════════════════════════════════

  /**
   * Acquire a persistent mic stream (called once, reused across turns).
   * Skips getUserMedia if we already have a live stream.
   */
  async function ensureMicStream() {
    // Reuse existing live stream
    if (state.mediaStream) {
      const tracks = state.mediaStream.getAudioTracks();
      if (tracks.length > 0 && tracks[0].readyState === 'live') {
        return state.mediaStream;
      }
      // Stream died — clean up and re-acquire
      state.mediaStream = null;
    }

    state.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 16000
      }
    });

    return state.mediaStream;
  }

  /**
   * Ensure we have a usable AudioContext (created once, reused across turns).
   */
  async function ensureAudioContext() {
    if (!state.audioContext || state.audioContext.state === 'closed') {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioContext.state === 'suspended') {
      await state.audioContext.resume();
    }
    return state.audioContext;
  }

  async function startListening() {
    if (state.mode === 'listening' || state.mode === 'thinking') return;

    // Guard: set mode immediately to prevent double-click races
    state.mode = 'starting';

    // Show immediate visual feedback so user knows the tap registered
    if (dom.statusText) dom.statusText.textContent = 'Starting mic...';
    if (dom.micBtn) dom.micBtn.style.opacity = '0.6';

    // Safety: if 'starting' hangs for >5s (e.g. permission dialog dismissed), reset
    const startingTimeout = setTimeout(() => {
      if (state.mode === 'starting') {
        console.warn('[VoiceTutor] startListening timed out in starting state');
        setMode('idle');
        showToast('Mic timed out. Tap to try again.');
      }
    }, 5000);

    try {
      await ensureAudioContext();
      const stream = await ensureMicStream();

      clearTimeout(startingTimeout);
      if (dom.micBtn) dom.micBtn.style.opacity = '';

      const mimeType = getSupportedMimeType();
      state.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      const chunks = [];
      state.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      state.mediaRecorder.onstop = async () => {
        const recordedType = state.mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: recordedType });
        // DON'T kill the stream — keep it alive for the next turn
        if (blob.size > 1000) { // Minimum size to avoid empty recordings
          await processVoiceInput(blob);
        } else {
          setMode('idle');
        }
      };

      // Setup VAD (voice activity detection)
      setupVAD(stream);

      state.mediaRecorder.start();
      setMode('listening');

      // Safety: max recording duration to prevent runaway captures
      clearTimeout(state.maxRecordTimer);
      state.maxRecordTimer = setTimeout(() => {
        if (state.mode === 'listening') stopListening();
      }, MAX_RECORDING_DURATION);

    } catch (err) {
      clearTimeout(startingTimeout);
      if (dom.micBtn) dom.micBtn.style.opacity = '';

      console.error('[VoiceTutor] Mic error:', err);
      let msg = 'Could not access microphone.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/.test(navigator.userAgent);
        if (isIOS) {
          msg += ' Open Settings → your browser → Microphone and allow access for this site.';
        } else if (isAndroid) {
          msg += ' Tap the lock icon in your browser\'s address bar and allow microphone access.';
        } else {
          msg += ' Click the camera/mic icon in your browser\'s address bar to allow access.';
        }
      } else if (err.name === 'NotFoundError') {
        msg += ' No microphone detected. Try plugging in headphones with a mic.';
      } else {
        msg += ' Make sure no other app is using your microphone and try again.';
      }
      addSystemMessage(msg);
      // Also show a toast so mobile users see the error (chat panel may be hidden)
      showToast(msg);
      setMode('idle');
    }
  }

  function stopListening() {
    if (state.mode !== 'listening') return;
    clearTimeout(state.vadTimer);
    clearTimeout(state.maxRecordTimer);
    state.isSpeaking = false;
    state.speechStartTime = null;
    state.silenceFrames = 0;

    // Clear VAD interval
    if (state._vadInterval) {
      clearInterval(state._vadInterval);
      state._vadInterval = null;
    }

    // Disconnect VAD source to prevent memory leak
    if (state.vadSource) {
      try { state.vadSource.disconnect(); } catch (e) { /* ignore */ }
      state.vadSource = null;
    }

    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
    setMode('thinking');
  }

  function setupVAD(stream) {
    const source = state.audioContext.createMediaStreamSource(stream);
    state.vadSource = source; // Store for cleanup
    const analyser = state.audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    state.analyserNode = analyser;

    const buffer = new Uint8Array(analyser.frequencyBinCount);

    // --- VAD tuning ---
    const VAD_INTERVAL_MS = 50;        // Check every 50ms (setInterval, not rAF)
    const SILENCE_FRAMES_REQUIRED = 8; // ~400ms of consecutive silence before starting countdown
    const MIN_SPEECH_DURATION = 500;   // Ignore speech bursts shorter than 500ms
    const FIXED_THRESHOLD_DB = -42;    // Fixed fallback threshold (more permissive)

    // Adaptive noise floor: measure ambient level during first ~750ms
    let noiseFloorDb = -50;
    let calibrationSamples = [];
    const CALIBRATION_FRAMES = 15;     // 15 × 50ms = 750ms
    let calibrated = false;

    state.isSpeaking = false;
    state.silenceFrames = 0;

    // Use setInterval instead of requestAnimationFrame so VAD runs
    // reliably even when the tab is in the background or throttled
    const vadInterval = setInterval(() => {
      if (state.mode !== 'listening') {
        clearInterval(vadInterval);
        return;
      }

      analyser.getByteFrequencyData(buffer);

      // Focus on voice frequency range (roughly 300-3000Hz)
      // Bin range depends on sample rate; bins 4-80 cover the main voice band
      const voiceBins = buffer.slice(4, 80);
      const sum = voiceBins.reduce((a, b) => a + b, 0);
      const avg = sum / voiceBins.length;
      const db = avg > 0 ? 20 * Math.log10(avg / 255) : -Infinity;

      // Calibrate noise floor from first ~500ms of audio
      if (!calibrated) {
        calibrationSamples.push(db);
        if (calibrationSamples.length >= CALIBRATION_FRAMES) {
          // Use the median of calibration samples as noise floor
          calibrationSamples.sort((a, b) => a - b);
          const median = calibrationSamples[Math.floor(calibrationSamples.length / 2)];
          // Set threshold 6dB above noise floor (but no lower than fixed threshold)
          // Lower margin = more sensitive to speech, less likely to cut off
          noiseFloorDb = Math.max(median + 6, FIXED_THRESHOLD_DB);
          calibrated = true;
          calibrationSamples = null; // free memory
        }
      }

      const speaking = db > noiseFloorDb;

      // Draw waveform (skip if tab hidden — canvas doesn't need updating)
      if (!document.hidden) {
        drawListeningWaveform(buffer);
      }

      if (speaking) {
        state.silenceFrames = 0;

        // Cancel any pending silence timer when speech is detected
        if (state.vadTimer) {
          clearTimeout(state.vadTimer);
          state.vadTimer = null;
        }

        if (!state.isSpeaking) {
          state.isSpeaking = true;
          state.speechStartTime = Date.now();
        }
      } else {
        state.silenceFrames++;

        // Only react to silence if we had meaningful speech AND enough consecutive silent frames
        if (state.isSpeaking && state.silenceFrames >= SILENCE_FRAMES_REQUIRED) {
          const duration = Date.now() - (state.speechStartTime || Date.now());

          if (duration < MIN_SPEECH_DURATION) {
            // Speech was too brief — probably a noise burst, reset
            state.isSpeaking = false;
            state.speechStartTime = null;
          } else {
            // Real speech followed by confirmed silence — start countdown
            if (!state.vadTimer) {
              // Show visual feedback that we detected the pause
              if (dom.statusText) dom.statusText.textContent = 'Sending...';
              state.vadTimer = setTimeout(() => {
                state.vadTimer = null;
                if (state.mode === 'listening') {
                  clearInterval(vadInterval);
                  stopListening();
                }
              }, state.silenceTimeout);
            }
          }
        }
      }
    }, VAD_INTERVAL_MS);

    // Store interval ID for cleanup on stopListening
    state._vadInterval = vadInterval;
  }

  // ═══════════════════════════════════════
  // PROCESS VOICE → AI → SPEECH
  // ═══════════════════════════════════════

  async function processVoiceInput(audioBlob) {
    if (state.processing) return; // Guard against double-processing
    state.processing = true;
    setMode('thinking');

    try {
      const base64 = await blobToBase64(audioBlob);

      const fetchFn = window.csrfFetch || fetch;
      const res = await fetchFn('/api/voice-tutor/process', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64, mimeType: audioBlob.type || 'audio/webm' })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Voice processing failed');
      }

      // Read NDJSON stream — process each phase as it arrives
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/x-ndjson')) {
        await processStreamedResponse(res);
      } else {
        // Fallback for non-streaming response (backwards compat)
        const data = await res.json();
        handleLegacyResponse(data);
      }

    } catch (err) {
      console.error('[VoiceTutor] Processing error:', err);
      addSystemMessage('Something went wrong. Try again.');
      showToast('Voice processing failed. Try again or type your question.', 5000);
      setMode('idle');
    } finally {
      state.processing = false;
    }
  }

  /**
   * Process NDJSON streamed response — renders each phase immediately.
   * Phase "transcription" → show user message in chat
   * Phase "response"      → show AI text + render math (student sees this ~2-3s sooner)
   * Phase "audio"         → play TTS audio
   */
  async function processStreamedResponse(res) {
    let responseText = '';
    let gotAudio = false;
    let gotTranscription = false;

    function handlePhase(phase) {
      if (phase.phase === 'transcription' && phase.transcription) {
        gotTranscription = true;
        addMessage(phase.transcription, 'user');

      } else if (phase.phase === 'response') {
        responseText = phase.response || '';
        if (responseText) addMessage(responseText, 'ai');

        if (state.showVisuals) {
          if (phase.mathSteps && phase.mathSteps.length > 0) {
            renderMathSteps(phase.mathSteps);
          } else {
            const extracted = extractEquationsFromText(responseText);
            if (extracted.length > 0) {
              renderMathSteps(extracted);
            }
          }
        }

      } else if (phase.phase === 'audio') {
        gotAudio = true;
        return phase;

      } else if (phase.phase === 'error') {
        addSystemMessage(phase.message || 'Something went wrong.');
        showToast(phase.message || 'Something went wrong.');
        setMode('idle');
        return 'error';
      }
      return null;
    }

    // Use ReadableStream if available, otherwise fall back to text parsing
    // (some mobile browsers don't support res.body.getReader on streamed responses)
    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIdx;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (!line) continue;

          let parsed;
          try { parsed = JSON.parse(line); } catch (e) { continue; }

          const result = handlePhase(parsed);
          if (result === 'error') return;
          if (result && result.phase === 'audio') {
            if (result.audioUrl && !state.muted) {
              await playResponse(result.audioUrl, responseText);
            } else {
              resumeOrIdle(gotTranscription);
            }
          }
        }
      }
    } else {
      // Fallback: read entire response as text and split by newlines
      const text = await res.text();
      const lines = text.split('\n').filter(l => l.trim());
      for (const line of lines) {
        let parsed;
        try { parsed = JSON.parse(line.trim()); } catch (e) { continue; }

        const result = handlePhase(parsed);
        if (result === 'error') return;
        if (result && result.phase === 'audio') {
          if (result.audioUrl && !state.muted) {
            await playResponse(result.audioUrl, responseText);
          } else {
            resumeOrIdle(gotTranscription);
          }
        }
      }
    }

    // If stream ended without an audio phase
    if (!gotAudio) {
      resumeOrIdle(gotTranscription);
    }

    // If speech wasn't transcribed, show visible feedback
    if (!gotTranscription) {
      showToast("I didn't catch that. Try speaking closer to your mic.", 4000);
    }
  }

  /**
   * After a turn completes, either resume listening (if we got a real response)
   * or go to idle (if the turn was empty/failed — so user can see feedback).
   */
  function resumeOrIdle(hadContent) {
    if (hadContent && state.handsFree && state.autoListen) {
      setTimeout(() => startListening(), 80);
    } else {
      setMode('idle');
    }
  }

  /**
   * Handle legacy (non-streaming) JSON response — backwards compatibility
   */
  function handleLegacyResponse(data) {
    const hadTranscription = !!data.transcription;
    if (data.transcription) addMessage(data.transcription, 'user');
    if (data.response) addMessage(data.response, 'ai');

    if (state.showVisuals) {
      if (data.mathSteps && data.mathSteps.length > 0) {
        renderMathSteps(data.mathSteps);
      } else {
        const extracted = extractEquationsFromText(data.response || '');
        if (extracted.length > 0) renderMathSteps(extracted);
      }
    }

    if (data.audioUrl && !state.muted) {
      playResponse(data.audioUrl, data.response || '');
    } else {
      resumeOrIdle(hadTranscription);
    }

    if (!hadTranscription) {
      showToast("I didn't catch that. Try speaking closer to your mic.", 4000);
    }
  }

  async function sendTextMessage() {
    const text = dom.textInput.value.trim();
    if (!text) return;
    dom.textInput.value = '';

    addMessage(text, 'user');
    setMode('thinking');

    try {
      const fetchFn = window.csrfFetch || fetch;
      const res = await fetchFn('/api/voice-tutor/process-text', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!res.ok) throw new Error('Text processing failed');

      const data = await res.json();

      if (data.response) addMessage(data.response, 'ai');
      if (state.showVisuals) {
        if (data.mathSteps && data.mathSteps.length > 0) {
          renderMathSteps(data.mathSteps);
        } else {
          const extracted = extractEquationsFromText(data.response || '');
          if (extracted.length > 0) renderMathSteps(extracted);
        }
      }

      if (data.audioUrl && !state.muted) {
        await playResponse(data.audioUrl, data.response || '');
      } else {
        setMode('idle');
      }

    } catch (err) {
      console.error('[VoiceTutor] Text error:', err);
      addSystemMessage('Could not get a response. Try again.');
      setMode('idle');
    }
  }

  // ═══════════════════════════════════════
  // AUDIO PLAYBACK — with interruption
  // ═══════════════════════════════════════

  async function playResponse(audioUrl, responseText) {
    setMode('speaking');

    // Show live transcript word by word
    if (responseText) {
      animateTranscript(responseText);
    }

    return new Promise((resolve) => {
      // Store resolver so interrupt can resolve this promise
      state.playResolve = resolve;

      const audio = new Audio(audioUrl);
      state.currentAudio = audio;

      // Draw speaking waveform — use a FRESH AudioContext to avoid
      // conflicts with the mic AudioContext
      try {
        const playCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = playCtx.createMediaElementSource(audio);
        const analyser = playCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(playCtx.destination);

        const buffer = new Uint8Array(analyser.frequencyBinCount);
        const drawSpeaking = () => {
          if (state.mode !== 'speaking') {
            playCtx.close().catch(() => {});
            return;
          }
          analyser.getByteFrequencyData(buffer);
          drawSpeakingWaveform(buffer);
          requestAnimationFrame(drawSpeaking);
        };
        audio.addEventListener('canplay', drawSpeaking, { once: true });

        // Store for cleanup
        audio._playCtx = playCtx;
      } catch (e) {
        // Fallback: play without waveform visualization
      }

      const done = (startNext) => {
        if (audio._playCtx) {
          audio._playCtx.close().catch(() => {});
        }
        state.currentAudio = null;
        state.playResolve = null;
        hideTranscript();

        if (startNext && state.handsFree && state.autoListen) {
          setTimeout(() => startListening(), 80);
        } else if (startNext) {
          setMode('idle');
        }
        resolve();
      };

      audio.onended = () => done(true);
      audio.onerror = () => done(true);

      audio.play().catch(() => done(true));
    });
  }

  function stopSpeaking() {
    if (state.currentAudio) {
      state.currentAudio.onended = null;
      state.currentAudio.onerror = null;
      state.currentAudio.pause();
      if (state.currentAudio._playCtx) {
        state.currentAudio._playCtx.close().catch(() => {});
      }
      state.currentAudio = null;
    }
    hideTranscript();

    // Resolve the pending playResponse promise so processVoiceInput doesn't hang
    if (state.playResolve) {
      const resolve = state.playResolve;
      state.playResolve = null;
      resolve();
    }

    // Reset processing guard so next voice input can proceed
    state.processing = false;

    setMode('idle');
  }

  function interruptAndListen() {
    // Flash the avatar to indicate interruption
    if (dom.presence) {
      dom.presence.classList.add('vt-interrupted');
      setTimeout(() => dom.presence.classList.remove('vt-interrupted'), 400);
    }

    stopSpeaking();

    // AudioContext and mic stream are kept alive — no need to tear down.
    // ensureAudioContext() and ensureMicStream() in startListening() will
    // reuse the existing instances, saving ~300-500ms per turn.

    startListening();
  }

  function toggleMute() {
    state.muted = !state.muted;
    dom.muteBtn.classList.toggle('muted', state.muted);
    const icon = dom.muteBtn.querySelector('i');
    icon.className = state.muted ? 'fas fa-volume-mute' : 'fas fa-volume-up';

    if (state.muted && state.currentAudio) {
      stopSpeaking();
    }
  }

  // ═══════════════════════════════════════
  // MATH VISUALIZATION
  // ═══════════════════════════════════════

  /**
   * Merge incoming math steps into the cumulative board.
   *
   * The board is a PERSISTENT WHITEBOARD — it NEVER erases previous work.
   * When a new problem arrives, a visual divider is inserted and the new
   * steps are appended. All equations, slopes, steps from the entire
   * session remain visible so the student can scroll back.
   *
   * The LLM sends the full step list for the CURRENT problem each turn.
   * This function finds what's new and appends it to the cumulative board.
   */
  function mergeBoardSteps(incomingSteps) {
    if (!incomingSteps || incomingSteps.length === 0) return state.boardSteps;

    const normalize = (latex) => (latex || '').replace(/\s+/g, '').trim();

    // Get only the real (non-divider) steps on the board
    const realBoardSteps = state.boardSteps.filter(s => !s._divider);
    const boardLatex = realBoardSteps.map(s => normalize(s.latex));
    const incomingLatex = incomingSteps.map(s => normalize(s.latex));

    // Find how many incoming steps match the TAIL of our board (current problem overlap)
    // The LLM sends the full current problem each turn, so overlapping steps
    // will appear at the end of our board.
    let tailOverlap = 0;
    if (realBoardSteps.length > 0 && incomingSteps.length > 0) {
      // Walk backwards from the end of the board to find where the incoming
      // sequence starts matching
      for (let startIdx = Math.max(0, realBoardSteps.length - incomingSteps.length);
           startIdx < realBoardSteps.length; startIdx++) {
        let match = true;
        const remaining = realBoardSteps.length - startIdx;
        const toCheck = Math.min(remaining, incomingSteps.length);
        for (let j = 0; j < toCheck; j++) {
          if (boardLatex[startIdx + j] !== incomingLatex[j]) {
            match = false;
            break;
          }
        }
        if (match && toCheck > 0) {
          tailOverlap = toCheck;
          break;
        }
      }
    }

    if (tailOverlap > 0) {
      // The LLM resent existing steps plus potentially new ones.
      // Append only the genuinely new steps after the overlap.
      const newSteps = incomingSteps.slice(tailOverlap).filter(
        s => !boardLatex.includes(normalize(s.latex))
      );
      if (newSteps.length > 0) {
        state.boardSteps = state.boardSteps.concat(newSteps);
      }
    } else {
      // No tail overlap — these steps don't continue the current board tail.
      // Filter out any steps already on the board (dedup).
      const genuinelyNew = incomingSteps.filter(
        s => !boardLatex.includes(normalize(s.latex))
      );

      if (genuinelyNew.length > 0) {
        // If the board already has content and this looks like a new problem,
        // insert a visual divider so the student sees a clear separation.
        if (realBoardSteps.length > 0) {
          const firstLabel = (genuinelyNew[0].label || '').toLowerCase();
          const isNewProblem = firstLabel === 'given' || firstLabel === 'start'
            || firstLabel === 'problem' || firstLabel.startsWith('problem');
          // Also treat it as new work if there's zero overlap at all
          const noOverlapAtAll = genuinelyNew.length === incomingSteps.length;
          if (isNewProblem || noOverlapAtAll) {
            state.boardSteps.push({ _divider: true, label: genuinelyNew[0].label || 'New Problem' });
          }
        }
        state.boardSteps = state.boardSteps.concat(genuinelyNew);
      }
    }

    return state.boardSteps;
  }

  function renderMathSteps(steps) {
    // Merge into cumulative board (never lose steps)
    const board = mergeBoardSteps(steps);

    dom.canvasPlaceholder.classList.add('hidden');

    // Clear previous DOM elements (steps AND dividers)
    const existing = dom.mathDisplay.querySelectorAll('.vt-math-step, .vt-step-divider');
    if (existing.length > 0) {
      existing.forEach(el => {
        el.style.transition = 'opacity 0.15s';
        el.style.opacity = '0';
      });
      setTimeout(() => existing.forEach(el => el.remove()), 150);
    }

    // Render full board with minimal delay
    const renderDelay = existing.length > 0 ? 160 : 0;
    setTimeout(() => {
      // Count real (non-divider) steps for "new" animation detection
      const realSteps = board.filter(s => !s._divider);
      const realIncoming = steps.filter(s => !s._divider);
      const newStartIdx = realSteps.length - realIncoming.length;
      let realIdx = 0;

      board.forEach((step, i) => {
        // Render dividers as visual separators between problems
        if (step._divider) {
          const divEl = document.createElement('div');
          divEl.className = 'vt-step-divider';
          divEl.innerHTML = `<span class="vt-divider-line"></span><span class="vt-divider-dot"></span><span class="vt-divider-line"></span>`;
          dom.mathDisplay.appendChild(divEl);
          return;
        }

        const el = document.createElement('div');
        el.className = 'vt-math-step';
        // Highlight the most recent real step
        if (realIdx === realSteps.length - 1) el.classList.add('highlighted');
        // Only animate new steps
        const isNew = realIdx >= newStartIdx;
        el.style.animationDelay = isNew ? `${(realIdx - newStartIdx) * 80}ms` : '0ms';
        realIdx++;

        let html = '';
        if (step.label) {
          html += `<div class="vt-step-label">${escapeHtml(step.label)}</div>`;
        }

        html += `<div class="vt-step-content">`;
        if (step.latex) {
          html += `<span class="vt-katex-render" data-latex="${escapeAttr(step.latex)}"></span>`;
        } else if (step.text) {
          html += escapeHtml(step.text);
        } else if (step.label) {
          html += `<span style="color:#6b7594;font-style:italic;">${escapeHtml(step.label)}</span>`;
        }
        html += `</div>`;

        if (step.explanation) {
          html += `<div class="vt-step-explanation">${escapeHtml(step.explanation)}</div>`;
        }

        el.innerHTML = html;
        dom.mathDisplay.appendChild(el);
      });

      // Render KaTeX
      dom.mathDisplay.querySelectorAll('.vt-katex-render').forEach((el) => {
        const latex = el.getAttribute('data-latex');
        try {
          if (window.katex) {
            window.katex.render(latex, el, { displayMode: true, throwOnError: false });
          }
        } catch (e) {
          el.textContent = latex;
          el.style.fontFamily = 'monospace';
          el.style.color = '#4a5568';
        }
      });

      // Scroll to newest step
      dom.canvasArea.scrollTo({
        top: dom.canvasArea.scrollHeight,
        behavior: 'smooth'
      });
    }, renderDelay);
  }

  // ═══════════════════════════════════════
  // LIVE TRANSCRIPT ANIMATION
  // ═══════════════════════════════════════

  function animateTranscript(text) {
    dom.liveTranscript.classList.add('visible');

    const words = text.split(/\s+/);
    let index = 0;
    const avgWordDuration = 180; // ms per word (rough estimate)

    function showNextWord() {
      if (index >= words.length || state.mode !== 'speaking') {
        return;
      }

      const displayed = words.slice(Math.max(0, index - 8), index + 1);
      const html = displayed.map((w, i) => {
        if (i === displayed.length - 1) return `<span class="vt-word-highlight">${escapeHtml(w)}</span>`;
        const opacity = 0.3 + (i / displayed.length) * 0.5;
        return `<span style="opacity:${opacity}">${escapeHtml(w)}</span>`;
      }).join(' ');

      dom.transcriptText.innerHTML = html;
      renderTranscriptMath();
      index++;

      setTimeout(showNextWord, avgWordDuration);
    }
    showNextWord();
  }

  /**
   * Render any KaTeX math that appears in the live transcript bubble.
   * Scans for LaTeX delimiters in the transcript text and replaces them.
   */
  function renderTranscriptMath() {
    if (!window.katex || !dom.transcriptText) return;
    const el = dom.transcriptText;
    const raw = el.innerHTML;

    // Check for LaTeX patterns: \(...\), $...$, \[...\], $$...$$
    const hasLatex = /\\\(|\\\[|\$/.test(raw);
    if (!hasLatex) return;

    // Replace display math: \[...\] and $$...$$
    let processed = raw.replace(/\\\[(.+?)\\\]/gs, (_, latex) => {
      try {
        return window.katex.renderToString(unescapeHtml(latex.replace(/&quot;/g, '"').replace(/&#39;/g, "'")), { displayMode: true, throwOnError: false });
      } catch (e) { return latex; }
    });
    processed = processed.replace(/\$\$(.+?)\$\$/gs, (_, latex) => {
      try {
        return window.katex.renderToString(unescapeHtml(latex.replace(/&quot;/g, '"').replace(/&#39;/g, "'")), { displayMode: true, throwOnError: false });
      } catch (e) { return latex; }
    });

    // Replace inline math: \(...\) and $...$
    processed = processed.replace(/\\\((.+?)\\\)/g, (_, latex) => {
      try {
        return window.katex.renderToString(unescapeHtml(latex.replace(/&quot;/g, '"').replace(/&#39;/g, "'")), { displayMode: false, throwOnError: false });
      } catch (e) { return latex; }
    });
    processed = processed.replace(/\$([^$]+?)\$/g, (_, latex) => {
      try {
        return window.katex.renderToString(unescapeHtml(latex.replace(/&quot;/g, '"').replace(/&#39;/g, "'")), { displayMode: false, throwOnError: false });
      } catch (e) { return latex; }
    });

    if (processed !== raw) {
      el.innerHTML = processed;
    }
  }

  function hideTranscript() {
    dom.liveTranscript.classList.remove('visible');
    dom.transcriptText.innerHTML = '';
  }

  // ═══════════════════════════════════════
  // ORB WAVEFORM VISUALIZER
  // ═══════════════════════════════════════

  function drawIdleWaveform() {
    const canvas = dom.orbWaveform;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    let phase = 0;
    function draw() {
      ctx.clearRect(0, 0, w, h);

      // Gentle breathing circle
      const radius = 30 + Math.sin(phase * 0.02) * 3;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius + 20);
      gradient.addColorStop(0, 'rgba(100, 120, 160, 0.15)');
      gradient.addColorStop(1, 'transparent');

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Inner glow
      const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.6);
      inner.addColorStop(0, 'rgba(140, 160, 200, 0.08)');
      inner.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = inner;
      ctx.fill();

      phase++;
      if (state.mode === 'idle') {
        state.waveformRAF = requestAnimationFrame(draw);
      }
    }
    draw();
  }

  function drawListeningWaveform(freqData) {
    const canvas = dom.orbWaveform;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    // Visualize frequency data as a radial waveform
    const bars = 48;
    const baseRadius = 25;
    const maxHeight = 35;

    for (let i = 0; i < bars; i++) {
      const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
      const freqIndex = Math.floor((i / bars) * freqData.length * 0.5);
      const value = (freqData[freqIndex] || 0) / 255;

      const r1 = baseRadius;
      const r2 = baseRadius + value * maxHeight;

      const x1 = cx + Math.cos(angle) * r1;
      const y1 = cy + Math.sin(angle) * r1;
      const x2 = cx + Math.cos(angle) * r2;
      const y2 = cy + Math.sin(angle) * r2;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(18, 179, 179, ${0.3 + value * 0.7})`;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Center glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius);
    glow.addColorStop(0, 'rgba(18, 179, 179, 0.12)');
    glow.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
  }

  function drawSpeakingWaveform(freqData) {
    const canvas = dom.orbWaveform;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    const bars = 48;
    const baseRadius = 25;
    const maxHeight = 30;

    for (let i = 0; i < bars; i++) {
      const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
      const freqIndex = Math.floor((i / bars) * (freqData?.length || 64) * 0.4);
      const value = (freqData?.[freqIndex] || 0) / 255;

      const r1 = baseRadius;
      const r2 = baseRadius + value * maxHeight;

      const x1 = cx + Math.cos(angle) * r1;
      const y1 = cy + Math.sin(angle) * r1;
      const x2 = cx + Math.cos(angle) * r2;
      const y2 = cy + Math.sin(angle) * r2;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(102, 126, 234, ${0.3 + value * 0.7})`;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius);
    glow.addColorStop(0, 'rgba(102, 126, 234, 0.12)');
    glow.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
  }

  // ═══════════════════════════════════════
  // AMBIENT PARTICLES
  // ═══════════════════════════════════════

  function setupParticles() {
    const canvas = dom.particleCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const particles = [];
    const count = 40;

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.5,
        dx: (Math.random() - 0.5) * 0.3,
        dy: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.3 + 0.1,
      });
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(18, 179, 179, ${p.opacity})`;
        ctx.fill();
      });

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(18, 179, 179, ${0.03 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      state.particleRAF = requestAnimationFrame(animate);
    }
    animate();
  }

  // ═══════════════════════════════════════
  // UI STATE MACHINE
  // ═══════════════════════════════════════

  function setMode(mode) {
    state.mode = mode;
    if (dom.presence) dom.presence.setAttribute('data-state', mode);

    // Mic button
    if (dom.micBtn) {
      dom.micBtn.classList.toggle('active', mode === 'listening');
      const micIcon = dom.micBtn.querySelector('i');

      switch (mode) {
        case 'idle':
          if (micIcon) micIcon.className = 'fas fa-microphone';
          cancelAnimationFrame(state.waveformRAF);
          drawIdleWaveform();
          break;
        case 'listening':
          if (micIcon) micIcon.className = 'fas fa-stop';
          break;
        case 'thinking':
          if (micIcon) micIcon.className = 'fas fa-hand';
          drawThinkingWaveform();
          break;
        case 'speaking':
          if (micIcon) micIcon.className = 'fas fa-hand';
          break;
      }
    }

    // Tutor status
    const statusMap = {
      idle: 'Ready',
      listening: 'Listening to you...',
      thinking: 'Thinking...',
      speaking: 'Speaking...'
    };

    const statusTextMap = {
      idle: 'Tap to speak',
      listening: 'Listening...',
      thinking: 'Thinking — tap to interrupt',
      speaking: 'Speaking — tap to interrupt'
    };

    if (dom.statusText) dom.statusText.textContent = statusTextMap[mode] || 'Tap to speak';
    if (dom.tutorStatus) dom.tutorStatus.textContent = statusMap[mode] || 'Ready';
  }

  function drawThinkingWaveform() {
    const canvas = dom.orbWaveform;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    let phase = 0;
    function draw() {
      if (state.mode !== 'thinking') return;
      ctx.clearRect(0, 0, w, h);

      // Rotating dots
      const dotCount = 8;
      for (let i = 0; i < dotCount; i++) {
        const angle = (i / dotCount) * Math.PI * 2 + phase * 0.04;
        const r = 30;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        const size = 2 + Math.sin(phase * 0.06 + i) * 1;
        const opacity = 0.2 + Math.sin(phase * 0.06 + i * 0.5) * 0.3;

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(251, 191, 36, ${opacity})`;
        ctx.fill();
      }

      phase++;
      requestAnimationFrame(draw);
    }
    draw();
  }

  // ═══════════════════════════════════════
  // CHAT MESSAGES
  // ═══════════════════════════════════════

  function addMessage(text, sender) {
    const el = document.createElement('div');
    el.className = `vt-msg ${sender}`;

    // Render markdown/math in AI messages
    let content = text;
    if (sender === 'ai') {
      content = renderMathInText(text);
    } else {
      content = escapeHtml(text);
    }

    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    el.innerHTML = `
      <div class="vt-msg-body">${content}</div>
      <div class="vt-msg-meta">
        <span class="vt-voice-icon"><i class="fas fa-microphone"></i></span>
        <span>${time}</span>
      </div>
    `;

    dom.chatMessages.appendChild(el);
    dom.chatMessages.scrollTo({ top: dom.chatMessages.scrollHeight, behavior: 'smooth' });

    // Render KaTeX in the new message
    requestAnimationFrame(() => {
      el.querySelectorAll('.vt-katex-inline').forEach((span) => {
        try {
          if (window.katex) {
            window.katex.render(span.dataset.latex, span, { displayMode: false, throwOnError: false });
          }
        } catch (e) { /* noop */ }
      });
      el.querySelectorAll('.vt-katex-display').forEach((span) => {
        try {
          if (window.katex) {
            window.katex.render(span.dataset.latex, span, { displayMode: true, throwOnError: false });
          }
        } catch (e) { /* noop */ }
      });
    });
  }

  function addSystemMessage(text) {
    const el = document.createElement('div');
    el.className = 'vt-msg system';
    el.textContent = text;
    dom.chatMessages.appendChild(el);
    dom.chatMessages.scrollTo({ top: dom.chatMessages.scrollHeight, behavior: 'smooth' });
  }

  /** Show a floating toast message visible on mobile even when chat panel is hidden */
  function showToast(text, duration) {
    duration = duration || 4000;
    const existing = document.querySelector('.vt-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'vt-toast';
    toast.textContent = text;
    toast.setAttribute('role', 'alert');
    document.body.appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(() => toast.classList.add('vt-toast-visible'));

    setTimeout(() => {
      toast.classList.remove('vt-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function renderMathInText(text) {
    // Sanitize first
    let safe = escapeHtml(text);

    // Display math: \[ ... \] or $$ ... $$
    safe = safe.replace(/\\\[(.+?)\\\]/gs, (_, latex) =>
      `<span class="vt-katex-display" data-latex="${escapeAttr(unescapeHtml(latex))}"></span>`
    );
    safe = safe.replace(/\$\$(.+?)\$\$/gs, (_, latex) =>
      `<span class="vt-katex-display" data-latex="${escapeAttr(unescapeHtml(latex))}"></span>`
    );

    // Inline math: \( ... \) or $ ... $
    safe = safe.replace(/\\\((.+?)\\\)/g, (_, latex) =>
      `<span class="vt-katex-inline" data-latex="${escapeAttr(unescapeHtml(latex))}"></span>`
    );
    safe = safe.replace(/\$([^$]+?)\$/g, (_, latex) =>
      `<span class="vt-katex-inline" data-latex="${escapeAttr(unescapeHtml(latex))}"></span>`
    );

    // Bold
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    safe = safe.replace(/\*(.+?)\*/g, '<em>$1</em>');

    return safe;
  }

  // ═══════════════════════════════════════
  // CLIENT-SIDE EQUATION EXTRACTION
  // ═══════════════════════════════════════

  /**
   * Fallback: if backend didn't return mathSteps, extract equations from the response.
   * Handles LaTeX delimiters, symbolic math, AND natural language like "2x equals 4".
   */
  function extractEquationsFromText(text) {
    const steps = [];
    const seen = new Set();

    function addStep(latex, label) {
      const key = latex.trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        steps.push(label ? { label, latex: key } : { latex: key });
      }
    }

    // 1. LaTeX display math: \[ ... \] or $$ ... $$
    const displayRe = /\\\[(.+?)\\\]|\$\$(.+?)\$\$/gs;
    let m;
    while ((m = displayRe.exec(text)) !== null) {
      addStep(m[1] || m[2]);
    }

    // 2. LaTeX inline math: \( ... \) or $...$
    const inlineRe = /\\\((.+?)\\\)|(?<!\$)\$([^$\n]+?)\$(?!\$)/g;
    while ((m = inlineRe.exec(text)) !== null) {
      const latex = (m[1] || m[2]).trim();
      if (/[=+\-*/^_\\]/.test(latex) && latex.length > 2) {
        addStep(latex);
      }
    }

    // 3. Symbolic equations: "2x + 3 = 7", "x = 4", "y = mx + b"
    if (steps.length === 0) {
      const symRe = /\b(\d*[a-z]\s*[\^]\s*\d)?\s*([\d]*\s*[a-z][\w]*(?:\s*[+\-*/]\s*[\d]*\s*[a-z\d][\w]*)*\s*=\s*[\d\w\s+\-*/^.()]+)/gi;
      while ((m = symRe.exec(text)) !== null) {
        const eq = m[0].trim();
        if (eq.length > 2 && eq.length < 100 && /[a-z]/i.test(eq) && /\d/.test(eq)) {
          addStep(eq);
        }
      }
    }

    // 4. Natural language math: "2x equals 4", "x squared plus 3 equals 12"
    if (steps.length === 0) {
      const nlText = text
        .replace(/\bequals?\b/gi, '=')
        .replace(/\bis equal to\b/gi, '=')
        .replace(/\bplus\b/gi, '+')
        .replace(/\bminus\b/gi, '-')
        .replace(/\btimes\b/gi, '\\cdot')
        .replace(/\bdivided by\b/gi, '/')
        .replace(/\bover\b/gi, '/')
        .replace(/\bsquared\b/gi, '^2')
        .replace(/\bcubed\b/gi, '^3')
        .replace(/\bsquare root of\b/gi, '\\sqrt{')
        .replace(/\bsqrt of\b/gi, '\\sqrt{');

      // Now look for equations in the converted text
      const convRe = /\b([\d]*\s*[a-z][\w\s\^{}]*(?:\s*[+\-\\/·]\s*[\d]*\s*[a-z\d][\w\s\^{}]*)*\s*=\s*[\d\w\s+\-*/\\^{}.()]+)/gi;
      while ((m = convRe.exec(nlText)) !== null) {
        let eq = m[1].trim()
          .replace(/\s+/g, ' ')
          .replace(/(\d)\s+([a-z])/gi, '$1$2'); // "2 x" → "2x"
        if (eq.length > 2 && eq.length < 100 && /=/.test(eq)) {
          addStep(eq);
        }
      }
    }

    return steps;
  }

  // ═══════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════

  /**
   * Detect the best supported audio MIME type for MediaRecorder.
   * Safari/iOS doesn't support audio/webm — falls back to mp4 or default.
   */
  function getSupportedMimeType() {
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

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function unescapeHtml(str) {
    const doc = new DOMParser().parseFromString(str, 'text/html');
    return doc.documentElement.textContent;
  }

  function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function cleanup() {
    // Set mode to idle first to stop all RAF-based animations
    state.mode = 'idle';

    cancelAnimationFrame(state.waveformRAF);
    cancelAnimationFrame(state.particleRAF);
    clearTimeout(state.vadTimer);
    clearTimeout(state.maxRecordTimer);
    clearInterval(state.timerInterval);
    if (state._vadInterval) {
      clearInterval(state._vadInterval);
      state._vadInterval = null;
    }

    // Stop MediaRecorder and prevent onstop from firing processVoiceInput
    if (state.mediaRecorder) {
      state.mediaRecorder.onstop = null;
      state.mediaRecorder.ondataavailable = null;
      if (state.mediaRecorder.state !== 'inactive') {
        try { state.mediaRecorder.stop(); } catch (e) { /* ignore */ }
      }
      state.mediaRecorder = null;
    }

    if (state.currentAudio) {
      state.currentAudio.onended = null;
      state.currentAudio.onerror = null;
      state.currentAudio.pause();
      state.currentAudio = null;
    }

    // Disconnect VAD source
    if (state.vadSource) {
      try { state.vadSource.disconnect(); } catch (e) { /* ignore */ }
      state.vadSource = null;
    }

    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach(t => t.stop());
      state.mediaStream = null;
    }
    if (state.audioContext && state.audioContext.state !== 'closed') {
      state.audioContext.close();
    }
  }

  // --- Boot ---
  function boot() {
    // Load tutor config script FIRST, then init
    const script = document.createElement('script');
    script.src = '/js/tutor-config-data.js';
    script.onload = () => init();
    script.onerror = () => {
      console.warn('[VoiceTutor] Could not load tutor config — continuing without it');
      init();
    };
    document.head.appendChild(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
