/* ============================================================
   chat-redesign.js
   Activates the redesigned chat shell. Responsibilities:
   - Swap the tutor hero portrait + backdrop when the selected
     tutor changes (Maya, Bob, Mr. Nappier, Ms. Maria have
     bespoke backdrops; everyone else gets a default).
   - Keep the "Live with <tutor>" badge in sync.
   - Wire the quick-action chips (Upload, Practice, Test, More)
     to existing triggers in the page.
   - Drive the streak pill in the header.
   ============================================================ */

(function () {
  'use strict';

  // Tutors that ship with a custom backdrop asset.
  const TUTORS_WITH_BACKDROP = new Set(['maya', 'bob', 'mr-nappier', 'ms-maria']);

  // Tutors whose backdrop gets a depth-of-field blur so the portrait reads
  // cleanly. Maya's backdrop is already soft, so she's left sharp.
  const BLUR_BACKDROP = new Set(['bob', 'mr-nappier', 'ms-maria']);

  // Preferred "new" hero portraits when available.
  // The standard avatar PNG is the fallback.
  const HERO_PORTRAIT_OVERRIDES = {
    'maya': 'maya-new2.png',
    'bob': 'bob-new2.png',
    'mr-nappier': 'mr-nappier-new2.png',
    'ms-maria': 'ms-maria-new2.png'
  };

  const DEFAULT_BACKDROP = '/images/tutor_avatars/maya-backdrop.png';

  // Idle animation frames per core tutor. The hero portrait frame-swaps to
  // these so the poster feels alive. `blink` is a brief eyes-closed frame;
  // `glance` is a slower look toward the chat. A tutor missing a frame just
  // skips that beat.
  const ANIM_FRAMES = {
    'maya':       { blink: 'maya-blink.png',       glance: 'maya-look-left.png' },
    'bob':        { blink: 'bob-blink.png',        glance: 'bob-look-left.png' },
    'ms-maria':   { blink: 'ms-maria-blink.png',   glance: 'ms-maria-look-left.png' },
    'mr-nappier': { blink: 'mr-nappier-blink.png', glance: 'mr-nappier-look-left.png' }
  };

  const PREFERS_REDUCED_MOTION = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function imgSrc(file) { return '/images/tutor_avatars/' + file; }

  // Shared so other scripts (e.g. chat message avatars) render the same
  // "new" hero portrait as this poster instead of the legacy avatar PNG.
  window.getTutorPortraitSrc = function (tutorId) {
    const tutor = (window.TUTOR_CONFIG || {})[tutorId];
    const file = HERO_PORTRAIT_OVERRIDES[tutorId] || (tutor && tutor.image);
    return file ? imgSrc(file) : null;
  };

  function getTutorConfig(tutorId) {
    const cfg = (window.TUTOR_CONFIG || {});
    return cfg[tutorId] || cfg['default'] || null;
  }

  // --- Idle poster animation --------------------------------------------
  // One animation loop runs at a time, owned by `posterAnim`. Swapping the
  // tutor stops the old loop and starts a fresh one. Frames are preloaded
  // so swaps are instant (cached) with no flash.

  let posterAnim = null;

  // Stop is only ever called by startPosterAnimation, and applyTutor always
  // sets the correct portrait src before that — so we just kill the loop
  // and leave the src alone (restoring it here would clobber a tutor swap).
  function stopPosterAnimation() {
    if (!posterAnim) return;
    posterAnim.alive = false;
    posterAnim.timers.forEach(clearTimeout);
    posterAnim = null;
  }

  function startPosterAnimation(tutorId) {
    stopPosterAnimation();
    if (PREFERS_REDUCED_MOTION) return;

    // 'default' renders as Mr. Nappier — borrow his frames.
    const frames = ANIM_FRAMES[tutorId] ||
      (tutorId === 'default' ? ANIM_FRAMES['mr-nappier'] : null);
    if (!frames) return; // non-core tutor — static poster

    const img = document.getElementById('cr-tutor-portrait');
    if (!img) return;

    const anim = { alive: true, baseSrc: img.src, timers: [], ready: {}, busy: false };
    posterAnim = anim;

    // Preload frames; a beat only fires once its frame has loaded.
    Object.keys(frames).forEach(function (key) {
      const pre = new Image();
      pre.onload = function () { anim.ready[key] = pre.src; };
      pre.src = imgSrc(frames[key]);
    });

    const live = function () {
      return posterAnim === anim && anim.alive &&
        document.getElementById('cr-tutor-portrait') === img;
    };
    const wait = function (ms, fn) {
      const t = setTimeout(function () {
        anim.timers = anim.timers.filter(function (x) { return x !== t; });
        if (live()) fn();
      }, ms);
      anim.timers.push(t);
    };
    const rand = function (lo, hi) { return lo + Math.random() * (hi - lo); };
    const swap = function (src) { if (live()) img.src = src; };
    const reset = function () { if (live()) img.src = anim.baseSrc; };

    function scheduleBlink() { wait(rand(3400, 7600), blink); }
    function blink() {
      if (anim.busy || !anim.ready.blink) return scheduleBlink();
      anim.busy = true;
      swap(anim.ready.blink);
      wait(110, function () {
        reset();
        if (Math.random() < 0.3) {
          // occasional natural double-blink
          wait(150, function () {
            swap(anim.ready.blink);
            wait(110, function () { reset(); anim.busy = false; scheduleBlink(); });
          });
        } else {
          anim.busy = false;
          scheduleBlink();
        }
      });
    }

    function scheduleGlance() { wait(rand(15000, 32000), glance); }
    function glance() {
      if (anim.busy || !anim.ready.glance) return scheduleGlance();
      anim.busy = true;
      swap(anim.ready.glance);
      wait(rand(1000, 1600), function () {
        reset();
        anim.busy = false;
        scheduleGlance();
      });
    }

    if (frames.blink) scheduleBlink();
    if (frames.glance) scheduleGlance();
  }

  function applyTutor(tutorId) {
    const tutor = getTutorConfig(tutorId);
    if (!tutor) return;

    const heroImg = document.getElementById('cr-tutor-portrait');
    const backdrop = document.querySelector('.cr-tutor-backdrop');
    const nameEl = document.getElementById('cr-tutor-name');

    // Portrait: prefer the "new2" hero if present for one of the 4
    const heroFile = HERO_PORTRAIT_OVERRIDES[tutorId] || tutor.image;
    if (heroImg && heroFile) {
      heroImg.src = imgSrc(heroFile);
      heroImg.alt = tutor.name || 'Tutor';
    }

    // Backdrop: bespoke for the 4 tutors, default otherwise
    if (backdrop) {
      const url = TUTORS_WITH_BACKDROP.has(tutorId)
        ? imgSrc(tutorId + '-backdrop.png')
        : DEFAULT_BACKDROP;
      backdrop.style.backgroundImage = 'url("' + url + '")';
      backdrop.classList.toggle('cr-backdrop-blur', BLUR_BACKDROP.has(tutorId));
    }

    // Live-with label — full name, so titled tutors read "Mr. Nappier"
    // rather than being truncated to just "Mr.".
    if (nameEl) nameEl.textContent = (tutor.name || 'Tutor');

    // Bring the poster to life with idle micro-animation.
    startPosterAnimation(tutorId);
  }

  // Wait for window.TUTOR_CONFIG AND user data (which lives in the
  // closure-scoped currentUser of script.js). We don't have direct
  // access, so we fetch /user ourselves — cheap and avoids coupling.
  async function loadCurrentTutorId() {
    try {
      const res = await fetch('/user', { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.user?.selectedTutorId || null;
    } catch (_) {
      return null;
    }
  }

  function waitForTutorConfig(ms = 5000) {
    return new Promise(function (resolve) {
      const start = Date.now();
      (function tick() {
        if (window.TUTOR_CONFIG) return resolve(true);
        if (Date.now() - start > ms) return resolve(false);
        setTimeout(tick, 50);
      })();
    });
  }

  // Remember the last tutor so the poster paints instantly on the next
  // load instead of flashing the hard-coded default portrait (Maya).
  const TUTOR_CACHE_KEY = 'mathmatix_last_tutor';
  function readCachedTutorId() {
    try { return localStorage.getItem(TUTOR_CACHE_KEY); } catch (_) { return null; }
  }
  function cacheTutorId(id) {
    try { if (id) localStorage.setItem(TUTOR_CACHE_KEY, id); } catch (_) { /* storage unavailable */ }
  }

  async function init() {
    await waitForTutorConfig();

    // Paint the last-known tutor immediately — avoids a flash of the
    // hard-coded default poster while /user is still in flight.
    const cached = readCachedTutorId();
    if (cached) applyTutor(cached);

    // Confirm against the server; re-apply only if it actually differs.
    const tutorId = await loadCurrentTutorId();
    if (tutorId) {
      if (tutorId !== cached) applyTutor(tutorId);
      cacheTutorId(tutorId);
    } else if (!cached) {
      applyTutor('default');
    }

    wireQuickActions();
    wireStreakPill();
    wireProgressButton();
    wireMicButton();
  }

  // --- Quick action chips ------------------------------------------------

  function wireQuickActions() {
    document.querySelectorAll('.cr-qa-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const action = btn.getAttribute('data-action');
        handleQuickAction(action);
      });
    });
  }

  function handleQuickAction(action) {
    switch (action) {
      case 'upload': {
        // Trigger the existing attach flow
        const attach = document.getElementById('attach-button') || document.getElementById('hero-upload-btn');
        if (attach) attach.click();
        else document.getElementById('file-input')?.click();
        break;
      }
      case 'practice': {
        const btn = document.getElementById('sidebar-practice-pack-btn');
        if (btn) return btn.click();
        // Fallback: send a canned prompt to the chat
        seedComposer('I want to practice a skill.');
        break;
      }
      case 'test': {
        seedComposer('Help me prep for a test.');
        break;
      }
      case 'more': {
        const menu = document.getElementById('header-dropdown-menu');
        if (menu) menu.classList.toggle('is-open');
        else document.getElementById('more-tools-btn')?.click();
        break;
      }
    }
  }

  function seedComposer(text) {
    const input = document.getElementById('user-input');
    if (!input) return;
    input.focus();
    input.textContent = text;
    // Trigger input event so any auto-grow / state listeners fire
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // --- Streak pill -------------------------------------------------------

  function wireStreakPill() {
    // The page sets gamification stats on #msb-streak / #drawer-streak-count.
    // We mirror those into the new pill via MutationObserver.
    const target = document.getElementById('msb-streak') || document.getElementById('drawer-streak-count');
    const pillValue = document.getElementById('cr-streak-value');
    const pill = document.getElementById('cr-streak-pill');
    if (!pillValue) return;

    // Reframe the pill based on streak length:
    //   0 days  → "Start your streak"  (no flame; dispirited "0 day streak" was the original UI bug)
    //   1 day   → "1 day streak"       (flame on)
    //   2+ days → "N day streak"       (flame on; existing copy)
    // Sets data-streak so CSS can dim the flame at 0 without
    // shipping new icons.
    const sync = function () {
      const raw = (target?.textContent || '0').trim();
      const n = parseInt(raw, 10) || 0;
      if (n <= 0) {
        pillValue.textContent = 'Start your streak';
      } else if (n === 1) {
        pillValue.textContent = '1 day streak';
      } else {
        pillValue.textContent = n + ' day streak';
      }
      if (pill) pill.setAttribute('data-streak', String(n));
    };

    sync();
    if (target) {
      new MutationObserver(sync).observe(target, { childList: true, characterData: true, subtree: true });
    }
  }

  // --- Progress button --------------------------------------------------

  function wireProgressButton() {
    const btn = document.getElementById('cr-progress-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      // Open the existing right drawer (Progress & Profile)
      document.getElementById('right-drawer-toggle')?.click();
    });
  }

  // --- Big mic button (left of composer) --------------------------------

  function wireMicButton() {
    const btn = document.getElementById('cr-mic-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      // Delegate to the existing tiny mic in the toolbar
      document.getElementById('mic-button')?.click();
    });
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
