/* ============================================================
   mobile-companion-home.js
   Injects the "Companion" HOME screen (action-first idle state) on
   phones. Framed tutor + greeting + three action cards + bottom nav.

   SAFETY:
   - Flag-gated OFF by default. Activates only when one of:
       window.MM_FEATURES.companionHome === true
       localStorage.mm_companion_home === '1'
       URL has ?companionHome=1
     …so production mobile is untouched until explicitly enabled.
   - Phones only (<=768px), only on the chat page.
   - Reuses existing controls via .click() — no new backend calls.
   - Everything is wrapped so a failure can never break the page.
   ============================================================ */
(function () {
  'use strict';

  function flagOn() {
    try {
      if (window.MM_FEATURES && window.MM_FEATURES.companionHome) return true;
      if (localStorage.getItem('mm_companion_home') === '1') return true;
      if (/[?&]companionHome=1/.test(location.search)) return true;
    } catch (e) {}
    return false;
  }

  var isPhone = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  if (!flagOn() || !isPhone) return;
  if (!document.getElementById('chat-messages-container')) return; // chat page only

  function trigger(id) { var t = document.getElementById(id); if (t) t.click(); }

  function tutorAssets() {
    var id = (window.currentUser && (window.currentUser.selectedTutorId || window.currentUser.tutorId))
          || (window.TUTOR_CONFIG && window.TUTOR_CONFIG.__current)
          || 'mr-nappier';
    var portrait = null;
    try { if (window.getTutorPortraitSrc) portrait = window.getTutorPortraitSrc(id); } catch (e) {}
    portrait = portrait || '/images/tutor_avatars/' + id + '-new2.png';
    var backdrop = '/images/tutor_avatars/' + id + '-backdrop.png';
    return { portrait: portrait, backdrop: backdrop };
  }

  function build() {
    if (document.getElementById('mch-home')) return;
    // If a conversation is already in progress, don't show the home screen.
    if (document.body.classList.contains('mpc-has-messages')) return;

    var a = tutorAssets();
    var home = document.createElement('section');
    home.id = 'mch-home';
    home.innerHTML =
      '<div class="mch-topbar">' +
        '<span class="mch-learn"><span class="mch-dot"></span>' +
          '<span><small>Learning with</small><b id="mch-tutor-name">Your tutor</b></span></span>' +
        '<button class="mch-menu" id="mch-menu" aria-label="Menu">☰</button>' +
      '</div>' +
      '<div class="mch-body">' +
        '<div class="mch-frame">' +
          '<div class="mch-backdrop" style="background-image:url(\'' + a.backdrop + '\')"></div>' +
          '<img class="mch-portrait" src="' + a.portrait + '" alt="" ' +
            'onerror="this.style.display=\'none\'">' +
          '<div class="mch-glow"></div>' +
        '</div>' +
        '<div class="mch-greet"><b id="mch-greet-h">Hey there 👋</b>' +
          '<p>What are we working on today?</p></div>' +
        '<div class="mch-actions">' +
          '<button class="mch-action mch-cam"  id="mch-cam"><span class="mch-ico">📷</span><b>Show My Work</b><span>Use camera</span></button>' +
          '<button class="mch-action mch-talk" id="mch-talk"><span class="mch-ico">🎤</span><b>Talk to Me</b><span>Voice help</span></button>' +
          '<button class="mch-action mch-type" id="mch-type"><span class="mch-ico">⌨️</span><b>Type Instead</b><span>Keyboard</span></button>' +
        '</div>' +
      '</div>' +
      '<nav class="mch-nav">' +
        '<button class="on"><span class="mch-ni">🏠</span>Home</button>' +
        '<button id="mch-notebook"><span class="mch-ni">📝</span>Notebook</button>' +
        '<button id="mch-progress"><span class="mch-ni">📈</span>Progress</button>' +
        '<button id="mch-me"><span class="mch-me"> </span>Me</button>' +
      '</nav>';
    document.body.appendChild(home);

    // Personalise greeting + tutor name (best-effort; failures are silent).
    fetch('/user', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var u = data && data.user; if (!u) return;
        if (u.firstName) {
          var h = document.getElementById('mch-greet-h');
          if (h) h.textContent = 'Hey ' + String(u.firstName).replace(/[<>&]/g, '') + ' 👋';
        }
      }).catch(function () {});
    var nm = document.getElementById('cr-tutor-name');
    if (nm && nm.textContent.trim()) {
      var b = document.getElementById('mch-tutor-name'); if (b) b.textContent = nm.textContent.trim();
    }

    function leaveHome() { home.hidden = true; }

    // Actions reuse the real composer controls.
    document.getElementById('mch-cam').addEventListener('click', function () { leaveHome(); trigger('camera-button'); });
    document.getElementById('mch-talk').addEventListener('click', function () { leaveHome(); trigger('voice-mode-btn'); });
    document.getElementById('mch-type').addEventListener('click', function () {
      leaveHome(); var i = document.getElementById('user-input'); if (i) i.focus();
    });
    document.getElementById('mch-menu').addEventListener('click', function () {
      trigger(document.getElementById('mpc-menu-btn') ? 'mpc-menu-btn' : 'right-drawer-toggle');
    });
    document.getElementById('mch-progress').addEventListener('click', function () { trigger('right-drawer-toggle'); });
    document.getElementById('mch-notebook').addEventListener('click', function () { leaveHome(); });
    document.getElementById('mch-me').addEventListener('click', function () {
      trigger(document.getElementById('mpc-menu-btn') ? 'mpc-menu-btn' : 'right-drawer-toggle');
    });

    // If the conversation starts (first message), retire the home screen.
    var obs = new MutationObserver(function () {
      if (document.body.classList.contains('mpc-has-messages')) { home.hidden = true; obs.disconnect(); }
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  function boot() { try { build(); } catch (e) { if (window.console) console.warn('[companion-home]', e); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
