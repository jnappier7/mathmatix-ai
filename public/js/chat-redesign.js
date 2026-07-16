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

  // Tutors with a refreshed celebration video — keep in sync with the
  // matching set in modules/gamification.js. Used here to decide whether
  // to preload the clip when the tutor swaps.
  const TUTORS_WITH_CELEBRATION_VIDEO = new Set(['bob', 'maya', 'mr-nappier', 'ms-maria']);

  // Cache-buster for /videos/* — prod caches static assets 7 days with no
  // hashing, so bump this whenever a clip is re-exported under the same name.
  const VIDEO_VERSION = '?v=20260715';

  // How many idle clips each tutor has on disk ({id}_idle.mp4, {id}_idle2.mp4).
  // Tutors not listed here (and reduced-motion users) keep the static
  // portrait + PNG micro-animation instead.
  const IDLE_VIDEO_COUNTS = {
    'bob': 2,
    'maya': 1,           // no maya_idle2 yet — single clip loops
    'mr-nappier': 2,
    'ms-maria': 2
  };

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

  // --- Idle video loop ----------------------------------------------------
  // The hero's "living" idle: two stacked <video> elements double-buffer so
  // a tutor's two idle clips alternate with a crossfade (single-clip tutors
  // just loop element A). The static PNG portrait stays underneath as the
  // loading frame and as the fallback wherever the loop doesn't run —
  // tutors with no clips, reduced-motion users, playback failure, and the
  // compact mobile hero. (The old PNG blink/look-left frame-swap idle was
  // removed once every core tutor had real idle clips.)

  let idleLoop = null;
  let idlePaused = false;

  // Phones (≤768) run the idle loop inside the docked tutor cam; the
  // 769–900 tablet band still shows the compact static banner, so only
  // that band skips video.
  const IDLE_SKIP_MQ = window.matchMedia &&
    window.matchMedia('(min-width: 769px) and (max-width: 900px)');
  const PHONE_MQ = window.matchMedia && window.matchMedia('(max-width: 768px)');

  function idleSrcFor(tutorId, n) {
    return '/videos/' + tutorId + '_idle' + (n > 1 ? n : '') + '.mp4' + VIDEO_VERSION;
  }

  // Pause without tearing down (pill state, hidden tab). Resume rejoins
  // the loop where it left off.
  function setIdlePaused(paused) {
    idlePaused = !!paused;
    if (!idleLoop) return;
    const el = idleLoop.els[idleLoop.cur];
    if (idlePaused) {
      el.pause();
    } else if (!document.hidden) {
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(function () { /* ignore */ });
    }
  }

  function stopIdleVideos() {
    if (!idleLoop) return;
    idleLoop.alive = false;
    idleLoop.els.forEach(function (el) {
      el.onended = null;
      el.onerror = null;
      el.classList.remove('is-showing');
      el.pause();
    });
    idleLoop = null;
  }

  function startIdleVideos(tutorId) {
    stopIdleVideos();
    if (PREFERS_REDUCED_MOTION) return false;
    // Tablet band shows the compact static banner — no video there.
    if (IDLE_SKIP_MQ && IDLE_SKIP_MQ.matches) return false;

    // 'default' renders as Mr. Nappier — borrow his clips.
    const id = IDLE_VIDEO_COUNTS[tutorId] ? tutorId :
      (tutorId === 'default' ? 'mr-nappier' : null);
    if (!id) return false;

    const a = document.getElementById('cr-tutor-idle-a');
    const b = document.getElementById('cr-tutor-idle-b');
    if (!a || !b) return false;

    const count = IDLE_VIDEO_COUNTS[id];
    const loop = { alive: true, tutorId: tutorId, els: [a, b], cur: 0 };
    idleLoop = loop;

    const fallback = function () {
      if (idleLoop !== loop || !loop.alive) return;
      stopIdleVideos(); // static portrait underneath takes over
    };

    const show = function (el) {
      if (idleLoop !== loop || !loop.alive) return;
      el.classList.add('is-showing');
      loop.els.forEach(function (other) {
        if (other !== el) other.classList.remove('is-showing');
      });
    };

    const playEl = function (el) {
      try { el.currentTime = 0; } catch (_) { /* not seekable yet */ }
      if (idlePaused) { show(el); return; } // pill state: hold the frame
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.then(function () { show(el); }).catch(fallback);
      } else {
        show(el);
      }
    };

    if (count === 1) {
      // Single clip: seamless native loop on element A; B stays idle.
      a.loop = true;
      a.onerror = fallback;
      if (!a.src || a.src.indexOf(idleSrcFor(id, 1)) === -1) a.src = idleSrcFor(id, 1);
      b.removeAttribute('src');
      playEl(a);
      return true;
    }

    // Two clips: A holds idle1, B holds idle2 (both buffering up front).
    // Whichever just ended hands off to the other; the 300ms CSS crossfade
    // masks the seam. Ordering: play the incoming clip first, only then
    // fade — so the swap shows motion, never a stalled first frame.
    loop.els.forEach(function (el, i) {
      el.loop = false;
      el.onerror = fallback;
      const want = idleSrcFor(id, i + 1);
      if (!el.src || el.src.indexOf(want) === -1) el.src = want;
      el.onended = function () {
        if (idleLoop !== loop || !loop.alive) return;
        loop.cur = (loop.cur + 1) % 2;
        playEl(loop.els[loop.cur]);
      };
    });
    playEl(a);
    return true;
  }

  // Battery: pause the active idle clip while the tab is hidden.
  document.addEventListener('visibilitychange', function () {
    if (!idleLoop) return;
    const el = idleLoop.els[idleLoop.cur];
    if (document.hidden || idlePaused) {
      el.pause();
    } else {
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(function () { /* ignore */ });
    }
  });

  // --- Mobile cam ⇄ pill presence -----------------------------------------
  // Phones dock the tutor as a small cam card above the thread. The moment
  // the kid starts typing (composer focus / keyboard up), presence steps
  // back: body.mm-tutor-pill collapses the cam to a "watching your work"
  // pill and pauses the idle video. Blur/keyboard-close expands it again.
  function wireMobileCamPill() {
    if (!PHONE_MQ) return;

    let pill = false;
    let blurTimer = null;

    const setPill = function (on) {
      if (on === pill) return;
      pill = on;
      document.body.classList.toggle('mm-tutor-pill', on);
      setIdlePaused(on);
    };

    const isComposer = function (el) {
      return !!(el && el.closest && el.closest('#input-container'));
    };

    document.addEventListener('focusin', function (e) {
      if (!PHONE_MQ.matches) return;
      if (isComposer(e.target)) {
        if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
        setPill(true);
      }
    });
    document.addEventListener('focusout', function (e) {
      if (!pill) return;
      // Grace period: toolbar taps blur the input for a beat — don't
      // bounce the cam open/closed mid-interaction.
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(function () {
        blurTimer = null;
        const active = document.activeElement;
        if (!isComposer(active)) setPill(false);
      }, 350);
    });

    // iOS: focus events can lag the keyboard — the visual viewport
    // shrinking is the ground truth.
    if (window.visualViewport) {
      const baseH = window.visualViewport.height;
      window.visualViewport.addEventListener('resize', function () {
        if (!PHONE_MQ.matches) return;
        const shrunk = window.visualViewport.height < baseH - 140;
        if (shrunk) setPill(true);
        else if (!isComposer(document.activeElement)) setPill(false);
      });
    }

    // Leaving phone width always restores the full presence.
    PHONE_MQ.addEventListener && PHONE_MQ.addEventListener('change', function (e) {
      if (!e.matches) setPill(false);
    });
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

    // Mobile pill mirrors the same identity.
    const pillAvatar = document.getElementById('mm-cam-pill-avatar');
    const pillLabel = document.getElementById('mm-cam-pill-label');
    if (pillAvatar && heroFile) pillAvatar.src = imgSrc(heroFile);
    if (pillLabel) pillLabel.textContent = (tutor.name || 'Your tutor') + ' is watching your work';

    // Bring the poster to life with the idle video loop (no-op → static
    // portrait for tutors without clips / reduced motion / mobile).
    startIdleVideos(tutorId);

    // Preload the celebration video silently so the level-up reveal is
    // instant — no fetch latency, no first-frame flash.
    preloadCelebrationVideo(tutorId);
  }

  // --- In-place level-up celebration ------------------------------------
  // The video lives in the same hero box as the portrait, preloaded and
  // paused at frame 0 with opacity:0. On level-up we call play() FIRST and
  // only fade the video in once it's actually rendering frames — so the
  // kid sees motion appear, never a swap.

  function celebrationSrcFor(tutorId) {
    return '/videos/' + tutorId + '_levelUp.mp4' + VIDEO_VERSION;
  }

  function preloadCelebrationVideo(tutorId) {
    const video = document.getElementById('cr-tutor-celebration-video');
    if (!video) return;
    if (!TUTORS_WITH_CELEBRATION_VIDEO.has(tutorId)) {
      // Free the previous tutor's clip so we don't leak it.
      if (video.src) { video.removeAttribute('src'); video.load(); }
      return;
    }
    const want = celebrationSrcFor(tutorId);
    // Already loaded for this tutor — leave it alone, currentTime stays at 0.
    if (video.src && video.src.endsWith(want)) return;
    video.src = want;
    // .load() kicks off the fetch; preload="auto" tells the browser to buffer.
    try { video.load(); } catch (_) { /* ignore */ }
  }

  window.playInPlaceCelebration = function (tutorId) {
    const video = document.getElementById('cr-tutor-celebration-video');
    const portrait = document.getElementById('cr-tutor-portrait');
    if (!video || !portrait || !tutorId) return false;

    // If preload didn't run (e.g. tutor never applied), wire the src now —
    // but the reveal will be slower because we have to wait for buffer.
    preloadCelebrationVideo(tutorId);

    stopIdleVideos();

    let restored = false;
    const restore = function () {
      if (restored) return;
      restored = true;
      video.classList.remove('is-playing');
      // Wait for the fade-out so the portrait reveal isn't a hard cut.
      // Keep the src loaded so the next celebration can play instantly;
      // just rewind to frame 0.
      setTimeout(function () {
        video.pause();
        try { video.currentTime = 0; } catch (_) { /* ignore */ }
        startIdleVideos(tutorId);
      }, 260);
    };

    video.addEventListener('ended', restore, { once: true });
    video.addEventListener('error', restore, { once: true });
    // Safety net so a stuck video never traps the portrait offscreen.
    setTimeout(restore, 10000);

    // Start playback first; only reveal once frames are actually decoding
    // so the fade-in masks motion, not a static first frame.
    const reveal = function () { video.classList.add('is-playing'); };
    const playPromise = video.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(function () {
        if (video.readyState >= 3) {
          reveal();
        } else {
          video.addEventListener('playing', reveal, { once: true });
        }
      }).catch(function () { restore(); });
    } else {
      reveal();
    }
    return true;
  };

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
    wireMobileCamPill();
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
      // Open the Personal Status Card modal (works on all viewports). Falls back
      // to the legacy mobile drawer if the module hasn't loaded yet.
      if (typeof window.openStatusCard === 'function') {
        window.openStatusCard();
      } else {
        document.getElementById('right-drawer-toggle')?.click();
      }
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
