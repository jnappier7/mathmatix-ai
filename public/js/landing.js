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
  /* Used to be switched by the role tabs, which no longer exist. Parent is the
     homepage's audience, so it is the right constant rather than a guess. */
  var activeRole = 'parent';

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
     PREVIEW FLOW  (anonymous, no account — see middleware/usageGate.js for
     where PREVIEW sits in the Preview -> Trial -> Free ladder)
     Phase 1: Composer + examples. No tutor picker any more; the preview runs
              on PREVIEW_TUTOR_ID and choosing is now a post-signup reward.
     Phase 2: Celebration video (retained; only reachable when a caller asks
              selectTutor for it, which the composer path skips)
     Phase 3: Live chat — MAX_CLIENT_TURNS turns, then the wall
     ══════════════════════════════════════════════════════ */

  // Tutor metadata (names for gate messages, images)
  // hero/backdrop mirror the frames .cr-tutor-hero uses on chat.html, so the
  // trial and the real product show the same character art.
  var TUTOR_META = {
    'mr-nappier': { name: 'Mr. Nappier', img: '/images/tutor_avatars/mr-nappier.png', hero: '/images/tutor_avatars/mr-nappier-new2.png', backdrop: '/images/tutor_avatars/mr-nappier-backdrop.png' },
    'bob':        { name: 'Bob',         img: '/images/tutor_avatars/bob.png',        hero: '/images/tutor_avatars/bob-new2.png',        backdrop: '/images/tutor_avatars/bob-backdrop.png' },
    'maya':       { name: 'Maya',        img: '/images/tutor_avatars/maya.png',       hero: '/images/tutor_avatars/maya-new2.png',       backdrop: '/images/tutor_avatars/maya-backdrop.png' },
    'ms-maria':   { name: 'Ms. Maria',   img: '/images/tutor_avatars/ms-maria.png',   hero: '/images/tutor_avatars/ms-maria-new2.png',   backdrop: '/images/tutor_avatars/ms-maria-backdrop.png' }
  };

  // The wall's opening line, in the tutor's own voice. Keyed by tutor because
  // PREVIEW_TUTOR_ID decides which one a visitor meets — not dead entries.
  //
  // These carry the HOOK only. The terms (14 days, no card, conversation
  // carries over) are in .lp-trial-gate-offer directly beneath, and saying them
  // in both places made the wall read like it was arguing with itself. What is
  // left here is the one thing the offer paragraph cannot say: that the tutor
  // has started to learn how this particular person thinks.
  var GATE_MESSAGES = {
    'mr-nappier': "We're just getting to the good part — I can see how you're thinking about this, and I don't want to lose that thread.",
    'bob':        "Math you believe how far we got?! I'm just starting to figure out how you like to work through these.",
    'maya':       "Okay we're lowkey cooking 🔥 I'm starting to get how your brain works on these — don't make me start over.",
    'ms-maria':   "¡Vamos muy bien, paso por paso! I am learning how you think about these problems — let's not lose that."
  };

  // DOM refs
  var heroPick     = document.getElementById('lp-hero-pick');
  var celebration  = document.getElementById('lp-celebration');
  var trialChat    = document.getElementById('lp-trial-chat');
  var trustBar     = document.getElementById('lp-trust-bar');

  if (!heroPick || !celebration || !trialChat) return; // Guard: parent containers must exist

  var celebrationVideo = document.getElementById('lp-celebration-video');
  var celebrationTitle = document.getElementById('lp-celebration-title');
  var celebrationSub   = document.getElementById('lp-celebration-subtitle');

  var trialMessages    = document.getElementById('lp-trial-messages');
  var trialNotebook    = document.getElementById('lp-trial-notebook');
  var trialHeroPortrait = document.getElementById('lp-trial-hero-portrait');
  var trialHeroBackdrop = document.getElementById('lp-trial-hero-backdrop');
  var trialHeroName     = document.getElementById('lp-trial-hero-name');
  var trialWsEmpty      = document.getElementById('lp-trial-ws-empty');
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
  var trialXpEl        = document.getElementById('lp-trial-xp');
  var trialXpTotalEl   = document.getElementById('lp-trial-xp-total');

  // The anonymous preview runs on ONE tutor. Choosing between four strangers
  // before you have experienced anything is a decision with no basis; the picker
  // now lives at pick-tutor.html, as the first thing a new account does.
  var PREVIEW_TUTOR_ID = 'mr-nappier';

  // State
  var selectedTutorId = PREVIEW_TUTOR_ID;
  var pendingFirstMessage = null;     // Problem typed in the hero, auto-sent once the session greets
  var trialXpTotal = 0;               // engagement XP earned this session (server-authoritative)
  var chatHistory = []; // { role: 'user'|'assistant', content: string }
  var clientTurnCount = 0; // Client-side backup gate (defense-in-depth)
  // Client-side backup gate. MUST stay in step with MAX_TURNS in
  // routes/trialChat.js — it is a defense-in-depth copy, not an independent
  // policy, and when it is the lower of the two it silently becomes the real
  // cap: the server would happily serve turn 5 and the browser would never ask.
  var MAX_CLIENT_TURNS = 9; // 1 greeting + 8 student volleys
  var isSending = false;
  var trialTtsAudio = null; // Currently playing TTS audio

  /* ── Phase 1: Live hero composer → real trial session ─────── */

  // Tutor chips: choose a tutor (subordinate to typing a problem). The "hear my
  // voice" control is a SIBLING button, not a child of the chip — it used to be
  // a <span role="button" tabindex="0"> nested inside the chip's <button>,
  // which is a control inside a control: unreachable by keyboard or screen
  // reader, so the voice preview only existed for mouse users. Two real
  // buttons means no stopPropagation dance either; a click on one is not a
  // click on the other.
  // Kicks off the real trial session with the student's own problem as the
  // first message. Reuses the exact selectTutor → greet → send flow; we just
  // skip the celebration video so the answer arrives fast, and queue the
  // typed problem to auto-send once the greeting lands.
  function startTrialWith(text) {
    text = (text || '').trim();
    if (!text) return;
    pendingFirstMessage = text;
    selectTutor(selectedTutorId, { skipCelebration: true });
  }

  var heroComposer = document.getElementById('lp-hero-composer');
  var heroInput    = document.getElementById('lp-hero-input');
  if (heroComposer && heroInput) {
    heroComposer.addEventListener('submit', function (e) {
      e.preventDefault();
      startTrialWith(heroInput.value);
    });
  }

  var heroExamples = document.querySelectorAll('.lp-hero-example');
  heroExamples.forEach(function (btn) {
    btn.addEventListener('click', function () {
      startTrialWith(btn.getAttribute('data-prompt'));
    });
  });

  /* ── Phase 2: Celebration ────────────────────────── */
  function selectTutor(tutorId, opts) {
    selectedTutorId = tutorId;
    chatHistory = [];
    clientTurnCount = 0;

    var meta = TUTOR_META[tutorId];
    if (!meta) return;

    // Hide the pick/composer UI on every path into the session.
    heroPick.style.display = 'none';
    if (trustBar) trustBar.style.display = 'none';

    // Type-first path: the student already gave us a problem — skip the
    // celebration video and drop them straight into help.
    if (opts && opts.skipCelebration) {
      celebration.style.display = 'none';
      showTrialChat();
      return;
    }

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

    // Hero column (left) — same art the real chat stage uses.
    if (trialHeroPortrait) { trialHeroPortrait.src = meta.hero || meta.img; trialHeroPortrait.alt = meta.name; }
    if (trialHeroBackdrop && meta.backdrop) trialHeroBackdrop.src = meta.backdrop;
    if (trialHeroName) trialHeroName.textContent = meta.name;

    // Reset chat UI
    trialMessages.innerHTML = '';
    // The board is its own column now, so it stays visible and shows an
    // empty-state instead of appearing out of nowhere on the first step.
    if (trialNotebook) { trialNotebook.innerHTML = ''; nbLastPose = null; }
    if (trialWsEmpty) trialWsEmpty.style.display = '';
    trialXpTotal = 0; if (trialXpTotalEl) trialXpTotalEl.textContent = '0';
    trialInput.value = '';
    trialSuggestions.style.display = 'none'; // Hide suggestions until greeting loads
    trialInputArea.style.display = '';
    trialGate.style.display = 'none';
    trialSend.disabled = true; // Disable until greeting loads
    trialInput.disabled = true;

    // Show chat panel
    trialChat.style.display = 'block';

    // Scroll hero into view
    document.getElementById('lp-hero').scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Show typing indicator while greeting loads
    trialTyping.style.display = 'flex';

    // Fetch tutor greeting
    csrfFetch('/api/trial-chat/greet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tutorId: selectedTutorId })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      trialTyping.style.display = 'none';

      if (data.gated) {
        showGate();
        return;
      }

      var greeting = data.greeting;
      if (greeting) {
        chatHistory.push({ role: 'assistant', content: greeting });
        clientTurnCount++;
        appendTrialBubble(greeting, false);
      }

      // Now show suggestions and enable input
      trialSuggestions.style.display = '';
      trialSend.disabled = false;
      trialInput.disabled = false;
      trialInput.focus();

      saveTrialState();
      flushPendingFirstMessage();
    })
    .catch(function () {
      trialTyping.style.display = 'none';
      // Enable input even if greeting fails — they can still chat
      trialSuggestions.style.display = '';
      trialSend.disabled = false;
      trialInput.disabled = false;
      trialInput.focus();
      flushPendingFirstMessage();
    });

    // Persist tutor selection for session carryover
    saveTrialState();
  }

  /* ── Back Button: Return to tutor selection ──────── */
  if (trialBack) trialBack.addEventListener('click', function () {
    trialChat.style.display = 'none';
    heroPick.style.display = '';
    if (trustBar) trustBar.style.display = '';
    selectedTutorId = PREVIEW_TUTOR_ID; // never null: the next start reuses it
    chatHistory = [];
    clientTurnCount = 0;
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

  // If the student typed a problem in the hero, send it as their first turn
  // once the greeting has loaded and the input is live.
  function flushPendingFirstMessage() {
    if (!pendingFirstMessage) return;
    var msg = pendingFirstMessage;
    pendingFirstMessage = null;
    trialInput.value = msg;
    sendTrialMessage();
  }

  function sendTrialMessage() {
    if (isSending) return;

    // Client-side gate: backup in case server counter resets (restart, multi-instance)
    if (clientTurnCount >= MAX_CLIENT_TURNS) {
      showGate();
      return;
    }

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
    .then(function (res) {
      if (!res.ok) throw new Error('Request failed');
      return res.json();
    })
    .then(function (data) {
      trialTyping.style.display = 'none';

      if (data.error) {
        appendTrialBubble('Something went wrong. Please try again.', false);
        isSending = false;
        trialSend.disabled = false;
        return;
      }

      // Update history and client-side turn counter
      chatHistory.push({ role: 'user', content: text });
      clientTurnCount++;

      // Write the tutor's earned steps onto the living board. These are already
      // server-gated (only steps the student stated) — we just render them.
      if (Array.isArray(data.board) && data.board.length) {
        renderTrialBoard(data.board);
      }

      // Engagement XP earned this turn (server-decided).
      if (data.xp) bumpTrialXp(data.xp);

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

  /* ── KaTeX helper ─────────────────────────────────── */
  function renderTrialKatex(math, displayMode) {
    if (!window.katex) return (displayMode ? '\\[' : '\\(') + math + (displayMode ? '\\]' : '\\)');
    try {
      return window.katex.renderToString(math, { displayMode: displayMode, throwOnError: false, strict: false, trust: true });
    } catch (e) {
      return (displayMode ? '\\[' : '\\(') + math + (displayMode ? '\\]' : '\\)');
    }
  }

  /* ── Markdown + LaTeX renderer for trial chat ───── */
  function renderTrialMath(text) {
    if (!text) return '';

    var _marked = window.marked;
    var _DOMPurify = window.DOMPurify;

    // ── If marked isn't loaded, fall back to KaTeX-only rendering ──
    if (!_marked || !_marked.parse) {
      var escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      if (window.katex) {
        escaped = escaped.replace(/\\\[([\s\S]*?)\\\]/g, function (_, m) { return renderTrialKatex(m, true); });
        escaped = escaped.replace(/\\\(([\s\S]*?)\\\)/g, function (_, m) { return renderTrialKatex(m, false); });
        escaped = escaped.replace(/\$\$([\s\S]*?)\$\$/g, function (_, m) { return renderTrialKatex(m, true); });
        escaped = escaped.replace(/\$([^\$\n]+?)\$/g, function (_, m) { return renderTrialKatex(m, false); });
      }
      return escaped.replace(/\n/g, '<br>');
    }

    var processed = text;
    var latexBlocks = [];

    // Protect LaTeX from markdown parser — display math \[...\]
    processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, function (_, math) {
      var idx = latexBlocks.length;
      latexBlocks.push({ math: math, display: true });
      return '@@LATEX_BLOCK_' + idx + '@@';
    });

    // Inline math \(...\)
    processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, function (_, math) {
      var idx = latexBlocks.length;
      latexBlocks.push({ math: math, display: false });
      return '@@LATEX_BLOCK_' + idx + '@@';
    });

    // Display math $$...$$
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, function (_, math) {
      var idx = latexBlocks.length;
      latexBlocks.push({ math: math, display: true });
      return '@@LATEX_BLOCK_' + idx + '@@';
    });

    // Inline math $...$ (but not $$)
    processed = processed.replace(/\$([^\$\n]+?)\$/g, function (_, math) {
      var idx = latexBlocks.length;
      latexBlocks.push({ math: math, display: false });
      return '@@LATEX_BLOCK_' + idx + '@@';
    });

    // Parse markdown
    var html = _marked.parse(processed, { breaks: true });

    // Restore LaTeX blocks — render to KaTeX HTML
    latexBlocks.forEach(function (block, index) {
      html = html.replace('@@LATEX_BLOCK_' + index + '@@', renderTrialKatex(block.math, block.display));
    });

    // Sanitize output
    if (_DOMPurify) {
      html = _DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          'p', 'br', 'strong', 'em', 'u', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote',
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'span', 'div',
          // KaTeX MathML elements
          'math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'ms',
          'mfrac', 'msup', 'msub', 'msubsup', 'mover', 'munder', 'munderover',
          'msqrt', 'mroot', 'mtable', 'mtr', 'mtd', 'mtext', 'mspace', 'mpadded',
          'menclose', 'mglyph', 'mstyle', 'merror', 'mprescripts', 'mmultiscripts'
        ],
        ALLOWED_ATTR: [
          'href', 'class', 'target', 'rel', 'style', 'title',
          // KaTeX attributes
          'aria-hidden', 'encoding', 'mathvariant', 'stretchy', 'fence',
          'separator', 'lspace', 'rspace', 'accent', 'accentunder',
          'columnalign', 'rowalign', 'columnspacing', 'rowspacing',
          'columnlines', 'rowlines', 'frame', 'framespacing',
          'displaystyle', 'scriptlevel', 'minsize', 'maxsize',
          'xmlns'
        ]
      });
    }

    return html;
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
  /* ── Living board renderer ─────────────────────────────
     Renders the server's ALREADY-GATED board commands as a notebook that
     "writes" the tutor's earned steps. Anti-cheat is enforced server-side
     (only steps the student has stated ever arrive here) — this is display
     only; it never decides what may be shown. */
  var nbLastPose = null; // normalized pinned problem, to dedup re-poses across turns

  function nbEscape(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function nbLine(cls, html) {
    var row = document.createElement('div');
    row.className = 'lp-nb-line ' + cls + ' lp-nb-writing';
    row.innerHTML = html;
    trialNotebook.appendChild(row);
    requestAnimationFrame(function () { row.classList.add('lp-nb-shown'); });
    return row;
  }

  function appendNotebookStep(op) {
    if (!op || !op.action) return;
    switch (op.action) {
      case 'pose': {
        var tex = (op.tex || '').trim();
        if (!tex) return;
        var norm = tex.replace(/\s+/g, '');
        if (norm === nbLastPose) return;            // same problem re-posed → skip
        if (nbLastPose !== null) trialNotebook.innerHTML = ''; // new problem → fresh page
        nbLastPose = norm;
        nbLine('lp-nb-pose', renderTrialKatex(tex, false));
        break;
      }
      case 'apply':
        if (op.op) nbLine('lp-nb-op', '<span class="lp-nb-arrow">→</span> ' + nbEscape(op.op));
        break;
      case 'resolve':
        if (op.tex) nbLine('lp-nb-step', renderTrialKatex(op.tex.trim(), false));
        break;
      case 'scaffold':
        if (op.tex) nbLine('lp-nb-scaffold', renderTrialKatex(op.tex.trim(), false));
        break;
      case 'verify':
        if (op.tex) nbLine('lp-nb-verify', '<span class="lp-nb-check">✓</span> ' + renderTrialKatex(op.tex.trim(), false));
        break;
      case 'graph':
        if (op.points && op.points.length) {
          var card = nbLine('lp-nb-graph', nbGraphSVG(op) +
            (op.caption ? '<div class="lp-nb-graph-cap">' + nbEscape(op.caption) + '</div>' : ''));
          card.classList.remove('lp-nb-writing'); // draw the plot in, don't wipe it
          card.classList.add('lp-nb-shown');
        }
        break;
      // image/model still need workspace libs the landing page doesn't load.
    }
  }

  // Draw the server-computed plot points as a small SVG. The client only connects
  // dots — every y was evaluated server-side by the vetted rational engine.
  function nbGraphSVG(g) {
    var W = 300, H = 175, pad = 10;
    var xMin = g.xMin, xMax = g.xMax, yMin = g.yMin, yMax = g.yMax;
    var yPad = (yMax - yMin) * 0.12 || 1; yMin -= yPad; yMax += yPad;
    var xr = (xMax - xMin) || 1, yr = (yMax - yMin) || 1;
    function sx(x) { return (pad + (x - xMin) / xr * (W - 2 * pad)).toFixed(1); }
    function sy(y) { return (H - pad - (y - yMin) / yr * (H - 2 * pad)).toFixed(1); }
    var d = '', pen = false;
    g.points.forEach(function (p) {
      if (!p) { pen = false; return; }
      d += (pen ? 'L' : 'M') + sx(p[0]) + ' ' + sy(p[1]) + ' '; pen = true;
    });
    var axes = '';
    if (yMin <= 0 && yMax >= 0) axes += '<line x1="' + pad + '" y1="' + sy(0) + '" x2="' + (W - pad) + '" y2="' + sy(0) + '" class="lp-nb-axis"/>';
    if (xMin <= 0 && xMax >= 0) axes += '<line x1="' + sx(0) + '" y1="' + pad + '" x2="' + sx(0) + '" y2="' + (H - pad) + '" class="lp-nb-axis"/>';
    return '<svg class="lp-nb-graph-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" aria-label="Graph">' +
      axes + '<path d="' + d.trim() + '" class="lp-nb-curve" fill="none"/></svg>';
  }

  function renderTrialBoard(ops) {
    if (!trialNotebook) return;
    ops.forEach(appendNotebookStep);
    // The board column is always present; the empty-state steps aside as soon
    // as there is real work on the page.
    if (trialNotebook.children.length && trialWsEmpty) trialWsEmpty.style.display = 'none';
    trialNotebook.scrollTop = trialNotebook.scrollHeight;
  }

  /* ── Engagement XP (a conversion hook) ──────────────────
     XP rewards THINKING, not correct answers (server decides the amount).
     Shows a floating +N popup + a count-up on the header pill; the running
     total becomes the "you earned N XP — sign up to keep going" gate line. */
  function animateXpCount(el, from, to, dur) {
    var start = null, done = false;
    function finish() { if (!done) { done = true; el.textContent = String(to); } }
    function step(ts) {
      if (done) return;
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / dur);
      el.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(step); else finish();
    }
    requestAnimationFrame(step);
    // Fallback: rAF is throttled in background tabs — guarantee the final value.
    setTimeout(finish, dur + 200);
  }

  function bumpTrialXp(xp) {
    if (!xp || !trialXpTotalEl) return;
    var prev = trialXpTotal;
    trialXpTotal = (typeof xp.total === 'number') ? xp.total : prev + (xp.awarded || 0);
    animateXpCount(trialXpTotalEl, prev, trialXpTotal, 600);
    if (xp.awarded > 0 && trialXpEl) {
      trialXpEl.classList.remove('lp-xp-pulse'); void trialXpEl.offsetWidth; trialXpEl.classList.add('lp-xp-pulse');
      var pop = document.createElement('div');
      pop.className = 'lp-trial-xp-pop';
      pop.innerHTML = '+' + xp.awarded + ' XP' + (xp.reason ? ' <span class="lp-xp-reason">' + nbEscape(xp.reason) + '</span>' : '');
      trialXpEl.appendChild(pop);
      requestAnimationFrame(function () { pop.classList.add('go'); });
      setTimeout(function () { if (pop.parentNode) pop.parentNode.removeChild(pop); }, 1500);
    }
  }

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
      bubble.style.whiteSpace = 'pre-wrap';
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
      // The button declares aria-expanded/aria-controls in the markup; keep it
      // honest, otherwise it announces "collapsed" over an open symbol bar.
      trialMathToggle.setAttribute('aria-expanded', String(!isVisible));
      trialMathToggle.setAttribute('aria-label', isVisible ? 'Open math symbols' : 'Close math symbols');
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
    if (trialMathToggle) {
      trialMathToggle.classList.remove('active');
      trialMathToggle.setAttribute('aria-expanded', 'false');
      trialMathToggle.setAttribute('aria-label', 'Open math symbols');
    }
    trialGate.style.display = '';

    // Conversion hook: surface the XP earned this session above the message.
    if (trialXpTotal > 0 && trialGateMsg && trialGateMsg.parentNode) {
      var xpBanner = document.getElementById('lp-trial-gate-xp');
      if (!xpBanner) {
        xpBanner = document.createElement('div');
        xpBanner.id = 'lp-trial-gate-xp';
        xpBanner.className = 'lp-trial-gate-xp';
        trialGateMsg.parentNode.insertBefore(xpBanner, trialGateMsg);
      }
      xpBanner.innerHTML = '<span class="lp-trial-gate-bolt" aria-hidden="true">⚡</span> You earned <strong>' +
        trialXpTotal + ' XP</strong> this session — keep it going.';
    }

    // Set tutor-voice gate message
    var msg = GATE_MESSAGES[selectedTutorId] || "We're just getting to the good part — let's keep going.";
    trialGateMsg.textContent = msg;

    // The signup links stay plain /signup.html on purpose. They used to carry
    // ?trial_tutor=, which pre-set selectedTutorId server-side and thereby SKIPPED
    // pick-tutor.html — so a visitor would silently inherit the one preview tutor
    // they never chose. The transcript now rides the server session instead
    // (routes/trialChat.js appendTrialTranscript), so the URL has nothing to carry.
  }

  /* ── Session Carryover (localStorage) ────────────── */
  var TRIAL_STORAGE_KEY = 'mathmatix_trial_chat';

  function saveTrialState() {
    try {
      localStorage.setItem(TRIAL_STORAGE_KEY, JSON.stringify({
        tutorId: selectedTutorId,
        history: chatHistory,
        turnCount: clientTurnCount,
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

  /* The animated chat preview was removed with its section. */

  /* The role-selector tabs were removed with their section: the homepage speaks
     to parents, and the student and teacher pitches live on their own pages. */

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
