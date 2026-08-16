/**
 * Mobile bottom navigation — 💬 Tutor · 🎓 Courses · 🎯 Practice · 📈 Progress · ☰ More.
 *
 * Phone-only (≤768px; wider viewports hide it in CSS) and flag-gated via
 * MM_FEATURES.bottomNav. Owner-approved design (2026-08-13 mockup): tabs are
 * LAUNCHERS for surfaces chat.html already has, not SPA routes —
 *   Tutor    → home: closes whatever surface is open, back to the conversation
 *   Courses  → the course-catalog bottom sheet (#browse-courses-btn)
 *   Practice → a small sheet of existing practice entry points
 *   Progress → the status card (#cr-progress-btn)
 *   More     → the more-tools menu (#more-tools-btn)
 *
 * Two rules keep it out of the way:
 *   - The composer owns the bottom edge: the nav slides away while the chat
 *     input is focused (i.e. while the keyboard is up) and returns on blur.
 *   - Voice mode owns the whole screen: body.cr-voice hides the nav entirely.
 *
 * Active-tab state is synced by a light poll rather than MutationObservers —
 * two of the surfaces are created lazily, so observing them at load isn't
 * possible without watching the whole body subtree.
 */
(function () {
  'use strict';

  if (!window.MM_FEATURES || !window.MM_FEATURES.bottomNav) return;

  var CSS = [
    '.mbn{position:fixed;left:0;right:0;bottom:0;z-index:9000;display:flex;',
    'background:var(--cr-bg-panel,#fff);border-top:1px solid rgba(120,110,160,.18);',
    'padding:5px 6px calc(5px + env(safe-area-inset-bottom,0px));',
    'transition:transform .22s ease;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
    '.mbn.mbn-away{transform:translateY(110%)}',
    'body.cr-voice .mbn{display:none}',
    '@media (min-width:769px){.mbn{display:none}}',
    '@media (prefers-reduced-motion:reduce){.mbn{transition:none}}',
    // Inactive tabs were #7B729D label text on a transparent ground, which is
    // low enough contrast that the row read as decoration. Darker ink, and the
    // press/active states get a real surface so a tap lands somewhere visible.
    '.mbn-tab{flex:1;border:0;background:transparent;color:#635B87;font-family:inherit;',
    'font-size:10.5px;font-weight:700;display:flex;flex-direction:column;align-items:center;gap:2px;',
    'padding:5px 0 3px;cursor:pointer;border-radius:12px;position:relative;min-height:48px;',
    // overflow:hidden clips the .on marker to the pill's rounded top edge —
    // without it the bar floats free above the tint and reads as a stray line.
    'overflow:hidden;transition:background-color .12s ease,color .12s ease,transform .12s ease}',
    '.mbn-tab .mbn-ico{font-size:21px;line-height:1.15}',
    '.mbn-tab:active{transform:scale(.94);background:rgba(106,90,205,.09)}',
    // Active tab: stronger tint + a top marker so the current surface is
    // readable at a glance rather than a faint wash behind one label.
    '.mbn-tab.on{color:#5A49C4;background:rgba(106,90,205,.14)}',
    '.mbn-tab.on::before{content:"";position:absolute;top:0;left:50%;transform:translateX(-50%);',
    'width:22px;height:3px;border-radius:0 0 3px 3px;background:#6a5acd}',
    '.mbn-tab:focus-visible{outline:2px solid #667eea;outline-offset:1px}',
    '[data-theme="dark"] .mbn{background:#1C1A2B;border-top-color:rgba(236,233,247,.10)}',
    '[data-theme="dark"] .mbn-tab{color:#A7A0C4}',
    '[data-theme="dark"] .mbn-tab.on{color:#c4b5ff;background:rgba(154,128,255,.18)}',
    '[data-theme="dark"] .mbn-tab.on::before{background:#b9a8ff}',
    // Make room above the nav so the composer is never covered. --mm-nav-h is
    // the nav's MEASURED height (see publishNavHeight), so this reserves exactly
    // what the nav occupies and nothing more — and collapses to 0 on its own
    // wherever the nav isn't rendered (desktop, voice mode, keyboard-up).
    //
    // It used to reserve two different amounts at once: margin-bottom said 64px,
    // max-height said 130px. max-height won, so the composer floated 130px up
    // from the bottom edge over a nav only ~60px tall, leaving a ~70px dead band
    // across the bottom of every phone.
    //
    // Phone-scoped on purpose: above the breakpoint the nav is display:none and
    // chat-redesign.css's own `margin-bottom:60px` clears the fixed desktop
    // footer, so this must not reach that far. The `.cr-mode` in the selector
    // is also load-bearing — it outranks mobile-poster-chat.css's
    // `body.cr-mode #chat-container { margin: 0 !important }`, which would
    // otherwise tie and cancel the reservation.
    '@media (max-width:768px){body.mbn-space.cr-mode #chat-container{',
    'margin-bottom:var(--mm-nav-h,0px) !important}}',
    // Practice sheet
    '.mbn-sheet{position:fixed;left:0;right:0;bottom:0;z-index:8999;background:var(--cr-bg-panel,#fff);',
    'border-radius:16px 16px 0 0;box-shadow:0 -12px 40px rgba(20,15,45,.25);',
    'padding:14px 16px calc(72px + env(safe-area-inset-bottom,0px));transform:translateY(105%);transition:transform .25s ease}',
    '.mbn-sheet.open{transform:none}',
    '@media (min-width:769px){.mbn-sheet{display:none}}',
    '@media (prefers-reduced-motion:reduce){.mbn-sheet{transition:none}}',
    '[data-theme="dark"] .mbn-sheet{background:#1C1A2B;color:#ECE9F7}',
    '.mbn-sheet h3{margin:2px 2px 10px;font-size:16px}',
    '.mbn-act{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:transparent;',
    'border:1px solid rgba(120,110,160,.18);border-radius:14px;padding:13px 14px;font-family:inherit;',
    'font-size:14px;font-weight:600;color:inherit;cursor:pointer;margin-bottom:8px}',
    '.mbn-act:disabled{opacity:.45;cursor:default}',
    '.mbn-act .d{display:block;font-size:11.5px;font-weight:500;color:#7B729D;margin-top:2px}',
  ].join('');

  // BREAKPOINT: 768px, matching the mobile poster shell (mobile-poster-chat.css
  // and mobile-light-theme.css are both `max-width: 768px`).
  //
  // It used to be 900px, which put this phone nav on top of the DESKTOP stage
  // for 769–900px — iPad portrait is 820px, squarely inside that band. The stage
  // is not a fixed-height shell, and body/#app-layout-wrapper are overflow:hidden,
  // so the fixed nav simply covered the bottom of the composer with no way to
  // scroll to it: measured at 820x1180, the composer ran 1038→1192 under a nav
  // starting at 1121. Part of the input was unreachable.
  //
  // Aligning the two means a viewport either gets the phone shell AND the phone
  // nav, or neither. If the nav is ever wanted back on tablets, the fix is to
  // extend the mobile shell to the same width — not to widen this alone.
  var TABS = [
    { key: 'tutor', ico: '💬', label: 'Tutor' },
    { key: 'courses', ico: '🎓', label: 'Courses' },
    { key: 'practice', ico: '🎯', label: 'Practice' },
    { key: 'progress', ico: '📈', label: 'Progress' },
    { key: 'more', ico: '☰', label: 'More' },
  ];

  var nav, sheet;

  function build() {
    var style = document.createElement('style');
    style.id = 'mbn-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    nav = document.createElement('nav');
    nav.className = 'mbn';
    nav.setAttribute('aria-label', 'Main');
    nav.innerHTML = TABS.map(function (t) {
      return '<button class="mbn-tab" data-key="' + t.key + '" type="button">' +
        '<span class="mbn-ico" aria-hidden="true">' + t.ico + '</span>' + t.label + '</button>';
    }).join('');
    document.body.appendChild(nav);

    sheet = document.createElement('div');
    sheet.className = 'mbn-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Practice');
    sheet.innerHTML =
      '<h3>🎯 Practice</h3>' +
      '<button class="mbn-act" id="mbn-warmup" type="button">🔁 Review warm-up<span class="d">Quick spaced review of skills coming due</span></button>' +
      '<button class="mbn-act" id="mbn-acttest" type="button">📝 ACT practice test<span class="d">Full timed section · all-new questions</span></button>';
    document.body.appendChild(sheet);

    document.body.classList.add('mbn-space');
    wire();
  }

  function closeSheet() { sheet.classList.remove('open'); }

  // Close whatever tab-surface is open, returning to the conversation.
  function goHome() {
    closeSheet();
    var catalog = document.getElementById('course-catalog-modal');
    if (catalog && catalog.classList.contains('is-visible') && window.courseManager) {
      window.courseManager.closeCatalog();
    }
    var sc = document.getElementById('status-card-modal');
    if (sc && !sc.hidden) {
      var x = sc.querySelector('[data-sc-close]');
      if (x) x.click();
    }
    var menu = document.getElementById('more-tools-menu');
    if (menu && menu.classList.contains('active')) {
      var mx = document.getElementById('close-more-tools');
      if (mx) mx.click();
    }
  }

  function wire() {
    nav.addEventListener('click', function (e) {
      var tab = e.target.closest('.mbn-tab');
      if (!tab) return;
      var key = tab.getAttribute('data-key');
      // Every destination starts from home so surfaces never stack.
      goHome();
      if (key === 'courses') {
        var b = document.getElementById('browse-courses-btn');
        if (b) b.click();
      } else if (key === 'practice') {
        sheet.classList.add('open');
      } else if (key === 'progress') {
        var p = document.getElementById('cr-progress-btn');
        if (p) p.click();
      } else if (key === 'more') {
        var m = document.getElementById('more-tools-btn');
        if (m) m.click();
      }
      syncActive();
    });

    var warmup = sheet.querySelector('#mbn-warmup');
    warmup.addEventListener('click', function () {
      closeSheet();
      if (window.floatingReview) {
        Promise.resolve(window.floatingReview.open())
          .catch(function (err) { console.error('[bottom-nav] warm-up open failed', err); });
      }
    });
    var acttest = sheet.querySelector('#mbn-acttest');
    acttest.addEventListener('click', function () {
      closeSheet();
      if (window.openActTest) window.openActTest();
    });

    // The composer owns the bottom edge: hide while the student is typing.
    // focusout fires before focusin on refocus taps, so restore on a short
    // delay and cancel it if focus lands back in the input.
    var input = document.getElementById('user-input') || document.getElementById('chat-input');
    var showTimer = null;
    if (input) {
      input.addEventListener('focusin', function () {
        if (showTimer) { clearTimeout(showTimer); showTimer = null; }
        nav.classList.add('mbn-away');
      });
      input.addEventListener('focusout', function () {
        showTimer = setTimeout(function () { nav.classList.remove('mbn-away'); }, 180);
      });
    }

    publishNavHeight();
    if (window.ResizeObserver) new ResizeObserver(publishNavHeight).observe(nav);
    window.addEventListener('resize', publishNavHeight);
    window.addEventListener('orientationchange', publishNavHeight);

    // Active-tab poll (see header note for why not MutationObserver).
    setInterval(syncActive, 400);
    syncActive();
  }

  /**
   * Publish the nav's occupied height as --mm-nav-h on <html>.
   *
   * Everything that has to sit above the nav — the chat container, the
   * workspace FAB, the idle greeting — reads this instead of carrying its own
   * hardcoded guess at the nav's height. Those guesses (60px / 64px / 130px /
   * 92px, across four files) are what drifted apart into the overlap and
   * dead-space bugs; one measured value cannot drift from itself.
   *
   * The border box is what's measured, so the safe-area padding is already
   * inside the number — callers must NOT add env(safe-area-inset-bottom) on
   * top. Where the nav is display:none (>768px, voice mode) the rect
   * collapses to 0 and every consumer reverts to no reservation on its own.
   *
   * .mbn-away is deliberately NOT treated as zero. The nav only slides out
   * while the on-screen keyboard is up, and a fixed-position composer doesn't
   * move with the iOS keyboard anyway — releasing the space there would push
   * the composer 60px further under it for no gain.
   */
  function publishNavHeight() {
    var h = nav ? nav.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--mm-nav-h', h + 'px');
  }

  function surfaceOpen() {
    var catalog = document.getElementById('course-catalog-modal');
    if (catalog && catalog.classList.contains('is-visible')) return 'courses';
    if (sheet && sheet.classList.contains('open')) return 'practice';
    var sc = document.getElementById('status-card-modal');
    if (sc && !sc.hidden) return 'progress';
    var menu = document.getElementById('more-tools-menu');
    if (menu && menu.classList.contains('active')) return 'more';
    return 'tutor';
  }

  function syncActive() {
    var cur = surfaceOpen();
    nav.querySelectorAll('.mbn-tab').forEach(function (t) {
      t.classList.toggle('on', t.getAttribute('data-key') === cur);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
