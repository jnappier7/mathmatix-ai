/* ============================================================
   voice-subtitles.js — the caption layer for voice mode.

   Voice mode has no running transcript: the tutor's speech renders
   as karaoke-style subtitles under the tutor cam, the student's
   live STT echoes beneath so mishears are visible BEFORE the tutor
   answers the wrong question, and Replay/History cover recall.
   The full transcript still records into the (hidden) chat container
   — History just peeks it.

   Feed: `mm:voice` CustomEvents broadcast by voice-controller.js
   (raw stream events + `ui_state` mirrors from the legacy path).
   Everything here is presentation; no coupling to the WS protocol
   beyond event names.
   ============================================================ */

(function () {
  'use strict';

  // Words revealed per tick while the tutor is speaking. Cartesia lands
  // around 150–170 wpm; 340ms/word ≈ 176 wpm keeps the caption a beat
  // AHEAD of the voice rather than dragging behind it (subtitle norm).
  const WORD_MS = 340;

  const els = {};
  let tutorWords = [];      // sanitized words of the current turn
  let revealed = 0;         // karaoke pointer
  let revealTimer = null;
  let speaking = false;
  let listening = false;
  let voiceModeOn = false;

  function $(id) { return document.getElementById(id); }

  function init() {
    els.stack = $('mm-voice-captions');
    if (!els.stack) return; // markup absent (non-chat surface)
    els.state = $('mm-vc-state');
    els.stateLabel = $('mm-vc-state-label');
    els.tutor = $('mm-vc-tutor');
    els.student = $('mm-vc-student');
    els.studentText = $('mm-vc-student-text');
    els.replay = $('mm-vc-replay');
    els.history = $('mm-vc-history');
    els.announcer = $('mm-vc-announcer');
    els.hero = document.querySelector('.cr-tutor-hero');

    document.addEventListener('mm:voice', function (e) { onVoiceEvent(e.detail || {}); });

    if (els.replay) els.replay.addEventListener('click', onReplay);
    if (els.history) els.history.addEventListener('click', toggleHistory);

    // Escape closes the history drawer BEFORE voice-mode.js's Escape
    // handler exits voice mode (capture phase wins).
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('cr-voice-history')) {
        document.body.classList.remove('cr-voice-history');
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, true);

    // Track voice mode entry/exit off the body class so we reset cleanly.
    new MutationObserver(function () {
      const on = document.body.classList.contains('cr-voice');
      if (on !== voiceModeOn) {
        voiceModeOn = on;
        // The hero <aside> is decorative (aria-hidden) in chat mode, but in
        // voice mode it holds real controls + captions — expose it to AT.
        if (els.hero) els.hero.setAttribute('aria-hidden', on ? 'false' : 'true');
        if (on) { resetAll(); setState('listening', 'Listening'); }
        else { resetAll(); document.body.classList.remove('cr-voice-history'); }
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    voiceModeOn = document.body.classList.contains('cr-voice');
  }

  // --- Caption text hygiene ----------------------------------------------
  // Spoken text should already be plain language, but strip anything
  // math/markup-shaped that slips through — equations belong on the
  // board, never in a subtitle.
  function sanitize(text) {
    return String(text || '')
      .replace(/\[(WRITE|CIRCLE|ARROW|CLEAR|GRAPH|IMAGE)[^\]]*\]/gi, ' ')
      .replace(/\$\$[\s\S]*?\$\$/g, ' ')
      .replace(/\$[^$\n]{1,200}\$/g, ' ')
      .replace(/\\\((.*?)\\\)/g, '$1')
      .replace(/\\\[(.*?)\\\]/g, '$1')
      .replace(/[*_`#>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // --- State chip + hero ring --------------------------------------------
  const STATE_LABELS = {
    listening: 'Listening',
    thinking: 'Thinking',
    speaking: 'Speaking',
    idle: 'Ready',
    error: 'Hmm — say that again?'
  };

  function setState(state, label) {
    if (els.state) {
      els.state.setAttribute('data-state', state);
      if (els.stateLabel) els.stateLabel.textContent = label || STATE_LABELS[state] || state;
    }
    if (els.hero) els.hero.setAttribute('data-voice-state', state);
  }

  // --- Tutor karaoke -------------------------------------------------------
  // The caption belongs next to the math it describes, so when the board
  // offers a caption target (the Living Workspace mounts one) the tutor's
  // words render THERE and the cam-side caption stands down. Looked up per
  // render, not cached at init — the workspace mounts lazily and can swap.
  // DOM contract only; no module coupling either way.
  function boardCaptionTarget() {
    if (!voiceModeOn) return null;
    return document.querySelector('[data-mm-voice-caption-target]');
  }

  function renderTutor() {
    const text = tutorWords.slice(0, revealed).join(' ');
    const board = boardCaptionTarget();
    if (board) {
      // Board owns the caption — keep the cam-side node empty so the same
      // words never appear twice on one screen.
      if (els.tutor) { els.tutor.hidden = true; els.tutor.textContent = ''; }
      board.textContent = text;
      board.hidden = !text;
      board.scrollTop = board.scrollHeight;
      return;
    }
    if (!els.tutor) return;
    if (!text) { els.tutor.hidden = true; els.tutor.textContent = ''; return; }
    els.tutor.hidden = false;
    els.tutor.textContent = text;
    // Trailing-window subtitles: keep the tail visible, let the head
    // scroll away under the clamp.
    els.tutor.scrollTop = els.tutor.scrollHeight;
  }

  // Light up the step that arrived this turn while the tutor talks about it.
  function setBoardSpeaking(on) {
    const lws = window.LWS_CHAT;
    if (lws && typeof lws.setSpeaking === 'function') {
      try { lws.setSpeaking(on); } catch (_) { /* board absent */ }
    }
  }

  function startReveal() {
    stopReveal();
    revealTimer = setInterval(function () {
      if (revealed < tutorWords.length) {
        revealed++;
        renderTutor();
      }
      // Deltas may still be arriving — keep ticking until speech ends.
    }, WORD_MS);
  }

  function stopReveal() {
    if (revealTimer) { clearInterval(revealTimer); revealTimer = null; }
  }

  function revealAll() {
    stopReveal();
    revealed = tutorWords.length;
    renderTutor();
  }

  function announce(text) {
    // One polite announcement per utterance for screen readers —
    // the karaoke element itself is aria-hidden to avoid a word-by-word
    // announcement storm.
    if (els.announcer) els.announcer.textContent = text;
  }

  // --- Student echo --------------------------------------------------------
  // Low-confidence partials are how a mishear becomes a jump-scare: Deepgram
  // guessing at mumble/background noise has rendered genuinely disturbing
  // text on a kid's screen. Below this, the pill holds its last text (or an
  // ellipsis) instead of echoing the guess. Display-only — the server still
  // receives the full transcript.
  const ECHO_MIN_CONFIDENCE = 0.55;
  // Displayed-echo mask for violent/self-harm mishears. Deliberately tiny:
  // masking hides the mishear from the student (the echo pill's whole job),
  // so only words that should never render in a kids' product qualify.
  const ECHO_MASK_RE = /\b(die|dies|died|dying|dead|death|kill|kills|killed|killing|suicide|gun|guns|knife|stab)\b/i;

  function showStudent(text, interim, confidence) {
    if (!els.student || !els.studentText) return;
    if (interim && typeof confidence === 'number' && confidence < ECHO_MIN_CONFIDENCE) {
      if (els.student.hidden || !els.studentText.textContent) {
        els.student.hidden = false;
        els.student.classList.add('is-interim');
        els.studentText.textContent = '…';
      }
      return;
    }
    const t = sanitize(text);
    if (!t) return;
    els.student.hidden = false;
    els.student.classList.toggle('is-interim', !!interim);
    els.studentText.textContent = ECHO_MASK_RE.test(t) ? '…' : t;
  }

  function hideStudent() {
    if (els.student) { els.student.hidden = true; els.student.classList.remove('is-interim'); }
  }

  function resetAll() {
    stopReveal();
    tutorWords = [];
    revealed = 0;
    speaking = false;
    if (els.tutor) { els.tutor.hidden = true; els.tutor.textContent = ''; }
    // Clear the board strip directly: on exit voiceModeOn is already false, so
    // boardCaptionTarget() declines and renderTutor can't reach it.
    const strip = document.querySelector('[data-mm-voice-caption-target]');
    if (strip) { strip.textContent = ''; strip.hidden = true; }
    setBoardSpeaking(false);
    hideStudent();
    setState('idle');
  }

  // --- Controls ------------------------------------------------------------
  function onReplay() {
    const vc = window.voiceController;
    const ok = vc && typeof vc.replayLastTutorAudio === 'function' && vc.replayLastTutorAudio();
    if (!ok && els.replay) {
      els.replay.classList.add('is-empty');
      setTimeout(function () { els.replay.classList.remove('is-empty'); }, 600);
    } else if (ok) {
      // Replay re-speaks the same words — run the caption again with it.
      revealed = 0;
      renderTutor();
      startReveal();
    }
  }

  function toggleHistory() {
    document.body.classList.toggle('cr-voice-history');
  }

  // --- Event pump ----------------------------------------------------------
  function onVoiceEvent(ev) {
    if (!voiceModeOn && ev.type !== 'ui_state') return;
    switch (ev.type) {
      case 'listening_started':
        listening = true;
        if (!speaking) setState('listening');
        break;

      case 'listening_stopped':
        listening = false;
        if (!speaking) setState('idle');
        break;

      case 'mic_level':
        // Drive the mic pip on the student pill (0..1).
        if (els.stack) els.stack.style.setProperty('--mic-amp', (ev.level || 0).toFixed(2));
        break;

      case 'transcript_partial':
        showStudent(ev.text, true, ev.confidence);
        break;

      case 'transcript_final':
        showStudent(ev.text, false, ev.confidence);
        break;

      case 'turn_start':
        setState('thinking');
        stopReveal();
        tutorWords = [];
        revealed = 0;
        renderTutor();
        break;

      case 'response_delta': {
        const clean = sanitize(ev.text);
        if (clean) tutorWords = tutorWords.concat(clean.split(' '));
        break;
      }

      case 'response_final': {
        // Authoritative full text — replaces the delta accumulation but
        // preserves the karaoke pointer so the reveal doesn't jump.
        const full = sanitize(ev.text);
        if (full) {
          const words = full.split(' ');
          revealed = Math.min(revealed, words.length);
          tutorWords = words;
          if (!speaking) revealAll(); // text-only / legacy turn
          announce(full);
        }
        break;
      }

      case 'ai_speaking_started':
        speaking = true;
        setState('speaking');
        hideStudent();
        setBoardSpeaking(true);
        startReveal();
        break;

      case 'ai_speaking_ended':
        speaking = false;
        revealAll();
        setBoardSpeaking(false);
        setState(listening ? 'listening' : 'idle');
        break;

      case 'barge_in':
      case 'interrupted':
        speaking = false;
        stopReveal();
        setBoardSpeaking(false);
        if (revealed > 0 && revealed < tutorWords.length) {
          // Freeze the caption where the voice stopped.
          tutorWords = tutorWords.slice(0, revealed).concat(['—']);
          revealed = tutorWords.length;
          renderTutor();
        }
        setState('listening');
        break;

      case 'error':
        setState('error');
        break;

      case 'ui_state':
        // Legacy-path mirror: only meaningful when stream events are absent.
        if (!voiceModeOn) break;
        if (ev.state === 'speaking' && !speaking) {
          speaking = true;
          setState('speaking');
          hideStudent();
          revealAll(); // legacy has no deltas — show the full line
        } else if (ev.state === 'thinking') {
          setState('thinking');
        } else if (ev.state === 'idle' && speaking) {
          speaking = false;
          setState(listening ? 'listening' : 'idle');
        } else if (ev.state === 'listening') {
          listening = true;
          if (!speaking) setState('listening');
        }
        break;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
