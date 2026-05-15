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

  // Preferred "new" hero portraits when available.
  // The standard avatar PNG is the fallback.
  const HERO_PORTRAIT_OVERRIDES = {
    'maya': 'maya-new2.png',
    'bob': 'bob-new2.png',
    'mr-nappier': 'mrnappier-new2.png',
    'ms-maria': 'ms-maria_new.png'
  };

  const DEFAULT_BACKDROP = '/images/tutor_avatars/maya-backdrop.png';

  function imgSrc(file) { return '/images/tutor_avatars/' + file; }

  // Remembers the last resolved tutor so a returning user gets the correct
  // hero on first paint instead of the hardcoded Maya placeholder.
  const TUTOR_CACHE_KEY = 'mx_selected_tutor';
  function cachedTutorId() {
    try { return localStorage.getItem(TUTOR_CACHE_KEY) || null; }
    catch (_) { return null; }
  }
  function cacheTutorId(id) {
    try { if (id) localStorage.setItem(TUTOR_CACHE_KEY, id); }
    catch (_) {}
  }

  function getTutorConfig(tutorId) {
    const cfg = (window.TUTOR_CONFIG || {});
    return cfg[tutorId] || cfg['default'] || null;
  }

  function applyTutor(tutorId) {
    const tutor = getTutorConfig(tutorId);
    if (!tutor) return;

    const heroImg = document.getElementById('cr-tutor-portrait');
    const backdrop = document.querySelector('.cr-tutor-backdrop');
    const nameEl = document.getElementById('cr-tutor-name');
    const hintAvatar = document.getElementById('cr-hint-avatar');

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
    }

    // Live-with label
    if (nameEl) nameEl.textContent = (tutor.name || 'Tutor').split(' ')[0];

    // Small avatar in the hint card
    if (hintAvatar && tutor.image) {
      hintAvatar.src = imgSrc(tutor.image);
      hintAvatar.alt = tutor.name || '';
    }

    // Reveal the hero now that the correct tutor is in place.
    const hero = document.querySelector('.cr-tutor-hero');
    if (hero) hero.classList.add('cr-ready');
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

  async function init() {
    await waitForTutorConfig();

    wireQuickActions();
    wireStreakPill();
    wireProgressButton();
    wireUserAvatar();
    wireMicButton();

    // Apply the cached tutor immediately so returning users never see the
    // hardcoded Maya placeholder while the /user request is in flight.
    const cached = cachedTutorId();
    if (cached) applyTutor(cached);

    // Confirm against the server; correct the hero + refresh the cache if
    // the stored choice is stale or missing.
    const tutorId = await loadCurrentTutorId();
    if (tutorId) {
      if (tutorId !== cached) applyTutor(tutorId);
      cacheTutorId(tutorId);
    } else if (!cached) {
      applyTutor('default');
    }
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
    if (!pillValue) return;

    const sync = function () {
      const v = (target?.textContent || '0').trim();
      pillValue.textContent = v + ' day streak';
    };

    if (target) {
      sync();
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

  // --- User avatar (top right) ------------------------------------------

  function wireUserAvatar() {
    const el = document.getElementById('cr-user-avatar');
    if (!el) return;

    // Try to render the user's avatar from /user; otherwise the
    // initial letter is already in the markup as fallback.
    fetch('/user', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        const u = data?.user;
        if (!u) return;
        if (u.avatar?.dicebearUrl) {
          el.innerHTML = '<img src="' + u.avatar.dicebearUrl + '" alt="Me" />';
        } else if (u.firstName) {
          el.textContent = u.firstName.charAt(0).toUpperCase();
        }
      })
      .catch(function () { /* keep fallback */ });

    el.addEventListener('click', function () {
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
