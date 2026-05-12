/* public/js/onboarding.js — Voice-first intent capture
 *
 * Flow:
 *   1. Ask "What brings you to Mathmatix today?" (open-ended).
 *   2. Capture via Web Speech API (preferred) with low-pressure typing fallback.
 *   3. Infer a category client-side; server re-validates and stores authoritative.
 *   4. Show a warm role-aware response, then continue to the existing flow
 *      (complete-profile / pick-tutor / dashboard).
 *
 * If the user is anonymous, the answer is stored in localStorage under
 * `mathmatix.pendingOnboardingIntent` and attached after signup/login by
 * the post-auth bootstrap snippet (see attachPendingIntent in script.js).
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'mathmatix.pendingOnboardingIntent';

  // --- Intent inference (mirrors server-side logic in routes/onboarding.js) ---
  function inferIntent(rawText) {
    if (!rawText) return 'unknown';
    const t = String(rawText).toLowerCase();

    if (/\b(teacher|teach my|my class|my students|classroom|professor|educator|i teach)\b/.test(t)) return 'teacher_exploring';
    if (/\b(parent|mom|dad|mother|father|my (kid|son|daughter|child|children))\b|\bhelp my (kid|son|daughter|child)\b/.test(t)) return 'parent_support';
    if (/\b(act\b|\bsat\b|act prep|sat prep|standardized test|admissions test)\b/.test(t)) return 'act_sat_prep';
    if (/\b(test|quiz|exam|final|midterm|state test|benchmark)\b/.test(t)) return 'student_test_prep';
    if (/\b(homework|assignment|problem set|worksheet|due tomorrow|due tonight)\b/.test(t)) return 'student_homework';
    if (/(bad at math|failing|struggling|confused|don'?t (get|understand)|stuck on|hate math|behind in math|rusty)/.test(t)) return 'general_math_help';
    if (/(check(ing)? (it|this) out|just (looking|curious|exploring|seeing|trying|browsing)|see what (this|it) is|trying it out|poke around)/.test(t)) return 'just_exploring';
    return 'unknown';
  }

  const WARM_RESPONSES = {
    teacher_exploring:  "Perfect. I’ll show you what the student experience feels like first.",
    parent_support:     "That’s a great reason to be here. We can help you feel less rusty.",
    student_homework:   "Got it. We’ll work through it without just giving answers.",
    student_test_prep:  "Got it. We’ll focus on speed, accuracy, and patterns.",
    act_sat_prep:       "Got it. We’ll focus on speed, accuracy, and patterns.",
    general_math_help:  "Thanks for being honest. We’ll start where it makes sense and build from there.",
    just_exploring:     "Cool. Take your time poking around — I’ll be here.",
    unknown:            "Got it. I’ll use that to help decide where we start."
  };

  // ---- Element refs ----
  const $ = (id) => document.getElementById(id);
  const stage1     = $('onboarding-stage1');
  const stage2     = $('onboarding-stage2');
  const stageDob   = $('onboarding-stage-dob');
  const stageCoppa = $('onboarding-stage-coppa');
  const stageTeen  = $('onboarding-stage-teen');
  const micBtn     = $('onboarding-mic-btn');
  const micHint    = $('onboarding-mic-hint');
  const typingToggle = $('onboarding-typing-toggle');
  const answerBox  = $('onboarding-answer-box');
  const textarea   = $('onboarding-textarea');
  const submitBtn  = $('onboarding-submit');
  const skipBtn    = $('onboarding-skip');
  const statusEl   = $('onboarding-status');
  const responseEl = $('onboarding-response-text');
  const continueBtn = $('onboarding-continue');
  const tutorAvatar = $('onboarding-tutor-avatar');

  // DOB stage
  const dobInput      = $('onboarding-dob');
  const dobSubmitBtn  = $('onboarding-dob-submit');
  const dobStatus     = $('onboarding-dob-status');

  // COPPA (<13) stage
  const coppaCode     = $('onboarding-coppa-code');
  const coppaLinkBtn  = $('onboarding-coppa-link');
  const coppaStatus   = $('onboarding-coppa-status');

  // Teen (13-17) stage
  const teenEmail     = $('onboarding-teen-email');
  const teenSendBtn   = $('onboarding-teen-send');
  const teenCode      = $('onboarding-teen-code');
  const teenLinkBtn   = $('onboarding-teen-link');
  const teenStatus    = $('onboarding-teen-status');

  // Working state — populated from the server after intent save.
  let pendingCategory = 'unknown';
  let pendingRedirect = '/chat.html';

  // ---- Speech recognition setup (feature-detected) ----
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isRecognizing = false;
  let interimText = '';
  let finalText = '';

  if (SpeechRecognition) {
    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = (navigator.language || 'en-US');
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        interimText = interim;
        const combined = (finalText + ' ' + interim).trim();
        textarea.value = combined;
        updateSubmitState();
      };

      recognition.onerror = (e) => {
        // Don't block the user — graceful fallback to typing.
        console.warn('[onboarding] speech recognition error:', e.error);
        stopListening();
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          showStatus('Mic blocked — you can type your answer below.', false);
          revealTypingUI(true);
        } else if (e.error === 'no-speech') {
          showStatus('Didn’t catch that — tap the mic and try again, or type instead.', false);
        } else if (e.error === 'network') {
          showStatus('Voice is offline right now. Typing works just as well.', false);
          revealTypingUI(true);
        }
      };

      recognition.onend = () => {
        isRecognizing = false;
        micBtn.classList.remove('recording');
        micBtn.setAttribute('aria-pressed', 'false');
        micHint.textContent = textarea.value.trim()
          ? 'Tap the mic to add more, or tap Continue.'
          : 'Tap the mic when you’re ready.';
      };
    } catch (err) {
      console.warn('[onboarding] failed to init SpeechRecognition:', err);
      recognition = null;
    }
  }

  // ---- UI helpers ----
  function showStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('error', !!isError);
  }

  function updateSubmitState() {
    const hasText = textarea.value.trim().length > 0;
    submitBtn.disabled = !hasText;
  }

  function startListening() {
    if (!recognition || isRecognizing) return;
    finalText = textarea.value || ''; // preserve anything already typed
    if (finalText && !finalText.endsWith(' ')) finalText += ' ';
    try {
      recognition.start();
      isRecognizing = true;
      micBtn.classList.add('recording');
      micBtn.setAttribute('aria-pressed', 'true');
      micHint.textContent = 'Listening… tap again to stop.';
      showStatus('', false);
    } catch (err) {
      console.warn('[onboarding] start() failed:', err);
      // Could already be running; restart cleanly.
      try { recognition.stop(); } catch (_) {}
      isRecognizing = false;
    }
  }

  function stopListening() {
    if (!recognition || !isRecognizing) return;
    try { recognition.stop(); } catch (_) {}
    isRecognizing = false;
    micBtn.classList.remove('recording');
    micBtn.setAttribute('aria-pressed', 'false');
  }

  function revealTypingUI(focusIt) {
    answerBox.hidden = false;
    if (focusIt) {
      // Slight delay so the keyboard doesn't jump in immediately on mobile
      setTimeout(() => textarea.focus(), 50);
    }
  }

  // ---- CSRF-aware POST that does NOT trigger session-expired redirects.
  // We need to handle 401 ourselves (anonymous flow stores to localStorage).
  function readCsrfCookie() {
    const match = document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith('_csrf='));
    return match ? decodeURIComponent(match.slice('_csrf='.length)) : null;
  }
  async function postJson(url, body) {
    let token = readCsrfCookie();
    if (!token) {
      // Fetch a fresh token first to satisfy CSRF middleware
      try { await fetch('/api/csrf-token', { credentials: 'include' }); } catch (_) { /* noop */ }
      token = readCsrfCookie();
    }
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-CSRF-Token'] = token;
    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'include'
    });
  }

  // ---- Submit handler ----
  async function submitAnswer() {
    const intentText = (textarea.value || '').trim();
    if (!intentText) {
      showStatus('Type or say something first — even a few words help.', true);
      return;
    }
    stopListening();

    const intentCategory = inferIntent(intentText);
    const capturedVia = isRecognizing || finalText.trim().length > 0 ? 'voice' : 'text';

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    // Try to save server-side. If unauthenticated, persist to localStorage
    // so the post-auth bootstrap can attach it after signup/login.
    let serverResponse = null;
    try {
      const res = await postJson('/api/onboarding/intent', {
        intentText,
        intentCategory,
        capturedVia
      });

      if (res.status === 401) {
        // Anonymous flow — save locally and route to signup.
        saveLocally({ intentText, intentCategory, capturedVia });
        showWarmResponse(intentCategory, /* anon */ true);
        return;
      }

      if (!res.ok) {
        throw new Error('Save failed (' + res.status + ')');
      }
      serverResponse = await res.json();
    } catch (err) {
      console.warn('[onboarding] save error, falling back to local:', err);
      saveLocally({ intentText, intentCategory, capturedVia });
      showWarmResponse(intentCategory, /* anon */ true);
      return;
    }

    // Server returns the authoritative category + next redirect.
    pendingCategory = serverResponse.intentCategory || intentCategory;
    pendingRedirect = serverResponse.redirect || '/chat.html';
    advanceStage(serverResponse);
  }

  function saveLocally(payload) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...payload,
        capturedAt: new Date().toISOString()
      }));
    } catch (_) { /* storage disabled — best effort only */ }
  }

  // ---- Stage chaining ----
  // The server tells us which gate the user still needs to clear:
  // needsDob → ask DOB inline; then needsParentalConsent (under-13 → COPPA invite
  // code; 13-17 → email or invite code); then warm response.
  function hideAllStages() {
    [stage1, stageDob, stageCoppa, stageTeen, stage2].forEach(el => {
      if (!el) return;
      el.classList.remove('active', 'fade-out');
      el.hidden = true;
    });
  }
  function showStage(el) {
    if (!el) return;
    el.hidden = false;
    el.classList.add('active');
  }

  function advanceStage(serverState) {
    const s = serverState || {};
    hideAllStages();

    if (s.needsDob) {
      showStage(stageDob);
      // Cap the max date to today so users can't pick a future birthday.
      try { dobInput.max = new Date().toISOString().slice(0, 10); } catch (_) {}
      setTimeout(() => { try { dobInput.focus(); } catch (_) {} }, 50);
      return;
    }

    if (s.needsParentalConsent) {
      // Under-13 → COPPA invite code only (legally required, email alone is not
      // verifiable parental consent). 13-17 → parent email OR invite code.
      if (typeof s.age === 'number' && s.age < 13) {
        showStage(stageCoppa);
      } else {
        showStage(stageTeen);
      }
      return;
    }

    // Everything cleared → warm response.
    showWarmResponse(pendingCategory, false, pendingRedirect);
  }

  function showWarmResponse(category, isAnon, redirectUrl) {
    const text = WARM_RESPONSES[category] || WARM_RESPONSES.unknown;
    if (responseEl) responseEl.textContent = text;

    // Conversational bridge: only shown for anonymous visitors who still
    // need to create an account. Authenticated users already have one.
    const followup = document.getElementById('onboarding-followup');
    if (followup) followup.hidden = !isAnon;

    hideAllStages();
    showStage(stage2);

    if (isAnon) {
      continueBtn.textContent = 'Sure, let’s do it';
      continueBtn.dataset.redirect = '/signup.html';
    } else {
      continueBtn.textContent = 'Continue';
      continueBtn.dataset.redirect = redirectUrl || pendingRedirect || '/chat.html';
    }
  }

  // ---- DOB submit ----
  function setDobStatus(msg, isError) {
    if (!dobStatus) return;
    dobStatus.textContent = msg || '';
    dobStatus.classList.toggle('error', !!isError);
  }
  if (dobInput) {
    dobInput.addEventListener('input', () => {
      dobSubmitBtn.disabled = !dobInput.value;
    });
  }
  async function submitDob() {
    const value = (dobInput.value || '').trim();
    if (!value) {
      setDobStatus('Pick your birthday to keep going.', true);
      return;
    }
    dobSubmitBtn.disabled = true;
    dobSubmitBtn.textContent = 'Saving…';
    try {
      const res = await postJson('/api/onboarding/intent', {
        intentText: (textarea.value || '').trim(),
        intentCategory: pendingCategory,
        capturedVia: 'text',
        dateOfBirth: value
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || ('Save failed (' + res.status + ')'));
      }
      const data = await res.json();
      pendingRedirect = data.redirect || pendingRedirect;
      advanceStage(data);
    } catch (err) {
      console.warn('[onboarding] DOB save error:', err);
      setDobStatus(err.message || 'Couldn’t save that — try again.', true);
    } finally {
      dobSubmitBtn.disabled = false;
      dobSubmitBtn.textContent = 'Continue';
    }
  }

  // ---- Under-13 (COPPA) — parent invite code only ----
  function setCoppaStatus(msg, isError) {
    if (!coppaStatus) return;
    coppaStatus.textContent = msg || '';
    coppaStatus.classList.toggle('error', !!isError);
  }
  async function submitCoppaCode() {
    const code = (coppaCode.value || '').trim();
    if (!code) return setCoppaStatus('Enter your parent’s invite code.', true);
    coppaLinkBtn.disabled = true;
    coppaLinkBtn.textContent = 'Linking…';
    try {
      const res = await postJson('/api/student/link-to-parent', { parentInviteCode: code });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        return setCoppaStatus(data.message || 'That code didn’t work — double-check with your parent.', true);
      }
      setCoppaStatus('Linked! One sec…', false);
      const fin = await postJson('/api/onboarding/finalize', {});
      const finData = await fin.json().catch(() => ({}));
      pendingRedirect = finData.redirect || pendingRedirect;
      advanceStage({ needsDob: false, needsParentalConsent: false });
    } catch (err) {
      console.warn('[onboarding] coppa link error:', err);
      setCoppaStatus('Network hiccup — try again.', true);
    } finally {
      coppaLinkBtn.disabled = false;
      coppaLinkBtn.textContent = 'Link to parent';
    }
  }

  // ---- 13-17 — parent email OR invite code ----
  function setTeenStatus(msg, isError) {
    if (!teenStatus) return;
    teenStatus.textContent = msg || '';
    teenStatus.classList.toggle('error', !!isError);
  }
  async function submitTeenEmail() {
    const email = (teenEmail.value || '').trim();
    if (!email) return setTeenStatus('Enter your parent’s email.', true);
    teenSendBtn.disabled = true;
    teenSendBtn.textContent = 'Sending…';
    try {
      const res = await postJson('/api/consent/request-parent-email', { parentEmail: email });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        return setTeenStatus(data.message || 'Couldn’t send that — try again.', true);
      }
      setTeenStatus('Sent! We’ll let them know.', false);
      const fin = await postJson('/api/onboarding/finalize', {});
      const finData = await fin.json().catch(() => ({}));
      pendingRedirect = finData.redirect || pendingRedirect;
      advanceStage({ needsDob: false, needsParentalConsent: false });
    } catch (err) {
      console.warn('[onboarding] teen email error:', err);
      setTeenStatus('Network hiccup — try again.', true);
    } finally {
      teenSendBtn.disabled = false;
      teenSendBtn.textContent = 'Send verification email';
    }
  }
  async function submitTeenCode() {
    const code = (teenCode.value || '').trim();
    if (!code) return setTeenStatus('Enter your parent’s invite code.', true);
    teenLinkBtn.disabled = true;
    teenLinkBtn.textContent = 'Linking…';
    try {
      const res = await postJson('/api/student/link-to-parent', { parentInviteCode: code });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        return setTeenStatus(data.message || 'That code didn’t work — double-check with your parent.', true);
      }
      setTeenStatus('Linked!', false);
      const fin = await postJson('/api/onboarding/finalize', {});
      const finData = await fin.json().catch(() => ({}));
      pendingRedirect = finData.redirect || pendingRedirect;
      advanceStage({ needsDob: false, needsParentalConsent: false });
    } catch (err) {
      console.warn('[onboarding] teen link error:', err);
      setTeenStatus('Network hiccup — try again.', true);
    } finally {
      teenLinkBtn.disabled = false;
      teenLinkBtn.textContent = 'Link to parent';
    }
  }

  // ---- Wire up events ----
  function init() {
    // Mic feature-detect: hide mic + auto-reveal typing if not supported.
    if (!SpeechRecognition || !recognition) {
      if (micBtn) {
        micBtn.disabled = true;
        micBtn.title = 'Voice input is not supported in this browser';
      }
      if (micHint) micHint.textContent = 'Voice isn’t available here — go ahead and type your answer.';
      revealTypingUI(false);
    }

    if (micBtn) {
      micBtn.addEventListener('click', () => {
        if (!recognition) return revealTypingUI(true);
        if (isRecognizing) stopListening();
        else startListening();
      });
    }

    if (typingToggle) {
      typingToggle.addEventListener('click', (e) => {
        e.preventDefault();
        revealTypingUI(true);
      });
    }

    if (textarea) {
      textarea.addEventListener('input', updateSubmitState);
    }

    if (submitBtn) submitBtn.addEventListener('click', submitAnswer);

    // DOB + consent stage wiring (students only, gated by server response).
    if (dobSubmitBtn) dobSubmitBtn.addEventListener('click', submitDob);
    if (coppaLinkBtn) coppaLinkBtn.addEventListener('click', submitCoppaCode);
    if (teenSendBtn)  teenSendBtn.addEventListener('click', submitTeenEmail);
    if (teenLinkBtn)  teenLinkBtn.addEventListener('click', submitTeenCode);

    if (skipBtn) {
      skipBtn.addEventListener('click', async () => {
        // Skip = save an empty/unknown answer so we don't re-prompt.
        textarea.value = '';
        const res = await postJson('/api/onboarding/intent', {
          intentText: '',
          intentCategory: 'unknown',
          capturedVia: 'text'
        }).catch(() => null);

        if (res && res.ok) {
          const json = await res.json().catch(() => null);
          window.location.href = (json && json.redirect) || '/chat.html';
        } else {
          // Anonymous — just move to signup.
          window.location.href = '/signup.html';
        }
      });
    }

    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        const next = continueBtn.dataset.redirect || '/chat.html';
        window.location.href = next;
      });
    }

    // If a returning authenticated user lands here with onboarding already
    // done, send them on without making them re-answer. If they have a
    // pending anonymous answer in localStorage, attach it now and skip
    // straight to the warm response.
    fetch('/api/onboarding/status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(async (data) => {
        if (!data) return;

        if (data.authenticated && data.onboarding && data.onboarding.completed) {
          window.location.replace('/chat.html');
          return;
        }

        if (data.authenticated) {
          const pending = readPendingIntent();
          if (pending && (pending.intentText || '').trim()) {
            try {
              const res = await postJson('/api/onboarding/intent', {
                intentText:     pending.intentText,
                intentCategory: pending.intentCategory,
                capturedVia:    pending.capturedVia || 'text'
              });
              if (res.ok) {
                const json = await res.json().catch(() => ({}));
                clearPendingIntent();
                showWarmResponse(json.intentCategory || pending.intentCategory, false, json.redirect);
              }
            } catch (err) {
              console.warn('[onboarding] attach pending intent failed:', err);
            }
          }
        }
      })
      .catch(() => { /* non-fatal */ });
  }

  function readPendingIntent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function clearPendingIntent() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* noop */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
