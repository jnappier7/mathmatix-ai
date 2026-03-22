(function () {
  'use strict';

  /* ── Pi Day Countdown Timer ─────────────────────────── */
  (function initCountdown() {
    var banner = document.getElementById('lp-countdown');
    var daysEl = document.getElementById('lp-cd-days');
    var hoursEl = document.getElementById('lp-cd-hours');
    var minsEl = document.getElementById('lp-cd-mins');
    var secsEl = document.getElementById('lp-cd-secs');

    if (!banner || !daysEl || !hoursEl || !minsEl || !secsEl) return;

    var target = new Date('2026-03-14T04:00:00Z');

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    function updateCountdown() {
      var now = new Date();
      var diff = target - now;

      if (diff <= 0) {
        banner.classList.add('lp-countdown-launched');
        document.querySelectorAll('.lp-pre-launch').forEach(function (el) { el.style.display = 'none'; });
        document.querySelectorAll('.lp-post-launch').forEach(function (el) { el.style.display = ''; });
        return;
      }

      var days  = Math.floor(diff / (1000 * 60 * 60 * 24));
      var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      var mins  = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      var secs  = Math.floor((diff % (1000 * 60)) / 1000);

      daysEl.textContent  = pad(days);
      hoursEl.textContent = pad(hours);
      minsEl.textContent  = pad(mins);
      secsEl.textContent  = pad(secs);
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);
  })();

  /* ── Waitlist Form Handling ────────────────────────── */
  var activeRole = 'parent';
  var roleBtns = document.querySelectorAll('.lp-role-tab');
  roleBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      activeRole = btn.getAttribute('data-role') || 'parent';
    });
  });

  var waitlistForms = document.querySelectorAll('.lp-waitlist-form');
  waitlistForms.forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = form.querySelector('.lp-waitlist-input');
      var btn = form.querySelector('.lp-waitlist-btn');
      var email = input.value.trim();
      if (!email) return;

      var existingMsg = form.querySelector('.lp-waitlist-msg');
      if (existingMsg) existingMsg.remove();

      btn.disabled = true;
      btn.textContent = 'Sending...';

      csrfFetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, role: activeRole })
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var msg = document.createElement('div');
        msg.className = 'lp-waitlist-msg ' + (data.success ? 'success' : 'error');
        msg.textContent = data.message;
        form.appendChild(msg);
        if (data.success) {
          input.value = '';
          btn.textContent = 'Signed Up!';
        } else {
          btn.disabled = false;
          btn.textContent = 'Try Again';
        }
      })
      .catch(function () {
        var msg = document.createElement('div');
        msg.className = 'lp-waitlist-msg error';
        msg.textContent = 'Something went wrong. Please try again.';
        form.appendChild(msg);
        btn.disabled = false;
        btn.textContent = 'Try Again';
      });
    });
  });

  /* ── Scroll Reveal ─────────────────────────────────── */
  var revealEls = document.querySelectorAll('.lp-reveal');
  if ('IntersectionObserver' in window) {
    var revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('lp-visible');
          var staggers = entry.target.querySelectorAll('.lp-stagger');
          staggers.forEach(function (s) { s.classList.add('lp-visible'); });
          revealObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { revealObs.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('lp-visible'); });
  }

  /* ══════════════════════════════════════════════════════
     TRIAL CHAT FLOW
     Phase 1: Tutor selection (cards)
     Phase 2: Celebration video
     Phase 3: Live chat (3 turns → soft gate)
     ══════════════════════════════════════════════════════ */

  // Tutor metadata (names for gate messages, images)
  var TUTOR_META = {
    'mr-nappier': { name: 'Mr. Nappier', img: '/images/tutor_avatars/mr-nappier.png' },
    'bob':        { name: 'Bob',         img: '/images/tutor_avatars/bob.png' },
    'maya':       { name: 'Maya',        img: '/images/tutor_avatars/maya.png' },
    'ms-maria':   { name: 'Ms. Maria',   img: '/images/tutor_avatars/ms-maria.png' }
  };

  // Personalized soft-gate messages — written in each tutor's voice
  var GATE_MESSAGES = {
    'mr-nappier': "We're starting to see a pattern here — you're getting it! Make a free account so we can keep going.",
    'bob':        "Math you believe it? We're on a roll! Sign up free so I can keep helping you.",
    'maya':       "Okay we're lowkey getting somewhere! Sign up (it's free) so we can keep working together.",
    'ms-maria':   "¡Muy bien! We're making great progress paso por paso. Create a free account to continue."
  };

  // DOM refs
  var heroPick     = document.getElementById('lp-hero-pick');
  var celebration  = document.getElementById('lp-celebration');
  var trialChat    = document.getElementById('lp-trial-chat');
  var trustBar     = document.getElementById('lp-trust-bar');

  if (!heroPick || !celebration || !trialChat) return; // Guard: elements must exist

  var celebrationVideo = document.getElementById('lp-celebration-video');
  var celebrationTitle = document.getElementById('lp-celebration-title');
  var celebrationSub   = document.getElementById('lp-celebration-subtitle');

  var trialMessages    = document.getElementById('lp-trial-messages');
  var trialTyping      = document.getElementById('lp-trial-typing');
  var trialInput       = document.getElementById('lp-trial-input');
  var trialSend        = document.getElementById('lp-trial-send');
  var trialBack        = document.getElementById('lp-trial-back');
  var trialSuggestions = document.getElementById('lp-trial-suggestions');
  var trialInputArea   = document.getElementById('lp-trial-input-area');
  var trialGate        = document.getElementById('lp-trial-gate');
  var trialGateMsg     = document.getElementById('lp-trial-gate-msg');
  var trialTutorImg    = document.getElementById('lp-trial-tutor-img');
  var trialTutorName   = document.getElementById('lp-trial-tutor-name');
  var trialMathToggle  = document.getElementById('lp-trial-math-toggle');
  var trialMathBar     = document.getElementById('lp-trial-math-bar');

  // State
  var selectedTutorId = null;
  var chatHistory = []; // { role: 'user'|'assistant', content: string }
  var isSending = false;
  var trialTtsAudio = null; // Currently playing TTS audio

  /* ── Phase 1: Tutor Card Click → Celebration ─────── */
  var tutorCards = document.querySelectorAll('.lp-tutor-card');

  tutorCards.forEach(function (card) {
    // "Hear Me" voice preview button
    var hearBtn = card.querySelector('.lp-tutor-card-hear');
    if (hearBtn) {
      hearBtn.addEventListener('click', function (e) {
        e.stopPropagation(); // Don't trigger card selection
        var tutorId = card.getAttribute('data-tutor');
        playVoicePreview(tutorId, hearBtn);
      });
    }

    // Card click → select tutor
    card.addEventListener('click', function () {
      var tutorId = card.getAttribute('data-tutor');
      selectTutor(tutorId);
    });
  });

  /* ── Voice Preview ───────────────────────────────── */
  var voicePreviewAudio = null;

  function playVoicePreview(tutorId, btnEl) {
    // Stop any currently playing preview
    if (voicePreviewAudio) {
      voicePreviewAudio.pause();
      voicePreviewAudio = null;
    }

    // Visual feedback
    var icon = btnEl.querySelector('i');
    if (icon) {
      icon.className = 'fas fa-spinner fa-spin';
    }

    voicePreviewAudio = new Audio('/api/trial-chat/voice-preview/' + tutorId);

    voicePreviewAudio.addEventListener('canplaythrough', function () {
      if (icon) icon.className = 'fas fa-volume-up';
      voicePreviewAudio.play().catch(function () {
        if (icon) icon.className = 'fas fa-volume-up';
      });
    }, { once: true });

    voicePreviewAudio.addEventListener('error', function () {
      if (icon) icon.className = 'fas fa-volume-up';
      // Silently fail — voice preview is a nice-to-have
    }, { once: true });

    voicePreviewAudio.addEventListener('ended', function () {
      voicePreviewAudio = null;
    }, { once: true });

    voicePreviewAudio.load();
  }

  /* ── Phase 2: Celebration ────────────────────────── */
  function selectTutor(tutorId) {
    selectedTutorId = tutorId;
    chatHistory = [];

    var meta = TUTOR_META[tutorId];
    if (!meta) return;

    // Set celebration content
    celebrationTitle.textContent = meta.name.toUpperCase() + '!';
    celebrationSub.textContent = "Let's do some math together!";

    // Set video source — use the levelUp video for maximum impact
    celebrationVideo.src = '/videos/' + tutorId + '_levelUp.mp4';
    celebration.style.display = 'flex';
    celebration.classList.remove('fade-out');

    // Hide tutor selection
    heroPick.style.display = 'none';
    if (trustBar) trustBar.style.display = 'none';

    celebrationVideo.play().catch(function () {
      // Video autoplay blocked — skip celebration, go to chat
      showTrialChat();
    });

    // Dismiss celebration → transition to chat
    var dismissed = false;
    function dismissCelebration() {
      if (dismissed) return;
      dismissed = true;

      celebration.classList.add('fade-out');
      setTimeout(function () {
        celebration.style.display = 'none';
        showTrialChat();
      }, 400);
    }

    celebrationVideo.addEventListener('ended', dismissCelebration, { once: true });
    celebration.addEventListener('click', dismissCelebration, { once: true });
    // Safety timeout — don't leave them stuck
    setTimeout(dismissCelebration, 5000);
  }

  /* ── Phase 3: Trial Chat ─────────────────────────── */
  function showTrialChat() {
    var meta = TUTOR_META[selectedTutorId];
    if (!meta) return;

    // Set header info
    trialTutorImg.src = meta.img;
    trialTutorImg.alt = meta.name;
    trialTutorName.textContent = meta.name;

    // Reset chat UI
    trialMessages.innerHTML = '';
    trialInput.value = '';
    trialSuggestions.style.display = '';
    trialInputArea.style.display = '';
    trialGate.style.display = 'none';
    trialSend.disabled = false;

    // Show chat panel
    trialChat.style.display = 'block';

    // Scroll hero into view
    document.getElementById('lp-hero').scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Focus input after transition
    setTimeout(function () { trialInput.focus(); }, 300);

    // Persist tutor selection for session carryover
    saveTrialState();
  }

  /* ── Back Button: Return to tutor selection ──────── */
  trialBack.addEventListener('click', function () {
    trialChat.style.display = 'none';
    heroPick.style.display = '';
    if (trustBar) trustBar.style.display = '';
    selectedTutorId = null;
    chatHistory = [];
    clearTrialState();
  });

  /* ── Suggested Prompt Buttons ────────────────────── */
  var promptBtns = document.querySelectorAll('.lp-trial-prompt');
  promptBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var prompt = btn.getAttribute('data-prompt');
      if (prompt) {
        trialInput.value = prompt;
        sendTrialMessage();
      }
    });
  });

  /* ── Send Message ────────────────────────────────── */
  trialSend.addEventListener('click', sendTrialMessage);
  trialInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTrialMessage();
    }
  });

  function sendTrialMessage() {
    if (isSending) return;

    var text = trialInput.value.trim();
    if (!text) return;

    isSending = true;
    trialSend.disabled = true;
    trialInput.value = '';

    // Hide suggestions after first message
    trialSuggestions.style.display = 'none';

    // Add user bubble
    appendTrialBubble(text, true);

    // Show typing indicator
    trialTyping.style.display = 'flex';
    scrollTrialToBottom();

    // Call API
    csrfFetch('/api/trial-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tutorId: selectedTutorId,
        message: text,
        history: chatHistory
      })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      trialTyping.style.display = 'none';

      if (data.error) {
        appendTrialBubble('Something went wrong. Please try again.', false);
        isSending = false;
        trialSend.disabled = false;
        return;
      }

      // Update history
      chatHistory.push({ role: 'user', content: text });

      if (data.reply) {
        chatHistory.push({ role: 'assistant', content: data.reply });
        appendTrialBubble(data.reply, false);
      }

      // Save for session carryover
      saveTrialState();

      // Check if gated
      if (data.gated) {
        showGate();
      } else {
        isSending = false;
        trialSend.disabled = false;
        trialInput.focus();
      }
    })
    .catch(function () {
      trialTyping.style.display = 'none';
      appendTrialBubble('Connection error. Please try again.', false);
      isSending = false;
      trialSend.disabled = false;
    });
  }

  /* ── Lightweight LaTeX renderer for trial chat ───── */
  function renderTrialMath(text) {
    if (!text) return '';
    // Escape HTML first
    var escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    if (!window.katex) return escaped;

    // Display math \[...\]
    escaped = escaped.replace(/\\\[([\s\S]*?)\\\]/g, function (_, math) {
      try {
        return window.katex.renderToString(math, { displayMode: true, throwOnError: false, strict: false, trust: true });
      } catch (e) { return '\\[' + math + '\\]'; }
    });

    // Inline math \(...\)
    escaped = escaped.replace(/\\\(([\s\S]*?)\\\)/g, function (_, math) {
      try {
        return window.katex.renderToString(math, { displayMode: false, throwOnError: false, strict: false, trust: true });
      } catch (e) { return '\\(' + math + '\\)'; }
    });

    // Dollar display math $$...$$
    escaped = escaped.replace(/\$\$([\s\S]*?)\$\$/g, function (_, math) {
      try {
        return window.katex.renderToString(math, { displayMode: true, throwOnError: false, strict: false, trust: true });
      } catch (e) { return '$$' + math + '$$'; }
    });

    // Dollar inline math $...$  (but not $$)
    escaped = escaped.replace(/\$([^\$\n]+?)\$/g, function (_, math) {
      try {
        return window.katex.renderToString(math, { displayMode: false, throwOnError: false, strict: false, trust: true });
      } catch (e) { return '$' + math + '$'; }
    });

    // ── Auto-render common math patterns not wrapped in delimiters ──

    // Exponents: x^2, x^3, a^n, x^{10}, (x+1)^2 — but not already inside KaTeX output
    escaped = escaped.replace(/(?<![a-zA-Z\/"])([a-zA-Z0-9)]+)\^(\{[^}]+\}|[a-zA-Z0-9]+)/g, function (match, base, exp) {
      // Skip if inside a KaTeX span (already rendered)
      var rawExp = exp.charAt(0) === '{' ? exp.slice(1, -1) : exp;
      try {
        return window.katex.renderToString(base + '^{' + rawExp + '}', { displayMode: false, throwOnError: false, strict: false, trust: true });
      } catch (e) { return match; }
    });

    // Fractions: 2/3, 1/4, a/b — only simple numeric or single-letter fractions
    // Avoid matching URLs, file paths, "and/or", etc.
    escaped = escaped.replace(/(?<![a-zA-Z\/.&])(\d+)\/(\d+)(?![a-zA-Z\/\d])/g, function (match, num, den) {
      try {
        return window.katex.renderToString('\\frac{' + num + '}{' + den + '}', { displayMode: false, throwOnError: false, strict: false, trust: true });
      } catch (e) { return match; }
    });

    // Convert line breaks
    escaped = escaped.replace(/\n/g, '<br>');

    return escaped;
  }

  /* ── TTS for tutor responses ───────────────────────── */
  function playTrialTTS(text, btn) {
    // Stop any currently playing audio
    if (trialTtsAudio) {
      trialTtsAudio.pause();
      trialTtsAudio = null;
      // Reset all play buttons
      var allBtns = trialMessages.querySelectorAll('.lp-trial-tts-btn');
      allBtns.forEach(function (b) { b.classList.remove('playing'); b.innerHTML = '<i class="fas fa-volume-up"></i>'; });
    }

    if (btn.classList.contains('playing')) {
      btn.classList.remove('playing');
      return; // Was playing — just stop
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    csrfFetch('/api/trial-chat/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tutorId: selectedTutorId, text: text })
    })
    .then(function (res) {
      if (!res.ok) throw new Error('TTS failed');
      return res.blob();
    })
    .then(function (blob) {
      var url = URL.createObjectURL(blob);
      trialTtsAudio = new Audio(url);
      btn.disabled = false;
      btn.classList.add('playing');
      btn.innerHTML = '<i class="fas fa-stop"></i>';

      trialTtsAudio.addEventListener('ended', function () {
        btn.classList.remove('playing');
        btn.innerHTML = '<i class="fas fa-volume-up"></i>';
        URL.revokeObjectURL(url);
        trialTtsAudio = null;
      });

      trialTtsAudio.play().catch(function () {
        btn.classList.remove('playing');
        btn.innerHTML = '<i class="fas fa-volume-up"></i>';
      });
    })
    .catch(function () {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-volume-up"></i>';
    });
  }

  /* ── Chat Bubble Renderer ────────────────────────── */
  function appendTrialBubble(text, isUser) {
    var meta = TUTOR_META[selectedTutorId];

    var row = document.createElement('div');
    row.className = 'lp-chat-row' + (isUser ? ' lp-chat-row--student' : '');

    if (!isUser) {
      var avatar = document.createElement('div');
      avatar.className = 'lp-chat-avatar';
      var avatarImg = document.createElement('img');
      avatarImg.src = meta.img;
      avatarImg.alt = meta.name;
      avatar.appendChild(avatarImg);
      row.appendChild(avatar);
    }

    var bubble = document.createElement('div');
    bubble.className = 'lp-chat-bubble ' + (isUser ? 'lp-chat-student' : 'lp-chat-tutor');

    if (isUser) {
      bubble.textContent = text;
    } else {
      bubble.innerHTML = renderTrialMath(text);
      // Add TTS button for tutor messages
      var ttsBtn = document.createElement('button');
      ttsBtn.className = 'lp-trial-tts-btn';
      ttsBtn.title = 'Listen';
      ttsBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
      ttsBtn.addEventListener('click', function () {
        playTrialTTS(text, ttsBtn);
      });
      bubble.appendChild(ttsBtn);
    }

    row.appendChild(bubble);

    trialMessages.appendChild(row);

    requestAnimationFrame(function () {
      row.classList.add('lp-chat-visible');
      scrollTrialToBottom();
    });
  }

  function scrollTrialToBottom() {
    trialMessages.scrollTop = trialMessages.scrollHeight;
  }

  /* ── Math Symbol Keyboard ─────────────────────────── */
  if (trialMathToggle && trialMathBar) {
    trialMathToggle.addEventListener('click', function () {
      var isVisible = trialMathBar.classList.contains('visible');
      trialMathBar.classList.toggle('visible', !isVisible);
      trialMathToggle.classList.toggle('active', !isVisible);
      if (!isVisible) trialInput.focus();
    });

    trialMathBar.addEventListener('click', function (e) {
      var btn = e.target.closest('.lp-trial-math-btn');
      if (!btn) return;
      var symbol = btn.getAttribute('data-insert');
      if (!symbol) return;

      // Insert at cursor position
      var start = trialInput.selectionStart;
      var end = trialInput.selectionEnd;
      var val = trialInput.value;
      trialInput.value = val.substring(0, start) + symbol + val.substring(end);
      var newPos = start + symbol.length;
      trialInput.setSelectionRange(newPos, newPos);
      trialInput.focus();
    });
  }

  /* ── Soft Gate ───────────────────────────────────── */
  function showGate() {
    // Hide input and math bar, show gate
    trialInputArea.style.display = 'none';
    if (trialMathBar) { trialMathBar.classList.remove('visible'); }
    if (trialMathToggle) { trialMathToggle.classList.remove('active'); }
    trialGate.style.display = '';

    // Set tutor-voice gate message
    var msg = GATE_MESSAGES[selectedTutorId] || "We're making great progress! Sign up free to keep going.";
    trialGateMsg.textContent = msg;

    // Append the signup URL with trial tutor info for session carryover
    var signupLinks = trialGate.querySelectorAll('a[href*="signup"]');
    signupLinks.forEach(function (link) {
      link.href = '/signup.html?trial_tutor=' + encodeURIComponent(selectedTutorId);
    });

    // Also update the header signup button
    var headerSignup = document.querySelector('.lp-trial-signup-btn');
    if (headerSignup) {
      headerSignup.href = '/signup.html?trial_tutor=' + encodeURIComponent(selectedTutorId);
    }
  }

  /* ── Session Carryover (localStorage) ────────────── */
  var TRIAL_STORAGE_KEY = 'mathmatix_trial_chat';

  function saveTrialState() {
    try {
      localStorage.setItem(TRIAL_STORAGE_KEY, JSON.stringify({
        tutorId: selectedTutorId,
        history: chatHistory,
        timestamp: Date.now()
      }));
    } catch (e) { /* localStorage not available — ok */ }
  }

  function clearTrialState() {
    try { localStorage.removeItem(TRIAL_STORAGE_KEY); } catch (e) {}
  }

  // Expose for the chat page to pick up after signup
  window.getTrialChatState = function () {
    try {
      var raw = localStorage.getItem(TRIAL_STORAGE_KEY);
      if (!raw) return null;
      var state = JSON.parse(raw);
      // Expire after 1 hour
      if (Date.now() - state.timestamp > 60 * 60 * 1000) {
        localStorage.removeItem(TRIAL_STORAGE_KEY);
        return null;
      }
      return state;
    } catch (e) { return null; }
  };

  window.clearTrialChatState = function () {
    clearTrialState();
  };

  /* ── Animated Chat Preview (below fold) ──────────────── */
  var chatContainer = document.getElementById('lp-chat');
  var typingEl = document.getElementById('lp-typing');
  var tutorNameEl = document.getElementById('lp-tutor-name');

  if (chatContainer && typingEl) {
    var conversations = [
      {
        tutor: 'Mr. Nappier',
        studentAvatar: '/images/avatars/astronaut.png',
        tutorAvatar: '/images/tutor_avatars/mr-nappier.png',
        messages: [
          { from: 'student', text: 'How do I add \u2153 + \u00BC?' },
          { from: 'tutor', text: 'Great question! Let\u2019s figure it out together. First \u2014 can you think of a number that both 3 and 4 divide into evenly?' },
          { from: 'student', text: '12?' },
          { from: 'tutor', text: 'That\u2019s it! Now we can rewrite both fractions with 12 as the denominator. What would \u2153 become?' }
        ]
      },
      {
        tutor: 'Ms. Maria',
        studentAvatar: '/images/avatars/dragon.png',
        tutorAvatar: '/images/tutor_avatars/ms-maria.png',
        messages: [
          { from: 'student', text: 'I don\u2019t get how to solve 3x + 7 = 22' },
          { from: 'tutor', text: 'No worries! Our goal is to get x all by itself. What do you think we should do to both sides first?' },
          { from: 'student', text: 'Subtract 7?' },
          { from: 'tutor', text: 'Exactly! 22 \u2013 7 = 15, so now we have 3x = 15. What\u2019s the last step?' }
        ]
      },
      {
        tutor: 'Maya',
        studentAvatar: '/images/avatars/alien.png',
        tutorAvatar: '/images/tutor_avatars/maya.png',
        messages: [
          { from: 'student', text: 'Can you check my homework? I got 0.5 \u00D7 0.3 = 1.5' },
          { from: 'tutor', text: 'Hmm, let\u2019s look at that together! When you multiply decimals, how many total decimal places should the answer have?' },
          { from: 'student', text: 'Oh wait\u2026 two places? So it\u2019s 0.15?' },
          { from: 'tutor', text: 'There you go! 0.5 has one decimal place, 0.3 has one, so the answer needs two. Nice catch!' }
        ]
      },
      {
        tutor: 'Bob',
        studentAvatar: '/images/avatars/dragon.png',
        tutorAvatar: '/images/tutor_avatars/bob.png',
        messages: [
          { from: 'student', text: 'What\u2019s the answer to number 5? It\u2019s 4x \u2013 10 = 14' },
          { from: 'tutor', text: 'I can\u2019t just give you the answer \u2014 but I can help you figure it out! What\u2019s the first step to isolate the x term?' },
          { from: 'student', text: 'Ugh fine\u2026 add 10 to both sides?' },
          { from: 'tutor', text: 'See, you DO know this! Now you\u2019ve got 4x = 24. One more step and you\u2019ve got it.' }
        ]
      }
    ];

    var convoIndex = 0;

    function playConversation() {
      var convo = conversations[convoIndex % conversations.length];
      convoIndex++;

      if (tutorNameEl) tutorNameEl.textContent = convo.tutor;
      chatContainer.innerHTML = '';
      typingEl.style.display = 'none';

      var msgIdx = 0;

      function showNextMessage() {
        if (msgIdx >= convo.messages.length) {
          setTimeout(function () {
            var allRows = chatContainer.querySelectorAll('.lp-chat-row');
            allRows.forEach(function (r) { r.style.opacity = '0'; r.style.transform = 'translateY(-8px)'; });
            setTimeout(playConversation, 400);
          }, 3000);
          return;
        }

        var msg = convo.messages[msgIdx];
        var isStudent = msg.from === 'student';

        if (!isStudent) {
          typingEl.style.display = 'flex';
          setTimeout(function () {
            typingEl.style.display = 'none';
            appendPreviewMessage(msg, isStudent, convo);
            msgIdx++;
            setTimeout(showNextMessage, 900);
          }, 1100);
        } else {
          appendPreviewMessage(msg, isStudent, convo);
          msgIdx++;
          setTimeout(showNextMessage, 800);
        }
      }

      function appendPreviewMessage(msg, isStudent, c) {
        var row = document.createElement('div');
        row.className = 'lp-chat-row' + (isStudent ? ' lp-chat-row--student' : '');

        var avatar = document.createElement('div');
        avatar.className = 'lp-chat-avatar';
        var avatarImg = document.createElement('img');
        avatarImg.src = isStudent ? c.studentAvatar : c.tutorAvatar;
        avatarImg.alt = isStudent ? 'Student' : c.tutor;
        avatarImg.loading = 'lazy';
        avatar.appendChild(avatarImg);

        var bubble = document.createElement('div');
        bubble.className = 'lp-chat-bubble ' + (isStudent ? 'lp-chat-student' : 'lp-chat-tutor');
        bubble.textContent = msg.text;

        row.appendChild(avatar);
        row.appendChild(bubble);
        chatContainer.appendChild(row);

        requestAnimationFrame(function () {
          row.classList.add('lp-chat-visible');
          chatContainer.scrollTop = chatContainer.scrollHeight;
        });
      }

      setTimeout(showNextMessage, 600);
    }

    // Only start playing when the section scrolls into view
    if ('IntersectionObserver' in window) {
      var chatPreviewStarted = false;
      var chatObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !chatPreviewStarted) {
            chatPreviewStarted = true;
            setTimeout(playConversation, 700);
            chatObs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.3 });
      chatObs.observe(chatContainer.closest('section') || chatContainer);
    } else {
      setTimeout(playConversation, 700);
    }
  }

  /* ── Role Selector Tabs ────────────────────────────── */
  var roleTabs = document.querySelectorAll('.lp-role-tab');
  var rolePanels = document.querySelectorAll('.lp-role-panel');

  roleTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var role = tab.getAttribute('data-role');

      roleTabs.forEach(function (t) { t.classList.remove('lp-role-tab--active'); });
      tab.classList.add('lp-role-tab--active');

      rolePanels.forEach(function (p) { p.classList.remove('lp-role-panel--active'); });
      var targetPanel = document.querySelector('[data-panel="' + role + '"]');
      if (targetPanel) targetPanel.classList.add('lp-role-panel--active');
    });
  });

  /* ── Sticky CTA Bar ────────────────────────────────── */
  var stickyBar = document.getElementById('lp-sticky-cta');
  var hero = document.querySelector('.lp-hero');
  var finalCta = document.querySelector('.lp-final-cta');

  if (stickyBar && hero) {
    var stickyObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.target === hero) {
          if (!entry.isIntersecting) {
            stickyBar.classList.add('lp-sticky-visible');
          } else {
            stickyBar.classList.remove('lp-sticky-visible');
          }
        }
      });
    }, { threshold: 0 });
    stickyObs.observe(hero);

    if (finalCta) {
      var finalObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            stickyBar.classList.remove('lp-sticky-visible');
          } else if (hero.getBoundingClientRect().bottom < 0) {
            stickyBar.classList.add('lp-sticky-visible');
          }
        });
      }, { threshold: 0.3 });
      finalObs.observe(finalCta);
    }
  }

  /* ── Pi Day Launch Auto-Switch ─────────────────────── */
  (function piDayLaunchSwitch() {
    var launchDate = new Date('2026-03-14T04:00:00Z');
    var promoEnd   = new Date('2026-03-16T03:59:59Z');
    if (new Date() < launchDate) return;

    var countdown = document.getElementById('lp-countdown');
    if (countdown) countdown.style.display = 'none';

    if (new Date() <= promoEnd) {
      var promoBanner = document.createElement('div');
      promoBanner.className = 'lp-piday-promo';
      promoBanner.innerHTML = '<div class="lp-piday-inner">' +
        '<div class="lp-piday-icon">\u03C0</div>' +
        '<div class="lp-piday-text">' +
          '<div class="lp-piday-headline">Happy Pi Day! <span class="lp-piday-pink">$3.14 off</span> Mathmatix+</div>' +
          '<div class="lp-piday-sub">Celebrate 3.14 with us \u2014 limited-time launch pricing through March 15</div>' +
        '</div>' +
        '<div class="lp-piday-prices">' +
          '<div class="lp-piday-price-chip">' +
            '<div class="lp-piday-plan-name">Mathmatix+</div>' +
            '<div class="lp-piday-original">$9.95/mo</div>' +
            '<div class="lp-piday-deal">$6.81/mo</div>' +
          '</div>' +
        '</div>' +
        '<a href="/signup.html" class="lp-piday-cta">Sign Up &amp; Save</a>' +
      '</div>';
      var main = document.getElementById('lp-main');
      if (main) main.insertBefore(promoBanner, main.firstChild);
    }
  })();

  /* ── FAQ Accordion ─────────────────────────────────── */
  var faqItems = document.querySelectorAll('.lp-faq-item');
  faqItems.forEach(function (item) {
    var btn = item.querySelector('.lp-faq-question');
    if (btn) {
      btn.addEventListener('click', function () {
        var isOpen = item.classList.contains('lp-faq-open');
        faqItems.forEach(function (other) {
          other.classList.remove('lp-faq-open');
          var otherBtn = other.querySelector('.lp-faq-question');
          if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          item.classList.add('lp-faq-open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    }
  });

})();
