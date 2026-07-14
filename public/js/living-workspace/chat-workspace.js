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
    'dom/noteElement.js', 'dom/imageElement.js', 'dom/studentMoveClient.js',
    'dom/interactionController.js', 'dom/shell.js', 'dom/legacyBoardAdapter.js',
    'dom/derivationView.js',
  ];

  // Build brick #1: the chat board renders as a FOCUSED DERIVATION
  // (dom/derivationView.js), not free-floating canvas cards. `dv` is that view.
  var dv = null;
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
    if (!Array.isArray(cmds) || cmds.length === 0) return;
    render(cmds);
  };

  function boot() {
    injectCss();
    loadNext(0, function () {
      if (!window.LWS || !window.LWS.DerivationView) { console.error('[LWS_CHAT] DerivationView not available after load'); return; }
      var mount = buildPanel();
      dv = new window.LWS.DerivationView(mount, { renderers: makeRenderers() });
      ready = true;
      if (pending) { var p = pending; pending = null; render(p); }
      console.log('[LWS_CHAT] mounted (derivation, mode=' + MODE + ')');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
