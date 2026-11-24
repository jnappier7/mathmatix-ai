/* ============================================================
   chat-workspace.js — the Living Workspace, INLINE IN THE CHAT COLUMN.

   Default = OFF: this file loads on chat.html but does NOTHING unless
   the LivingWorkspace flag is dev|beta|live. So the flag-off experience
   (the legacy tabbed board in the right rail) is untouched, and none of
   the ~10 workspace scripts are even fetched.

   WHERE THE WORK LIVES (the 2026-09 move off the right rail):
   The board is no longer a 320px side column. The tutor's work renders
   in the chat column itself, in two places:

     • the WORK DOCK (#cr-work-dock) — the problem in focus, docked
       directly above the composer at full chat width. It grows in place
       as the turn's steps arrive and collapses to nothing when there is
       no work, so it costs zero space when idle.
     • the TRANSCRIPT — when a problem finishes, its card is SEALED into
       the message list as scrollback. The conversation is the archive,
       which is why this mode has no thumbnail rail: looking back at
       earlier work is just scrolling.

   Why: the derivation is a document-style column, and a 320px rail is
   the worst possible width for one (the card's own layout caps at
   620px). Inline it reads at full width, in the same reading order as
   the sentence that describes it, on the surface phones already use.

   When ON (window.MM_FEATURES.livingWorkspace or ?livingWorkspace=dev):
     1. lazily inject the workspace CSS + UMD-lite modules (KaTeX/
        MathLive are already on the chat page — reused, not re-loaded),
     2. mount the derivation view into the work dock,
     3. expose window.LWS_CHAT.applyBoardCommands(cmds): the chat SSE
        handler feeds each turn's board_commands here; the P5 adapter
        turns them into workspace elements that render on the surface.

   Nothing upstream changes: the same guarded board commands, the same
   adapter, the same anti-cheat gauntlet. This is a placement change.
   ============================================================ */
(function () {
  'use strict';

  // ── Lightweight flag read (no dependency on flags.js, which we may not
  //    have loaded yet). Mirrors core/flags.js precedence. ──
  function resolveMode() {
    try {
      var qs = new URLSearchParams(window.location.search || '');
      var q = qs.get('livingWorkspace');
      if (q) return q;
    } catch (_) { /* no URL */ }
    var f = window.MM_FEATURES && window.MM_FEATURES.livingWorkspace;
    return f || 'off';
  }
  var MODE = resolveMode();
  var ON = MODE === 'dev' || MODE === 'beta' || MODE === 'live';

  // The Work Board — the derivation dock above the composer and the sealed
  // cards in the transcript — is OFF unless the server says otherwise
  // (WORK_BOARD env → /api/features.js → MM_FEATURES.workBoard). With it off
  // the tutor writes the math in its message; this module still mounts the
  // Notebook and the Source Dock, so isOn() stays true (script.js would
  // otherwise fall back to the legacy board) and only the board calls go quiet.
  // ?workBoard=1 forces it on for a session.
  function resolveBoard() {
    try {
      var q = new URLSearchParams(window.location.search || '').get('workBoard');
      if (q === '1' || q === 'on') return true;
      if (q === '0' || q === 'off') return false;
    } catch { /* no URL */ }
    return !!(window.MM_FEATURES && window.MM_FEATURES.workBoard === true);
  }
  var BOARD = resolveBoard();

  // Chat context for the student-move loop (P7). Chat refines it via
  // window.LWS_CHAT.setContext({ conversationId, workspaceId }).
  var ctx = { conversationId: null, workspaceId: 'chat' };

  // Public surface is always defined so callers don't need to feature-detect
  // twice; when off, applyBoardCommands is a no-op.
  var api = {
    isOn: function () { return ON; },
    applyBoardCommands: function () {},
    applyVoiceBoard: function () {},
    // Voice caption/spotlight hooks — see derivationView.setSpeaking. No-ops
    // until the view mounts, so the caption layer can call them unguarded.
    setSpeaking: function () {},
    setCaption: function () {},
    setContext: function (c) { if (c && typeof c === 'object') { if (c.conversationId != null) ctx.conversationId = c.conversationId; if (c.workspaceId != null) ctx.workspaceId = c.workspaceId; } },
    // Wipe the board back to its empty state, thumbnail rail included. Called
    // when the server rolls the conversation over after an idle gap — the new
    // session must not open onto the previous one's work.
    reset: function () {},
    // Rebuild the board from a persisted conversation.boardLedger (session
    // switch / page re-mount). No-op when the workspace is off.
    hydrate: function () {},
    // Source Cards (spec §5.1): set the dock from a conversation's messages
    // (history load) or append this turn's uploads (live delta).
    setSourcesFromMessages: function () {},
    addSources: function () {},
    // Source↔problem link (spec §5.4): paint/clear the in-focus problem's
    // "from my worksheet" chip. Fed by the response's boardSource field.
    setProblemSource: function () {},
    // Tutor pointing (spec §8): highlight the board line the tutor named.
    pointAt: function () {},
    // The student keeping a chat message: open the notebook with its composer
    // prefilled. Chat's per-message 📓 chip calls this on click (the same chip
    // dragged onto the pill reaches the panel's own drop handler instead).
    // Returns false when there's no notebook to capture into, so chat can
    // leave the chip out rather than render a dead control.
    captureToNotebook: function () { return false; },
  };
  window.LWS_CHAT = api;
  if (!ON) return;

  // Cache-buster for the lazily-loaded workspace CSS + modules. prod serves
  // public/ with a 7-day cache and no content hashing, so bump this whenever
  // any living-workspace asset changes (and the chat.html <script ?v=> tag to
  // match, so this file itself refreshes). See project_asset_cache_busting.
  var ASSET_V = '?v=20261124d';
  var BASE = '/js/living-workspace/';
  var SCRIPTS = [
    'core/flags.js', 'core/viewport.js', 'core/elementRegistry.js',
    'core/snapshotManager.js', 'core/a11yCommands.js', 'core/ledgerReplay.js',
    'core/sourceList.js', 'dom/sourceDock.js', 'dom/notebookPanel.js', 'dom/modelElement.js',
    'dom/gridRenderer.js', 'dom/overlayManager.js', 'dom/equationElement.js',
    'dom/tileElement.js', 'dom/tileMatElement.js', 'dom/numberLineElement.js', 'dom/graphElement.js',
    'dom/noteElement.js', 'dom/imageElement.js', 'dom/studentMoveClient.js',
    'dom/interactionController.js', 'dom/shell.js', 'dom/legacyBoardAdapter.js',
    'dom/derivationView.js', 'dom/voiceBoardTranslate.js',
  ];

  // Build brick #1: the chat board renders as a FOCUSED DERIVATION
  // (dom/derivationView.js), not free-floating canvas cards. `dv` is that view.
  var dv = null;
  var dock = null;           // SourceDock — uploads living on the board
  var ready = false;
  var pending = null;        // latest board_commands received before ready
  var pendingLedger;         // ledger passed to hydrate() before ready (undefined = none)
  var pendingSources;        // source list set before ready (undefined = none)
  var turn = 0;

  function injectCss() {
    if (document.querySelector('link[data-lws]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/css/living-workspace.css' + ASSET_V; link.dataset.lws = '1';
    document.head.appendChild(link);
  }

  // Sequential loader: each script executes before the next, so UMD-lite
  // deps (viewport before shell, etc.) resolve in order.
  function loadNext(i, done) {
    if (i >= SCRIPTS.length) return done();
    var s = document.createElement('script');
    s.src = BASE + SCRIPTS[i] + ASSET_V;
    s.async = false;
    s.onload = function () { loadNext(i + 1, done); };
    s.onerror = function () { console.error('[LWS_CHAT] failed to load', s.src); };
    document.body.appendChild(s);
  }

  // PHONES: THE DESK BECOMES THE BOARD. A phone has one column and no room for
  // both the tutor's card and the work, so while a problem is in focus the dock
  // is pinned at the top of the screen, where the tutor was, and the
  // conversation scrolls beneath it; when the work is sealed the tutor comes
  // back. This only says WHEN (body.mm-board-up = the dock has work in it);
  // the phone layout is CSS, phone widths only (living-workspace.css "the desk
  // becomes the board"). A wide screen has its own answer: placeDock, below.
  function boardIsUp(root) { return !!root && !root.classList.contains('is-empty'); }

  // DESKTOP: THE BOARD HANGS UNDER THE TUTOR. On a wide screen the work used
  // to sit above the composer, where three steps left the conversation one
  // bubble (measured at 1366x800). Math is a narrow, tall column and the
  // tutor's column is exactly that shape — so while a problem is in focus the
  // dock MOVES into the tutor's column: the tutor's card shortens to a strip,
  // the board hangs under it at the column's full height, and the
  // conversation keeps the whole chat column. With no work the dock goes home
  // (above the composer, where it is empty and takes no space) and the
  // tutor's column is exactly as it was — courses, standings, the lot.
  // This is the one layout CSS cannot do alone (the dock changes parent), so
  // the script moves the node and stamps body.mm-board-side; everything else
  // is living-workspace.css "the board hangs under the tutor". Narrower than
  // SIDE_MQ there is no room for the column, and the dock stays in the chat.
  var SIDE_MQ = '(min-width: 1100px)';
  // Not in voice mode (its own stage), and not while the student has the
  // tutor's column minimized (body.cr-hero-min, adjustable-panels.js): a board
  // moved into a hidden column would be work nobody can see, so there it stays
  // in the chat.
  function wantsSide(up, wide, voice, tutorHidden) { return !!(up && wide && !voice && !tutorHidden); }
  function placeDock(up) {
    var slot = document.getElementById('cr-work-dock');
    var col = document.querySelector('.cr-hero-col');
    var hero = col && col.querySelector('.cr-tutor-hero');
    var home = document.getElementById('input-container');
    if (!slot || !col || !hero || !home || !home.parentNode) return false;
    var mq = window.matchMedia ? window.matchMedia(SIDE_MQ) : null;
    var body = document.body.classList;
    var side = wantsSide(up, !!(mq && mq.matches), body.contains('cr-voice'), body.contains('cr-hero-min'));
    var isSide = slot.parentNode === col;
    if (side && !isSide) col.insertBefore(slot, hero.nextSibling);
    else if (!side && isSide) home.parentNode.insertBefore(slot, home);
    document.body.classList.toggle('mm-board-side', side);
    return side !== isSide;
  }

  function watchBoardUp(root) {
    if (!root || !document.getElementById('cr-work-dock')) return;
    var was = null;
    function settleThread() {
      var thread = document.getElementById('chat-messages-container');
      if (thread) requestAnimationFrame(function () { thread.scrollTop = thread.scrollHeight; });
    }
    function sync() {
      var up = boardIsUp(root);
      // The conversation's width or height just changed: keep its newest line.
      if (placeDock(up)) settleThread();
      if (up === was) return;
      was = up;
      document.body.classList.toggle('mm-board-up', up);
      if (!up) return;
      var face = document.querySelector('#cr-work-dock .lws-dock-face');
      var src = ['mm-cam-pill-avatar', 'cr-tutor-portrait'].map(function (id) {
        var el = document.getElementById(id);
        return (el && el.getAttribute('src')) || '';
      }).filter(Boolean)[0];
      if (face && src) { face.src = src; face.hidden = false; }
      // The newest message was at the bottom of the thread before the board
      // took its share of the column; keep it there.
      var thread = document.getElementById('chat-messages-container');
      if (thread) requestAnimationFrame(function () { thread.scrollTop = thread.scrollHeight; });
    }
    sync();
    if (typeof MutationObserver === 'function') {
      new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['class'] });
    }
    // A window dragged across the breakpoint moves the board with it.
    var mq = window.matchMedia ? window.matchMedia(SIDE_MQ) : null;
    if (mq && mq.addEventListener) mq.addEventListener('change', sync);
    // …and so does minimizing or restoring the tutor, or entering voice mode.
    // (sync only ever sets body classes to what they already are when nothing
    // changed, which records no mutation — so this cannot loop.)
    if (typeof MutationObserver === 'function') {
      new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    watchKeyboard();
  }

  // KEYBOARD UP. The chat column is a fixed box the size of the LAYOUT viewport,
  // and on today's phones the keyboard does not resize that: it covers the
  // bottom and the browser slides the visible part down to the composer — so
  // whatever is pinned at the top slides off the screen. For the tutor's pill
  // that never mattered. For the board it is the worst moment to lose it: the
  // student is typing the next line of the very work that just left.
  // So while the keyboard is up this publishes where the VISIBLE part is
  // (--mm-vv-top / --mm-vv-h, from visualViewport) and stamps
  // body.mm-board-kb; the CSS fits the column to it — board, a line of
  // conversation, composer, all above the keyboard. The class is set whether
  // or not the board is up (the CSS asks for both), so a board that arrives
  // while the student is typing is placed correctly at once.
  function keyboardIsUp(visibleH, tallestH) { return visibleH < tallestH - 140; }
  function watchKeyboard() {
    var vv = window.visualViewport;
    if (!vv || watchKeyboard.on) return;
    watchKeyboard.on = true;
    // A pinch-zoom shrinks the visual viewport too; times the scale it is the
    // same height as before, so only a keyboard reads as one.
    function visible() { return vv.height * (vv.scale || 1); }
    function across() { return vv.width * (vv.scale || 1); }
    var tallest = visible(), width = across();
    function update() {
      // A rotation is a new screen: forget the old height.
      if (Math.abs(across() - width) > 1) { width = across(); tallest = visible(); }
      if (visible() > tallest) tallest = visible();
      var up = keyboardIsUp(visible(), tallest);
      var st = document.documentElement.style;
      if (up) {
        st.setProperty('--mm-vv-top', Math.max(0, Math.round(vv.offsetTop)) + 'px');
        st.setProperty('--mm-vv-h', Math.round(vv.height) + 'px');
      } else {
        st.removeProperty('--mm-vv-top');
        st.removeProperty('--mm-vv-h');
      }
      var was = document.body.classList.contains('mm-board-kb');
      document.body.classList.toggle('mm-board-kb', up);
      // The window just changed size under both scrollers: put each back on
      // its newest line — the step being worked, the tutor's last message.
      if (up !== was) requestAnimationFrame(function () {
        ['#cr-work-dock .lws-dv', '#chat-messages-container'].forEach(function (sel) {
          var el = document.querySelector(sel);
          if (el) el.scrollTop = el.scrollHeight;
        });
      });
    }
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
  }

  // SWIPE THE BOARD AWAY (phones). Push the board up by its bar or its grab
  // handle and it tucks into the bar, leaving the whole screen to the
  // conversation; pull down and it comes back. The board follows the finger
  // (its height is the drag) and on release it finishes whichever way
  // swipeDecision says. The gesture lives on the bar and the handle only —
  // never on the work itself, which scrolls, and whose tiles are dragged.
  //   collapsed: is the board tucked away now?   dy: finger travel, down = +
  //   full: the board's open height in px
  function swipeDecision(collapsed, dy, full) {
    var need = Math.min(48, Math.max(24, (full || 0) * 0.25));
    if (collapsed) return dy > need ? 'open' : 'stay';
    return dy < -need ? 'close' : 'stay';
  }
  function wireDockSwipe(slot, bar, grab, mount, setCollapsed) {
    var phone = window.matchMedia ? window.matchMedia('(max-width: 768px)') : null;
    var drag = null, busy = null;
    function calm() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    function onPhoneBoard() { return !!(phone && phone.matches && document.body.classList.contains('mm-board-up')); }
    function clear() {
      mount.style.transition = ''; mount.style.maxHeight = ''; mount.style.overflow = ''; mount.style.opacity = '';
      slot.classList.remove('is-dragging');
    }
    // Glide the board's height to `to` (0 = tucked away), then settle its state.
    function finish(to, full, done) {
      if (busy) busy();
      if (calm()) { clear(); done(); return; }
      mount.style.transition = 'max-height 240ms cubic-bezier(.22, 1, .36, 1), opacity 200ms ease';
      mount.style.maxHeight = to + 'px';
      mount.style.opacity = to > 0 ? '1' : '0';
      var ended = false, timer = null;
      function end() {
        if (ended) return; ended = true; busy = null;
        clearTimeout(timer); mount.removeEventListener('transitionend', onEnd);
        clear(); done();
      }
      function onEnd(e) { if (e.target === mount && e.propertyName === 'max-height') end(); }
      mount.addEventListener('transitionend', onEnd);
      timer = setTimeout(end, 320);
      busy = end;
    }
    // Put the board under script control at its current height.
    function take(collapsed) {
      if (busy) busy();
      slot.classList.add('is-dragging');
      mount.style.transition = 'none';
      mount.style.overflow = 'hidden';
      mount.style.maxHeight = 'none';
      var full = mount.offsetHeight;
      mount.style.maxHeight = (collapsed ? 0 : full) + 'px';
      mount.style.opacity = collapsed ? '0' : '1';
      void mount.offsetHeight;   // commit the starting height before any glide
      return full;
    }
    // The animated switch, for the Hide/Show button and a tap on the handle.
    function slide(toCollapsed) {
      var isCollapsed = slot.classList.contains('is-collapsed');
      if (toCollapsed === isCollapsed) return;
      if (!onPhoneBoard() || calm()) { setCollapsed(toCollapsed); return; }
      var full = take(isCollapsed);
      finish(toCollapsed ? 0 : full, full, function () { setCollapsed(toCollapsed); });
    }
    if (!window.PointerEvent) return slide;

    function down(e) {
      if (!onPhoneBoard()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Buttons on the bar (Hide, text size) keep their taps.
      if (e.currentTarget === bar && e.target.closest && e.target.closest('button')) return;
      drag = { id: e.pointerId, y: e.clientY, x: e.clientX, collapsed: slot.classList.contains('is-collapsed'), full: 0, moved: false, dy: 0, el: e.currentTarget };
    }
    function move(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dy = e.clientY - drag.y, dx = e.clientX - drag.x;
      if (!drag.moved) {
        if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(dx)) return;
        drag.moved = true;
        try { drag.el.setPointerCapture(drag.id); } catch (_) {}
        drag.full = take(drag.collapsed);
        slot.classList.add('is-held');
      }
      // The board's height IS the drag. Past either end it gives a little and
      // no more, so the finger feels the limit instead of a dead stop.
      var raw = (drag.collapsed ? 0 : drag.full) + dy;
      var h = raw < 0 ? 0 : raw > drag.full ? drag.full + Math.min(14, (raw - drag.full) * 0.2) : raw;
      mount.style.maxHeight = h + 'px';
      mount.style.opacity = String(Math.min(1, 0.35 + 0.65 * (drag.full ? h / drag.full : 1)));
      drag.dy = dy;
      if (e.cancelable) e.preventDefault();
    }
    function up(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag; drag = null;
      if (!d.moved) return;
      slot.classList.remove('is-held');
      grab._draggedAt = Date.now();
      var what = swipeDecision(d.collapsed, d.dy, d.full);
      if (what === 'close') finish(0, d.full, function () { setCollapsed(true); });
      else if (what === 'open') finish(d.full, d.full, function () { setCollapsed(false); });
      else finish(d.collapsed ? 0 : d.full, d.full, function () {});
    }
    [bar, grab].forEach(function (el) {
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    return slide;
  }

  // Where the work docks: a slot inside the chat column, between the message
  // list and the composer (chat.html #cr-work-dock). Falls back to a floating
  // panel when the slot is absent (dev harnesses, other pages) so the
  // integration still works anywhere.
  function buildDock() {
    var slot = document.getElementById('cr-work-dock');
    if (slot) {
      slot.classList.add('is-live');
      // A long derivation can grow to the dock's cap and push the conversation
      // up, so the student needs a way to get the height back without losing
      // the work. CSS hides the whole bar while the dock is empty.
      var bar = document.createElement('div');
      bar.className = 'lws-dock-bar';
      var label = document.createElement('span');
      label.className = 'lws-dock-bar-t';
      label.textContent = 'Our work';
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'lws-dock-toggle';
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-controls', 'lws-chat-mount');
      function paintToggle(collapsed) {
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        toggle.innerHTML = collapsed
          ? '<i class="fas fa-chevron-up" aria-hidden="true"></i><span>Show</span>'
          : '<i class="fas fa-chevron-down" aria-hidden="true"></i><span>Hide</span>';
        toggle.setAttribute('aria-label', collapsed ? 'Show our work' : 'Hide our work');
      }
      paintToggle(false);
      function setCollapsed(on) {
        slot.classList.toggle('is-collapsed', !!on);
        paintToggle(!!on);
      }
      // On a phone the same change glides (wireDockSwipe hands back the
      // animated version); everywhere else it is the plain switch.
      var slide = null;
      function flip() { (slide || setCollapsed)(!slot.classList.contains('is-collapsed')); }
      toggle.addEventListener('click', flip);
      // On a phone the dock takes the tutor's place at the top of the screen
      // (see watchBoardUp), so the tutor's face rides on the bar of the board
      // they are writing on. CSS shows it only there; the src is filled in
      // when the board goes up, because the tutor is chosen after this runs.
      var face = document.createElement('img');
      face.className = 'lws-dock-face';
      face.alt = '';
      face.setAttribute('aria-hidden', 'true');
      face.hidden = true;
      bar.appendChild(face);
      bar.appendChild(label);
      bar.appendChild(toggle);
      slot.appendChild(bar);

      var mountIn = document.createElement('div');
      mountIn.id = 'lws-chat-mount';
      slot.appendChild(mountIn);

      // The grab handle: on a phone the board hangs from the top of the
      // screen, so its bottom edge is what you push up to get the whole
      // conversation back and pull down to bring the work back. A tap toggles.
      // CSS shows it on phones only.
      var grab = document.createElement('button');
      grab.type = 'button';
      grab.className = 'lws-dock-grab';
      grab.setAttribute('aria-label', 'Slide our work up or down');
      grab.addEventListener('click', function () {
        // A mouse drag ends in a click; a touch drag does not. Either way a
        // drag is not a tap.
        if (grab._draggedAt && Date.now() - grab._draggedAt < 350) return;
        flip();
      });
      slot.appendChild(grab);
      slide = wireDockSwipe(slot, bar, grab, mountIn, setCollapsed);
      return mountIn;
    }

    // Fallback: floating dev panel.
    var panel = document.createElement('div');
    panel.id = 'lws-chat-panel';
    panel.setAttribute('aria-label', 'Living Workspace (preview)');
    panel.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px',
      'width:min(46vw,640px)', 'max-height:60vh', 'z-index:2200',
      'background:var(--cr-bg-panel,#fff)', 'border:1px solid rgba(15,26,36,0.12)',
      'border-radius:16px', 'box-shadow:0 12px 40px rgba(15,26,36,0.18)',
      'display:flex', 'flex-direction:column', 'overflow:hidden',
    ].join(';');

    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid rgba(15,26,36,0.1);font:600 12px/1 Inter,system-ui,sans-serif;color:#5B6876;';
    bar.innerHTML = '<span>🧪 Living Workspace <span style="opacity:.7">(' + MODE + ' preview)</span></span>';
    var close = document.createElement('button');
    close.type = 'button'; close.textContent = '×';
    close.setAttribute('aria-label', 'Hide workspace preview');
    close.style.cssText = 'border:none;background:transparent;font-size:18px;line-height:1;cursor:pointer;color:#5B6876;';
    close.addEventListener('click', function () { panel.style.display = 'none'; });
    bar.appendChild(close);

    var mount = document.createElement('div');
    mount.id = 'lws-chat-mount';
    mount.style.cssText = 'flex:1;min-height:0;position:relative;';

    panel.appendChild(bar);
    panel.appendChild(mount);
    document.body.appendChild(panel);
    return mount;
  }

  // The Source Dock's viewer overlay fills whatever element hosts it, so the
  // dock does NOT live in the work dock (a short strip above the composer):
  // a worksheet page opened in a 200px-tall overlay is unreadable. It hosts in
  // its own full-height layer over the chat panel instead.
  //
  // That layer must carry .lws-root: every --lws-* token (colours, the
  // overlay's opaque background) is defined ON .lws-root, and a widget mounted
  // outside one resolves them to nothing — which shipped once already as a
  // transparent overlay bleeding over the board.
  function buildOverlayHost() {
    var chat = document.getElementById('chat-container');
    if (!chat) return null;
    var host = document.getElementById('lws-chat-overlays');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'lws-chat-overlays';
    host.className = 'lws-root lws-chat-overlays';
    if (getComputedStyle(chat).position === 'static') chat.style.position = 'relative';
    chat.appendChild(host);
    return host;
  }

  // ── Sealing: a finished problem leaves the dock and becomes scrollback ────
  //
  // Live turns seal at the end of the transcript (the conversation is at its
  // newest message, so that is where the work just finished). A hydration
  // replay instead places each card by when it was completed, so reopening a
  // conversation reads in the order it actually happened.
  var sealDeferred = null;    // non-null while a hydrate replay is running

  function transcript() { return document.getElementById('chat-messages-container'); }

  function placeSealed(node, completedAt) {
    var box = transcript();
    if (!box) return;
    var at = completedAt ? Date.parse(completedAt) : NaN;
    if (!isFinite(at)) { box.appendChild(node); return; }
    // Insert after the last message that predates the completion. Messages are
    // stamped with data-ts on history load; a transcript with no stamps (a
    // live session) falls through to the append below.
    var stamped = box.querySelectorAll('[data-ts]');
    var after = null;
    for (var i = 0; i < stamped.length; i++) {
      var ts = Number(stamped[i].getAttribute('data-ts'));
      if (isFinite(ts) && ts <= at) after = stamped[i]; else break;
    }
    if (!after) { box.insertBefore(node, stamped.length ? stamped[0] : null); return; }
    // Two problems finished between the same pair of messages anchor to the
    // same message. Step past cards already sealed there, or the second one
    // would land in front of the first and the replay would read backwards.
    var at2 = after.nextSibling;
    while (at2 && at2.classList && at2.classList.contains('lws-sealed')) at2 = at2.nextSibling;
    box.insertBefore(node, at2);
  }

  function sealToTranscript(entry) {
    if (!dv || !entry) return;
    var node;
    try { node = dv.buildSealedCard(entry); }
    catch (e) { console.error('[LWS_CHAT] seal render failed', e); return; }
    var box = transcript();
    // Was the student at the live edge BEFORE we grow the transcript? A sealed
    // card is tall, so appending one silently pushes the newest message out of
    // view. Only follow if they were already at the bottom — someone scrolled
    // up re-reading an earlier problem must not be yanked back down.
    var atBottom = !!box && (box.scrollHeight - box.scrollTop - box.clientHeight) < 80;
    placeSealed(node, entry.completedAt);
    if (atBottom && box) {
      try { box.scrollTop = box.scrollHeight; } catch (_) { /* not laid out */ }
    }
  }

  // Drop every sealed card from the transcript. Chat clears the message list
  // itself on a session switch, but a rollover keeps the thread and re-seeds
  // it — so the previous session's work must not survive as orphan cards whose
  // renderers resetAll has already disposed.
  function clearSealed() {
    var box = transcript();
    if (!box) return;
    var old = box.querySelectorAll('.lws-sealed');
    for (var i = 0; i < old.length; i++) {
      if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
    }
  }

  function onSeal(entry) {
    // During hydration the per-problem metadata (assistance level, completedAt)
    // has not been zipped on yet — ledgerMeta runs after the replay. Sealing
    // now would render every card as a bare "Solved" and place it blind, so
    // hold the entries and paint them once the replay is annotated.
    if (sealDeferred) { sealDeferred.push(entry); return; }
    sealToTranscript(entry);
  }

  // Renderers for the inline blocks the derivation embeds. Equation-family
  // lines (pose/resolve/apply/verify/scaffold/example) are typeset directly by
  // the view; only graph / image / geometry need a renderer, and those are the
  // only non-equation element types board_commands ever produce via the P5
  // adapter (tiles / number lines are never emitted by board_commands, so the
  // derivation needs no student-move loop).
  function makeRenderers() {
    var r = {};
    if (window.LWS.GraphElement) {
      r.graph = window.LWS.GraphElement.makeRenderer({ onChange: function () { /* exploration only; no answer injection */ } });
    }
    // Image (P15): real safe-search picture, degrading to a labelled note.
    if (window.LWS.ImageElement) r.image = window.LWS.ImageElement.makeRenderer();
    else if (window.LWS.NoteElement) r.image = window.LWS.NoteElement.makeRenderer();
    // Geometry (P17): titled note card until a real figure renderer lands.
    if (window.LWS.NoteElement) r.geometry = window.LWS.NoteElement.makeRenderer();
    // Algebra tiles on the card: the server decides which tiles a line is
    // (utils/workspace/tileMat.js); the student drags, flips and cancels them.
    if (window.LWS.TileMatElement) {
      r.algebra_tiles = window.LWS.TileMatElement.makeRenderer({ onChange: queueTilesReport, onAsk: showTutorTheTiles });
    }
    // Interactive concept models (§6.8) — bridges to the page's
    // ConceptModelRenderer engine (JSXGraph/tokens, linked representations).
    // §6.9: settled manipulations become exploration StudentMoves — verified
    // server-side (meaningful vs noise), no tutor turn, no answer path.
    if (window.LWS.ModelElement) {
      r.model = window.LWS.ModelElement.makeRenderer({ onInteraction: sendModelExploration });
    }
    return r;
  }

  // Render one turn's board_commands onto the surface via the P5 adapter.
  // Render one turn's board_commands as derivation items. The P5 adapter maps
  // commands → elements (role-tagged); the derivation view lays them out
  // (problem pinned, steps flowing, graph/image inline). `clear` wipes first.
  function render(cmds) {
    if (!ready || !dv) { pending = cmds; return; }
    var out;
    try { out = window.LWS.adaptBoardCommands(cmds, { idPrefix: 'lgc' + (++turn) }); }
    catch (e) { console.error('[LWS_CHAT] adapt failed', e); return; }
    try { dv.apply(out.elements, out.clear); }
    catch (e) { console.error('[LWS_CHAT] render failed', e); }
  }

  api.applyBoardCommands = function (cmds) {
    if (!BOARD) return;
    if (!Array.isArray(cmds) || cmds.length === 0) return;
    render(cmds);
  };

  // Voice turns speak the legacy board protocol (mathSteps / boardActions).
  // Translate to boardCommands and render, so the derivation view updates live
  // during a voice session instead of freezing after the first (text-posed)
  // problem. No-op if the translator or payload is empty.
  api.applyVoiceBoard = function (payload) {
    if (!BOARD) return;
    if (!window.LWS || typeof window.LWS.voiceToBoardCommands !== 'function') return;
    var cmds;
    try { cmds = window.LWS.voiceToBoardCommands(payload); }
    catch (e) { console.error('[LWS_CHAT] voice translate failed', e); return; }
    if (Array.isArray(cmds) && cmds.length) render(cmds);
  };

  api.setSpeaking = function (on) {
    if (!dv) return;
    try { dv.setSpeaking(on); } catch (_) { /* view torn down */ }
  };

  api.setCaption = function (text) {
    if (!dv) return;
    try { dv.setCaption(text); } catch (_) { /* view torn down */ }
  };

  api.reset = function () {
    pending = null;                 // don't let a queued turn repaint the old session
    pendingLedger = undefined;
    pendingSources = undefined;
    if (dock) { try { dock.clear(); } catch (e) { console.error('[LWS_CHAT] dock clear failed', e); } }
    clearSealed();
    if (!dv) return;
    try { dv.resetAll(); } catch (e) { console.error('[LWS_CHAT] reset failed', e); }
  };

  var sources = [];
  function paintSources(opts) {
    if (!dock) return;
    try { dock.setSources(sources, opts); } catch (e) { console.error('[LWS_CHAT] dock render failed', e); }
  }

  // History load: the full source list derives from messages[].attachments.
  // Replaces whatever the dock held — a switch means a different conversation.
  api.setSourcesFromMessages = function (messages) {
    if (!window.LWS || typeof window.LWS.sourcesFromMessages !== 'function') { pendingSources = messages || []; return; }
    sources = window.LWS.sourcesFromMessages(messages);
    if (!ready) { pendingSources = messages || []; return; }
    paintSources();
  };

  // Live turn: the response's sourceUploads delta appends to the dock.
  api.addSources = function (delta) {
    if (!Array.isArray(delta) || !delta.length) return;
    if (!window.LWS || typeof window.LWS.mergeSources !== 'function' || !ready) return;
    sources = window.LWS.mergeSources(sources, delta);
    paintSources({ animateNew: true });
  };

  api.setProblemSource = function (ref) {
    if (!ready || !dv) return;
    try { dv.setProblemSource(ref || null); } catch (e) { console.error('[LWS_CHAT] problem source failed', e); }
  };

  api.pointAt = function (ref) {
    if (!ready || !dv) return;
    try { dv.pointAt(ref); } catch (e) { console.error('[LWS_CHAT] pointAt failed', e); }
  };

  // The problem header's chip → reopen the docked source with the problem's
  // region highlighted. Falls back to a bare open when the source has scrolled
  // off the dock (older than the cap) — the ref still names it servably.
  function openLinkedSource(ref) {
    if (!dock || !ref || !ref.uploadId) return;
    var src = null;
    for (var i = 0; i < sources.length; i++) {
      if (sources[i] && sources[i].uploadId === ref.uploadId) { src = sources[i]; break; }
    }
    if (!src) src = { uploadId: ref.uploadId, fileType: 'image', mimeType: null };
    try { dock.openSource(src, 'My worksheet', ref.region || null); }
    catch (e) { console.error('[LWS_CHAT] open linked source failed', e); }
  }

  // ── The tutor sees the tile mat ──────────────────────────────────────
  // Each change on a mat is reported to the server as tile COUNTS plus the kind
  // of move (never text); the server writes what the tutor reads from those
  // (utils/workspace/tileMatState.js) and keeps it on the tiles card, which is
  // also what brings the mat back after a reload. Reports are batched — a burst
  // of drags is one request carrying the latest counts and the moves in order.
  var tilesPending = {};     // start line → { sides, moves[] }
  var tilesTimer = null;
  var tilesInFlight = Promise.resolve();

  function queueTilesReport(detail) {
    if (!detail || !detail.start || !Array.isArray(detail.sides)) return;
    var slot = tilesPending[detail.start] || (tilesPending[detail.start] = { sides: null, moves: [] });
    slot.sides = detail.sides;
    if (detail.move) slot.moves.push(detail.move);
    if (tilesTimer) clearTimeout(tilesTimer);
    tilesTimer = setTimeout(flushTilesReports, 700);
  }

  // Send everything queued. Resolves when the server has it (or has refused
  // it) — never rejects: a mat that cannot report is still a working mat.
  function flushTilesReports() {
    if (tilesTimer) { clearTimeout(tilesTimer); tilesTimer = null; }
    var batch = tilesPending;
    tilesPending = {};
    var doFetch = window.csrfFetch || window.fetch;
    Object.keys(batch).forEach(function (start) {
      var body = JSON.stringify({ start: start, sides: batch[start].sides, moves: batch[start].moves });
      tilesInFlight = tilesInFlight.then(function () {
        return doFetch('/api/student-moves/tiles', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: body,
        });
      }).catch(function () { /* the next change reports the whole mat again */ });
    });
    return tilesInFlight;
  }

  // "Show my tutor": make sure the server has the mat as it is NOW, then send
  // an ordinary chat message — the tutor's reply comes down the normal turn,
  // reading the mat from the board block like everything else on the board.
  function showTutorTheTiles(detail) {
    if (detail) { queueTilesReport({ start: detail.start, sides: detail.sides, move: null }); }
    flushTilesReports().then(function () {
      if (typeof window.mmSendChatMessage === 'function') {
        window.mmSendChatMessage('Look at what I did with the tiles.');
      }
    });
  }

  // A settled concept-model manipulation (§6.9): one exploration StudentMove
  // per changed param. withTutor:false — exploration never runs a tutor turn;
  // the server judges meaningful-vs-noise and records transfer evidence.
  function sendModelExploration(payload) {
    if (!window.LWS || !window.LWS.StudentMoveClient || !payload || !Array.isArray(payload.changes)) return;
    payload.changes.forEach(function (ch) {
      try {
        window.LWS.StudentMoveClient.sendMove({
          conversationId: String(ctx.conversationId || ''),
          workspaceId: String(ctx.workspaceId || 'chat'),
          elementId: payload.elementId || 'model',
          elementType: 'model',
          source: 'gesture',
          mode: 'exploration',
          operation: {
            type: 'set_param',
            parameters: {
              modelName: payload.model, param: ch.param,
              from: ch.from, to: ch.to,
              min: ch.min, max: ch.max,
            },
          },
          previousState: { params: (function () { var o = {}; o[ch.param] = ch.from; return o; })() },
          proposedState: { params: (function () { var o = {}; o[ch.param] = ch.to; return o; })() },
        }, { withTutor: false, fetch: window.csrfFetch || undefined });
      } catch (e) { console.error('[LWS_CHAT] model move send failed', e); }
    });
  }

  // A filled scaffold blank (owner call, 2026-07-28): ONE StudentMove through
  // the tile lane — server-authoritative verdict (deterministic for a single-
  // blank equation) + the tutor's reaction in the same round trip. The board
  // paints the verdict; the reaction lands in chat via appendMessage.
  document.addEventListener('lws:blank-submit', function (e) {
    var d = e && e.detail;
    if (!d || !window.LWS || !window.LWS.StudentMoveClient) return;
    try {
      window.LWS.StudentMoveClient.sendMove({
        conversationId: String(ctx.conversationId || ''),
        workspaceId: String(ctx.workspaceId || 'chat'),
        elementId: (d.row && d.row.getAttribute('data-lws-id')) || 'scaffold',
        elementType: 'equation',
        source: 'keyboard',
        mode: 'attempt',
        gestureType: 'edit',
        operation: {
          type: 'fill_blank',
          parameters: { stepTex: d.stepTex, blankIndex: d.blankIndex, value: d.value },
        },
        previousState: { tex: d.stepTex },
        proposedState: { filled: d.value },
      }, { withTutor: true, fetch: window.csrfFetch || undefined }).then(function (result) {
        var vm = result && result.verifiedMove;
        var box = d.row && d.row.querySelector('.lws-blank-pending');
        if (box) {
          box.classList.remove('lws-blank-pending');
          if (vm && vm.mathematicallyValid === true) box.classList.add('lws-blank-ok');
          else if (vm && vm.mathematicallyValid === false) box.classList.add('lws-blank-bad');
          else box.classList.add('lws-blank-open');   // tutor decides — stay neutral
        }
        // Only a 2xx carries tutor speech. On any non-2xx the body is an ERROR
        // envelope from utils/apiResponse.fail(), whose `message` is written for
        // a developer, not a student: /api/student-moves sits behind isStudent,
        // so a teacher/admin preview, an impersonated session or a demo clone
        // gets 403 "Forbidden: Students only." — which shipped into the ACT
        // bootcamp transcript as a tutor bubble (owner report, 2026-09-21).
        // A lapsed session (401) and a quota block (402/429) leak the same way.
        // The blank is already painted neutral above, so bailing here just means
        // the tutor says nothing — the right failure for an unreadable reply.
        if (!result || !result.ok) {
          if (window.console && console.warn) {
            console.warn('[workspace] student-move failed:', result && result.status);
          }
          return;
        }
        var resp = result.response;
        // `message` is deliberately NOT in this chain — it is the error channel.
        var text = resp && (resp.text || (resp.response && resp.response.text));
        if (text && typeof window.appendMessage === 'function') {
          window.appendMessage(text, 'ai');
        }
        // Full celebration, same as a typed turn: XP ladder, level-ups, coins,
        // quest events, badges (script.js applyTurnRewards — shared renderer).
        // AFTER appendMessage so the inline XP chip lands on the reaction bubble.
        if (resp && typeof window.mmApplyTurnRewards === 'function') {
          try { window.mmApplyTurnRewards(resp); } catch (err) { console.error('[LWS_CHAT] turn rewards failed', err); }
        }
      }).catch(function (err) { console.error('[LWS_CHAT] blank move failed', err); });
    } catch (err) { console.error('[LWS_CHAT] blank move failed', err); }
  });

  // A confirmed region selection: the crop goes to the tutor as a normal chat
  // photo turn (OCR, diagnose, the works) tagged with the source ref so the
  // posed problem links back to the worksheet (spec §5.3–5.4).
  function askAboutRegion(file, region, src) {
    if (typeof window.mmAskAboutRegion !== 'function') { console.error('[LWS_CHAT] mmAskAboutRegion unavailable'); return; }
    window.mmAskAboutRegion(
      file,
      "Here's a problem from my worksheet — can we work on this one?",
      { uploadId: src.uploadId, region: region }
    );
  }

  // Rebuild the board from a persisted conversation.boardLedger: each finished
  // problem replays and is sealed back into the transcript, the in-progress one
  // lands in the work dock. Replays run through the SAME adapter/render path as
  // live turns, so hydration can't drift from live behavior. hydrate(null) is a
  // plain reset (a conversation with no board history must show no work).
  function doHydrate(ledger) {
    try { dv.resetAll(); } catch (e) { console.error('[LWS_CHAT] hydrate reset failed', e); }
    clearSealed();
    if (!ledger || typeof window.LWS.ledgerToTurns !== 'function') return;
    var turns;
    try { turns = window.LWS.ledgerToTurns(ledger); }
    catch (e) { console.error('[LWS_CHAT] ledger replay failed', e); return; }
    // Hold the seals: the replay archives each finished problem BEFORE
    // ledgerMeta has zipped its assistance level and completedAt on, and both
    // decide how a sealed card reads and where it lands in the transcript.
    sealDeferred = [];
    try {
      turns.forEach(render);
      // Commands can't carry per-problem metadata (assistance level etc.) —
      // zip it onto the archive entries the replay just produced. The deferred
      // seals hold the SAME entry objects, so this annotates them in place.
      if (typeof window.LWS.ledgerMeta === 'function') {
        try { dv.annotateArchive(window.LWS.ledgerMeta(ledger)); }
        catch (e) { console.error('[LWS_CHAT] archive annotate failed', e); }
      }
    } finally {
      var held = sealDeferred;
      sealDeferred = null;              // before painting, so a seal can't re-queue
      held.forEach(sealToTranscript);
    }
    // The in-focus problem's source link survives the reload too.
    if (ledger.current && ledger.current.sourceRef) {
      try { dv.setProblemSource(ledger.current.sourceRef); }
      catch (e) { console.error('[LWS_CHAT] hydrate problem source failed', e); }
    }
  }

  api.hydrate = function (ledger) {
    if (!BOARD) return;             // no board → nothing to replay
    pending = null;                 // queued live turns belong to the old view
    if (!ready || !dv) { pendingLedger = ledger || null; return; }
    doHydrate(ledger);
  };

  function boot() {
    injectCss();
    loadNext(0, function () {
      if (!window.LWS) { console.error('[LWS_CHAT] workspace modules not available after load'); return; }
      var mount = null;
      if (BOARD) {
        if (!window.LWS.DerivationView) { console.error('[LWS_CHAT] DerivationView not available after load'); return; }
        mount = buildDock();
        dv = new window.LWS.DerivationView(mount, {
          renderers: makeRenderers(),
          onOpenSource: openLinkedSource,
          onSeal: onSeal,
        });
      }
      try { watchBoardUp(dv && dv.el && dv.el.root); } catch (e) { console.error('[LWS_CHAT] board-up watch failed', e); }
      // The derivation's A−/A+ text-size control pins itself to its own
      // top-right corner. In a full-height rail that read as board chrome; over
      // a short dock whose card is left-aligned it reads as an orphan floating
      // in the margin. The dock already has a bar for chrome — move it there.
      // Handlers are closures over the buttons, so re-parenting is safe.
      try {
        var bar = document.querySelector('#cr-work-dock .lws-dock-bar');
        var az = dv && dv.el && dv.el.root && dv.el.root.querySelector('.lws-dv-az');
        if (bar && az) bar.insertBefore(az, bar.querySelector('.lws-dock-toggle'));
      } catch (e) { console.error('[LWS_CHAT] text-size relocate failed', e); }

      var widgetHost = buildOverlayHost() || (dv && dv.el && dv.el.root) || mount;
      if (widgetHost && window.LWS.SourceDock) {
        try { dock = new window.LWS.SourceDock(widgetHost, {
          onAskRegion: askAboutRegion,
          // New uploads fly from the composer into the "My materials" tab.
          flyFrom: function () { return document.querySelector('.imessage-compose-bar') || document.getElementById('user-input'); },
        }); } catch (e) { console.error('[LWS_CHAT] dock mount failed', e); }
      }
      if (widgetHost && window.LWS.NotebookPanel) {
        try {
          var notebook = new window.LWS.NotebookPanel(widgetHost);
          api.captureToNotebook = function (text) {
            try { notebook.captureText(text); return true; }
            catch (e) { console.error('[LWS_CHAT] notebook capture failed', e); return false; }
          };
        } catch (e) { console.error('[LWS_CHAT] notebook mount failed', e); }
      }
      ready = true;
      if (pendingSources !== undefined) { var ps = pendingSources; pendingSources = undefined; api.setSourcesFromMessages(ps); }
      // Queued work replays in arrival order: hydrate() clears any turn queued
      // before it, so a `pending` that is still set alongside a pendingLedger
      // arrived AFTER the hydrate and renders on top of the rebuilt board.
      if (pendingLedger !== undefined) { var l = pendingLedger; pendingLedger = undefined; doHydrate(l); }
      if (pending) { var p = pending; pending = null; render(p); }
      console.log('[LWS_CHAT] mounted (' + (BOARD ? 'inline work dock' : 'notebook + sources only, board off') + ', mode=' + MODE + ')');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
