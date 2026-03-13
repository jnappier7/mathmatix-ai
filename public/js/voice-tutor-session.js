// ═══════════════════════════════════════════════════════════════
// VOICE TUTOR SESSION — Immersive hands-free math tutoring
// Real-time voice conversation with visual math rendering,
// interruption support, and transcript logging
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // --- State ---
  const state = {
    mode: 'idle',          // idle | listening | thinking | speaking
    handsFree: true,
    autoListen: true,
    showVisuals: true,
    silenceTimeout: 2000,
    muted: false,
    tutorId: null,
    tutorName: '',
    tutorImage: '',
    conversationId: null,  // Track conversation to save history
    mediaRecorder: null,
    audioContext: null,
    analyserNode: null,
    mediaStream: null,
    currentAudio: null,
    vadTimer: null,
    isSpeaking: false,
    speechStartTime: null,
    waveformRAF: null,
    particleRAF: null,
    avatarController: null,
    avatarEnabled: false,
  };

  // --- DOM refs ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {};

  function cacheDom() {
    dom.orbContainer = $('#vt-orb-container');
    dom.orbCore = $('#vt-orb-core');
    dom.orbWaveform = $('#vt-orb-waveform');
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
    dom.avatarContainer = $('#vt-avatar-container');
    dom.avatarToggle = $('#vt-avatar-toggle');
    dom.avatarHint = $('#vt-avatar-hint');
    dom.visualPanel = $('.vt-visual-panel');
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
    initAvatar();
    addSystemMessage('Voice session started. Tap the mic or just say something.');

    // Auto-start listening if hands-free
    if (state.handsFree) {
      setTimeout(() => startListening(), 800);
    }
  }

  /**
   * Initialize avatar system (Simli) — premium feature.
   * Sets up the toggle and prepares the controller.
   */
  async function initAvatar() {
    if (!window.AvatarController) return;

    state.avatarController = new AvatarController();
    const available = await state.avatarController.init(
      'vt-avatar-video',
      'vt-avatar-audio',
      'vt-avatar-container'
    );

    if (available && dom.avatarToggle) {
      // Show the toggle — avatar service is configured
      const setting = document.getElementById('vt-avatar-setting');
      if (setting) setting.style.display = 'flex';

      dom.avatarToggle.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        state.avatarEnabled = enabled;

        if (enabled) {
          dom.avatarHint.textContent = 'Connecting avatar...';
          const ok = await state.avatarController.start();
          if (ok) {
            dom.avatarHint.textContent = 'Avatar connected and running.';
            dom.avatarContainer.style.display = 'flex';
            dom.orbContainer.style.display = 'none';
            if (dom.visualPanel) dom.visualPanel.classList.add('avatar-active');
          } else {
            dom.avatarHint.textContent = 'Failed to connect avatar. Try again.';
            e.target.checked = false;
            state.avatarEnabled = false;
          }
        } else {
          state.avatarController.close();
          dom.avatarContainer.style.display = 'none';
          dom.orbContainer.style.display = '';
          if (dom.visualPanel) dom.visualPanel.classList.remove('avatar-active');
          dom.avatarHint.textContent = 'See your tutor talk with a realistic animated avatar.';
        }
      });
    } else {
      // Hide avatar setting if not available
      const setting = document.getElementById('vt-avatar-setting');
      if (setting) setting.style.display = 'none';
      if (dom.avatarHint) dom.avatarHint.textContent = 'Avatar not available — SIMLI_API_KEY not configured.';
    }
  }

  async function loadUserData() {
    try {
      const fetchFn = window.csrfFetch || fetch;
      const res = await fetchFn('/user', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const user = data.user;

      state.tutorId = user.selectedTutorId || 'default';

      // Load tutor config from the page or a known endpoint
      const tutorConfig = window.TUTOR_CONFIG || {};
      const tutor = tutorConfig[state.tutorId] || tutorConfig['default'] || {};

      state.tutorName = tutor.name || 'Tutor';
      state.tutorImage = tutor.image || '';

      if (dom.tutorName) dom.tutorName.textContent = state.tutorName;
      if (dom.tutorAvatar && state.tutorImage) {
        dom.tutorAvatar.src = `/images/tutor_avatars/${state.tutorImage}`;
        dom.tutorAvatar.alt = state.tutorName;
      }
    } catch (e) {
      console.warn('[VoiceTutor] Could not load user data:', e);
    }
  }

  // ═══════════════════════════════════════
  // EVENT LISTENERS
  // ═══════════════════════════════════════

  function setupEventListeners() {
    // Main mic button
    dom.micBtn.addEventListener('click', () => {
      if (state.mode === 'speaking') {
        interruptAndListen();
      } else if (state.mode === 'listening') {
        stopListening();
      } else {
        startListening();
      }
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
    dom.silenceSelect.addEventListener('change', (e) => { state.silenceTimeout = parseInt(e.target.value); });

    // Keyboard: space to toggle, ESC to stop
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (state.mode === 'speaking') interruptAndListen();
        else if (state.mode === 'listening') stopListening();
        else startListening();
      }
      if (e.code === 'Escape') {
        if (state.mode === 'listening') stopListening();
        else if (state.mode === 'speaking') stopSpeaking();
      }
    });
  }

  // ═══════════════════════════════════════
  // VOICE INPUT — LISTENING
  // ═══════════════════════════════════════

  async function startListening() {
    if (state.mode === 'listening') return;

    try {
      // Resume AudioContext
      if (!state.audioContext || state.audioContext.state === 'closed') {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (state.audioContext.state === 'suspended') {
        await state.audioContext.resume();
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

      state.mediaRecorder = new MediaRecorder(state.mediaStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
      });

      const chunks = [];
      state.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      state.mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        state.mediaStream?.getTracks().forEach(t => t.stop());
        if (blob.size > 1000) { // Minimum size to avoid empty recordings
          await processVoiceInput(blob);
        } else {
          setMode('idle');
        }
      };

      // Setup VAD (voice activity detection)
      setupVAD(state.mediaStream);

      state.mediaRecorder.start();
      setMode('listening');

    } catch (err) {
      console.error('[VoiceTutor] Mic error:', err);
      addSystemMessage('Could not access microphone. Check permissions.');
      setMode('idle');
    }
  }

  function stopListening() {
    if (state.mode !== 'listening') return;
    clearTimeout(state.vadTimer);
    state.isSpeaking = false;
    state.speechStartTime = null;

    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
    setMode('thinking');
  }

  function setupVAD(stream) {
    const source = state.audioContext.createMediaStreamSource(stream);
    const analyser = state.audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    state.analyserNode = analyser;

    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const check = () => {
      if (state.mode !== 'listening') return;

      analyser.getByteFrequencyData(buffer);
      const avg = buffer.reduce((a, b) => a + b, 0) / buffer.length;
      const db = 20 * Math.log10(avg / 255);
      const speaking = db > -50;

      // Draw waveform
      drawListeningWaveform(buffer);

      if (speaking && !state.isSpeaking) {
        state.isSpeaking = true;
        state.speechStartTime = Date.now();
        clearTimeout(state.vadTimer);
      } else if (!speaking && state.isSpeaking) {
        const duration = Date.now() - (state.speechStartTime || Date.now());
        if (duration < 400) {
          // Too brief, ignore
          state.isSpeaking = false;
          state.speechStartTime = null;
        } else {
          // Silence after speech — wait then auto-send
          clearTimeout(state.vadTimer);
          state.vadTimer = setTimeout(() => {
            if (state.mode === 'listening') {
              stopListening();
            }
          }, state.silenceTimeout);
        }
      }

      requestAnimationFrame(check);
    };
    check();
  }

  // ═══════════════════════════════════════
  // PROCESS VOICE → AI → SPEECH
  // ═══════════════════════════════════════

  async function processVoiceInput(audioBlob) {
    setMode('thinking');

    try {
      // Convert to base64
      const base64 = await blobToBase64(audioBlob);

      const fetchFn = window.csrfFetch || fetch;
      const res = await fetchFn('/api/voice-tutor/process', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64 })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Voice processing failed');
      }

      const data = await res.json();

      // Show user's transcription in chat
      if (data.transcription) {
        addMessage(data.transcription, 'user');
      }

      // Show AI response in chat
      if (data.response) {
        addMessage(data.response, 'ai');
      }

      // Render math visuals
      if (data.mathSteps && data.mathSteps.length > 0 && state.showVisuals) {
        renderMathSteps(data.mathSteps);
      }

      // Play audio response (unless muted)
      if (data.audioUrl && !state.muted) {
        await playResponse(data.audioUrl, data.response || '');
      } else {
        // If muted or no audio, go back to listening
        if (state.handsFree && state.autoListen) {
          setTimeout(() => startListening(), 400);
        } else {
          setMode('idle');
        }
      }

    } catch (err) {
      console.error('[VoiceTutor] Processing error:', err);
      addSystemMessage('Something went wrong. Try again.');
      setMode('idle');
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
      if (data.mathSteps && data.mathSteps.length > 0 && state.showVisuals) {
        renderMathSteps(data.mathSteps);
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

    // Update avatar state if active
    if (state.avatarEnabled && dom.avatarContainer) {
      dom.avatarContainer.setAttribute('data-state', 'speaking');
    }

    // Show live transcript word by word
    if (responseText) {
      animateTranscript(responseText);
    }

    // Pipe audio to avatar for lip sync (runs in parallel with playback)
    if (state.avatarEnabled && state.avatarController?.isConnected && audioUrl) {
      state.avatarController.pipeAudioFromUrl(audioUrl).catch(e =>
        console.warn('[VoiceTutor] Avatar pipe error:', e)
      );
    }

    return new Promise((resolve) => {
      const audio = new Audio(audioUrl);
      state.currentAudio = audio;

      // When avatar is active, mute the regular audio (avatar provides its own)
      if (state.avatarEnabled && state.avatarController?.isConnected) {
        audio.volume = 0;
      }

      // Draw speaking waveform from audio (only when orb is visible)
      if (!state.avatarEnabled) {
        const audioCtx = state.audioContext || new (window.AudioContext || window.webkitAudioContext)();
        state.audioContext = audioCtx;

        audio.addEventListener('canplay', () => {
          try {
            const source = audioCtx.createMediaElementSource(audio);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyser.connect(audioCtx.destination);

            const buffer = new Uint8Array(analyser.frequencyBinCount);
            const drawSpeaking = () => {
              if (state.mode !== 'speaking') return;
              analyser.getByteFrequencyData(buffer);
              drawSpeakingWaveform(buffer);
              requestAnimationFrame(drawSpeaking);
            };
            drawSpeaking();
          } catch (e) {
            audio.volume = 1;
          }
        }, { once: true });
      }

      audio.onended = () => {
        state.currentAudio = null;
        hideTranscript();
        if (dom.avatarContainer) dom.avatarContainer.setAttribute('data-state', 'idle');

        if (state.handsFree && state.autoListen) {
          setTimeout(() => startListening(), 400);
        } else {
          setMode('idle');
        }
        resolve();
      };

      audio.onerror = () => {
        state.currentAudio = null;
        hideTranscript();
        if (dom.avatarContainer) dom.avatarContainer.setAttribute('data-state', 'idle');
        setMode('idle');
        resolve();
      };

      audio.play().catch(() => {
        setMode('idle');
        resolve();
      });
    });
  }

  function stopSpeaking() {
    if (state.currentAudio) {
      state.currentAudio.pause();
      state.currentAudio.currentTime = 0;
      state.currentAudio = null;
    }
    // Clear avatar buffer on interruption
    if (state.avatarController?.isConnected) {
      state.avatarController.clearBuffer();
    }
    if (dom.avatarContainer) dom.avatarContainer.setAttribute('data-state', 'idle');
    hideTranscript();
    setMode('idle');
  }

  function interruptAndListen() {
    // Flash the orb/avatar to indicate interruption
    dom.orbContainer.classList.add('vt-interrupted');
    setTimeout(() => dom.orbContainer.classList.remove('vt-interrupted'), 400);

    stopSpeaking();
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

  function renderMathSteps(steps) {
    dom.canvasPlaceholder.classList.add('hidden');

    // Clear previous steps with fade out
    const existing = dom.mathDisplay.querySelectorAll('.vt-math-step');
    existing.forEach((el, i) => {
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-10px)';
      setTimeout(() => el.remove(), 300);
    });

    // Render new steps with staggered animation
    setTimeout(() => {
      steps.forEach((step, i) => {
        const el = document.createElement('div');
        el.className = 'vt-math-step';
        if (i === steps.length - 1) el.classList.add('highlighted');
        el.style.animationDelay = `${i * 150}ms`;

        let html = '';
        if (step.label) {
          html += `<div class="vt-step-label">${escapeHtml(step.label)}</div>`;
        }

        html += `<div class="vt-step-content">`;
        if (step.latex) {
          html += `<span class="vt-katex-render" data-latex="${escapeAttr(step.latex)}"></span>`;
        } else if (step.text) {
          html += escapeHtml(step.text);
        }
        html += `</div>`;

        if (step.explanation) {
          html += `<div class="vt-step-explanation">${escapeHtml(step.explanation)}</div>`;
        }

        el.innerHTML = html;
        dom.mathDisplay.appendChild(el);
      });

      // Render KaTeX
      requestAnimationFrame(() => {
        dom.mathDisplay.querySelectorAll('.vt-katex-render').forEach((el) => {
          const latex = el.getAttribute('data-latex');
          try {
            if (window.katex) {
              window.katex.render(latex, el, { displayMode: true, throwOnError: false });
            }
          } catch (e) {
            el.textContent = latex;
          }
        });
      });

      // Scroll to newest step
      dom.canvasArea.scrollTo({
        top: dom.canvasArea.scrollHeight,
        behavior: 'smooth'
      });
    }, existing.length > 0 ? 350 : 0);
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
      index++;

      setTimeout(showNextWord, avgWordDuration);
    }
    showNextWord();
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
    dom.orbContainer.setAttribute('data-state', mode);
    if (dom.avatarContainer) dom.avatarContainer.setAttribute('data-state', mode);

    // Mic button
    dom.micBtn.classList.toggle('active', mode === 'listening');
    const micIcon = dom.micBtn.querySelector('i');

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
      thinking: 'Thinking...',
      speaking: 'Speaking — tap to interrupt'
    };

    dom.statusText.textContent = statusTextMap[mode] || 'Tap to speak';
    dom.tutorStatus.textContent = statusMap[mode] || 'Ready';

    switch (mode) {
      case 'idle':
        micIcon.className = 'fas fa-microphone';
        cancelAnimationFrame(state.waveformRAF);
        drawIdleWaveform();
        break;
      case 'listening':
        micIcon.className = 'fas fa-stop';
        break;
      case 'thinking':
        micIcon.className = 'fas fa-microphone';
        drawThinkingWaveform();
        break;
      case 'speaking':
        micIcon.className = 'fas fa-hand';
        break;
    }
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
  // UTILITIES
  // ═══════════════════════════════════════

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
    cancelAnimationFrame(state.waveformRAF);
    cancelAnimationFrame(state.particleRAF);
    clearTimeout(state.vadTimer);

    if (state.currentAudio) {
      state.currentAudio.pause();
      state.currentAudio = null;
    }
    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach(t => t.stop());
    }
    if (state.audioContext && state.audioContext.state !== 'closed') {
      state.audioContext.close();
    }
    // Close avatar session
    if (state.avatarController) {
      state.avatarController.close();
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
