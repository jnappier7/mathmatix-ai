/* ============================================================
   mobile-poster-chat.js
   Drives the mobile "poster-chat hybrid":
   - builds the readability scrim over the fixed tutor poster
   - builds floating top chrome (Live pill / streak / hamburger)
   - builds the idle greeting overlay
   - builds the hamburger bottom-sheet menu
   - toggles body.mpc-has-messages so the scrim deepens and the
     greeting fades once a conversation begins

   Additive only. Wires to existing buttons/IDs — never replaces
   chat send/receive, voice, upload or equation logic. Replaces
   the retired 4-tab mobile-chat-nav.js.
   ============================================================ */

(function () {
  'use strict';

  // Chat page only.
  if (!document.body.classList.contains('cr-mode')) return;
  if (!document.getElementById('chat-messages-container')) return;

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function trigger(id) {
    var t = document.getElementById(id);
    if (t) t.click();
  }

  /* ---- scrim --------------------------------------------------------- */
  // The scrim must live INSIDE the poster (.cr-tutor-hero), not as a body
  // sibling. mobile-fixes.css makes #app-layout-wrapper a z-index:1 stacking
  // context, which traps #chat-container's z-index — so a body-level scrim
  // paints OVER the chat instead of behind it. As a hero child it can only
  // ever darken the poster.
  function buildScrim() {
    if (document.querySelector('.mpc-scrim')) return;
    var host = document.querySelector('.cr-tutor-hero') || document.body;
    host.appendChild(el('div', 'mpc-scrim'));
  }

  /* ---- top chrome ---------------------------------------------------- */
  function buildTopbar() {
    if (document.getElementById('mpc-topbar')) return;
    var bar = el('nav', null,
      '<div class="mpc-live-pill">' +
        '<span class="mpc-live-dot"></span>' +
        '<span class="mpc-live-name">Live with Maya</span>' +
      '</div>' +
      '<div class="mpc-topbar-right">' +
        '<span class="mpc-streak" id="mpc-streak" style="display:none">' +
          '🔥 <span id="mpc-streak-value">0</span></span>' +
        '<button class="mpc-menu-btn" id="mpc-menu-btn" aria-label="Menu" aria-haspopup="true">' +
          '<i class="fas fa-bars"></i></button>' +
      '</div>');
    bar.id = 'mpc-topbar';
    bar.setAttribute('aria-label', 'Chat controls');
    document.body.appendChild(bar);

    document.getElementById('mpc-menu-btn')
      .addEventListener('click', openSheet);

    syncTutorName();
    syncStreak();
  }

  // Mirror the "Live with <tutor>" name from chat-redesign.js's #cr-tutor-name.
  function syncTutorName() {
    var src = document.getElementById('cr-tutor-name');
    var dst = document.querySelector('.mpc-live-name');
    if (!dst) return;
    var apply = function () {
      var name = (src && src.textContent || '').trim();
      if (name) dst.textContent = 'Live with ' + name;
    };
    apply();
    if (src) new MutationObserver(apply)
      .observe(src, { childList: true, characterData: true, subtree: true });
  }

  // Mirror the streak from the (hidden) #msb-streak gamification value.
  function syncStreak() {
    var src = document.getElementById('msb-streak');
    var wrap = document.getElementById('mpc-streak');
    var val = document.getElementById('mpc-streak-value');
    if (!wrap || !val) return;
    var apply = function () {
      var v = parseInt((src && src.textContent || '0').replace(/\D/g, ''), 10) || 0;
      val.textContent = v;
      wrap.style.display = v > 0 ? '' : 'none';
    };
    apply();
    if (src) new MutationObserver(apply)
      .observe(src, { childList: true, characterData: true, subtree: true });
  }

  /* ---- idle greeting ------------------------------------------------- */
  function buildGreeting() {
    if (document.getElementById('mpc-greeting')) return;
    var g = el('div', null,
      '<h2>Hey there 👋<br>What do you want to work on today?</h2>' +
      '<p>I’ll help you step by step.</p>');
    g.id = 'mpc-greeting';
    document.body.appendChild(g);

    // Personalise with the student's first name.
    fetch('/user', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var name = data && data.user && data.user.firstName;
        if (!name) return;
        var h2 = g.querySelector('h2');
        if (h2) h2.innerHTML =
          'Hey ' + name.replace(/[<>&]/g, '') + ' 👋<br>' +
          'What do you want to work on today?';
      })
      .catch(function () { /* keep generic greeting */ });
  }

  /* ---- bottom sheet -------------------------------------------------- */
  // label, subtitle, icon, and the action to run. Items whose target
  // is missing are skipped rather than rendered as dead links.
  var SHEET_ITEMS = [
    { icon: 'fa-user', label: 'Profile', sub: 'Your progress and account',
      run: function () { trigger('right-drawer-toggle'); } },
    { icon: 'fa-gear', label: 'Settings', sub: 'Preferences and notifications',
      need: 'open-settings-modal-btn',
      run: function () { trigger('open-settings-modal-btn'); } },
    { icon: 'fa-user-group', label: 'Switch Tutor', sub: 'Pick a different tutor',
      need: 'change-tutor-btn',
      run: function () { trigger('change-tutor-btn'); } },
    { icon: 'fa-circle-question', label: 'Help', sub: 'Get help or send feedback',
      run: function () { window.location.href = '/contact-support.html'; } },
    { icon: 'fa-right-from-bracket', label: 'Log out', sub: null, danger: true,
      need: 'logoutBtn',
      run: function () { trigger('logoutBtn'); } }
  ];

  function buildSheet() {
    if (document.getElementById('mpc-sheet')) return;

    var overlay = el('div'); overlay.id = 'mpc-sheet-overlay';
    var sheet = el('div'); sheet.id = 'mpc-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Menu');
    sheet.appendChild(el('div', 'mpc-sheet-grabber'));

    SHEET_ITEMS.forEach(function (item) {
      if (item.need && !document.getElementById(item.need)) return; // skip dead link
      var btn = el('button',
        'mpc-sheet-item' + (item.danger ? ' mpc-danger' : ''),
        '<span class="mpc-sheet-icon"><i class="fas ' + item.icon + '"></i></span>' +
        '<span class="mpc-sheet-label"><b>' + item.label + '</b>' +
          (item.sub ? '<span>' + item.sub + '</span>' : '') + '</span>' +
        (item.danger ? '' : '<i class="fas fa-chevron-right mpc-sheet-chevron"></i>'));
      btn.addEventListener('click', function () {
        closeSheet();
        setTimeout(item.run, 220); // let the sheet animate out first
      });
      sheet.appendChild(btn);
    });

    document.body.appendChild(overlay);
    document.body.appendChild(sheet);

    overlay.addEventListener('click', closeSheet);

    // drag-down to dismiss
    var startY = null;
    sheet.addEventListener('touchstart', function (e) {
      startY = e.touches[0].clientY;
    }, { passive: true });
    sheet.addEventListener('touchmove', function (e) {
      if (startY == null) return;
      var dy = e.touches[0].clientY - startY;
      if (dy > 0) sheet.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: true });
    sheet.addEventListener('touchend', function (e) {
      if (startY == null) return;
      var dy = e.changedTouches[0].clientY - startY;
      sheet.style.transform = '';
      if (dy > 60) closeSheet();
      startY = null;
    }, { passive: true });
  }

  function openSheet() {
    var o = document.getElementById('mpc-sheet-overlay');
    var s = document.getElementById('mpc-sheet');
    if (!o || !s) return;
    o.classList.add('open');
    requestAnimationFrame(function () { s.classList.add('open'); });
  }
  function closeSheet() {
    var o = document.getElementById('mpc-sheet-overlay');
    var s = document.getElementById('mpc-sheet');
    if (!o || !s) return;
    s.classList.remove('open');
    o.classList.remove('open');
    s.style.transform = '';
  }

  /* ---- visual viewport tracker --------------------------------------- */
  // iOS Safari leaves a gap between the composer and the on-screen keyboard
  // because `100dvh` doesn't always recompute when the keyboard animates in.
  // Mirror the actual visible height into --app-height so the body can dock
  // to the keyboard. Falls back to 100dvh on browsers without VisualViewport.
  function trackViewport() {
    var vv = window.visualViewport;
    if (!vv) return;
    var update = function () {
      document.documentElement.style.setProperty('--app-height', vv.height + 'px');
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
  }

  /* ---- composer height tracker --------------------------------------- */
  // Publish the composer's measured height as --mm-composer-h on <html>.
  //
  // The idle greeting and the workspace FAB both have to sit ABOVE the
  // composer, and both used to encode its height as a literal (195px and 92px).
  // The composer is not a fixed height — the toolbar row, the math strip, the
  // equation palette and a wrapped multi-line input all change it, and the
  // bottom nav shifted the whole stack again — so those literals fell inside
  // the composer and the greeting's subtitle printed across the √x / camera /
  // mic / calculator icons. Measuring removes the guess: paired with
  // --mm-nav-h (bottom-nav.js), `nav + composer` is exactly the height of the
  // bottom chrome, whatever is currently in it.
  // Also publishes --mm-composer-top: how far the composer's TOP edge sits above
  // the viewport bottom. That is what anything floating over the composer
  // actually needs, and unlike `nav + composer height` it holds at every width.
  //
  // On a phone the two agree, because the chat container is fixed and the nav is
  // the only thing below the composer. From 769–1200px the layout is the desktop
  // stage — the composer ends part-way up the screen for the footer, and no sum
  // of nav+composer describes that — which is why the workspace pill, anchored
  // at a flat 92px, sat ON the composer at every tablet width measured (820,
  // 900, 1024, 1100). One measured edge covers both layouts.
  function trackComposer() {
    var ic = document.getElementById('input-container');
    if (!ic) return;
    var publish = function () {
      var r = ic.getBoundingClientRect();
      // A zero height means the composer is swapped out (voice mode) rather
      // than genuinely flat — keep the last good value so the greeting doesn't
      // snap to the bottom edge mid-transition.
      if (r.height <= 0) return;
      var st = document.documentElement.style;
      st.setProperty('--mm-composer-h', r.height + 'px');
      // Clamped at 0: if the composer is scrolled below the fold the distance
      // goes negative, which would drag the pill off-screen entirely.
      st.setProperty('--mm-composer-top', Math.max(0, window.innerHeight - r.top) + 'px');
    };
    publish();
    if (window.ResizeObserver) new ResizeObserver(publish).observe(ic);
    window.addEventListener('resize', publish);
    window.addEventListener('orientationchange', publish);
    // The desktop stage lays out after fonts/images settle, so the first read
    // can predate the composer's final position.
    window.addEventListener('load', publish);
  }

  /* ---- idle <-> conversation state ----------------------------------- */
  // The greeting is a FIXED overlay, so anything rendered into the message
  // container paints underneath it. "Idle" therefore has to mean the container
  // is genuinely empty — not "has no .message".
  //
  // It used to test for `.message-container, .message`, which silently excluded
  // every non-message surface that injects here: the resume card, the status
  // card, the challenge/test-out card. Those render, the greeting never fades,
  // and the two headings paint on top of each other ("Good evening, Jason!"
  // under "Hey Jason 👋"). The container ships empty in chat.html and is
  // populated entirely by JS, so any element child is real content — a signal
  // that stays correct when the next card type is added.
  function watchMessages() {
    var box = document.getElementById('chat-messages-container');
    if (!box) return;
    var apply = function () {
      document.body.classList.toggle('mpc-has-messages', box.childElementCount > 0);
    };
    apply();
    new MutationObserver(apply).observe(box, { childList: true });
  }

  /* ---- boot ---------------------------------------------------------- */
  function init() {
    buildScrim();
    buildTopbar();
    buildGreeting();
    buildSheet();
    watchMessages();
    trackComposer();
    trackViewport();
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSheet();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
