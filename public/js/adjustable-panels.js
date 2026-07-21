/* ============================================================
   adjustable-panels.js — resizable work board + minimizable tutor

   Wires the two affordances styled in adjustable-panels.css:

   1. A drag handle in the gap between chat and the work board. Dragging
      it drives --cr-side-w (clamped so neither chat nor the board can be
      crushed); the grid in chat-redesign.css reflows off that variable.
      Arrow keys nudge it; double-click resets to the default width.

   2. A minimize button on the tutor hero that toggles body.cr-hero-min,
      collapsing the hero column, plus a "Show tutor" pill that restores it.

   Both preferences persist in localStorage. Everything is injected here so
   chat.html only needs the <link> + <script> includes.
   ============================================================ */
(function () {
  'use strict';

  var DOC = document.documentElement;

  var LS_WIDTH = 'mm_ws_width';   // board width in px (number as string)
  var LS_HERO = 'mm_hero_min';    // '1' when the tutor hero is minimized

  // Board width bounds. The hard max is also clamped per-frame against the
  // viewport so chat always keeps at least MIN_CHAT px.
  var MIN_W = 240;
  var MAX_W = 960;
  var DEFAULT_W = 320;   // matches --cr-side-w in design-system.css
  var MIN_CHAT = 360;
  var STEP = 24;         // arrow-key nudge

  function readSideVar() {
    var v = parseInt(getComputedStyle(DOC).getPropertyValue('--cr-side-w'), 10);
    return isNaN(v) ? DEFAULT_W : v;
  }

  function heroWidth() {
    if (document.body.classList.contains('cr-hero-min')) return 0;
    var v = parseInt(getComputedStyle(DOC).getPropertyValue('--cr-hero-w'), 10);
    return isNaN(v) ? 320 : v;
  }

  function clampWidth(px) {
    var vw = window.innerWidth;
    // Leave room for the hero column, the chat minimum, and the two 18px
    // grid gaps; never let the ceiling drop below the floor.
    var ceiling = Math.min(MAX_W, vw - heroWidth() - MIN_CHAT - 36);
    ceiling = Math.max(MIN_W, ceiling);
    return Math.max(MIN_W, Math.min(ceiling, Math.round(px)));
  }

  function applyWidth(px) {
    DOC.style.setProperty('--cr-side-w', clampWidth(px) + 'px');
  }

  function saveWidth() {
    try { localStorage.setItem(LS_WIDTH, String(readSideVar())); } catch (e) { /* ignore */ }
  }

  // --- Resize handle -----------------------------------------------------

  function buildResizer(stage) {
    var resizer = document.createElement('button');
    resizer.type = 'button';
    resizer.id = 'cr-ws-resizer';
    resizer.className = 'cr-ws-resizer';
    resizer.setAttribute('role', 'separator');
    resizer.setAttribute('aria-orientation', 'vertical');
    resizer.setAttribute('aria-label', 'Resize work board — drag or use arrow keys');
    resizer.title = 'Drag to resize the work board (double-click to reset)';
    stage.appendChild(resizer);

    var wsRight = 0;

    function onMove(ev) {
      // Board's right edge is pinned; its width is that edge minus the pointer.
      applyWidth(wsRight - ev.clientX);
    }

    function onUp(ev) {
      try { resizer.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      resizer.removeEventListener('pointermove', onMove);
      resizer.removeEventListener('pointerup', onUp);
      resizer.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('cr-resizing');
      saveWidth();
    }

    resizer.addEventListener('pointerdown', function (ev) {
      if (window.innerWidth <= 1200) return;           // board is a drawer here
      if (DOC.classList.contains('mm-board-hidden')) return;
      var ws = document.getElementById('cr-workspace');
      if (!ws) return;
      ev.preventDefault();
      wsRight = ws.getBoundingClientRect().right;
      try { resizer.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      document.body.classList.add('cr-resizing');
      resizer.addEventListener('pointermove', onMove);
      resizer.addEventListener('pointerup', onUp);
      resizer.addEventListener('pointercancel', onUp);
    });

    // Keyboard: left/right nudge; home resets.
    resizer.addEventListener('keydown', function (ev) {
      var cur = readSideVar();
      if (ev.key === 'ArrowLeft') { applyWidth(cur + STEP); saveWidth(); ev.preventDefault(); }
      else if (ev.key === 'ArrowRight') { applyWidth(cur - STEP); saveWidth(); ev.preventDefault(); }
      else if (ev.key === 'Home') { applyWidth(DEFAULT_W); saveWidth(); ev.preventDefault(); }
    });

    // Double-click resets to the default width.
    resizer.addEventListener('dblclick', function () { applyWidth(DEFAULT_W); saveWidth(); });
  }

  // --- Tutor hero minimize ----------------------------------------------

  function setHeroMinimized(min, minBtn) {
    document.body.classList.toggle('cr-hero-min', min);
    try { localStorage.setItem(LS_HERO, min ? '1' : '0'); } catch (e) { /* ignore */ }
    if (minBtn) minBtn.setAttribute('aria-expanded', min ? 'false' : 'true');
  }

  function buildHeroControls(stage) {
    var hero = stage.querySelector('.cr-tutor-hero');
    if (!hero) return;

    // Minimize button on the hero.
    var minBtn = document.createElement('button');
    minBtn.type = 'button';
    minBtn.className = 'cr-hero-min-btn';
    minBtn.setAttribute('aria-label', 'Minimize tutor');
    minBtn.setAttribute('aria-expanded', 'true');
    minBtn.title = 'Minimize tutor';
    minBtn.innerHTML = '<i class="fas fa-chevron-left" aria-hidden="true"></i>';
    hero.appendChild(minBtn);

    // "Show tutor" restore pill, placed where the hero column was.
    var restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'cr-hero-restore';
    restore.setAttribute('aria-label', 'Show tutor');
    restore.title = 'Show tutor';
    restore.innerHTML =
      '<img alt="" id="cr-hero-restore-avatar" />' +
      '<i class="fas fa-user cr-hero-restore-fallback" aria-hidden="true" style="display:none;"></i>' +
      '<span>Show tutor</span>';
    stage.appendChild(restore);

    // Mirror the current tutor portrait onto the pill so it reads as "bring
    // the tutor back", falling back to a generic icon if the portrait is blank.
    function syncAvatar() {
      var portrait = document.getElementById('cr-tutor-portrait');
      var img = document.getElementById('cr-hero-restore-avatar');
      var fallback = restore.querySelector('.cr-hero-restore-fallback');
      if (!img) return;
      if (portrait && portrait.getAttribute('src')) {
        img.src = portrait.getAttribute('src');
        img.style.display = '';
        if (fallback) fallback.style.display = 'none';
      } else {
        img.style.display = 'none';
        if (fallback) fallback.style.display = '';
      }
    }

    minBtn.addEventListener('click', function () {
      syncAvatar();
      setHeroMinimized(true, minBtn);
    });
    restore.addEventListener('click', function () {
      setHeroMinimized(false, minBtn);
    });

    // Restore the persisted minimized state.
    var savedHero = null;
    try { savedHero = localStorage.getItem(LS_HERO); } catch (e) { /* ignore */ }
    if (savedHero === '1') { syncAvatar(); setHeroMinimized(true, minBtn); }
  }

  // --- Boot --------------------------------------------------------------

  function init() {
    var stage = document.querySelector('.cr-stage');
    if (!stage || !document.body.classList.contains('cr-mode')) return;

    // Restore the persisted board width (clamped to the current viewport).
    var savedW = null;
    try { savedW = parseInt(localStorage.getItem(LS_WIDTH), 10); } catch (e) { /* ignore */ }
    if (savedW) applyWidth(savedW);

    buildResizer(stage);
    buildHeroControls(stage);

    // Keep the width valid if the window shrinks under a wide board.
    window.addEventListener('resize', function () {
      if (window.innerWidth <= 1200) return;
      applyWidth(readSideVar());
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
