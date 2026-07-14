/* ============================================================
   chat-workspace.js — flag-gated integration of the Living
   Workspace INTO the live chat (spec milestone M-B: "new surface
   beside the old board, proven before swapping").

   Default = OFF: this file loads on chat.html but does NOTHING unless
   the LivingWorkspace flag is dev|beta|live. So the normal chat
   experience (old board) is untouched, and none of the ~10 workspace
   scripts are even fetched.

   When ON (window.MM_FEATURES.livingWorkspace or ?livingWorkspace=dev):
     1. lazily inject the workspace CSS + UMD-lite modules (KaTeX/
        MathLive are already on the chat page — reused, not re-loaded),
     2. mount the shell into a self-contained, dismissible dev panel
        (its own container — it never touches the old board's DOM, so
        it can't break the live layout),
     3. expose window.LWS_CHAT.applyBoardCommands(cmds): the chat SSE
        handler feeds each turn's board_commands here; the P5 adapter
        turns them into workspace elements that render on the surface.

   This is a preview harness in the real app, not the swap. Turning the
   old board off / making this the default is a later milestone.
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

  // Chat context for the student-move loop (P7). Chat refines it via
  // window.LWS_CHAT.setContext({ conversationId, workspaceId }).
  var ctx = { conversationId: null, workspaceId: 'chat' };

  // Public surface is always defined so callers don't need to feature-detect
  // twice; when off, applyBoardCommands is a no-op.
  var api = {
    isOn: function () { return ON; },
    applyBoardCommands: function () {},
    setContext: function (c) { if (c && typeof c === 'object') { if (c.conversationId != null) ctx.conversationId = c.conversationId; if (c.workspaceId != null) ctx.workspaceId = c.workspaceId; } },
  };
  window.LWS_CHAT = api;
  if (!ON) return;

  var BASE = '/js/living-workspace/';
  var SCRIPTS = [
    'core/flags.js', 'core/viewport.js', 'core/elementRegistry.js',
    'core/snapshotManager.js', 'core/a11yCommands.js',
    'dom/gridRenderer.js', 'dom/overlayManager.js', 'dom/equationElement.js',
    'dom/tileElement.js', 'dom/numberLineElement.js', 'dom/graphElement.js',
    'dom/noteElement.js', 'dom/studentMoveClient.js',
    'dom/interactionController.js', 'dom/shell.js', 'dom/legacyBoardAdapter.js',
  ];

  var shell = null;
  var ready = false;
  var pending = null;        // latest board_commands received before ready
  var turn = 0;

  function injectCss() {
    if (document.querySelector('link[data-lws]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/css/living-workspace.css'; link.dataset.lws = '1';
    document.head.appendChild(link);
  }

  // Sequential loader: each script executes before the next, so UMD-lite
  // deps (viewport before shell, etc.) resolve in order.
  function loadNext(i, done) {
    if (i >= SCRIPTS.length) return done();
    var s = document.createElement('script');
    s.src = BASE + SCRIPTS[i];
    s.async = false;
    s.onload = function () { loadNext(i + 1, done); };
    s.onerror = function () { console.error('[LWS_CHAT] failed to load', s.src); };
    document.body.appendChild(s);
  }

  // THE SWAP (M-C): take over the chat's board region in-layout. Hide the old
  // board's contents inside #cr-workspace and mount the new surface there, so
  // the workspace IS the board (not a floating preview). Reversible — flag off
  // leaves #cr-workspace untouched; the hidden nodes are still in the DOM.
  // Falls back to a floating panel when #cr-workspace is absent (dev harnesses,
  // other pages) so the integration still works anywhere.
  function buildPanel() {
    var region = document.getElementById('cr-workspace');
    if (region) {
      region.classList.add('lws-swapped');
      // Hide the old tabbed board tools, keep them in the DOM (reversible).
      for (var i = 0; i < region.children.length; i++) {
        region.children[i].setAttribute('data-lws-hidden', '1');
        region.children[i].style.display = 'none';
      }
      var mountIn = document.createElement('div');
      mountIn.id = 'lws-chat-mount';
      mountIn.style.cssText = 'position:absolute;inset:0;';
      if (getComputedStyle(region).position === 'static') region.style.position = 'relative';
      region.appendChild(mountIn);
      return mountIn;
    }

    // Fallback: floating dev panel.
    var panel = document.createElement('div');
    panel.id = 'lws-chat-panel';
    panel.setAttribute('aria-label', 'Living Workspace (preview)');
    panel.style.cssText = [
      'position:fixed', 'top:72px', 'right:16px', 'bottom:16px',
      'width:min(46vw,640px)', 'z-index:2200',
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

  // Surface the tutor's reaction to a student move. Prefer the chat's own
  // message renderer; fall back to a DOM event chat can listen for.
  function surfaceReaction(text) {
    try {
      if (typeof window.appendMessage === 'function') { window.appendMessage('assistant', text); return; }
    } catch (_) { /* fall through */ }
    try { window.dispatchEvent(new CustomEvent('lws:tutor-reaction', { detail: { text: text } })); } catch (_) {}
  }

  function makeShell() {
    return new window.LWS.Shell({
      world: { width: 2400, height: 1600 },
      registerRenderers: function (overlayMgr, sh) {
        overlayMgr.registerRenderer('equation', window.LWS.EquationElement.makeRenderer({
          onEditCommit: function (id, latex) { sh.updateElement(id, { semantic: { latex: latex, plain: latex } }); },
        }));
        // Algebra tiles: local gesture → P7 close-the-loop (optimistic
        // provisional → /api/student-moves verdict → commit/snap-back →
        // tutor reaction). csrfFetch carries the CSRF token in chat.
        // Graph (P14). Completes the P5 adapter's `graph` board-command path:
        // the tutor's already-gate-approved graph now renders on the surface,
        // with a draggable tracer. (The visual-gate vertex/y-int extension is
        // the server-side safety that makes exposing the graph safe.)
        if (window.LWS.GraphElement) {
          overlayMgr.registerRenderer('graph', window.LWS.GraphElement.makeRenderer({
            onChange: function () { /* tracer exploration — mode:'exploration', no answer injection */ },
          }));
        }
        // Image (P15) + geometry (P17) don't have real renderers yet. Until
        // they land, a titled NOTE CARD shows what the tutor asked for (the
        // gate-approved image query / figure label) instead of vanishing or
        // showing a bare "[image]". Same renderer, registered for both types.
        if (window.LWS.NoteElement) {
          var noteRenderer = window.LWS.NoteElement.makeRenderer();
          overlayMgr.registerRenderer('image', noteRenderer);
          overlayMgr.registerRenderer('geometry', noteRenderer);
        }
        // Number line (P13). A marker drag emits onChange; wiring it through
        // the student-move loop mirrors tiles and is a small follow-up.
        if (window.LWS.NumberLineElement) {
          overlayMgr.registerRenderer('number_line', window.LWS.NumberLineElement.makeRenderer({
            onChange: function () { /* TODO: send as a StudentMove (same loop as tiles) */ },
          }));
        }
        overlayMgr.registerRenderer('algebra_tiles', window.LWS.TileElement.makeRenderer({
          onOperation: function (op) {
            var el = sh.registry.get('tiles-1') || sh.registry.list().find(function (e) { return e.type === 'algebra_tiles'; });
            if (!el) return;
            window.LWS.StudentMoveClient.runTileMove({
              shell: sh, element: el, operation: op, source: 'gesture',
              ctx: ctx, fetch: (typeof window.csrfFetch === 'function' ? window.csrfFetch : undefined),
              onReaction: function (txt) { surfaceReaction(txt); },
            });
          },
        }));
      },
    });
  }

  // Render one turn's board_commands onto the surface via the P5 adapter.
  function render(cmds) {
    if (!ready || !shell) { pending = cmds; return; }
    var out;
    try { out = window.LWS.adaptBoardCommands(cmds, { idPrefix: 'lgc' + (++turn) }); }
    catch (e) { console.error('[LWS_CHAT] adapt failed', e); return; }
    try {
      if (out.clear) {
        shell.registry.list().slice().forEach(function (el) {
          try { shell.removeElement(el.id); } catch (_) {}
        });
      }
      out.elements.forEach(function (el) { try { shell.addElement(el); } catch (_) {} });
    } catch (e) { console.error('[LWS_CHAT] render failed', e); }
  }

  api.applyBoardCommands = function (cmds) {
    if (!Array.isArray(cmds) || cmds.length === 0) return;
    render(cmds);
  };

  // Friendly empty state so a fresh canvas doesn't read as blank/broken —
  // mirrors the legacy board's "Ready to work it out?" hint. Non-interactive
  // (pointer-events:none) so it never blocks panning; auto-hides the moment
  // the first element lands and returns if the board is cleared.
  function wireEmptyState(mount) {
    if (!shell || !shell.registry) return;
    var hint = document.createElement('div');
    hint.className = 'lws-empty-state';
    hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML =
      '<div class="lws-empty-icon">✍️</div>' +
      '<div class="lws-empty-title">Ready to work it out?</div>' +
      '<div class="lws-empty-sub">Your steps, graphs, and tiles show up here as you and your tutor build them together.</div>';
    mount.appendChild(hint);
    function refresh() {
      var count = shell.registry.list ? shell.registry.list().length : 0;
      hint.style.display = count === 0 ? '' : 'none';
    }
    try { shell.registry.subscribe(refresh); } catch (_) { /* no subscribe → static hint */ }
    refresh();
  }

  function boot() {
    injectCss();
    loadNext(0, function () {
      if (!window.LWS || !window.LWS.Shell) { console.error('[LWS_CHAT] LWS not available after load'); return; }
      var mount = buildPanel();
      shell = makeShell();
      shell.mount(mount);
      ready = true;
      wireEmptyState(mount);
      if (pending) { var p = pending; pending = null; render(p); }
      console.log('[LWS_CHAT] mounted (mode=' + MODE + ')');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
